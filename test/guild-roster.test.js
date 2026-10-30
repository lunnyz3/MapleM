const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeRoster } = require("../src/domain/guild/roster");

const at = (iso) => new Date(iso);

test("길드 들고 난 기록: 첫 목록은 기록 시작, 바뀌면 날짜별 들어옴·나감과 인원", () => {
  const first = mergeRoster(null, ["가", "나", "다", "-", ""], at("2026-10-30T03:00:00Z"));
  assert.deepEqual(first.members, ["가", "나", "다"]);
  assert.deepEqual(first.events, []);
  assert.deepEqual(first.counts, [{ date: "2026-10-30", count: 3 }]);
  const next = mergeRoster(first, ["가", "다", "라"], at("2026-10-31T03:00:00Z"));
  assert.deepEqual(next.events, [{ date: "2026-10-31", joined: ["라"], left: ["나"] }]);
  assert.deepEqual(next.counts.map((row) => [row.date, row.count]), [
    ["2026-10-30", 3],
    ["2026-10-31", 3]
  ]);
  assert.equal(next.changed, true);
  assert.equal(next.since.toISOString(), first.since.toISOString());
});

test("길드 들고 난 기록: 같은 날 들어왔다 나가면 지우고, 그날 줄은 하나로 합친다", () => {
  const base = mergeRoster(null, ["가", "나"], at("2026-10-30T01:00:00Z"));
  const morning = mergeRoster(base, ["가", "나", "다"], at("2026-10-31T01:00:00Z"));
  const noon = mergeRoster(morning, ["가", "나", "라"], at("2026-10-31T04:00:00Z"));
  assert.deepEqual(noon.events, [{ date: "2026-10-31", joined: ["라"], left: [] }]);
  const back = mergeRoster(noon, ["가", "나"], at("2026-10-31T06:00:00Z"));
  assert.deepEqual(back.events, []);
  const leftAndBack = mergeRoster(mergeRoster(base, ["가"], at("2026-11-01T01:00:00Z")), ["가", "나"], at("2026-11-01T05:00:00Z"));
  assert.deepEqual(leftAndBack.events, []);
  // 같은 날 같은 목록을 다시 보면 바뀐 것 없음
  assert.equal(mergeRoster(noon, ["가", "나", "라"], at("2026-10-31T09:00:00Z")).changed, false);
});
