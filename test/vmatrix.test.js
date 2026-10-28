const test = require("node:test");
const assert = require("node:assert/strict");
const { getActiveVcores, normalizeVcore } = require("../src/transform/vmatrix");
const { buildMajorStats } = require("../src/controllers/maplestorym.controller");

// Shape of /maplestorym/v1/character/vmatrix since 2026-09-17 (docs/research/api-shapes/character-vmatrix.json).
const currentCore = (name, level, { equipped = "1", expired = "0", type = "Special" } = {}) => ({
  vcore_type: type,
  vcore_level: level,
  vcore_score: 100,
  vcore_skill_name1: name,
  vcore_skill_name2: null,
  vcore_skill_name3: null,
  vcore_skill_name4: null,
  vcore_expire_flag: expired,
  vcore_expire_date: null,
  vcore_equipment_flag: equipped
});

const contributionSources = (stats, key) => stats[key].breakdown.map((entry) => entry.source);

test("normalizeVcore names cores from vcore_skill_name1 after vcore_name was removed", () => {
  const core = normalizeVcore(currentCore("쓸만한 샤프 아이즈", 25));
  assert.equal(core.name, "쓸만한 샤프 아이즈");
  assert.equal(core.level, 25);
  assert.equal(core.equipped, true);
  assert.equal(core.expired, false);
});

test("normalizeVcore still reads legacy logs that have vcore_name and slot_level", () => {
  const core = normalizeVcore({ vcore_name: "쓸만한 윈드 부스터", vcore_level: 20, slot_level: 5, vcore_type: "Special" });
  assert.equal(core.name, "쓸만한 윈드 부스터");
  assert.equal(core.legacySlotLevel, 5);
  assert.equal(core.equipped, true, "legacy responses had no flag and listed only equipped cores");
});

test("getActiveVcores drops unequipped and expired cores", () => {
  const active = getActiveVcores({
    character_v_core_equipment: [
      currentCore("A", 1),
      currentCore("B", 1, { equipped: "0" }),
      currentCore("C", 1, { expired: "1" })
    ]
  });
  assert.deepEqual(active.map((core) => core.name), ["A"]);
});

// Locks the current rule set; whether 7.6 + 0.6/level (max 25) and the base effects are
// still correct in game is tracked in docs/game-data-audit.md.
test("buildMajorStats counts equipped V matrix cores and ignores unequipped ones", (t) => {
  process.env.VMATRIX_STAT_RULES = "on";
  t.after(() => {
    delete process.env.VMATRIX_STAT_RULES;
  });
  const stats = buildMajorStats({
    vmatrix: {
      ok: true,
      data: {
        character_v_core_equipment: [
          currentCore("쓸만한 샤프 아이즈", 25),
          currentCore("쓸만한 윈드 부스터", 25, { equipped: "0" })
        ]
      }
    }
  });

  assert.equal(stats.physicalAttackPercent.value, 22);
  assert.equal(stats.criticalDamage.value, 12);
  assert.ok(contributionSources(stats, "criticalDamage").includes("V매트릭스 (쓸만한 샤프 아이즈)"));
  assert.equal(stats.bossDamage.value, 0, "unequipped Wind Booster must not add boss damage");
});

test("V matrix stat rules stay off unless VMATRIX_STAT_RULES=on", () => {
  const stats = buildMajorStats({
    vmatrix: { ok: true, data: { character_v_core_equipment: [currentCore("쓸만한 샤프 아이즈", 30)] } }
  });
  assert.equal(stats.physicalAttackPercent.value, 0);
  assert.equal(stats.criticalDamage.value, 0);
});
