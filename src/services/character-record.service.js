// Best records (최고 기록) and growth journal (성장 일지), updated by every item record
// (site lookups, the daily ranking collection, sweeps). Needs MongoDB; without it nothing is kept.
const mongoose = require("mongoose");
const { CharacterRecord } = require("../models/character-record.model");
const { mergeRecord, kstDate } = require("../domain/records/journal");
const { recordBrief } = require("../domain/records/brief");
const { CharacterSpec } = require("../models/character-spec.model");
const { plausiblePowers } = require("./stats.service");
const { TtlLruCache } = require("../nexon/client");
const { allowedWorldNames } = require("../config/worlds");

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
const BRIEF_SPEC_FIELDS = {
  _id: 0,
  ocid: 1,
  worldName: 1,
  characterName: 1,
  characterClass: 1,
  characterLevel: 1,
  combatPower: 1,
  itemScore: 1,
  potential: 1,
  additionalPotential: 1,
  checkedAt: 1
};

/**
 * 내 캐릭터들(첫 화면 즐겨찾기·최근 검색, 내 캐릭터 한눈에, 파티 보스 체크): 모은 스펙과 최근 7일 변화(전투력·레벨·템환산,
 * 눈에 띄는 장비 변화 둘). 전투력은 사냥 프리셋으로 잰 듯하면 0(모름).
 * @param {Array<{ world: string, name: string }>} list 정리된 월드 이름·캐릭터 이름(최대 12)
 * → [{ world, name, className, level, power, itemScore, potential, additionalPotential, checkedAt, brief }] (모은 적 없는 캐릭터는 빠진다)
 */
async function recordBriefs(list, now = new Date()) {
  const wanted = list.slice(0, BRIEF_MAX);
  if (!wanted.length || !isMongoConnected()) return [];
  const specs = await CharacterSpec.find({ $or: wanted.map(({ world, name }) => ({ worldName: world, characterName: name })) }, BRIEF_SPEC_FIELDS)
    .maxTimeMS(DB_TIMEOUT_MS)
    .lean();
  if (!specs.length) return [];
  const [records, powers] = await Promise.all([
    CharacterRecord.find({ ocid: { $in: specs.map((spec) => spec.ocid) } }, { _id: 0, ocid: 1, journal: { $slice: -10 } })
      .maxTimeMS(DB_TIMEOUT_MS)
      .lean(),
    plausiblePowers(specs).catch(() => specs.map(() => 0))
  ]);
  const journalOf = new Map(records.map((record) => [record.ocid, record.journal]));
  const today = kstDate(now);
  return specs.map((spec, index) => ({
    world: spec.worldName,
    name: spec.characterName,
    className: spec.characterClass || "",
    level: spec.characterLevel || 0,
    power: powers[index] || 0,
    itemScore: spec.itemScore || 0,
    potential: spec.potential || 0,
    additionalPotential: spec.additionalPotential || 0,
    checkedAt: spec.checkedAt,
    brief: recordBrief(journalOf.get(spec.ocid), today)
  }));
}

// ---------------- 검색 자동완성 ----------------

const SUGGEST_COUNT = 8;
const suggestCache = new TtlLruCache({ maxEntries: 2000, maxBytes: 2 * 1024 * 1024 });
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 모은 캐릭터 중 이름이 q 로 시작하는 캐릭터(월드마다 색인 {worldName, characterName} 앞부분 찾기).
 * 같은 이름 → 고른 월드 → 전투력 높은 순으로 8명. → [{ world, name, className, level, power }]
 */
async function suggestCharacters({ q, world = "" }) {
  const prefix = String(q || "").replace(/\s+/g, "").slice(0, 12);
  if (!prefix || !isMongoConnected()) return [];
  const key = `${prefix}|${world}`;
  const hit = suggestCache.get(key);
  if (hit) return hit;
  const pattern = new RegExp(`^${escapeRegex(prefix)}`);
  const lists = await Promise.all(
    allowedWorldNames.map((worldName) =>
      CharacterSpec.find({ worldName, characterName: pattern }, { _id: 0, worldName: 1, characterName: 1, characterClass: 1, characterLevel: 1, combatPower: 1 })
        .limit(SUGGEST_COUNT)
        .maxTimeMS(DB_TIMEOUT_MS)
        .lean()
        .catch(() => [])
    )
  );
  const rows = lists
    .flat()
    .sort(
      (a, b) =>
        Number(b.characterName === prefix) - Number(a.characterName === prefix) ||
        Number(b.worldName === world) - Number(a.worldName === world) ||
        (b.combatPower || 0) - (a.combatPower || 0)
    )
    .slice(0, SUGGEST_COUNT)
    .map((row) => ({ world: row.worldName, name: row.characterName, className: row.characterClass || "", level: row.characterLevel || 0, power: row.combatPower || 0 }));
  suggestCache.set(key, rows, 60 * 1000, 1024);
  return rows;
}

module.exports = { recordSnapshot, findRecord, bestRecentCombatPower, recordBriefs, suggestCharacters, RECENT_POWER_DAYS };
