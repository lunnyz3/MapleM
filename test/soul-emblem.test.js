const test = require("node:test");
const assert = require("node:assert/strict");
const table = require("../src/game-data/soul-emblem.json");

const load = () => import("../web/src/lib/soulEmblem.mjs");

test("문장: 압도의 문장 Lv.8 = 최대 대미지 59,500,000 · 보스 공격력 10%(넥슨 응답과 같다)", async () => {
  const { emblemLines } = await load();
  assert.deepEqual(emblemLines(table, "압도의 문장", 8), [
    { name: "최대 대미지", value: "59500000" },
    { name: "보스 공격력", value: "10%" }
  ]);
});

test("소울: 보조 장비 반반 = 최종 4.5% · 최대 대미지 450,000, 무기 카이 = 최종 22%만", async () => {
  const { soulChoices, splitLine } = await load();
  const sub = soulChoices(table, false, "magical").find((choice) => choice.boss === "반반");
  assert.deepEqual(sub.lines, [
    { name: "최종 대미지", value: "4.5%" },
    { name: "최대 대미지", value: "450000" }
  ]);
  const kai = soulChoices(table, true, "magical").find((choice) => choice.boss === "카이");
  assert.deepEqual(kai.lines, [{ name: "최종 대미지", value: "22%" }]);
  assert.ok(soulChoices(table, true, "magical")[0].lines.some((line) => line.name === "마법 대미지"));
  assert.deepEqual(splitLine("최대 대미지 450,000"), { name: "최대 대미지", value: "450,000" });
});
