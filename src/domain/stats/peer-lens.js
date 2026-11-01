"use strict";

// 동급 비교(순수 함수): 오름차순 정렬 배열에서 내 값이 위에서 몇 %인지, 무리의 분포(둥근 경계 10칸 안팎)와 다음 칸까지 남은 값,
// 내실 지수 — 같은 직업·레벨대(5레벨)·템환산 ±2점 무리 안에서 전투력이 위에서 몇 %인지(30명이 안 되면 ±4점·10레벨, ±8점·20레벨로 넓힌다).

const MIN_SAMPLE = 30;
const MIN_INNER = 15;
const MAX_BUCKETS = 14;
// 최상위권은 비슷한 장비가 드물어 마지막엔 ±8점·20레벨까지 넓힌다
const INNER_TRIES = Object.freeze([
  { size: 5, points: 2 },
  { size: 10, points: 4 },
  { size: 20, points: 8 }
]);

/** 레벨대 첫 레벨: 287 → 285(5레벨), 280(10레벨) */
function bandStart(level, size = 5) {
  return Math.floor((Number(level) || 0) / size) * size;
}

/** 오름차순 배열에서 value 보다 큰 값의 수 */
function countAbove(sorted, value) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] > value) hi = mid;
    else lo = mid + 1;
  }
  return sorted.length - lo;
}

function includes(sorted, value) {
  const above = countAbove(sorted, value);
  const index = sorted.length - above - 1;
  return index >= 0 && sorted[index] === value;
}

/** 위에서 몇 번째 → { rank, total, top(%) }. 같은 값은 같은 순위, 배열에 내 값이 없으면 나를 더해 센다. */
function standing(sorted, value) {
  if (!(value > 0) || !sorted?.length) return null;
  const rank = countAbove(sorted, value) + 1;
  const total = sorted.length + (includes(sorted, value) ? 0 : 1);
  return { rank, total, top: (rank / total) * 100 };
}

/** 잠재 등급 색: 상위 10% 레전더리 · 25% 유니크 · 60% 에픽 · 나머지 레어 */
function gradeOf(top) {
  if (!(top >= 0)) return "";
  if (top <= 10) return "legendary";
  if (top <= 25) return "unique";
  if (top <= 60) return "epic";
  return "rare";
}

function quantile(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
}

/** raw 이상인 가장 작은 1·2·5 × 10ⁿ */
function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((step) => step >= raw);
}

/**
 * 분포: 2~98% 범위를 둥근 간격으로 10칸 안팎(최대 14칸)으로 나누고 내 칸·다음 칸까지 남은 값을 낸다. 양끝 바깥 값은 끝 칸에 넣는다.
 * @returns {{ from: number, step: number, counts: number[], mine: number, next: number | null } | null}
 */
function distribution(sorted, value) {
  if (!sorted || sorted.length < 2) return null;
  const lo = quantile(sorted, 0.02);
  const hi = quantile(sorted, 0.98);
  let step = niceStep(Math.max(hi - lo, hi * 0.05, 1) / 10);
  const range = () => {
    const from = Math.floor(Math.min(lo, value > 0 ? value : lo) / step) * step;
    const to = (Math.floor(Math.max(hi, value > 0 ? value : hi) / step) + 1) * step;
    return { from, size: Math.round((to - from) / step) };
  };
  let { from, size } = range();
  while (size > MAX_BUCKETS) {
    step = niceStep(step * 1.5);
    ({ from, size } = range());
  }
  const slot = (v) => Math.min(size - 1, Math.max(0, Math.floor((v - from) / step)));
  const counts = new Array(size).fill(0);
  for (const v of sorted) counts[slot(v)] += 1;
  const mine = value > 0 ? slot(value) : -1;
  const next = mine >= 0 && mine < size - 1 ? from + (mine + 1) * step - value : null;
  return { from, step, counts, mine, next };
}

/**
 * 한 무리 안에서 내 자리. 내 전투력을 모르면(사냥 프리셋으로 잰 듯하면) 템환산만, 분포도 템환산으로.
 * @param {{ power: Float64Array | number[], item: Float64Array | number[] } | null | undefined} group 오름차순
 * @param {{ power: number, score: number }} me
 * @param {number} [minSample] 이보다 적으면 thin(흐리게)
 */
function lensOf(group, me, minSample = MIN_SAMPLE) {
  if (!group) return null;
  const power = standing(group.power, me.power);
  const item = standing(group.item, me.score);
  if (!power && !item) return null;
  const metric = power ? "power" : "item";
  const dist = distribution(metric === "power" ? group.power : group.item, metric === "power" ? me.power : me.score);
  const sample = (power || item).total;
  return {
    sample,
    thin: sample < minSample,
    power: power && { ...power, grade: gradeOf(power.top) },
    item: item && { ...item, grade: gradeOf(item.top) },
    dist: dist && { metric, ...dist }
  };
}

function median(sorted) {
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 내실 지수: 같은 직업 안에서 레벨대·템환산이 같은 무리의 전투력 중 내 자리와 중앙값과의 차이.
 * @param {Array<{ level: number, score: number, power: number }>} rows 같은 직업, 전투력이 그럴듯한 캐릭터
 * @param {{ level: number, score: number, power: number }} me
 * @param {number} pointScore 템환산 1점의 원점수(풀세트 최대 ÷ 100)
 */
function innerIndex(rows, me, pointScore) {
  if (!(me?.power > 0) || !(me.score > 0) || !(pointScore > 0)) return null;
  let pick = null;
  for (const { size, points } of INNER_TRIES) {
    const from = bandStart(me.level, size);
    const to = from + size - 1;
    const low = me.score - points * pointScore;
    const high = me.score + points * pointScore;
    const peers = rows
      .filter((row) => row.level >= from && row.level <= to && row.score >= low && row.score <= high)
      .map((row) => row.power)
      .sort((a, b) => a - b);
    pick = { size, points, from, to, low, high, peers };
    if (peers.length >= MIN_SAMPLE) break;
  }
  const level = { from: pick.from, to: pick.to };
  const score = { from: pick.low, to: pick.high, points: pick.points };
  if (pick.peers.length < MIN_INNER) return { sample: pick.peers.length, level, score, widened: pick.size !== 5, enough: false };
  const place = standing(pick.peers, me.power);
  const middle = median(pick.peers);
  return { ...place, grade: gradeOf(place.top), sample: place.total, median: middle, diff: me.power - middle, level, score, widened: pick.size !== 5, enough: true };
}

module.exports = { bandStart, countAbove, standing, gradeOf, niceStep, distribution, lensOf, innerIndex, MIN_SAMPLE };
