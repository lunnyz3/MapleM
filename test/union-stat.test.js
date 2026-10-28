const test = require("node:test");
const assert = require("node:assert/strict");
const { buildMajorStats } = require("../src/controllers/maplestorym.controller");

// Shape of /maplestorym/v1/user/union-stat (added 2026-10-15), docs/research/api-shapes/user-union-stat.json.
const unionStat = {
  use_preset_no: 1,
  use_union_stat: [
    { stat_name: "물리 공격력", stat_point: 40, stat_value: "20.00%" },
    { stat_name: "치명타 피해", stat_point: 40, stat_value: "20.00%" },
    { stat_name: "보스 공격력", stat_point: 40, stat_value: "20.00%" },
    { stat_name: "경험치 획득량", stat_point: 40, stat_value: "40.00%" }
  ]
};

test("union stat counts toward major stats; non-combat stats are ignored", () => {
  const stats = buildMajorStats({ unionStat: { ok: true, data: unionStat } });
  assert.equal(stats.physicalAttackPercent.value, 20);
  assert.equal(stats.criticalDamage.value, 20);
  assert.equal(stats.bossDamage.value, 20);
  assert.deepEqual(
    stats.bossDamage.breakdown.map((entry) => entry.source),
    ["유니온 스탯"]
  );
});

test("removed union occupation effects are no longer counted", () => {
  const stats = buildMajorStats({
    unionRaider: {
      ok: true,
      data: { use_union_occupied_option: [{ option_name: "보스 공격력", option_value: "40%" }] }
    }
  });
  assert.equal(stats.bossDamage.value, 0);
});
