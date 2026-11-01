const test = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../src/game-data/enhance.json");

const load = () => import("../web/src/lib/enhanceCalc.mjs");
const eok = (meso) => Math.round((meso / 1e8) * 100) / 100;

test("문장: 증표 80만·Lv.10 437.2억, 증표 100만·Lv.5 277.38억", async () => {
  const { emblemCost } = await load();
  const ten = emblemCost(rules, { markPriceMan: 80, krwPerEok: 650, lv1PriceEok: 250, targetLevel: 10 });
  assert.equal(eok(ten.total), 437.2);
  assert.equal(ten.cash, Math.round((ten.total / 1e8) * 650));
  const five = emblemCost(rules, { markPriceMan: 100, krwPerEok: 650, lv1PriceEok: 250, targetLevel: 5 });
  assert.equal(eok(five.total), 277.38);
  assert.equal(five.steps.filter((step) => step.counted).length, 4);
});

test("전수: 200제 가성비 238장·21.38억, 스타포스만 175장·15.75억", async () => {
  const { transferCost } = await load();
  const value = transferCost(rules, { receiver: "200", starforce: 20, potential: ["에픽", 3], additionalPotential: ["에픽", 2], additional: ["에픽", 2], greatSoul: false });
  assert.equal(value.scrolls, 238);
  assert.equal(eok(value.meso), 21.38);
  const star = transferCost(rules, { receiver: "200", starforce: 35, potential: null, additionalPotential: null, additional: null, greatSoul: false });
  assert.equal(star.scrolls, 175);
  assert.equal(eok(star.meso), 15.75);
});

test("길드 어빌리티: 30명 전체 MAX → 82,750 EXP, 1인당 골드 20·블랙 66, 19,900 GP", async () => {
  const { guildAbilityCost } = await load();
  const levels = {};
  for (const tier of rules.guildAbility.tiers) for (const skill of tier.skills) levels[`${tier.tier}|${skill.name}`] = { current: 1, target: skill.exp.length + 1 };
  const result = guildAbilityCost(rules, levels, 30);
  assert.equal(result.exp, 82750);
  assert.equal(result.goldPer, 20);
  assert.equal(result.blackPer, 66);
  assert.equal(result.gpPer, 19900);
  assert.equal(result.gpTotal, 597000);
  assert.ok(result.buffs.some((buff) => buff.stat === "최종 대미지"));
});

test("장신구 연마: 1회 비용은 MVP 할인 뒤 내림, 기대 메소 = 비용 ÷ 확률, 누적", async () => {
  const { polishTable } = await load();
  const rows = polishTable(rules, "other", 0.05);
  assert.equal(rows.length, 10);
  assert.equal(rows[0].cost, Math.floor(4800000 * 0.95));
  assert.ok(Math.abs(rows[0].meso - rows[0].cost / 0.7) < 1e-6);
  assert.ok(Math.abs(rows[9].mesoSum - rows.reduce((sum, row) => sum + row.meso, 0)) < 1e-3);
  assert.equal(polishTable(rules, "belt").length, 15);
});

test("스타포스: 방지를 모두 켜면 기대 횟수 = 단계마다 1/성공률 합, 파괴 0", async () => {
  const { starforceExpectation, starforceOdds } = await load();
  const options = { lucky: 0, protectDrop: true, protectDestroy: true };
  let sum = 0;
  for (let star = 30; star < 35; star += 1) sum += 100 / starforceOdds(rules, star, options).success;
  const result = starforceExpectation(rules, 30, 35, options);
  assert.ok(Math.abs(result.tries - sum) < 1e-6, `${result.tries} vs ${sum}`);
  assert.equal(result.destroyChance, 0);
  // 20성 이상은 공식 표 그대로 성공 6·유지 74·하락 15·파괴 5
  assert.deepEqual(starforceOdds(rules, 25, {}), { success: 6, stay: 74, drop: 15, destroy: 5 });
  // 럭키데이 +10%p: 남는 84%를 유지·하락·파괴 74:15:5 비율로
  const lucky = starforceOdds(rules, 25, { lucky: 10 });
  assert.equal(lucky.success, 16);
  assert.ok(Math.abs(lucky.destroy - (5 * 84) / 94) < 1e-9);
});

test("스타포스: 2026-07-30 공식 확률표(스타캐치 삭제) — 15성까지 파괴 0%, 16성 15·65·15·5", async () => {
  const { starforceOdds } = await load();
  // 패치노트 '장비 강화 15성까지 파괴 확률이 0%로 변경, 삭제된 파괴 확률만큼 유지 확률 증가'
  for (let star = 0; star < 15; star += 1) assert.equal(starforceOdds(rules, star, {}).destroy, 0, `${star}→${star + 1}`);
  assert.deepEqual(starforceOdds(rules, 10, {}), { success: 40, stay: 45, drop: 15, destroy: 0 });
  assert.deepEqual(starforceOdds(rules, 14, {}), { success: 20, stay: 65, drop: 15, destroy: 0 });
  assert.deepEqual(starforceOdds(rules, 15, {}), { success: 15, stay: 65, drop: 15, destroy: 5 });
  assert.deepEqual(starforceOdds(rules, 0, {}), { success: 100, stay: 0, drop: 0, destroy: 0 });
  assert.equal(Object.keys(rules.starforce.rates).length, 36);
  for (const [key, row] of Object.entries(rules.starforce.rates)) assert.equal(row.reduce((a, b) => a + b, 0), 100, `키 ${key} 합`);
});

test("스타포스: 하락·파괴가 있으면 기대 횟수가 늘고 파괴 확률이 생긴다, 시뮬레이션은 같은 규칙", async () => {
  const { starforceExpectation, simulateStarforce } = await load();
  const safe = starforceExpectation(rules, 15, 20, { protectDrop: true, protectDestroy: true });
  const dropping = starforceExpectation(rules, 15, 20, { protectDestroy: true });
  const risky = starforceExpectation(rules, 15, 20, {});
  assert.ok(dropping.tries > safe.tries, "하락이 있으면 더 오래 걸린다");
  assert.equal(dropping.destroyChance, 0);
  assert.ok(risky.destroyChance > 0 && risky.destroyChance < 1);
  assert.ok(risky.tries > 0);
  // 15성까지는 파괴가 없다
  assert.equal(starforceExpectation(rules, 0, 15, {}).destroyChance, 0);
  // 무작위 수를 고정하면 결과가 정해진다: 항상 0 → 매번 성공
  const lucky = simulateStarforce(rules, 10, 15, { protectDrop: true, protectDestroy: true }, () => 0);
  assert.deepEqual(lucky, { star: 15, tries: 5, destroyed: false, drops: 0, dropProtections: 5, destroyProtections: 5 });
  // 항상 0.9999 → 파괴 칸(방지 없음, 16성부터)
  const broken = simulateStarforce(rules, 16, 20, {}, () => 0.9999);
  assert.equal(broken.destroyed, true);
  // 12→15 는 파괴가 없어 같은 수에서 하락만 한다
  assert.equal(simulateStarforce(rules, 12, 15, {}, () => 0.9999, 50).destroyed, false);
});

test("스타포스: 장신구(최대 10성)는 연마 표 확률, 실패하면 유지", async () => {
  const { starforceOdds } = await load();
  assert.deepEqual(starforceOdds(rules, 0, { accessory: true, lucky: 10 }), { success: 70, stay: 30, drop: 0, destroy: 0 });
});

test("장신구 연마 돌려 보기: 성공할 때까지 시도, 내 운은 같은 목표를 돌려 재료를 덜 쓴 비율", async () => {
  const { simulatePolish, polishLuck } = await load();
  const always = () => 0;
  assert.deepEqual(simulatePolish(rules, "badge", 0, 3, 0, always), { tries: 3, material: 3, meso: 4800000 + 6720000 + 9408000 });
  // 미트라(기타)는 Lv.5부터 2개
  assert.equal(simulatePolish(rules, "other", 4, 6, 0, always).material, 1 + 2);
  assert.equal(rules.polish.tracks.badge.probability.length, 10);
  assert.equal(polishLuck(rules, "badge", 0, 1, 1, 200, always), 1, "한 번에 성공하면 모두 1개");
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lucky = polishLuck(rules, "badge", 0, 10, 60, 500, random);
  const unlucky = polishLuck(rules, "badge", 0, 10, 600, 500, random);
  assert.ok(lucky < 0.2 && unlucky > 0.9, `${lucky} ${unlucky}`);
});
