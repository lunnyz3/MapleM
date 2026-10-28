"use strict";

// Content and growth sources: union, guild, symbols, pets, HEXA stat, Sol Janus, plus the
// preset-dependent ones (android heart, hyper stat, jewel page, link skill, union stat).

const linkRules = require("../../../game-data/link-skills.json");
const contentRules = require("../../../game-data/content-rules.json");
const { parseOption, parseStatText } = require("../text");
const { makeContribution, contributionsFromParsed } = require("../contribution");
const { normalizeClass } = require("./character");

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseList(list) {
  return toArray(list).flatMap((option) => parseOption(option));
}

function unionContributions(details) {
  const contributions = [];
  const levelOption = details?.union?.data?.union_level_total_option;
  if (levelOption) {
    contributions.push(
      ...contributionsFromParsed(parseStatText(levelOption), { category: "content", group: "union", label: "유니온 레벨 효과" })
    );
  }
  const raider = details?.unionRaider?.data?.use_union_raider_option;
  contributions.push(
    ...contributionsFromParsed(parseList(raider), { category: "content", group: "union", label: "유니온 공격대원 효과" })
  );
  return contributions;
}

function findSelfMember(guildData, characterName) {
  const name = String(characterName || "").trim();
  if (!name) return null;
  return toArray(guildData?.guild_member).find((member) => String(member?.character_name || "").trim() === name) || null;
}

function guildContributions(details) {
  const guildData = details?.guildBasic?.data;
  if (!guildData) return [];
  const rules = contentRules.guild;
  const excludedNumbers = new Set(rules.excludedAbilityNumbers);
  const contributions = [];
  toArray(guildData.guild_ability).forEach((ability) => {
    const name = String(ability?.ability_name || "");
    if (excludedNumbers.has(Number(ability?.ability_no))) return;
    if (rules.excludedAbilityNameIncludes.some((keyword) => name.includes(keyword))) return;
    contributions.push(
      ...contributionsFromParsed(parseStatText(ability?.ability_option), {
        category: "content",
        group: "guild",
        label: `길드 어빌리티 · ${name.replace(/^Lv\.\d+\s*/, "") || "-"}`
      })
    );
  });
  const member = findSelfMember(guildData, details?.basic?.data?.character_name);
  toArray(member?.guild_personal_skill).forEach((skill) => {
    contributions.push(
      ...contributionsFromParsed(parseStatText(skill?.skill_option), {
        category: "content",
        group: "guild",
        label: `길드 개인 스킬 · ${skill?.skill_name || "-"}`
      })
    );
  });
  return contributions;
}

// Symbols with the same option text are shown as one row (maplemworlds).
function symbolContributions(details) {
  const data = details?.symbol?.data || {};
  const symbols = [...toArray(data.arcane_symbol), ...toArray(data.authentic_symbol), ...toArray(data.grand_symbol)];
  const byText = new Map();
  symbols.forEach((symbol) => {
    const text = String(symbol?.symbol_option || "").trim();
    if (!text) return;
    byText.set(text, (byText.get(text) || 0) + 1);
  });
  const contributions = [];
  byText.forEach((count, text) => {
    const parsed = parseStatText(text).map((entry) => ({ ...entry, value: entry.value * count }));
    contributions.push(
      ...contributionsFromParsed(parsed, {
        category: "equipment",
        group: "symbol",
        label: count > 1 ? `${text} × ${count}` : text
      })
    );
  });
  return contributions;
}

function petContributions(details) {
  const data = details?.petEquipment?.data || {};
  const contributions = [];
  [1, 2, 3].forEach((slot) => {
    const equipment = data[`pet_${slot}_equipment`];
    const options = toArray(equipment?.item_option);
    if (!options.length) return;
    contributions.push(
      ...contributionsFromParsed(parseList(options), {
        category: "growth",
        group: "pet",
        label: `펫 장비 · ${equipment?.item_name || data[`pet_${slot}_name`] || slot}`
      })
    );
  });
  toArray(data.pet_set_option).forEach((set) => {
    contributions.push(
      ...contributionsFromParsed(parseStatText(set?.set_option), {
        category: "growth",
        group: "pet",
        label: `펫 세트 (${set?.set_name || "-"})`
      })
    );
  });
  return contributions;
}

function hexaStatContributions(details) {
  const contributions = [];
  toArray(details?.hexamatrixStat?.data?.hexamatrix_stat).forEach((core) => {
    toArray(core?.stat_info)
      .filter((info) => String(info?.activate_flag ?? "") === "1")
      .forEach((info) => {
        const texts = [info.main_stat, info.sub_1_stat, info.sub_2_stat].filter(Boolean);
        const parsed = texts.flatMap((text) => parseStatText(text));
        contributions.push(
          ...contributionsFromParsed(parsed, {
            category: "content",
            group: "hexaStat",
            label: `HEXA 스탯 코어 ${core?.stat_core_slot ?? ""} (${info.page_no ?? "-"}페이지)`.replace(/\s+\(/, " (")
          })
        );
      });
  });
  return contributions;
}

function solJanusFinalDamage(level) {
  const rule = contentRules.solJanus;
  if (!Number.isFinite(level) || level <= 0) return 0;
  return rule.levelBonuses.reduce(
    (sum, bonus) => (level >= bonus.minLevel ? sum + bonus.finalDamage : sum),
    rule.finalDamagePerLevel * level
  );
}

function solJanusContributions(details) {
  const rule = contentRules.solJanus;
  const skill = toArray(details?.hexamatrixSkill?.data?.hexamatrix_skill).find((entry) =>
    String(entry?.skill_name || "").startsWith(rule.skillName)
  );
  const level = Number(skill?.slot_level);
  const value = solJanusFinalDamage(level);
  if (!value) return [];
  return [
    makeContribution({
      key: "finalDamage",
      value,
      category: "content",
      group: "solJanus",
      label: `솔 야누스 Lv.${level}`,
      rawText: "0.5×Lv + Lv.10/20/30 보너스 3/5/7"
    })
  ];
}

function heartContributions(option) {
  const heart = option?.heart;
  if (!heart) return [];
  const name = heart.heart_name || "기계 심장";
  return [
    ...contributionsFromParsed(parseList(heart.item_additional_option), {
      category: "equipment",
      group: "additionalOption",
      label: name,
      labelWithStat: true
    }),
    ...contributionsFromParsed(parseList(heart.item_potential_option), {
      category: "growth",
      group: "potential",
      label: name,
      labelWithStat: true
    }),
    ...contributionsFromParsed(parseList(heart.item_additional_potential_option), {
      category: "growth",
      group: "additionalPotential",
      label: name,
      labelWithStat: true
    })
  ];
}

function hyperContributions(option) {
  return toArray(option?.infos).flatMap((info) =>
    contributionsFromParsed(parseStatText(info?.stat_increase), {
      category: "content",
      group: "hyperStat",
      label: `하이퍼 스탯 · ${info?.stat_type || "-"}`
    })
  );
}

// Jewels with the same option text are one row; 5+ SSS jewels of one color add 방무 2.
function jewelContributions(option) {
  const jewels = toArray(option?.jewels);
  const byText = new Map();
  jewels.forEach((jewel) => {
    const text = String(jewel?.jewel_option || "").trim();
    if (text) byText.set(text, (byText.get(text) || 0) + 1);
  });
  const contributions = [];
  byText.forEach((count, text) => {
    const parsed = parseStatText(text).map((entry) => ({ ...entry, value: entry.value * count }));
    contributions.push(
      ...contributionsFromParsed(parsed, {
        category: "growth",
        group: "jewel",
        label: count > 1 ? `${text} × ${count}` : text
      }).map((entry) => (entry.key === "ignoreDefense" ? { ...entry, factors: Array(count).fill(entry.value / count) } : entry))
    );
  });
  const rule = contentRules.jewel.sssSet;
  const colorCounts = new Map();
  jewels
    .filter((jewel) => String(jewel?.jewel_grade || "").trim() === rule.grade)
    .forEach((jewel) => colorCounts.set(jewel.jewel_color, (colorCounts.get(jewel.jewel_color) || 0) + 1));
  const fullColor = [...colorCounts.entries()].find(([, count]) => count >= rule.minSameColor);
  if (fullColor) {
    contributions.push(
      makeContribution({
        key: "ignoreDefense",
        value: rule.ignoreDefense,
        category: "growth",
        group: "jewel",
        label: `SSS 쥬얼 ${rule.minSameColor}개`,
        rawText: `${fullColor[0]} SSS ${fullColor[1]}개`
      })
    );
  }
  return contributions;
}

const CONDITIONAL_SENTENCE = new RegExp(linkRules.conditionalSentencePattern);

function linkConditionalFilter() {
  return (segment) => CONDITIONAL_SENTENCE.test(segment);
}

function selfLinkLevel(characterLevel) {
  const level = Number(characterLevel);
  const rule = linkRules.selfLinkLevelByCharacterLevel.find((entry) => level >= entry.minLevel);
  return rule ? rule.linkLevel : 0;
}

function selfLinkFor(className) {
  const normalized = normalizeClass(className);
  return linkRules.selfLinks.find((link) => link.classes.some((job) => normalizeClass(job) === normalized)) || null;
}

function linkContributions(option, character) {
  const skip = linkConditionalFilter();
  const skills = toArray(option?.skills);
  const contributions = skills.flatMap((skill) =>
    contributionsFromParsed(parseStatText(skill?.skill_effect, { skipSegment: skip }), {
      category: "content",
      group: "linkSkill",
      label: `${skill?.skill_name || "-"} Lv.${skill?.skill_level ?? "-"}`
    })
  );

  // The character's own link (Lv.1/2/3 at character level 70/120/260), capped at the link's
  // max level together with the same link in the preset (maplemtool rule).
  const self = selfLinkFor(character.className);
  const natural = selfLinkLevel(character.level);
  if (self && natural > 0) {
    const equipped = skills
      .filter((skill) => String(skill?.skill_name || "").trim() === self.name)
      .reduce((sum, skill) => sum + (Number(skill?.skill_level) || 0), 0);
    const applied = Math.max(0, Math.min(self.maxLevel, equipped + natural) - equipped);
    if (applied > 0) {
      Object.entries(self.perLevel).forEach(([key, perLevel]) => {
        const value = Math.round(perLevel * applied * 1000) / 1000;
        if (!value) return;
        contributions.push(
          makeContribution({
            key,
            value,
            category: "content",
            group: "linkSkill",
            label: `본인 링크 · ${self.name} +${applied}`,
            rawText: `캐릭터 Lv.${character.level} → 링크 Lv.${natural}${applied < natural ? ` (최대 Lv.${self.maxLevel}까지)` : ""}`
          })
        );
      });
    }
  }
  return contributions;
}

function unionStatContributions(option) {
  const parsed = toArray(option?.stats).flatMap((stat) =>
    parseOption({ option_name: stat?.stat_name, option_value: stat?.stat_value })
  );
  return contributionsFromParsed(parsed, { category: "content", group: "unionStat", label: "유니온 스탯" });
}

module.exports = {
  unionContributions,
  guildContributions,
  symbolContributions,
  petContributions,
  hexaStatContributions,
  solJanusContributions,
  solJanusFinalDamage,
  heartContributions,
  hyperContributions,
  jewelContributions,
  linkContributions,
  unionStatContributions,
  selfLinkLevel
};
