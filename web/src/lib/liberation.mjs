// 해방 날짜 계산(순수 함수). 수치는 src/game-data/liberation.json 을 인자로 받는다.

/** "YYYY-MM-DD" → UTC 자정 Date(서울 날짜를 그대로 날짜로 다룬다) */
const toDate = (text) => new Date(`${text}T00:00:00Z`);
const toText = (date) => date.toISOString().slice(0, 10);

/**
 * @param {{ chapters: Array<{ name: string, points: number }>, milestones: Array<{ at: number, name: string }> }} rules
 * @param {{
 *   today: string,                 // 서울 기준 오늘 YYYY-MM-DD
 *   chapter: number,               // 지금 장(0부터)
 *   points: number,                // 지금 장에서 모은 포인트
 *   weekly: number,                // 매주 얻는 포인트 합
 *   monthly: number,               // 매달 얻는 포인트(검은 마법사)
 *   weeklyDone?: boolean,          // 이번 주 보스를 이미 잡았나
 *   monthlyDone?: boolean          // 이번 달 검은 마법사를 이미 잡았나
 * }} input
 * @returns {{ total: number, current: number, done: boolean, finishDate: string | null, days: number | null,
 *   chapters: Array<{ name: string, start: number, startDate: string | null }>,
 *   milestones: Array<{ name: string, at: number, date: string | null }> }}
 */
export function liberationPlan(rules, { today, chapter, points, weekly, monthly, weeklyDone = false, monthlyDone = false }) {
  const starts = [];
  let sum = 0;
  for (const entry of rules.chapters) {
    starts.push(sum);
    sum += entry.points;
  }
  const total = sum;
  const index = Math.min(Math.max(0, Math.floor(chapter) || 0), rules.chapters.length - 1);
  const current = Math.min(total, starts[index] + Math.max(0, Number(points) || 0));

  /** 누적 포인트가 처음으로 target 이상이 되는 날 */
  const reached = new Map();
  const mark = (value, date) => {
    for (const target of [...starts, ...rules.milestones.map((milestone) => milestone.at)]) {
      if (value >= target && !reached.has(target)) reached.set(target, date);
    }
  };
  let value = current;
  const start = toDate(today);
  mark(value, null);
  if (!weeklyDone) value += weekly;
  if (!monthlyDone) value += monthly;
  mark(value, today);

  let days = 0;
  const perDay = weekly > 0 || monthly > 0;
  const cursor = new Date(start);
  // 10년을 넘으면 멈춘다(수급이 거의 없을 때).
  while (value < total && perDay && days < 3660) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    days += 1;
    if (cursor.getUTCDay() === 4) value += weekly;
    if (cursor.getUTCDate() === 1) value += monthly;
    mark(value, toText(cursor));
  }
  const done = current >= total;
  const finishDate = done ? null : value >= total ? reached.get(total) || toText(cursor) : null;
  return {
    total,
    current,
    done,
    finishDate,
    days: finishDate ? Math.round((toDate(finishDate) - start) / 86400000) : null,
    chapters: rules.chapters.map((entry, i) => ({ name: entry.name, start: starts[i], startDate: reached.has(starts[i]) ? reached.get(starts[i]) : null })),
    milestones: rules.milestones.map((milestone) => ({ ...milestone, date: reached.has(milestone.at) ? reached.get(milestone.at) : null }))
  };
}
