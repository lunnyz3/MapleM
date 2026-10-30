// 멀티서치(순수 함수): 붙여 넣은 글에서 캐릭터 이름 뽑기. 카톡 대화면 보낸 사람만, 아니면 줄·쉼표·공백으로 나눈 낱말.
// 대화명이 "몬밀/캡틴/295"·"몬밀(캡틴)"처럼 붙어 있으면 앞부분. "스카니아/몬밀"처럼 월드가 앞에 오면 월드도.

const NAME = /^[가-힣A-Za-z0-9]{2,12}$/;
// 모바일 복사: "[몬밀] [오후 3:21] 안녕" · PC 내보내기: "2026. 10. 30. 오후 3:21, 몬밀 : 안녕" · "2026년 10월 30일 오후 3:21, 몬밀 : 안녕"
const MOBILE_LINE = /^\[([^\]]+)\]\s*\[(?:오전|오후)\s*\d{1,2}:\d{2}\]/;
const PC_LINE = /^\d{4}(?:\.\s*\d{1,2}\.\s*\d{1,2}\.|년\s*\d{1,2}월\s*\d{1,2}일)\s*(?:오전|오후)\s*\d{1,2}:\d{2},\s*([^:]+?)\s*:/;

/** 대화명 → 캐릭터 이름 후보(앞부분) */
function senderName(sender) {
  return String(sender || "")
    .trim()
    .split(/[\s/|_(\[·,-]/)[0];
}

/**
 * @param {string} text @param {string[]} worlds 월드 이름(앞에 붙은 "월드/이름"을 알아보려고)
 * @param {number} [limit]
 * @returns {{ entries: Array<{ world: string, name: string }>, fromChat: boolean, skipped: number }}
 */
export function parseNames(text, worlds = [], limit = 30) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const senders = lines.map((line) => (MOBILE_LINE.exec(line) || PC_LINE.exec(line) || [])[1]).filter(Boolean);
  const fromChat = senders.length >= 2 && senders.length >= lines.length / 3;
  const tokens = fromChat ? senders.map(senderName) : lines.flatMap((line) => line.split(/[\s,;·]+/));
  const seen = new Set();
  const entries = [];
  let skipped = 0;
  for (const raw of tokens) {
    let world = "";
    let name = String(raw || "").trim();
    const slash = name.indexOf("/");
    if (slash > 0 && worlds.includes(name.slice(0, slash))) {
      world = name.slice(0, slash);
      name = name.slice(slash + 1);
    } else if (!fromChat) {
      name = senderName(name);
    }
    if (!NAME.test(name)) continue;
    const key = `${world}/${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (entries.length >= limit) skipped += 1;
    else entries.push({ world, name });
  }
  return { entries, fromChat, skipped };
}

/**
 * 들어갈 수 있는 가장 어려운 보스(입장 전투력 기준). 전투력·레벨을 모르면 null.
 * @param {{ level: number, power: number }} member @param {Array<{ name: string, difficulty: string, level: number, power: number }>} bosses
 */
export function hardestBoss(member, bosses) {
  if (!(member?.power > 0) || !(member?.level > 0)) return null;
  let best = null;
  for (const boss of bosses) if (member.level >= boss.level && member.power >= boss.power && (!best || boss.power > best.power)) best = boss;
  return best;
}
