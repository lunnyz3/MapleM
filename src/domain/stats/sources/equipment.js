"use strict";

// Contributions that depend on the equipment preset: item options, soul, emblem, soul gauge,
// soul set attack, liberation weapon, item set effects and starforce set options.

const equipmentRules = require("../../../game-data/equipment-rules.json");
const characterBase = require("../../../game-data/character-base.json");
const { parseOption, parseStatText } = require("../text");
const { makeContribution, contributionsFromParsed } = require("../contribution");
const { computeItemSets } = require("./sets");

const OPTION_GROUPS = Object.freeze([
  ["item_additional_option", "additionalOption"],
  ["item_potential_option", "potential"],
  ["item_additional_potential_option", "additionalPotential"]
]);

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function isWeapon(item) {
  return String(item?.item_equipment_slot_name || "").trim() === "무기";
}

function itemName(item) {
  return String(item?.item_name || "-").trim() || "-";
}

function parseOptionList(list) {
  return toArray(list).flatMap((option) => parseOption(option));
}

// "위대한 칼로스의 소울" → "칼로스"
function soulBoss(soulName) {
  const text = String(soulName || "").trim();
  if (!text) return null;
  const stripped = text.replace(/의\s*소울$/, "").trim();
  const words = stripped.split(/\s+/);
  return words[words.length - 1] || null;
}

function weaponMasteryBonus(item, additionalParsed) {
  const rule = equipmentRules.weaponMastery.byAdditionalGrade[String(item?.item_additional_option_grade ?? "")];
  const bonus = {};
  if (!rule || !isWeapon(item)) return bonus;
  additionalParsed.forEach((entry) => {
    if ((entry.key === "physicalAttack" || entry.key === "magicalAttack") && entry.value > rule.threshold) {
      bonus[entry.key] = (bonus[entry.key] || 0) + rule.bonus;
    }
  });
  return bonus;
}

function itemContributions(item) {
  const name = itemName(item);
  const contributions = [];
  const additional = parseOptionList(item?.item_additional_option);
  const additionalSum = {};
  additional.forEach((entry) => {
    additionalSum[entry.key] = (additionalSum[entry.key] || 0) + entry.value;
  });

  // Base option lines already include the same stat's additional option (Nexon API).
  const basic = parseOptionList(item?.item_basic_option).map((entry) => ({
    ...entry,
    value: Math.max(0, entry.value - (additionalSum[entry.key] || 0))
  }));
  const mastery = weaponMasteryBonus(item, additional);
  const basicContributions = contributionsFromParsed(basic, {
    category: "equipment",
    group: "basicOption",
    label: name,
    labelWithStat: true
  });
  Object.entries(mastery).forEach(([key, bonus]) => {
    const target = basicContributions.find((entry) => entry.key === key);
    const note = `무기 마스터리 +${bonus.toLocaleString("ko-KR")}`;
    if (target) {
      target.value += bonus;
      target.label = `${target.label} · ${note}`;
      target.rawText = `${target.rawText} | ${note}`;
    } else {
      basicContributions.push(
        makeContribution({ key, value: bonus, category: "equipment", group: "basicOption", label: `${name} · ${note}`, rawText: note })
      );
    }
  });
  contributions.push(...basicContributions);

  OPTION_GROUPS.forEach(([field, group]) => {
    const parsed = field === "item_additional_option" ? additional : parseOptionList(item?.[field]);
    contributions.push(...contributionsFromParsed(parsed, { category: "equipment", group, label: name, labelWithStat: true }));
  });

  const soulOption = item?.soul_info?.soul_option;
  if (soulOption) {
    contributions.push(...contributionsFromParsed(parseStatText(soulOption), { category: "equipment", group: "soul", label: name }));
  }

  const emblem = item?.emblem_info;
  if (emblem?.emblem_option) {
    const emblemLabel = `${name} · ${emblem.emblem_name || "문장"}${emblem.emblem_level ? ` Lv.${emblem.emblem_level}` : ""}`;
    contributions.push(...contributionsFromParsed(parseStatText(emblem.emblem_option), { category: "equipment", group: "emblem", label: emblemLabel }));
  }

  return contributions;
}

function soulContributions(items, soulSetOption) {
  const weapon = items.find(isWeapon);
  const boss = soulBoss(weapon?.soul_info?.soul_name);
  if (!boss) return [];
  const contributions = [];
  const gauge = characterBase.soulGaugeAttack;
  ["physicalAttack", "magicalAttack"].forEach((key) => {
    contributions.push(
      makeContribution({ key, value: gauge, category: "equipment", group: "soulGauge", label: "소울 게이지 (0~199)", rawText: weapon.soul_info.soul_name })
    );
  });

  const sameBossCount = items.filter((item) => soulBoss(item?.soul_info?.soul_name) === boss).length;
  const label = `${boss} 소울 ${sameBossCount}개`;
  const apiText = typeof soulSetOption === "string" ? soulSetOption.trim() : "";
  if (apiText) {
    contributions.push(...contributionsFromParsed(parseStatText(apiText), { category: "equipment", group: "soulSet", label }));
    return contributions;
  }
  const perItem = equipmentRules.soulSetAttackFallback[boss];
  if (perItem && sameBossCount > 0) {
    ["physicalAttack", "magicalAttack"].forEach((key) => {
      contributions.push(
        makeContribution({
          key,
          value: perItem * sameBossCount,
          category: "equipment",
          group: "soulSet",
          label,
          rawText: `${boss} ${perItem} × ${sameBossCount} (API 값 없음, 표 사용)`
        })
      );
    });
  }
  return contributions;
}

function liberationContributions(items) {
  const weapon = items.find(isWeapon);
  const name = itemName(weapon);
  const rule = characterBase.liberationWeapon;
  if (!weapon || !rule.nameIncludes.some((keyword) => name.includes(keyword))) return [];
  return [
    makeContribution({
      key: "finalDamage",
      value: rule.finalDamage,
      category: "skill",
      group: "liberation",
      label: "해방 무기 착용",
      rawText: name
    })
  ];
}

/**
 * @param {{ items: object[], soulSetOption?: string|null }} option equipment preset
 * @param {{ apiSets?: object[], isCurrent?: boolean }} context
 */
function equipmentContributions(option, context = {}) {
  const items = toArray(option?.items);
  return [
    ...items.flatMap(itemContributions),
    ...soulContributions(items, option?.soulSetOption),
    ...liberationContributions(items),
    ...computeItemSets(items, context).contributions
  ];
}

module.exports = { equipmentContributions, itemContributions, soulBoss, isWeapon };
