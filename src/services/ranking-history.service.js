"use strict";

// 공식 랭킹 1년 기록: 넥슨 과거 랭킹(상위 1만 명)에서 한 캐릭터의 날짜별 순위와 값(historyDates, 약 16개 날짜).
// 지난 날짜 값은 바뀌지 않으므로 캐릭터마다 6시간 보관한다. 넥슨 호출이 하나라도 실패하면 보관하지 않는다.
const { getRankingCombatPower, getRankingLevel } = require("./maplestorym.service");
const { historyDates } = require("../domain/records/ranking-dates");
const { TtlLruCache } = require("../nexon/client");

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new TtlLruCache({ maxEntries: 500, maxBytes: 2 * 1024 * 1024 });
const TYPES = {
  power: { fetch: getRankingCombatPower, value: (row) => row.character_combat_power },
  level: { fetch: getRankingLevel, value: (row) => row.character_level }
};

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

const kstToday = (now = Date.now()) => new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** → { type, points: [{ date, ranking, value }] } (랭킹 밖인 날은 ranking·value 가 null) */
async function rankingHistory({ ocid, type = "power" }) {
  const kind = Object.hasOwn(TYPES, type) ? type : "power";
  const key = `${kind}|${ocid}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { fetch, value } = TYPES[kind];
  let failed = 0;
  const points = await Promise.all(
    historyDates(kstToday()).map(async (date) => {
      try {
        const result = await fetch({ date, ocid, page: 1 });
        const row = Array.isArray(result?.data?.ranking) ? result.data.ranking[0] : null;
        return { date, ranking: row ? toNumber(row.ranking) : null, value: row ? toNumber(value(row)) : null };
      } catch {
        failed += 1;
        return { date, ranking: null, value: null };
      }
    })
  );
  const history = { type: kind, points };
  if (!failed) cache.set(key, history, TTL_MS, 4096);
  return history;
}

module.exports = { rankingHistory };
