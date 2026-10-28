"use strict";

// "직접 입력": stats the Nexon API does not expose (스타코러스, 성흔, 축복, 유니온 챔피언, 명예 배지,
// 몬스터 컬렉션, 펫 공격력). Both reference sites leave them at 0 unless the user fills them in;
// the item table and its sources are in src/game-data/manual-inputs.json.

const rules = require("../../../game-data/manual-inputs.json");
const { STAT_KEYS, STAT_SHORT_LABELS } = require("../keys");
const { makeContribution } = require("../contribution");
const { formatStatDelta } = require("../format");

// Job-family stats go to the physical or magical side of the character only.
const FAMILY_STATS = Object.freeze({
  attack: { physical: "physicalAttack", magical: "magicalAttack" },
  attackPercent: { physical: "physicalAttackPercent", magical: "magicalAttackPercent" },
  damage: { physical: "physicalDamagePercent", magical: "magicalDamagePercent" }
});

const MAX_KEYS = 100;

const GROUP_LABELS = Object.freeze(Object.fromEntries(rules.groups.map((group) => [group.id, group.label])));

function concreteKeys(stat) {
  if (FAMILY_STATS[stat]) return [FAMILY_STATS[stat].physical, FAMILY_STATS[stat].magical];
  if (!STAT_KEYS.includes(stat)) throw new Error(`manual-inputs.json: unknown stat "${stat}"`);
  return [stat];
}

function keyFor(stat, family) {
  return FAMILY_STATS[stat] ? FAMILY_STATS[stat][family === "magical" ? "magical" : "physical"] : stat;
}

function levelsOf(item) {
  return typeof item.levels === "string" ? rules.sharedLevels[item.levels] : item.levels;
}

// Resolved item table; level lists are shared by name in the JSON.
const ITEMS = Object.freeze(
  rules.items.map((item) => {
    const resolved = { ...item };
    if (item.unit === "level") resolved.levels = levelsOf(item);
    return Object.freeze(resolved);
  })
);
const ITEM_BY_ID = new Map(ITEMS.map((item) => [item.id, item]));

function statsOfItem(item) {
  if (item.unit !== "level") return [item.stat];
  const stats = new Set();
  item.levels.forEach((level) => Object.keys(level.effects).forEach((stat) => stats.add(stat)));
  if (item.group === "stigma") {
    Object.values(rules.stigmaSets.effects).forEach((effects) => Object.keys(effects).forEach((stat) => stats.add(stat)));
  }
  return [...stats];
}

function concreteEffects(effects) {
  const out = {};
  Object.entries(effects).forEach(([stat, value]) => {
    concreteKeys(stat).forEach((key) => {
      out[key] = value;
    });
  });
  return out;
}

function orderedKeys(keys) {
  return STAT_KEYS.filter((key) => keys.has(key));
}

/** Item list for GET /api/v2/manual-inputs (stat names are profile.majorStats keys). */
function listManualInputs() {
  const items = ITEMS.map((item) => {
    const stats = statsOfItem(item);
    const appliesTo = orderedKeys(new Set(stats.flatMap(concreteKeys)));
    const entry = {
      id: item.id,
      label: item.label,
      group: item.group,
      groupLabel: GROUP_LABELS[item.group] || item.group,
      unit: item.unit,
      min: item.min,
      max: item.max,
      step: item.step,
      default: 0,
      appliesTo,
      jobFamily: stats.some((stat) => Boolean(FAMILY_STATS[stat])),
      description: item.description,
      source: item.source
    };
    if (item.unit === "level") {
      entry.levels = item.levels.map((level) => ({
        value: level.value,
        label: level.label,
        effects: concreteEffects(level.effects),
        ...(level.source ? { source: level.source } : {})
      }));
    }
    return entry;
  });
  return {
    items,
    groups: rules.groups.map((group) => ({ ...group })),
    updatedAt: rules._meta.updatedAt
  };
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) return Number(value);
  return NaN;
}

function decimals(step) {
  const text = String(step);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

function snapToStep(value, item) {
  const steps = Math.round((value - item.min) / item.step);
  const snapped = item.min + steps * item.step;
  return Number(snapped.toFixed(decimals(item.step)));
}

/**
 * Validates user input. Unknown ids, non-numbers and unknown levels are dropped; numbers are
 * clamped to [min, max] and rounded to the item step. Zero means "not filled" and is left out.
 * → { values: { id: number }, warnings: [{ id, code, input, applied? }] }
 */
function normalizeManualInputs(raw) {
  const values = {};
  const warnings = [];
  if (raw === undefined || raw === null) return { values, warnings };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    const error = new Error("manual must be an object of { id: number }");
    error.code = "invalid_manual";
    throw error;
  }
  const entries = Object.entries(raw);
  if (entries.length > MAX_KEYS) {
    const error = new Error(`manual has more than ${MAX_KEYS} entries`);
    error.code = "too_many_entries";
    throw error;
  }
  entries.forEach(([id, input]) => {
    const item = ITEM_BY_ID.get(id);
    if (!item) {
      warnings.push({ id, code: "unknown_id" });
      return;
    }
    if (input === null || input === undefined || input === "") return;
    const number = toNumber(input);
    if (!Number.isFinite(number)) {
      warnings.push({ id, code: "not_a_number", input });
      return;
    }
    if (item.unit === "level") {
      if (!item.levels.some((level) => level.value === number)) {
        warnings.push({ id, code: "invalid_level", input });
        return;
      }
      if (number !== 0) values[id] = number;
      return;
    }
    let value = number;
    if (value < item.min || value > item.max) {
      value = Math.min(item.max, Math.max(item.min, value));
      warnings.push({ id, code: "clamped", input, applied: value });
    }
    const snapped = snapToStep(value, item);
    if (snapped !== value) {
      warnings.push({ id, code: "rounded_to_step", input, applied: snapped });
      value = snapped;
    }
    if (value !== 0) values[id] = value;
  });
  return { values, warnings };
}

function levelOf(item, value) {
  return item.levels.find((level) => level.value === value) || null;
}

function stigmaSetEffects(values) {
  const akan = ITEM_BY_ID.get("stigmaAkan");
  const azazel = ITEM_BY_ID.get("stigmaAzazel");
  const left = levelOf(akan, values.stigmaAkan);
  const right = levelOf(azazel, values.stigmaAzazel);
  if (!left?.color || !right?.color || left.color !== right.color || left.grade !== right.grade) return null;
  const effects = rules.stigmaSets.effects[`${left.color}/${left.grade}`];
  return effects ? { effects, text: `세트(${left.label.split(" (")[0]})` } : null;
}

/**
 * Contributions for normalized manual values, one per group and stat
 * ("직접 입력 · 스타코러스", category "manual"). `family` is "physical" or "magical".
 */
function manualContributions(values, { family = "physical" } = {}) {
  if (!values || !Object.keys(values).length) return [];
  // group → key → { value, texts, factors }
  const byGroup = new Map();
  // `text` names the input; numeric items already name their stat, level items do not.
  const add = (group, stat, value, text, withStat = true) => {
    if (!value) return;
    const key = keyFor(stat, family);
    if (!byGroup.has(group)) byGroup.set(group, new Map());
    const byKey = byGroup.get(group);
    const current = byKey.get(key) || { value: 0, texts: [], factors: [] };
    current.value += value;
    current.texts.push(`${text}${withStat ? ` · ${STAT_SHORT_LABELS[key]}` : ""} ${formatStatDelta(key, value)}`);
    current.factors.push(value);
    byKey.set(key, current);
  };

  ITEMS.forEach((item) => {
    const value = values[item.id];
    if (!value) return;
    if (item.unit === "level") {
      const level = levelOf(item, value);
      if (!level) return;
      Object.entries(level.effects).forEach(([stat, amount]) => add(item.group, stat, amount, `${item.label} (${level.label.split(" (")[0]})`));
      return;
    }
    add(item.group, item.stat, value, item.label, false);
  });
  const stigmaSet = stigmaSetEffects(values);
  if (stigmaSet) {
    Object.entries(stigmaSet.effects).forEach(([stat, amount]) => add("stigma", stat, amount, `성흔 ${stigmaSet.text}`));
  }

  const contributions = [];
  byGroup.forEach((byKey, group) => {
    byKey.forEach((current, key) =>
      contributions.push(
        makeContribution({
          key,
          value: Math.round(current.value * 1e6) / 1e6,
          category: "manual",
          group,
          label: `직접 입력 · ${GROUP_LABELS[group] || group}`,
          rawText: current.texts.join(" | "),
          factors: current.factors
        })
      )
    );
  });
  return contributions;
}

module.exports = { listManualInputs, normalizeManualInputs, manualContributions, MANUAL_GROUP_LABELS: GROUP_LABELS };
