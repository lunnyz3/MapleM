// Best records (최고 기록) and growth journal (성장 일지), updated by every item record
// (site lookups, the daily ranking collection, sweeps). Needs MongoDB; without it nothing is kept.
const mongoose = require("mongoose");
const { CharacterRecord } = require("../models/character-record.model");
const { mergeRecord } = require("../domain/records/journal");

const DB_TIMEOUT_MS = 3000;

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * @param {{ ocid: string, worldName?: string, characterName?: string, snapshot: object, now?: Date }} input
 *   snapshot: see mergeRecord
 */
async function recordSnapshot({ ocid, worldName = "", characterName = "", snapshot, now = new Date() }) {
  const key = String(ocid || "").trim();
  if (!key || !snapshot || !isMongoConnected()) return null;
  const previous = await CharacterRecord.findOne({ ocid: key }).select({ _id: 0, best: 1, journal: 1, gear: 1, scoreVersion: 1 }).lean();
  const next = mergeRecord(previous, snapshot, now);
  await CharacterRecord.updateOne(
    { ocid: key },
    { $set: { ...next, worldName: String(worldName || ""), characterName: String(characterName || ""), updatedAt: now } },
    { upsert: true }
  );
  return next;
}

/** { best, journal, since } or null. `since` = first journal day. */
async function findRecord(ocid) {
  const key = String(ocid || "").trim();
  if (!key || !isMongoConnected()) return null;
  const record = await CharacterRecord.findOne({ ocid: key })
    .select({ _id: 0, best: 1, journal: 1, updatedAt: 1 })
    .maxTimeMS(DB_TIMEOUT_MS)
    .lean();
  if (!record) return null;
  const journal = Array.isArray(record.journal) ? record.journal : [];
  return { best: record.best || {}, journal, since: journal[0]?.date || null, updatedAt: record.updatedAt };
}

module.exports = { recordSnapshot, findRecord };
