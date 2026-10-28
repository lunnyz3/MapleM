// 전투력 shown on the character page = the highest value observed for that character in the
// last 24 hours. The stat endpoint reports the value for the gear worn at lookup time (a
// farming preset can show a fraction of it), so the best recent observation is kept.
//
// Observations come from character lookups (stat endpoint) and the daily combat-power
// ranking. They are kept in MongoDB (`combat_power_observations`, TTL 3 days) when it is
// connected and always in a small in-process cache, so a missing or failing database only
// shortens the memory. Writes are best-effort and never block or fail a response.
const mongoose = require("mongoose");
const { CombatPowerObservation } = require("../models/combat-power-observation.model");
const { TtlLruCache } = require("../nexon/client");

const WINDOW_MS = 24 * 60 * 60 * 1000;
// The same value seen again within this span refreshes the existing row instead of adding one.
const SAME_VALUE_MERGE_MS = 60 * 60 * 1000;
const DB_READ_TIMEOUT_MS = 2000;
const MAX_ENTRIES_PER_OCID = 50;

const memory = new TtlLruCache({ maxEntries: 5000, maxBytes: 8 * 1024 * 1024 });

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

/** Ranking rows are aggregated once a day; a row for `YYYY-MM-DD` counts as observed at 02:30 KST. */
function rankingObservedAt(dateText) {
  const text = String(dateText || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const date = new Date(`${text}T02:30:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDate(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeObservations(observations, now) {
  const list = [];
  for (const entry of Array.isArray(observations) ? observations : []) {
    if (!entry) continue;
    const value = Number(entry.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    const observedAt = toDate(entry.observedAt, now);
    if (!observedAt) continue;
    list.push({
      value,
      // Never in the future: a ranking date can be "today" before 02:30 only by clock skew.
      observedAt: observedAt.getTime() > now.getTime() ? new Date(now.getTime()) : observedAt,
      source: String(entry.source || "stat")
    });
  }
  return list;
}

/** Highest value; ties go to the most recent observation. */
function pickBest(candidates) {
  let best = null;
  for (const candidate of candidates) {
    if (!candidate || !Number.isFinite(candidate.value)) continue;
    if (
      !best ||
      candidate.value > best.value ||
      (candidate.value === best.value && candidate.observedAt.getTime() > best.observedAt.getTime())
    ) {
      best = candidate;
    }
  }
  return best;
}

function rememberInMemory(ocid, list, now) {
  const since = now.getTime() - WINDOW_MS;
  const kept = (memory.get(ocid) || []).filter((entry) => entry.observedAt.getTime() >= since);
  for (const entry of list) {
    if (entry.observedAt.getTime() >= since) {
      kept.push(entry);
    }
  }
  kept.sort((a, b) => b.value - a.value || b.observedAt.getTime() - a.observedAt.getTime());
  const trimmed = kept.slice(0, MAX_ENTRIES_PER_OCID);
  if (trimmed.length) {
    memory.set(ocid, trimmed, WINDOW_MS, 64 * trimmed.length);
  } else {
    memory.delete(ocid);
  }
  return trimmed;
}

function bestFromMemory(ocid, now) {
  const since = now.getTime() - WINDOW_MS;
  return pickBest((memory.get(ocid) || []).filter((entry) => entry.observedAt.getTime() >= since));
}

async function writeToDb(ocid, list) {
  for (const entry of list) {
    if (entry.source === "ranking") {
      // One row per ranking date.
      await CombatPowerObservation.updateOne(
        { ocid, source: entry.source, observedAt: entry.observedAt },
        { $set: { value: entry.value } },
        { upsert: true }
      );
    } else {
      await CombatPowerObservation.updateOne(
        {
          ocid,
          source: entry.source,
          value: entry.value,
          observedAt: { $gte: new Date(entry.observedAt.getTime() - SAME_VALUE_MERGE_MS) }
        },
        { $max: { observedAt: entry.observedAt } },
        { upsert: true }
      );
    }
  }
}

async function readBestFromDb(ocid, now) {
  const doc = await CombatPowerObservation.findOne({
    ocid,
    observedAt: { $gte: new Date(now.getTime() - WINDOW_MS), $lte: now }
  })
    .sort({ value: -1, observedAt: -1 })
    .select({ value: 1, observedAt: 1, source: 1, _id: 0 })
    .maxTimeMS(DB_READ_TIMEOUT_MS)
    .lean();
  if (!doc) return null;
  const observedAt = toDate(doc.observedAt, null);
  const value = Number(doc.value);
  return observedAt && Number.isFinite(value) ? { value, observedAt, source: doc.source } : null;
}

/**
 * Records the given observations and returns the best value of the last 24 hours as
 * `{ value, observedAt }` (`observedAt` is an ISO string). Falls back to the freshest
 * observation passed in, or `{ value: null, observedAt: null }` when there is none.
 *
 * observations: [{ value, observedAt?, source }] — `observedAt` defaults to `now`.
 * options.waitForWrites: await the database write (tests); otherwise it runs in the background.
 */
async function observeCombatPower(ocid, observations, { now = new Date(), waitForWrites = false } = {}) {
  const key = String(ocid || "").trim();
  const list = normalizeObservations(observations, now);
  const since = now.getTime() - WINDOW_MS;
  const recent = list.filter((entry) => entry.observedAt.getTime() >= since);

  let stored = null;
  if (key) {
    rememberInMemory(key, list, now);

    if (isMongoConnected()) {
      const write = list.length
        ? writeToDb(key, list).catch((error) => {
            console.error("[combat-power] observation write failed:", error?.message || error);
          })
        : Promise.resolve();
      if (waitForWrites) {
        await write;
      }
      try {
        stored = await readBestFromDb(key, now);
      } catch (error) {
        console.error("[combat-power] observation read failed:", error?.message || error);
      }
    }
  }

  const best =
    pickBest([...recent, key ? bestFromMemory(key, now) : null, stored]) ||
    // Nothing inside the window: show the latest value we were given.
    [...list].sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())[0] ||
    null;

  return best
    ? { value: best.value, observedAt: best.observedAt.toISOString() }
    : { value: null, observedAt: null };
}

function clearCombatPowerMemory() {
  for (const key of [...memory.entries.keys()]) {
    memory.delete(key);
  }
}

module.exports = {
  observeCombatPower,
  rankingObservedAt,
  clearCombatPowerMemory,
  COMBAT_POWER_WINDOW_MS: WINDOW_MS
};
