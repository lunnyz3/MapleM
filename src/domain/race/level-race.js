"use strict";

// 레벨 300 레이스(순수 함수): 레벨과 경험치 %를 한 값(레벨 단위, Lv.298 71.2% → 298.712)으로 보고 오늘·최근 24시간 증가,
// 최근 48시간 평균 속도, 다음 레벨·300 도달 예상 시각을 낸다. 시간대별 기록은 내보내지 않는다(접속 시간이 드러나지 않게).

const TARGET = 300;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const KST_MS = 9 * HOUR_MS;
const PACE_WINDOW_MS = 48 * HOUR_MS;
// 이보다 짧은 기록으로는 속도를 내지 않는다
const MIN_PACE_SPAN_MS = 3 * HOUR_MS;

/** 레벨 단위: 레벨 + 경험치 %/100 */
function levelUnits(level, rate) {
  return (Number(level) || 0) + Math.min(100, Math.max(0, Number(rate) || 0)) / 100;
}

/** 서울 기준 그날 0시(ms) */
function kstMidnight(now) {
  return Math.floor((now + KST_MS) / DAY_MS) * DAY_MS - KST_MS;
}

/** 시간 순 점들에서 t 이전 마지막 점의 레벨 단위(없으면 null) */
function unitsAt(sorted, t) {
  let found = null;
  for (const point of sorted) {
    if (point.t > t) break;
    found = point.u;
  }
  return found;
}

/**
 * 한 캐릭터의 지금 상태.
 * @param {Array<{ at: Date | string | number, level: number, expRate: number }>} points
 * @param {number} [now]
 * @returns {{ units: number, level: number, expRate: number, at: number, today: number, day: number, pace: number | null,
 *   nextLevel: number, nextAt: number | null, targetAt: number | null, remaining: number, dayAgo: number | null } | null}
 */
function racerState(points, now = Date.now(), target = TARGET) {
  const sorted = (points || [])
    .map((point) => ({ t: new Date(point.at).getTime(), u: levelUnits(point.level, point.expRate), level: Number(point.level) || 0, rate: Number(point.expRate) || 0 }))
    .filter((point) => Number.isFinite(point.t))
    .sort((a, b) => a.t - b.t);
  if (!sorted.length) return null;
  const last = sorted[sorted.length - 1];
  const gainSince = (from) => {
    const first = sorted.find((point) => point.t >= from);
    return first ? Math.max(0, last.u - first.u) : 0;
  };
  const recent = sorted.filter((point) => point.t >= now - PACE_WINDOW_MS);
  const span = recent.length >= 2 ? recent[recent.length - 1].t - recent[0].t : 0;
  const pace = span >= MIN_PACE_SPAN_MS ? (recent[recent.length - 1].u - recent[0].u) / (span / HOUR_MS) : null;
  const done = last.u >= target;
  const arrival = (goal) => (done || !(pace > 0) ? null : last.t + ((goal - last.u) / pace) * HOUR_MS);
  const nextLevel = Math.floor(last.u) + 1;
  return {
    units: last.u,
    level: last.level,
    expRate: last.rate,
    at: last.t,
    today: gainSince(kstMidnight(now)),
    day: gainSince(now - DAY_MS),
    pace,
    nextLevel,
    nextAt: arrival(nextLevel),
    targetAt: arrival(target),
    remaining: Math.max(0, target - last.u),
    dayAgo: unitsAt(sorted, now - DAY_MS)
  };
}

/**
 * 중계판: 레벨 단위 순, 24시간 전 순위와 비교한 변화, 오늘 가장 많이 오른 사람.
 * @param {Array<{ key: string }>} racers
 * @param {Map<string, Array<any>>} pointsByKey
 */
function raceBoard(racers, pointsByKey, now = Date.now(), target = TARGET) {
  const rows = racers.map((racer) => ({ ...racer, state: racerState(pointsByKey.get(racer.key) || [], now, target) })).filter((row) => row.state);
  rows.sort((a, b) => b.state.units - a.state.units);
  const before = rows
    .filter((row) => row.state.dayAgo !== null)
    .sort((a, b) => b.state.dayAgo - a.state.dayAgo)
    .map((row) => row.key);
  rows.forEach((row, index) => {
    row.rank = index + 1;
    const was = before.indexOf(row.key);
    row.rankChange = was >= 0 ? was + 1 - row.rank : null;
  });
  const fastest = rows.reduce((best, row) => (row.state.today > (best?.state.today || 0) ? row : best), null);
  return { rows, leader: rows[0] || null, fastest: fastest && fastest.state.today > 0 ? fastest.key : null };
}

module.exports = { levelUnits, kstMidnight, racerState, raceBoard, TARGET };
