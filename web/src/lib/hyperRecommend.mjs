// 하이퍼 스탯 배분 추천(순수 함수): 지금 전투 스탯(최종·최대 대미지·대미지·치피·보공)에 쓴 포인트를 그대로 두고,
// 점수(전투력 또는 실전 딜)가 가장 높아지게 다시 나눈다. 레벨 1 = 포인트 1. 이 스탯들은 점수 공식에서 서로 다른
// 곱셈 항에 들어가므로 log(점수)가 스탯별 합으로 나뉘어, 스탯 × 레벨 동적 계획법으로 정확히 푼다.

/** 하이퍼 스탯 이름 → 효율 계산 키(직업 계열 대미지만). */
export function hyperKey(name, attackType) {
  const own = attackType === "magical" ? "마법 대미지" : "물리 대미지";
  if (name === "최종 대미지") return "finalDamage";
  if (name === "최대 대미지") return "maxDamage";
  if (name === own) return "damage";
  if (name === "치명타 피해") return "critical";
  if (name === "보스 공격력") return "boss";
  return "";
}

/**
 * @param {{ totals: Record<string, number>, current: Record<string, number>, table: Array<{ name: string, values: number[] }>,
 *   attackType: string, score: (totals: Record<string, number>) => number, exclude?: string[] }} input
 *   current: 이름 → 지금 레벨, exclude: 점수에 없는 키(실전 딜 모드의 maxDamage)
 * @returns {{ rows: Array<{ name: string, key: string, from: number, to: number }>, budget: number, ratio: number } | null}
 */
export function recommendHyper({ totals, current, table, attackType, score, exclude = [] }) {
  const stats = table
    .map((row) => ({ ...row, key: hyperKey(row.name, attackType) }))
    .filter((row) => row.key && !exclude.includes(row.key));
  if (!stats.length) return null;
  const valueAt = (row, level) => (level > 0 ? row.values[Math.min(level, row.values.length) - 1] : 0);
  // 하이퍼 기여를 뺀 바탕
  const base = { ...totals };
  for (const row of stats) base[row.key] = (base[row.key] || 0) - valueAt(row, current[row.name] || 0);
  const budget = stats.reduce((sum, row) => sum + Math.min(current[row.name] || 0, row.values.length), 0);
  const baseScore = score(base);
  if (!(baseScore > 0)) return null;
  // 스탯마다 레벨별 log 이득
  const gains = stats.map((row) => row.values.map((_, index) => Math.log(score({ ...base, [row.key]: (base[row.key] || 0) + valueAt(row, index + 1) }) / baseScore)));
  // best[i][b]: 앞 i개 스탯에 b 포인트를 썼을 때 최대 합
  const best = [new Array(budget + 1).fill(-Infinity)];
  best[0][0] = 0;
  const choice = [];
  stats.forEach((row, i) => {
    const next = new Array(budget + 1).fill(-Infinity);
    const pick = new Array(budget + 1).fill(0);
    for (let b = 0; b <= budget; b += 1) {
      for (let level = 0; level <= Math.min(row.values.length, b); level += 1) {
        const prev = best[i][b - level];
        if (prev === -Infinity) continue;
        const value = prev + (level ? gains[i][level - 1] : 0);
        if (value > next[b] + 1e-15) {
          next[b] = value;
          pick[b] = level;
        }
      }
    }
    best.push(next);
    choice.push(pick);
  });
  let b = budget;
  while (b > 0 && best[stats.length][b] === -Infinity) b -= 1;
  const levels = new Array(stats.length).fill(0);
  for (let i = stats.length - 1; i >= 0; i -= 1) {
    levels[i] = choice[i][b];
    b -= levels[i];
  }
  const after = { ...base };
  stats.forEach((row, i) => (after[row.key] = (after[row.key] || 0) + valueAt(row, levels[i])));
  const now = score(totals);
  return {
    rows: stats.map((row, i) => ({ name: row.name, key: row.key, from: current[row.name] || 0, to: levels[i] })),
    budget,
    ratio: now > 0 ? score(after) / now : 1
  };
}
