"use strict";

// Reads every preset the Nexon API exposes and the one in use ("현재 착용"), per dimension:
// equipment, android heart, hyper stat, jewel page, link skill, union stat.

const linkRules = require("../../game-data/link-skills.json");

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toPresetNo(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function byPresetNo(left, right) {
  return left.no - right.no;
}

function pickCurrent(options, currentNo) {
  if (!options.length) return null;
  return options.some((option) => option.no === currentNo) ? currentNo : options[0].no;
}

function readEquipment(details) {
  const data = details?.itemEquipment?.data || {};
  const currentNo = toPresetNo(data.use_preset_no);
  const options = toArray(data.equipment_preset)
    .map((preset) => ({
      no: toPresetNo(preset?.preset_no),
      items: toArray(preset?.item_equipment),
      soulSetOption: preset?.soul_set_option ?? null
    }))
    .filter((option) => option.no !== null)
    .sort(byPresetNo);
  if (!options.length) {
    // No preset list (older responses): the worn items are the only option.
    return {
      options: [{ no: currentNo || 1, items: toArray(data.item_equipment), soulSetOption: data.soul_set_option ?? null }],
      current: currentNo || 1
    };
  }
  return { options, current: pickCurrent(options, currentNo) };
}

function readAndroid(details) {
  const data = details?.androidEquipment?.data || {};
  const currentNo = toPresetNo(data.use_preset_no);
  const options = toArray(data.android_heart_equipment_preset)
    .map((preset) => ({ no: toPresetNo(preset?.preset_no), heart: preset?.heart_equipment || null }))
    .filter((option) => option.no !== null)
    .sort(byPresetNo);
  if (!options.length) {
    return { options: [{ no: currentNo || 1, heart: data.heart_equipment || null }], current: currentNo || 1 };
  }
  return { options, current: pickCurrent(options, currentNo) };
}

function readHyper(details) {
  const data = details?.hyperStat?.data || {};
  const currentNo = toPresetNo(data.use_preset_no);
  const options = toArray(data.hyper_stat)
    .map((preset) => ({ no: toPresetNo(preset?.preset_no), infos: toArray(preset?.hyper_stat_info) }))
    .filter((option) => option.no !== null)
    .sort(byPresetNo);
  if (!options.length) return { options: [{ no: null, infos: [] }], current: null };
  return { options, current: pickCurrent(options, currentNo) };
}

function readJewel(details) {
  const data = details?.jewel?.data || {};
  const currentNo = toPresetNo(data.use_jewel_page_no);
  const options = toArray(data.jewel_equipment)
    .map((page) => ({ no: toPresetNo(page?.jewel_page_no), jewels: toArray(page?.jewel_info) }))
    .filter((option) => option.no !== null)
    .sort(byPresetNo);
  if (!options.length) return { options: [{ no: null, jewels: [] }], current: null };
  return { options, current: pickCurrent(options, currentNo) };
}

function isHuntingLinkPreset(skills) {
  const rule = linkRules.huntingPreset;
  return skills.some(
    (skill) =>
      String(skill?.skill_name || "").includes(rule.skillName) &&
      String(skill?.skill_effect || "").includes(rule.effectIncludes)
  );
}

function readLink(details) {
  const data = details?.linkSkill?.data || {};
  // Nexon spells the field use_prest_no; use_preset_no is accepted in case it is fixed.
  const currentNo = toPresetNo(data.use_prest_no ?? data.use_preset_no);
  const options = toArray(data.link_skill)
    .map((preset) => {
      const skills = toArray(preset?.link_skill_info);
      return { no: toPresetNo(preset?.preset_no), skills, hunting: isHuntingLinkPreset(skills) };
    })
    .filter((option) => option.no !== null)
    .sort(byPresetNo);
  if (!options.length) return { options: [{ no: null, skills: [], hunting: false }], current: null };
  return { options, current: pickCurrent(options, currentNo) };
}

function readUnionStat(details) {
  const data = details?.unionStat?.data || {};
  const currentNo = toPresetNo(data.use_preset_no);
  const options = toArray(data.union_stat_preset)
    .map((preset) => ({ no: toPresetNo(preset?.preset_no), stats: toArray(preset?.union_stat) }))
    .filter((option) => option.no !== null)
    .sort(byPresetNo);
  if (!options.length) {
    const stats = toArray(data.use_union_stat);
    return { options: [{ no: stats.length ? currentNo : null, stats }], current: stats.length ? currentNo : null };
  }
  return { options, current: pickCurrent(options, currentNo) };
}

function readPresets(details) {
  return {
    equipment: readEquipment(details),
    android: readAndroid(details),
    hyper: readHyper(details),
    jewel: readJewel(details),
    link: readLink(details),
    unionStat: readUnionStat(details)
  };
}

// Options the boss-setting search tries. Hunting link presets (엘프의 축복 EXP) are skipped
// only when link-skills.json says so (maplemworlds does, maplemtool does not), and never when
// every preset is a hunting one.
function searchOptions(presets, dimension) {
  const { options } = presets[dimension];
  if (dimension !== "link" || !linkRules.huntingPreset.excludeFromBossSetting) return options;
  const combat = options.filter((option) => !option.hunting);
  return combat.length ? combat : options;
}

function currentSelection(presets) {
  return Object.fromEntries(Object.entries(presets).map(([dimension, value]) => [dimension, value.current]));
}

function findOption(presets, dimension, no) {
  const { options } = presets[dimension];
  return options.find((option) => option.no === no) || options[0];
}

module.exports = { readPresets, searchOptions, currentSelection, findOption, toArray };
