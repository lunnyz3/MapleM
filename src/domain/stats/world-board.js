"use strict";

// 월드 대항전(순수 함수, 모은 캐릭터 기준): 월드마다 상위 100명 평균 전투력 순위.

const TOP = 100;
// 상위 100명을 다 채운 월드만 견준다.
const MIN_WORLD = TOP;

const average = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

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

module.exports = { worldBoard };
