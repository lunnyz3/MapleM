const test = require("node:test");
const assert = require("node:assert/strict");
const { reachShares } = require("../src/domain/stats/boss-reach");

test("보스 입장 가능 비율: 레벨·전투력이 되는 비율, 사냥 프리셋으로 잰 값은 분모에서도 뺀다", () => {
  const rows = [
    { characterLevel: 280, combatPower: 300 },
    { characterLevel: 280, combatPower: 150 },
    { characterLevel: 250, combatPower: 900 },
    { characterLevel: 280, combatPower: 5, hunting: true },
    { characterLevel: 0, combatPower: 500 }
  ];
  const bosses = [
    { name: "쉬움", difficulty: "노말", level: 200, power: 100 },
    { name: "레벨", difficulty: "하드", level: 260, power: 100 },
    { name: "어려움", difficulty: "하드", level: 200, power: 1000 }
  ];
  const result = reachShares(rows, (row) => !row.hunting, bosses);
  assert.equal(result.total, 3);
  assert.deepEqual(
    result.bosses.map((boss) => [boss.name, boss.count, boss.share]),
    [
      ["쉬움", 3, 1],
      ["레벨", 2, 0.6667],
      ["어려움", 0, 0]
    ]
  );
  assert.deepEqual(reachShares([], () => true, bosses).bosses[0], { name: "쉬움", difficulty: "노말", count: 0, share: 0 });
});
