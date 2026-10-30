"use strict";

// 길드 들고 난 기록(순수 함수): 지난 길드원 목록과 새 목록을 견줘 서울 날짜마다 들어온·나간 길드원과 인원을 남긴다.
// 같은 날 들어왔다 나가면(또는 나갔다 들어오면) 서로 지운다. 이름만 보므로 닉네임을 바꾸면 나감 + 들어옴으로 보인다.

const MAX_EVENTS = 200;
const MAX_COUNTS = 180;

const kstDate = (now) => new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * @param {{ members?: string[], events?: Array<{ date: string, joined: string[], left: string[] }>, counts?: Array<{ date: string, count: number }>, since?: Date } | null} previous
 * @param {string[]} names 지금 길드원 이름
 * @returns {{ members: string[], events: any[], counts: any[], since: Date, changed: boolean }}
 */
function mergeRoster(previous, names, now = new Date()) {
  const members = [...new Set(names.map((name) => String(name || "").trim()).filter((name) => name && name !== "-"))].sort();
  const date = kstDate(now);
  const counts = (previous?.counts || []).filter((row) => row.date !== date);
  counts.push({ date, count: members.length });
  if (!previous?.members) {
    return { members, events: [], counts: counts.slice(-MAX_COUNTS), since: now, changed: true };
  }
  const before = new Set(previous.members);
  const after = new Set(members);
  const joined = members.filter((name) => !before.has(name));
  const left = previous.members.filter((name) => !after.has(name));
  const events = [...(previous.events || [])];
  if (joined.length || left.length) {
    const today = events.length && events[events.length - 1].date === date ? events.pop() : { date, joined: [], left: [] };
    const todayJoined = new Set(today.joined);
    const todayLeft = new Set(today.left);
    joined.forEach((name) => (todayLeft.has(name) ? todayLeft.delete(name) : todayJoined.add(name)));
    left.forEach((name) => (todayJoined.has(name) ? todayJoined.delete(name) : todayLeft.add(name)));
    if (todayJoined.size || todayLeft.size) events.push({ date, joined: [...todayJoined].sort(), left: [...todayLeft].sort() });
  }
  const changed = Boolean(joined.length || left.length) || previous.counts?.at?.(-1)?.date !== date;
  return { members, events: events.slice(-MAX_EVENTS), counts: counts.slice(-MAX_COUNTS), since: previous.since || now, changed };
}

module.exports = { mergeRoster };
