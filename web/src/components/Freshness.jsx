import { formatRelativeTime, kstToday } from "../lib/format.js";
import { Icon } from "./Icon.jsx";

/** @param {string} date YYYY-MM-DD */
function daysAgo(date) {
  const today = Date.parse(`${kstToday()}T00:00:00Z`);
  const day = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(today) || !Number.isFinite(day)) return null;
  return Math.round((today - day) / 86400000);
}

/**
 * 데이터 신선도 한 줄: "3시간 전 갱신" / "어제 집계".
 *   at: 조회 시각(ISO·밀리초) → 상대 시각 + "갱신"
 *   date: 집계일(YYYY-MM-DD) → 오늘/어제/N일 전 + "집계"
 * @param {{ at?: string | number | null, date?: string | null, class?: string }} props
 */
export function Freshness({ at, date, class: className = "" }) {
  let text = "";
  let stamp = "";
  if (date) {
    const days = daysAgo(date);
    if (days === null) return null;
    text = days <= 0 ? "오늘 집계" : days === 1 ? "어제 집계" : `${days}일 전 집계`;
    stamp = date;
  } else if (at !== null && at !== undefined && at !== "") {
    const time = typeof at === "number" ? at : Date.parse(String(at));
    if (!Number.isFinite(time)) return null;
    text = `${formatRelativeTime(Math.min(time, Date.now()))} 갱신`;
    stamp = new Date(time).toISOString();
  } else {
    return null;
  }
  return (
    <p class={`freshness ${className}`}>
      <span class="freshness__dot" aria-hidden="true" />
      <Icon name="clock" size={14} />
      <time dateTime={stamp}>{text}</time>
    </p>
  );
}
