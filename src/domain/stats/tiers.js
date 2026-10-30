"use strict";

// 직업 티어표 · 월드 대항전(순수 함수, 모은 캐릭터 기준).
// 티어 기준은 둘: 상위 100명 평균 전투력(power), 같은 템 대비 전투력(gear: 템환산·레벨이 비슷한 캐릭터 중앙값 대비 비율의 중앙값).
const { fairRatio } = require("./game-pool");

const TOP = 100;
// 직업 순서로 나눈 몫: S 12% · A 23% · B 30% · C 23% · D 나머지
const TIER_SHARES = [
  ["S", 0.12],
  ["A", 0.23],
  ["B", 0.3],
  ["C", 0.23],
  ["D", 1]
];
const MIN_COUNT = 20;
// 월드 대항전은 상위 100명을 다 채운 월드만 견준다.
const MIN_WORLD = TOP;
// 사냥 프리셋으로 잰 듯한 값(0.3배 아래)과 튀는 값(3배 위)은 비율에서 뺀다.
const RATIO_BAND = Object.freeze([0.3, 3]);

const average = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 같은 템 대비 전투력: 직업마다 (전투력 ÷ 비슷한 캐릭터 중앙값)의 중앙값과 그 인원, 전체("")와 월드별.
 * @param {Array<{ characterClass?: string, worldName?: string, combatPower?: number, itemScore?: number, characterLevel?: number }>} rows
 * @param {Map<string, number>} medians peerMedians 결과
 * @returns {Record<string, Record<string, { ratio: number, count: number }>>}
 */
function classRatios(rows, medians) {
  const groups = new Map();
  const push = (key, value) => (groups.get(key) || groups.set(key, []).get(key)).push(value);
  for (const row of rows) {
    if (!row.characterClass) continue;
    const ratio = fairRatio(row, medians);
    if (ratio === null || ratio < RATIO_BAND[0] || ratio > RATIO_BAND[1]) continue;
    push(`|${row.characterClass}`, ratio);
    if (row.worldName) push(`${row.worldName}|${row.characterClass}`, ratio);
  }
  const result = {};
  for (const [key, ratios] of groups) {
    const [world, className] = key.split("|");
    (result[world] ||= {})[className] = { ratio: Math.round(median(ratios) * 1000) / 1000, count: ratios.length };
  }
  return result;
}

/**
 * 직업 티어 S~D. basis "power": 상위 100명 평균 전투력 순(모은 캐릭터 20명 아래 직업은 뺀다).
 * basis "gear": group.gear.ratio 순(비율을 낸 캐릭터 20명 아래 직업은 뺀다).
 * @param {Array<{ className: string, count: number, gear?: { ratio: number, count: number } | null, top: Array<{ combatPower: number, characterName?: string, worldName?: string }> }>} groups
 * @param {"power" | "gear"} basis
 * @returns {Array<{ tier: string, classes: Array<{ className: string, count: number, average: number, gear: number | null, best: { name: string, world: string, power: number } | null }> }>}
 */
function tierList(groups, basis = "power") {
  const byGear = basis === "gear";
  const rows = groups
    .filter((group) => group.className && group.count >= MIN_COUNT && (!byGear || group.gear?.count >= MIN_COUNT))
    .map((group) => {
      const top = [...group.top].sort((a, b) => b.combatPower - a.combatPower).slice(0, TOP);
      const best = top[0];
      return {
        className: group.className,
        count: group.count,
        average: Math.round(average(top.map((row) => row.combatPower || 0))),
        gear: group.gear ? group.gear.ratio : null,
        best: best ? { name: best.characterName || "", world: best.worldName || "", power: best.combatPower || 0 } : null
      };
    })
    .sort((a, b) => (byGear ? b.gear - a.gear : b.average - a.average));
  const tiers = [];
  let start = 0;
  TIER_SHARES.forEach(([tier, share], index) => {
    const end = index === TIER_SHARES.length - 1 ? rows.length : Math.min(rows.length, start + Math.max(1, Math.round(rows.length * share)));
    if (end > start) tiers.push({ tier, classes: rows.slice(start, end) });
    start = end;
  });
  return tiers;
}

/**
 * 월드마다 상위 100명 평균 전투력·평균 템환산·1위·상위 100명에 많은 직업 셋·10위/100위/1,000위 전투력 → 평균 전투력 순
 * (100명이 안 되는 월드는 뺀다).
 * @param {Array<{ world: string, count: number, cut1000?: number, top: Array<{ combatPower: number, itemScore?: number, characterName?: string, characterClass?: string }> }>} worlds
 */
function worldBoard(worlds) {
  return worlds
    .filter((entry) => entry.top.length >= MIN_WORLD)
    .map((entry) => {
      const top = [...entry.top].sort((a, b) => b.combatPower - a.combatPower).slice(0, TOP);
      const classes = new Map();
      top.forEach((row) => row.characterClass && classes.set(row.characterClass, (classes.get(row.characterClass) || 0) + 1));
      return {
        world: entry.world,
        count: entry.count,
        average: Math.round(average(top.map((row) => row.combatPower || 0))),
        itemScore: Math.round(average(top.map((row) => row.itemScore || 0)) * 10) / 10,
        best: { name: top[0].characterName || "", className: top[0].characterClass || "", power: top[0].combatPower || 0 },
        cuts: [
          { rank: 10, power: top[9]?.combatPower || 0 },
          { rank: 100, power: top[99]?.combatPower || 0 },
          { rank: 1000, power: entry.cut1000 || 0 }
        ],
        popular: [...classes.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
          .slice(0, 3)
          .map(([className, count]) => ({ className, count }))
      };
    })
    .sort((a, b) => b.average - a.average)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

module.exports = { classRatios, tierList, worldBoard };
