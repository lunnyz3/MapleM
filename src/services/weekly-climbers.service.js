"use strict";

// 이번 주 가장 많이 오른 사람(GET /api/v2/climbers?type=&world_name=&class=): 공식 랭킹 최신 날짜와 7일 전의 상위 1만 명(50쪽씩)을
// 월드·이름으로 맞춰 레벨은 순위 계단, 유니온·업적은 값 오름폭 순으로. 종류마다 3시간 보관(넥슨 호출 약 100번, 공용 캐시는 쓰지 않음).
// 전투력은 뺐다: 랭킹 값이 집계 시각에 낀 세팅(사냥·보스)에 따라 날마다 ±10~20%씩 흔들려 오름폭 1위가 세팅을 바꾼 사람으로 채워진다.
// 이름이 바뀐 캐릭터는 이어지지 않아 '새로 1만 위 안'으로 보인다. 계산은 domain/race/climbers.js.
const { getRankingAchievement, getRankingLevel, getRankingUnion } = require("./maplestorym.service");
const { climbers, topClass } = require("../domain/race/climbers");
const { TtlLruCache } = require("../nexon/client");

const PAGES = 50;
const WORKERS = 4;
const LIMIT = 50;
const TTL_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const toNumber = (value) => Number(String(value ?? "").replace(/,/g, "")) || 0;
const TYPES = {
  level: { fetch: getRankingLevel, value: (row) => toNumber(row.character_level), by: "rank" },
  union: { fetch: getRankingUnion, value: (row) => toNumber(row.union_level), by: "value" },
  achievement: { fetch: getRankingAchievement, value: (row) => toNumber(row.achievement_score), by: "value" }
};
const CLIMBER_TYPES = Object.freeze(Object.keys(TYPES));

const cache = new TtlLruCache({ maxEntries: 8, maxBytes: 24 * 1024 * 1024 });
const pending = new Map();
const kstDate = (ms) => new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const shiftDate = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** 집계가 끝난 가장 최근 날짜(오늘 → 어제 → 그제) */
async function latestDate(fetch, now = Date.now()) {
  for (const daysAgo of [0, 1, 2]) {
    const date = kstDate(now - daysAgo * DAY_MS);
    const rows = (await fetch({ date, page: 1 }, { useCache: false }).catch(() => null))?.data?.ranking;
    if (Array.isArray(rows) && rows.length) return date;
  }
  throw new Error("no ranking date");
}

/** 한 날짜의 상위 1만 명(50쪽). 한 쪽이라도 실패하면 오류 — 반쪽짜리 비교를 보관하지 않게 */
async function allPages(fetch, date) {
  const pages = [];
  let next = 1;
  let failed = null;
  const worker = async () => {
    while (next <= PAGES && !failed) {
      const page = next;
      next += 1;
      try {
        const rows = (await fetch({ date, page }, { useCache: false }))?.data?.ranking;
        pages[page] = Array.isArray(rows) ? rows : [];
      } catch (error) {
        failed = error;
      }
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  if (failed) throw failed;
  return pages.flat();
}

async function computeDiff(type) {
  const kind = TYPES[type];
  const date = await latestDate(kind.fetch);
  const before = shiftDate(date, -7);
  const [now, then] = await Promise.all([allPages(kind.fetch, date), allPages(kind.fetch, before)]);
  return { date, before, total: now.length, ...climbers(now, then, kind.value, kind.by) };
}

const view = (entry) => ({
  rank: entry.row.ranking,
  rankWas: entry.rankWas ?? null,
  climb: entry.climb ?? null,
  world: entry.row.world_name,
  name: entry.row.character_name,
  className: entry.row.character_class || "",
  level: entry.row.character_level || null,
  value: entry.value,
  was: entry.was ?? null,
  gain: entry.gain ?? null
});

/**
 * @param {{ type?: string, worldName?: string, className?: string }} query
 * @returns {Promise<{ type, date, before, total, rows, fresh: { count, top }, topClass }>}
 */
async function weeklyClimbers({ type = "level", worldName = "", className = "" } = {}) {
  const kind = Object.hasOwn(TYPES, type) ? type : "level";
  let diff = cache.get(kind);
  if (!diff) {
    if (!pending.has(kind)) {
      pending.set(
        kind,
        computeDiff(kind).finally(() => pending.delete(kind))
      );
    }
    diff = await pending.get(kind);
    cache.set(kind, diff, TTL_MS, 3 * 1024 * 1024);
  }
  const match = (row) => (!worldName || row.world_name === worldName) && (!className || row.character_class === className);
  const fresh = diff.fresh.filter((entry) => match(entry.row));
  return {
    type: kind,
    date: diff.date,
    before: diff.before,
    total: diff.total,
    rows: diff.rows.filter((entry) => match(entry.row)).slice(0, LIMIT).map(view),
    fresh: { count: fresh.length, top: fresh.slice(0, 10).map(view) },
    topClass: topClass(diff.rows.slice(0, 200))
  };
}

module.exports = { weeklyClimbers, CLIMBER_TYPES };
