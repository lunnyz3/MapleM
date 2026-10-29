// 세트 효과 비교(순수 함수): 세트마다 개수(럭키·빌림 포함한 최종 개수)와 스타포스 합을 고르면 세트 효과와
// 스타포스 세트 옵션을 합친다. 표는 src/game-data/item-sets.json, starforce-sets.json 을 인자로 받는다.
import { setStatsAt } from "./starforceWhatIf.mjs";

// 고를 수 있는 세트(여러 개를 모아야 하는 장비 세트)와 같은 이름의 스타포스 세트.
const CHOICES = [
  ["arcane", "arcane"],
  ["absolab", "absolab"],
  ["chaos", ""],
  ["루타비스 세트(레전더리)", "lutabis-legendary"],
  ["루타비스 세트(유니크)", "lutabis-unique"],
  ["level160-legendary", "level160-legendary"],
  ["level160-unique", "level160-unique"],
  ["도전자의 장비 세트", "challenger"],
  ["군단장 전리품 세트", ""],
  ["보스 전리품 세트", ""],
  ["노바 디멘션 전사 세트", ""],
  ["level140-legendary", ""],
  ["level140-unique", ""]
];

export const STAT_KEYS = [
  "maxDamage",
  "finalDamage",
  "bossDamage",
  "criticalDamage",
  "physicalDamagePercent",
  "magicalDamagePercent",
  "physicalAttackPercent",
  "magicalAttackPercent",
  "ignoreDefense"
];

/**
 * @param {{ sets: any[] }} itemRules @param {{ sets: any[], cap: number }} starforceRules
 * @returns {Array<{ id: string, label: string, maxCount: number, starforce: any | null, set: any }>}
 */
export function setChoices(itemRules, starforceRules) {
  return CHOICES.map(([id, starforceId]) => {
    const set = itemRules.sets.find((item) => item.id === id);
    if (!set) return null;
    const starforce = starforceId ? starforceRules.sets.find((item) => item.id === starforceId) || null : null;
    const label = String(set.label).replace(/ 세트/, "").replace(/ \(/, "(");
    return { id, label, maxCount: Math.max(...set.tiers.map((tier) => tier.count)), starforce, set };
  }).filter(Boolean);
}

/** 개수 → 그 개수 이하 가장 큰 단계의 효과(단계 값은 누적). */
function tierStats(set, count) {
  let tier = null;
  for (const row of set.tiers) if (count >= row.count && (!tier || row.count > tier.count)) tier = row;
  return tier ? tier.stats : {};
}

/**
 * 한쪽 구성의 스탯 합.
 * @param {ReturnType<typeof setChoices>} choices @param {Record<string, { count: number, stars: number }>} side @param {number} cap
 * @returns {Record<string, number>}
 */
export function sideStats(choices, side, cap) {
  /** @type {Record<string, number>} */
  const out = {};
  const add = (stats) => {
    for (const [key, value] of Object.entries(stats || {})) out[key] = (out[key] || 0) + value;
  };
  for (const choice of choices) {
    const pick = side[choice.id];
    if (!pick || !(pick.count > 0)) continue;
    add(tierStats(choice.set, pick.count));
    if (choice.starforce && pick.stars > 0) add(setStatsAt(choice.starforce, pick.stars, cap));
  }
  return out;
}

/** 스탯마다 [지금, 바꾸면, 차이](둘 다 0 이면 뺀다). */
export function compareStats(before, after) {
  return STAT_KEYS.map((key) => ({ key, before: before[key] || 0, after: after[key] || 0, diff: (after[key] || 0) - (before[key] || 0) })).filter(
    (row) => row.before || row.after
  );
}

/**
 * 캐릭터 스탯 내역(majorStats breakdown)에서 지금 세트 구성: 항목 이름 "아케인 7세트", "아케인 280성".
 * @param {Record<string, any>} majorStats @param {ReturnType<typeof setChoices>} choices
 * @returns {Record<string, { count: number, stars: number }>}
 */
export function sideFromStats(majorStats, choices) {
  /** @type {Record<string, { count: number, stars: number }>} */
  const side = {};
  const byLabel = new Map();
  for (const choice of choices) {
    byLabel.set(choice.set.label, choice);
    for (const name of choice.set.apiNames || []) byLabel.set(name.replace(/ 세트$/, ""), choice);
  }
  const starforceOwner = new Map(choices.filter((choice) => choice.starforce).map((choice) => [choice.starforce.label, choice]));
  for (const stat of Object.values(majorStats || {})) {
    for (const entry of Array.isArray(stat?.breakdown) ? stat.breakdown : []) {
      const source = String(entry?.source || "");
      if (entry?.group === "setEffect") {
        const match = /^(.+?) (\d+)세트$/.exec(source);
        const choice = match && byLabel.get(match[1]);
        if (choice) side[choice.id] = { stars: 0, ...side[choice.id], count: Number(match[2]) };
      } else if (entry?.group === "starforceSet") {
        const label = /^(.+?) \d+성$/.exec(source)?.[1];
        const total = /스타포스 합 (\d+)/.exec(String(entry.rawText || ""))?.[1];
        const choice = label && starforceOwner.get(label);
        if (choice && total) side[choice.id] = { count: 0, ...side[choice.id], stars: Number(total) };
      }
    }
  }
  return side;
}
