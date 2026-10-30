const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../web/src/lib/guildParty.mjs");
const member = (name, power, level = 280) => ({ name, power, level });

test("길드 보스 파티: 레벨·전투력으로 입장 가능, 모자람, 모름을 나눈다", async () => {
  const { bossRoster } = await load();
  const boss = { level: 260, power: 100, recommend: { power: 200 } };
  const roster = bossRoster([member("a", 150), member("b", 250), member("c", 300, 250), member("d", 50), member("e", 0)], boss);
  assert.deepEqual(
    roster.ready.map((row) => [row.name, row.recommended]),
    [
      ["b", true],
      ["a", false]
    ]
  );
  assert.deepEqual(
    roster.short.map((row) => row.name),
    ["c", "d"]
  );
  assert.deepEqual(
    roster.unknown.map((row) => row.name),
    ["e"]
  );
});

test("길드 보스 파티: 강한 순은 6명씩, 고르게는 인원 차이 1명 안에서 전투력 합을 맞춘다", async () => {
  const { splitParties } = await load();
  const members = Array.from({ length: 8 }, (_, i) => member(`m${i}`, 100 - i * 10));
  assert.deepEqual(
    splitParties(members, 6, "strong").map((party) => party.length),
    [6, 2]
  );
  const even = splitParties(members, 6, "even");
  assert.deepEqual(
    even.map((party) => party.length),
    [4, 4]
  );
  const totals = even.map((party) => party.reduce((sum, row) => sum + row.power, 0));
  assert.ok(Math.abs(totals[0] - totals[1]) <= 20, `totals ${totals}`);
  assert.equal(even.flat().length, 8);
  assert.deepEqual(splitParties([], 6, "even"), []);
  assert.deepEqual(
    splitParties(members.slice(0, 3), 6, "even").map((party) => party.length),
    [3]
  );
});

test("길드 보스 파티: 기본 보스는 6명 이상 가는 가장 어려운 보스", async () => {
  const { defaultBoss } = await load();
  const bosses = [
    { name: "쉬움", level: 200, power: 10 },
    { name: "보통", level: 200, power: 100 },
    { name: "어려움", level: 200, power: 1000 }
  ];
  const six = Array.from({ length: 6 }, (_, i) => member(`s${i}`, 150));
  assert.equal(defaultBoss([...six, member("top", 2000)], bosses), 1);
  assert.equal(defaultBoss([member("top", 2000)], bosses), 2);
  assert.equal(defaultBoss([member("x", 1)], bosses), -1);
});

test("길드 비교 요약: 평균 레벨·전투력 합·상위 10명 평균·1위·직업 다섯·보스 입장 인원", async () => {
  const { guildSummary } = await load();
  const members = [
    { name: "a", level: 290, power: 300, itemScore: 1000, className: "렌" },
    { name: "b", level: 280, power: 100, itemScore: 0, className: "렌" },
    { name: "c", level: 270, power: 0, className: "비숍" },
    { name: "d", level: 0, power: 0, className: "" }
  ];
  const summary = guildSummary(members, [{ name: "보스", difficulty: "하드", level: 280, power: 200 }]);
  assert.equal(summary.count, 4);
  assert.equal(summary.known, 2);
  assert.equal(summary.avgLevel, 280);
  assert.equal(summary.powerSum, 400);
  assert.equal(summary.top10, 200);
  assert.equal(summary.best.name, "a");
  assert.equal(summary.avgItemScore, 1000);
  assert.deepEqual(summary.classes, [
    { className: "렌", count: 2 },
    { className: "비숍", count: 1 }
  ]);
  assert.equal(summary.bosses[0].count, 1);
  assert.equal(guildSummary([], []).best, null);
});
