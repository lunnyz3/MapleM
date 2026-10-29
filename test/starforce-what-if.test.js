const test = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../src/game-data/starforce-sets.json");

const load = () => import("../web/src/lib/starforceWhatIf.mjs");
const entry = { stars: { 35: { "마법 공격력": 81835, "물리 공격력": 34972 }, 36: { "마법 공격력": 83573, "물리 공격력": 35700 } } };

test("스타포스 바꿔 보기: 두 단계 모두 있는 기본 옵션 줄, 없으면 null", async () => {
  const { basicChange } = await load();
  assert.deepEqual(basicChange(entry, 35, 36).after, [{ name: "마법 공격력", value: "83573" }, { name: "물리 공격력", value: "35700" }]);
  assert.equal(basicChange(entry, 35, 30), null);
});

test("스타포스 세트: 합이 구간을 넘으면 그 구간 효과 차이, 합은 280에서 자른다", async () => {
  const { setChange, setOfItem, currentSetTotals } = await load();
  const arcane = rules.sets.find((set) => set.id === "arcane");
  assert.deepEqual(setChange(arcane, 280, 1, rules.cap), {}, "이미 최대 구간");
  const up = setChange(arcane, 254, 1, rules.cap);
  assert.ok(up.finalDamage > 0 && up.maxDamage > 0);
  assert.equal(setOfItem(rules, { itemName: "아케인셰이드 완드", slotName: "무기" }).id, "arcane");
  assert.equal(setOfItem(rules, { itemName: "제네시스 완드", slotName: "무기" }).id, "arcane");
  assert.equal(setOfItem(rules, { itemName: "거대한 공포", slotName: "귀고리" }), null);
  assert.deepEqual(currentSetTotals({ finalDamage: { breakdown: [{ group: "starforceSet", source: "아케인 280성", rawText: "스타포스 합 291 (구간 280 이상)" }] } }), { 아케인: 291 });
});
