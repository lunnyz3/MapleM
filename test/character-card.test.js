const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCard, cardScale, gearMetrics, percentile, rating } = require("../src/domain/stats/character-card");

const doc = (ocid, slot, extra = {}) => ({ ocid, score: 10, starforce: 0, parts: { additional: 0 }, item: { item_equipment_slot_name: slot }, ...extra });

test("캐릭터 카드: 백분위 → 40~99점, 가운데 61·위 10% 90 안팎", () => {
  assert.equal(rating(0), 40);
  assert.equal(rating(1), 99);
  assert.equal(rating(0.5), 61);
  assert.equal(rating(0.9), 90);
  const sorted = [1, 2, 2, 3];
  assert.equal(percentile(sorted, 2), 0.5);
  assert.equal(percentile(sorted, 10), 1);
  assert.equal(percentile([], 5), 0);
});

test("캐릭터 카드: 추옵은 추옵이 붙는 칸만 평균, 스타포스는 메인 세팅 합", () => {
  const docs = [
    doc("a", "무기", { starforce: 30, parts: { additional: 29.5 } }),
    doc("a", "반지 (2번째 슬롯)", { starforce: 10, parts: { additional: 0 } }),
    doc("a", "칭호", { starforce: 0, parts: { additional: 5 } }),
    doc("a", "무기", { score: 1, starforce: 5 })
  ];
  assert.deepEqual(gearMetrics(docs), { flame: 50, starforce: 40 });
});

test("캐릭터 카드: 직업 분포 안에서 여섯 능력치와 종합 점수·등급", () => {
  const specs = Array.from({ length: 100 }, (_, index) => ({ combatPower: (index + 1) * 1e6, itemScore: index + 1, potential: index, additionalPotential: index }));
  const docs = Array.from({ length: 20 }, (_, index) => doc(`p${index}`, "무기", { starforce: index, parts: { additional: index } }));
  const scale = cardScale(specs, docs);
  assert.equal(scale.count, 100);
  assert.equal(scale.flame.length, 20);
  const top = buildCard({ characterClass: "렌", combatPower: 1, itemScore: 100, potential: 99, additionalPotential: 99 }, [doc("me", "무기", { starforce: 40, parts: { additional: 29.5 } })], scale, { power: 2e8 });
  assert.equal(top.className, "렌");
  assert.deepEqual(top.stats.map((stat) => stat.key), ["power", "itemScore", "potential", "additional", "flame", "starforce"]);
  // 화면 전투력(2억)이 저장된 전투력(1) 대신 쓰인다
  assert.equal(top.stats[0].value, 2e8);
  assert.equal(top.stats[0].rating, 99);
  assert.ok(top.ovr >= 95);
  assert.equal(top.tier, "legendary");
  const low = buildCard({ characterClass: "렌", combatPower: 1e6, itemScore: 1, potential: 0, additionalPotential: 0 }, [], scale);
  assert.equal(low.tier, "rare");
  assert.ok(low.stats.every((stat) => stat.rating >= 40 && stat.rating <= 99));
});
