const test = require("node:test");
const assert = require("node:assert/strict");
const { getActiveVcores, normalizeVcore } = require("../src/transform/vmatrix");
const { buildMajorStats } = require("../src/controllers/maplestorym.controller");

// Shape of /maplestorym/v1/character/vmatrix since 2026-09-17 (docs/research/api-shapes/character-vmatrix.json).
const currentCore = (name, level, { equipped = "1", expired = "0", type = "Common" } = {}) => ({
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

const statsFor = (...cores) =>
  buildMajorStats({ vmatrix: { ok: true, data: { character_v_core_equipment: cores } } });

function withEnv(t, values) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

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

// Values observed on maplemtool.com's simulator on 2026-10-28 (Blink, levels 1–30).
test("attack % per core level matches the observed table and caps at 25 at Lv.30", () => {
  const observed = { 1: 7.6, 2: 8.2, 10: 13, 20: 19, 29: 24.4, 30: 25 };
  for (const [level, expected] of Object.entries(observed)) {
    const value = statsFor(currentCore("블링크", Number(level))).physicalAttackPercent.value;
    assert.ok(Math.abs(value - expected) < 1e-9, `Lv.${level}: expected ${expected}, got ${value}`);
  }
});

test("only equipped target cores add attack %; Erda and non-target cores add nothing", () => {
  const stats = statsFor(
    currentCore("쓸만한 샤프 아이즈", 30),
    currentCore("로프 커넥트", 30),
    currentCore("쓸만한 윈드 부스터", 30, { equipped: "0" }),
    currentCore("에르다 노바", 30),
    currentCore("크레스트 오브 더 솔라", 30)
  );
  assert.equal(stats.physicalAttackPercent.value, 50);
  assert.equal(stats.magicalAttackPercent.value, 50);
});

test("unverified base effects stay off by default and can be enabled explicitly", (t) => {
  const defaults = statsFor(currentCore("쓸만한 샤프 아이즈", 30), currentCore("쓸만한 윈드 부스터", 30));
  assert.equal(defaults.criticalDamage.value, 0);
  assert.equal(defaults.bossDamage.value, 0);

  withEnv(t, { VMATRIX_BASE_EFFECTS: "on" });
  const enabled = statsFor(currentCore("쓸만한 샤프 아이즈", 30));
  assert.equal(enabled.criticalDamage.value, 12);
});

test("VMATRIX_STAT_RULES=off turns the attack % rule off", (t) => {
  withEnv(t, { VMATRIX_STAT_RULES: "off" });
  assert.equal(statsFor(currentCore("블링크", 30)).physicalAttackPercent.value, 0);
});
