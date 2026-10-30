const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../web/src/lib/powerGame.mjs");

test("누가 더 셀까: 연속으로 맞힐수록 배수 범위가 좁아진다", async () => {
  const { ratioBand } = await load();
  assert.deepEqual(ratioBand(0), [1.4, 3]);
  assert.deepEqual(ratioBand(4), [1.2, 1.5]);
  assert.deepEqual(ratioBand(7), [1.08, 1.25]);
  assert.deepEqual(ratioBand(20), [1.02, 1.12]);
});

test("누가 더 셀까: 범위에 드는 짝을 고르고, 나온 캐릭터는 다시 고르지 않는다", async () => {
  const { pickPair } = await load();
  const pool = [100, 105, 130, 200, 260, 400].map((power, index) => ({ name: `c${index}`, world: "w", power }));
  let seed = 3;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 20; i += 1) {
    const [a, b] = pickPair(pool, new Set(), 0, random);
    const ratio = Math.max(a.power, b.power) / Math.min(a.power, b.power);
    assert.ok(ratio >= 1.4 && ratio <= 3, `ratio ${ratio}`);
  }
  const used = new Set(["w/c0", "w/c1", "w/c2", "w/c3"]);
  const pair = pickPair(pool, used, 0, random);
  assert.deepEqual(pair.map((entry) => entry.name).sort(), ["c4", "c5"]);
  assert.equal(pickPair(pool, new Set(pool.map((entry) => `w/${entry.name}`)), 0), null);
});

test("전투력 맞히기: 가까울수록 점수가 높고, 같은 비율이면 위아래 점수가 같다", async () => {
  const { guessPoints, guessTitle } = await load();
  assert.equal(guessPoints(5e7, 5e7), 1000);
  const tenPercent = guessPoints(5.5e7, 5e7);
  assert.ok(tenPercent > 700 && tenPercent < 800, `10%: ${tenPercent}`);
  assert.equal(guessPoints(1e8, 5e7), guessPoints(2.5e7, 5e7));
  assert.ok(guessPoints(1e8, 5e7) < 150);
  assert.ok(guessPoints(6e7, 5e7) > guessPoints(7e7, 5e7));
  assert.equal(guessPoints(0, 5e7), 0);
  assert.equal(guessTitle(4600), "전투력 감별사");
  assert.equal(guessTitle(1200), "다시 도전!");
});

test("전투력 맞히기: 슬라이더 범위·반올림·한 명 고르기", async () => {
  const { sliderRange, roundPower, pickOne } = await load();
  const pool = [1.2e7, 3e7, 4e7, 3.4e8].map((power, index) => ({ name: `c${index}`, world: "w", power }));
  const range = sliderRange(pool);
  assert.equal(range.min, 7);
  assert.equal(range.max, Math.log10(5e8));
  assert.equal(sliderRange([{ name: "a", world: "w", power: 2e8 }]).max, Math.log10(2e8));
  assert.ok(Math.abs(range.start - Math.log10(4e7)) < 0.001);
  assert.deepEqual(sliderRange([]), { min: 7, max: 9, start: 8 });
  assert.equal(roundPower(32480301), 32500000);
  assert.equal(roundPower(345468859), 345000000);
  assert.equal(roundPower(0), 0);
  const used = new Set(["w/c0", "w/c1", "w/c2"]);
  assert.equal(pickOne(pool, used).name, "c3");
  used.add("w/c3");
  assert.equal(pickOne(pool, used), null);
});
