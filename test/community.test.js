const test = require("node:test");
const assert = require("node:assert/strict");
const { checkMessage, checkNickname } = require("../src/domain/community/text-filter");
const { GAME_RULES, weekKey, sortScore, valueOf, checkScore, issueToken, verifyToken, rankRows } = require("../src/domain/community/arcade-scores");
const { fortuneOf } = require("../src/domain/community/fortune");

test("전광판 글: 욕설·링크·전화번호·도배·길이를 막고 공백을 다듬는다", () => {
  assert.deepEqual(checkMessage("  스카니아   길드원 모집합니다  ", 40), { ok: true, text: "스카니아 길드원 모집합니다" });
  assert.deepEqual(checkMessage("보지 마세요 이 장비", 40), { ok: true, text: "보지 마세요 이 장비" });
  assert.equal(checkMessage("", 40).reason, "empty");
  assert.equal(checkMessage("가".repeat(41), 40).reason, "long");
  assert.equal(checkMessage("놀러오세요 www.example.com", 40).reason, "link");
  assert.equal(checkMessage("open.kakao 링크로", 40).reason, "link");
  assert.equal(checkMessage("연락 010-1234-5678", 40).reason, "phone");
  assert.equal(checkMessage("ㅋㅋㅋㅋㅋㅋㅋ", 40).reason, "repeat");
  assert.equal(checkMessage("시 발 진짜", 40).reason, "banned");
  assert.equal(checkMessage("ㅅ.ㅂ", 40).reason, "banned");
  assert.equal(checkMessage("FUCK", 40).reason, "banned");
  // 눈에 안 보이는 글자는 지운다
  assert.deepEqual(checkMessage("안​녕", 40), { ok: true, text: "안녕" });
});

test("닉네임: 한글·영문·숫자만, 길이·욕설", () => {
  assert.deepEqual(checkNickname("피카츄 01", 12), { ok: true, text: "피카츄 01" });
  assert.equal(checkNickname("<script>", 12).reason, "chars");
  assert.equal(checkNickname("가나다라마바사아자차카타파", 12).reason, "long");
  assert.equal(checkNickname("병신", 12).reason, "banned");
  assert.equal(checkNickname("   ", 12).reason, "empty");
});

test("랭킹: 이번 주 열쇠는 서울 월요일, 낮을수록 좋은 기록은 음수로 정렬", () => {
  // 2026-10-30(금) 10:00 KST → 그 주 월요일 2026-10-26
  assert.equal(weekKey(new Date("2026-10-30T01:00:00Z")), "2026-10-26");
  // 일요일 23:30 KST 는 아직 그 주
  assert.equal(weekKey(new Date("2026-11-01T14:30:00Z")), "2026-10-26");
  // 월요일 00:30 KST 는 새 주
  assert.equal(weekKey(new Date("2026-11-01T15:30:00Z")), "2026-11-02");
  assert.equal(sortScore("reaction", 230), -230);
  assert.equal(valueOf("reaction", -230), 230);
  assert.equal(sortScore("catch", 1200), 1200);
  assert.ok(sortScore("reaction", 200) > sortScore("reaction", 300));
  assert.equal(Object.keys(GAME_RULES).length, 11);
});

test("랭킹: 점수 범위와 최소 플레이 시간", () => {
  assert.deepEqual(checkScore("quiz", 9, 20000), { ok: true, value: 9 });
  assert.equal(checkScore("quiz", 11, 20000).reason, "value");
  assert.equal(checkScore("quiz", 9, 3000).reason, "fast");
  assert.equal(checkScore("catch", 2500, 29000).reason, "fast");
  assert.equal(checkScore("reaction", 50, 60000).reason, "value");
  assert.equal(checkScore("nope", 1, 60000).reason, "game");
  assert.equal(checkScore("vs", Number.NaN, 60000).reason, "value");
  assert.deepEqual(checkScore("memory", 12.4, 10000), { ok: true, value: 12 });
});

test("랭킹: 시작 표는 게임·시각이 맞고 서명이 같아야 받는다", () => {
  const now = Date.UTC(2026, 9, 30, 1);
  const token = issueToken("secret", "quiz", now);
  assert.deepEqual(verifyToken("secret", token, "quiz", now + 30000), { ok: true, issuedAt: now });
  assert.equal(verifyToken("other", token, "quiz", now + 30000).ok, false);
  assert.equal(verifyToken("secret", token, "catch", now + 30000).ok, false);
  assert.equal(verifyToken("secret", token, "quiz", now + 4 * 60 * 60 * 1000).ok, false);
  const forged = token.replace(/\.[^.]+\./, `.${(now - 600000).toString(36)}.`);
  assert.equal(verifyToken("secret", forged, "quiz", now + 30000).ok, false);
  assert.equal(verifyToken("secret", "a.b.c", "quiz", now).ok, false);
});

test("랭킹: 같은 점수는 같은 순위", () => {
  const rows = rankRows([{ score: 10 }, { score: 10 }, { score: 8 }, { score: 7 }]);
  assert.deepEqual(
    rows.map((row) => row.rank),
    [1, 1, 3, 4]
  );
});

test("오늘의 운세: 같은 날 같은 캐릭터는 같은 운세, 날이 바뀌면 달라진다", () => {
  const a = fortuneOf({ world: "스카니아", name: "피카츄", date: "2026-10-30" });
  const b = fortuneOf({ world: "스카니아", name: "피카츄", date: "2026-10-30" });
  assert.deepEqual(a, b);
  assert.ok(a.total >= 30 && a.total <= 100);
  assert.equal(a.areas.length, 4);
  a.areas.forEach((area) => assert.ok(area.stars >= 1 && area.stars <= 5 && area.line));
  assert.ok(a.luckyBoss && a.luckyWorld && a.luckyGrade && a.luckyNumber >= 1);
  const days = new Set(Array.from({ length: 10 }, (_, day) => fortuneOf({ world: "스카니아", name: "피카츄", date: `2026-11-${String(day + 1).padStart(2, "0")}` }).total));
  assert.ok(days.size > 3);
});

test("캐릭터 궁합: 순서와 상관없이 같은 점수, 실제 비교 줄", () => {
  const { matchScore, matchPoints, lineOf } = require("../src/domain/community/match");
  const a = { world: "스카니아", name: "피카츄" };
  const b = { world: "루나", name: "라이츄" };
  assert.equal(matchScore(a, b), matchScore(b, a));
  assert.ok(matchScore(a, b) >= 20 && matchScore(a, b) <= 100);
  assert.ok(lineOf(100) && lineOf(20));
  const points = matchPoints(
    { world: "스카니아", name: "가", className: "비숍", level: 280, power: 3e8, attackType: "magical" },
    { world: "스카니아", name: "나", className: "히어로", level: 270, power: 1e8, attackType: "physical" }
  );
  assert.equal(points[0], "둘 다 스카니아 월드라 바로 만날 수 있어요.");
  assert.equal(points[1], "물리·마법이 섞여 균형이 좋아요.");
  assert.equal(points[2], "가님이 전투력 3배로 든든하게 이끌어요.");
  assert.equal(points[3], "가님이 10레벨 선배예요.");
  // 모은 스펙이 없으면 월드 줄만
  assert.deepEqual(matchPoints({ world: "루나", name: "가", power: 0, level: 0 }, { world: "크로아", name: "나", power: 0, level: 0 }), ["루나와 크로아, 월드가 달라 아쉬워요."]);
});

test("닉네임 생성기: 빈도표를 따라 짓고, 있는 이름·반복·욕설·길이를 거른다", () => {
  const { buildModel, generateName, generateNames } = require("../src/domain/community/nickname-model");
  const names = ["햄스터", "햄찌", "햄토리", "별빛", "별사탕", "사탕별", "토리빵"];
  const model = buildModel(names, 2);
  assert.ok(model.get("^^").has("햄"));
  let seed = 9;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const existing = new Set(names);
  const made = generateNames(model, { order: 2, min: 2, max: 6, existing, random }, 5);
  made.forEach((name) => {
    assert.ok(!existing.has(name), name);
    assert.ok([...name].length >= 2 && [...name].length <= 6, name);
  });
  const withHead = generateName(model, { order: 2, min: 2, max: 6, prefix: "별", existing, random });
  assert.ok(withHead === null || withHead.startsWith("별"));
  // 표에 없는 첫 글자면 못 짓는다
  assert.equal(generateName(model, { order: 2, min: 2, max: 6, prefix: "뷁", existing, random, tries: 20 }), null);
});
