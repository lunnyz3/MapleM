// 숫자·날짜 표기. 큰 수는 한국식 단위(예: 11억 5,390만), 전체 값은 title 등에 따로 보여준다.

const integerFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

/** @type {Array<[number, string]>} */
const KOREAN_UNITS = [
  [1e16, "경"],
  [1e12, "조"],
  [1e8, "억"],
  [1e4, "만"]
];

/**
 * 숫자로 바꿀 수 없으면 null.
 * @param {unknown} value
 * @returns {number | null}
 */
export function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

/**
 * 천 단위 쉼표. 숫자가 아니면 "-".
 * @param {unknown} value
 */
export function formatComma(value) {
  const number = toNumber(value);
  return number === null ? "-" : integerFormat.format(Math.trunc(number));
}

/**
 * 한국식 단위 표기. 앞에서부터 단위 묶음 maxGroups 개만 보여준다.
 *   1,153,901,361 → "11억 5,390만", 208,179,041,009,010 → "208조 1,790억", 89,425,000 → "8,942만 5,000"
 * plainBelow 보다 작은 수는 쉼표 표기 그대로 둔다(28,700 → "28,700").
 * @param {unknown} value
 * @param {{ maxGroups?: number, plainBelow?: number }} [options]
 */
export function formatKoreanUnits(value, options = {}) {
  const { maxGroups = 2, plainBelow = 100000 } = options;
  const number = toNumber(value);
  if (number === null) return "-";
  const sign = number < 0 ? "-" : "";
  let rest = Math.trunc(Math.abs(number));
  if (rest < plainBelow) return sign + integerFormat.format(rest);

  /** @type {string[]} */
  const groups = [];
  for (const [size, label] of KOREAN_UNITS) {
    const quotient = Math.floor(rest / size);
    rest %= size;
    // 위 단위가 이미 나왔으면 0인 단위도 자리를 차지한다(10억 0만 → "10억").
    if (quotient > 0 || groups.length) groups.push(quotient > 0 ? `${integerFormat.format(quotient)}${label}` : "");
  }
  groups.push(rest > 0 ? integerFormat.format(rest) : "");
  return sign + groups.slice(0, maxGroups).filter(Boolean).join(" ");
}

/**
 * 서울 기준 오늘 날짜(YYYY-MM-DD).
 * @param {Date} [now]
 */
export function kstToday(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

/**
 * YYYY-MM-DD 문자열을 days 만큼 옮긴다.
 * @param {string} dateText
 * @param {number} days
 */
export function shiftDate(dateText, days) {
  const [year, month, day] = dateText.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * "2026-10-28" → "2026.10.28"
 * @param {string | null | undefined} dateText
 */
export function formatDateDot(dateText) {
  return dateText ? dateText.replace(/-/g, ".") : "";
}

const relativeFormat = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });

/**
 * "방금", "5분 전", "어제" 같은 상대 시간.
 * @param {number} timestamp
 * @param {number} [now]
 */
export function formatRelativeTime(timestamp, now = Date.now()) {
  const seconds = Math.round((timestamp - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "방금";
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relativeFormat.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return relativeFormat.format(Math.round(seconds / 86400), "day");
  return relativeFormat.format(Math.round(seconds / (86400 * 30)), "month");
}
