"use strict";

// 내 캐릭터 변화(순수 함수): 날짜별 기록의 마지막 날을 최근 7일 안 첫날과 견주고(전투력·레벨·템환산),
// 그 사이 눈에 띄는 장비 변화 둘(강화 소식 규칙, src/domain/stats/upgrade-news.js). 전투력이 절반 아래로 떨어지거나
// 세 배 넘게 뛰었으면 어느 한쪽이 사냥 프리셋으로 잰 값이라 보고 전투력 변화는 뺀다.
const { classifyChange } = require("../stats/upgrade-news");

const DAYS = 7;

const shiftDay = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const dayGap = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/** 소식 → 짧은 글 */
function highlightText(event) {
  if (event.type === "star") return `${event.item} ★${event.toStar}${event.reached ? " 달성" : ""}`;
  if (event.type === "option") return `${event.item} 옵션 대박`;
  return `새 장비 ${event.item}`;
}

/**
 * @param {Array<{ date: string, combatPower?: number, itemScore?: number, level?: number, changes?: any[] }>} journal
 * @param {string} today 서울 날짜 "YYYY-MM-DD"
 * @returns {null | { date: string, days: number, combatPower: { from: number, to: number } | null, level: { from: number, to: number } | null, itemScore: { from: number, to: number } | null, highlights: string[] }}
 */
function recordBrief(journal, today) {
  const rows = (Array.isArray(journal) ? journal : []).filter((row) => row?.date).sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const since = shiftDay(today, -(DAYS - 1));
  const window = rows.filter((row) => row.date >= since);
  const first = window[0] || last;
  const pair = (key) => {
    const from = Number(first[key]);
    const to = Number(last[key]);
    return from > 0 && to > 0 ? { from, to } : null;
  };
  const power = pair("combatPower");
  const plausible = power && power.to / power.from >= 0.5 && power.to / power.from <= 3;
  const events = window
    .flatMap((row) => (Array.isArray(row.changes) ? row.changes : []))
    .map(classifyChange)
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight);
  return {
    date: last.date,
    days: dayGap(first.date, last.date),
    combatPower: plausible ? power : null,
    level: pair("level"),
    itemScore: pair("itemScore"),
    highlights: [...new Set(events.map(highlightText))].slice(0, 2)
  };
}

module.exports = { recordBrief };
