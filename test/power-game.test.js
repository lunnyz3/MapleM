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
