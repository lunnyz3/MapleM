const test = require("node:test");
const assert = require("node:assert/strict");
const { daysSince, memberGrowth } = require("../src/domain/guild/manage");

const now = Date.parse("2026-11-01T05:00:00Z"); // 서울 14시

test("길드장 도구: 마지막 접속 며칠 전(서울 날짜)", () => {
  assert.equal(daysSince("2026-11-01T01:00:00Z", now), 0);
  assert.equal(daysSince("2026-10-31T16:00:00Z", now), 0); // 서울 11/1 01시
  assert.equal(daysSince("2026-10-31T14:00:00Z", now), 1); // 서울 10/31 23시
  assert.equal(daysSince("2026-10-20T10:00:00+09:00", now), 12);
  assert.equal(daysSince(null, now), null);
});

test("길드장 도구: 7일 성장은 처음과 끝, 튀는 전투력은 뺀다", () => {
  const journal = [
    { date: "2026-10-20", itemScore: 900, combatPower: 100, level: 280 },
    { date: "2026-10-26", itemScore: 1000, combatPower: 200, level: 281 },
    { date: "2026-10-29", itemScore: 1012.3, combatPower: 230 },
    { date: "2026-11-01", itemScore: 1020, combatPower: 240, level: 282 }
  ];
  assert.deepEqual(memberGrowth(journal, now), { from: "2026-10-26", to: "2026-11-01", scoreFrom: 1000, scoreTo: 1020, power: 0.2, level: 1 });
  const hunting = [
    { date: "2026-10-30", itemScore: 1000, combatPower: 300 },
    { date: "2026-11-01", itemScore: 1000, combatPower: 10 }
  ];
  assert.equal(memberGrowth(hunting, now).power, null);
  assert.equal(memberGrowth([{ date: "2026-11-01", itemScore: 1 }], now), null);
});

test("길드장 도구: 주간 요약 글", async () => {
  const { weeklySummary } = await import("../web/src/lib/guildManage.mjs");
  const text = weeklySummary({
    guildName: "레전드",
    count: 56,
    joined: ["가"],
    left: ["나", "다"],
    growth: [{ name: "디올", text: "템환산 +1.2" }],
    inactive: [{ name: "라", days: 12 }],
    today: "2026-11-01"
  });
  assert.equal(
    text,
    ["[레전드 주간 요약 10/26~11/01]", "길드원 56명 (+1 / −2)", "들어옴: 가", "나감: 나, 다", "이번 주 성장: 디올 템환산 +1.2", "7일 넘게 안 들어옴: 라(12일)"].join("\n")
  );
});
