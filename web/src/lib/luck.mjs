// 장비 운빨 지수(순수 함수): 장비마다 잠재·에디·추옵이 지금만큼 좋게 나올 확률(상위 %, 0~1)을 모아
// 점수 = Σ −log10(확률)(확률 1/10 = 1점, 1/1,000 = 3점). 분포표(src/game-data/luck.json)로 상위 %를 낸다.

const FLOOR = 1e-12;

/** 한 장비의 점수. @param {{ potential?: number | null, additional?: number | null, flame?: number | null } | null} chances */
export function itemLuck(chances) {
  const parts = {};
  let points = 0;
  let sections = 0;
  for (const key of ["potential", "additional", "flame"]) {
    const p = Number(chances?.[key]);
    if (!(p > 0)) continue;
    const value = -Math.log10(Math.min(1, Math.max(p, FLOOR)));
    parts[key] = value;
    points += value;
    sections += 1;
  }
  return { points, sections, parts };
}

/**
 * 분위표(quantiles[i] = 하위 i% 지점의 점수, 0~100)에서 이 점수보다 높은 캐릭터 비율(0~1).
 * @param {number} score @param {number[]} quantiles
 */
export function topShare(score, quantiles) {
  if (!Array.isArray(quantiles) || quantiles.length < 2) return null;
  const last = quantiles.length - 1;
  if (score >= quantiles[last]) return 0;
  if (score < quantiles[0]) return 1;
  let below = 0;
  for (let index = 0; index < last; index += 1) {
    const low = quantiles[index];
    const high = quantiles[index + 1];
    if (score >= high) continue;
    const within = high > low ? (score - low) / (high - low) : 1;
    below = (index + within) / last;
    break;
  }
  return Math.min(1, Math.max(0, 1 - below));
}

/** 전투력이 들어가는 구간. @param {Array<{ min: number, max: number | null }>} bands @param {number} power */
export function bandOf(bands, power) {
  return (bands || []).find((band) => power >= band.min && (band.max === null || power < band.max)) || null;
}

/** 점수 목록 → 0~100% 분위표(101개, 소수 둘째 자리). @param {number[]} scores */
export function quantilesOf(scores) {
  const sorted = [...scores].sort((a, b) => a - b);
  if (!sorted.length) return [];
  return Array.from(
    { length: 101 },
    (_, index) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor((index / 100) * (sorted.length - 1)))] * 100) / 100
  );
}
