const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePeriod, parseBodyPeriod, buildCalendar, shortTitle } = require("../src/domain/community/event-calendar");

const published = "2026-10-28T07:00:00Z";

test("이벤트 기간: 제목의 범위, 붙여 쓴 물결, 해 넘김, 날짜 하나, 없음", () => {
  assert.deepEqual(parsePeriod("신비한 마법의 수정구 (10/29 ~ 11/11)", published), { start: "2026-10-29", end: "2026-11-11" });
  assert.deepEqual(parsePeriod("스푸키 버블 몬스터 (10/29~ 11/11)", published), { start: "2026-10-29", end: "2026-11-11" });
  assert.deepEqual(parsePeriod("겨울 이벤트 (12/20 ~ 1/8)", "2026-12-18T00:00:00Z"), { start: "2026-12-20", end: "2027-01-08" });
  assert.deepEqual(parsePeriod("새해 이벤트 (1/1 ~ 1/14)", "2026-12-28T00:00:00Z"), { start: "2027-01-01", end: "2027-01-14" });
  assert.deepEqual(parsePeriod("10/13(화) MAPLESTORY M ON AIR 10주년 기념 온타임 안내", published), { start: "2026-10-13", end: "2026-10-13" });
  assert.equal(parsePeriod("11월 출석체크＆온타임＆핫타임 이벤트", published), null);
  assert.equal(parsePeriod("이상한 날짜 (13/40 ~ 14/2)", published), null);
});

test("이벤트 기간: 본문은 '기간' 뒤의 범위를 먼저 본다", () => {
  const html = "<p>10/13(화) 공지</p><p>▶ 이벤트 기간 : 11/1(&nbsp;일) ~ 11/30(월)</p><p>보상 10/20 ~ 10/25</p>";
  assert.deepEqual(parseBodyPeriod(html, "2026-10-30T06:00:01Z"), { start: "2026-11-01", end: "2026-11-30" });
  assert.deepEqual(parseBodyPeriod("<p>판매 10/15 ~ 11/11</p>", published), { start: "2026-10-15", end: "2026-11-11" });
  assert.equal(parseBodyPeriod("<p>내용 없음</p>", published), null);
});

test("이벤트 달력: 진행 중은 끝나는 날 순, 곧 시작은 시작 순, 끝남은 최근 순, 기간 모르는 공지는 뺀다", () => {
  const row = (title, start, end) => ({ title, url: `https://x/${title}`, date: published, period: start ? { start, end } : null });
  const calendar = buildCalendar(
    [
      row("가 (10/15 ~ 11/11)", "2026-10-15", "2026-11-11"),
      row("나", "2026-10-29", "2026-10-30"),
      row("다", "2026-11-01", "2026-11-30"),
      row("라", "2026-10-01", "2026-10-12"),
      row("마", "2026-10-09", "2026-10-13"),
      row("모름", null, null)
    ],
    "2026-10-30"
  );
  assert.deepEqual(
    calendar.map((event) => [event.name, event.status, event.daysLeft]),
    [
      ["나", "ongoing", 0],
      ["가", "ongoing", 12],
      ["다", "upcoming", 31],
      ["마", "ended", -17],
      ["라", "ended", -18]
    ]
  );
  assert.equal(calendar[2].daysToStart, 2);
  assert.equal(shortTitle("보스 미션 패스 (10/15 ~ 11/12)"), "보스 미션 패스");
});

test("이벤트 달력 화면: 남은 날 글자와 막대 위치(끝나는 날 포함)", async () => {
  const { dayLabel, timeline } = await import("../web/src/lib/eventCalendar.mjs");
  assert.equal(dayLabel({ status: "ongoing", daysLeft: 11 }), "D-11");
  assert.equal(dayLabel({ status: "ongoing", daysLeft: 0 }), "오늘 끝");
  assert.equal(dayLabel({ status: "upcoming", daysToStart: 1 }), "내일 시작");
  assert.equal(dayLabel({ status: "upcoming", daysToStart: 3 }), "3일 뒤 시작");
  assert.equal(dayLabel({ status: "ended", daysLeft: -2 }), "끝남");
  const events = [
    { start: "2026-10-29", end: "2026-11-11", status: "ongoing" },
    { start: "2026-11-01", end: "2026-11-30", status: "upcoming" }
  ];
  const axis = timeline(events, "2026-10-31");
  assert.equal(axis.from, "2026-10-24");
  assert.equal(axis.to, "2026-11-30");
  const bar = axis.bar(events[0]);
  assert.ok(bar.left > 0 && bar.left < axis.todayAt);
  assert.ok(Math.abs(axis.bar(events[1]).left + axis.bar(events[1]).width - 100) < 1e-9);
  assert.ok(axis.ticks.length >= 5 && axis.ticks[0].date === "2026-10-24");
});
