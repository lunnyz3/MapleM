// Statistics over the collected characters (character_specs): class breakdown of the combat-power
// top N, and the level distribution. Aggregations over ~150k rows take a moment, so results are
// kept for ten minutes.
const mongoose = require("mongoose");
const { CharacterSpec } = require("../models/character-spec.model");
const { EquipmentItem } = require("../models/equipment-item.model");
const { jobMeta: buildJobMeta, jobTopCompare } = require("../domain/stats/job-meta");
const { hallOfFame: buildHallOfFame, ACCESSORY_SLOTS } = require("../domain/stats/hall-of-fame");
const { fairCharacters, gearWindow, peerMedians, sampleOf } = require("../domain/stats/game-pool");
const { SCORE_VERSION } = require("../domain/items/score");
const { TtlLruCache } = require("../nexon/client");

const CACHE_TTL_MS = 10 * 60 * 1000;
const META_TTL_MS = 60 * 60 * 1000;
const META_TOP = 100;
const TIMEOUT_MS = 30000;
const TOP_CHOICES = Object.freeze([100, 300, 500, 1000, 3000, 5000, 0]);
const cache = new TtlLruCache({ maxEntries: 200, maxBytes: 16 * 1024 * 1024 });

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

async function cached(key, compute, ttl = CACHE_TTL_MS, bytes = 16 * 1024) {
  const hit = cache.get(key);
  if (hit) return hit;
  const value = await compute();
  cache.set(key, value, ttl, bytes);
  return value;
}

function round(value, digits = 1) {
  const scale = 10 ** digits;
  return Number.isFinite(value) ? Math.round(value * scale) / scale : null;
}

/**
 * Class breakdown of the combat-power top `top` (0 = everyone with a combat power).
 * → { top, total, classes: [{ className, count, share, avgCombatPower, maxCombatPower, avgItemScore, avgPotential, avgAdditionalPotential, avgLevel }] }
 */
async function classStats({ worldName = "", top = 1000 } = {}) {
  const limit = TOP_CHOICES.includes(Number(top)) ? Number(top) : 1000;
  if (!isMongoConnected()) return { top: limit, total: 0, classes: [] };
  return cached(`classes|${worldName}|${limit}`, async () => {
    const match = { scoreVersion: SCORE_VERSION, combatPower: { $gt: 0 } };
    if (worldName) match.worldName = worldName;
    const pipeline = [{ $match: match }, { $sort: { combatPower: -1 } }];
    if (limit) pipeline.push({ $limit: limit });
    pipeline.push({
      $group: {
        _id: "$characterClass",
        count: { $sum: 1 },
        avgCombatPower: { $avg: "$combatPower" },
        maxCombatPower: { $max: "$combatPower" },
        avgItemScore: { $avg: "$itemScore" },
        avgPotential: { $avg: "$potential" },
        avgAdditionalPotential: { $avg: "$additionalPotential" },
        avgLevel: { $avg: "$characterLevel" }
      }
    });
    const rows = await CharacterSpec.aggregate(pipeline).option({ maxTimeMS: TIMEOUT_MS, allowDiskUse: true });
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const classes = rows
      .filter((row) => row._id)
      .map((row) => ({
        className: row._id,
        count: row.count,
        share: total ? round((row.count / total) * 100, 2) : 0,
        avgCombatPower: Math.round(row.avgCombatPower || 0),
        maxCombatPower: row.maxCombatPower || 0,
        avgItemScore: round(row.avgItemScore),
        avgPotential: round(row.avgPotential),
        avgAdditionalPotential: round(row.avgAdditionalPotential),
        avgLevel: round(row.avgLevel)
      }))
      .sort((a, b) => b.count - a.count || b.avgCombatPower - a.avgCombatPower);
    return { top: limit, total, classes };
  });
}

/**
 * Level distribution from `minLevel` up and the class split of those characters.
 * → { minLevel, total, levels: [{ level, count }], classes: [{ className, count, share }] }
 */
async function levelStats({ worldName = "", minLevel = 260 } = {}) {
  const floor = Math.min(300, Math.max(200, Math.floor(Number(minLevel) || 260)));
  if (!isMongoConnected()) return { minLevel: floor, total: 0, levels: [], classes: [] };
  return cached(`levels|${worldName}|${floor}`, async () => {
    const match = { scoreVersion: SCORE_VERSION, characterLevel: { $gte: floor } };
    if (worldName) match.worldName = worldName;
    const [levels, classes] = await Promise.all([
      CharacterSpec.aggregate([{ $match: match }, { $group: { _id: "$characterLevel", count: { $sum: 1 } } }, { $sort: { _id: -1 } }]).option({ maxTimeMS: TIMEOUT_MS }),
      CharacterSpec.aggregate([{ $match: match }, { $group: { _id: "$characterClass", count: { $sum: 1 } } }, { $sort: { count: -1 } }]).option({ maxTimeMS: TIMEOUT_MS })
    ]);
    const total = levels.reduce((sum, row) => sum + row.count, 0);
    return {
      minLevel: floor,
      total,
      levels: levels.map((row) => ({ level: row._id, count: row.count })),
      classes: classes.filter((row) => row._id).map((row) => ({ className: row._id, count: row.count, share: total ? round((row.count / total) * 100, 2) : 0 }))
    };
  });
}

/** Combat-power top 100 of every class in one pass: Map-like [{ className, count, top: [{ ocid, … }] }]. */
async function topByClass(worldName) {
  return cached(
    `meta-top|${worldName}`,
    async () => {
      const match = { scoreVersion: SCORE_VERSION, combatPower: { $gt: 0 }, characterClass: { $ne: "" } };
      if (worldName) match.worldName = worldName;
      const rows = await CharacterSpec.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$characterClass",
            count: { $sum: 1 },
            top: {
              $topN: {
                n: META_TOP,
                sortBy: { combatPower: -1 },
                output: {
                  ocid: "$ocid",
                  characterName: "$characterName",
                  worldName: "$worldName",
                  attackType: "$attackType",
                  combatPower: "$combatPower",
                  itemScore: "$itemScore",
                  characterLevel: "$characterLevel"
                }
              }
            }
          }
        }
      ]).option({ maxTimeMS: TIMEOUT_MS, allowDiskUse: true });
      return rows.filter((row) => row._id).map((row) => ({ className: row._id, count: row.count, top: row.top }));
    },
    META_TTL_MS,
    1024 * 1024
  );
}

const META_FIELDS = {
  _id: 0,
  ocid: 1,
  slot: 1,
  itemName: 1,
  score: 1,
  starforce: 1,
  "parts.additional": 1,
  "item.item_name": 1,
  "item.item_grade": 1,
  "item.item_equipment_slot_name": 1,
  "item.item_potential_option": 1,
  "item.item_additional_potential_option": 1,
  "item.item_additional_option": 1,
  "item.soul_info": 1,
  "item.emblem_info": 1
};

/**
 * What the combat-power top 100 of one class wear (src/domain/stats/job-meta.js).
 * → { className, classes: [{ className, count }], ...meta } (className "" = the most common class)
 */
async function jobMeta({ worldName = "", className = "" } = {}) {
  if (!isMongoConnected()) return { className: "", classes: [], count: 0 };
  const groups = await topByClass(worldName);
  const classes = groups.map((group) => ({ className: group.className, count: group.count })).sort((a, b) => a.className.localeCompare(b.className, "ko"));
  const group = groups.find((entry) => entry.className === className) || [...groups].sort((a, b) => b.count - a.count)[0];
  if (!group) return { className: "", classes, count: 0 };
  const meta = await cached(
    `meta|${worldName}|${group.className}`,
    async () => {
      const ocids = group.top.map((entry) => entry.ocid);
      const docs = await EquipmentItem.find({ ocid: { $in: ocids }, scoreVersion: SCORE_VERSION }, META_FIELDS).lean().maxTimeMS(TIMEOUT_MS);
      const byOcid = new Map(ocids.map((ocid) => [ocid, []]));
      for (const doc of docs) byOcid.get(doc.ocid)?.push(doc);
      return buildJobMeta(group.top.map((spec) => ({ spec, items: byOcid.get(spec.ocid) || [] })));
    },
    META_TTL_MS,
    160 * 1024
  );
  return { className: group.className, classes, ...meta };
}

const COMPARE_TOP = 10;
const COMPARE_FIELDS = { _id: 0, ocid: 1, slot: 1, itemName: 1, score: 1, starforce: 1, "item.item_equipment_slot_name": 1, "item.item_icon": 1 };

/**
 * 직업 1위·상위 10명 평균과 내 메인 세팅의 칸별 템환산. 상위 캐릭터 쪽은 1시간 캐시, 내 장비는 매번 읽는다.
 * → { className, me, leader, average } (그 직업을 모르면 leader·average 가 null)
 */
async function jobTop({ className = "", ocid = "" } = {}) {
  if (!isMongoConnected()) return { className, me: null, leader: null, average: null };
  const groups = await topByClass("");
  const group = groups.find((entry) => entry.className === className);
  const mine = ocid ? await EquipmentItem.find({ ocid, scoreVersion: SCORE_VERSION }, COMPARE_FIELDS).lean().maxTimeMS(TIMEOUT_MS) : [];
  if (!group) return { className, ...jobTopCompare({ top: [], docs: [], mine }) };
  const top = group.top.slice(0, COMPARE_TOP);
  const docs = await cached(
    `jobtop|${group.className}`,
    () =>
      EquipmentItem.find({ ocid: { $in: top.map((entry) => entry.ocid) }, scoreVersion: SCORE_VERSION }, COMPARE_FIELDS)
        .lean()
        .maxTimeMS(TIMEOUT_MS),
    META_TTL_MS,
    256 * 1024
  );
  return { className: group.className, ...jobTopCompare({ top, docs, mine }) };
}

// ---------------- 명예의 전당 ----------------

const HALL_TTL_MS = 6 * 60 * 60 * 1000;
const HALL_TIMEOUT_MS = 60000;
const RECORD_FAMILIES = ["제네시스", "아케인셰이드"];
// 무기가 아닌 slot 값(그 밖의 slot 값은 무기 종류)
const NON_WEAPON = ["모자", "상의", "하의", "한벌옷", "어깨", "장갑", "신발", "망토", ...ACCESSORY_SLOTS, "보조무기", "훈장", "칭호", "기계 심장"];
const OTHER_WEAPONS_PER_SLOT = 300;
const ACCESSORIES_PER_SLOT = 3000;
const HALL_ITEM_FIELDS = {
  _id: 0,
  ocid: 1,
  characterName: 1,
  worldName: 1,
  characterClass: 1,
  slot: 1,
  itemName: 1,
  starforce: 1,
  score: 1,
  "parts.additional": 1,
  "item.item_potential_option": 1,
  "item.item_additional_potential_option": 1,
  "item.item_additional_option": 1
};
const HALL_SPEC_FIELDS = { _id: 0, ocid: 1, characterName: 1, worldName: 1, characterClass: 1, combatPower: 1, itemScore: 1 };
let hall = { value: null, at: 0, pending: null };

/**
 * Candidates through indexes (a full scan of every item takes minutes): every Genesis/Arcane weapon,
 * the top other weapons per weapon type and the top accessories per slot by item score.
 */
async function computeHallOfFame() {
  const weaponSlots = (await EquipmentItem.distinct("slot", { scoreVersion: SCORE_VERSION, family: { $in: RECORD_FAMILIES } })).filter(
    (slot) => !NON_WEAPON.includes(slot)
  );
  const byScore = (filter, limit) => EquipmentItem.find(filter, HALL_ITEM_FIELDS).sort({ score: -1 }).limit(limit).lean().maxTimeMS(HALL_TIMEOUT_MS);
  const [topWeapons, otherWeapons, accessories, powerSpecs, scoreSpecs] = await Promise.all([
    EquipmentItem.find({ scoreVersion: SCORE_VERSION, family: { $in: RECORD_FAMILIES }, slot: { $in: weaponSlots } }, HALL_ITEM_FIELDS)
      .lean()
      .maxTimeMS(HALL_TIMEOUT_MS),
    Promise.all(weaponSlots.map((slot) => byScore({ slot, family: "", scoreVersion: SCORE_VERSION }, OTHER_WEAPONS_PER_SLOT))).then((lists) => lists.flat()),
    Promise.all(ACCESSORY_SLOTS.map((slot) => byScore({ slot, family: "", scoreVersion: SCORE_VERSION }, ACCESSORIES_PER_SLOT))).then((lists) => lists.flat()),
    CharacterSpec.find({ scoreVersion: SCORE_VERSION }, HALL_SPEC_FIELDS).sort({ combatPower: -1 }).limit(30).lean().maxTimeMS(TIMEOUT_MS),
    CharacterSpec.find({ scoreVersion: SCORE_VERSION }, HALL_SPEC_FIELDS).sort({ itemScore: -1 }).limit(30).lean().maxTimeMS(TIMEOUT_MS)
  ]);
  return {
    updatedAt: new Date().toISOString(),
    records: buildHallOfFame({ weapons: [...topWeapons, ...otherWeapons], accessories, powerSpecs, scoreSpecs })
  };
}

/** DB-wide records, kept six hours; an old result is served while a new one is computed. */
async function hallOfFame() {
  if (!isMongoConnected()) return { updatedAt: null, records: [] };
  const fresh = hall.value && Date.now() - hall.at < HALL_TTL_MS;
  if (!fresh && !hall.pending) {
    hall.pending = computeHallOfFame().then(
      (value) => {
        hall = { value, at: Date.now(), pending: null };
        return value;
      },
      (error) => {
        hall.pending = null;
        throw error;
      }
    );
    // 이전 결과를 돌려주는 동안의 실패는 다음 요청이 다시 시도한다.
    if (hall.value) hall.pending.catch((error) => console.error("[stats] hall of fame failed:", error?.message || error));
  }
  return hall.value || hall.pending;
}

// ---------------- 미니게임 ----------------

const GAME_POOL_SIZE = 300;
const GAME_MIN_POWER = 1e7;
// 예상 전투력(템환산·레벨이 비슷한 캐릭터의 전투력 중앙값)을 낼 무리. 6시간마다 다시 센다.
const GAME_PEER_MIN_POWER = 3e6;
const GAME_PEERS_TTL_MS = 6 * 60 * 60 * 1000;
const GAME_TTL_MS = 10 * 60 * 1000;
const GAME_FIELDS = {
  _id: 0,
  ocid: 1,
  characterName: 1,
  worldName: 1,
  characterClass: 1,
  characterLevel: 1,
  combatPower: 1,
  itemScore: 1,
  potential: 1,
  additionalPotential: 1,
  maxDamage: 1
};
const GEAR_FIELDS = {
  _id: 0,
  score: 1,
  starforce: 1,
  "item.item_equipment_slot_name": 1,
  "item.item_name": 1,
  "item.item_icon": 1,
  "item.item_grade": 1,
  "item.starforce_upgrade": 1,
  "item.item_potential_option": 1,
  "item.item_potential_option_grade": 1,
  "item.item_additional_potential_option": 1,
  "item.item_additional_potential_option_grade": 1
};
const OCID_PATTERN = /^[0-9a-f]{16,96}$/i;
// 캐릭터마다 하나씩 쌓이므로 통계 캐시와 따로 둔다.
const gearCache = new TtlLruCache({ maxEntries: 1000, maxBytes: 6 * 1024 * 1024 });

function gamePeers() {
  return cached(
    "game-peers",
    async () =>
      peerMedians(
        await CharacterSpec.find(
          { scoreVersion: SCORE_VERSION, combatPower: { $gte: GAME_PEER_MIN_POWER }, itemScore: { $gt: 0 } },
          { _id: 0, itemScore: 1, characterLevel: 1, combatPower: 1 }
        )
          .lean()
          .maxTimeMS(TIMEOUT_MS)
      ),
    GAME_PEERS_TTL_MS,
    256 * 1024
  );
}

/**
 * 전투력 1천만 이상이고 장비에 맞는 전투력(사냥 프리셋으로 잰 값이 아닌)인 캐릭터를 무작위로 300명(10분마다 새로).
 * 화면이 이 무리에서 문제를 내고, id 로 장비창(gameGear)을 읽는다.
 */
async function gamePool() {
  if (!isMongoConnected()) return { pool: [] };
  return cached(
    "game-pool",
    async () => {
      const medians = await gamePeers();
      const rows = await CharacterSpec.aggregate([
        { $match: { scoreVersion: SCORE_VERSION, combatPower: { $gte: GAME_MIN_POWER }, itemScore: { $gt: 0 } } },
        { $sample: { size: GAME_POOL_SIZE * 4 } },
        { $project: GAME_FIELDS }
      ]).option({ maxTimeMS: TIMEOUT_MS });
      const unique = [...new Map(rows.filter((row) => row.ocid && row.characterName).map((row) => [row.ocid, row])).values()];
      const pool = sampleOf(fairCharacters(unique, medians, GAME_MIN_POWER), GAME_POOL_SIZE).map((row) => ({
        id: row.ocid,
        name: row.characterName,
        world: row.worldName,
        className: row.characterClass,
        level: row.characterLevel,
        power: row.combatPower,
        itemScore: row.itemScore,
        potential: row.potential,
        additionalPotential: row.additionalPotential,
        maxDamage: row.maxDamage
      }));
      return { pool };
    },
    GAME_TTL_MS,
    96 * 1024
  );
}

/** 캐릭터(최대 둘)의 장비창. → { gear: { [id]: [{ slot, name, icon, star, grade, potential, additional }] } } */
async function gameGear(ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter((id) => OCID_PATTERN.test(id)))].slice(0, 2);
  if (!list.length || !isMongoConnected()) return { gear: {} };
  const entries = await Promise.all(
    list.map(async (ocid) => {
      const hit = gearCache.get(ocid);
      if (hit) return [ocid, hit];
      const gear = gearWindow(await EquipmentItem.find({ ocid, scoreVersion: SCORE_VERSION }, GEAR_FIELDS).lean().maxTimeMS(TIMEOUT_MS));
      gearCache.set(ocid, gear, GAME_TTL_MS, 4 * 1024);
      return [ocid, gear];
    })
  );
  return { gear: Object.fromEntries(entries) };
}

module.exports = { classStats, levelStats, jobMeta, jobTop, hallOfFame, gamePool, gameGear, TOP_CHOICES };
