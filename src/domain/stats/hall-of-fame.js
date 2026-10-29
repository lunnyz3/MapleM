"use strict";

// Hall of fame (pure): DB-wide equipment and character records. Option values are the API values
// (equipment mastery included). One row per character in each record (its best item).

const scoreMax = require("../../game-data/item-score-max.json");
const { lineSum, flameScore } = require("./job-meta");

const TOP = 10;
const ACCESSORY_SLOTS = ["반지", "목걸이", "귀고리", "눈장식", "얼굴장식", "포켓", "벨트", "뱃지", "엠블렘"];

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

const numberOf = (text) => Number(String(text ?? "").replace(/[^0-9.\-]/g, "")) || 0;

function linesText(options) {
  return toArray(options)
    .map((option) => `${String(option?.option_name || "").trim()} ${String(option?.option_value || "").trim()}`.trim())
    .filter(Boolean)
    .join(" · ");
}

/** Higher of the physical / magical damage line sums. */
function damageSum(options) {
  return Math.round(Math.max(lineSum(options, "물리 대미지"), lineSum(options, "마법 대미지")) * 100) / 100;
}

/** Sum of the "최종 대미지" flame lines of one item. */
function finalFlameSum(options) {
  return Math.round(lineSum(options, "최종 대미지") * 100) / 100;
}

/**
 * Top rows by value, one per character; equal values share a rank ("공동 1위"). leaders: how many
 * characters hold the top value (also beyond the first ten).
 */
function top(rows) {
  const best = new Map();
  for (const row of rows) {
    if (!(row.value > 0)) continue;
    const held = best.get(row.key);
    if (!held || row.value > held.value) best.set(row.key, row);
  }
  const sorted = [...best.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ko"));
  const leaders = sorted.filter((row) => row.value === sorted[0]?.value).length;
  const ranked = sorted.slice(0, TOP).map(({ key, ...row }) => row);
  ranked.forEach((row, index) => (row.rank = index && row.value === ranked[index - 1].value ? ranked[index - 1].rank : index + 1));
  return { rows: ranked, leaders };
}

// 장비 대여 아이템("[장비 대여] …")은 기록에서 뺀다.
const owned = (doc) => !String(doc?.itemName || "").startsWith("[");

function itemRow(doc, value, text) {
  return {
    key: doc.ocid || `${doc.worldName}/${doc.characterName}`,
    name: String(doc.characterName || ""),
    world: String(doc.worldName || ""),
    className: String(doc.characterClass || ""),
    itemName: String(doc.itemName || ""),
    starforce: Number(doc.starforce) || 0,
    value,
    text
  };
}

function specRow(spec, value) {
  return {
    key: spec.ocid,
    name: String(spec.characterName || ""),
    world: String(spec.worldName || ""),
    className: String(spec.characterClass || ""),
    value
  };
}

/**
 * @param {{ weapons: any[], accessories: any[], powerSpecs: any[], scoreSpecs: any[] }} input
 *   weapons/accessories: equipment docs (ocid, characterName, worldName, characterClass, slot, itemName, starforce, score, parts, item);
 *   powerSpecs / scoreSpecs: character_specs sorted by combat power / item score
 */
function hallOfFame({ weapons = [], accessories = [], powerSpecs = [], scoreSpecs = [] }) {
  const weaponMax = Number(scoreMax.slots?.["무기"]?.max) || 0;
  const fullMax = Number(scoreMax.fullSet?.max) || 0;
  weapons = toArray(weapons).filter(owned);
  const accessoryDocs = toArray(accessories).filter((doc) => owned(doc) && ACCESSORY_SLOTS.includes(String(doc.slot || "")));
  const flameDocs = [...weapons, ...accessoryDocs];
  return [
    { key: "combatPower", title: "전투력", unit: "", ...top(toArray(powerSpecs).map((spec) => specRow(spec, Number(spec.combatPower) || 0))) },
    {
      key: "itemScore",
      title: "템환산",
      unit: "점",
      ...top(toArray(scoreSpecs).map((spec) => specRow(spec, fullMax ? Math.round(Math.min(100, (Number(spec.itemScore) / fullMax) * 100) * 10) / 10 : 0)))
    },
    {
      key: "potential",
      title: "무기 잠재 대미지",
      unit: "%",
      ...top(toArray(weapons).map((doc) => itemRow(doc, damageSum(doc.item?.item_potential_option), linesText(doc.item?.item_potential_option))))
    },
    {
      key: "additional",
      title: "무기 에디 대미지",
      unit: "%",
      ...top(
        toArray(weapons).map((doc) =>
          itemRow(doc, damageSum(doc.item?.item_additional_potential_option), linesText(doc.item?.item_additional_potential_option))
        )
      )
    },
    {
      key: "weaponFlame",
      title: "무기 추옵",
      unit: "점",
      ...top(toArray(weapons).map((doc) => itemRow(doc, flameScore(doc, "무기"), linesText(doc.item?.item_additional_option))))
    },
    {
      key: "accessoryFlame",
      title: "장신구 추옵",
      unit: "점",
      ...top(accessoryDocs.map((doc) => itemRow(doc, flameScore(doc, String(doc.slot)), linesText(doc.item?.item_additional_option))))
    },
    {
      key: "finalFlame",
      title: "최종 대미지 추옵 (한 장비)",
      unit: "%",
      ...top(flameDocs.map((doc) => itemRow(doc, finalFlameSum(doc.item?.item_additional_option), linesText(doc.item?.item_additional_option))))
    },
    {
      key: "weaponScore",
      title: "무기 템환산",
      unit: "점",
      ...top(toArray(weapons).map((doc) => itemRow(doc, weaponMax ? Math.round(Math.min(100, (Number(doc.score) / weaponMax) * 100) * 10) / 10 : 0, "")))
    }
  ];
}

module.exports = { hallOfFame, damageSum, finalFlameSum, ACCESSORY_SLOTS };
