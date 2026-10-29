// Best records (최고 기록) and growth journal (성장 일지), updated by every item record
// (site lookups, the daily ranking collection, sweeps). Needs MongoDB; without it nothing is kept.
const mongoose = require("mongoose");
const { CharacterRecord } = require("../models/character-record.model");
const { mergeRecord, kstDate } = require("../domain/records/journal");

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

const RECENT_POWER_DAYS = 14;

/**
 * 최근 14일(한국 날짜) 성장 일지에서 가장 높은 전투력과 그날. 지금 관측값(observed: { value, observedAt })이
 * 더 크면 그대로 돌려준다. 사냥 프리셋으로 바꿔 끼워 전투력이 잠깐 내려가도 화면 값은 유지된다.
 */
async function bestRecentCombatPower(ocid, observed, now = new Date()) {
  const key = String(ocid || "").trim();
  const current = Number(observed?.value) || 0;
  if (!key || !isMongoConnected()) return observed;
  const record = await CharacterRecord.findOne({ ocid: key }).select({ _id: 0, journal: 1 }).maxTimeMS(DB_TIMEOUT_MS).lean();
  const since = kstDate(new Date(now.getTime() - (RECENT_POWER_DAYS - 1) * 86400000));
  let best = null;
  for (const row of Array.isArray(record?.journal) ? record.journal : []) {
    if (row?.date >= since && Number(row.combatPower) > (best?.value || 0)) best = { value: Number(row.combatPower), date: row.date };
  }
  if (!best || best.value <= current) return observed;
  return { value: best.value, observedAt: `${best.date}T00:00:00+09:00`, recentBest: true };
}

module.exports = { recordSnapshot, findRecord, bestRecentCombatPower, RECENT_POWER_DAYS };
