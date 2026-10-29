// 내실 리포트 계산(순수 함수): 서버가 준 영역별 스탯 차이(delta, 스탯 출처 키)를 보스 세팅 합계(efficiency.js
// Totals)에 더해 전투력 상승량을 구한다. 맨 위 합계는 모든 영역을 한꺼번에 넣고 한 번 계산한다.

/**
 * 스탯 출처 키 → 효율 계산 키. 공격 타입이 다른 키는 버린다.
 * @param {Record<string, number>} delta @param {string} attackType
 * @returns {Record<string, number>}
 */
export function deltaToTotals(delta, attackType) {
  const own = attackType === "magical" ? "magical" : "physical";
  /** @type {Record<string, number>} */
  const out = {};
  const add = (/** @type {string} */ key, /** @type {number} */ value) => (out[key] = (out[key] || 0) + value);
  for (const [key, value] of Object.entries(delta || {})) {
    if (!Number.isFinite(value)) continue;
    if (key === `${own}Attack`) add("attack", value);
    else if (key === `${own}AttackPercent`) add("attackPercent", value);
    else if (key === `${own}DamagePercent`) add("damage", value);
    else if (key === "bossDamage") add("boss", value);
    else if (key === "criticalDamage") add("critical", value);
    else if (key === "finalDamage") add("finalDamage", value);
    else if (key === "maxDamage") add("maxDamage", value);
  }
  return out;
}

/** @param {Record<string, number>} totals @param {Array<Record<string, number>>} deltas */
export function addTotals(totals, ...deltas) {
  const next = { ...totals };
  for (const delta of deltas) for (const [key, value] of Object.entries(delta || {})) next[key] = (next[key] || 0) + value;
  return next;
}

/**
 * @param {{
 *   areas: Array<{ id: string, label: string, current: number, max: number, unit: string, completion: number, delta: Record<string, number>, detail?: string }>,
 *   totals: Record<string, number>, attackType: string,
 *   combatPower: (totals: Record<string, number>) => number,
 *   extra?: Array<{ id: string, label: string, current: number, max: number, unit: string, completion: number, totalsDelta: Record<string, number>, detail?: string }>
 * }} input  extra: 화면에서 계산한 영역(링크) — 이미 효율 계산 키로 된 차이
 * @returns {{ rows: any[], done: any[], power: number, gain: number, ratio: number, doneCount: number, count: number }}
 */
export function growthSummary({ areas, totals, attackType, combatPower, extra = [] }) {
  const power = combatPower(totals);
  const all = [...areas.map((item) => ({ ...item, totalsDelta: deltaToTotals(item.delta, attackType) })), ...extra].map((item) => {
    const after = combatPower(addTotals(totals, item.totalsDelta));
    return { ...item, gain: after - power, ratio: power > 0 ? after / power - 1 : 0, complete: item.completion >= 1 - 1e-9 };
  });
  const everything = combatPower(addTotals(totals, ...all.map((item) => item.totalsDelta)));
  const rows = all.filter((item) => !item.complete).sort((a, b) => b.gain - a.gain || a.completion - b.completion);
  return {
    rows,
    done: all.filter((item) => item.complete),
    power,
    gain: everything - power,
    ratio: power > 0 ? everything / power - 1 : 0,
    doneCount: all.filter((item) => item.complete).length,
    count: all.length
  };
}
