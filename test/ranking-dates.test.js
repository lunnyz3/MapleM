const test = require("node:test");
const assert = require("node:assert/strict");
const { historyDates, weeklyDates } = require("../src/domain/records/ranking-dates");

test("공식 랭킹 1년 기록 날짜: 첫날, 매월 1일, 최근 3주, 어제", () => {
  const dates = historyDates("2026-10-30");
  assert.equal(dates[0], "2025-11-27");
  assert.equal(dates.at(-1), "2026-10-29");
  assert.ok(dates.includes("2025-12-01"));
  assert.ok(dates.includes("2026-10-01"));
  assert.ok(dates.includes("2026-10-22") && dates.includes("2026-10-15") && dates.includes("2026-10-08"));
  assert.equal(dates.length, 16);
  assert.deepEqual([...dates].sort(), dates);
  assert.deepEqual(historyDates("2025-11-27"), []);
  assert.deepEqual(historyDates("2025-11-29"), ["2025-11-27", "2025-11-28"]);
  // 1월 1일은 해를 넘긴다
  assert.ok(historyDates("2026-01-05").includes("2026-01-01"));
});

test("랭킹 컷 추이 날짜: 어제부터 7일 간격 12개, 첫날 이전은 뺀다", () => {
  const dates = weeklyDates("2026-10-30");
  assert.equal(dates.length, 12);
  assert.equal(dates.at(-1), "2026-10-29");
  assert.equal(dates[0], "2026-08-13");
  assert.deepEqual(weeklyDates("2025-12-10"), ["2025-12-02", "2025-12-09"]);
});
