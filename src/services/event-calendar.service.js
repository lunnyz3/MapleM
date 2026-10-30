"use strict";

// 이벤트 달력: 넥슨 이벤트 공지(최근 20개)의 기간. 제목에 "(10/29 ~ 11/11)"이 없으면 본문의 "이벤트 기간"을 읽는다
// (본문은 공지마다 하루 보관). 달력은 10분 보관.
const { getNoticeDetail, getNoticeList } = require("./maplestorym.service");
const { buildCalendar, parseBodyPeriod, parsePeriod } = require("../domain/community/event-calendar");
const { TtlLruCache } = require("../nexon/client");

const CALENDAR_TTL_MS = 10 * 60 * 1000;
const BODY_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new TtlLruCache({ maxEntries: 2, maxBytes: 256 * 1024 });
const bodies = new TtlLruCache({ maxEntries: 100, maxBytes: 64 * 1024 });

const kstToday = (now = Date.now()) => new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function bodyPeriod(row) {
  const key = String(row.notice_id || "");
  if (!key) return null;
  const known = bodies.get(key);
  if (known !== undefined) return known;
  try {
    const detail = await getNoticeDetail("notice-event", key);
    const period = parseBodyPeriod(detail?.data?.contents, row.date);
    bodies.set(key, period, BODY_TTL_MS, 128);
    return period;
  } catch {
    return null;
  }
}

/** → { today, events: [{ title, name, url, start, end, status, daysLeft, daysToStart }] } */
async function eventCalendar() {
  const today = kstToday();
  const hit = cache.get(today);
  if (hit) return hit;
  const list = await getNoticeList("notice-event");
  const rows = Array.isArray(list?.data?.event_notice) ? list.data.event_notice : [];
  const withPeriods = await Promise.all(
    rows
      .filter((row) => row?.title && /^https:\/\//.test(String(row.url || "")))
      .map(async (row) => ({
        title: String(row.title).trim(),
        url: String(row.url),
        date: String(row.date || ""),
        period: parsePeriod(row.title, row.date) || (await bodyPeriod(row))
      }))
  );
  const result = { today, events: buildCalendar(withPeriods, today) };
  cache.set(today, result, CALENDAR_TTL_MS, 16 * 1024);
  return result;
}

module.exports = { eventCalendar };
