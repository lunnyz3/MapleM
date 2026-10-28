"use strict";

// Item set effects and starforce set options, counted from the items of one equipment preset.
// The Nexon set-effect API only describes the preset in use, so other presets need the tables
// (src/game-data/item-sets.json, starforce-sets.json).

const itemSetData = require("../../../game-data/item-sets.json");
const starforceSetData = require("../../../game-data/starforce-sets.json");
const { parseStatText } = require("../text");
const { makeContribution, contributionsFromParsed } = require("../contribution");

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function itemName(item) {
  return String(item?.item_name || "").trim();
}

function isWeapon(item) {
  return String(item?.item_equipment_slot_name || "").trim() === "무기";
}

function itemStarforce(item) {
  const starforce = Number(item?.starforce_upgrade);
  if (!Number.isFinite(starforce) || starforce <= 0) return 0;
  // A one-piece overall counts twice (top + bottom).
  return String(item?.item_equipment_slot_name || "").trim() === "한벌옷" ? starforce * 2 : starforce;
}

function matchesSet(item, match = {}) {
  const name = itemName(item);
  if (!name) return false;
  const byName =
    toArray(match.names).includes(name) ||
    toArray(match.namePrefixes).some((prefix) => name.startsWith(prefix)) ||
    toArray(match.nameIncludes).some((keyword) => name.includes(keyword));
  if (!byName) return false;
  return !match.grade || String(item?.item_grade || "").trim() === match.grade;
}

/**
 * Members per set with the borrow and lucky-item rules applied.
 * Borrow: absolab ≥ 1 and exactly one arcane piece → the arcane piece counts for absolab.
 * Lucky: a Genesis weapon adds one piece (and its starforce) to every weapon-slot set that
 * already has 3 or more pieces.
 */
function resolveSets(items, sets) {
  const result = new Map();
  sets.forEach((set) => {
    const members = items.filter((item) => matchesSet(item, set.match));
    result.set(set.id, { set, members, extra: [], notes: [] });
  });

  const borrow = itemSetData.borrow;
  const host = result.get(borrow.host);
  const donor = result.get(borrow.donor);
  if (host && donor && host.members.length >= 1 && donor.members.length === borrow.donorCount) {
    const [borrowed] = donor.members;
    host.extra.push(borrowed);
    host.notes.push(`빌림: ${itemName(borrowed)}`);
    donor.members = [];
  }

  const weapon = items.find(isWeapon);
  const lucky = itemSetData.lucky;
  if (weapon && itemName(weapon).includes(lucky.weaponKeyword)) {
    result.forEach((entry) => {
      const count = entry.members.length + entry.extra.length;
      if (entry.set.weaponSlot && count >= lucky.minCount && !entry.members.includes(weapon)) {
        entry.extra.push(weapon);
        entry.notes.push(`럭키: ${itemName(weapon)}`);
      }
    });
  }
  return result;
}

function tierByCount(tiers, count) {
  return toArray(tiers)
    .filter((tier) => tier.count <= count)
    .sort((left, right) => right.count - left.count)[0] || null;
}

function tierByStarforce(tiers, starforce) {
  return toArray(tiers)
    .filter((tier) => tier.min <= starforce)
    .sort((left, right) => right.min - left.min)[0] || null;
}

function statsToContributions(stats, { category, group, label, rawText }) {
  return Object.entries(stats || {})
    .filter(([, value]) => Number(value))
    .map(([key, value]) => makeContribution({ key, value: Number(value), category, group, label, rawText }));
}

function isCashSetName(name) {
  const cash = itemSetData.cash;
  return (
    toArray(cash.namePrefixes).some((prefix) => name.startsWith(prefix)) ||
    toArray(cash.nameIncludes).some((keyword) => name.includes(keyword))
  );
}

const TABLE_SET_MATCHERS = itemSetData.sets.map((set) => ({
  names: toArray(set.apiNames),
  pattern: set.apiNamePattern ? new RegExp(set.apiNamePattern) : null
}));
const EXCLUDED_SET_PATTERN = new RegExp(itemSetData.excludeApiSetPattern);

function isTableSetName(name) {
  return TABLE_SET_MATCHERS.some((matcher) => matcher.names.includes(name) || (matcher.pattern && matcher.pattern.test(name)));
}

function isExcludedSetName(name) {
  return EXCLUDED_SET_PATTERN.test(name);
}

/**
 * Cash sets (마스터 라벨 등) do not change with equipment presets, so the API text is used for
 * every preset.
 */
function cashSetContributions(apiSets) {
  return toArray(apiSets)
    .filter((set) => {
      const name = String(set?.set_name || "").trim();
      return name && isCashSetName(name) && !isExcludedSetName(name);
    })
    .flatMap((set) =>
      contributionsFromParsed(parseStatText(set.set_option), {
        category: "equipment",
        group: "setEffect",
        label: `${String(set.set_name).trim()} ${set.set_count}세트`
      }).map((entry) => ({ ...entry, setId: `cash:${String(set.set_name).trim()}:${set.set_count}` }))
    );
}

/**
 * API sets our table does not know (and that are not cash or 성흔 sets). Only the preset in
 * use can use them, because the API describes that preset alone.
 */
function unknownApiSetContributions(apiSets) {
  return toArray(apiSets)
    .filter((set) => {
      const name = String(set?.set_name || "").trim();
      return name && !isCashSetName(name) && !isTableSetName(name) && !isExcludedSetName(name);
    })
    .flatMap((set) =>
      contributionsFromParsed(parseStatText(set.set_option), {
        category: "equipment",
        group: "setEffect",
        label: `${String(set.set_name).trim()} ${set.set_count}세트 (API)`
      }).map((entry) => ({ ...entry, setId: `api:${String(set.set_name).trim()}` }))
    );
}

function computeItemSets(items, context = {}) {
  const contributions = [];
  const summary = [];

  const itemSets = resolveSets(items, itemSetData.sets);
  itemSets.forEach(({ set, members, extra, notes }) => {
    const count = members.length + extra.length;
    if (!count) return;
    const tier = tierByCount(set.tiers, count);
    summary.push({ type: "set", id: set.id, label: set.label, count, notes });
    if (!tier) return;
    contributions.push(
      ...statsToContributions(tier.stats, {
        category: "equipment",
        group: "setEffect",
        label: `${set.label} ${count}세트`,
        rawText: [`${count}세트 효과`, ...notes].join(" | ")
      }).map((entry) => ({ ...entry, setId: set.id }))
    );
  });

  const starforceSets = resolveSets(items, starforceSetData.sets);
  starforceSets.forEach(({ set, members, extra, notes }) => {
    const all = [...members, ...extra];
    if (!all.length) return;
    const total = all.reduce((sum, item) => sum + itemStarforce(item), 0);
    const capped = Math.min(total, starforceSetData.cap);
    const tier = tierByStarforce(set.tiers, capped);
    summary.push({ type: "starforce", id: set.id, label: set.label, starforce: total, notes });
    if (!tier) return;
    contributions.push(
      ...statsToContributions(tier.stats, {
        category: "equipment",
        group: "starforceSet",
        label: `${set.label} ${capped}성`,
        rawText: [`스타포스 합 ${total} (구간 ${tier.min} 이상)`, ...notes].join(" | ")
      }).map((entry) => ({ ...entry, setId: set.id }))
    );
  });

  // Arcane set + arcane starforce 방무 count as one factor ("아케인셰이드 세트 (합산)").
  const arcaneSet = contributions.find((entry) => entry.key === "ignoreDefense" && entry.group === "setEffect" && entry.setId === "arcane");
  const arcaneStarforce = contributions.find(
    (entry) => entry.key === "ignoreDefense" && entry.group === "starforceSet" && entry.setId === "arcane"
  );
  if (arcaneSet && arcaneStarforce) {
    const value = arcaneSet.value + arcaneStarforce.value;
    contributions.splice(contributions.indexOf(arcaneSet), 1);
    contributions.splice(contributions.indexOf(arcaneStarforce), 1);
    contributions.push(
      makeContribution({
        key: "ignoreDefense",
        value,
        category: "equipment",
        group: "arcaneSetMerged",
        label: `세트 효과 · ${arcaneSet.label} (+${arcaneSet.value}%) / 스타포스 강화옵션 · ${arcaneStarforce.label} (+${arcaneStarforce.value}%)`,
        rawText: "아케인셰이드 세트효과와 스타포스 옵션의 방어율 무시는 더한 뒤 곱연산",
        factors: [value]
      })
    );
    contributions[contributions.length - 1].setId = "arcane";
  }

  if (context.isCurrent) {
    contributions.push(...unknownApiSetContributions(context.apiSets));
  }

  return { contributions, summary };
}

module.exports = { computeItemSets, cashSetContributions, matchesSet, resolveSets, itemStarforce };
