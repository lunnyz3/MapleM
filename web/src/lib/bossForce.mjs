// 보스 권장 포스(순수 함수). 심볼 옵션의 "아케인포스 증가 N"·"어센틱포스 증가 N"을 더한다(옵션이 없으면 레벨로:
// 아케인 (Lv+2)×10, 어센틱 Lv×10). 모자란 포스는 레벨업마다 +10 이고 레벨업 비용은 레벨이 오를수록 커지므로,
// 다음 레벨업에 드는 심볼이 가장 적은 심볼부터 올리는 것이 가장 적게 드는 길이다.

const PATTERNS = { arcane: /아케인포스 증가 ([\d,]+)/, authentic: /어센틱포스 증가 ([\d,]+)/ };
const STEP = 10;

/** @param {any} symbol @param {"arcane" | "authentic"} kind */
export function symbolForce(symbol, kind) {
  const match = String(symbol?.symbolOption || "").match(PATTERNS[kind]);
  if (match) return Number(match[1].replace(/,/g, "")) || 0;
  const level = Number(symbol?.symbolLevel) || 0;
  if (!level) return 0;
  return kind === "arcane" ? (level + 2) * STEP : level * STEP;
}

/** @param {any[]} list @param {"arcane" | "authentic"} kind */
export function totalForce(list, kind) {
  return (list || []).reduce((sum, symbol) => sum + symbolForce(symbol, kind), 0);
}

/**
 * 목표 포스까지 심볼을 가장 적게 쓰는 레벨업. 가진 심볼을 다 올려도 모자라면 reachable false.
 * @param {any[]} list 심볼 목록(symbolName·symbolLevel·symbolGrowthValue·symbolOption)
 * @param {"arcane" | "authentic"} kind
 * @param {number} target
 * @param {{ maxLevel: number, symbols: number[], meso: number[] }} table symbol-costs.json 의 한 종류
 * @returns {{ have: number, need: number, steps: Array<{ name: string, from: number, to: number }>, symbols: number, meso: number, reachable: boolean }}
 */
export function forcePlan(list, kind, target, table) {
  const have = totalForce(list, kind);
  const state = (list || []).map((symbol) => {
    const level = Number(symbol?.symbolLevel) || 0;
    return { name: String(symbol?.symbolName || ""), from: level, level, growth: Number(symbol?.symbolGrowthValue) || 0 };
  });
  let force = have;
  let symbols = 0;
  let meso = 0;
  while (force < target) {
    let best = null;
    for (const entry of state) {
      if (!entry.level || entry.level >= table.maxLevel) continue;
      const cost = Math.max(0, (table.symbols[entry.level - 1] || 0) - entry.growth);
      if (!best || cost < best.cost) best = { entry, cost, meso: table.meso[entry.level - 1] || 0 };
    }
    if (!best) break;
    best.entry.level += 1;
    best.entry.growth = 0;
    symbols += best.cost;
    meso += best.meso;
    force += STEP;
  }
  return {
    have,
    need: Math.max(0, target - have),
    steps: state.filter((entry) => entry.level > entry.from).map((entry) => ({ name: entry.name, from: entry.from, to: entry.level })),
    symbols,
    meso,
    reachable: force >= target
  };
}
