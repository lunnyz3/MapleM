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

test("돌려 보기: 목표까지 횟수(기하분포), 그 안에 끝날 확률, 가중치 뽑기", async () => {
  const { triesUntil, luckOf, drawOne, sanctuaryEntries } = await import("../web/src/lib/gachaCalc.mjs");
  assert.equal(triesUntil(1), 1);
  assert.equal(triesUntil(0), Infinity);
  assert.equal(triesUntil(0.5, () => 0), 1, "random 0 이면 첫 번에");
  assert.equal(triesUntil(0.5, () => 0.8), 3, "1-0.8=0.2 → log0.2/log0.5 = 2.32 → 3");
  assert.equal(luckOf(0.5, 1), 0.5);
  assert.ok(Math.abs(luckOf(0.1, 10) - (1 - 0.9 ** 10)) < 1e-12);
  const entries = [{ id: "a", p: 1 }, { id: "b", p: 3 }];
  assert.equal(drawOne(entries, () => 0.2).id, "a");
  assert.equal(drawOne(entries, () => 0.3).id, "b");
  const flat = sanctuaryEntries({ 공격력: { rare: [["1%", 2], ["2%", 3]] }, 방어력: { normal: [["5", 5]] } });
  assert.deepEqual(flat.map((row) => [row.option, row.grade, row.value, row.p]), [["공격력", "rare", "1%", 2], ["공격력", "rare", "2%", 3], ["방어력", "normal", "5", 5]]);
});
