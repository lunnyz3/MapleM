// 이벤트 달력 화면 계산(순수 함수): 남은 날 글자와 막대 위치.

/** "D-11" · "오늘 끝" · "3일 뒤 시작" · "끝남" @param {{ status: string, daysLeft: number, daysToStart: number }} event */
export function dayLabel(event) {
  if (event.status === "upcoming") return event.daysToStart === 1 ? "내일 시작" : `${event.daysToStart}일 뒤 시작`;
  if (event.status === "ended") return "끝남";
  return event.daysLeft === 0 ? "오늘 끝" : `D-${event.daysLeft}`;
}

const dayNumber = (date) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86400000);
const dateOf = (day) => new Date(day * 86400000).toISOString().slice(0, 10);

/**
 * 날짜 축: 지난주부터 가장 늦게 끝나는 이벤트까지(최대 오늘 + 60일). 막대는 끝나는 날을 포함한다.
 * @param {Array<{ start: string, end: string, status: string }>} events @param {string} today
 * @returns {{ from: string, to: string, todayAt: number, ticks: Array<{ date: string, at: number }>, bar: (event: any) => { left: number, width: number } }}
 */
export function timeline(events, today) {
  const now = dayNumber(today);
  const shown = events.filter((event) => event.status !== "ended");
  const first = Math.min(now - 7, ...shown.map((event) => dayNumber(event.start)));
  const last = Math.min(now + 60, Math.max(now + 14, ...shown.map((event) => dayNumber(event.end))));
  const from = Math.max(first, now - 30);
  const span = last + 1 - from;
  const at = (day) => Math.max(0, Math.min(100, ((day - from) / span) * 100));
  const ticks = [];
  for (let day = from; day <= last; day += 7) ticks.push({ date: dateOf(day), at: at(day) });
  return {
    from: dateOf(from),
    to: dateOf(last),
    todayAt: at(now),
    ticks,
    bar: (event) => {
      const left = at(dayNumber(event.start));
      return { left, width: Math.max(1.5, at(dayNumber(event.end) + 1) - left) };
    }
  };
}
