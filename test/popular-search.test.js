const test = require("node:test");
const assert = require("node:assert/strict");
const { createVisitDeduper, kstDay } = require("../src/services/popular-search.service");

test("인기 검색: 같은 방문자가 같은 캐릭터를 한 시간 안에 다시 열면 한 번만 센다", () => {
  const firstVisit = createVisitDeduper();
  const at = (iso) => new Date(iso);
  assert.equal(firstVisit("1.1.1.1", "유니온", "피카츄", at("2026-10-29T01:05:00Z")), true);
  assert.equal(firstVisit("1.1.1.1", "유니온", "피카츄", at("2026-10-29T01:55:00Z")), false);
  assert.equal(firstVisit("2.2.2.2", "유니온", "피카츄", at("2026-10-29T01:55:00Z")), true, "다른 방문자");
  assert.equal(firstVisit("1.1.1.1", "스카니아", "피카츄", at("2026-10-29T01:55:00Z")), true, "다른 월드");
  assert.equal(firstVisit("1.1.1.1", "유니온", "피카츄", at("2026-10-29T02:00:00Z")), true, "다음 시간");
});

test("인기 검색: 기억할 키가 넘치면 지난 시간 키부터 비운다", () => {
  const firstVisit = createVisitDeduper({ maxKeys: 2 });
  firstVisit("a", "w", "1", new Date("2026-10-29T01:00:00Z"));
  firstVisit("a", "w", "2", new Date("2026-10-29T01:00:00Z"));
  assert.equal(firstVisit("a", "w", "3", new Date("2026-10-29T02:00:00Z")), true);
  assert.equal(firstVisit("a", "w", "3", new Date("2026-10-29T02:10:00Z")), false);
});

test("인기 검색: 날짜는 한국 시간 기준", () => {
  assert.equal(kstDay(new Date("2026-10-28T15:00:00Z")), "2026-10-29");
  assert.equal(kstDay(new Date("2026-10-28T14:59:59Z")), "2026-10-28");
});
