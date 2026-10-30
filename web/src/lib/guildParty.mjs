// 길드 보스 파티(순수 함수): 보스에 들어갈 수 있는 길드원(레벨·전투력)과 6인 파티 나누기.
// 강한 순 = 전투력 순으로 6명씩, 고르게 = 강한 사람부터 전투력 합이 가장 낮은(자리가 남은) 파티에 넣는다.

/**
 * @typedef {{ name: string, level: number, power: number, className?: string }} PartyMember
 * @param {PartyMember[]} members
 * @param {{ level: number, power: number, recommend?: { power?: number } }} boss
 * @returns {{ ready: Array<PartyMember & { recommended: boolean }>, short: PartyMember[], unknown: PartyMember[] }}
 */
export function bossRoster(members, boss) {
  const ready = [];
  const short = [];
  const unknown = [];
  for (const member of members) {
    if (!(member.power > 0) || !(member.level > 0)) unknown.push(member);
    else if (member.level >= boss.level && member.power >= boss.power) ready.push({ ...member, recommended: Boolean(boss.recommend?.power) && member.power >= boss.recommend.power });
    else short.push(member);
  }
  ready.sort((a, b) => b.power - a.power);
  short.sort((a, b) => b.power - a.power);
  return { ready, short, unknown };
}

/**
 * @template {{ power: number }} T
 * @param {T[]} members 전투력 순이 아니어도 된다
 * @param {number} size 파티 인원(최대)
 * @param {"strong" | "even"} mode
 * @returns {T[][]}
 */
export function splitParties(members, size = 6, mode = "strong") {
  const sorted = [...members].sort((a, b) => b.power - a.power);
  const count = Math.ceil(sorted.length / size);
  if (!count) return [];
  if (mode !== "even") return Array.from({ length: count }, (_, index) => sorted.slice(index * size, index * size + size));
  // 인원은 파티마다 최대 1명 차이(앞 파티부터 한 명 더)
  const base = Math.floor(sorted.length / count);
  const extra = sorted.length % count;
  const parties = Array.from({ length: count }, (_, index) => ({ cap: base + (index < extra ? 1 : 0), total: 0, members: /** @type {T[]} */ ([]) }));
  for (const member of sorted) {
    let target = null;
    for (const party of parties) if (party.members.length < party.cap && (!target || party.total < target.total)) target = party;
    target.members.push(member);
    target.total += member.power;
  }
  return parties.map((party) => party.members);
}

/** 보스를 고르지 않았을 때: 6명 이상 들어갈 수 있는 가장 어려운 보스, 없으면 한 명이라도 들어가는 가장 어려운 보스. */
export function defaultBoss(members, bosses, size = 6) {
  const counts = bosses.map((boss) => bossRoster(members, boss).ready.length);
  let pick = -1;
  bosses.forEach((boss, index) => {
    if (counts[index] >= size && (pick < 0 || boss.power > bosses[pick].power)) pick = index;
  });
  if (pick < 0)
    bosses.forEach((boss, index) => {
      if (counts[index] > 0 && (pick < 0 || boss.power > bosses[pick].power)) pick = index;
    });
  return pick;
}
