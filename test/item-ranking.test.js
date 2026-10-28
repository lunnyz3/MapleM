const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreItem, itemGroup, attackTypeOfItems } = require("../src/domain/items/score");
const { collectCharacterItems, itemFingerprint } = require("../src/domain/items/collect");
const { createItemCollector } = require("../src/services/item-collection.service");

const fixture = (name) => require(`./fixtures/characters/${name}.json`).details.itemEquipment.data;

const { masteryBonusLines } = require("../src/domain/items/mastery");

const option = (name, value) => ({ option_name: name, option_value: value });
const ring = (fields) => ({
  item_name: "테스트 반지",
  item_equipment_slot_name: "반지",
  item_equipment_page_name: "반지",
  item_basic_option: [],
  item_potential_option: [],
  item_additional_potential_option: [],
  item_additional_option: [],
  ...fields
});

test("장비 점수: 기본 옵션(아이템 공격력·스타포스)은 세지 않고 잠재·에디·추옵만 센다", () => {
  const bare = ring({ item_basic_option: [option("마법 공격력", "80000")] });
  assert.equal(scoreItem(bare, "magical").score, 0);
  const rolled = ring({ item_basic_option: [option("마법 공격력", "80000")], item_potential_option: [option("마법 대미지", "20%")] });
  assert.ok(scoreItem(rolled, "magical").score > 0);
  // 같은 잠재면 기본 옵션이 달라도 점수가 같다.
  const stronger = ring({ item_basic_option: [option("마법 공격력", "99999")], item_potential_option: [option("마법 대미지", "20%")] });
  assert.equal(scoreItem(stronger, "magical").score, scoreItem(rolled, "magical").score);
});

test("장비 점수: 무기와 방어구가 같은 저울에 있다(무기 기본 공격력이 점수를 지배하지 않는다)", () => {
  const data = fixture("유니온-피카츄");
  const attackType = attackTypeOfItems(data.item_equipment, data.character_class);
  assert.equal(attackType, "magical");
  const scoreOf = (name) => scoreItem(data.item_equipment.find((item) => item.item_name === name), attackType).score;
  const weapon = scoreOf("아케인셰이드 완드");
  const shoulder = scoreOf("아케인셰이드 메이지숄더");
  assert.ok(weapon < shoulder * 3, `weapon ${weapon} shoulder ${shoulder}`);
  assert.equal(scoreOf("유니온의 가호"), 0);
});

test("장비 점수: 문장은 문장 포함 점수에만 들어간다", () => {
  const data = fixture("유니온-피카츄");
  const shoulder = data.item_equipment.find((item) => item.item_name === "아케인셰이드 메이지숄더");
  const result = scoreItem(shoulder, "magical");
  assert.equal(result.hasEmblem, true);
  assert.ok(result.score > result.scoreWithoutEmblem);
});

test("장비 점수: 반대 공격 타입 옵션은 세지 않는다", () => {
  const item = ring({ item_potential_option: [option("물리 대미지", "20%")] });
  assert.ok(scoreItem(item, "physical").score > 0);
  assert.equal(scoreItem(item, "magical").score, 0);
});

test("장비 점수: 장비 마스터리로 오른 만큼은 빼고 원래 붙은 옵션으로 센다", async () => {
  const data = fixture("유니온-피카츄");
  const shoulder = data.item_equipment.find((item) => item.item_name === "아케인셰이드 메이지숄더");
  const lines = await masteryBonusLines(shoulder, { attackType: "magical", className: data.character_class });
  assert.deepEqual(lines.item_additional_potential_option, [4, 4, 4]);
  assert.ok(scoreItem(shoulder, "magical", lines).score < scoreItem(shoulder, "magical").score);
  // 마스터리가 없으면 아무것도 불러오지 않는다.
  assert.equal(await masteryBonusLines(ring({}), {}), null);
});

test("순위 묶음: 아케인셰이드·앱솔랩스만, 무기는 무기 종류별·방어구는 부위별", () => {
  assert.deepEqual(itemGroup({ item_name: "아케인셰이드 완드", item_equipment_page_name: "완드", item_equipment_slot_name: "무기" }), {
    slot: "완드",
    family: "아케인셰이드",
    label: "아케인셰이드 완드",
    weapon: true
  });
  assert.deepEqual(itemGroup({ item_name: "앱솔랩스 시프숄더", item_equipment_page_name: "어깨", item_equipment_slot_name: "어깨" }), {
    slot: "어깨",
    family: "앱솔랩스",
    label: "앱솔랩스 어깨",
    weapon: false
  });
  // 제네시스·장신구는 순위 대상이 아니다.
  assert.equal(itemGroup({ item_name: "제네시스 완드", item_equipment_page_name: "완드", item_equipment_slot_name: "무기" }).family, "");
  assert.equal(itemGroup({ item_name: "거대한 공포", item_equipment_slot_name: "반지 (3번째 슬롯)" }).slot, "반지");
});

test("장비 모으기: 착용·프리셋 장비를 한 번씩만 담고, 템환산 합이 가장 큰 프리셋을 고른다", async () => {
  const data = fixture("스카니아-디올");
  const result = await collectCharacterItems(data);
  const fingerprints = result.items.map((entry) => entry.fingerprint);
  assert.equal(new Set(fingerprints).size, fingerprints.length);
  // Every worn item is in the list as the worn copy.
  data.item_equipment.forEach((item) => {
    const entry = result.items.find((candidate) => candidate.fingerprint === itemFingerprint(item));
    assert.ok(entry, item.item_name);
    assert.equal(entry.worn, true);
  });
  const presetSums = data.equipment_preset.map((preset) =>
    preset.item_equipment
      .filter((item) => item.item_name)
      .reduce((sum, item) => sum + result.items.find((entry) => entry.fingerprint === itemFingerprint(item)).score, 0)
  );
  assert.equal(result.best.score, Math.round(Math.max(...presetSums) * 10) / 10);
  assert.ok(result.best.potential > 0 && result.best.additionalPotential > 0);
});

function fakeCollector({ ranking, collected = new Set(), now = Date.parse("2026-10-29T05:00:00+09:00") }) {
  const recorded = [];
  const calls = { ocid: 0, items: 0 };
  const collector = createItemCollector({
    fetchRankingPage: async (date, page) => ranking[date]?.[page - 1] || [],
    resolveOcid: async (name) => {
      calls.ocid += 1;
      return name === "없음" ? null : `ocid-${name}`;
    },
    fetchItems: async (ocid) => {
      calls.items += 1;
      return { item_equipment: [], ocid };
    },
    collectedSince: async (world, name) => collected.has(`${world}/${name}`),
    record: async (entry) => recorded.push(entry),
    delayMs: 0,
    now: () => now,
    logger: { log() {}, error() {} }
  });
  return { collector, recorded, calls };
}

const row = (name, world = "스카니아") => ({ character_name: name, world_name: world, character_combat_power: 100, date: "2026-10-29" });

test("수집: 오늘 랭킹을 모든 페이지 받아 캐릭터마다 저장하고, 오늘 이미 모은 캐릭터는 건너뛴다", async () => {
  const { collector, recorded, calls } = fakeCollector({
    ranking: { "2026-10-29": [[row("가"), row("나")], [row("다"), row("없음")], []] },
    collected: new Set(["스카니아/나"])
  });
  const status = await collector.runOnce();
  assert.equal(status.state, "done");
  assert.equal(status.rankingDate, "2026-10-29");
  assert.equal(status.total, 4);
  assert.deepEqual([status.saved, status.skipped, status.failed], [2, 1, 1]);
  assert.deepEqual(recorded.map((entry) => entry.ocid).sort(), ["ocid-가", "ocid-다"]);
  assert.equal(calls.items, 2);
});

test("수집: 오늘 랭킹이 아직 없으면 어제 랭킹을 쓴다", async () => {
  const { collector } = fakeCollector({ ranking: { "2026-10-28": [[row("가")]] } });
  const status = await collector.runOnce();
  assert.equal(status.rankingDate, "2026-10-28");
  assert.equal(status.saved, 1);
});

test("수집: 저장소를 쓸 수 없으면 아무것도 받지 않고 실패로 끝난다", async () => {
  const collector = createItemCollector({
    fetchRankingPage: async () => {
      throw new Error("should not be called");
    },
    resolveOcid: async () => null,
    fetchItems: async () => null,
    collectedSince: async () => false,
    record: async () => {},
    isAvailable: () => false,
    logger: { log() {}, error() {} }
  });
  const status = await collector.runOnce();
  assert.equal(status.state, "failed");
  assert.equal(status.total, 0);
});

test("수집: force 면 오늘 이미 모은 캐릭터도 다시 모은다(점수 규칙을 바꾼 뒤)", async () => {
  const { collector, recorded } = fakeCollector({
    ranking: { "2026-10-29": [[row("가"), row("나")]] },
    collected: new Set(["스카니아/가", "스카니아/나"])
  });
  const status = await collector.runOnce({ force: true });
  assert.deepEqual([status.saved, status.skipped], [2, 0]);
  assert.equal(recorded.length, 2);
});
