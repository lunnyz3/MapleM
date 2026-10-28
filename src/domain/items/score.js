"use strict";

// Item score (템환산): how much one item's options raise a fixed reference character's
// combat power. 1 point = +0.1%. Rules and the reference live in src/game-data/item-score.json.

const scoreRules = require("../../game-data/item-score.json");
const { itemContributions } = require("../stats/sources/equipment");
const { isMagicJob } = require("../stats/sources/character");
const { combatPower } = require("../stats/aggregate");

const FAMILY_KEYS = Object.freeze({
  magical: { attack: "magicalAttack", attackPercent: "magicalAttackPercent", damagePercent: "magicalDamagePercent" },
  physical: { attack: "physicalAttack", attackPercent: "physicalAttackPercent", damagePercent: "physicalDamagePercent" }
});

function referenceTotals(attackType) {
  const ref = scoreRules.reference;
  const keys = FAMILY_KEYS[attackType] || FAMILY_KEYS.physical;
  return {
    physicalAttack: 0,
    magicalAttack: 0,
    physicalAttackPercent: 0,
    magicalAttackPercent: 0,
    physicalDamagePercent: 0,
    magicalDamagePercent: 0,
    [keys.attack]: ref.attack,
    [keys.attackPercent]: ref.attackPercent,
    [keys.damagePercent]: ref.damagePercent,
    bossDamage: ref.bossDamage,
    criticalDamage: ref.criticalDamage,
    finalDamage: ref.finalDamage,
    maxDamage: ref.maxDamage,
    ignoreDefense: 0
  };
}

const BASE_POWER = {
  magical: combatPower(referenceTotals("magical")),
  physical: combatPower(referenceTotals("physical"))
};

/** Attack type from the larger flat attack over the items' base options; ties go by job. */
function attackTypeOfItems(items, className) {
  let physical = 0;
  let magical = 0;
  (Array.isArray(items) ? items : []).forEach((item) => {
    itemContributions(item).forEach((entry) => {
      if (entry.group !== "basicOption") return;
      if (entry.key === "physicalAttack") physical += entry.value;
      if (entry.key === "magicalAttack") magical += entry.value;
    });
  });
  if (physical !== magical) return magical > physical ? "magical" : "physical";
  return isMagicJob(className) ? "magical" : "physical";
}

function scoreFor(contributions, attackType) {
  const totals = referenceTotals(attackType);
  // Options of the other attack type and 방어율 무시 (not in the formula) are left out.
  const other = attackType === "magical" ? FAMILY_KEYS.physical : FAMILY_KEYS.magical;
  const skip = new Set([other.attack, other.attackPercent, other.damagePercent, "ignoreDefense"]);
  contributions.forEach((entry) => {
    if (skip.has(entry.key) || !(entry.key in totals)) return;
    totals[entry.key] += entry.value;
  });
  const power = combatPower(totals);
  const base = BASE_POWER[attackType] || BASE_POWER.physical;
  return Math.max(0, Math.round((power / base - 1) * 1000 * 10) / 10);
}

/**
 * Score of one item. Souls are left out (they move between items); the emblem counts only in
 * `score`, not in `scoreWithoutEmblem`.
 * @returns {{ score: number, scoreWithoutEmblem: number, hasEmblem: boolean }}
 */
function scoreItem(item, attackType) {
  const contributions = itemContributions(item).filter((entry) => entry.group !== "soul");
  const withoutEmblem = contributions.filter((entry) => entry.group !== "emblem");
  return {
    score: scoreFor(contributions, attackType),
    scoreWithoutEmblem: scoreFor(withoutEmblem, attackType),
    hasEmblem: withoutEmblem.length !== contributions.length
  };
}

/**
 * Ranking group: slot (slot name without the slot number, so "반지 (3번째 슬롯)" joins "반지";
 * the page name is the weapon type for weapons) + family (제네시스,
 * 아케인셰이드, …; the item name when no family matches).
 */
function itemGroup(item) {
  const name = String(item?.item_name || "").trim();
  const slot = String(item?.item_equipment_slot_name || item?.item_equipment_page_name || "")
    .replace(/\s*\(\d+번째 슬롯\)$/, "")
    .trim();
  const family = scoreRules.families.find((entry) => entry.nameIncludes.some((keyword) => name.includes(keyword)));
  const familyLabel = family ? family.label : name;
  return {
    slot,
    family: familyLabel,
    // "아케인셰이드 어깨" for a family, otherwise the item name.
    label: family ? `${familyLabel} ${slot}` : familyLabel
  };
}

module.exports = { scoreItem, itemGroup, attackTypeOfItems, SCORE_VERSION: scoreRules.version };
