// 확률 계산기(순수 함수): 스타코러스 재설정, 빛의 성소 기도, 자석펫 원더베리. 표는 src/game-data/gacha.json.
// 모두 "목표 이상이 한 번에 나올 확률 p → 평균 시도 1/p" 방식이다.

/** "4.44%" · "1,200" → 숫자 */
const numberOf = (text) => Number(String(text).replace(/[^0-9.\-]/g, ""));

/**
 * 스타코러스 재설정: 목표 이상이 나올 확률과 평균 재설정·세리온·메소.
 * @param {any} table gacha.json starChorus @param {"maxDamage" | "finalDamage"} mode @param {number} target
 */
export function starChorusOdds(table, mode, target) {
  const chance = table[mode].filter((row) => row.value >= target).reduce((sum, row) => sum + row.p, 0);
  const resets = chance > 0 ? 1 / chance : Infinity;
  const cerion = resets * table.cerionPerReset;
  return { chance, resets, cerion, costEok: cerion * table.cerionPriceEok };
}

/**
 * 빛의 성소 기도: 한 번에 그 옵션이 목표 수치 이상(등급 무관) 나올 확률. 레벨의 확률 합으로 나눈다.
 * @param {Record<string, Record<string, Array<[string, number]>>>} level 옵션 → 등급 → [값, 확률%]
 * @param {string} option @param {number} target
 */
export function sanctuaryOdds(level, option, target) {
  let total = 0;
  let hit = 0;
  for (const [name, grades] of Object.entries(level || {})) {
    for (const rows of Object.values(grades)) {
      for (const [value, p] of rows) {
        total += p;
        if (name === option && numberOf(value) >= target - 1e-9) hit += p;
      }
    }
  }
  const chance = total > 0 ? hit / total : 0;
  return { chance, tries: chance > 0 ? 1 / chance : Infinity };
}

/** 빛의 성소 옵션의 값 목록(작은 값부터, 중복 없이). */
export function sanctuaryValues(level, option) {
  const values = new Set();
  for (const rows of Object.values(level?.[option] || {})) for (const [value] of rows) values.add(numberOf(value));
  return [...values].sort((a, b) => a - b);
}

/**
 * 자석펫 원더베리: 그 항목이 한 번에 나올 확률, 평균 뽑기 수, 11회 묶음 기준 다이아.
 * @param {any} table gacha.json magnetPet @param {string} name
 */
export function magnetPetOdds(table, name) {
  const total = table.items.reduce((sum, item) => sum + item.p, 0);
  const chance = total > 0 ? table.items.filter((item) => item.name === name).reduce((sum, item) => sum + item.p, 0) / total : 0;
  const draws = chance > 0 ? 1 / chance : Infinity;
  return { chance, draws, diamonds: draws * (table.costs.eleven / 11) };
}
