const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreItem, itemGroup, attackTypeOfItems } = require("../src/domain/items/score");
const { collectCharacterItems, itemFingerprint } = require("../src/domain/items/collect");
const { createItemCollector } = require("../src/services/item-collection.service");

const fixture = (name) => require(`./fixtures/characters/${name}.json`).details.itemEquipment.data;

const weights = require("../src/game-data/item-score.json").weights;

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
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.06, `${actual} != ${expected}`);

test("템환산: 옵션 값 × 가중치의 합(최종 대미지 1% = 1.42216점, 깡공 1 = 0.00474점)", () => {
  close(scoreItem(ring({ item_potential_option: [option("최종 대미지", "10%")] })).score, 10 * weights.finalDamage);
  close(scoreItem(ring({ item_basic_option: [option("마법 공격력", "1000")] })).score, 1000 * weights.attack);
  // 기준 아이템(깡공 82,865 + 최종 46.4% + 대미지 108.6%)은 500점
  const reference = ring({
    item_basic_option: [option("물리 공격력", "82865")],
    item_potential_option: [option("최종 대미지", "46.4%"), option("물리 대미지", "108.6%")]
  });
  close(scoreItem(reference).score, 500);
});

test("템환산: 스타포스가 다르면(기본 옵션이 다르면) 점수가 다르다", () => {
  const at35 = ring({ item_basic_option: [option("마법 공격력", "80000")], item_potential_option: [option("마법 대미지", "20%")] });
  const at36 = ring({ item_basic_option: [option("마법 공격력", "82000")], item_potential_option: [option("마법 대미지", "20%")] });
  assert.ok(scoreItem(at36).score > scoreItem(at35).score);
});

test("템환산: 기본 옵션에 들어 있는 같은 스탯 추가 옵션은 추옵 점수로 옮긴다(합계는 같다)", () => {
  const item = ring({
    item_basic_option: [option("마법 공격력", "1000")],
    item_additional_option: [option("마법 공격력", "300"), option("보스 공격력", "10%")]
  });
  const result = scoreItem(item);
  close(result.score, 1000 * weights.attack + 10 * weights.bossDamage);
  close(result.parts.basic, 700 * weights.attack);
  close(result.parts.additional, 300 * weights.attack + 10 * weights.bossDamage);
});

test("템환산: 물리·마법 중 큰 쪽, 제네시스는 최종 대미지 +10, 문장은 문장 포함 점수에만", () => {
  const mixed = ring({ item_potential_option: [option("물리 대미지", "30%"), option("마법 대미지", "10%")] });
  close(scoreItem(mixed).score, 30 * weights.damagePercent);
  const genesis = ring({ item_name: "제네시스 완드" });
  close(scoreItem(genesis).score, 10 * weights.finalDamage);
  const data = fixture("유니온-피카츄");
  const shoulder = data.item_equipment.find((item) => item.item_name === "아케인셰이드 메이지숄더");
  const result = scoreItem(shoulder);
  assert.equal(result.hasEmblem, true);
  assert.ok(result.score > result.scoreWithoutEmblem);
});

test("템환산: 항목별 점수(기본·추옵·잠재·에디·소울·문장)의 합이 전체 점수", () => {
  const data = fixture("유니온-피카츄");
  const shoulder = data.item_equipment.find((item) => item.item_name === "아케인셰이드 메이지숄더");
  const result = scoreItem(shoulder);
  const sum = Object.values(result.parts).reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - result.score) < 0.35, `${sum} vs ${result.score}`); // 항목마다 반올림
  close(result.score - result.parts.emblem, result.scoreWithoutEmblem);
  assert.equal(result.parts.basic, 0); // 어깨 기본 옵션은 방어력뿐
});

test("템환산: 장비 마스터리로 오른 값도 넥슨이 준 그대로 센다", () => {
  const data = fixture("유니온-피카츄");
  const shoulder = data.item_equipment.find((item) => item.item_name === "아케인셰이드 메이지숄더");
  const plain = { ...shoulder, mastery_info: null };
  assert.equal(scoreItem(shoulder).score, scoreItem(plain).score);
  const lines = shoulder.item_additional_potential_option.map((entry) => Number(String(entry.option_value).replace(/[^0-9.]/g, "")));
  assert.ok(lines.some((value) => value > 0));
});

test("순위 묶음: 제네시스·아케인셰이드만, 무기는 무기 종류별·방어구는 부위별", () => {
  assert.deepEqual(itemGroup({ item_name: "아케인셰이드 완드", item_equipment_page_name: "완드", item_equipment_slot_name: "무기" }), {
    slot: "완드",
    family: "아케인셰이드",
    label: "아케인셰이드 완드",
    weapon: true
  });
  assert.deepEqual(itemGroup({ item_name: "아케인셰이드 시프숄더", item_equipment_page_name: "어깨", item_equipment_slot_name: "어깨" }), {
    slot: "어깨",
    family: "아케인셰이드",
    label: "아케인셰이드 어깨",
    weapon: false
  });
  // 앱솔랩스는 순위에서 뺐다.
  assert.equal(itemGroup({ item_name: "앱솔랩스 시프숄더", item_equipment_slot_name: "어깨" }).family, "");
  assert.equal(itemGroup({ item_name: "제네시스 완드", item_equipment_page_name: "완드", item_equipment_slot_name: "무기" }).label, "제네시스 완드");
  // 장신구는 순위 대상이 아니다.
  assert.equal(itemGroup({ item_name: "거대한 공포", item_equipment_slot_name: "반지 (3번째 슬롯)" }).family, "");
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

test("레벨 훑기: 랭킹 캐릭터 + 그 길드·길드 랭킹 길드의 길드원 중 기준 레벨 이상만, 높은 레벨부터", async () => {
  const { sweepCandidates } = require("../src/services/character-sweep.service");
  const ranking = {
    level: [[{ world_name: "스카니아", character_name: "가", character_level: 290, guild_name: "길드A" }]],
    union: [[{ world_name: "스카니아", character_name: "레벨모름", guild_name: "" }]],
    "sharenian-waterway": [[{ world_name: "루나", guild_name: "길드B" }]]
  };
  const members = {
    "스카니아/길드A": [{ character_name: "가", character_level: 290 }, { character_name: "나", character_level: 275 }, { character_name: "다", character_level: 260 }],
    "루나/길드B": [{ character_name: "라", character_level: 280 }]
  };
  const { rows, stats } = await sweepCandidates({
    fetchRanking: async (type, page) => ranking[type]?.[page - 1] || [],
    fetchGuildMembers: async (world, guild) => members[`${world}/${guild}`] || [],
    minLevel: 270,
    logger: { log() {} }
  });
  assert.deepEqual(rows.map((row) => `${row.world_name}/${row.character_name}/${row.character_level}`), ["스카니아/가/290", "루나/라/280", "스카니아/나/275"]);
  assert.equal(stats.guilds, 2);
  assert.equal(stats.unknownLevel, 1);
});

test("변경 이력: 시간순 기록에서 닉네임·길드·직업이 바뀐 때만 뽑는다", () => {
  const { changesFrom } = require("../src/services/character-history.service");
  const at = (day) => new Date(`2026-10-${day}T00:00:00Z`);
  const events = changesFrom([
    { at: at(1), name: "가", guild: "A", class: "비숍" },
    { at: at(2), name: "가", guild: "A", class: "비숍" },
    { at: at(3), name: "나", guild: undefined, class: "비숍" },
    { at: at(4), name: "나", guild: "B", class: "아크메이지(썬,콜)" }
  ]);
  assert.deepEqual(
    events.map((event) => `${event.field}:${event.from}>${event.to}`),
    ["name:가>나", "guild:A>B", "class:비숍>아크메이지(썬,콜)"]
  );
});
