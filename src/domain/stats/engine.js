"use strict";

// Nexon character details → stat sheets for the boss setting (best combat power over every
// preset combination) and for the presets currently in use.

const { PRESET_DIMENSIONS, STAT_KEYS } = require("./keys");
const { readPresets, searchOptions, currentSelection, findOption } = require("./presets");
const { sumContributions, baseAttackContribution, combatPower, emptyTotals } = require("./aggregate");
const { equipmentContributions } = require("./sources/equipment");
const { cashSetContributions } = require("./sources/sets");
const { passiveContributions, vmatrixContributions, isMagicJob, levelBaseAttack } = require("./sources/character");
const {
  unionContributions,
  guildContributions,
  symbolContributions,
  petContributions,
  hexaStatContributions,
  solJanusContributions,
  heartContributions,
  hyperContributions,
  jewelContributions,
  linkContributions,
  unionStatContributions
} = require("./sources/content");
const { manualContributions } = require("./sources/manual");

function characterContext(details) {
  const basic = details?.basic?.data || {};
  return {
    name: String(basic.character_name || "").trim(),
    // character_job_name is being removed by Nexon; character_class carries the same value.
    className: String(basic.character_class || basic.character_job_name || details?.itemEquipment?.data?.character_class || "").trim(),
    level: Number(basic.character_level) || 0,
    apiSets: Array.isArray(details?.setEffect?.data?.set_info) ? details.setEffect.data.set_info : []
  };
}

function fixedContributions(details, context) {
  return [
    ...passiveContributions(context.className),
    ...vmatrixContributions(details?.vmatrix?.data, context.className),
    ...cashSetContributions(context.apiSets),
    ...symbolContributions(details),
    ...petContributions(details),
    ...unionContributions(details),
    ...guildContributions(details),
    ...hexaStatContributions(details),
    ...solJanusContributions(details)
  ];
}

function dimensionContributions(dimension, option, context, presets) {
  switch (dimension) {
    case "equipment":
      return equipmentContributions(option, { apiSets: context.apiSets, isCurrent: option.no === presets.equipment.current });
    case "android":
      return heartContributions(option);
    case "hyper":
      return hyperContributions(option);
    case "jewel":
      return jewelContributions(option);
    case "link":
      return linkContributions(option, context);
    case "unionStat":
      return unionStatContributions(option);
    default:
      return [];
  }
}

function vectorOf(contributions) {
  const vector = emptyTotals();
  contributions.forEach((entry) => {
    if (entry.key !== "ignoreDefense") vector[entry.key] += entry.value;
  });
  return vector;
}

function addVector(target, source) {
  STAT_KEYS.forEach((key) => {
    target[key] += source[key];
  });
}

/**
 * Tries every preset combination and keeps the one with the highest combat power. Ties keep
 * the first combination in preset-number order.
 */
function searchBossSelection({ presets, contributionsByDimension, fixedVector, level }) {
  const lists = PRESET_DIMENSIONS.map((dimension) =>
    searchOptions(presets, dimension).map((option) => ({
      no: option.no,
      vector: vectorOf(contributionsByDimension[dimension].get(option.no) || [])
    }))
  );
  let best = null;
  let count = 0;
  const totals = emptyTotals();
  const baseAttack = levelBaseAttack(level);
  const picked = new Array(lists.length);

  const visit = (index) => {
    if (index === lists.length) {
      count += 1;
      STAT_KEYS.forEach((key) => {
        totals[key] = fixedVector[key];
      });
      picked.forEach((entry) => addVector(totals, entry.vector));
      if (baseAttack) {
        totals[totals.magicalAttack > totals.physicalAttack ? "magicalAttack" : "physicalAttack"] += baseAttack;
      }
      const power = combatPower(totals);
      if (!best || power > best.power) {
        best = { power, selection: picked.map((entry) => entry.no) };
      }
      return;
    }
    lists[index].forEach((entry) => {
      picked[index] = entry;
      visit(index + 1);
    });
  };
  visit(0);

  return {
    selection: Object.fromEntries(PRESET_DIMENSIONS.map((dimension, index) => [dimension, best ? best.selection[index] : null])),
    combinationCount: count
  };
}

function buildSheet({ selection, fixed, contributionsByDimension, context }) {
  const contributions = [
    ...fixed,
    ...PRESET_DIMENSIONS.flatMap((dimension) => contributionsByDimension[dimension].get(selection[dimension]) || [])
  ];
  const base = baseAttackContribution(context.level, sumContributions(contributions));
  if (base) contributions.push(base);
  const totals = sumContributions(contributions);
  const attackType =
    totals.magicalAttack !== totals.physicalAttack
      ? totals.magicalAttack > totals.physicalAttack
        ? "magical"
        : "physical"
      : isMagicJob(context.className)
        ? "magical"
        : "physical";
  return { selection, contributions, totals, combatPower: combatPower(totals), attackType };
}

function resolveCurrentSelection(presets, contributionsByDimension) {
  const current = currentSelection(presets);
  // A dimension whose current preset is unknown falls back to its first option.
  PRESET_DIMENSIONS.forEach((dimension) => {
    if (!contributionsByDimension[dimension].has(current[dimension])) {
      current[dimension] = findOption(presets, dimension, current[dimension])?.no ?? null;
    }
  });
  return current;
}

function hasManual(manual) {
  return Boolean(manual) && Object.keys(manual).length > 0;
}

/**
 * `manual` is the validated "직접 입력" values ({ id: number }, see sources/manual.js). They
 * do not depend on presets, so they join the fixed contributions and the boss-setting search
 * runs again with them. Job-family inputs (깡공·공격력%·대미지) go to the attack type the
 * presets in use have without them.
 */
function prepare(details, manual) {
  const context = characterContext(details);
  const presets = readPresets(details);
  const fixed = fixedContributions(details, context);
  const contributionsByDimension = {};
  PRESET_DIMENSIONS.forEach((dimension) => {
    const map = new Map();
    presets[dimension].options.forEach((option) => {
      map.set(option.no, dimensionContributions(dimension, option, context, presets));
    });
    contributionsByDimension[dimension] = map;
  });
  const prepared = { context, presets, fixed, contributionsByDimension, manual: null };
  if (!hasManual(manual)) return prepared;
  const current = resolveCurrentSelection(presets, contributionsByDimension);
  const family = buildSheet({ selection: current, fixed, contributionsByDimension, context }).attackType;
  const added = manualContributions(manual, { family });
  return { ...prepared, fixed: [...fixed, ...added], manual: { values: { ...manual }, family, contributions: added.length } };
}

/**
 * Stat sheet for a given preset selection ({ equipment: 2, android: 1, ... }). Missing or
 * unknown numbers fall back to the preset in use. Used by the calibration report.
 */
function computeStatSheetForSelection(details, selection = {}, { manual } = {}) {
  const { context, presets, fixed, contributionsByDimension } = prepare(details, manual);
  const current = currentSelection(presets);
  const resolved = Object.fromEntries(
    PRESET_DIMENSIONS.map((dimension) => {
      const map = contributionsByDimension[dimension];
      const wanted = selection[dimension];
      const fallback = map.has(current[dimension]) ? current[dimension] : ([...map.keys()][0] ?? null);
      return [dimension, map.has(wanted) ? wanted : fallback];
    })
  );
  return buildSheet({ selection: resolved, fixed, contributionsByDimension, context });
}

function computeStatSheets(details, { manual } = {}) {
  const { context, presets, fixed, contributionsByDimension, manual: manualInfo } = prepare(details, manual);

  const current = resolveCurrentSelection(presets, contributionsByDimension);

  const search = searchBossSelection({
    presets,
    contributionsByDimension,
    fixedVector: vectorOf(fixed),
    level: context.level
  });

  const boss = buildSheet({ selection: search.selection, fixed, contributionsByDimension, context });
  const currentSheet = buildSheet({ selection: current, fixed, contributionsByDimension, context });

  const options = Object.fromEntries(
    PRESET_DIMENSIONS.map((dimension) => [
      dimension,
      {
        available: presets[dimension].options.map((option) => option.no).filter((no) => no !== null),
        searched: searchOptions(presets, dimension).map((option) => option.no).filter((no) => no !== null),
        hunting: dimension === "link" ? presets.link.options.filter((option) => option.hunting).map((option) => option.no) : undefined
      }
    ])
  );

  return {
    character: { name: context.name, className: context.className, level: context.level },
    boss,
    current: currentSheet,
    combinationCount: search.combinationCount,
    options,
    manual: manualInfo
  };
}

module.exports = { computeStatSheets, computeStatSheetForSelection, characterContext };
