// 스탯 효율: 서버와 같은 전투력 공식(src/game-data/combat-power.json)으로
// "이 스탯을 이만큼 올리면 전투력이 얼마나 오르나"와 "같은 효과를 내는 다른 스탯의 양"을 계산한다.
import rules from "../../../src/game-data/combat-power.json";

/**
 * @typedef {Object} Totals 공격 타입 쪽 값만(%는 % 그대로)
 * @property {number} attack
 * @property {number} attackPercent
 * @property {number} damage
 * @property {number} boss
 * @property {number} critical
 * @property {number} finalDamage
 * @property {number} maxDamage
 */

/** 효율을 비교하는 스탯. step 은 "1씩 올리면"의 1 단위. */
export const EFFICIENCY_STATS = [
  { id: "finalDamage", label: "최종 대미지", unit: "%", step: 1 },
  { id: "boss", label: "보스 공격력", unit: "%", step: 1 },
  { id: "damage", label: "대미지", unit: "%", step: 1 },
  { id: "attackPercent", label: "공격력 %", unit: "%", step: 1 },
  { id: "critical", label: "치명타 피해", unit: "%", step: 1 },
  { id: "attack", label: "공격력", unit: "", step: 1000 },
  { id: "maxDamage", label: "최대 대미지", unit: "", step: 100000000 }
];

/**
 * 화면의 주요 스탯(majorStats, 보스 세팅 또는 현재 착용)에서 공격 타입 쪽 값만 꺼낸다.
 * @param {Record<string, { value: number }>} majorStats @param {string} attackType
 * @returns {Totals | null}
 */
export function totalsFromStats(majorStats, attackType) {
  const read = (/** @type {string} */ key) => Number(majorStats?.[key]?.value) || 0;
  const magic = attackType === "magical";
  const totals = {
    attack: read(magic ? "magicalAttack" : "physicalAttack"),
    attackPercent: read(magic ? "magicalAttackPercent" : "physicalAttackPercent"),
    damage: read(magic ? "magicalDamagePercent" : "physicalDamagePercent"),
    boss: read("bossDamage"),
    critical: read("criticalDamage"),
    finalDamage: read("finalDamage"),
    maxDamage: read("maxDamage"),
    // 전투력 공식에는 없고 실전 딜 모드(damageModel.mjs)에서만 쓴다.
    ignoreDefense: read("ignoreDefense")
  };
  return totals.attack > 0 ? totals : null;
}

/** @param {Totals} t */
export function combatPower(t) {
  return (
    Math.max(t.attack, 1) *
    (t.attackPercent / 100 + rules.bossBase * (1 + t.boss / 100)) *
    (1 + t.damage / 100) *
    (rules.criticalBase + t.critical / 100) *
    (1 + t.finalDamage / 100) *
    Math.pow(Math.max(t.maxDamage, 1) / rules.maxDamageReference, rules.maxDamageExponent)
  );
}

/**
 * 전투력을 ratio 배로 만드는 데 필요한 각 스탯의 양(공식이 곱셈이라 스탯마다 바로 풀린다).
 * @param {Totals} t @param {string} id @param {number} ratio
 */
export function amountForRatio(t, id, ratio) {
  const r = ratio - 1;
  const term = t.attackPercent / 100 + rules.bossBase * (1 + t.boss / 100);
  switch (id) {
    case "attack":
      return t.attack * r;
    case "attackPercent":
      return term * r * 100;
    case "boss":
      return ((term * r) / rules.bossBase) * 100;
    case "damage":
      return (1 + t.damage / 100) * r * 100;
    case "critical":
      return (rules.criticalBase + t.critical / 100) * r * 100;
    case "finalDamage":
      return (1 + t.finalDamage / 100) * r * 100;
    case "maxDamage":
      return t.maxDamage * (Math.pow(ratio, 1 / rules.maxDamageExponent) - 1);
    default:
      return NaN;
  }
}

/**
 * @param {Totals} t @param {string} id @param {number} amount
 * @returns {{ before: number, after: number, gain: number, ratio: number }}
 */
export function gainFor(t, id, amount) {
  const before = combatPower(t);
  const after = combatPower({ ...t, [id]: /** @type {any} */ (t)[id] + amount });
  return { before, after, gain: after - before, ratio: before > 0 ? after / before : 1 };
}
