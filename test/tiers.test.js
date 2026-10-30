const test = require("node:test");
const assert = require("node:assert/strict");
const { classRatios, tierList, worldBoard } = require("../src/domain/stats/tiers");
const { peerKey } = require("../src/domain/stats/game-pool");

const rows = (n, base) => Array.from({ length: n }, (_, i) => ({ combatPower: base - i, characterName: `c${i}`, worldName: "스카니아" }));

test("직업 티어(전투력): 상위 100명 평균 순으로 S~D, 20명 아래 직업은 뺀다", () => {
  const groups = Array.from({ length: 10 }, (_, k) => ({ className: `직업${k}`, count: 150, top: rows(150, 1000 * (k + 1)) }));
  groups.push({ className: "적은직업", count: 5, top: rows(5, 999999) });
  const tiers = tierList(groups);
  assert.equal(tiers[0].tier, "S");
  assert.equal(tiers[0].classes[0].className, "직업9");
  assert.equal(tiers[0].classes[0].average, Math.round(10000 - 99 / 2));
  assert.equal(tiers.flatMap((tier) => tier.classes).length, 10);
  assert.ok(!tiers.some((tier) => tier.classes.some((row) => row.className === "적은직업")));
  assert.equal(tiers.at(-1).tier, "D");
  assert.equal(tiers[0].classes[0].best.name, "c0");
  assert.equal(tierList([]).length, 0);
});

test("직업 티어(같은 템 대비): 비율 순, 비율을 낸 인원이 20명 아래면 뺀다", () => {
  const groups = [
    { className: "가", count: 100, gear: { ratio: 0.95, count: 80 }, top: rows(100, 9000) },
    { className: "나", count: 100, gear: { ratio: 1.12, count: 80 }, top: rows(100, 1000) },
    { className: "다", count: 100, gear: { ratio: 1.5, count: 3 }, top: rows(100, 5000) },
    { className: "라", count: 100, gear: null, top: rows(100, 5000) }
  ];
  const all = tierList(groups, "gear").flatMap((tier) => tier.classes);
  assert.deepEqual(
    all.map((row) => [row.className, row.gear]),
    [
      ["나", 1.12],
      ["가", 0.95]
    ]
  );
});

test("같은 템 대비 비율: 직업마다 중앙값, 전체와 월드별, 0.3배 아래·3배 위는 뺀다", () => {
  const base = { itemScore: 1000, characterLevel: 280 };
  const medians = new Map([[peerKey(base), 100]]);
  const sample = [
    { ...base, characterClass: "칼리", worldName: "루나", combatPower: 120 },
    { ...base, characterClass: "칼리", worldName: "루나", combatPower: 110 },
    { ...base, characterClass: "칼리", worldName: "스카니아", combatPower: 130 },
    { ...base, characterClass: "칼리", worldName: "스카니아", combatPower: 10 },
    { ...base, characterClass: "렌", worldName: "루나", combatPower: 90 },
    { ...base, characterClass: "렌", worldName: "루나", combatPower: 900 },
    { itemScore: 0, characterLevel: 280, characterClass: "렌", worldName: "루나", combatPower: 90 }
  ];
  const result = classRatios(sample, medians);
  assert.deepEqual(result[""].칼리, { ratio: 1.2, count: 3 });
  assert.deepEqual(result[""].렌, { ratio: 0.9, count: 1 });
  assert.deepEqual(result.루나.칼리, { ratio: 1.15, count: 2 });
  assert.deepEqual(result.스카니아.칼리, { ratio: 1.3, count: 1 });
});

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
