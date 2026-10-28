const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreItem, itemGroup, attackTypeOfItems } = require("../src/domain/items/score");
const { collectCharacterItems, itemFingerprint } = require("../src/domain/items/collect");
const { createItemCollector } = require("../src/services/item-collection.service");

const fixture = (name) => require(`./fixtures/characters/${name}.json`).details.itemEquipment.data;

test("장비 점수: 무기가 가장 크고, 전투력 공식에 없는 옵션만 있으면 0점", () => {
  const data = fixture("유니온-피카츄");
  const attackType = attackTypeOfItems(data.item_equipment, data.character_class);
  assert.equal(attackType, "magical");
  const scores = data.item_equipment.map((item) => ({ name: item.item_name, ...scoreItem(item, attackType) }));
  const weapon = scores.find((entry) => entry.name === "아케인셰이드 완드");
  assert.ok(weapon.score > 500, `weapon score ${weapon.score}`);
  assert.equal(Math.max(...scores.map((entry) => entry.score)), weapon.score);
  const badge = scores.find((entry) => entry.name === "유니온의 가호");
  assert.equal(badge.score, 0);
});

test("장비 점수: 문장은 '문장 포함' 점수에만 들어간다", () => {
  const data = fixture("유니온-피카츄");
  const shoulder = data.item_equipment.find((item) => item.item_name === "아케인셰이드 메이지숄더");
  const result = scoreItem(shoulder, "magical");
  assert.equal(result.hasEmblem, true);
  assert.ok(result.score > result.scoreWithoutEmblem);
});

test("장비 점수: 반대 공격 타입 옵션은 세지 않는다", () => {
  const item = {
    item_name: "테스트 반지",
    item_equipment_page_name: "반지",
    item_basic_option: [{ option_name: "물리 공격력", option_value: "500" }],
    item_potential_option: [],
    item_additional_potential_option: [],
    item_additional_option: []
  };
  assert.ok(scoreItem(item, "physical").score > 0);
  assert.equal(scoreItem(item, "magical").score, 0);
});

test("순위 묶음: 계열 장비는 '계열 부위', 나머지는 아이템 이름, 슬롯 번호는 부위에서 뺀다", () => {
  assert.deepEqual(itemGroup({ item_name: "아케인셰이드 완드", item_equipment_page_name: "완드", item_equipment_slot_name: "무기" }), {
    slot: "무기",
    family: "아케인셰이드",
    label: "아케인셰이드 무기"
  });
  assert.deepEqual(itemGroup({ item_name: "아케인셰이드 메이지숄더", item_equipment_page_name: "어깨" }), {
    slot: "어깨",
    family: "아케인셰이드",
    label: "아케인셰이드 어깨"
  });
  assert.deepEqual(itemGroup({ item_name: "거대한 공포", item_equipment_slot_name: "반지 (3번째 슬롯)" }), {
    slot: "반지",
    family: "거대한 공포",
    label: "거대한 공포"
  });
});

test("장비 모으기: 착용·프리셋 장비를 한 번씩만 담고, 템환산 합이 가장 큰 프리셋을 고른다", () => {
  const data = fixture("스카니아-디올");
  const result = collectCharacterItems(data);
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
