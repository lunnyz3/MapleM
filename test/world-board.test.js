const test = require("node:test");
const assert = require("node:assert/strict");
const { worldBoard } = require("../src/domain/stats/world-board");


test("월드 대항전: 상위 100명 평균 순위, 많은 직업 셋, 1위", () => {
  const top = (base, cls) => Array.from({ length: 120 }, (_, i) => ({ combatPower: base - i, itemScore: 500, characterName: `n${i}`, characterClass: i % 3 ? cls : "비숍" }));
  const board = worldBoard([
    { world: "루나", count: 1000, cut1000: 1234, top: top(5000, "렌") },
    { world: "스카니아", count: 2000, top: top(9000, "아델") },
    { world: "빈월드", count: 0, top: [] },
    { world: "적은월드", count: 5, top: top(99999, "렌").slice(0, 5) }
  ]);
  assert.deepEqual(
    board.map((entry) => [entry.world, entry.rank]),
    [
      ["스카니아", 1],
      ["루나", 2]
    ]
  );
  assert.equal(board[0].best.name, "n0");
  assert.equal(board[0].popular[0].className, "아델");
  assert.equal(board[0].itemScore, 500);
  assert.deepEqual(board[1].cuts, [
    { rank: 10, power: 4991 },
    { rank: 100, power: 4901 },
    { rank: 1000, power: 1234 }
  ]);
  assert.equal(board[0].cuts[2].power, 0);
});
