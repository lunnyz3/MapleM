const test = require("node:test");
const assert = require("node:assert/strict");
const costs = require("../src/game-data/symbol-costs.json");

const load = () => import("../web/src/lib/bossForce.mjs");
const arcane = (level, growth = 0) => ({ symbolName: `아케인심볼 : 지역${level}`, symbolLevel: level, symbolGrowthValue: growth, symbolOption: `아케인포스 증가 ${(level + 2) * 10}, 물리 공격력 1,000` });

test("보스 포스: 심볼 옵션의 포스를 더하고, 옵션이 없으면 레벨로", async () => {
  const { symbolForce, totalForce } = await load();
  assert.equal(symbolForce(arcane(20), "arcane"), 220);
  assert.equal(symbolForce({ symbolLevel: 11, symbolOption: "어센틱포스 증가 110, 마법 공격력 3,000" }, "authentic"), 110);
  assert.equal(symbolForce({ symbolLevel: 5 }, "arcane"), 70);
  assert.equal(symbolForce({ symbolLevel: 4 }, "authentic"), 40);
  assert.equal(symbolForce({}, "arcane"), 0);
  assert.equal(totalForce([arcane(18), arcane(17)], "arcane"), 390);
});

test("보스 포스: 모자란 포스는 다음 레벨업 심볼이 적은 것부터, 모은 심볼은 빼고", async () => {
  const { forcePlan } = await load();
  const table = costs.arcane;
  // 지금 200 + 190 = 390, 목표 410 → 레벨업 두 번: 성장치 300 이 있는 18→19(707개)가 17→18(746개)보다 싸서 먼저, 그다음 17→18
  const plan = forcePlan([arcane(18, 300), { ...arcane(17), symbolName: "아케인심볼 : 낮은곳" }], "arcane", 410, table);
  assert.equal(plan.have, 390);
  assert.equal(plan.need, 20);
  assert.equal(plan.reachable, true);
  assert.deepEqual(
    plan.steps.map((step) => [step.name, step.from, step.to]),
    [
      ["아케인심볼 : 지역18", 18, 19],
      ["아케인심볼 : 낮은곳", 17, 18]
    ]
  );
  assert.equal(plan.symbols, table.symbols[16] + (table.symbols[17] - 300));
  assert.equal(plan.meso, table.meso[16] + table.meso[17]);
  const full = forcePlan([arcane(20)], "arcane", 300, table);
  assert.equal(full.reachable, false);
  assert.equal(full.steps.length, 0);
  assert.equal(forcePlan([arcane(20)], "arcane", 200, table).need, 0);
});
