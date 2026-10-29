const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../web/src/lib/swapItem.mjs");
const line = (name, value) => ({ name, value });

test("바꿔 끼기: 기본 옵션에 있는 스탯의 추가 옵션은 두 번 세지 않는다", async () => {
  const { itemLines } = await load();
  const ring = {
    basicOption: [line("물리 대미지", "20.00%"), line("방어율 무시", "2.00%")],
    additionalOption: [line("최종 대미지", "6.60%"), line("물리 대미지", "3%")],
    potentialOption: [line("보스 공격력", "10%")],
    additionalPotentialOption: [],
    soulInfo: { soulOption: "" },
    emblemInfo: null
  };
  assert.deepEqual(
    itemLines(ring).map((entry) => entry.name),
    ["물리 대미지", "방어율 무시", "최종 대미지", "보스 공격력"]
  );
});

test("바꿔 끼기: 소울·문장 글을 줄로 나누고, 바꾼 차이만큼 합계를 고친다", async () => {
  const { splitStatText, swapTotals } = await load();
  assert.deepEqual(splitStatText("최대 대미지 119,000,000, 치명타 피해 15%"), [line("최대 대미지", "119,000,000"), line("치명타 피해", "15%")]);
  const totals = { attack: 100000, attackPercent: 100, damage: 100, boss: 50, critical: 100, finalDamage: 50, maxDamage: 1e9 };
  const mine = {
    basicOption: [line("물리 공격력", "80,000")],
    additionalOption: [],
    potentialOption: [line("물리 대미지", "20%")],
    soulInfo: { soulOption: "최종 대미지 20%" }
  };
  const theirs = {
    basicOption: [line("물리 공격력", "84,000")],
    additionalOption: [line("최종 대미지", "10%")],
    potentialOption: [line("물리 대미지", "24%")],
    soulInfo: { soulOption: "최종 대미지 24%" },
    emblemInfo: { emblem_option: "최대 대미지 100,000,000, 치명타 피해 10%" }
  };
  const next = swapTotals(totals, mine, theirs, "physical", { finalDamage: 2 });
  assert.equal(next.attack, 104000);
  assert.equal(next.damage, 104);
  assert.equal(next.finalDamage, 50 + 4 + 10 + 2);
  assert.equal(next.critical, 110);
  assert.equal(next.maxDamage, 1.1e9);
});
