const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildGrowthReport } = require("../src/domain/growth/report");
const { buildCharacterStats } = require("../src/domain/stats");

function reportOf(name) {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "characters", `${name}.json`), "utf8"));
  const stats = buildCharacterStats(raw.details);
  const basic = raw.details.basic.data;
  const report = buildGrowthReport(raw.details, {
    majorStats: stats.majorStats,
    attackType: stats.statSetting.attackType,
    characterLevel: basic.character_level,
    characterName: basic.character_name,
    selection: stats.statSetting.selection
  });
  return { stats, areas: Object.fromEntries(report.areas.map((area) => [area.id, area])) };
}

test("내실: 다 채운 캐릭터(디올)는 HEXA 47,181·칠흑 95, 심볼 59,970/61,837에서 치명타 피해 +2", () => {
  const { areas } = reportOf("스카니아-디올");
  assert.equal(areas.hexa.max, 47181);
  assert.equal(areas.hexa.completion, 1);
  assert.equal(areas.pitched.current, 95);
  assert.equal(areas.symbol.current, 59970);
  assert.equal(areas.symbol.max, 61837);
  assert.deepEqual(areas.symbol.delta, { criticalDamage: 2 });
  assert.ok(areas.level.delta.physicalAttack > 300, "Lv.297 → 300 기본 공격력");
});

test("내실: 솔 야누스 Lv.25 → 30 최종 +9.5, 유니온 14,284 → 15,000 대미지 +5, 보스 세팅 쥬얼·하이퍼 프리셋 기준", () => {
  const { areas } = reportOf("유니온-피카츄");
  assert.deepEqual(areas.hexa.delta, { finalDamage: 9.5 });
  assert.deepEqual(areas.union.delta, { magicalDamagePercent: 5 });
  assert.equal(areas.jewel.completion, 1);
  assert.equal(areas.hyper.completion, 1);
});

test("내실 합계: 영역을 한꺼번에 넣은 상승량이 영역 하나하나보다 크고, 안 채운 곳은 상승량 순", async () => {
  const { growthSummary, deltaToTotals } = await import("../web/src/lib/growthReport.mjs");
  const rules = require("../src/game-data/combat-power.json");
  // web/src/lib/efficiency.js 와 같은 식(그 파일은 Vite 용 JSON import 라 Node 에서 바로 못 읽는다)
  const combatPower = (t) =>
    t.attack *
    (t.attackPercent / 100 + rules.bossBase * (1 + t.boss / 100)) *
    (1 + t.damage / 100) *
    (rules.criticalBase + t.critical / 100) *
    (1 + t.finalDamage / 100) *
    Math.pow(t.maxDamage / rules.maxDamageReference, rules.maxDamageExponent);
  assert.deepEqual(deltaToTotals({ magicalAttack: 10, physicalAttack: 99, bossDamage: 5 }, "magical"), { attack: 10, boss: 5 });
  const totals = { attack: 100000, attackPercent: 400, damage: 500, boss: 400, critical: 400, finalDamage: 300, maxDamage: 2e9 };
  const areas = [
    { id: "a", label: "A", current: 1, max: 2, unit: "", completion: 0.5, delta: { finalDamage: 10 } },
    { id: "b", label: "B", current: 1, max: 2, unit: "", completion: 0.5, delta: { physicalAttack: 1000 } },
    { id: "c", label: "C", current: 2, max: 2, unit: "", completion: 1, delta: {} }
  ];
  const summary = growthSummary({ areas, totals, attackType: "physical", combatPower });
  assert.deepEqual(summary.rows.map((row) => row.id), ["a", "b"]);
  assert.deepEqual(summary.done.map((row) => row.id), ["c"]);
  assert.ok(summary.gain > summary.rows[0].gain + summary.rows[1].gain - 1, "곱셈이라 합보다 크거나 같다");
});
