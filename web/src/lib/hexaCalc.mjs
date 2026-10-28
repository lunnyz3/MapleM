// 계산기 공용 계산(순수 함수). 게임 수치는 인자로 받는다(src/game-data/hexa.json, symbol-costs.json).

/**
 * 레벨 from → to 로 올리는 데 드는 합(비용표 index i = Lv.i→i+1). to ≤ from 이면 0.
 * @param {number[]} perLevel @param {number} from @param {number} to
 */
export function sumRange(perLevel, from, to) {
  let total = 0;
  for (let level = Math.max(0, from); level < Math.min(to, perLevel.length); level += 1) total += perLevel[level] || 0;
  return total;
}

/**
 * 하루 평균 수급(일일 + 주간 ÷ 7)으로 필요한 날 수. 수급이 없으면 Infinity, 필요 없으면 0.
 * @param {number} need @param {number} daily @param {number} weekly
 */
export function daysFor(need, daily, weekly) {
  if (!(need > 0)) return 0;
  const perDay = (Number(daily) || 0) + (Number(weekly) || 0) / 7;
  return perDay > 0 ? Math.ceil(need / perDay) : Infinity;
}

/**
 * HEXA 스탯 강화: 목표 메인 레벨에 닿을 확률과 기대 조각.
 * 한 판(20회) 안에서 목표에 더는 닿을 수 없으면 그 자리에서 초기화하고 처음부터 다시 한다고 본다.
 *
 * @param {{
 *   enhance: Array<{ mainLevel: number, fragments: number, mainChance: number }>,
 *   perStatMax: number, totalMax: number,
 *   eventMainBoost?: { fromLevel: number, toLevel: number, multiplier: number }
 * }} rules
 * @param {{ target: number, start?: [number, number, number], event?: boolean }} options
 * @returns {{ runChance: number, runFragments: number, freshChance: number, freshFragments: number,
 *   expectedFragments: number, expectedResets: number }}
 *   runChance/runFragments: start 상태에서 이번 판 성공 확률과 이번 판에 쓸 기대 조각
 *   expectedFragments: 성공할 때까지(필요하면 초기화하며) 쓸 기대 조각 · expectedResets: 기대 초기화 횟수
 */
export function hexaStatExpectation(rules, { target, start = [0, 0, 0], event = false }) {
  const max = rules.perStatMax;
  const total = rules.totalMax;
  const byLevel = new Map(rules.enhance.map((row) => [row.mainLevel, row]));
  /** @type {Map<string, [number, number]>} */
  const memo = new Map();

  const mainChance = (/** @type {number} */ main) => {
    const row = byLevel.get(main);
    let chance = (row?.mainChance || 0) / 100;
    const boost = rules.eventMainBoost;
    if (event && boost && main >= boost.fromLevel && main <= boost.toLevel) chance *= boost.multiplier;
    return Math.min(1, chance);
  };

  /** @returns {[number, number]} [성공 확률, 기대 조각] */
  const solve = (/** @type {number} */ main, /** @type {number} */ sub1, /** @type {number} */ sub2) => {
    if (main >= target) return [1, 0];
    const used = main + sub1 + sub2;
    if (used >= total || main + (total - used) < target) return [0, 0];
    const key = `${main},${sub1},${sub2}`;
    const known = memo.get(key);
    if (known) return known;
    const cost = byLevel.get(main)?.fragments || 0;
    const openSubs = [sub1 < max, sub2 < max].filter(Boolean).length;
    let pMain = main < max ? mainChance(main) : 0;
    // 부가 스탯이 모두 10이면 메인만 오른다.
    if (!openSubs) pMain = main < max ? 1 : 0;
    const pSub = openSubs ? (1 - pMain) / openSubs : 0;
    let chance = 0;
    let fragments = cost;
    const add = (/** @type {number} */ p, /** @type {[number, number]} */ next) => {
      if (!(p > 0)) return;
      chance += p * next[0];
      fragments += p * next[1];
    };
    if (main < max) add(pMain, solve(main + 1, sub1, sub2));
    if (sub1 < max) add(pSub, solve(main, sub1 + 1, sub2));
    if (sub2 < max) add(pSub, solve(main, sub1, sub2 + 1));
    const result = /** @type {[number, number]} */ ([chance, fragments]);
    memo.set(key, result);
    return result;
  };

  const [freshChance, freshFragments] = solve(0, 0, 0);
  const [runChance, runFragments] = solve(start[0], start[1], start[2]);
  const perSuccess = freshChance > 0 ? freshFragments / freshChance : Infinity;
  return {
    runChance,
    runFragments,
    freshChance,
    freshFragments,
    expectedFragments: runFragments + (1 - runChance) * perSuccess,
    expectedResets: runChance >= 1 ? 0 : freshChance > 0 ? (1 - runChance) / freshChance : Infinity
  };
}

/**
 * 심볼 한 개를 목표 레벨까지: 필요한 심볼 수(이미 모은 성장치 제외)와 메소.
 * @param {{ symbols: number[], meso: number[] }} table index 0 = Lv.1→2
 * @param {number} level @param {number} target @param {number} [growth]
 */
export function symbolCost(table, level, target, growth = 0) {
  const from = Math.max(1, level);
  let symbols = 0;
  let meso = 0;
  for (let current = from; current < target && current - 1 < table.symbols.length; current += 1) {
    symbols += table.symbols[current - 1] || 0;
    meso += table.meso[current - 1] || 0;
  }
  return { symbols: Math.max(0, symbols - (Number(growth) || 0)), meso };
}

/**
 * HEXA 스킬 → 비용표 종류. 스킬 코어 중 2번째 칸부터는 어센트 코어 비용을 쓴다.
 * @param {{ skillType?: string, slotNo?: number | string }} skill @param {Record<string, string>} coreTypes
 */
export function hexaCoreType(skill, coreTypes) {
  const type = String(skill?.skillType || "");
  if (type === "스킬 코어") return Number(skill?.slotNo) >= 2 ? "어센트 코어" : "오리진 코어";
  return coreTypes[type] || "";
}

/**
 * 코어들이 지금까지 쓴 재화와 최대 레벨까지 남은 재화.
 * @param {Array<{ type: string, level: number }>} cores
 * @param {Record<string, { energy: number[], fragments: number[] }>} costs @param {number} maxLevel
 */
export function hexaSpend(cores, costs, maxLevel) {
  const total = { usedEnergy: 0, usedFragments: 0, leftEnergy: 0, leftFragments: 0 };
  for (const core of cores) {
    const table = costs[core.type];
    if (!table) continue;
    total.usedEnergy += sumRange(table.energy, 0, core.level);
    total.usedFragments += sumRange(table.fragments, 0, core.level);
    total.leftEnergy += sumRange(table.energy, core.level, maxLevel);
    total.leftFragments += sumRange(table.fragments, core.level, maxLevel);
  }
  return total;
}
