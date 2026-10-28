const test = require("node:test");
const assert = require("node:assert/strict");
const { getActiveVcores, normalizeVcore } = require("../src/transform/vmatrix");
const { computeStatSheets } = require("../src/domain/stats/engine");

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

function vmatrixSum(details, key) {
  const { boss } = computeStatSheets(details);
  return boss.contributions
    .filter((entry) => entry.group === "vmatrix" && entry.key === key)
    .reduce((sum, entry) => sum + entry.value, 0);
}

const coresOf = (...cores) => ({ vmatrix: { ok: true, data: { character_v_core_equipment: cores } } });

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

// Operator-confirmed values for a common core (Blink, levels 1–30), 2026-10-28.
test("attack % per core level matches the observed table and caps at 25 at Lv.30", () => {
  const observed = { 1: 7.6, 2: 8.2, 10: 13, 20: 19, 29: 24.4, 30: 25 };
  for (const [level, expected] of Object.entries(observed)) {
    const value = vmatrixSum(coresOf(currentCore("블링크", Number(level))), "physicalAttackPercent");
    assert.ok(Math.abs(value - expected) < 1e-9, `Lv.${level}: expected ${expected}, got ${value}`);
  }
});

test("only equipped common cores add attack %; Erda, 판테온 and other cores add nothing", () => {
  const details = coresOf(
    currentCore("쓸만한 샤프 아이즈", 30),
    currentCore("로프 커넥트", 30),
    currentCore("쓸만한 윈드 부스터", 30, { equipped: "0" }),
    currentCore("에르다 노바", 30),
    currentCore("판테온", 30),
    currentCore("크레스트 오브 더 솔라", 30)
  );
  assert.equal(vmatrixSum(details, "physicalAttackPercent"), 50);
  assert.equal(vmatrixSum(details, "magicalAttackPercent"), 50);
});

test("useful-skill base effects (+9/+12) are not added", () => {
  const details = coresOf(currentCore("쓸만한 샤프 아이즈", 30), currentCore("쓸만한 윈드 부스터", 30));
  assert.equal(vmatrixSum(details, "criticalDamage"), 0);
  assert.equal(vmatrixSum(details, "bossDamage"), 0);
});

test("job passive 50 plus ten Lv.30 common cores equals 300%", () => {
  const names = [
    "블링크",
    "로프 커넥트",
    "쓸만한 샤프 아이즈",
    "쓸만한 홀리 심볼",
    "쓸만한 컴뱃 오더스",
    "쓸만한 윈드 부스터",
    "쓸만한 어드밴스드 블레스",
    "쓸만한 하이퍼 바디",
    "쓸만한 홀리 파운틴",
    "쓸만한 마녀 모자 자리"
  ];
  const details = {
    basic: { ok: true, data: { character_class: "캡틴", character_level: 295 } },
    ...coresOf(...names.map((name) => currentCore(name, 30)), currentCore("오버 드라이브", 30, { type: "JobList" }))
  };
  const { boss } = computeStatSheets(details);
  assert.equal(boss.totals.magicalAttackPercent, 300);
  // 캡틴 job-line core (오버 드라이브 Lv.30, 16 + 0.3×30) + job passive 35 = 60.
  assert.equal(boss.totals.magicalDamagePercent, 60);
});
