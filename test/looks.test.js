const test = require("node:test");
const assert = require("node:assert/strict");
const { lookFromApi, withShare } = require("../src/domain/looks/look");

test("코디: 헤어·성형·피부·캐시템 이름(같은 부위·이름은 한 번), 아이콘은 따로", () => {
  const beauty = {
    character_gender: "Female",
    character_hair: { hair_name: "영원의 노래 헤어", base_color: "파란색", mix_color: null, mix_rate: "0" },
    character_face: { face_name: "양기녀 얼굴", base_color: "검은색", mix_color: "빨간색", mix_rate: "48" },
    character_skin_name: "홍조 꽃잎 스킨"
  };
  const cash = {
    cash_item_equipment: [
      { cash_item_equipment_page_name: "모자", cash_item_equipment_slot_name: "모자", cash_item_name: "10주년 축하해!", cash_item_icon: "https://open.api.nexon.com/x.png" },
      { cash_item_equipment_page_name: "모자", cash_item_equipment_slot_name: "모자", cash_item_name: "10주년 축하해!", cash_item_icon: "https://open.api.nexon.com/x.png" },
      { cash_item_equipment_page_name: "망토", cash_item_equipment_slot_name: "망토", cash_item_name: "아루 에루 네온 사인 망토", cash_item_icon: "" },
      { cash_item_equipment_slot_name: "신발", cash_item_name: null },
      { cash_item_equipment_slot_name: "반지 (2번째 슬롯)", cash_item_name: "말풍선 반지" }
    ]
  };
  const look = lookFromApi({ beauty, cash });
  assert.equal(look.gender, "Female");
  assert.deepEqual(look.hair, { name: "영원의 노래 헤어", color: "파란색", mix: "", rate: 0 });
  assert.deepEqual(look.face, { name: "양기녀 얼굴", color: "검은색", mix: "빨간색", rate: 48 });
  assert.equal(look.skin, "홍조 꽃잎 스킨");
  assert.deepEqual(look.items, [
    { slot: "모자", name: "10주년 축하해!" },
    { slot: "망토", name: "아루 에루 네온 사인 망토" }
  ]);
  assert.deepEqual(look.icons, [{ name: "10주년 축하해!", slot: "모자", icon: "https://open.api.nexon.com/x.png" }]);
  assert.equal(lookFromApi({ beauty: {}, cash: {} }), null);
});

test("코디 순위: 전체 대비 비율", () => {
  assert.deepEqual(withShare([{ name: "a", count: 3 }, { name: "b", count: 1 }], 8, 1), [{ name: "a", count: 3, share: 0.375 }]);
});
