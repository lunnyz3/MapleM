const test = require("node:test");
const assert = require("node:assert/strict");
const { fairCharacters, gearWindow, peerKey, peerMedians, sampleOf } = require("../src/domain/stats/game-pool");

const row = (combatPower, extra = {}) => ({ itemScore: 600, characterLevel: 270, combatPower, ...extra });

test("미니게임: 템환산·레벨이 비슷한 캐릭터의 중앙값과 동떨어진 전투력(사냥 프리셋)은 뺀다", () => {
  const peers = Array.from({ length: 20 }, (_, index) => row(4e7 + index * 1e6, { ocid: `p${index}` }));
  const farming = row(1.5e7, { ocid: "farming" });
  const strong = row(4.4e7, { ocid: "strong" });
  const medians = peerMedians([...peers, farming, strong]);
  assert.equal(medians.size, 1);
  const kept = fairCharacters([farming, strong, row(9e6, { ocid: "low" })], medians, 1e7).map((entry) => entry.ocid);
  assert.deepEqual(kept, ["strong"]);
  // 비슷한 캐릭터가 모자란 묶음(다른 템환산)은 예상 전투력을 모르니 쓰지 않는다
  assert.deepEqual(fairCharacters([row(4e7, { itemScore: 1500 })], medians, 1e7), []);
  assert.notEqual(peerKey(row(1, { itemScore: 600 })), peerKey(row(1, { itemScore: 700 })));
  assert.equal(peerKey(row(1, { itemScore: 0 })), "");
  // 레벨을 모르는 캐릭터도 쓰지 않는다
  assert.deepEqual(fairCharacters([row(4.4e7, { characterLevel: 0 })], medians, 1e7), []);
});

test("미니게임: 무작위 고르기는 겹치지 않고 크기를 넘지 않는다", () => {
  const list = Array.from({ length: 10 }, (_, index) => index);
  const picked = sampleOf(list, 4);
  assert.equal(picked.length, 4);
  assert.equal(new Set(picked).size, 4);
  assert.equal(sampleOf(list, 30).length, 10);
});

test("미니게임: 장비창은 부위 순서대로, 한벌옷과 상의·하의 중 템환산이 높은 쪽만", () => {
  const doc = (slot, score, item = {}) => ({ score, starforce: 0, item: { item_equipment_slot_name: slot, item_name: `${slot} 아이템`, item_grade: "레전더리", ...item } });
  const gear = gearWindow([
    doc("반지", 3),
    doc("무기", 500, { starforce_upgrade: "35", item_potential_option: [{ option_name: "보스 공격력", option_value: "12%" }], item_potential_option_grade: "4" }),
    doc("한벌옷", 20),
    doc("상의", 15),
    doc("하의", 10),
    doc("무기", 100)
  ]);
  assert.deepEqual(
    gear.map((entry) => entry.slot),
    ["무기", "상의", "하의", "반지"]
  );
  assert.equal(gear[0].star, 35);
  assert.equal(gear[0].potential, "4");
  assert.equal(gear[1].potential, "");
  const overall = gearWindow([doc("한벌옷", 30), doc("상의", 15), doc("하의", 10)]);
  assert.deepEqual(
    overall.map((entry) => entry.slot),
    ["한벌옷"]
  );
});
