// Statistics over the collected characters (character_specs): class breakdown of the combat-power
// top N, and the level distribution. Aggregations over ~150k rows take a moment, so results are
// kept for ten minutes.
const mongoose = require("mongoose");
const { CharacterSpec } = require("../models/character-spec.model");
const { EquipmentItem } = require("../models/equipment-item.model");
const { jobMeta: buildJobMeta } = require("../domain/stats/job-meta");
const { SCORE_VERSION } = require("../domain/items/score");
const { TtlLruCache } = require("../nexon/client");

const CACHE_TTL_MS = 10 * 60 * 1000;
const META_TTL_MS = 60 * 60 * 1000;
const META_TOP = 100;
const TIMEOUT_MS = 30000;
const TOP_CHOICES = Object.freeze([100, 300, 500, 1000, 3000, 5000, 0]);
const cache = new TtlLruCache({ maxEntries: 200, maxBytes: 8 * 1024 * 1024 });

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
                output: { ocid: "$ocid", combatPower: "$combatPower", itemScore: "$itemScore", characterLevel: "$characterLevel" }
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
    64 * 1024
  );
  return { className: group.className, classes, ...meta };
}

module.exports = { classStats, levelStats, jobMeta, TOP_CHOICES };
