"use strict";

// Reads Nexon option text ("최대 대미지 59,500,000, 물리 공격력 10%", "물리 공격력 및 마법 공격력
// 7.5% 증가", "치명타 피해 : 4%") into stat contributions. Rules shared by both reference
// sites (docs/research/rules/maplemworlds.md 1.2, maplemtool.md 1.4):
// - 데미지 → 대미지, 크리티컬 대미지 → 치명타 피해, 보스 몬스터 공격 시 대미지 → 보스 공격력
// - "물리 X 및 마법 X", "물리 X / 마법 X", "물리/마법 X" give the same value to both
// - an attack line whose number carries % is attack %, other stats ignore %
// - the number must follow the stat name directly, so "치명타 피해 감소 158%" is not read

const STAT_NAMES = Object.freeze([
  ["물리 공격력", "physicalAttack"],
  ["마법 공격력", "magicalAttack"],
  ["물리 대미지", "physicalDamagePercent"],
  ["마법 대미지", "magicalDamagePercent"],
  ["보스 공격력", "bossDamage"],
  ["치명타 피해", "criticalDamage"],
  ["최종 대미지", "finalDamage"],
  ["최대 대미지", "maxDamage"],
  ["방어율 무시", "ignoreDefense"]
]);

const PERCENT_ATTACK_KEY = Object.freeze({
  physicalAttack: "physicalAttackPercent",
  magicalAttack: "magicalAttackPercent"
});

const NAME_PATTERN = STAT_NAMES.map(([name]) => name.replace(" ", "\\s*")).join("|");
const STAT_VALUE_REGEX = new RegExp(`(${NAME_PATTERN})\\s*[:：]?\\s*\\+?\\s*(-?\\d[\\d,]*(?:\\.\\d+)?)\\s*(%)?`, "g");
const PAIR_REGEX = /(물리|마법)\s*(공격력|대미지)\s*(?:및|\/)\s*(물리|마법)\s*(공격력|대미지)/;
const SLASH_PAIR_REGEX = /물리\s*\/\s*마법\s*(공격력|대미지)/;

function normalizeStatText(text) {
  return String(text ?? "")
    .replace(/데미지/g, "대미지")
    .replace(/크리티컬\s*대미지/g, "치명타 피해")
    .replace(/보스\s*몬스터\s*공격\s*시\s*대미지/g, "보스 공격력")
    .replace(/\(다음 레벨[^)]*\)/g, "");
}

function keyForName(name) {
  const compact = String(name).replace(/\s+/g, "");
  const found = STAT_NAMES.find(([label]) => label.replace(/\s+/g, "") === compact);
  return found ? found[1] : null;
}

function parseNumber(text) {
  const value = Number(String(text ?? "").replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

// Splits on commas that are not thousands separators, and on line breaks.
function splitSegments(text) {
  const source = String(text ?? "");
  const segments = [];
  let current = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\n" || char === "\r") {
      if (current.trim()) segments.push(current.trim());
      current = "";
      continue;
    }
    if (char === ",") {
      const previous = source[index - 1] || "";
      const next = source[index + 1] || "";
      if (/\d/.test(previous) && /\d/.test(next)) {
        current += char;
        continue;
      }
      if (current.trim()) segments.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

// "물리 공격력 및 마법 공격력 7.5%" → ["물리 공격력 7.5%", "마법 공격력 7.5%"]
function expandPairs(segment) {
  const pair = PAIR_REGEX.exec(segment);
  if (pair) {
    const first = `${pair[1]} ${pair[2]}`;
    const second = `${pair[3]} ${pair[4]}`;
    const before = segment.slice(0, pair.index);
    const after = segment.slice(pair.index + pair[0].length);
    return [...expandPairs(`${before}${first}${after}`), ...expandPairs(`${before}${second}${after}`)];
  }
  const slash = SLASH_PAIR_REGEX.exec(segment);
  if (slash) {
    const before = segment.slice(0, slash.index);
    const after = segment.slice(slash.index + slash[0].length);
    return [`${before}물리 ${slash[1]}${after}`, `${before}마법 ${slash[1]}${after}`];
  }
  return [segment];
}

function readSegment(segment) {
  const results = [];
  const regex = STAT_VALUE_REGEX;
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(segment))) {
    const baseKey = keyForName(match[1]);
    const value = parseNumber(match[2]);
    if (!baseKey || value === null) continue;
    const key = match[3] && PERCENT_ATTACK_KEY[baseKey] ? PERCENT_ATTACK_KEY[baseKey] : baseKey;
    results.push({ key, value, text: segment.trim() });
  }
  return results;
}

/**
 * Parses free option text into [{ key, value, text }].
 * options.skipSegment(segment) drops whole sentences (used for conditional link effects).
 */
function parseStatText(text, options = {}) {
  const results = [];
  splitSegments(normalizeStatText(text)).forEach((segment) => {
    if (options.skipSegment && options.skipSegment(segment)) return;
    expandPairs(segment).forEach((part) => results.push(...readSegment(part)));
  });
  return results;
}

/**
 * Reads one item option ({ option_name, option_value }). The name decides the stat, and an
 * attack line whose value carries % becomes attack %.
 */
function parseOption(option) {
  const name = normalizeStatText(option?.option_name ?? option?.stat_name ?? "").trim();
  const valueText = String(option?.option_value ?? option?.stat_value ?? "").trim();
  if (!name || !valueText) return [];
  const value = parseNumber(valueText.replace(/[%+\s]/g, ""));
  if (value === null) return [];
  const results = [];
  expandPairs(name).forEach((part) => {
    const compact = part.replace(/\s+/g, "");
    const found = STAT_NAMES.find(([label]) => compact === label.replace(/\s+/g, ""));
    if (!found) return;
    const baseKey = found[1];
    const key = valueText.includes("%") && PERCENT_ATTACK_KEY[baseKey] ? PERCENT_ATTACK_KEY[baseKey] : baseKey;
    results.push({ key, value, text: `${part} ${valueText}` });
  });
  return results;
}

module.exports = { normalizeStatText, splitSegments, parseStatText, parseOption, parseNumber };
