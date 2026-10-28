"use strict";

// Item score (템환산): how much one item's rolled options (추가 옵션, 잠재, 에디셔널, 문장) raise a
// fixed reference character's combat power. 1 point = +0.1%. Base options (item base attack,
// starforce) are left out, and so are equipment mastery bonuses: the score ranks the rolls. Rules and the reference live in src/game-data/item-score.json.

const scoreRules = require("../../game-data/item-score.json");
const { itemContributions } = require("../stats/sources/equipment");
const { isMagicJob } = require("../stats/sources/character");
const { combatPower } = require("../stats/aggregate");
const { withoutMastery } = require("./mastery");

const SCORED_GROUPS = new Set(["additionalOption", "potential", "additionalPotential", "emblem"]);

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
 * Score of one item from its option rolls. `masteryLines` (from mastery.js) takes the mastery
 * bonuses off first. The emblem counts only in `score`, not in `scoreWithoutEmblem`.
 * @returns {{ score: number, scoreWithoutEmblem: number, hasEmblem: boolean }}
 */
function scoreItem(item, attackType, masteryLines = null) {
  const contributions = itemContributions(withoutMastery(item, masteryLines)).filter((entry) => SCORED_GROUPS.has(entry.group));
  const withoutEmblem = contributions.filter((entry) => entry.group !== "emblem");
  return {
    score: scoreFor(contributions, attackType),
    scoreWithoutEmblem: scoreFor(withoutEmblem, attackType),
    hasEmblem: withoutEmblem.length !== contributions.length
  };
}

/**
 * Ranking group. Only the families in item-score.json (아케인셰이드, 앱솔랩스) are ranked:
 * weapons per weapon type (the page name, e.g. "완드"), armor per slot. Other items get
 * family "" and no rank.
 */
function itemGroup(item) {
  const name = String(item?.item_name || "").trim();
  const slotName = String(item?.item_equipment_slot_name || "").replace(/\s*\(\d+번째 슬롯\)$/, "").trim();
  const pageName = String(item?.item_equipment_page_name || "").trim();
  const slot = slotName === "무기" ? pageName || slotName : slotName || pageName;
  const family = scoreRules.families.find((entry) => entry.nameIncludes.some((keyword) => name.includes(keyword)));
  return {
    slot,
    family: family ? family.label : "",
    label: family ? `${family.label} ${slot}` : name,
    weapon: slotName === "무기"
  };
}

module.exports = { scoreItem, itemGroup, attackTypeOfItems, SCORE_VERSION: scoreRules.version };
