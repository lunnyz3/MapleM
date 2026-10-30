const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../web/src/lib/miniGames.mjs");

function seeded(seed = 7) {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

const items = [
  ...["가", "나", "다", "라", "마"].map((name, index) => ({ name: `반지${name}`, icon: `ring${index}`, slot: "반지", grade: "유니크" })),
  ...["가", "나", "다"].map((name, index) => ({ name: `모자${name}`, icon: `hat${index}`, slot: "모자", grade: "레전더리" })),
  { name: "같은아이콘", icon: "ring0", slot: "반지", grade: "에픽" }
];

test("반응속도: 기다림 1.2~4초, 미끼 등급은 레전더리가 아니고 바로 앞과 다르다, 평균·칭호", async () => {
  const { reactionDelay, decoyGrade, averageMs, reactionTitle } = await load();
  const random = seeded();
  for (let i = 0; i < 50; i += 1) {
    const delay = reactionDelay(random);
    assert.ok(delay >= 1200 && delay <= 4000, `delay ${delay}`);
    const grade = decoyGrade("epic", random);
    assert.ok(["rare", "unique"].includes(grade), grade);
  }
  assert.equal(averageMs([200, 300, Number.NaN, 0]), 250);
  assert.equal(averageMs([]), 0);
  assert.equal(reactionTitle(180), "번개 손");
  assert.equal(reactionTitle(240), "빠른 손");
  assert.equal(reactionTitle(0), "느긋한 손");
});

test("스타캐치: 별이 오를수록 구간이 좁아지고 빨라진다, 왕복 자리, 구간 판정", async () => {
  const { starStage, pingPong, zoneStart, inZone, STAR_MAX } = await load();
  assert.deepEqual(starStage(0), { width: 0.22, speed: 0.7 });
  assert.deepEqual(starStage(STAR_MAX), { width: 0.06, speed: 2.2 });
  assert.ok(starStage(20).width < starStage(10).width);
  assert.equal(pingPong(0, 1), 0);
  assert.equal(pingPong(0.5, 1), 0.5);
  assert.equal(pingPong(1.5, 1), 0.5);
  assert.equal(pingPong(2, 1), 0);
  const random = seeded();
  for (let i = 0; i < 30; i += 1) {
    const start = zoneStart(0.2, random);
    assert.ok(start >= 0 && start + 0.2 <= 1.0001);
  }
  assert.ok(inZone(0.35, 0.3, 0.1));
  assert.ok(!inZone(0.45, 0.3, 0.1));
});

test("짝 맞추기: 아이콘이 다른 장비로 짝마다 두 장", async () => {
  const { makeDeck } = await load();
  const deck = makeDeck(items, 4, seeded(3));
  assert.equal(deck.length, 8);
  const byPair = new Map();
  deck.forEach((card) => byPair.set(card.pair, [...(byPair.get(card.pair) || []), card]));
  assert.equal(byPair.size, 4);
  [...byPair.values()].forEach((cards) => {
    assert.equal(cards.length, 2);
    assert.equal(cards[0].item.icon, cards[1].item.icon);
  });
  assert.equal(new Set(deck.map((card) => card.item.icon)).size, 4);
  assert.equal(new Set(deck.map((card) => card.id)).size, 8);
  // 아이콘이 다른 장비가 모자라면 있는 만큼
  assert.equal(makeDeck(items, 20, seeded(3)).length, 16);
});

test("이름 맞히기: 보기 넷, 정답 포함, 이름·아이콘이 겹치지 않고 같은 부위가 먼저", async () => {
  const { makeQuiz } = await load();
  const quiz = makeQuiz(items, 5, seeded(11));
  assert.equal(quiz.length, 5);
  quiz.forEach(({ answer, options }) => {
    assert.equal(options.length, 4);
    assert.ok(options.includes(answer));
    assert.equal(new Set(options.map((item) => item.name)).size, 4);
    assert.equal(new Set(options.map((item) => item.icon)).size, 4);
    if (answer.slot === "반지") assert.ok(options.filter((item) => item.slot === "반지").length >= 3);
  });
});

test("아이템 줍기: 등급 점수, 연속 배수, 시간이 갈수록 더 자주·더 빨리", async () => {
  const { catchPoints, comboRate, spawnGap, fallSpeed } = await load();
  assert.equal(catchPoints("레전더리"), 50);
  assert.equal(catchPoints("노말"), 5);
  assert.equal(comboRate(0), 1);
  assert.equal(comboRate(8), 1.5);
  assert.equal(comboRate(20), 2);
  const fixed = () => 0.5;
  assert.ok(spawnGap(0, fixed) > spawnGap(29, fixed));
  assert.ok(fallSpeed(29, fixed) > fallSpeed(0, fixed));
});
