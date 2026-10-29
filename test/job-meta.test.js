const test = require("node:test");
const assert = require("node:assert/strict");
const { jobMeta, mainSetup, comboLabel } = require("../src/domain/stats/job-meta");

const line = (name, value) => ({ option_name: name, option_value: value });
const doc = (slotName, itemName, score, starforce = 0, extra = {}) => ({
  slot: slotName,
  itemName,
  score,
  starforce,
  item: { item_name: itemName, item_equipment_slot_name: slotName, ...extra }
});
const arcane = (star) => ["모자", "한벌옷", "장갑", "신발", "망토", "어깨"].map((slot) => doc(slot, `아케인셰이드 ${slot}`, 100, star));

test("직업 메타: 칸마다 점수가 가장 높은 장비가 메인 세팅", () => {
  const setup = mainSetup([doc("무기", "앱솔랩스 완드", 300), doc("무기", "제네시스 완드", 600), doc("반지", "A", 5), doc("반지 (2번째 슬롯)", "B", 7)]);
  assert.equal(setup.get("무기").itemName, "제네시스 완드");
  assert.equal(setup.size, 3);
});

test("직업 메타: 잠재 줄 조합은 같은 줄을 묶고, 공격력은 %와 깡을 나눈다", () => {
  assert.equal(comboLabel([line("마법 대미지", "20%"), line("마법 대미지", "19%"), line("최종 대미지", "6%")]), "마법 대미지 ×2 + 최종 대미지");
  assert.equal(comboLabel([line("마법 공격력", "3,000"), line("마법 공격력", "12%")]), "마법 공격력 + 마법 공격력%");
});

test("직업 메타: 무기·세트·장신구·스타포스를 캐릭터 비율로 센다", () => {
  const weapon = (potential, soul) =>
    doc("무기", "제네시스 완드", 600, 36, {
      item_potential_option: potential,
      item_additional_potential_option: [line("마법 대미지", "12%")],
      item_additional_option: [line("마법 공격력", "3,000"), line("마법 공격력", "2,900")],
      soul_info: { soul_name: soul },
      emblem_info: { emblem_name: "무자비한 문장", emblem_level: 10 }
    });
  const three = [line("마법 대미지", "20%"), line("마법 대미지", "20%"), line("마법 대미지", "20%")];
  const characters = [
    {
      spec: { combatPower: 300, itemScore: 1000, characterLevel: 280 },
      items: [weapon(three, "위대한 칼로스의 소울"), ...arcane(35), doc("반지", "거대한 공포", 20)]
    },
    {
      spec: { combatPower: 200, itemScore: 900, characterLevel: 270 },
      items: [weapon(three, "위대한 칼로스의 소울"), ...arcane(30), doc("반지", "벤젼스 링", 3)]
    },
    { spec: { combatPower: 100, itemScore: 800, characterLevel: 260 }, items: [weapon([line("최종 대미지", "8%")], "위대한 카링의 소울"), ...arcane(25)] },
    { spec: { combatPower: 50 }, items: [] }
  ];
  const meta = jobMeta(characters);
  assert.equal(meta.count, 3, "장비가 없는 캐릭터는 뺀다");
  assert.equal(meta.summary.avgCombatPower, 200);
  assert.equal(meta.summary.minCombatPower, 100);
  assert.deepEqual(meta.weapon.items, [{ label: "제네시스", share: 1 }]);
  assert.deepEqual(meta.weapon.potential[0], { label: "마법 대미지 ×3", share: 2 / 3 });
  assert.equal(meta.weapon.flame[0].label, "마법 공격력 ×2");
  assert.deepEqual(meta.weapon.soul[0], { label: "위대한 칼로스의 소울", share: 2 / 3 });
  assert.deepEqual(meta.weapon.emblem, [{ label: "무자비한 문장", share: 1 }]);
  assert.equal(meta.sets[0].label, "아케인 7", "제네시스 무기는 럭키로 아케인에 더한다");
  assert.deepEqual(
    meta.accessories.find((entry) => entry.group === "반지").rows.map((row) => [row.label, row.share]),
    [
      ["거대한 공포", 0.5],
      ["벤젼스 링", 0.5]
    ]
  );
  assert.equal(meta.starforce.find((entry) => entry.slot === "모자").avg, 30);
  assert.equal(meta.starforce.find((entry) => entry.slot === "무기").avg, 36);
});
