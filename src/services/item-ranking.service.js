// Item ranking and spec ranking built from characters seen on the site and the daily
// combat-power ranking collection. 아케인셰이드·앱솔랩스 items are ranked inside their group
// (family + weapon type or armor slot, e.g. "아케인셰이드 완드"); characters by spec metrics. Everything needs MongoDB; without it
// writes are skipped and reads come back empty.
const mongoose = require("mongoose");
const { EquipmentItem } = require("../models/equipment-item.model");
const { CharacterSpec } = require("../models/character-spec.model");
const { collectCharacterItems } = require("../domain/items/collect");
const { SCORE_VERSION } = require("../domain/items/score");
const { TtlLruCache } = require("../nexon/client");
const { recordSnapshot } = require("./character-record.service");

const DB_TIMEOUT_MS = 3000;
const CONDITION_TIMEOUT_MS = 10000;
const CONDITION_COUNT_LIMIT = 5000;
const PAGE_SIZE = 20;
const MAX_PAGE = 500;
const groupTotalCache = new TtlLruCache({ maxEntries: 2000, maxBytes: 1024 * 1024 });
const GROUP_TOTAL_TTL_MS = 10 * 60 * 1000;

// Armor slots of the ranked families (제네시스 is weapons only); every other ranked slot is a weapon type.
const ARMOR_SLOTS = new Set(["모자", "상의", "하의", "한벌옷", "어깨", "장갑", "신발", "망토"]);

const SPEC_METRICS = Object.freeze({
  itemScore: { field: "itemScore", label: "템환산" },
  itemScoreWithoutEmblem: { field: "itemScoreWithoutEmblem", label: "템환산 (문장 제외)" },
  potential: { field: "potential", label: "잠재" },
  additionalPotential: { field: "additionalPotential", label: "에디" },
  maxDamage: { field: "maxDamage", label: "최대 대미지" },
  combatPower: { field: "combatPower", label: "전투력" },
  level: { field: "characterLevel", label: "레벨" }
});

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Stores a character's items (worn + presets) and spec summary. Items of that character not in
 * this response are removed, so sold or replaced items leave the ranking. Bulk collection
 * (`rankedOnly`) keeps only ranked-family items to bound the database; site lookups keep all
 * items (the compare page scores every slot).
 * Returns the collected result, or null when nothing was stored.
 */
async function recordCharacterItems({
  ocid,
  characterName,
  worldName,
  characterClass,
  characterLevel,
  itemData,
  combatPower = null,
  maxDamage = null,
  source = "lookup",
  rankedOnly = false,
  now = new Date()
}) {
  const key = String(ocid || "").trim();
  if (!key || !itemData || !isMongoConnected()) return null;
  const collected = await collectCharacterItems(itemData);
  if (!collected.items.length) return null;

  const owner = {
    characterName: String(characterName || "").trim(),
    worldName: String(worldName || "").trim(),
    characterClass: String(characterClass || itemData.character_class || "").trim(),
    characterLevel: Number(characterLevel) || 0,
    attackType: collected.attackType
  };
  const stored = rankedOnly ? collected.items.filter((entry) => entry.family) : collected.items;
  if (stored.length) {
    await EquipmentItem.bulkWrite(
      stored.map((entry) => ({
        updateOne: {
          filter: { ocid: key, fingerprint: entry.fingerprint },
          update: {
            $set: {
              ...owner,
              slot: entry.slot,
              family: entry.family,
              label: entry.label,
              itemName: String(entry.item?.item_name || ""),
              starforce: Number(entry.item?.starforce_upgrade) || 0,
              score: entry.score,
              scoreWithoutEmblem: entry.scoreWithoutEmblem,
              parts: entry.parts,
              scoreVersion: SCORE_VERSION,
              item: entry.item,
              source,
              checkedAt: now
            }
          },
          upsert: true
        }
      })),
      { ordered: false }
    );
  }
  await EquipmentItem.deleteMany({ ocid: key, fingerprint: { $nin: stored.map((entry) => entry.fingerprint) } });

  const best = collected.best || {};
  const spec = {
    ...owner,
    presetNo: best.no ?? null,
    itemScore: best.score || 0,
    itemScoreWithoutEmblem: best.scoreWithoutEmblem || 0,
    potential: best.potential || 0,
    additionalPotential: best.additionalPotential || 0,
    scoreVersion: SCORE_VERSION,
    source,
    checkedAt: now
  };
  // Unknown values keep what an earlier lookup stored.
  if (finiteOrNull(combatPower)) spec.combatPower = finiteOrNull(combatPower);
  if (finiteOrNull(maxDamage)) spec.maxDamage = finiteOrNull(maxDamage);
  const before = await CharacterSpec.findOneAndUpdate({ ocid: key }, { $set: spec }, { upsert: true, returnDocument: "before", projection: { characterName: 1, characterClass: 1, worldName: 1 } }).lean();
  const changes = [];
  if (before) {
    [["characterName", "name"], ["characterClass", "class"], ["worldName", "world"]].forEach(([field, label]) => {
      if (before[field] && spec[field] && before[field] !== spec[field]) changes.push({ field: label, from: before[field], to: spec[field], at: now });
    });
  }
  if (changes.length) {
    await CharacterSpec.updateOne({ ocid: key }, { $push: { history: { $each: changes, $slice: -50 } } });
  }
  // Best-effort: the items and spec above are already stored.
  await recordSnapshot({
    ocid: key,
    worldName: owner.worldName,
    characterName: owner.characterName,
    snapshot: {
      scoreVersion: SCORE_VERSION,
      combatPower: spec.combatPower,
      itemScore: spec.itemScore,
      itemScoreWithoutEmblem: spec.itemScoreWithoutEmblem,
      potential: spec.potential,
      additionalPotential: spec.additionalPotential,
      maxDamage: spec.maxDamage,
      level: owner.characterLevel,
      gear: best.gear || []
    },
    now
  }).catch((error) => console.error("[character-record] save failed:", error?.message || error));
  return collected;
}

async function groupTotal(slot, family) {
  const cacheKey = `${slot}\u0000${family}`;
  const cached = groupTotalCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const total = await EquipmentItem.countDocuments({ slot, family, scoreVersion: SCORE_VERSION }).maxTimeMS(DB_TIMEOUT_MS);
  groupTotalCache.set(cacheKey, total, GROUP_TOTAL_TTL_MS, 64);
  return total;
}

/**
 * Ranks of one character's stored items inside their group:
 * { [fingerprint]: { rank, total, label, score, scoreWithoutEmblem } }.
 */
async function rankCharacterItems(ocid) {
  const key = String(ocid || "").trim();
  if (!key || !isMongoConnected()) return {};
  const items = await EquipmentItem.find({ ocid: key, family: { $ne: "" }, scoreVersion: SCORE_VERSION })
    .select({ fingerprint: 1, slot: 1, family: 1, label: 1, score: 1, scoreWithoutEmblem: 1, parts: 1, _id: 0 })
    .maxTimeMS(DB_TIMEOUT_MS)
    .lean();
  const entries = await Promise.all(
    items.map(async (item) => {
      const [above, total] = await Promise.all([
        EquipmentItem.countDocuments({ slot: item.slot, family: item.family, scoreVersion: SCORE_VERSION, score: { $gt: item.score } }).maxTimeMS(DB_TIMEOUT_MS),
        groupTotal(item.slot, item.family)
      ]);
      return [
        item.fingerprint,
        {
          rank: above + 1,
          total: Math.max(total, above + 1),
          label: item.label,
          score: item.score,
          scoreWithoutEmblem: item.scoreWithoutEmblem,
          parts: item.parts || null
        }
      ];
    })
  );
  return Object.fromEntries(entries);
}

function pageOf(value) {
  const page = Math.floor(Number(value) || 1);
  return Math.min(MAX_PAGE, Math.max(1, page));
}

const GROUPS_TTL_MS = 5 * 60 * 1000;
const GROUPS_TIMEOUT_MS = 30000;
const groupsCache = new TtlLruCache({ maxEntries: 500, maxBytes: 4 * 1024 * 1024 });

/**
 * Slots with item counts, then the families of `slot` with counts (most owned first). Counting
 * a few million rows takes seconds, so results are kept for five minutes.
 */
async function listItemGroups({ slot, worldName } = {}) {
  if (!isMongoConnected()) return { slots: [], families: [] };
  const cacheKey = `${slot || ""}\u0000${worldName || ""}`;
  const cached = groupsCache.get(cacheKey);
  if (cached) return cached;
  const result = await countItemGroups({ slot, worldName });
  groupsCache.set(cacheKey, result, GROUPS_TTL_MS, 4096);
  return result;
}

async function countItemGroups({ slot, worldName }) {
  // Rows scored by an older rule are left out until they are collected again.
  const match = { family: { $ne: "" }, scoreVersion: SCORE_VERSION };
  if (worldName) match.worldName = worldName;
  const [slots, families] = await Promise.all([
    EquipmentItem.aggregate([{ $match: match }, { $group: { _id: "$slot", count: { $sum: 1 } } }, { $sort: { count: -1 } }]).option({ maxTimeMS: GROUPS_TIMEOUT_MS }),
    slot
      ? EquipmentItem.aggregate([
          { $match: { ...match, slot } },
          { $group: { _id: "$family", count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]).option({ maxTimeMS: GROUPS_TIMEOUT_MS })
      : []
  ]);
  return {
    slots: slots.map((entry) => ({ slot: entry._id, count: entry.count, weapon: !ARMOR_SLOTS.has(entry._id) })),
    families: families.map((entry) => ({ family: entry._id, count: entry.count }))
  };
}

/** One page of the item ranking. `sort` is "score" (문장 포함) or "scoreWithoutEmblem". Only ranked families. */
// 조건 검색에 쓰는 옵션 묶음 → 넥슨 응답 필드, 고를 수 있는 옵션 이름
const CONDITION_SECTIONS = Object.freeze({
  potential: "item_potential_option",
  additionalPotential: "item_additional_potential_option",
  additional: "item_additional_option"
});
const CONDITION_OPTIONS = Object.freeze(["보스 공격력", "물리 대미지", "마법 대미지", "최종 대미지", "방어율 무시", "치명타 피해", "물리 공격력", "마법 공격력", "최대 대미지"]);

/**
 * 조건(스타포스 이상, 잠재·에디·추옵에 그 옵션이 몇 줄 이상)을 Mongo 조건으로. 쓸 수 없는 값은 버린다.
 * @param {{ minStar?: number, section?: string, option?: string, lines?: number }} condition
 */
function conditionFilter({ minStar, section, option, lines } = {}) {
  const filter = {};
  const star = Math.floor(Number(minStar));
  if (star > 0 && star <= 40) filter.starforce = { $gte: star };
  const field = CONDITION_SECTIONS[section];
  const count = Math.max(1, Math.min(3, Math.floor(Number(lines)) || 1));
  if (field && CONDITION_OPTIONS.includes(option)) {
    filter.$expr = {
      $gte: [{ $size: { $filter: { input: { $ifNull: [`$item.${field}`, []] }, cond: { $eq: ["$$this.option_name", option] } } } }, count]
    };
  }
  return filter;
}

async function listItemRanking({ slot, family, worldName, sort = "score", page = 1, condition = {} } = {}) {
  const field = sort === "scoreWithoutEmblem" ? "scoreWithoutEmblem" : "score";
  const current = pageOf(page);
  if (!slot || !isMongoConnected()) return { rows: [], total: 0, page: current, pageSize: PAGE_SIZE, sort: field };
  const conditions = conditionFilter(condition);
  const filter = { slot, family: family || { $ne: "" }, scoreVersion: SCORE_VERSION, ...conditions };
  if (worldName) filter.worldName = worldName;
  // 조건은 색인을 못 써서 묶음을 훑는다: 시간을 더 주고 개수는 상한까지만 센다.
  const filtered = Object.keys(conditions).length > 0;
  const timeout = filtered ? CONDITION_TIMEOUT_MS : DB_TIMEOUT_MS;
  const [rows, total] = await Promise.all([
    // 점수만으로 정렬해야 색인 순서를 그대로 쓴다(동점 정렬을 더하면 묶음 전체를 읽어 메모리에서 정렬한다).
    EquipmentItem.find(filter)
      .sort({ [field]: -1 })
      .skip((current - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .select({ ocid: 0, _id: 0, fingerprint: 0 })
      .maxTimeMS(timeout)
      .lean(),
    EquipmentItem.countDocuments(filter, filtered ? { limit: CONDITION_COUNT_LIMIT } : {}).maxTimeMS(timeout)
  ]);
  return {
    rows: rows.map((row, index) => ({ rank: (current - 1) * PAGE_SIZE + index + 1, ...row })),
    total,
    totalCapped: filtered && total >= CONDITION_COUNT_LIMIT,
    page: current,
    pageSize: PAGE_SIZE,
    sort: field
  };
}

/** One page of the spec ranking for `metric` (see SPEC_METRICS). */
async function listSpecRanking({ metric = "itemScore", worldName, characterClass, page = 1 } = {}) {
  const definition = SPEC_METRICS[metric] || SPEC_METRICS.itemScore;
  const current = pageOf(page);
  if (!isMongoConnected()) return { rows: [], total: 0, page: current, pageSize: PAGE_SIZE, metric };
  const filter = { [definition.field]: { $ne: null, $gt: 0 }, scoreVersion: SCORE_VERSION };
  if (worldName) filter.worldName = worldName;
  if (characterClass) filter.characterClass = characterClass;
  const [rows, total] = await Promise.all([
    CharacterSpec.find(filter)
      .sort({ [definition.field]: -1 })
      .skip((current - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .select({ ocid: 0, _id: 0 })
      .maxTimeMS(DB_TIMEOUT_MS)
      .lean(),
    CharacterSpec.countDocuments(filter).maxTimeMS(DB_TIMEOUT_MS)
  ]);
  return {
    rows: rows.map((row, index) => ({ rank: (current - 1) * PAGE_SIZE + index + 1, ...row })),
    total,
    page: current,
    pageSize: PAGE_SIZE,
    metric: Object.keys(SPEC_METRICS).find((key) => SPEC_METRICS[key] === definition)
  };
}

/**
 * Stored specs of the given characters of one world (guild member ranking). Characters never
 * collected are left out.
 */
async function findSpecs(worldName, names) {
  if (!isMongoConnected() || !worldName || !names.length) return [];
  return CharacterSpec.find({ worldName, characterName: { $in: names } })
    .select({ _id: 0, ocid: 0, source: 0 })
    .maxTimeMS(DB_TIMEOUT_MS)
    .lean();
}

const SUMMARY_METRICS = ["itemScore", "potential", "additionalPotential", "combatPower"];
const specTotalCache = new TtlLruCache({ maxEntries: 50, maxBytes: 64 * 1024 });

/**
 * One character's stored spec with its place among every collected character:
 * { spec, ranks: { itemScore: { rank, total }, … } } or null.
 */
async function rankSpec(worldName, characterName) {
  if (!isMongoConnected()) return null;
  const spec = await CharacterSpec.findOne({ worldName, characterName, scoreVersion: SCORE_VERSION })
    .select({ _id: 0, ocid: 0, source: 0 })
    .maxTimeMS(DB_TIMEOUT_MS)
    .lean();
  if (!spec) return null;
  const ranks = {};
  await Promise.all(
    SUMMARY_METRICS.map(async (field) => {
      const value = Number(spec[field]);
      if (!(value > 0)) return;
      let total = specTotalCache.get(field);
      if (total === undefined) {
        total = await CharacterSpec.countDocuments({ [field]: { $gt: 0 }, scoreVersion: SCORE_VERSION }).maxTimeMS(DB_TIMEOUT_MS);
        specTotalCache.set(field, total, GROUP_TOTAL_TTL_MS, 32);
      }
      const above = await CharacterSpec.countDocuments({ [field]: { $gt: value }, scoreVersion: SCORE_VERSION }).maxTimeMS(DB_TIMEOUT_MS);
      ranks[field] = { rank: above + 1, total: Math.max(total, above + 1) };
    })
  );
  return { spec, ranks };
}

const summaryCache = new TtlLruCache({ maxEntries: 2, maxBytes: 4 * 1024 });

/** 모은 캐릭터 수(지금 점수 규칙으로 저장된 스펙). 10분 기억. */
async function collectionSummary() {
  if (!isMongoConnected()) return { characters: 0 };
  const cached = summaryCache.get("summary");
  if (cached !== undefined) return cached;
  const characters = await CharacterSpec.countDocuments({ scoreVersion: SCORE_VERSION }).maxTimeMS(DB_TIMEOUT_MS);
  const summary = { characters };
  summaryCache.set("summary", summary, GROUP_TOTAL_TTL_MS, 64);
  return summary;
}

module.exports = {
  conditionFilter,
  CONDITION_OPTIONS,
  collectionSummary,
  rankSpec,
  findSpecs,
  recordCharacterItems,
  rankCharacterItems,
  listItemGroups,
  listItemRanking,
  listSpecRanking,
  SPEC_METRICS
};
