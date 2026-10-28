const test = require("node:test");
const assert = require("node:assert/strict");
const { computeStatSheets } = require("../src/domain/stats/engine");

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

function sumByKey(contributions) {
  return contributions.reduce((acc, entry) => ({ ...acc, [entry.key]: (acc[entry.key] || 0) + entry.value }), {});
}

test("union stat counts toward major stats; non-combat stats are ignored", () => {
  const { boss } = computeStatSheets({ unionStat: { ok: true, data: unionStat } });
  const fromUnionStat = boss.contributions.filter((entry) => entry.group === "unionStat");
  assert.deepEqual(sumByKey(fromUnionStat), { physicalAttackPercent: 20, criticalDamage: 20, bossDamage: 20 });
  assert.ok(fromUnionStat.every((entry) => entry.category === "content" && entry.label === "유니온 스탯"));
});

test("union stat presets are searched for the boss setting", () => {
  const presets = {
    use_preset_no: 1,
    use_union_stat: [{ stat_name: "경험치 획득량", stat_point: 40, stat_value: "40.00%" }],
    union_stat_preset: [
      { preset_no: 1, union_stat: [{ stat_name: "경험치 획득량", stat_point: 40, stat_value: "40.00%" }] },
      { preset_no: 2, union_stat: [{ stat_name: "보스 공격력", stat_point: 40, stat_value: "20.00%" }] }
    ]
  };
  const { boss, current } = computeStatSheets({ unionStat: { ok: true, data: presets } });
  assert.equal(current.selection.unionStat, 1);
  assert.equal(boss.selection.unionStat, 2);
  assert.equal(sumByKey(boss.contributions.filter((entry) => entry.group === "unionStat")).bossDamage, 20);
});

test("removed union occupation effects are no longer counted", () => {
  const { boss } = computeStatSheets({
    unionRaider: {
      ok: true,
      data: { use_union_occupied_option: [{ option_name: "보스 공격력", option_value: "40%" }] }
    }
  });
  const fromUnion = boss.contributions.filter((entry) => entry.group === "union" || entry.group === "unionStat");
  assert.equal(fromUnion.length, 0);
});
