const test = require("node:test");
const assert = require("node:assert/strict");
const hexa = require("../src/game-data/hexa.json");
const symbols = require("../src/game-data/symbol-costs.json");

const load = () => import("../web/src/lib/hexaCalc.mjs");

test("코어 비용 합계: 0→30 합이 표 합계와 같고, 구간 합은 그 구간만 더한다", async () => {
  const { sumRange } = await load();
  const origin = hexa.cores["오리진 코어"];
  assert.equal(sumRange(origin.energy, 0, 30), 254);
  assert.equal(sumRange(origin.fragments, 0, 30), 6725);
  assert.equal(sumRange(hexa.cores["마스터리 코어"].fragments, 0, 30), 3285);
  // Lv.29→30 하나만
  assert.equal(sumRange(origin.fragments, 29, 30), 500);
  assert.equal(sumRange(origin.fragments, 30, 10), 0);
});

test("소요일: 하루 평균 = 일일 + 주간 ÷ 7, 올림", async () => {
  const { daysFor } = await load();
  assert.equal(daysFor(6725, 200, 1000), Math.ceil(6725 / (200 + 1000 / 7)));
  assert.equal(daysFor(0, 200, 1000), 0);
  assert.equal(daysFor(10, 0, 0), Infinity);
});

test("HEXA 스탯: 목표 1은 메인이 한 번만 오르면 되므로 거의 확실하고, 목표가 높을수록 기대 조각이 커진다", async () => {
  const { hexaStatExpectation } = await load();
  const easy = hexaStatExpectation(hexa.stat, { target: 1 });
  assert.ok(easy.freshChance > 0.99, `chance ${easy.freshChance}`);
  const nine = hexaStatExpectation(hexa.stat, { target: 9 });
  const ten = hexaStatExpectation(hexa.stat, { target: 10 });
  assert.ok(nine.freshChance > ten.freshChance);
  assert.ok(ten.expectedFragments > nine.expectedFragments);
  // 기대 조각 = 한 판 기대 조각 ÷ 한 판 성공 확률(처음부터 시작할 때)
  assert.ok(Math.abs(ten.expectedFragments - ten.freshFragments / ten.freshChance) < 1e-6);
});

test("HEXA 스탯: 이벤트(메인 5~9 확률 ×1.2)면 성공 확률이 오른다", async () => {
  const { hexaStatExpectation } = await load();
  const normal = hexaStatExpectation(hexa.stat, { target: 8 });
  const boosted = hexaStatExpectation(hexa.stat, { target: 8, event: true });
  assert.ok(boosted.freshChance > normal.freshChance);
});

test("HEXA 스탯: 이미 목표에 닿았으면 0, 닿을 수 없으면 이번 판 확률 0", async () => {
  const { hexaStatExpectation } = await load();
  const done = hexaStatExpectation(hexa.stat, { target: 5, start: [5, 3, 2] });
  assert.equal(done.runChance, 1);
  assert.equal(done.expectedFragments, 0);
  const stuck = hexaStatExpectation(hexa.stat, { target: 10, start: [2, 9, 9] });
  assert.equal(stuck.runChance, 0);
  assert.ok(stuck.expectedResets >= 1);
});

test("심볼: 성장치를 빼고 레벨 구간의 심볼·메소를 더한다", async () => {
  const { symbolCost } = await load();
  const full = symbolCost(symbols.arcane, 1, 20);
  assert.equal(full.symbols, symbols.arcane.symbols.reduce((a, b) => a + b, 0));
  const part = symbolCost(symbols.authentic, 3, 5, 30);
  assert.equal(part.symbols, 99 + 172 - 30);
  assert.equal(part.meso, 73500000 + 148000000);
});
