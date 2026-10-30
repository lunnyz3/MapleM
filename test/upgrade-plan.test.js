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

test("스펙업 추천: 다음 목표까지 장비마다 하나씩 곱해 쌓고, 남은 몫을 혼자 채우면 그중 가장 작은 것", async () => {
  const { planToTarget } = await load();
  const item = (fingerprint) => ({ fingerprint, slotName: fingerprint, itemName: fingerprint });
  const plans = [
    { kind: "star", item: item("무기"), gain: 0.03 },
    { kind: "swap", item: item("무기"), gain: 0.05 },
    { kind: "star", item: item("모자"), gain: 0.02 },
    { kind: "star", item: item("신발"), gain: 0.01 },
    { kind: "swap", item: item("장갑"), gain: Number.NaN }
  ];
  const result = planToTarget(plans, 0.06);
  assert.deepEqual(
    result.steps.map((step) => [step.item.fingerprint, step.kind]),
    [
      ["무기", "swap"],
      ["신발", "star"]
    ]
  );
  assert.ok(Math.abs(result.total - (1.05 * 1.01 - 1)) < 1e-12);
  assert.equal(result.reached, true);
  // 혼자 채우는 것 중 가장 작은 것: +1.5% 가 필요하면 무기(+5%)가 아니라 모자(+2%)
  assert.deepEqual(
    planToTarget(plans, 0.015).steps.map((step) => step.item.fingerprint),
    ["모자"]
  );
  const short = planToTarget(plans, 0.5);
  assert.equal(short.steps.length, 3);
  assert.equal(short.reached, false);
  assert.deepEqual(planToTarget([], 0.1), { steps: [], total: 0, reached: false });
  // 혼자 채우는 큰 교체(+59%)가 남은 몫의 세 배를 넘고 작은 것들로 채울 수 있으면 작은 것부터
  const big = [
    { kind: "swap", item: item("무기"), gain: 0.59 },
    { kind: "swap", item: item("반지"), gain: 0.05 },
    { kind: "star", item: item("모자"), gain: 0.03 },
    { kind: "star", item: item("신발"), gain: 0.02 }
  ];
  assert.deepEqual(
    planToTarget(big, 0.094).steps.map((step) => step.item.fingerprint),
    ["반지", "모자", "신발"]
  );
  // 작은 것들로 못 채우면 큰 것 하나
  assert.deepEqual(
    planToTarget(big, 0.2).steps.map((step) => step.item.fingerprint),
    ["무기"]
  );
});

test("스펙업 추천: 바꾸기 문구의 로/으로", async () => {
  const { withRo, swapText } = await load();
  assert.equal(withRo("커맨더 포스 이어링"), "커맨더 포스 이어링으로");
  assert.equal(withRo("창세의 뱃지"), "창세의 뱃지로");
  assert.equal(withRo("고귀한 이피아의 반지 ★7"), "고귀한 이피아의 반지 ★7로");
  assert.equal(withRo("★30"), "★30으로");
  assert.equal(withRo("아케인셰이드 투핸드소드 ★23"), "아케인셰이드 투핸드소드 ★23으로");
  assert.equal(withRo("데스페라도 ★35"), "데스페라도 ★35로");
  assert.equal(withRo("벨트"), "벨트로");
  assert.equal(withRo("반지 ★1"), "반지 ★1로");
  assert.equal(withRo("파풀라투스 마크"), "파풀라투스 마크로");
  assert.equal(withRo("마이스터 링"), "마이스터 링으로");
  assert.equal(withRo("골드 클로버 벨트"), "골드 클로버 벨트로");
  assert.equal(withRo("칠흑의 보스 세트 펜던트"), "칠흑의 보스 세트 펜던트로");
  assert.equal(swapText({ itemName: "커맨더 포스 이어링", starforceUpgrade: "0" }), "커맨더 포스 이어링으로 바꾸기");
  assert.equal(swapText({ itemName: "제네시스 피스톨", starforceUpgrade: "35" }), "제네시스 피스톨 ★35로 바꾸기");
});
