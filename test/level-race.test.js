const test = require("node:test");
const assert = require("node:assert/strict");
const { levelUnits, kstMidnight, racerState, raceBoard } = require("../src/domain/race/level-race");
const { climbers, topClass } = require("../src/domain/race/climbers");

const HOUR = 60 * 60 * 1000;
// 2026-11-02 12:00 KST
const NOW = Date.parse("2026-11-02T03:00:00Z");

test("레벨 레이스: 레벨 단위와 서울 0시", () => {
  assert.equal(levelUnits(298, 71.2), 298.712);
  assert.equal(levelUnits(298, 150), 299);
  assert.equal(new Date(kstMidnight(NOW)).toISOString(), "2026-11-01T15:00:00.000Z");
});

test("레벨 레이스: 오늘 증가·48시간 속도·다음 레벨과 300 예상, 기록이 짧으면 속도 없음", () => {
  // 48시간 동안 4시간마다 2%씩(시간당 0.5%)
  const points = Array.from({ length: 13 }, (_, i) => ({ at: NOW - (48 - i * 4) * HOUR, level: 298, expRate: 40 + i * 2 }));
  const state = racerState(points, NOW);
  assert.equal(state.level, 298);
  assert.equal(state.expRate, 64);
  assert.ok(Math.abs(state.pace - 0.005) < 1e-9);
  // 오늘(서울 0시~12시): 0시 정각 점(58%)부터 지금(64%)까지 → 6%
  assert.ok(Math.abs(state.today - 0.06) < 1e-9);
  assert.ok(Math.abs(state.day - 0.12) < 1e-9);
  // 남은 36% → 72시간 뒤 Lv.299, 300까지 1.36 → 272시간
  assert.equal(state.nextLevel, 299);
  assert.equal(Math.round((state.nextAt - NOW) / HOUR), 72);
  assert.equal(Math.round((state.targetAt - NOW) / HOUR), 272);
  assert.ok(Math.abs(state.remaining - 1.36) < 1e-9);
  const short = racerState([{ at: NOW - HOUR, level: 298, expRate: 60 }, { at: NOW, level: 298, expRate: 61 }], NOW);
  assert.equal(short.pace, null);
  assert.equal(short.nextAt, null);
  assert.equal(racerState([], NOW), null);
});

test("레벨 레이스: 순위·24시간 전 대비 변화·오늘 가장 빠른 사람", () => {
  const series = (start, perHour) => Array.from({ length: 25 }, (_, i) => ({ at: NOW - (24 - i) * HOUR, level: 298, expRate: start + perHour * i }));
  const pointsByKey = new Map([
    ["a", series(70, 0.1)],
    ["b", series(65, 0.5)],
    ["c", series(10, 0)]
  ]);
  const board = raceBoard(
    [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }],
    pointsByKey,
    NOW
  );
  assert.deepEqual(
    board.rows.map((row) => row.key),
    ["b", "a", "c"]
  );
  assert.equal(board.leader.key, "b");
  assert.equal(board.rows[0].rankChange, 1);
  assert.equal(board.rows[1].rankChange, -1);
  assert.equal(board.fastest, "b");
});

test("이번 주 오른 사람: 순위 계단·값 오름폭, 새로 1만 위 안, 많은 직업", () => {
  const now = [
    { ranking: 1, world_name: "루나", character_name: "가", character_class: "렌", character_level: 298 },
    { ranking: 2, world_name: "루나", character_name: "나", character_class: "렌", character_level: 297 },
    { ranking: 3, world_name: "스카니아", character_name: "다", character_class: "히어로", character_level: 297 },
    { ranking: 4, world_name: "스카니아", character_name: "새", character_class: "렌", character_level: 296 }
  ];
  const before = [
    { ranking: 1, world_name: "루나", character_name: "가", character_level: 298 },
    { ranking: 9, world_name: "루나", character_name: "나", character_level: 296 },
    { ranking: 2, world_name: "스카니아", character_name: "다", character_level: 297 }
  ];
  const byRank = climbers(now, before, (row) => row.character_level, "rank");
  assert.deepEqual(
    byRank.rows.map((entry) => [entry.row.character_name, entry.climb, entry.gain]),
    [["나", 7, 1]]
  );
  assert.deepEqual(
    byRank.fresh.map((entry) => entry.row.character_name),
    ["새"]
  );
  const byValue = climbers(now, before, (row) => row.character_level, "value");
  assert.deepEqual(
    byValue.rows.map((entry) => entry.row.character_name),
    ["나"]
  );
  assert.deepEqual(topClass([...byRank.rows, ...byRank.fresh]), { className: "렌", count: 2 });
  assert.equal(topClass([{ row: { character_name: "업적" } }]), null);
});
