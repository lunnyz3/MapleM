"use strict";

// 이벤트 달력(순수 함수): 넥슨 이벤트 공지 제목·본문의 "10/29 ~ 11/11" 같은 기간을 날짜로 읽고, 오늘 기준으로
// 진행 중·곧 시작·끝남과 남은 날을 붙인다. 연도는 공지 날짜(서울)로 정하고, 끝 날짜가 시작보다 앞이면 다음 해.

const RANGE = /(\d{1,2})\s*\/\s*(\d{1,2})[^~～\n]{0,40}[~～]\s*(?:\d{4}\s*[./]\s*)?(\d{1,2})\s*\/\s*(\d{1,2})/;
const SINGLE = /(?:^|[^\d/])(\d{1,2})\s*\/\s*(\d{1,2})(?!\s*\/|\d)/;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (value) => String(value).padStart(2, "0");
const validDate = (month, day) => month >= 1 && month <= 12 && day >= 1 && day <= 31;

/** 공지 날짜(ISO) → 서울 기준 { year, month } */
function publishedParts(published) {
  const time = Date.parse(published);
  const date = new Date((Number.isFinite(time) ? time : Date.now()) + 9 * 60 * 60 * 1000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/** 시작 달이 공지 달과 반년 넘게 떨어지면 해를 넘긴 것으로 본다 */
function yearOf(month, published) {
  const { year, month: publishedMonth } = publishedParts(published);
  if (publishedMonth - month > 6) return year + 1;
  if (month - publishedMonth > 6) return year - 1;
  return year;
}

/**
 * 글에서 기간 하나: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } 또는 null. 범위가 없고 날짜가 하나면 그날 하루.
 * @param {string} text @param {string} published 공지 날짜(ISO)
 */
function parsePeriod(text, published) {
  const source = String(text || "");
  const range = RANGE.exec(source);
  if (range) {
    const [startMonth, startDay, endMonth, endDay] = range.slice(1).map(Number);
    if (!validDate(startMonth, startDay) || !validDate(endMonth, endDay)) return null;
    const startYear = yearOf(startMonth, published);
    const endYear = endMonth * 100 + endDay < startMonth * 100 + startDay ? startYear + 1 : startYear;
    return { start: `${startYear}-${pad(startMonth)}-${pad(startDay)}`, end: `${endYear}-${pad(endMonth)}-${pad(endDay)}` };
  }
  const single = SINGLE.exec(source);
  if (single) {
    const [month, day] = single.slice(1).map(Number);
    if (!validDate(month, day)) return null;
    const date = `${yearOf(month, published)}-${pad(month)}-${pad(day)}`;
    return { start: date, end: date };
  }
  return null;
}

/** 본문(HTML)에서 "기간" 뒤의 범위를 먼저, 없으면 본문 첫 범위 */
function parseBodyPeriod(html, published) {
  const text = String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  const at = text.search(/기간/);
  if (at >= 0) {
    const near = text.slice(at, at + 160);
    if (RANGE.test(near)) return parsePeriod(near, published);
  }
  return RANGE.test(text) ? parsePeriod(text, published) : null;
}

const dayNumber = (date) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

/** 제목 끝의 "(10/29 ~ 11/11)"은 화면에서 막대가 대신 보여 주므로 뗀다 */
function shortTitle(title) {
  return String(title || "")
    .replace(/\s*\(\s*\d{1,2}\s*\/\s*\d{1,2}[^)]*\)\s*$/, "")
    .trim();
}

/**
 * @param {Array<{ title: string, url: string, date: string, period: { start: string, end: string } | null }>} rows
 * @param {string} today "YYYY-MM-DD"(서울)
 * @returns {Array<{ title: string, name: string, url: string, start: string, end: string, status: "ongoing" | "upcoming" | "ended", daysLeft: number, daysToStart: number }>}
 *   기간을 모르는 공지는 뺀다. 진행 중(끝나는 날 순) → 곧 시작(시작 순) → 끝남(최근에 끝난 순).
 */
function buildCalendar(rows, today) {
  const now = dayNumber(today);
  const order = { ongoing: 0, upcoming: 1, ended: 2 };
  return rows
    .filter((row) => row.period)
    .map((row) => {
      const start = dayNumber(row.period.start);
      const end = dayNumber(row.period.end);
      const status = end < now ? "ended" : start > now ? "upcoming" : "ongoing";
      return { title: row.title, name: shortTitle(row.title), url: row.url, start: row.period.start, end: row.period.end, status, daysLeft: end - now, daysToStart: start - now };
    })
    .sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        (a.status === "ongoing" ? a.daysLeft - b.daysLeft : a.status === "upcoming" ? a.daysToStart - b.daysToStart : b.daysLeft - a.daysLeft) ||
        a.name.localeCompare(b.name, "ko")
    );
}

module.exports = { parsePeriod, parseBodyPeriod, buildCalendar, shortTitle };
