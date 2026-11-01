"use strict";

// 이번 주 가장 많이 오른 사람(순수 함수): 공식 랭킹 두 날짜(최신·7일 전, 상위 1만 명)를 월드·이름으로 맞춰 오름폭 순으로.
// 레벨은 순위가 몇 계단 올랐는지, 유니온·업적은 값이 얼마나 올랐는지. 7일 전 1만 위 밖이던 사람은 '새로 1만 위 안'.

const keyOf = (row) => `${row.world_name}|${row.character_name}`;

/**
 * @param {Array<any>} now 최신 랭킹 행(ranking 순)
 * @param {Array<any>} before 7일 전 랭킹 행
 * @param {(row: any) => number} valueOf
 * @param {"rank" | "value"} by 순위 계단 또는 값 오름폭
 * @returns {{ rows: Array<{ row: any, value: number, was: number, gain: number, climb: number, rankWas: number }>, fresh: Array<{ row: any, value: number }> }}
 */
function climbers(now, before, valueOf, by) {
  const past = new Map(before.map((row) => [keyOf(row), row]));
  const rows = [];
  const fresh = [];
  for (const row of now) {
    const old = past.get(keyOf(row));
    const value = Number(valueOf(row)) || 0;
    if (!old) {
      fresh.push({ row, value });
      continue;
    }
    const was = Number(valueOf(old)) || 0;
    const rankWas = Number(old.ranking) || 0;
    rows.push({ row, value, was, gain: value - was, climb: rankWas - (Number(row.ranking) || 0), rankWas });
  }
  const score = by === "rank" ? (entry) => entry.climb : (entry) => entry.gain;
  rows.sort((a, b) => score(b) - score(a) || a.row.ranking - b.row.ranking);
  return { rows: rows.filter((entry) => score(entry) > 0), fresh };
}

/** 오른 사람들 중 가장 많은 직업(직업이 없는 랭킹이면 null) */
function topClass(entries) {
  const counts = new Map();
  for (const { row } of entries) if (row.character_class) counts.set(row.character_class, (counts.get(row.character_class) || 0) + 1);
  let best = null;
  for (const [className, count] of counts) if (!best || count > best.count) best = { className, count };
  return best;
}

module.exports = { climbers, topClass };
