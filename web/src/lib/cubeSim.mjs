// 큐브·불꽃 시뮬레이터(순수 함수). 줄마다 공식 확률표의 p 로 옵션·수치를 뽑는다(첫 줄 first, 나머지 second·third).
// 등급 상승은 큐브마다 고정 확률(레드·에디셔널 1%, 블랙 2%, 다음 등급이 표에 있을 때만).
// 불꽃은 첫 줄은 항상, 둘째 줄은 two_option_chance 로 붙고, 옵션은 p, 수치는 범위 안에서 같은 확률.

export const GRADE_ORDER = ["레어", "에픽", "유니크", "레전더리"];

export const CUBES = {
  black: { label: "블랙 큐브", section: "potential", gradeUp: 0.02, choose: true },
  red: { label: "레드 큐브", section: "potential", gradeUp: 0.01, choose: false },
  additional: { label: "에디셔널 큐브", section: "additionalPotential", gradeUp: 0.01, choose: false }
};

/**
 * p(0~100 아무 단위) 비율로 한 행을 고른다. @template {{ p: number }} T
 * @param {T[]} rows @param {() => number} random
 * @returns {T | null}
 */
export function pickWeighted(rows, random) {
  const total = rows.reduce((sum, row) => sum + (row.p > 0 ? row.p : 0), 0);
  if (!(total > 0)) return null;
  let roll = random() * total;
  for (const row of rows) {
    if (!(row.p > 0)) continue;
    roll -= row.p;
    if (roll < 0) return row;
  }
  return rows[rows.length - 1];
}

/**
 * 큐브 한 번. @param {{ grades: Record<string, Array<Array<{ option: string, value: string, p: number }>>> }} table
 * @param {string} grade 지금 등급 @param {{ lineCount: number, gradeUp: number, random?: () => number }} options
 * @returns {{ grade: string, gradeUp: boolean, lines: Array<{ name: string, value: string }> }}
 */
export function rollCube(table, grade, { lineCount, gradeUp, random = Math.random }) {
  const index = GRADE_ORDER.indexOf(grade);
  const next = index >= 0 ? GRADE_ORDER.slice(index + 1).find((name) => table.grades[name]) : undefined;
  const up = Boolean(next) && random() < gradeUp;
  const nextGrade = up && next ? next : grade;
  const buckets = table.grades[nextGrade] || [];
  const lines = [];
  for (let i = 0; i < lineCount; i += 1) {
    const rows = buckets[Math.min(i, buckets.length - 1)] || [];
    const row = pickWeighted(rows, random);
    if (row) lines.push({ name: row.option, value: row.value });
  }
  return { grade: nextGrade, gradeUp: up, lines };
}

/** 불꽃 수치 글자: 퍼센트는 "5.4%", 아니면 "1,609". @param {{ percent: boolean }} option @param {number} value */
export function flameValueText(option, value) {
  const rounded = Math.round(value * 1000) / 1000;
  return option.percent ? `${rounded}%` : rounded.toLocaleString("ko-KR");
}

/**
 * 불꽃 한 번. @param {{ twoOptionChance: number, options: Array<{ option: string, p: number, min: number, max: number, step: number, percent: boolean }> }} flame
 * @returns {Array<{ name: string, value: string }>}
 */
export function rollFlame(flame, random = Math.random) {
  const count = random() < flame.twoOptionChance ? 2 : 1;
  const lines = [];
  for (let i = 0; i < count; i += 1) {
    const option = pickWeighted(flame.options, random);
    if (!option) continue;
    const steps = Math.max(0, Math.round((option.max - option.min) / option.step));
    const value = option.min + Math.min(steps, Math.floor(random() * (steps + 1))) * option.step;
    lines.push({ name: option.option, value: flameValueText(option, value) });
  }
  return lines;
}

/**
 * 큐브·불꽃 효율: 한 번 썼을 때 지금보다 좋아질 확률과 좋아졌을 때 평균 상승(전투력 비율), 몬테카를로.
 * @param {{ roll: () => Array<{ name: string, value: string }>, ratioOf: (lines: Array<{ name: string, value: string }>) => number, current: Array<{ name: string, value: string }>, samples?: number }} input
 *   roll: 한 번 굴린 줄들, ratioOf: 그 줄들일 때 전투력 ÷ 지금 장비 전투력
 * @returns {{ chance: number, cubes: number, gainWhenBetter: number, gainPerCube: number }}
 */
export function cubeEfficiency({ roll, ratioOf, current, samples = 800 }) {
  const base = ratioOf(current);
  let better = 0;
  let gainSum = 0;
  for (let i = 0; i < samples; i += 1) {
    const diff = ratioOf(roll()) - base;
    if (diff > 1e-12) {
      better += 1;
      gainSum += diff;
    }
  }
  const chance = better / samples;
  return {
    chance,
    cubes: chance > 0 ? 1 / chance : Infinity,
    gainWhenBetter: better ? gainSum / better : 0,
    gainPerCube: gainSum / samples
  };
}
