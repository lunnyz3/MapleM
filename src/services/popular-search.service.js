// Popular searches: character and guild pages opened on the site, counted once per visitor per
// name per hour (the visitor key lives only in memory) and summed over today and yesterday (KST).
const mongoose = require("mongoose");
const { SearchCount, GuildSearchCount } = require("../models/search-count.model");
const { TtlLruCache } = require("../nexon/client");

const DB_TIMEOUT_MS = 3000;
const LIST_TTL_MS = 2 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const listCache = new TtlLruCache({ maxEntries: 8, maxBytes: 64 * 1024 });
const MODELS = { character: SearchCount, guild: GuildSearchCount };

function kstDay(now) {
  return new Date(now.getTime() + 9 * HOUR_MS).toISOString().slice(0, 10);
}

/**
 * Remembers (visitor, character, hour) keys so reloads and refreshes count once.
 * @param {{ maxKeys?: number }} [options]
 */
function createVisitDeduper({ maxKeys = 50000 } = {}) {
  const seen = new Map();
  return function firstVisit(visitor, world, name, now = new Date()) {
    const hour = Math.floor(now.getTime() / HOUR_MS);
    const key = `${visitor}\u0000${world}\u0000${name}\u0000${hour}`;
    if (seen.has(key)) return false;
    if (seen.size >= maxKeys) {
      for (const [oldKey, oldHour] of seen) {
        if (oldHour < hour) seen.delete(oldKey);
      }
      if (seen.size >= maxKeys) seen.clear();
    }
    seen.set(key, hour);
    return true;
  };
}

const firstVisit = createVisitDeduper();

/** Best-effort: never throws. */
async function recordSearch({ kind = "character", visitor, worldName, characterName, characterClass = "", now = new Date() }) {
  const world = String(worldName || "").trim();
  const name = String(characterName || "").trim();
  const Model = MODELS[kind];
  if (!Model || !world || !name || mongoose.connection.readyState !== 1) return false;
  if (!firstVisit(`${kind}:${String(visitor || "unknown")}`, world, name, now)) return false;
  try {
    await Model.updateOne(
      { day: kstDay(now), worldName: world, characterName: name },
      { $inc: { count: 1 }, $set: { lastAt: now, ...(characterClass ? { characterClass: String(characterClass) } : {}) } },
      { upsert: true }
    );
    return true;
  } catch (error) {
    console.error("[popular-search] record failed:", error?.message || error);
    return false;
  }
}

/** Top characters by lookups today + yesterday: [{ worldName, characterName, characterClass, count }]. */
async function popularSearches({ kind = "character", limit = 10, now = new Date() } = {}) {
  const Model = MODELS[kind];
  if (!Model || mongoose.connection.readyState !== 1) return [];
  const cacheKey = `${kind}:${limit}`;
  const cached = listCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const days = [kstDay(now), kstDay(new Date(now.getTime() - 24 * HOUR_MS))];
  const rows = await Model.aggregate([
    { $match: { day: { $in: days } } },
    {
      $group: {
        _id: { worldName: "$worldName", characterName: "$characterName" },
        count: { $sum: "$count" },
        lastAt: { $max: "$lastAt" },
        characterClass: { $last: "$characterClass" }
      }
    },
    { $sort: { count: -1, lastAt: -1 } },
    { $limit: limit }
  ]).option({ maxTimeMS: DB_TIMEOUT_MS });
  const items = rows.map((row) => ({
    worldName: row._id.worldName,
    characterName: row._id.characterName,
    characterClass: row.characterClass || "",
    count: row.count
  }));
  listCache.set(cacheKey, items, LIST_TTL_MS, 16);
  return items;
}

module.exports = { recordSearch, popularSearches, createVisitDeduper, kstDay };
