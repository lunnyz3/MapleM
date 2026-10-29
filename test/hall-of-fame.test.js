const test = require("node:test");
const assert = require("node:assert/strict");
const { hallOfFame, damageSum, finalFlameSum } = require("../src/domain/stats/hall-of-fame");

const line = (name, value) => ({ option_name: name, option_value: value });
const weapon = (name, ocid, potential, flame, itemName = "제네시스 완드") => ({
  ocid,
  characterName: name,
  worldName: "스카니아",
  characterClass: "비숍",
  slot: "완드",
  itemName,
  starforce: 36,
  score: 600,
  parts: { additional: 10 },
  item: { item_potential_option: potential, item_additional_potential_option: [], item_additional_option: flame }
});

test("명예의 전당: 대미지 줄 합은 물리·마법 중 큰 쪽, 최종 대미지 추옵은 한 장비의 합", () => {
  assert.equal(damageSum([line("마법 대미지", "24.7%"), line("마법 대미지", "24.7%"), line("물리 대미지", "3%")]), 49.4);
  assert.equal(finalFlameSum([line("최종 대미지", "10.30%"), line("최종 대미지", "7.8%"), line("마법 공격력", "3,000")]), 18.1);
});

test("명예의 전당: 캐릭터마다 한 줄, 같은 값은 같은 순위, 장비 대여는 뺀다", () => {
  const records = hallOfFame({
    weapons: [
      weapon("가", "a", [line("마법 대미지", "24.7%"), line("마법 대미지", "24.7%")], [line("최종 대미지", "10.3%")]),
      weapon("가", "a", [line("마법 대미지", "20%")], []),
      weapon("나", "b", [line("마법 대미지", "24.7%"), line("마법 대미지", "24.7%")], [line("최종 대미지", "9%")]),
      weapon("다", "c", [line("마법 대미지", "30%")], []),
      weapon("라", "d", [line("마법 대미지", "99%")], [], "[장비 대여] 아케인셰이드 완드")
    ],
    accessories: [],
    powerSpecs: [{ ocid: "a", characterName: "가", worldName: "스카니아", combatPower: 100 }],
    scoreSpecs: []
  });
  const potential = records.find((record) => record.key === "potential");
  assert.deepEqual(
    potential.rows.map((row) => [row.name, row.value, row.rank]),
    [
      ["가", 49.4, 1],
      ["나", 49.4, 1],
      ["다", 30, 3]
    ]
  );
  assert.equal(potential.leaders, 2, "1위 값을 가진 캐릭터 수");
  assert.equal(records.find((record) => record.key === "finalFlame").rows[0].value, 10.3);
  assert.equal(records.find((record) => record.key === "combatPower").rows[0].name, "가");
  assert.equal(records.find((record) => record.key === "itemScore").rows.length, 0);
});
