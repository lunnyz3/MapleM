"use strict";

// 내실 리포트: 영역마다 완성도(지금/최대)와 다 채웠을 때 보스 세팅 스탯이 얼마나 바뀌는지(delta).
// 전투력 상승량은 화면이 같은 전투력 공식으로 계산한다(링크 영역도 화면에서 링크 추천으로 더한다).
// 지금 기여는 스탯 출처 내역(breakdown)에서, 최대치는 src/game-data/growth-report.json 표에서 온다.

const rules = require("../../game-data/growth-report.json");
const hexaRules = require("../../game-data/hexa.json");
const { parseStatText } = require("../stats/text");
const { levelBaseAttack } = require("../stats/sources/character");

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/** 직업 계열 스탯 키(물리/마법). */
function familyKeys(attackType) {
  const magical = attackType === "magical";
  return {
    attack: magical ? "magicalAttack" : "physicalAttack",
    attackPercent: magical ? "magicalAttackPercent" : "physicalAttackPercent",
    damage: magical ? "magicalDamagePercent" : "physicalDamagePercent",
    other: magical ? "physical" : "magical"
  };
}

/** 내역에서 조건에 맞는 항목의 스탯별 합. */
function contributionOf(majorStats, match) {
  const sums = {};
  for (const [key, stat] of Object.entries(majorStats || {})) {
    for (const entry of toArray(stat?.breakdown)) {
      if (!match(entry)) continue;
      const value = Number(entry.value);
      if (Number.isFinite(value)) sums[key] = (sums[key] || 0) + value;
    }
  }
  return sums;
}

/** 문구 목록 → 스탯별 합(다른 직업 계열 키는 뺀다). */
function statsFromTexts(texts, attackType) {
  const other = familyKeys(attackType).other;
  const sums = {};
  texts.forEach((text) => {
    parseStatText(String(text)).forEach((entry) => {
      if (entry.key.startsWith(other)) return;
      sums[entry.key] = (sums[entry.key] || 0) + entry.value;
    });
  });
  return sums;
}

/** 최대치 − 지금 기여(스탯마다, 0 미만은 0). */
function deltaOf(max, current) {
  const delta = {};
  for (const key of new Set([...Object.keys(max), ...Object.keys(current)])) {
    const value = round((max[key] || 0) - (current[key] || 0));
    if (value > 0) delta[key] = value;
  }
  return delta;
}

function area(id, label, { current, max, unit = "", delta = {}, detail = "", completion = null }) {
  const ratio = completion ?? (max > 0 ? Math.min(1, current / max) : 0);
  return { id, label, current: round(current, 2), max, unit, completion: round(ratio, 4), delta, detail };
}

// ---------------- 영역 ----------------

function levelArea(level, majorStats) {
  const current = contributionOf(majorStats, (entry) => entry.group === "baseAttack");
  const key = Object.keys(current)[0] || "physicalAttack";
  const delta = level < rules.level.max ? deltaOf({ [key]: levelBaseAttack(rules.level.max) }, current) : {};
  return area("level", "레벨", { current: level, max: rules.level.max, unit: "Lv", delta, detail: level < rules.level.max ? `Lv.${rules.level.max}이면` : "" });
}

/** 코어 종류(hexa.json cores 키). 스킬 코어는 1번 칸이 오리진, 나머지는 어센트. */
function hexaCoreKind(row) {
  const type = String(row?.skill_type || "");
  if (type.includes("스킬")) return Number(row?.slot_no) > 1 ? "어센트 코어" : "오리진 코어";
  if (type.includes("마스터리")) return "마스터리 코어";
  if (type.includes("강화")) return "강화 코어";
  if (type.includes("공용")) return "공용 코어";
  return "";
}

const fragmentsTo = (kind, level) =>
  toArray(hexaRules.cores?.[kind]?.fragments)
    .slice(0, Math.max(0, level))
    .reduce((sum, value) => sum + value, 0);

function hexaArea(details, majorStats) {
  const rows = toArray(details?.hexamatrixSkill?.data?.hexamatrix_skill).map((row) => ({
    kind: hexaCoreKind(row),
    level: Number(row?.slot_level) || 0,
    name: row?.skill_name
  }));
  const counts = {};
  rows.forEach((row) => (counts[row.kind] = (counts[row.kind] || 0) + 1));
  // 직업마다 같은 구성(오리진 1·마스터리 2·강화 4·솔 야누스 1)에서 응답에 없는 코어는 Lv.0으로 센다.
  for (const [kind, count] of Object.entries(rules.hexa.catalog)) {
    for (let i = counts[kind] || 0; i < count; i += 1) rows.push({ kind, level: 0 });
  }
  const used = rows.reduce((sum, row) => sum + fragmentsTo(row.kind, row.level), 0);
  const total = rows.reduce((sum, row) => sum + fragmentsTo(row.kind, hexaRules.maxLevel || 30), 0);
  const current = contributionOf(majorStats, (entry) => entry.group === "solJanus");
  const delta = deltaOf({ finalDamage: rules.hexa.solJanusMaxFinalDamage }, current);
  return area("hexa", "HEXA", {
    current: used,
    max: total,
    unit: "조각",
    delta,
    completion: total ? Math.round((used / total) * 100) / 100 : 0,
    detail: "솔 야누스 최종 대미지"
  });
}

function symbolNeeded(table, level) {
  let sum = 0;
  for (let lv = 1; lv < level; lv += 1) sum += Number(table.symbolsToNext[String(lv)]) || 0;
  return sum;
}

function symbolArea(details, majorStats, attackType, characterLevel) {
  const keys = familyKeys(attackType);
  const data = details?.symbol?.data || {};
  const owned = new Map();
  [...toArray(data.arcane_symbol), ...toArray(data.authentic_symbol)].forEach((symbol) => {
    const region = String(symbol?.symbol_name || "")
      .replace(/^.*?:\s*/, "")
      .trim();
    owned.set(region, Number(symbol?.symbol_level) || 0);
  });
  let got = 0;
  let total = 0;
  const max = {};
  const add = (key, value) => (max[key] = (max[key] || 0) + value);
  for (const [kind, table] of [
    ["arcane", rules.symbol.arcane],
    ["authentic", rules.symbol.authentic]
  ]) {
    const full = symbolNeeded(table, table.maxLevel);
    for (const region of table.regions) {
      const level = owned.get(region.name) || 0;
      got += symbolNeeded(table, level);
      total += full;
      if (!level && characterLevel < region.requiredLevel) continue;
      if (kind === "arcane") add(keys.attack, Number(table.attackByLevel[String(table.maxLevel)]) || 0);
      else if (region.stat === "치명타 피해") add("criticalDamage", table.atMax.critDmg);
      else add(keys.attack, table.atMax.attack);
    }
  }
  const current = contributionOf(majorStats, (entry) => entry.group === "symbol");
  return area("symbol", "심볼", { current: got, max: total, unit: "개", delta: deltaOf(max, current) });
}

function unionArea(details, majorStats, attackType) {
  const keys = familyKeys(attackType);
  const level = Number(details?.union?.data?.union_level) || 0;
  const delta = {};
  const plus = (sums) => Object.entries(sums).forEach(([key, value]) => (delta[key] = round((delta[key] || 0) + value)));
  // 아직 못 넘은 레벨 구간 효과
  const missing = rules.union.levelEffects
    .filter((tier) => tier.minLevel > level && tier.minLevel <= rules.union.maxLevel)
    .flatMap((tier) => tier.effects.map((effect) => `${effect.name} ${effect.value}${effect.unit}`));
  plus(statsFromTexts(missing, attackType));
  // 유니온 스탯 전투 4종(직업 계열 공격력%·대미지, 보스 공격력, 치명타 피해) 20%까지
  const stat = contributionOf(majorStats, (entry) => entry.group === "unionStat");
  const statMax = rules.union.statMaxPercent;
  plus(deltaOf({ [keys.attackPercent]: statMax, [keys.damage]: statMax, bossDamage: statMax, criticalDamage: statMax }, stat));
  // 공격대원 효과: 응답에 있는 전투 줄만 상한까지
  const raiderTexts = toArray(details?.unionRaider?.data?.use_union_raider_option).map((option) => `${option?.option_name} ${option?.option_value}`);
  const raider = statsFromTexts(raiderTexts, attackType);
  const caps = statsFromTexts(
    Object.entries(rules.union.raiderCaps).map(([name, cap]) => `${name} ${cap}%`),
    attackType
  );
  plus(
    deltaOf(
      Object.fromEntries(
        Object.keys(raider)
          .filter((key) => key in caps)
          .map((key) => [key, caps[key]])
      ),
      raider
    )
  );
  return area("union", "유니온", { current: level, max: rules.union.maxLevel, unit: "", delta });
}

function hyperArea(details, attackType, selection) {
  const data = details?.hyperStat?.data || {};
  const presetNo = Number(selection?.hyper) || Number(data.use_preset_no) || 1;
  const preset = toArray(data.hyper_stat).find((item) => Number(item?.preset_no) === presetNo) || toArray(data.hyper_stat)[0];
  const levels = new Map(toArray(preset?.hyper_stat_info).map((info) => [String(info?.stat_type || ""), Number(info?.stat_level) || 0]));
  const damageName = attackType === "magical" ? "마법 대미지" : "물리 대미지";
  const main = rules.hyper.main.filter((name) => !/^(물리|마법) 대미지$/.test(name) || name === damageName);
  const delta = {};
  let sum = 0;
  main.forEach((name) => {
    const level = Math.min(rules.hyper.maxLevel, levels.get(name) || 0);
    sum += level;
    const table = rules.hyper.stats.find((stat) => stat.name === name);
    if (!table || level >= rules.hyper.maxLevel) return;
    const now = level ? table.values[level - 1] : 0;
    const gain = table.values[rules.hyper.maxLevel - 1] - now;
    Object.entries(statsFromTexts([`${name} ${gain}${table.unit}`], attackType)).forEach(([key, value]) => (delta[key] = round((delta[key] || 0) + value)));
  });
  return area("hyper", "하이퍼 주요 스탯", { current: sum, max: main.length * rules.hyper.maxLevel, unit: "", delta });
}

function guildArea(details, majorStats, attackType, characterName) {
  const member = toArray(details?.guildBasic?.data?.guild_member).find((item) => item?.character_name === characterName);
  if (!member) return null;
  // 같은 이름(물리/마법 공격력·대미지, 최종 대미지)이 등급별로 두 줄이라 표 순서대로 응답 줄과 짝을 맞춘다.
  const seen = new Map();
  const apiRows = toArray(member.guild_personal_skill).map((skill) => String(skill?.skill_name || "").replace(/\s*Lv\.\d+$/, ""));
  let spent = 0;
  let total = 0;
  const max = {};
  rules.guild.personal.forEach((row) => {
    if (!row.combat) return;
    const index = seen.get(row.name) || 0;
    seen.set(row.name, index + 1);
    const matches = apiRows.map((name, i) => (name === row.name ? i : -1)).filter((i) => i >= 0);
    const apiIndex = matches[index];
    const level = apiIndex === undefined ? 0 : Number(toArray(member.guild_personal_skill)[apiIndex]?.skill_level) || 0;
    spent += row.gp.slice(0, level).reduce((sum, value) => sum + value, 0);
    total += row.gp.reduce((sum, value) => sum + value, 0);
    const texts = row.effects.map((effect) => `${effect.name} ${effect.values[rules.guild.maxLevel - 1]}${effect.pct ? "%" : ""}`);
    Object.entries(statsFromTexts(texts, attackType)).forEach(([key, value]) => (max[key] = (max[key] || 0) + value));
  });
  if (!apiRows.length) return null;
  const current = contributionOf(majorStats, (entry) => entry.group === "guild" && String(entry.source || "").startsWith("길드 개인 스킬"));
  return area("guild", "길드 개인 스킬", { current: spent, max: total, unit: "GP", delta: deltaOf(max, current) });
}

function commonCoreArea(details, majorStats) {
  const cores = toArray(details?.vmatrix?.data?.character_v_core_equipment).filter((core) => String(core?.vcore_equipment_flag) === "1");
  const points = (level) => (level * (level + 1)) / 2;
  let spent = 0;
  rules.common.cores.forEach((name) => {
    const core = cores.find((item) => item?.vcore_skill_name1 === name || item?.vcore_name === name);
    if (core) spent += points(Math.min(rules.common.maxLevel, Number(core.vcore_level) || 0));
  });
  const total = rules.common.cores.length * points(rules.common.maxLevel);
  const current = contributionOf(majorStats, (entry) => entry.group === "vmatrix" && String(entry.source || "").startsWith("공용 코어"));
  const perCore = rules.common.attackPercent.base + rules.common.attackPercent.perLevel * rules.common.maxLevel;
  const max = { physicalAttackPercent: perCore * rules.common.cores.length, magicalAttackPercent: perCore * rules.common.cores.length };
  const keyed = Object.keys(current).length
    ? Object.fromEntries(Object.keys(current).map((key) => [key, max[key] || 0]))
    : { physicalAttackPercent: max.physicalAttackPercent, magicalAttackPercent: max.magicalAttackPercent };
  return area("common", "공용 코어", { current: spent, max: total, unit: "V포인트", delta: deltaOf(keyed, current) });
}

function jewelArea(details, majorStats, attackType, selection) {
  const data = details?.jewel?.data || {};
  const pageNo = Number(selection?.jewel) || Number(data.use_jewel_page_no);
  const page = toArray(data.jewel_equipment).find((item) => Number(item?.jewel_page_no) === pageNo);
  if (!page) return null;
  const keys = familyKeys(attackType);
  const sss = (color) => rules.jewel.valueTables[color.valueTable].byGrade.SSS;
  const combatKeys = new Set([keys.attack, keys.damage, "criticalDamage", "bossDamage"]);
  const slots = toArray(page.jewel_info).slice(0, rules.jewel.slots);
  const combat = slots
    .map((slot) => {
      const color = rules.jewel.colors.find((item) => item.name === slot?.jewel_color);
      const stats = statsFromTexts([String(slot?.jewel_option || "")], attackType);
      const key = Object.keys(stats)[0];
      if (!color || !combatKeys.has(key)) return null;
      const value = rules.jewel.valueTables[color.valueTable].byGrade[String(slot?.jewel_grade || "")] || 0;
      return { key, color, reach: value / sss(color) };
    })
    .filter(Boolean);
  // 비전투·빈 칸은 지금 가장 많은 전투 스탯의 SSS로 채운다(없으면 레드 공격력).
  const counts = {};
  combat.forEach((slot) => (counts[slot.key] = (counts[slot.key] || 0) + 1));
  const fillKey = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || keys.attack;
  const fillColor = combat.find((slot) => slot.key === fillKey)?.color || rules.jewel.colors.find((color) => color.id === "red");
  const max = {};
  combat.forEach((slot) => (max[slot.key] = (max[slot.key] || 0) + sss(slot.color)));
  for (let i = combat.length; i < rules.jewel.slots; i += 1) max[fillKey] = (max[fillKey] || 0) + sss(fillColor);
  const current = contributionOf(majorStats, (entry) => entry.group === "jewel");
  delete current.ignoreDefense;
  const reach = combat.reduce((sum, slot) => sum + slot.reach, 0) / rules.jewel.slots;
  return area("jewel", "쥬얼", { current: round(reach * 100, 1), max: 100, unit: "%", delta: deltaOf(max, current), completion: reach });
}

function pitchedArea(details, selection) {
  const data = details?.itemEquipment?.data || {};
  const preset = toArray(data.equipment_preset).find((item) => Number(item?.preset_no) === Number(selection?.equipment));
  const worn = toArray(preset?.item_equipment).length ? preset.item_equipment : toArray(data.item_equipment);
  const isMember = (name) => rules.pitched.members.includes(name) || rules.pitched.memberKeywords.some((keyword) => name.includes(keyword));
  let stages = 0;
  worn.forEach((item) => {
    const name = String(item?.item_name || "");
    if (!isMember(name)) return;
    const cap = name === rules.pitched.beltName ? rules.pitched.beltMax : rules.pitched.otherMax;
    stages += Math.min(cap, Number(item?.starforce_upgrade) || 0);
  });
  return area("pitched", "칠흑 연마", { current: stages, max: rules.pitched.max, unit: "단계" });
}

/**
 * @param {object} details 넥슨 응답 묶음(page-data details)
 * @param {{ majorStats: object, attackType: string, characterLevel: number, characterName: string, selection?: object }} context
 *   selection: 보스 세팅이 고른 프리셋(statSetting.selection — 하이퍼·쥬얼·장비)
 * @returns {{ areas: object[] }}
 */
function buildGrowthReport(details, { majorStats, attackType, characterLevel, characterName, selection = {} }) {
  const level = Number(characterLevel) || 0;
  const areas = [
    hexaArea(details, majorStats),
    guildArea(details, majorStats, attackType, characterName),
    levelArea(level, majorStats),
    unionArea(details, majorStats, attackType),
    symbolArea(details, majorStats, attackType, level),
    hyperArea(details, attackType, selection),
    commonCoreArea(details, majorStats),
    jewelArea(details, majorStats, attackType, selection),
    pitchedArea(details, selection)
  ].filter(Boolean);
  return { areas };
}

module.exports = { buildGrowthReport, hexaCoreKind };
