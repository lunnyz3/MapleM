const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeRecord, gearChanges, kstDate } = require("../src/domain/records/journal");

const day = (iso) => new Date(iso);
const gear = (entries) => entries.map(([slot, name, starforce, score]) => ({ slot, name, starforce, score }));

test("최고 기록: 지표마다 본 값 중 가장 큰 값과 그때 시각을 남긴다", () => {
  const first = mergeRecord(null, { scoreVersion: 4, combatPower: 300, itemScore: 1000, potential: 200, level: 270 }, day("2026-10-01T03:00:00Z"));
  assert.deepEqual(first.best.combatPower, { value: 300, at: day("2026-10-01T03:00:00Z") });
  const second = mergeRecord(first, { scoreVersion: 4, combatPower: 280, itemScore: 1100, potential: 210, maxDamage: 5e9 }, day("2026-10-05T03:00:00Z"));
  assert.deepEqual(second.best.combatPower, { value: 300, at: day("2026-10-01T03:00:00Z") }, "낮아지면 이전 최고 유지");
  assert.deepEqual(second.best.itemScore, { value: 1100, at: day("2026-10-05T03:00:00Z") });
  assert.equal(second.best.maxDamage.value, 5e9, "처음 알게 된 지표도 기록");
  assert.equal(second.best.itemScoreWithoutEmblem, undefined, "본 적 없는 지표는 없음");
});

test("최고 기록: 템환산 공식이 바뀌면 템환산 기록만 다시 시작한다", () => {
  const old = mergeRecord(null, { scoreVersion: 3, combatPower: 300, itemScore: 5000 }, day("2026-10-01T03:00:00Z"));
  const next = mergeRecord(old, { scoreVersion: 4, combatPower: 200, itemScore: 1000 }, day("2026-10-02T03:00:00Z"));
  assert.equal(next.best.itemScore.value, 1000);
  assert.equal(next.best.combatPower.value, 300);
  assert.equal(next.journal[0].itemScore, undefined, "옛 공식의 일지 템환산은 지운다");
  assert.equal(next.journal[0].combatPower, 300);
});

test("성장 일지: 한국 날짜마다 한 줄, 같은 날은 덮어쓰고 모르는 값은 그날 앞 값을 둔다", () => {
  assert.equal(kstDate(day("2026-10-01T15:30:00Z")), "2026-10-02");
  let record = mergeRecord(null, { scoreVersion: 4, combatPower: 100, itemScore: 900, level: 270 }, day("2026-10-01T01:00:00Z"));
  record = mergeRecord(record, { scoreVersion: 4, itemScore: 950, level: 270 }, day("2026-10-01T10:00:00Z"));
  record = mergeRecord(record, { scoreVersion: 4, combatPower: 120, itemScore: 960, level: 271 }, day("2026-10-01T16:00:00Z"));
  assert.deepEqual(
    record.journal.map((row) => [row.date, row.combatPower, row.itemScore, row.level]),
    [
      ["2026-10-01", 100, 950, 270],
      ["2026-10-02", 120, 960, 271]
    ]
  );
});

test("성장 일지: 180일만 남긴다", () => {
  let record = null;
  for (let i = 0; i < 200; i += 1) record = mergeRecord(record, { scoreVersion: 4, level: 200 + i }, new Date(Date.UTC(2026, 0, 1 + i, 3)));
  assert.equal(record.journal.length, 180);
  assert.equal(record.journal[179].level, 399);
});

test("바뀐 장비: 칸마다 이름·스타포스·점수가 다르면 변경, 같은 날 여러 번 바뀌면 처음과 마지막만", () => {
  const before = gear([["무기", "아케인셰이드 완드", 35, 900], ["모자", "아케인셰이드 햇", 30, 20], ["반지", "A", 0, 1]]);
  const after = gear([["무기", "아케인셰이드 완드", 36, 930], ["모자", "아케인셰이드 햇", 30, 20], ["벨트", "B", 0, 2]]);
  assert.deepEqual(gearChanges(before, after), [
    { slot: "무기", from: { name: "아케인셰이드 완드", starforce: 35, score: 900 }, to: { name: "아케인셰이드 완드", starforce: 36, score: 930 } },
    { slot: "반지", from: { name: "A", starforce: 0, score: 1 }, to: null },
    { slot: "벨트", from: null, to: { name: "B", starforce: 0, score: 2 } }
  ]);

  let record = mergeRecord(null, { scoreVersion: 4, gear: before }, day("2026-10-01T01:00:00Z"));
  assert.equal(record.journal[0].changes, undefined, "처음 본 날은 비교할 것이 없다");
  record = mergeRecord(record, { scoreVersion: 4, gear: after }, day("2026-10-02T01:00:00Z"));
  const upgraded = gear([["무기", "아케인셰이드 완드", 37, 960], ["모자", "아케인셰이드 햇", 30, 20], ["벨트", "B", 0, 2], ["반지", "A", 0, 1]]);
  record = mergeRecord(record, { scoreVersion: 4, gear: upgraded }, day("2026-10-02T05:00:00Z"));
  assert.deepEqual(record.journal[1].changes, [
    { slot: "무기", from: { name: "아케인셰이드 완드", starforce: 35, score: 900 }, to: { name: "아케인셰이드 완드", starforce: 37, score: 960 } },
    { slot: "벨트", from: null, to: { name: "B", starforce: 0, score: 2 } }
  ], "반지는 빠졌다 돌아와서 변경 없음");
});

test("바뀐 장비: 템환산 공식이 바뀐 날은 점수 차이를 변경으로 세지 않는다", () => {
  const record = mergeRecord(null, { scoreVersion: 3, gear: gear([["무기", "W", 35, 500]]) }, day("2026-10-01T01:00:00Z"));
  const next = mergeRecord(record, { scoreVersion: 4, gear: gear([["무기", "W", 35, 900]]) }, day("2026-10-02T01:00:00Z"));
  assert.equal(next.journal[1].changes, undefined);
  assert.equal(next.gear[0].score, 900);
});

test("성장 일지: 전투력은 그날 본 값 중 가장 높은 값(사냥 프리셋으로 바꿔도 낮아지지 않음)", () => {
  let record = mergeRecord(null, { scoreVersion: 5, combatPower: 300 }, day("2026-10-01T01:00:00Z"));
  record = mergeRecord(record, { scoreVersion: 5, combatPower: 120 }, day("2026-10-01T05:00:00Z"));
  assert.equal(record.journal[0].combatPower, 300);
  record = mergeRecord(record, { scoreVersion: 5, combatPower: 150 }, day("2026-10-02T05:00:00Z"));
  assert.equal(record.journal[1].combatPower, 150, "다음 날은 그날 값");
});

test("스펙 전투력: 지금 관측값과 최근 14일 최고 중 큰 값", () => {
  const { specCombatPower, bestInJournal } = require("../src/services/character-record.service");
  assert.equal(specCombatPower(36206397, 168002403), 168002403);
  assert.equal(specCombatPower(150000000, 168002403), 168002403);
  assert.equal(specCombatPower(200000000, 168002403), 200000000);
  assert.equal(specCombatPower(41742, null), 41742);
  assert.equal(specCombatPower(null, 168002403), 168002403);
  assert.equal(specCombatPower(0, 0), null);
  const journal = [
    { date: "2026-10-10", combatPower: 999 },
    { date: "2026-10-20", combatPower: 300 },
    { date: "2026-10-29", combatPower: 500 },
    { date: "2026-10-30", itemScore: 10 }
  ];
  assert.equal(bestInJournal(journal, "2026-10-17"), 500);
  assert.equal(bestInJournal(journal, "2026-10-01"), 999);
  assert.equal(bestInJournal([], "2026-10-01"), 0);
});

test("전투력 순찰: 최근 14일 최고는 높으면 새로·같으면 하루 지난 것만, 날짜별 기록은 오를 때만, 스펙은 둘 중 큰 값", () => {
  const { peakPlan } = require("../src/services/character-record.service");
  const now = new Date("2026-10-30T05:00:00Z"); // 서울 14시
  const record = (peak, journal) => ({ recentPeak: peak, journal });
  const yesterday = [{ date: "2026-10-29", combatPower: 6000 }];
  // 처음 보는 보스 세팅 값: 최고 새로, 마지막 줄(6000)보다 높으니 오늘 줄도
  let plan = peakPlan(record(undefined, yesterday), 10000, now);
  assert.deepEqual([plan.peak?.value, plan.journal, plan.todayMax, plan.specPower], [10000, true, 10000, 10000]);
  // 사냥 세팅 값: 최고는 그대로, 줄도 안 만든다, 스펙은 최근 최고
  const peak = { value: 10000, at: new Date("2026-10-30T01:00:00Z") };
  plan = peakPlan(record(peak, [...yesterday, { date: "2026-10-30", combatPower: 10000 }]), 6000, now);
  assert.deepEqual([plan.peak, plan.journal, plan.todayMax, plan.specPower], [null, false, 10000, 10000]);
  // 같은 값을 다시 봄: 하루가 안 지났으면 쓰지 않고, 지났으면 날짜만 새로
  assert.equal(peakPlan(record(peak, yesterday), 10000, now).peak, null);
  const old = { value: 10000, at: new Date("2026-10-28T01:00:00Z") };
  assert.equal(peakPlan(record(old, yesterday), 10000, now).peak.value, 10000);
  // 처음 도는 바퀴(recentPeak 없음): 날짜별 기록의 14일 최고를 지킨다
  plan = peakPlan(record(undefined, [{ date: "2026-10-25", combatPower: 270000000 }, { date: "2026-10-29", combatPower: 6000000 }]), 5184601, now);
  assert.deepEqual([plan.peak, plan.journal, plan.specPower], [null, false, 270000000]);
  // 날짜별 기록이 없으면 스펙에 있던 값(확인한 지 14일 안)을 지키고, 14일이 지났으면 지금 값
  plan = peakPlan(null, 5184601, now, { value: 270888033, at: new Date("2026-10-28T07:46:08Z") });
  assert.deepEqual([plan.peak, plan.journal, plan.specPower], [null, true, 270888033]);
  assert.equal(peakPlan(null, 5184601, now, { value: 270888033, at: new Date("2026-10-01T00:00:00Z") }).specPower, 5184601);
  // 14일이 지난 최고는 빠지고, 남은 것(어제 기록 6000) 중 큰 값
  const expired = { value: 99999, at: new Date("2026-10-10T01:00:00Z") };
  plan = peakPlan(record(expired, yesterday), 5000, now);
  assert.deepEqual([plan.peak, plan.journal, plan.specPower], [null, false, 6000]);
  plan = peakPlan(record(expired, []), 5000, now);
  assert.deepEqual([plan.peak?.value, plan.journal, plan.specPower], [5000, true, 5000]);
});
