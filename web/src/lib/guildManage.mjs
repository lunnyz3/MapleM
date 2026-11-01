// 길드장 도구 화면(순수 함수): 단톡방에 붙일 주간 요약 글.

const DAY_MS = 24 * 60 * 60 * 1000;
const monthDay = (date) => date.slice(5).replace("-", "/");

/**
 * @param {{ guildName: string, count: number, joined: string[], left: string[], growth: Array<{ name: string, text: string }>, inactive: Array<{ name: string, days: number }>, today: string }} input
 */
export function weeklySummary({ guildName, count, joined, left, growth, inactive, today }) {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * DAY_MS).toISOString().slice(0, 10);
  const lines = [`[${guildName} 주간 요약 ${monthDay(from)}~${monthDay(today)}]`, `길드원 ${count}명 (+${joined.length} / −${left.length})`];
  if (joined.length) lines.push(`들어옴: ${joined.join(", ")}`);
  if (left.length) lines.push(`나감: ${left.join(", ")}`);
  if (growth.length) lines.push(`이번 주 성장: ${growth.map((row) => `${row.name} ${row.text}`).join(" · ")}`);
  if (inactive.length) lines.push(`7일 넘게 안 들어옴: ${inactive.map((row) => `${row.name}(${row.days}일)`).join(", ")}`);
  return lines.join("\n");
}
