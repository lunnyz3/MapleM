const test = require("node:test");
const assert = require("node:assert/strict");
const itemRules = require("../src/game-data/item-sets.json");
const starforceRules = require("../src/game-data/starforce-sets.json");

const load = () => import("../web/src/lib/setCompare.mjs");

test("세트 비교: 개수는 그 개수 이하 가장 큰 단계, 스타포스 합은 구간 효과를 더한다", async () => {
  const { setChoices, sideStats, compareStats } = await load();
  const choices = setChoices(itemRules, starforceRules);
  assert.equal(choices[0].label, "아케인");
  assert.equal(choices.find((choice) => choice.id === "level160-legendary").label, "160레벨(레전더리)");
  const arcane = itemRules.sets.find((set) => set.id === "arcane");
  const seven = sideStats(choices, { arcane: { count: 7, stars: 0 } }, starforceRules.cap);
  assert.deepEqual(seven, arcane.tiers.find((tier) => tier.count === 7).stats);
  const withStars = sideStats(choices, { arcane: { count: 7, stars: 300 } }, starforceRules.cap);
  const top = starforceRules.sets.find((set) => set.id === "arcane").tiers.at(-1).stats;
  assert.equal(withStars.finalDamage, (seven.finalDamage || 0) + (top.finalDamage || 0), "합은 280에서 자른다");

  const before = sideStats(choices, { arcane: { count: 5, stars: 150 }, absolab: { count: 2, stars: 60 } }, starforceRules.cap);
  const after = sideStats(choices, { arcane: { count: 7, stars: 210 } }, starforceRules.cap);
  const rows = compareStats(before, after);
  assert.ok(rows.find((row) => row.key === "finalDamage").diff > 0);
  assert.ok(rows.every((row) => row.before || row.after));
});

test("세트 비교: 캐릭터 스탯 내역에서 지금 세트 개수와 스타포스 합을 읽는다", async () => {
  const { setChoices, sideFromStats } = await load();
  const choices = setChoices(itemRules, starforceRules);
  const majorStats = {
    finalDamage: {
      breakdown: [
        { group: "setEffect", source: "아케인 7세트", rawText: "7세트 효과" },
        { group: "setEffect", source: "칠흑 7세트", rawText: "7세트 효과" },
        { group: "setEffect", source: "군단장 전리품 세트 3세트", rawText: "3세트 효과" },
        { group: "setEffect", source: "마스터 스노우 세트 5세트", rawText: "보스 공격력 10%" },
        { group: "starforceSet", source: "아케인 280성", rawText: "스타포스 합 291 (구간 280 이상)" }
      ]
    }
  };
  assert.deepEqual(sideFromStats(majorStats, choices), {
    arcane: { count: 7, stars: 291 },
    chaos: { count: 7, stars: 0 },
    "군단장 전리품 세트": { count: 3, stars: 0 }
  });
});
