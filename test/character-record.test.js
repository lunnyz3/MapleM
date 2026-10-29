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
