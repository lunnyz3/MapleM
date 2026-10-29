// Statistics over the collected characters (character_specs): class breakdown of the combat-power
// top N, and the level distribution. Aggregations over ~150k rows take a moment, so results are
// kept for ten minutes.
const mongoose = require("mongoose");
const { CharacterSpec } = require("../models/character-spec.model");
const { SCORE_VERSION } = require("../domain/items/score");
const { TtlLruCache } = require("../nexon/client");

const CACHE_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 30000;
const TOP_CHOICES = Object.freeze([100, 300, 500, 1000, 3000, 5000, 0]);
const cache = new TtlLruCache({ maxEntries: 200, maxBytes: 4 * 1024 * 1024 });

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

async function cached(key, compute) {
  const hit = cache.get(key);
  if (hit) return hit;
  const value = await compute();
  cache.set(key, value, CACHE_TTL_MS, 16 * 1024);
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

module.exports = { classStats, levelStats, TOP_CHOICES };
