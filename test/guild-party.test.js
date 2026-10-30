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
