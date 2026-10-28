const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { fillPresetMasteryInfo } = require("../src/transform/equipment-mastery");

// 넥슨 API 는 착용 중인 목록(item_equipment)에만 mastery_info 를 주고 프리셋 장비에는 null 을 준다.
// 유니온 '피카츄': 착용 프리셋 3, 보스 세팅 프리셋 2.
const readFixture = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "characters", name), "utf8")).details.itemEquipment.data;
const presetItem = (data, presetNo, slot) =>
  data.equipment_preset.find((preset) => preset.preset_no === presetNo).item_equipment.find((item) => item.item_equipment_slot_name === slot);

test("프리셋 장비에 착용 목록의 같은 장비 mastery_info 를 옮긴다(피카츄 보스 프리셋 2: 장갑·어깨·신발·무기)", () => {
  const raw = readFixture("유니온-피카츄.json");
  assert.equal(raw.use_preset_no, 3);
  assert.equal(presetItem(raw, 2, "장갑").mastery_info, null);

  const data = fillPresetMasteryInfo(raw);
  const worn = (slot) => raw.item_equipment.find((item) => item.item_equipment_slot_name === slot);
  for (const slot of ["장갑", "어깨", "신발", "무기"]) {
    assert.deepEqual(presetItem(data, 2, slot).mastery_info, worn(slot).mastery_info, slot);
    assert.deepEqual(presetItem(data, 1, slot).mastery_info, worn(slot).mastery_info, slot);
  }
  assert.equal(presetItem(data, 2, "장갑").mastery_info.potential_option_point, 6);
  assert.equal(presetItem(data, 2, "어깨").mastery_info.additional_potential_option_point, 6);

  // 보스 프리셋의 한벌옷은 이름이 같지만 잠재가 다른 다른 장비(최대 HP 세트)다. 옮기지 않는다.
  const suit = presetItem(data, 2, "한벌옷");
  assert.equal(suit.item_name, worn("한벌옷").item_name);
  assert.notDeepEqual(suit.item_potential_option, worn("한벌옷").item_potential_option);
  assert.equal(suit.mastery_info, null);
  // 착용 목록에 없는 장비도 그대로 null
  assert.equal(presetItem(data, 2, "모자").mastery_info, null);

  // 받은 응답은 바꾸지 않는다.
  assert.equal(presetItem(raw, 2, "장갑").mastery_info, null);
});

test("모든 픽스처: 옮긴 mastery_info 는 부위·이름·스타포스·옵션이 같은 착용 장비의 것이다", () => {
  const dir = path.join(__dirname, "fixtures", "characters");
  let copied = 0;
  for (const file of fs.readdirSync(dir)) {
    const raw = readFixture(file);
    const data = fillPresetMasteryInfo(raw);
    data.equipment_preset.forEach((preset, presetIndex) => {
      preset.item_equipment.forEach((item, itemIndex) => {
        const before = raw.equipment_preset[presetIndex].item_equipment[itemIndex];
        if (before.mastery_info || !item.mastery_info) return;
        copied += 1;
        const source = raw.item_equipment.find(
          (worn) =>
            worn.item_equipment_slot_name === item.item_equipment_slot_name &&
            worn.item_name === item.item_name &&
            worn.starforce_upgrade === item.starforce_upgrade &&
            JSON.stringify(worn.item_potential_option) === JSON.stringify(item.item_potential_option) &&
            JSON.stringify(worn.item_additional_potential_option) === JSON.stringify(item.item_additional_potential_option) &&
            JSON.stringify(worn.item_additional_option) === JSON.stringify(item.item_additional_option),
        );
        assert.ok(source, `${file} 프리셋 ${preset.preset_no} ${item.item_name}`);
        assert.deepEqual(item.mastery_info, source.mastery_info);
      });
    });
  }
  assert.ok(copied >= 8, `옮긴 장비 ${copied}개`);
});

test("같은 장비가 착용 목록에 여럿이고 마스터리가 다르면 옮기지 않는다", () => {
  const ring = (point) => ({
    item_equipment_slot_name: "반지",
    item_name: "테스트 링",
    starforce_upgrade: 10,
    item_potential_option: [{ option_name: "물리 대미지", option_value: "5.00%" }],
    item_additional_potential_option: [],
    item_additional_option: [],
    mastery_info: point === null ? null : { mastery_level: 1, base_option_point: point, potential_option_point: 0, additional_option_point: 0, additional_potential_option_point: 0 },
  });
  const data = {
    item_equipment: [ring(1), ring(2)],
    equipment_preset: [{ preset_no: 1, item_equipment: [ring(null)] }],
  };
  assert.equal(fillPresetMasteryInfo(data).equipment_preset[0].item_equipment[0].mastery_info, null);

  const same = { ...data, item_equipment: [ring(1), ring(1)] };
  assert.equal(fillPresetMasteryInfo(same).equipment_preset[0].item_equipment[0].mastery_info.base_option_point, 1);

  // 옮길 것이 없으면 받은 객체를 그대로 돌려준다.
  const nothing = { item_equipment: [ring(null)], equipment_preset: [{ preset_no: 1, item_equipment: [ring(null)] }] };
  assert.equal(fillPresetMasteryInfo(nothing), nothing);
  assert.deepEqual(fillPresetMasteryInfo({}), {});
});
