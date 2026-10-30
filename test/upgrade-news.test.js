const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyChange, buildNews, newsLine, maxStar, groupOf } = require("../src/domain/stats/upgrade-news");

const item = (name, starforce, score) => ({ name, starforce, score });

test("강화 소식: 별 상승·최대 별 달성·옵션 대박·새 장비를 가르고 나머지는 뺀다", () => {
  const star = classifyChange({ slot: "무기", from: item("제네시스 해머", 33, 900), to: item("제네시스 해머", 35, 950) });
  assert.equal(star.type, "star");
  assert.equal(star.reached, true);
  const ring = classifyChange({ slot: "반지 (3번째 슬롯)", from: item("감시자의 눈", 8, 50), to: item("감시자의 눈", 9, 52) });
  assert.equal(ring.type, "star");
  assert.equal(ring.reached, false);
  assert.equal(ring.slot, "반지");
  const option = classifyChange({ slot: "어깨", from: item("아케인셰이드 아처숄더", 35, 60), to: item("아케인셰이드 아처숄더", 35, 90) });
  assert.equal(option.type, "option");
  assert.ok(option.gain >= 8);
  // 같은 이름인데 별이 크게 뛰면 다른 장비로 바꾼 것
  const swap = classifyChange({ slot: "장갑", from: item("아케인셰이드 메이지글러브", 0, 10), to: item("아케인셰이드 메이지글러브", 35, 60) });
  assert.equal(swap.type, "new");
  assert.equal(swap.reached, true);
  const fresh = classifyChange({ slot: "모자", from: item("앱솔랩스 메이지크라운", 22, 20), to: item("아케인셰이드 메이지햇", 22, 40) });
  assert.equal(fresh.type, "new");
  // 반지는 프리셋마다 칸이 섞여 다른 이름은 소식이 아니다
  assert.equal(classifyChange({ slot: "반지", from: item("가", 5, 10), to: item("나", 5, 40) }), null);
  assert.equal(classifyChange({ slot: "칭호", from: item("가", 0, 1), to: item("나", 0, 9) }), null);
  assert.equal(classifyChange({ slot: "어깨", from: item("가", 10, 30), to: item("가", 10, 31) }), null);
  assert.equal(classifyChange({ slot: "어깨", from: item("가", 10, 30), to: item("가", 9, 25) }), null);
  assert.equal(classifyChange({ slot: "어깨", from: null, to: item("가", 10, 30) }), null);
  assert.equal(maxStar("벨트"), 15);
  assert.equal(maxStar("귀고리"), 10);
  assert.equal(maxStar("무기"), 35);
  assert.equal(groupOf("목걸이 (2번째 슬롯)"), "목걸이");
});

test("강화 소식: 하루치를 세고 종류마다 위만 모아 무게 순, 전광판 문구", () => {
  const rows = [
    { ocid: "a", worldName: "스카니아", characterName: "가", changes: [{ slot: "무기", from: item("제네시스 해머", 34, 900), to: item("제네시스 해머", 35, 950) }] },
    { ocid: "b", worldName: "루나", characterName: "나", changes: [
      { slot: "어깨", from: item("아케인셰이드 아처숄더", 35, 60), to: item("아케인셰이드 아처숄더", 35, 90) },
      { slot: "귀고리", from: item("커맨더 포스 이어링", 5, 20), to: item("커맨더 포스 이어링", 6, 21) }
    ] },
    { ocid: "c", worldName: "루나", characterName: "다", changes: [{ slot: "어깨", from: item("가", 1, 1), to: item("가", 1, 1) }] }
  ];
  const news = buildNews(rows, 1);
  assert.deepEqual(news.counts, { star: 2, reached: 1, option: 1, new: 0, characters: 2 });
  assert.equal(news.events.length, 2);
  assert.equal(news.events[0].name, "가");
  assert.equal(news.events[1].type, "option");
  assert.equal(newsLine(news.events[0]), "축하해요! 스카니아 가님 제네시스 해머 ★35 달성");
  assert.match(newsLine(news.events[1]), /옵션 대박! 템환산 \+/);
});
