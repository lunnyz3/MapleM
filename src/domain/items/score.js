"use strict";

// Item score (템환산): a weighted sum of an item's option values (weights per stat, scaled so a
// reference item is 500 points). Physical and magical are scored separately and the larger one
// is kept. Rules and weights live in src/game-data/item-score.json.

const scoreRules = require("../../game-data/item-score.json");
const { parseOption, parseStatText } = require("../stats/text");
const { isMagicJob } = require("../stats/sources/character");

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
 * Parsed option lines that count: base options (they already include the additional option of
 * the same stat), additional options of stats the base options do not have, potentials, soul and
 * (optionally) the emblem. Liberation weapons add 최종 대미지 +10.
 */
function scoredLines(item, { withEmblem }) {
  const basic = parseLines(item?.item_basic_option);
  const basicKeys = new Set(basic.map((entry) => entry.key));
  const lines = [
    ...basic,
    ...parseLines(item?.item_additional_option).filter((entry) => !basicKeys.has(entry.key)),
    ...parseLines(item?.item_potential_option),
    ...parseLines(item?.item_additional_potential_option)
  ];
  const soul = item?.soul_info?.soul_option;
  if (soul) lines.push(...parseStatText(soul));
  const emblem = item?.emblem_info?.emblem_option;
  if (withEmblem && emblem) lines.push(...parseStatText(emblem));
  const name = String(item?.item_name || "");
  if (scoreRules.liberation.nameIncludes.some((keyword) => name.includes(keyword))) {
    lines.push({ key: "finalDamage", value: scoreRules.liberation.finalDamage });
  }
  return lines;
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
 * Score of one item, with and without the emblem (the larger of the physical and magical sums).
 * @returns {{ score: number, scoreWithoutEmblem: number, hasEmblem: boolean }}
 */
function scoreItem(item) {
  const score = (withEmblem) => {
    const lines = scoredLines(item, { withEmblem });
    return round1(Math.max(sideScore(lines, "physical"), sideScore(lines, "magical")));
  };
  return { score: score(true), scoreWithoutEmblem: score(false), hasEmblem: Boolean(item?.emblem_info?.emblem_option) };
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
 * Ranking group. Only the families in item-score.json (제네시스, 아케인셰이드, 앱솔랩스) are
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
