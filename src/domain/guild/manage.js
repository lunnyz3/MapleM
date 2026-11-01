"use strict";

// 길드장 도구(순수 함수): 길드원 마지막 접속 며칠 전, 최근 7일 성장(날짜별 기록의 처음과 끝). 주간 요약 글은 화면이
// 만든다(web/src/lib/guildManage.mjs, 템환산을 100점 기준으로 바꿔야 해서).
// 전투력 변화는 사냥 세팅으로 잰 날이 끼면 튀므로 절반 아래·세 배 넘는 변화는 뺀다(내 캐릭터 변화와 같은 기준).

const DAY_MS = 24 * 60 * 60 * 1000;
const kstDate = (time) => new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const dayNumber = (date) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

/** 마지막 접속이 오늘(서울)부터 며칠 전인지(모르면 null) */
function daysSince(iso, now = Date.now()) {
  const time = Date.parse(String(iso || ""));
  if (!Number.isFinite(time)) return null;
  return Math.max(0, dayNumber(kstDate(now)) - dayNumber(kstDate(time)));
}

/**
 * 최근 days 일 날짜별 기록의 처음과 끝: 템환산 원점수 처음·끝, 레벨 차이, 전투력 비율(튀면 null). 기록이 이틀 안 되면 null.
 * @param {Array<{ date: string, itemScore?: number, combatPower?: number, level?: number }>} journal
 */
function memberGrowth(journal, now = Date.now(), days = 7) {
  const since = kstDate(now - days * DAY_MS);
  const rows = (Array.isArray(journal) ? journal : []).filter((row) => row?.date > since);
  if (rows.length < 2) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const scoreRows = rows.filter((row) => Number(row.itemScore) > 0);
  const scoreFrom = scoreRows.length >= 2 ? scoreRows[0].itemScore : 0;
  const scoreTo = scoreRows.length >= 2 ? scoreRows[scoreRows.length - 1].itemScore : 0;
  const powerRows = rows.filter((row) => Number(row.combatPower) > 0);
  let power = null;
  if (powerRows.length >= 2) {
    const ratio = powerRows[powerRows.length - 1].combatPower / powerRows[0].combatPower;
    if (ratio >= 0.5 && ratio <= 3) power = Math.round((ratio - 1) * 1000) / 1000;
  }
  const level = Number(last.level) > 0 && Number(first.level) > 0 ? last.level - first.level : 0;
  return { from: first.date, to: last.date, scoreFrom, scoreTo, power, level };
}

module.exports = { daysSince, memberGrowth };
