const test = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../src/game-data/gacha.json");

const load = () => import("../web/src/lib/gachaCalc.mjs");

test("스타코러스: 최대 대미지 1.2억은 1% → 평균 100번·세리온 500개, 9,000만 이상은 8%", async () => {
  const { starChorusOdds } = await load();
  const top = starChorusOdds(rules.starChorus, "maxDamage", 120000000);
  assert.ok(Math.abs(top.chance - 0.01) < 1e-12);
  assert.ok(Math.abs(top.resets - 100) < 1e-9);
  assert.ok(Math.abs(top.cerion - 500) < 1e-9);
  assert.ok(Math.abs(starChorusOdds(rules.starChorus, "maxDamage", 90000000).chance - 0.08) < 1e-12);
});

test("빛의 성소: 옵션·목표 이상 확률은 레벨 확률 합으로 나눈 값, 값 목록은 오름차순", async () => {
  const { sanctuaryOdds, sanctuaryValues } = await load();
  const level = rules.sanctuary.levels["1"];
  const values = sanctuaryValues(level, "물리 공격력");
  assert.equal(values[0], 1);
  assert.ok(values.every((value, i) => i === 0 || value > values[i - 1]));
  const all = sanctuaryOdds(level, "물리 공격력", 0);
  const top = sanctuaryOdds(level, "물리 공격력", values[values.length - 1]);
  assert.ok(all.chance > top.chance && top.chance > 0);
  assert.ok(Math.abs(top.tries - 1 / top.chance) < 1e-9);
});

test("자석펫: 같은 이름 항목은 합친다(원더 블랙 3.32 × 3 = 9.96%)", async () => {
  const { magnetPetOdds } = await load();
  const black = magnetPetOdds(rules.magnetPet, "원더 블랙");
  assert.ok(Math.abs(black.chance - 0.0996) < 1e-9);
  assert.ok(Math.abs(black.diamonds - black.draws * (2500 / 11)) < 1e-9);
});
