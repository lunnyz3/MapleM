const test = require("node:test");
const assert = require("node:assert/strict");
const sets = require("../src/game-data/starforce-sets.json");

const load = () => import("../web/src/lib/upgradePlan.mjs");
const dbEntry = { stars: { 22: { "물리 공격력": 30000 }, 23: { "물리 공격력": 32000 } } };
const totals = { attack: 100000, attackPercent: 100, damage: 50, boss: 100, finalDamage: 20, critical: 80, maxDamage: 1e9 };

test("스펙업 추천: 강화는 기본 옵션 차이와 세트 합 변화, 다음 단계가 없으면 가까운 위 단계, 표에 없으면 null", async () => {
  const { starUpTotals, nextKnownStar } = await load();
  const item = { itemName: "아케인셰이드 투핸드소드", slotName: "무기", starforceUpgrade: "22" };
  const up = starUpTotals({ totals, item, dbEntry, sets, setTotals: {}, attackType: "physical" });
  assert.equal(up.toStar, 23);
  assert.equal(up.totals.attack, 102000);
  // 세트 합이 구간을 넘으면 세트 효과도 오른다(아케인 254 → 255)
  const withSet = starUpTotals({ totals, item, dbEntry, sets, setTotals: { 아케인: 254 }, attackType: "physical" });
  assert.ok(withSet.totals.finalDamage > totals.finalDamage);
  const gappy = { stars: { 20: { "물리 공격력": 1 }, 22: { "물리 공격력": 3 } } };
  assert.equal(nextKnownStar(gappy, 20), 22);
  assert.equal(nextKnownStar(gappy, 22), null);
  assert.equal(nextKnownStar(gappy, 21), null);
  assert.equal(starUpTotals({ totals, item: { ...item, starforceUpgrade: "23" }, dbEntry, sets, setTotals: {}, attackType: "physical" }), null);
  assert.equal(starUpTotals({ totals, item, dbEntry: null, sets, setTotals: {}, attackType: "physical" }), null);
});

test("스펙업 추천: 교체는 두 장비의 옵션 차이, 오르는 것만 많이 오르는 순", async () => {
  const { swapUpTotals, rankPlans } = await load();
  const mine = { itemName: "커맨더 포스 이어링", slotName: "귀고리", basicOption: [{ name: "물리 공격력", value: "1000" }], potentialOption: [{ name: "보스 공격력", value: "20%" }] };
  const other = { itemName: "에스텔라 이어링", slotName: "귀고리", basicOption: [{ name: "물리 공격력", value: "1500" }], potentialOption: [{ name: "보스 공격력", value: "35%" }] };
  const next = swapUpTotals({ totals, item: mine, other, sets, setTotals: {}, attackType: "physical" });
  assert.equal(next.attack, 100500);
  assert.equal(next.boss, 115);
  const ranked = rankPlans([{ gain: 0.01 }, { gain: -0.02 }, { gain: 0.05 }, { gain: 0 }, { gain: Number.NaN }], 5);
  assert.deepEqual(
    ranked.map((plan) => plan.gain),
    [0.05, 0.01]
  );
});

test("스펙업 추천: 강화 비용은 강화 계산기와 같은 기댓값, 1회당 순으로도 줄 세운다", async () => {
  const { withStarCost, rankPlans } = await load();
  const { starforceExpectation } = await import("../web/src/lib/enhanceCalc.mjs");
  const rules = require("../src/game-data/enhance.json");
  const easy = withStarCost({ item: { starforceUpgrade: "0" }, toStar: 1, gain: 0.01 }, rules);
  assert.equal(easy.tries, 1);
  assert.equal(easy.destroyChance, 0);
  assert.equal(easy.perTry, 0.01);
  const hard = withStarCost({ item: { starforceUpgrade: "24" }, toStar: 25, gain: 0.05 }, rules);
  const expected = starforceExpectation(rules, 24, 25);
  assert.equal(hard.tries, expected.tries);
  assert.ok(hard.destroyChance > 0);
  assert.ok(Math.abs(hard.perTry - 0.05 / expected.tries) < 1e-12);
  assert.deepEqual(
    rankPlans([hard, easy], 10, "perTry").map((plan) => plan.toStar),
    [1, 25]
  );
  assert.deepEqual(
    rankPlans([easy, hard]).map((plan) => plan.toStar),
    [25, 1]
  );
});
