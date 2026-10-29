// 옵션 묶음 점수(잠재·에디·추옵, 순수 함수): 실전 딜 가중치(템환산 가중치)로 줄 점수를 더해, 그 장비가 그 등급에서
// 받을 수 있는 가장 좋은 줄(공식 확률표의 줄별 최고, 불꽃은 가장 좋은 옵션의 최댓값 × 줄 수)을 100점으로 본다.
// 마스터리로 오른 값은 빼고(굴린 값만) 센다. 딜과 상관없는 옵션(HP·드롭 등)은 0점.

const squash = (text) =>
  String(text || "")
    .replace(/\s+/g, "")
    .replace(/데미지/g, "대미지")
    .replace(/증가$/, "");
const numberOf = (text) => Number(String(text).replace(/[^0-9.\-]/g, ""));

/**
 * 한 줄 점수. side: "physical" | "magical"(그 직업 쪽만 센다).
 * @param {Record<string, number>} weights item-score.json weights @param {string} name @param {string | number} value @param {string} side
 */
export function lineScore(weights, name, value, side) {
  const option = squash(name);
  const text = String(value ?? "");
  const amount = numberOf(text);
  if (!option || !Number.isFinite(amount)) return 0;
  const own = side === "magical" ? "마법" : "물리";
  const other = side === "magical" ? "물리" : "마법";
  if (option.startsWith(other)) return 0;
  if (option === `${own}공격력`) return amount * (text.includes("%") ? weights.attackPercent : weights.attack);
  if (option === `${own}대미지`) return amount * weights.damagePercent;
  if (option === "보스공격력") return amount * weights.bossDamage;
  if (option === "최종대미지") return amount * weights.finalDamage;
  if (option === "방어율무시") return amount * weights.ignoreDefense;
  if (option === "치명타피해" || option === "크리티컬대미지") return amount * weights.criticalDamage;
  if (option === "최대대미지") return amount * weights.maxDamage;
  return 0;
}

/**
 * 잠재·에디 묶음: { points, max, score(0~100) }. 표가 없거나 최대가 0이면 null.
 * @param {{ weights: Record<string, number>, side: string, lines: Array<{ name: string, value: string | number }>,
 *   bucket: Array<Array<{ option: string, value: string }>> }} input  bucket: 그 등급의 줄별 표(first, second, third)
 */
export function cubeSectionScore({ weights, side, lines, bucket }) {
  if (!Array.isArray(bucket) || !bucket.length || !lines.length) return null;
  let max = 0;
  lines.forEach((_, index) => {
    const rows = bucket[Math.min(index, bucket.length - 1)] || [];
    max += rows.reduce((best, row) => Math.max(best, lineScore(weights, row.option, row.value, side)), 0);
  });
  const points = lines.reduce((sum, line) => sum + lineScore(weights, line.name, line.value, side), 0);
  if (max > 0) return { points, max, score: Math.max(0, Math.min(100, (points / max) * 100)), basis: "damage" };
  // 이 부위 표에 딜 옵션이 하나도 없으면(모자 잠재 등): 줄마다 그 옵션의 최고 수치 대비 비율의 평균.
  const ratios = lines.map((line, index) => {
    const rows = (bucket[Math.min(index, bucket.length - 1)] || []).filter((row) => squash(row.option) === squash(line.name));
    const top = rows.reduce((best, row) => Math.max(best, numberOf(row.value)), 0);
    const value = numberOf(line.value);
    return top > 0 && Number.isFinite(value) ? Math.min(1, value / top) : 0;
  });
  const score = (ratios.reduce((sum, ratio) => sum + ratio, 0) / lines.length) * 100;
  return { points: score, max: 100, score, basis: "value" };
}

/**
 * 추가 옵션 묶음: 가장 좋은 옵션의 최댓값 × 줄 수(2)를 100점으로.
 * @param {{ weights: Record<string, number>, side: string, lines: Array<{ name: string, value: string | number }>,
 *   options: Array<{ option: string, max: number, percent: boolean }>, lineCount?: number }} input
 */
export function flameSectionScore({ weights, side, lines, options, lineCount = 2 }) {
  if (!Array.isArray(options) || !options.length || !lines.length) return null;
  const best = options.reduce((top, option) => Math.max(top, lineScore(weights, option.option, option.percent ? `${option.max}%` : option.max, side)), 0);
  const max = best * lineCount;
  const points = lines.reduce((sum, line) => sum + lineScore(weights, line.name, line.value, side), 0);
  return max > 0 ? { points, max, score: Math.max(0, Math.min(100, (points / max) * 100)) } : null;
}

/** 점수 등급(색): 90 이상 top, 70 이상 good, 40 이상 mid, 나머지 low */
export function scoreTier(score) {
  return score >= 90 ? "top" : score >= 70 ? "good" : score >= 40 ? "mid" : "low";
}
