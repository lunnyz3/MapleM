"use strict";

// 공식 랭킹 컷 추이: 전투력·레벨 랭킹(전체 월드, 상위 1만 명)의 1·100·1,000·10,000위 값을 최근 12주(7일 간격)로.
// 날짜마다 1·5·50쪽(한 쪽 200명)을 읽는다(약 36번). 종류마다 6시간 보관, 넥슨 호출이 하나라도 실패하면 보관하지 않는다.
const { getRankingCombatPower, getRankingLevel } = require("./maplestorym.service");
const { weeklyDates } = require("../domain/records/ranking-dates");
const { TtlLruCache } = require("../nexon/client");

const PAGE_SIZE = 200;
const RANKS = [1, 100, 1000, 10000];
const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new TtlLruCache({ maxEntries: 4, maxBytes: 64 * 1024 });
const TYPES = {
  "combat-power": { fetch: getRankingCombatPower, value: (row) => row.character_combat_power },
  level: { fetch: getRankingLevel, value: (row) => row.character_level }
};

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

const kstToday = (now = Date.now()) => new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** → { type, cuts: [{ rank, points: [{ date, value }] }] } (그날 그 순위가 없으면 value null) */
async function rankingCuts({ type = "combat-power" } = {}) {
  const kind = Object.hasOwn(TYPES, type) ? type : "combat-power";
  const hit = cache.get(kind);
  if (hit) return hit;
  const { fetch, value } = TYPES[kind];
  const pages = [...new Set(RANKS.map((rank) => Math.ceil(rank / PAGE_SIZE)))];
  let failed = 0;
  const days = await Promise.all(
    weeklyDates(kstToday()).map(async (date) => {
      const byRank = new Map();
      await Promise.all(
        pages.map(async (page) => {
          try {
            const result = await fetch({ date, page });
            for (const row of Array.isArray(result?.data?.ranking) ? result.data.ranking : []) byRank.set(toNumber(row.ranking), row);
          } catch {
            failed += 1;
          }
        })
      );
      return { date, values: RANKS.map((rank) => (byRank.has(rank) ? toNumber(value(byRank.get(rank))) : null)) };
    })
  );
  const result = { type: kind, cuts: RANKS.map((rank, index) => ({ rank, points: days.map((day) => ({ date: day.date, value: day.values[index] })) })) };
  if (!failed) cache.set(kind, result, TTL_MS, 8 * 1024);
  return result;
}

module.exports = { rankingCuts, RANKS };
