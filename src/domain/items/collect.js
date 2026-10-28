"use strict";

// item-equipment response → the items a character owns (worn + presets, deduplicated) with
// their scores, and the summary used by the spec ranking.

const crypto = require("crypto");
const { fillPresetMasteryInfo } = require("../../transform/equipment-mastery");
const { parseOption } = require("../stats/text");
const { scoreItem, itemGroup, attackTypeOfItems } = require("./score");

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function optionPairs(list) {
  return toArray(list).map((option) => [
    String(option?.option_name ?? "").replace(/\s+/g, ""),
    String(option?.option_value ?? "").replace(/\s+/g, "")
  ]);
}

/**
 * Same item = same slot, name, starforce and every option line (basic, additional,
 * potentials, emblem). The page view sends this back so the client can match ranks.
 */
function itemFingerprint(item) {
  const identity = JSON.stringify([
    String(item?.item_equipment_slot_name ?? ""),
    String(item?.item_name ?? ""),
    String(item?.starforce_upgrade ?? ""),
    optionPairs(item?.item_basic_option),
    optionPairs(item?.item_additional_option),
    optionPairs(item?.item_potential_option),
    optionPairs(item?.item_additional_potential_option),
    String(item?.emblem_info?.emblem_name ?? ""),
    String(item?.emblem_info?.emblem_level ?? "")
  ]);
  return crypto.createHash("sha1").update(identity).digest("hex").slice(0, 20);
}

function hasName(item) {
  return Boolean(String(item?.item_name || "").trim());
}

// Potential sum = 보스 공격력 + the attack type's 대미지 %.
function potentialSum(items, field, attackType) {
  const damageKey = attackType === "magical" ? "magicalDamagePercent" : "physicalDamagePercent";
  let sum = 0;
  items.forEach((item) => {
    toArray(item?.[field]).forEach((option) => {
      parseOption(option).forEach((entry) => {
        if (entry.key === "bossDamage" || entry.key === damageKey) sum += entry.value;
      });
    });
  });
  return Math.round(sum * 100) / 100;
}

/**
 * @param {object} itemData character/item-equipment `data`
 * @returns {{ attackType: string, items: object[], best: object | null }}
 *   items: [{ fingerprint, item, slot, family, label, score, scoreWithoutEmblem, worn }]
 *   best: preset with the highest score sum (ties → lower preset number), with sums for ranking
 */
function collectCharacterItems(itemData) {
  const data = fillPresetMasteryInfo(itemData || {}) || {};
  const worn = toArray(data.item_equipment).filter(hasName);
  const presets = toArray(data.equipment_preset)
    .map((preset) => ({ no: Number(preset?.preset_no) || null, items: toArray(preset?.item_equipment).filter(hasName) }))
    .filter((preset) => preset.no !== null && preset.items.length);
  const attackType = attackTypeOfItems(worn.length ? worn : presets[0]?.items || [], data.character_class);

  const byFingerprint = new Map();
  const add = (item, isWorn) => {
    const fingerprint = itemFingerprint(item);
    const existing = byFingerprint.get(fingerprint);
    // Worn copies carry mastery_info and item_combat_power, so they win over preset copies.
    if (existing && (existing.worn || !isWorn)) return fingerprint;
    const group = itemGroup(item);
    byFingerprint.set(fingerprint, {
      fingerprint,
      item,
      slot: group.slot,
      family: group.family,
      label: group.label,
      ...scoreItem(item, attackType),
      worn: isWorn
    });
    return fingerprint;
  };
  worn.forEach((item) => add(item, true));
  const presetSets = presets.map((preset) => ({ no: preset.no, items: preset.items, fingerprints: preset.items.map((item) => add(item, false)) }));
  if (!presetSets.length && worn.length) {
    presetSets.push({ no: Number(data.use_preset_no) || 1, items: worn, fingerprints: worn.map(itemFingerprint) });
  }

  let best = null;
  presetSets.forEach((preset) => {
    const entries = preset.fingerprints.map((fingerprint) => byFingerprint.get(fingerprint)).filter(Boolean);
    const score = entries.reduce((sum, entry) => sum + entry.score, 0);
    if (!best || score > best.score) {
      best = {
        no: preset.no,
        score: Math.round(score * 10) / 10,
        scoreWithoutEmblem: Math.round(entries.reduce((sum, entry) => sum + entry.scoreWithoutEmblem, 0) * 10) / 10,
        potential: potentialSum(preset.items, "item_potential_option", attackType),
        additionalPotential: potentialSum(preset.items, "item_additional_potential_option", attackType)
      };
    }
  });

  return { attackType, items: [...byFingerprint.values()], best };
}

module.exports = { collectCharacterItems, itemFingerprint };
