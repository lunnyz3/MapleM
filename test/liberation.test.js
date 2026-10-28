const test = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../src/game-data/liberation.json");

const load = () => import("../web/src/lib/liberation.mjs");

test("해방: 장 목표 합 13,500, 1차 해방 4,500", async () => {
  const { liberationPlan } = await load();
  const plan = liberationPlan(rules, { today: "2026-10-28", chapter: 0, points: 0, weekly: 215, monthly: 350, weeklyDone: true, monthlyDone: true });
  assert.equal(plan.total, 13500);
  assert.deepEqual(plan.chapters.map((entry) => entry.start), [0, 500, 1500, 3000, 4500, 6500, 8500, 11000]);
});

test("해방: 매주 215 + 매달 350, 이번 주·달 이미 잡음 → 아카이럼 11/1, 1차 해방 2027-02-04, 2차 해방 2027-09-02", async () => {
  const { liberationPlan } = await load();
  // 2026-10-28(수) 시작: 10/29(목) +215, 11/1 +350 = 565 → 아카이럼의 흔적
  const plan = liberationPlan(rules, { today: "2026-10-28", chapter: 0, points: 0, weekly: 215, monthly: 350, weeklyDone: true, monthlyDone: true });
  assert.equal(plan.chapters[1].startDate, "2026-11-01");
  assert.equal(plan.milestones[0].date, "2027-02-04");
  assert.equal(plan.finishDate, "2027-09-02");
  assert.equal(plan.days, 309);
});

test("해방: 이번 주·달을 아직 안 잡았으면 오늘 바로 더한다, 다 모았으면 완료", async () => {
  const { liberationPlan } = await load();
  const now = liberationPlan(rules, { today: "2026-10-28", chapter: 0, points: 0, weekly: 215, monthly: 350 });
  assert.equal(now.chapters[1].startDate, "2026-10-28");
  const done = liberationPlan(rules, { today: "2026-10-28", chapter: 7, points: 2500, weekly: 0, monthly: 0 });
  assert.equal(done.done, true);
  assert.equal(done.finishDate, null);
});
