"use strict";

// 즐겨찾기 알림 문구(순수 함수). 화면 주소는 사이트 안 경로.
const { koreanUnits } = require("../../web/page-meta");

const characterUrl = (world, name) => `/character/${encodeURIComponent(world)}/${encodeURIComponent(name)}`;
const guildUrl = (world, name) => `/guild/${encodeURIComponent(world)}/${encodeURIComponent(name)}`;
const names = (list, limit = 3) => (list.length > limit ? `${list.slice(0, limit).join(", ")} 외 ${list.length - limit}명` : list.join(", "));

/** 최근 14일 최고 전투력이 오름 */
function powerMessage({ world, name, from, to }) {
  const percent = ((to / from - 1) * 100).toFixed(1);
  return { title: `${name} 전투력이 올랐어요`, body: `${koreanUnits(from)} → ${koreanUnits(to)} (+${percent}%)`, url: characterUrl(world, name) };
}

/** 장비 소식(강화 소식 classifyChange 결과 하나) */
function gearMessage({ world, name, event }) {
  const star = event.toStar ? ` ★${event.toStar}` : "";
  if (event.type === "star") return { title: `${name} ${event.item}${star}${event.reached ? " 달성!" : ""}`, body: `${world} · ★${event.fromStar} → ★${event.toStar}`, url: characterUrl(world, name) };
  if (event.type === "option") return { title: `${name} ${event.item} 옵션 대박`, body: `${world} · 템환산 +${event.gain}`, url: characterUrl(world, name) };
  return { title: `${name} 새 장비`, body: `${world} · ${event.item}${star}`, url: characterUrl(world, name) };
}

/** 장비 소식 여럿 중 하나: 최대 별 달성 → 많이 오른 순 */
function bestGearEvent(events) {
  return [...events].sort((a, b) => Number(Boolean(b.reached)) - Number(Boolean(a.reached)) || (b.gain || 0) - (a.gain || 0))[0] || null;
}

/** 길드 하루 들고 남 */
function guildMessage({ world, guild, joined, left }) {
  const parts = [];
  if (joined.length) parts.push(`들어옴 ${joined.length}명(${names(joined)})`);
  if (left.length) parts.push(`나감 ${left.length}명(${names(left)})`);
  return { title: `${guild} 길드 소식`, body: parts.join(" · "), url: `${guildUrl(world, guild)}#roster` };
}

/** 내일 끝나는 이벤트 */
function eventsMessage(events) {
  const list = events.map((event) => event.name);
  return { title: `내일 끝나는 이벤트 ${list.length}개`, body: list.length > 3 ? `${list.slice(0, 3).join(", ")} 외 ${list.length - 3}개` : list.join(", "), url: "/events" };
}

module.exports = { powerMessage, gearMessage, bestGearEvent, guildMessage, eventsMessage };
