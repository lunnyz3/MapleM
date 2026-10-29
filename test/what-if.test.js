const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../web/src/lib/whatIf.mjs");

test("옵션 이름 → 스탯: 내 공격 타입만, % 공격력과 수치 공격력을 나눈다", async () => {
  const { optionStat } = await load();
  assert.deepEqual(optionStat("마법 대미지", "19.26%", "magical"), { key: "damage", value: 19.26 });
  assert.equal(optionStat("물리 대미지", "19.26%", "magical"), null);
  assert.deepEqual(optionStat("물리공격력", "1,907", "physical"), { key: "attack", value: 1907 });
  assert.deepEqual(optionStat("물리 공격력", "12%", "physical"), { key: "attackPercent", value: 12 });
  assert.deepEqual(optionStat("최종 대미지 증가", "6%", "physical"), { key: "finalDamage", value: 6 });
  assert.deepEqual(optionStat("보스 공격력", "40%", "physical"), { key: "boss", value: 40 });
  assert.equal(optionStat("방어율 무시", "40%", "physical"), null);
  assert.equal(optionStat("최대 HP", "1,000", "physical"), null);
});

test("줄 바꾸기: 원래 값을 빼고 새 값을 더한다", async () => {
  const { applyLineChanges } = await load();
  const totals = { damage: 500, boss: 400 };
  const next = applyLineChanges(
    totals,
    [{ name: "마법 대미지", value: "19.26%" }, { name: "최대 HP", value: "1,000" }],
    [{ name: "보스 공격력", value: "40%" }, { name: "마법 대미지", value: "10%" }],
    "magical"
  );
  assert.ok(Math.abs(next.damage - 490.74) < 1e-9);
  assert.equal(next.boss, 440);
  assert.deepEqual(totals, { damage: 500, boss: 400 });
});
