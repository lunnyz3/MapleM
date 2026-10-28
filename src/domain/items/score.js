"use strict";

// Item score (템환산): a weighted sum of an item's option values (weights per stat, scaled so a
// reference item is 500 points). Physical and magical are scored separately and the larger one
// is kept. Equipment mastery bonuses are taken off first (masteryLines from mastery.js), so the
// score ranks what was rolled. Rules and weights live in src/game-data/item-score.json.

const scoreRules = require("../../game-data/item-score.json");
const { parseOption, parseStatText } = require("../stats/text");
const { isMagicJob } = require("../stats/sources/character");
const { withoutMastery } = require("./mastery");

const WEIGHTS = scoreRules.weights;

const SIDE_KEYS = Object.freeze({
  physical: { physicalAttack: "attack", physicalAttackPercent: "attackPercent", physicalDamagePercent: "damagePercent" },
  magical: { magicalAttack: "attack", magicalAttackPercent: "attackPercent", magicalDamagePercent: "damagePercent" }
});
const SHARED_KEYS = Object.freeze({
  bossDamage: "bossDamage",
  criticalDamage: "criticalDamage",
  finalDamage: "finalDamage",
  ignoreDefense: "ignoreDefense",
  maxDamage: "maxDamage"
});

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseLines(list) {
  return toArray(list).flatMap((option) => parseOption(option));
}

/**
 * Parsed option lines per part: base options (they already include the additional option of the
 * same stat; liberation weapons add 최종 대미지 +10 here), additional options of stats the base
 * options do not have, potentials, soul and emblem.
 */
function scoredParts(item) {
  const basic = parseLines(item?.item_basic_option);
  const basicKeys = new Set(basic.map((entry) => entry.key));
  const name = String(item?.item_name || "");
  if (scoreRules.liberation.nameIncludes.some((keyword) => name.includes(keyword))) {
    basic.push({ key: "finalDamage", value: scoreRules.liberation.finalDamage });
  }
  const soul = item?.soul_info?.soul_option;
  const emblem = item?.emblem_info?.emblem_option;
  return {
    basic,
    additional: parseLines(item?.item_additional_option).filter((entry) => !basicKeys.has(entry.key)),
    potential: parseLines(item?.item_potential_option),
    additionalPotential: parseLines(item?.item_additional_potential_option),
    soul: soul ? parseStatText(soul) : [],
    emblem: emblem ? parseStatText(emblem) : []
  };
}

function sideScore(lines, side) {
  const sideKeys = SIDE_KEYS[side];
  let score = 0;
  lines.forEach((entry) => {
    const weightKey = sideKeys[entry.key] || SHARED_KEYS[entry.key];
    if (weightKey && Number.isFinite(entry.value)) score += entry.value * WEIGHTS[weightKey];
  });
  return score;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Score of one item, with and without the emblem, plus each part's points. The side (physical
 * or magical) with the larger total is used for every part.
 * @returns {{ score: number, scoreWithoutEmblem: number, hasEmblem: boolean,
 *   parts: { basic: number, additional: number, potential: number, additionalPotential: number, soul: number, emblem: number } }}
 */
function scoreItem(item, masteryLines = null) {
  const parts = scoredParts(withoutMastery(item, masteryLines));
  const all = Object.values(parts).flat();
  const side = sideScore(all, "magical") > sideScore(all, "physical") ? "magical" : "physical";
  const points = Object.fromEntries(Object.entries(parts).map(([key, lines]) => [key, round1(sideScore(lines, side))]));
  const total = Object.values(parts).reduce((sum, lines) => sum + sideScore(lines, side), 0);
  return {
    score: round1(total),
    scoreWithoutEmblem: round1(total - sideScore(parts.emblem, side)),
    hasEmblem: parts.emblem.length > 0,
    parts: points
  };
}

/** Attack type from the larger flat attack over the items' base options; ties go by job. */
function attackTypeOfItems(items, className) {
  let physical = 0;
  let magical = 0;
  toArray(items).forEach((item) => {
    parseLines(item?.item_basic_option).forEach((entry) => {
      if (entry.key === "physicalAttack") physical += entry.value;
      if (entry.key === "magicalAttack") magical += entry.value;
    });
  });
  if (physical !== magical) return magical > physical ? "magical" : "physical";
  return isMagicJob(className) ? "magical" : "physical";
}

/**
 * Ranking group. Only the families in item-score.json (제네시스, 아케인셰이드) are
 * ranked: weapons per weapon type (the page name, e.g. "완드"), armor per slot. Other items get
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
