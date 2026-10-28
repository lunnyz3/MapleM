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

const DB_TIMEOUT_MS = 3000;
const PAGE_SIZE = 20;
const MAX_PAGE = 500;
const groupTotalCache = new TtlLruCache({ maxEntries: 2000, maxBytes: 1024 * 1024 });
const GROUP_TOTAL_TTL_MS = 10 * 60 * 1000;

// Armor slots of the ranked families; every other ranked slot is a weapon type.
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
 * this response are removed, so sold or replaced items leave the ranking.
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
  await EquipmentItem.bulkWrite(
    collected.items.map((entry) => ({
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
  await EquipmentItem.deleteMany({ ocid: key, fingerprint: { $nin: collected.items.map((entry) => entry.fingerprint) } });

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
  await CharacterSpec.updateOne({ ocid: key }, { $set: spec }, { upsert: true });
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
    .select({ fingerprint: 1, slot: 1, family: 1, label: 1, score: 1, scoreWithoutEmblem: 1, _id: 0 })
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
          scoreWithoutEmblem: item.scoreWithoutEmblem
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

/** Slots with item counts, then the families of `slot` with counts (most owned first). */
async function listItemGroups({ slot, worldName } = {}) {
  if (!isMongoConnected()) return { slots: [], families: [] };
  // Rows scored by an older rule are left out until they are collected again.
  const match = { family: { $ne: "" }, scoreVersion: SCORE_VERSION };
  if (worldName) match.worldName = worldName;
  const [slots, families] = await Promise.all([
    EquipmentItem.aggregate([{ $match: match }, { $group: { _id: "$slot", count: { $sum: 1 } } }, { $sort: { count: -1 } }]).option({ maxTimeMS: DB_TIMEOUT_MS }),
    slot
      ? EquipmentItem.aggregate([
          { $match: { ...match, slot } },
          { $group: { _id: "$family", count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]).option({ maxTimeMS: DB_TIMEOUT_MS })
      : []
  ]);
  return {
    slots: slots.map((entry) => ({ slot: entry._id, count: entry.count, weapon: !ARMOR_SLOTS.has(entry._id) })),
    families: families.map((entry) => ({ family: entry._id, count: entry.count }))
  };
}

/** One page of the item ranking. `sort` is "score" (문장 포함) or "scoreWithoutEmblem". Only ranked families. */
async function listItemRanking({ slot, family, worldName, sort = "score", page = 1 } = {}) {
  const field = sort === "scoreWithoutEmblem" ? "scoreWithoutEmblem" : "score";
  const current = pageOf(page);
  if (!slot || !isMongoConnected()) return { rows: [], total: 0, page: current, pageSize: PAGE_SIZE, sort: field };
  const filter = { slot, family: family || { $ne: "" }, scoreVersion: SCORE_VERSION };
  if (worldName) filter.worldName = worldName;
  const [rows, total] = await Promise.all([
    EquipmentItem.find(filter)
      .sort({ [field]: -1, checkedAt: -1 })
      .skip((current - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .select({ ocid: 0, _id: 0, fingerprint: 0 })
      .maxTimeMS(DB_TIMEOUT_MS)
      .lean(),
    EquipmentItem.countDocuments(filter).maxTimeMS(DB_TIMEOUT_MS)
  ]);
  return {
    rows: rows.map((row, index) => ({ rank: (current - 1) * PAGE_SIZE + index + 1, ...row })),
    total,
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
      .sort({ [definition.field]: -1, checkedAt: -1 })
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

module.exports = {
  recordCharacterItems,
  rankCharacterItems,
  listItemGroups,
  listItemRanking,
  listSpecRanking,
  SPEC_METRICS
};
