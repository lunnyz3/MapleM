const test = require("node:test");
const assert = require("node:assert/strict");
const growth = require("../src/game-data/growth-report.json");

const load = () => import("../web/src/lib/hyperRecommend.mjs");
const rules = require("../src/game-data/combat-power.json");
const power = (t) =>
  t.attack * (t.attackPercent / 100 + rules.bossBase * (1 + t.boss / 100)) * (1 + t.damage / 100) * (rules.criticalBase + t.critical / 100) * (1 + t.finalDamage / 100) * Math.pow(t.maxDamage / rules.maxDamageReference, rules.maxDamageExponent);
const table = growth.hyper.stats;

test("하이퍼 추천: 같은 포인트로 전투력이 가장 높은 배분, 지금보다 낮아지지 않는다", async () => {
  const { recommendHyper } = await load();
  // 보공에 포인트를 몰아 둔 경우 → 최종 쪽으로 옮기는 게 낫다
  const totals = { attack: 120000, attackPercent: 450, damage: 600, boss: 400, critical: 300, finalDamage: 200, maxDamage: 2e9 };
  const current = { "보스 공격력": 25, "최종 대미지": 5, "치명타 피해": 5, "마법 대미지": 5, "최대 대미지": 5 };
  const result = recommendHyper({ totals, current, table, attackType: "magical", score: power });
  assert.equal(result.budget, 45);
  assert.equal(result.rows.reduce((sum, row) => sum + row.to, 0), 45);
  assert.ok(result.ratio > 1);
  const final = result.rows.find((row) => row.name === "최종 대미지");
  assert.ok(final.to > 5);
});

test("하이퍼 추천: 이미 모두 25면 그대로", async () => {
  const { recommendHyper } = await load();
  const totals = { attack: 120000, attackPercent: 450, damage: 600, boss: 400, critical: 300, finalDamage: 200, maxDamage: 2e9 };
  const current = { "보스 공격력": 25, "최종 대미지": 25, "치명타 피해": 25, "마법 대미지": 25, "최대 대미지": 25 };
  const result = recommendHyper({ totals, current, table, attackType: "magical", score: power });
  assert.ok(result.rows.every((row) => row.to === 25));
  assert.ok(Math.abs(result.ratio - 1) < 1e-12);
});
