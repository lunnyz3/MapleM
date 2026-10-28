const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { computeStatSheets } = require("../src/domain/stats/engine");

// Reference values are the competitor screens captured on 2026-10-28
// (docs/research/calibration/<월드>-<이름>.json, maplemworlds "보스 세팅 켬(기본)" and maplemtool
// "보스 프리셋(기본)"), computed from the same day's Nexon capture in test/fixtures/characters.
//
// Default reference is maplemworlds. Where the two sites differ, the comment names the site we
// follow and why (docs/research/calibration/engine-report.md §4):
//   [mt 차원 균열]  maplemworlds leaves out the 차원 균열의 반지 set (+3 attack %); maplemtool and the
//                  Nexon set-effect API include it.
//   [mt 군단장]     maplemworlds leaves out 군단장 전리품 set effects; maplemtool and the API include them.
//   [mt V 코어]     attack % uses job passive 50 + V core levels (maplemtool); maplemworlds adds a
//                  constant 300, the same value once all ten cores are Lv.30.
//   [mw 깡공]       flat attack uses maplemworlds' level table; maplemtool's table is 14~17 higher.
//   [mw 방무]       방어율 무시 multiplies every option line (maplemworlds); maplemtool sums per item first.
//   [mw 7.74]       maplemtool reads a 7.74% additional damage line as 7.745.
//   [api 소울]      soul set attack comes from the API soul_set_option (2,880 for ten 칼로스 souls);
//                  maplemworlds' boss table has no 칼로스 (0) and maplemtool's level table is +15.
const EXPECTED = {
  "유니온-피카츄": {
    selection: { equipment: 2, android: 2, hyper: 2, jewel: 2, link: 2 },
    stats: {
      magicalAttack: 136380, // [mw 깡공] maplemtool 136,396
      magicalAttackPercent: 506, // [mt 차원 균열] maplemworlds 503
      magicalDamagePercent: 725.29,
      bossDamage: 510.58, // [mt 군단장] 3세트 보스 +4, maplemworlds 506.58
      criticalDamage: 433.7,
      maxDamage: 2177400000,
      finalDamage: 267.9,
      ignoreDefense: 81.769
    }
  },
  "스카니아-디올": {
    selection: { equipment: 2, android: 3, hyper: 3, jewel: 2, link: 2, unionStat: 2 },
    stats: {
      physicalAttack: 156963, // [mw 깡공] maplemtool 156,980
      physicalAttackPercent: 514, // [mt 차원 균열] maplemworlds 511
      physicalDamagePercent: 907.95,
      bossDamage: 551.86,
      criticalDamage: 609.6,
      maxDamage: 3278400000,
      finalDamage: 427.2,
      ignoreDefense: 86.609 // [mw 방무] maplemtool 86.826
    }
  },
  "스카니아-몬밀": {
    selection: { equipment: 1, android: 1, hyper: 1, jewel: 1 },
    stats: {
      magicalAttack: 103921, // [mw 깡공] maplemtool 103,936
      magicalAttackPercent: 382.6, // [mt V 코어] 쓸만한 홀리 파운틴 Lv.1, maplemworlds 400
      magicalDamagePercent: 318.53,
      bossDamage: 112.4, // [mt 군단장] 6세트 보스 +10, maplemworlds 102.4
      criticalDamage: 294,
      maxDamage: 763880000, // [mt 군단장] +250,000, maplemworlds 763,630,000
      finalDamage: 114.7, // [mt 군단장] +2.5, maplemworlds 112.2
      ignoreDefense: 42.697 // [mw 방무] maplemtool 44.414
    }
  },
  "스카니아-버디": {
    selection: { equipment: 2, android: 2, hyper: 1, jewel: 2, link: 3, unionStat: 1 },
    stats: {
      physicalAttack: 158212, // [mw 깡공] maplemtool 158,229
      physicalAttackPercent: 500.5, // [mt 차원 균열] maplemworlds 497.5
      physicalDamagePercent: 860.82, // [mw 7.74] maplemtool 860.825
      bossDamage: 555.3,
      criticalDamage: 582.5,
      maxDamage: 3368650000,
      finalDamage: 375.9,
      ignoreDefense: 83.177 // [mw 방무] maplemtool 83.227
    }
  },
  "스카니아-성령": {
    selection: { equipment: 2, android: 2, hyper: 1, jewel: 2, link: 2, unionStat: 2 },
    stats: {
      physicalAttack: 161897, // [api 소울] maplemworlds 159,017 + 2,880, maplemtool 161,912
      physicalAttackPercent: 511, // [mt 차원 균열] maplemworlds 508
      physicalDamagePercent: 899.57,
      bossDamage: 524.68,
      criticalDamage: 610.5,
      maxDamage: 3457900000,
      finalDamage: 358.1,
      ignoreDefense: 87.799 // [mw 방무] maplemtool 88.065
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
  test(`boss setting of ${name} picks the same presets as maplemworlds and maplemtool`, () => {
    const { boss } = computeStatSheets(loadFixture(name).details);
    for (const [dimension, no] of Object.entries(expected.selection)) {
      assert.equal(boss.selection[dimension], no, `${name} ${dimension}`);
    }
  });

  test(`boss setting stats of ${name} match the competitor screens`, () => {
    const { boss } = computeStatSheets(loadFixture(name).details);
    for (const [key, value] of Object.entries(expected.stats)) {
      assertStat(key, boss.totals[key], value, `${name} ${key}`);
    }
  });
}

// "게임 현재 조합" on both sites (presets in use when the fixture was captured).
test("current presets of 피카츄 match both sites", () => {
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

test("current presets of 디올 count 160-level set effects like maplemtool", () => {
  const { current } = computeStatSheets(loadFixture("스카니아-디올").details);
  // maplemworlds leaves out the 160레벨 (레전더리) set: 치명타 피해 287.1, 공격력% 400.5, 대미지 395.6.
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
