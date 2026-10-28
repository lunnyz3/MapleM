const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { buildCharacterStats, computeStatSheets, listManualInputs, normalizeManualInputs } = require("../src/domain/stats");
const { STAT_KEYS } = require("../src/domain/stats/keys");
const { parseStatsBody, MAX_BODY_BYTES } = require("../src/controllers/stats-v2.controller");

const fixtureDir = path.join(__dirname, "fixtures/characters");
const loadFixture = (name) => JSON.parse(fs.readFileSync(path.join(fixtureDir, `${name}.json`), "utf8"));
const physical = loadFixture("스카니아-디올"); // 듀얼블레이드
const magical = loadFixture("유니온-피카츄"); // 아크메이지(썬,콜)

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} vs ${expected}`);

test("manual-input list has the agreed shape", () => {
  const { items, updatedAt } = listManualInputs();
  assert.match(updatedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(items.length >= 20);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length, "ids are unique");
  for (const item of items) {
    assert.equal(typeof item.id, "string");
    assert.equal(typeof item.label, "string");
    assert.equal(typeof item.group, "string");
    assert.equal(typeof item.description, "string");
    assert.ok(["flat", "percent", "level"].includes(item.unit), item.id);
    assert.ok(["maplemworlds", "maplemtool", "both"].includes(item.source), item.id);
    assert.equal(item.default, 0);
    assert.ok(item.min <= 0 && item.max > item.min && item.step > 0, item.id);
    assert.ok(item.appliesTo.length > 0, item.id);
    item.appliesTo.forEach((key) => assert.ok(STAT_KEYS.includes(key), `${item.id}: ${key}`));
    if (item.unit === "level") {
      assert.ok(Array.isArray(item.levels) && item.levels.length >= 2, item.id);
      assert.equal(item.levels[0].value, 0);
      item.levels.forEach((level) => {
        assert.equal(typeof level.label, "string");
        Object.keys(level.effects).forEach((key) => assert.ok(item.appliesTo.includes(key), `${item.id} level ${level.value}: ${key}`));
      });
      assert.equal(item.max, Math.max(...item.levels.map((level) => level.value)));
    } else {
      assert.equal(item.levels, undefined);
    }
  }
});

test("every item changes only the stats it lists in appliesTo", () => {
  const { items } = listManualInputs();
  for (const fixture of [physical, magical]) {
    const base = computeStatSheets(fixture.details).current.totals;
    for (const item of items) {
      const values = item.unit === "level" ? item.levels.filter((level) => level.value !== 0).map((level) => level.value) : [item.max];
      for (const value of values) {
        const { values: manual } = normalizeManualInputs({ [item.id]: value });
        const totals = computeStatSheets(fixture.details, { manual }).current.totals;
        const changed = STAT_KEYS.filter((key) => Math.abs(totals[key] - base[key]) > 1e-9);
        changed.forEach((key) => assert.ok(item.appliesTo.includes(key), `${fixture.name} ${item.id}=${value} changed ${key}`));
        const level = item.levels?.find((entry) => entry.value === value);
        if (!level || Object.keys(level.effects).length) assert.ok(changed.length > 0, `${fixture.name} ${item.id}=${value} changed nothing`);
      }
    }
  }
});

test("empty or missing manual input leaves the stats unchanged", () => {
  for (const fixture of [physical, magical]) {
    const plain = buildCharacterStats(fixture.details);
    for (const manual of [undefined, null, {}, { starcorusBossDamage: 0 }, { petAttack: "" }]) {
      const stats = buildCharacterStats(fixture.details, { manual });
      assert.deepEqual(stats.majorStats, plain.majorStats);
      assert.deepEqual(stats.majorStatsCurrent, plain.majorStatsCurrent);
      assert.deepEqual(stats.statSetting, plain.statSetting);
      assert.deepEqual(stats.manualApplied, {});
    }
    assert.equal(plain.statSetting.manual.applied, false);
  }
});

test("boss damage input raises the boss damage total and the combat power", () => {
  const plain = buildCharacterStats(physical.details);
  const stats = buildCharacterStats(physical.details, { manual: { starcorusBossDamage: 10, blessingBossDamage: 4.4 } });
  near(stats.majorStats.bossDamage.value, plain.majorStats.bossDamage.value + 14.4, "boss setting");
  near(stats.majorStatsCurrent.bossDamage.value, plain.majorStatsCurrent.bossDamage.value + 14.4, "current");
  assert.ok(stats.statSetting.combatPower.boss > plain.statSetting.combatPower.boss);
  assert.ok(stats.statSetting.combatPower.current > plain.statSetting.combatPower.current);
  assert.deepEqual(stats.manualApplied, { starcorusBossDamage: 10, blessingBossDamage: 4.4 });
  assert.equal(stats.statSetting.manual.applied, true);
  assert.equal(stats.statSetting.manual.count, 2);

  const rows = stats.majorStats.bossDamage.breakdown.filter((row) => row.category === "manual");
  assert.deepEqual(
    rows.map((row) => [row.source, row.value, row.categoryLabel, row.groupLabel]),
    [
      ["직접 입력 · 스타코러스", 10, "직접 입력", "스타코러스"],
      ["직접 입력 · 빛의 성소 축복", 4.4, "직접 입력", "빛의 성소 축복"]
    ]
  );
  // Other stats are untouched.
  assert.deepEqual(stats.majorStats.finalDamage, plain.majorStats.finalDamage);
});

test("job-family inputs go to the character's attack type", () => {
  const manual = { petAttack: 2252, starcorusAttackPercent: 36, starcorusDamage: 36 };
  const pPlain = computeStatSheets(physical.details).boss.totals;
  const pTotals = computeStatSheets(physical.details, { manual }).boss.totals;
  near(pTotals.physicalAttack - pPlain.physicalAttack, 2252, "physical flat attack");
  near(pTotals.physicalAttackPercent - pPlain.physicalAttackPercent, 36, "physical attack %");
  near(pTotals.physicalDamagePercent - pPlain.physicalDamagePercent, 36, "physical damage");
  near(pTotals.magicalAttack, pPlain.magicalAttack, "magical side untouched");

  const mPlain = computeStatSheets(magical.details).boss.totals;
  const mTotals = computeStatSheets(magical.details, { manual }).boss.totals;
  near(mTotals.magicalAttack - mPlain.magicalAttack, 2252, "magical flat attack");
  near(mTotals.magicalDamagePercent - mPlain.magicalDamagePercent, 36, "magical damage");
  near(mTotals.physicalAttackPercent, mPlain.physicalAttackPercent, "physical side untouched");
});

test("level items: union champion is cumulative, the stigma set needs the same light and grade", () => {
  const plain = computeStatSheets(physical.details).current.totals;
  const champion = computeStatSheets(physical.details, { manual: { unionChampion1: 4, unionChampion2: 2 } }).current.totals;
  near(champion.physicalAttackPercent - plain.physicalAttackPercent, 8, "B+ twice");
  near(champion.bossDamage - plain.bossDamage, 8, "A+ twice");
  near(champion.physicalDamagePercent - plain.physicalDamagePercent, 4, "S+ once");
  near(champion.criticalDamage - plain.criticalDamage, 4, "SS once");

  // 붉은빛 유니크 both → 보공 5+7 and the set's 최대 대미지 5,000만 (maplemworlds 나로·여신 screen).
  const set = computeStatSheets(physical.details, { manual: { stigmaAkan: 1, stigmaAzazel: 1 } }).current.totals;
  near(set.bossDamage - plain.bossDamage, 12, "stigma boss damage");
  near(set.maxDamage - plain.maxDamage, 50000000, "stigma set max damage");
  const mixed = computeStatSheets(physical.details, { manual: { stigmaAkan: 1, stigmaAzazel: 2 } }).current.totals;
  near(mixed.bossDamage - plain.bossDamage, 8, "unique + epic");
  near(mixed.maxDamage, plain.maxDamage, "no set across grades");
});

test("invalid input is clamped, rounded or dropped with a warning", () => {
  const { values, warnings } = normalizeManualInputs({
    starcorusBossDamage: 999,
    starcorusCriticalDamage: -5,
    starcorusFinalDamage: 7.3,
    petAttack: "1500",
    blessingDamage: "abc",
    unionChampion1: 7,
    honorBadge1: 2.5,
    notAnItem: 3,
    starcorusMaxDamage: Infinity
  });
  assert.deepEqual(values, { starcorusBossDamage: 28, starcorusFinalDamage: 7.5, petAttack: 1500 });
  const codes = Object.fromEntries(warnings.map((warning) => [warning.id, warning.code]));
  assert.deepEqual(codes, {
    starcorusBossDamage: "clamped",
    starcorusCriticalDamage: "clamped",
    starcorusFinalDamage: "rounded_to_step",
    blessingDamage: "not_a_number",
    unionChampion1: "invalid_level",
    honorBadge1: "invalid_level",
    notAnItem: "unknown_id",
    starcorusMaxDamage: "not_a_number"
  });
  assert.throws(() => normalizeManualInputs([1, 2]), (error) => error.code === "invalid_manual");
  assert.throws(() => normalizeManualInputs("x"), (error) => error.code === "invalid_manual");
  const many = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`k${index}`, 1]));
  assert.throws(() => normalizeManualInputs(many), (error) => error.code === "too_many_entries");
});

test("manual input re-runs the boss-setting search", () => {
  // Two jewel pages: flat attack on page 1, damage on page 2. Page 2's damage is set between
  // the two break-even points, so page 1 wins without input and page 2 wins once 펫 공격력
  // 2,252 makes the same flat attack worth less.
  const details = JSON.parse(JSON.stringify(physical.details));
  const jewel = (option, color) => ({ slot_no: 1, jewel_name: "A등급", jewel_grade: "A", jewel_color: color, jewel_option: option });
  details.jewel.data.jewel_equipment = [
    { jewel_page_no: 1, jewel_info: [] },
    { jewel_page_no: 2, jewel_info: [] }
  ];
  const plain = computeStatSheets(details).boss;
  const attack = plain.totals.physicalAttack;
  const damage = plain.totals.physicalDamagePercent / 100;
  const extra = 3000;
  const ratioPlain = (attack + extra) / attack;
  const ratioManual = (attack + 2252 + extra) / (attack + 2252);
  const targetRatio = (ratioPlain + ratioManual) / 2;
  const damageGain = Math.round((targetRatio * (1 + damage) - (1 + damage)) * 10000) / 100;
  details.jewel.data.jewel_equipment = [
    { jewel_page_no: 1, jewel_info: [jewel(`물리 공격력 +${extra}`, "레드")] },
    { jewel_page_no: 2, jewel_info: [jewel(`물리 대미지 ${damageGain}%`, "블루")] }
  ];
  const before = computeStatSheets(details);
  const after = computeStatSheets(details, { manual: { petAttack: 2252 } });
  assert.equal(before.boss.selection.jewel, 1);
  assert.equal(after.boss.selection.jewel, 2);
  assert.ok(after.boss.combatPower > before.boss.combatPower);
});

function fakeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test("character-stats body validation", () => {
  const parse = (body, headers = {}) => {
    const res = fakeResponse();
    const parsed = parseStatsBody({ body, headers }, res);
    return { parsed, res };
  };

  const ok = parse({ world_name: "스카니아", character_name: " 디올 ", manual: { petAttack: 3000, nope: 1 } });
  assert.equal(ok.res.statusCode, 200);
  assert.deepEqual(ok.parsed.query, { characterName: "디올", worldNameInput: "스카니아", worldNameCanonical: "스카니아" });
  assert.deepEqual(ok.parsed.values, { petAttack: 2252 });
  assert.deepEqual(ok.parsed.warnings.map((warning) => warning.code), ["clamped", "unknown_id"]);

  assert.equal(parse({ world_name: "스카니아", character_name: "디올" }).parsed.values.petAttack, undefined);
  assert.equal(parse({ world_name: "없는월드", character_name: "디올" }).res.statusCode, 400);
  assert.equal(parse({ world_name: "스카니아" }).res.statusCode, 400);
  assert.equal(parse({ world_name: "스카니아", character_name: "디올", manual: [1] }).res.statusCode, 400);
  assert.equal(parse([1, 2]).res.statusCode, 400);
  assert.equal(parse({ world_name: "스카니아", character_name: "디올" }, { "content-length": String(MAX_BODY_BYTES + 1) }).res.statusCode, 413);
  const bigManual = Object.fromEntries(Array.from({ length: 400 }, (_, index) => [`item${index}`, index]));
  assert.equal(parse({ world_name: "스카니아", character_name: "디올", manual: bigManual }).res.statusCode, 413);
});
