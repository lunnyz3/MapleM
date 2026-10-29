const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../web/src/lib/scoreScale.mjs");
const table = {
  slots: { 무기: { max: 650, maxWithoutEmblem: 582 }, 반지: { max: 61, maxWithoutEmblem: 61 }, 모자: { max: 120, maxWithoutEmblem: 52 } },
  fullSet: { max: 2400, maxWithoutEmblem: 1900 }
};

test("템환산 100점: 부위 최고 장비 최대치 대비, 무기는 종류와 상관없이 하나, 반지 슬롯 번호는 떼고 본다", async () => {
  const { scoreKey, itemPoints, setPoints, pointsText } = await load();
  assert.equal(scoreKey(table, "반지 (2번째 슬롯)"), "반지");
  assert.equal(scoreKey(table, "완드"), "무기");
  assert.equal(scoreKey(table, "무기"), "무기");
  assert.equal(pointsText(itemPoints(table, "완드", 485)), "74.6");
  assert.equal(pointsText(itemPoints(table, "모자", 26, { emblem: false })), "50.0");
  assert.equal(itemPoints(table, "반지 (3번째 슬롯)", 999), 100, "최대치를 넘으면 100");
  assert.equal(pointsText(setPoints(table, 1226.5)), "51.1");
});
