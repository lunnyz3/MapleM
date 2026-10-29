const test = require("node:test");
const assert = require("node:assert/strict");
const { jobMeta, mainSetup, lineSum, flameScore, buckets } = require("../src/domain/stats/job-meta");
const scoreMax = require("../src/game-data/item-score-max.json");

const line = (name, value) => ({ option_name: name, option_value: value });
const doc = (slotName, itemName, score, starforce = 0, extra = {}, flamePart = 0) => ({
  slot: slotName,
  itemName,
  score,
  starforce,
  parts: { additional: flamePart },
  item: { item_name: itemName, item_equipment_slot_name: slotName, ...extra }
});

test("직업 메타: 칸마다 점수가 가장 높은 장비가 메인 세팅", () => {
  const setup = mainSetup([doc("무기", "앱솔랩스 완드", 300), doc("무기", "제네시스 완드", 600), doc("반지", "A", 5), doc("반지 (2번째 슬롯)", "B", 7)]);
  assert.equal(setup.get("무기").itemName, "제네시스 완드");
  assert.equal(setup.size, 3);
});

test("직업 메타: 대미지 줄 합(마스터리 포함 값 그대로), 추옵 점수, N 이상 구간", () => {
  assert.equal(lineSum([line("마법 대미지", "20.22%"), line("마법 대미지", "18.78%"), line("최종 대미지", "6%")], "마법 대미지"), 39);
  const best = scoreMax.slots["반지"].additional;
  assert.equal(flameScore({ parts: { additional: best / 2 } }, "반지"), 50);
  assert.equal(flameScore({ parts: { additional: best * 2 } }, "반지"), 100, "100점에서 자른다");
  assert.deepEqual(buckets([61, 52, 50, 30], 4, 5), [
    { min: 60, share: 0.25 },
    { min: 55, share: 0.25 },
    { min: 50, share: 0.75 },
    { min: 45, share: 0.75 },
    { min: 40, share: 0.75 }
  ]);
  assert.deepEqual(buckets([20, 20], 2, 5), [{ min: 20, share: 1 }], "모두 넘으면 거기서 멈춘다");
});

test("직업 메타: 무기 순위와 장신구 10성 비율·추옵 순위", () => {
  const weapon = (damage, flamePart) =>
    doc(
      "무기",
      "제네시스 완드",
      600,
      36,
      {
        item_potential_option: [line("마법 대미지", `${damage}%`), line("마법 대미지", "20%"), line("마법 대미지", "20%")],
        item_additional_potential_option: [line("마법 대미지", "12%")],
        item_additional_option: [line("마법 공격력", "3,000"), line("최종 대미지", "6%")],
        soul_info: { soul_name: "위대한 칼로스의 소울" },
        emblem_info: { emblem_name: "무자비한 문장", emblem_level: 10 }
      },
      flamePart
    );
  const who = (name, power) => ({
    characterName: name,
    worldName: "스카니아",
    attackType: "magical",
    combatPower: power,
    itemScore: 1000,
    characterLevel: 280
  });
  const meta = jobMeta([
    { spec: who("가", 300), items: [weapon(20, 20), doc("반지", "거대한 공포", 20, 10, {}, 15), doc("반지 (2번째 슬롯)", "벤젼스 링", 3, 5, {}, 5)] },
    { spec: who("나", 200), items: [weapon(10, 25), doc("반지", "거대한 공포", 20, 10, {}, 18)] },
    { spec: { combatPower: 50 }, items: [] }
  ]);
  assert.equal(meta.count, 2);
  assert.equal(meta.damageName, "마법 대미지");
  assert.deepEqual(
    meta.weapon.potential.ranking.map((row) => [row.name, row.value]),
    [
      ["가", 60],
      ["나", 50]
    ]
  );
  assert.equal(meta.weapon.potential.buckets[0].min, 60);
  assert.equal(meta.weapon.potential.buckets[0].share, 0.5);
  assert.equal(meta.weapon.flame.ranking[0].name, "나", "추옵은 점수 순");
  assert.match(meta.weapon.flame.ranking[0].text, /최종 대미지 6%/);
  const rings = meta.accessories.find((entry) => entry.group === "반지");
  assert.equal(rings.items, 3);
  assert.equal(rings.maxedShare, 2 / 3);
  assert.deepEqual(
    rings.ranking.map((row) => [row.name, row.itemName, row.starforce]),
    [
      ["나", "거대한 공포", 10],
      ["가", "거대한 공포", 10],
      ["가", "벤젼스 링", 5]
    ]
  );
  assert.deepEqual(meta.weapon.soul, [{ label: "위대한 칼로스의 소울", share: 1 }]);
});
