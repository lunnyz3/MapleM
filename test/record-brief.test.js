const test = require("node:test");
const assert = require("node:assert/strict");
const { recordBrief } = require("../src/domain/records/brief");

test("내 캐릭터 변화: 최근 7일 첫날과 마지막 날, 눈에 띄는 장비 변화 둘", () => {
  const journal = [
    { date: "2026-10-20", combatPower: 1e7, level: 270, itemScore: 500 },
    { date: "2026-10-28", combatPower: 2e7, level: 271, itemScore: 600 },
    {
      date: "2026-10-30",
      combatPower: 2.2e7,
      level: 272,
      itemScore: 620,
      changes: [
        { slot: "무기", from: { name: "제네시스 해머", starforce: 34, score: 900 }, to: { name: "제네시스 해머", starforce: 35, score: 950 } },
        { slot: "귀고리", from: { name: "커맨더 포스 이어링", starforce: 8, score: 20 }, to: { name: "커맨더 포스 이어링", starforce: 9, score: 21 } },
        { slot: "칭호", from: { name: "가", starforce: 0, score: 1 }, to: { name: "나", starforce: 0, score: 9 } }
      ]
    }
  ];
  const brief = recordBrief(journal, "2026-10-30");
  assert.equal(brief.date, "2026-10-30");
  assert.equal(brief.days, 2);
  assert.deepEqual(brief.combatPower, { from: 2e7, to: 2.2e7 });
  assert.deepEqual(brief.level, { from: 271, to: 272 });
  assert.deepEqual(brief.highlights, ["제네시스 해머 ★35 달성", "커맨더 포스 이어링 ★9"]);
  // 기록이 하루뿐이면 변화 없음(같은 날끼리)
  const single = recordBrief([{ date: "2026-10-30", combatPower: 1e7 }], "2026-10-30");
  assert.equal(single.days, 0);
  assert.deepEqual(single.combatPower, { from: 1e7, to: 1e7 });
  assert.equal(recordBrief([], "2026-10-30"), null);
  // 사냥 프리셋으로 잰 날이 끼면(절반 아래·세 배 넘게) 전투력 변화는 뺀다
  const farming = recordBrief([{ date: "2026-10-29", combatPower: 12362418 }, { date: "2026-10-30", combatPower: 41742 }], "2026-10-30");
  assert.equal(farming.combatPower, null);
  const back = recordBrief([{ date: "2026-10-29", combatPower: 41742 }, { date: "2026-10-30", combatPower: 12362418 }], "2026-10-30");
  assert.equal(back.combatPower, null);
});
