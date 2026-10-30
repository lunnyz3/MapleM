"use strict";

// 보스 입장 가능 비율(순수 함수): 모은 캐릭터 중 레벨·전투력이 보스 입장 조건을 넘는 비율.
// 사냥 프리셋으로 잰 듯한 전투력(isPlausible 이 false)은 분모에서도 뺀다.

/**
 * @param {Array<{ combatPower: number, characterLevel: number }>} rows
 * @param {(row: any) => boolean} isPlausible
 * @param {Array<{ name: string, difficulty: string, level: number, power: number }>} bosses
 * @returns {{ total: number, bosses: Array<{ name: string, difficulty: string, count: number, share: number }> }}
 */
function reachShares(rows, isPlausible, bosses) {
  const known = rows.filter((row) => row.combatPower > 0 && row.characterLevel > 0 && isPlausible(row));
  const total = known.length;
  return {
    total,
    bosses: bosses.map((boss) => {
      let count = 0;
      for (const row of known) if (row.characterLevel >= boss.level && row.combatPower >= boss.power) count += 1;
      return { name: boss.name, difficulty: boss.difficulty, count, share: total ? Math.round((count / total) * 10000) / 10000 : 0 };
    })
  };
}

module.exports = { reachShares };
