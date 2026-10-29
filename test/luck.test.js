const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../web/src/lib/luck.mjs");

test("운빨 지수: 확률 1/10 = 1점, 없는 칸은 빼고 더한다", async () => {
  const { itemLuck } = await load();
  const luck = itemLuck({ potential: 0.1, additional: 0.001, flame: null });
  assert.ok(Math.abs(luck.points - 4) < 1e-9);
  assert.equal(luck.sections, 2);
  assert.equal(itemLuck(null).points, 0);
  assert.equal(itemLuck({ potential: 0 }).sections, 0, "0은 계산 실패로 본다");
});

test("운빨 지수: 분위표로 더 높은 캐릭터 비율, 전투력 구간", async () => {
  const { topShare, quantilesOf, bandOf } = await load();
  const quantiles = quantilesOf(Array.from({ length: 1001 }, (_, index) => index / 10));
  assert.equal(quantiles.length, 101);
  assert.equal(quantiles[50], 50);
  assert.ok(Math.abs(topShare(90, quantiles) - 0.1) < 1e-9);
  assert.equal(topShare(1000, quantiles), 0);
  assert.equal(topShare(-1, quantiles), 1);
  const bands = [
    { min: 0, max: 1e8 },
    { min: 1e8, max: null }
  ];
  assert.equal(bandOf(bands, 5e8).min, 1e8);
  assert.equal(bandOf(bands, 10).max, 1e8);
});
