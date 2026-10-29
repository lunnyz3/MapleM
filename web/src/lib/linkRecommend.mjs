// 링크 스킬 추천(순수 함수): 링크를 뺀 보스 세팅 스탯에 링크를 하나씩 더해 보며, 전투력을 가장 많이 올리는
// 링크를 칸 수만큼 고른다(욕심쟁이 방식 — 전투력이 곱셈이라 앞에서 고른 링크가 뒤 선택에 반영된다).
// 링크 수치는 src/game-data/link-skills.json selfLinks(링크마다 레벨당 효과)를 인자로 받는다.

/** 링크 레벨당 효과 키 → 효율 계산 키(efficiency.js Totals). 공격 타입이 다른 키는 0. */
function statKey(key, attackType) {
  switch (key) {
    case "criticalDamage":
      return "critical";
    case "finalDamage":
      return "finalDamage";
    case "bossDamage":
      return "boss";
    case "physicalAttackPercent":
      return attackType === "physical" ? "attackPercent" : "";
    case "magicalAttackPercent":
      return attackType === "magical" ? "attackPercent" : "";
    case "physicalDamagePercent":
      return attackType === "physical" ? "damage" : "";
    case "magicalDamagePercent":
      return attackType === "magical" ? "damage" : "";
    default:
      return "";
  }
}

/**
 * 링크 하나를 level 로 넣었을 때 더해지는 값({ critical: 6, … }). 전투력에 안 쓰이면 빈 객체.
 * @param {{ perLevel: Record<string, number> }} link @param {number} level @param {string} attackType
 */
export function linkStats(link, level, attackType) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [key, perLevel] of Object.entries(link.perLevel || {})) {
    const target = statKey(key, attackType);
    // 부동소수 오차(0.3 × 9 = 2.6999…)를 정리한다.
    if (target) out[target] = Math.round(((out[target] || 0) + perLevel * level) * 1e6) / 1e6;
  }
  return out;
}

/**
 * @param {{
 *   base: Record<string, number>,            // 링크(본인 링크 제외)를 뺀 보스 세팅 스탯
 *   links: Array<{ name: string, maxLevel: number, perLevel: Record<string, number>, classes: string[] }>,
 *   attackType: string,
 *   slots: number,
 *   level: "max" | number,                   // 링크마다 쓸 레벨(최대 또는 2·3, 최대 레벨을 넘지 않는다)
 *   exclude?: string[],                      // 후보에서 뺄 링크(본인 링크)
 *   owned?: Record<string, number>,          // 지금 가진 링크 레벨(같은 이름 합) — 이보다 낮게 추천하지 않는다
 *   combatPower: (totals: Record<string, number>) => number
 * }} input
 * @returns {{ picks: Array<{ name: string, level: number, gain: number }>, power: number, basePower: number }}
 *   gain: 그 링크를 고를 때 오른 전투력 비율(0.012 = +1.2%)
 */
export function recommendLinks({ base, links, attackType, slots, level, exclude = [], owned = {}, combatPower }) {
  const skip = new Set(exclude);
  const candidates = links
    .filter((link) => !skip.has(link.name))
    .map((link) => {
      const assumed = level === "max" ? link.maxLevel : Math.min(link.maxLevel, Number(level) || 0);
      const linkLevel = Math.min(link.maxLevel, Math.max(assumed, Number(owned[link.name]) || 0));
      return { name: link.name, level: linkLevel, stats: linkStats(link, linkLevel, attackType) };
    })
    .filter((candidate) => candidate.level > 0 && Object.keys(candidate.stats).length);
  const totals = { ...base };
  const basePower = combatPower(totals);
  let power = basePower;
  const picks = [];
  const used = new Set();
  for (let slot = 0; slot < slots; slot += 1) {
    let best = null;
    for (const candidate of candidates) {
      if (used.has(candidate.name)) continue;
      const next = { ...totals };
      for (const [key, value] of Object.entries(candidate.stats)) next[key] = (next[key] || 0) + value;
      const nextPower = combatPower(next);
      if (!best || nextPower > best.power) best = { candidate, power: nextPower, totals: next };
    }
    if (!best || best.power <= power) break;
    picks.push({ name: best.candidate.name, level: best.candidate.level, gain: best.power / power - 1 });
    used.add(best.candidate.name);
    Object.assign(totals, best.totals);
    power = best.power;
  }
  return { picks, power, basePower };
}
