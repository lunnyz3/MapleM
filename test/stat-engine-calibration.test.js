const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { computeStatSheets } = require("../src/domain/stats/engine");

// Expected boss-setting and current-preset stats for the five Nexon captures in
// test/fixtures/characters (2026-10-28), pinned when the engine rules were checked. Rules that matter
// for these numbers:
//   [세트]     other equipment sets (차원 균열의 반지, 군단장 전리품, 160레벨 …) count, as the
//             Nexon set-effect API reports them.
//   [V 코어]   attack % = job passive 50 + common V core levels (300 once all ten are Lv.30).
//   [깡공]     level base attack comes from src/game-data/character-base.json.
//   [방무]     방어율 무시 multiplies every option line.
//   [소울]     soul set attack comes from the API soul_set_option (2,880 for ten 칼로스 souls).
const EXPECTED = {
  "유니온-피카츄": {
    selection: { equipment: 2, android: 2, hyper: 2, jewel: 2, link: 2 },
    stats: {
      magicalAttack: 136380, // [깡공]
      magicalAttackPercent: 506, // [세트] 차원 균열의 반지 +3
      magicalDamagePercent: 725.29,
      bossDamage: 510.58, // [세트] 군단장 3세트 보스 +4
      criticalDamage: 433.7,
      maxDamage: 2177400000,
      finalDamage: 267.9,
      ignoreDefense: 81.769
    }
  },
  "스카니아-디올": {
    selection: { equipment: 2, android: 3, hyper: 3, jewel: 2, link: 2, unionStat: 2 },
    stats: {
      physicalAttack: 156963, // [깡공]
      physicalAttackPercent: 514, // [세트] 차원 균열의 반지 +3
      physicalDamagePercent: 907.95,
      bossDamage: 551.86,
      criticalDamage: 609.6,
      maxDamage: 3278400000,
      finalDamage: 427.2,
      ignoreDefense: 86.609 // [방무]
    }
  },
  "스카니아-몬밀": {
    selection: { equipment: 1, android: 1, hyper: 1, jewel: 1 },
    stats: {
      magicalAttack: 103921, // [깡공]
      magicalAttackPercent: 382.6, // [V 코어] 쓸만한 홀리 파운틴 Lv.1
      magicalDamagePercent: 318.53,
      bossDamage: 112.4, // [세트] 군단장 6세트 보스 +10
      criticalDamage: 294,
      maxDamage: 763880000, // [세트] 군단장 +250,000
      finalDamage: 114.7, // [세트] 군단장 +2.5
      ignoreDefense: 42.697 // [방무]
    }
  },
  "스카니아-버디": {
    selection: { equipment: 2, android: 2, hyper: 1, jewel: 2, link: 3, unionStat: 1 },
    stats: {
      physicalAttack: 158212, // [깡공]
      physicalAttackPercent: 500.5, // [세트] 차원 균열의 반지 +3
      physicalDamagePercent: 860.82, // 추가 옵션 7.74% 줄은 그대로 더한다
      bossDamage: 555.3,
      criticalDamage: 582.5,
      maxDamage: 3368650000,
      finalDamage: 375.9,
      ignoreDefense: 83.177 // [방무]
    }
  },
  "스카니아-성령": {
    selection: { equipment: 2, android: 2, hyper: 1, jewel: 2, link: 2, unionStat: 2 },
    stats: {
      physicalAttack: 161897, // [소울] 칼로스 소울 2,880 포함
      physicalAttackPercent: 511, // [세트] 차원 균열의 반지 +3
      physicalDamagePercent: 899.57,
      bossDamage: 524.68,
      criticalDamage: 610.5,
      maxDamage: 3457900000,
      finalDamage: 358.1,
      ignoreDefense: 87.799 // [방무]
    }
  }
};

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/characters", `${name}.json`), "utf8"));
}

function assertStat(key, actual, expected, label) {
  if (key === "physicalAttack" || key === "magicalAttack" || key === "maxDamage") {
    assert.equal(Math.round(actual), expected, `${label}: expected ${expected}, got ${actual}`);
    return;
  }
  const tolerance = key === "ignoreDefense" ? 0.001 : 0.01;
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} ±${tolerance}, got ${actual}`);
}

for (const [name, expected] of Object.entries(EXPECTED)) {
  test(`boss setting of ${name} picks the expected presets`, () => {
    const { boss } = computeStatSheets(loadFixture(name).details);
    for (const [dimension, no] of Object.entries(expected.selection)) {
      assert.equal(boss.selection[dimension], no, `${name} ${dimension}`);
    }
  });

  test(`boss setting stats of ${name} match the expected values`, () => {
    const { boss } = computeStatSheets(loadFixture(name).details);
    for (const [key, value] of Object.entries(expected.stats)) {
      assertStat(key, boss.totals[key], value, `${name} ${key}`);
    }
  });
}

// Presets in use when the fixture was captured.
test("current presets of 피카츄 match the expected values", () => {
  const { current } = computeStatSheets(loadFixture("유니온-피카츄").details);
  assert.deepEqual(
    { equipment: current.selection.equipment, android: current.selection.android, hyper: current.selection.hyper, jewel: current.selection.jewel },
    { equipment: 3, android: 1, hyper: 1, jewel: 3 }
  );
  const expected = {
    magicalAttack: 134993,
    magicalAttackPercent: 497.5,
    magicalDamagePercent: 589.94,
    bossDamage: 337.96,
    criticalDamage: 367,
    maxDamage: 1680600000,
    finalDamage: 245.8,
    ignoreDefense: 73.638
  };
  for (const [key, value] of Object.entries(expected)) assertStat(key, current.totals[key], value, `피카츄 current ${key}`);
});

test("current presets of 디올 count 160-level set effects", () => {
  const { current } = computeStatSheets(loadFixture("스카니아-디올").details);
  // Without the 160레벨 (레전더리) set: 치명타 피해 287.1, 공격력% 400.5, 대미지 395.6.
  const expected = {
    physicalAttack: 123681,
    physicalAttackPercent: 404.5,
    physicalDamagePercent: 399.6,
    bossDamage: 168.14,
    criticalDamage: 331.6,
    maxDamage: 885150000,
    finalDamage: 206.2,
    ignoreDefense: 36.267
  };
  for (const [key, value] of Object.entries(expected)) assertStat(key, current.totals[key], value, `디올 current ${key}`);
});

test("calculated combat power follows the shared formula", () => {
  const { boss } = computeStatSheets(loadFixture("유니온-피카츄").details);
  const t = boss.totals;
  const expected = Math.round(
    Math.max(t.physicalAttack, t.magicalAttack) *
      (Math.max(t.physicalAttackPercent, t.magicalAttackPercent) / 100 + 0.3 * (1 + t.bossDamage / 100)) *
      (1 + Math.max(t.physicalDamagePercent, t.magicalDamagePercent) / 100) *
      (1.2 + t.criticalDamage / 100) *
      (1 + t.finalDamage / 100) *
      Math.pow(t.maxDamage / 1e8, 0.2)
  );
  assert.equal(boss.combatPower, expected);
  assert.ok(boss.combatPower > computeStatSheets(loadFixture("유니온-피카츄").details).current.combatPower);
});
