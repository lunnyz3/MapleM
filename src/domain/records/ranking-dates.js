"use strict";

// 공식 랭킹 1년 기록에 쓸 날짜: 넥슨 과거 랭킹이 있는 첫날, 그 뒤 매월 1일, 최근 3주(7일 간격), 어제.
// 오늘 랭킹은 새벽 집계 전에는 없을 수 있어 어제까지만 본다.
const RANKING_FLOOR = "2025-11-27";

function shiftDate(dateText, days) {
  const [year, month, day] = String(dateText).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** @param {string} today "YYYY-MM-DD"(서울) @returns {string[]} 오래된 날부터 */
function historyDates(today, floor = RANKING_FLOOR) {
  const last = shiftDate(today, -1);
  if (last < floor) return [];
  const dates = new Set([floor, last]);
  let [year, month] = floor.split("-").map(Number);
  for (;;) {
    month += 1;
    if (month > 12) {
      year += 1;
      month = 1;
    }
    const date = `${year}-${String(month).padStart(2, "0")}-01`;
    if (date > last) break;
    dates.add(date);
  }
  for (let week = 1; week <= 3; week += 1) {
    const date = shiftDate(last, -7 * week);
    if (date >= floor) dates.add(date);
  }
  return [...dates].sort();
}

module.exports = { historyDates, RANKING_FLOOR };
