const test = require("node:test");
const assert = require("node:assert/strict");
const { pickLevels, findLevels, levelLines, groupKey, createLevelPicker } = require("../src/domain/items/potential-levels");

const rows = (family, slot, attackType, scores) =>
  scores.map((score, index) => ({ id: `${family}-${slot}-${attackType}-${index}`, family, slot, attackType, score }));

test("잠재 수준: 계열·부위·공격 타입마다 점수 하위 25%·중간·상위 25% 자리(가장 가까운 순위)의 장비를 고른다", () => {
  // 1..41 점(41개) → 25% = 11점, 50% = 21점, 75% = 31점
  const scores = Array.from({ length: 41 }, (_, index) => 41 - index);
  const picked = pickLevels(rows("아케인셰이드", "모자", "physical", scores));
  const hat = picked.get(groupKey("아케인셰이드", "모자", "physical"));
  assert.equal(hat.sample, 41);
  assert.deepEqual(
    hat.picks.map((pick) => [pick.key, pick.label, pick.score]),
    [
      ["q25", "하위 25%", 11],
      ["q50", "중간", 21],
      ["q75", "상위 25%", 31]
    ]
  );
  assert.equal(hat.picks[1].id, "아케인셰이드-모자-physical-20", "고른 장비의 점수가 곧 분위 값");
});

test("잠재 수준: 점수 0(사냥용 잠재)은 세지 않고, 표본이 30개보다 적은 묶음은 뺀다, 다른 계열은 무시", () => {
  const picker = createLevelPicker();
  for (const row of rows("아케인셰이드", "장갑", "magical", [...Array(29).fill(10), 0, 0, 0])) picker.add(row);
  for (const row of rows("앱솔랩스", "장갑", "magical", Array(40).fill(5))) picker.add(row);
  const picked = picker.pick();
  assert.equal(picked.size, 0, "0점 셋을 빼면 29개라 모자라다");
  picker.add({ id: "x", family: "아케인셰이드", slot: "장갑", attackType: "magical", score: 12 });
  assert.equal(picker.pick().get(groupKey("아케인셰이드", "장갑", "magical")).sample, 30);
});

test("잠재 수준: 무기 종류 표본이 모자라면 같은 계열·공격 타입 무기 전체로, 방어구는 대신하지 않는다", () => {
  const picked = pickLevels([
    ...rows("제네시스", "차크람", "physical", [30, 31]),
    ...rows(
      "제네시스",
      "단검",
      "physical",
      Array.from({ length: 40 }, (_, index) => 20 + index / 2)
    )
  ]);
  const groups = new Map([...picked].map(([key, group]) => [key, { sample: group.sample, levels: group.picks }]));
  const chakram = findLevels(groups, { family: "제네시스", slot: "차크람", attackType: "physical" });
  assert.equal(chakram.scope, "weapons");
  assert.equal(chakram.sample, 42);
  assert.equal(findLevels(groups, { family: "제네시스", slot: "단검", attackType: "physical" }).scope, "slot");
  assert.equal(findLevels(groups, { family: "제네시스", slot: "차크람", attackType: "magical" }), null, "공격 타입이 다르면 없음");
  assert.equal(findLevels(groups, { family: "아케인셰이드", slot: "모자", attackType: "physical" }), null);
});

test("잠재 수준: 대표 장비의 잠재·에디 줄과 등급을 화면 모양으로", () => {
  const lines = levelLines({
    item_potential_option: [
      { option_name: "보스 공격력", option_value: "18.00%" },
      { option_name: "", option_value: "1" }
    ],
    item_additional_potential_option: [{ option_name: "물리 대미지", option_value: "9.90%" }],
    item_potential_option_grade: "4",
    item_additional_potential_option_grade: "3"
  });
  assert.deepEqual(lines, {
    potential: [{ name: "보스 공격력", value: "18.00%" }],
    additionalPotential: [{ name: "물리 대미지", value: "9.90%" }],
    potentialGrade: "4",
    additionalPotentialGrade: "3"
  });
});
