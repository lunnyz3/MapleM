// Best records (최고 기록) and growth journal (성장 일지), updated by every item record
// (site lookups, the daily ranking collection, sweeps). Needs MongoDB; without it nothing is kept.
const mongoose = require("mongoose");
const { CharacterRecord } = require("../models/character-record.model");
const { mergeRecord, kstDate } = require("../domain/records/journal");
const { recordBrief } = require("../domain/records/brief");
const { CharacterSpec } = require("../models/character-spec.model");

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

const BRIEF_MAX = 12;

/**
 * 내 캐릭터 변화(첫 화면 즐겨찾기·최근 검색): 캐릭터마다 최근 7일 전투력·레벨·템환산 변화와 눈에 띄는 장비 변화 둘.
 * @param {Array<{ world: string, name: string }>} list 정리된 월드 이름·캐릭터 이름(최대 12)
 * → [{ world, name, className, brief }] (모은 적 없는 캐릭터는 빠진다)
 */
async function recordBriefs(list, now = new Date()) {
  const wanted = list.slice(0, BRIEF_MAX);
  if (!wanted.length || !isMongoConnected()) return [];
  const specs = await CharacterSpec.find(
    { $or: wanted.map(({ world, name }) => ({ worldName: world, characterName: name })) },
    { _id: 0, ocid: 1, worldName: 1, characterName: 1, characterClass: 1 }
  )
    .maxTimeMS(DB_TIMEOUT_MS)
    .lean();
  if (!specs.length) return [];
  const records = await CharacterRecord.find({ ocid: { $in: specs.map((spec) => spec.ocid) } }, { _id: 0, ocid: 1, journal: { $slice: -10 } })
    .maxTimeMS(DB_TIMEOUT_MS)
    .lean();
  const journalOf = new Map(records.map((record) => [record.ocid, record.journal]));
  const today = kstDate(now);
  return specs
    .map((spec) => ({ world: spec.worldName, name: spec.characterName, className: spec.characterClass || "", brief: recordBrief(journalOf.get(spec.ocid), today) }))
    .filter((entry) => entry.brief);
}

module.exports = { recordSnapshot, findRecord, bestRecentCombatPower, recordBriefs, RECENT_POWER_DAYS };
