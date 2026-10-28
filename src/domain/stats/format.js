"use strict";

const {
  STAT_KEYS,
  STAT_LABELS,
  PERCENT_KEYS,
  CATEGORIES,
  CATEGORY_ORDER,
  GROUPS,
  PRESET_DIMENSIONS,
  PRESET_DIMENSION_LABELS,
  PHYSICAL_ORDER,
  MAGICAL_ORDER
} = require("./keys");

function fractionDigits(key) {
  if (key === "ignoreDefense") return 3;
  return PERCENT_KEYS.has(key) ? 2 : 0;
}

function roundFor(key, value) {
  const digits = key === "ignoreDefense" ? 6 : 4;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// toLocaleString per call is slow; one formatter per precision is reused.
const numberFormats = new Map();
function numberFormat(digits) {
  if (!numberFormats.has(digits)) {
    numberFormats.set(digits, new Intl.NumberFormat("ko-KR", { maximumFractionDigits: digits }));
  }
  return numberFormats.get(digits);
}

function formatStatValue(key, value) {
  if (!Number.isFinite(value)) return "-";
  const text = numberFormat(fractionDigits(key)).format(value);
  return PERCENT_KEYS.has(key) ? `${text}%` : text;
}

function formatStatDelta(key, value) {
  const sign = value < 0 ? "-" : "+";
  return `${sign}${formatStatValue(key, Math.abs(value))}`;
}

function groupOrderIndex(group) {
  const order = Object.keys(GROUPS);
  const index = order.indexOf(group);
  return index === -1 ? order.length : index;
}

function breakdownFor(key, contributions) {
  return contributions
    .filter((entry) => entry.key === key && entry.value)
    .map((entry) => ({
      source: entry.label,
      rawText: entry.rawText || "",
      value: roundFor(key, entry.value),
      displayValue: formatStatDelta(key, entry.value),
      category: entry.category,
      categoryLabel: CATEGORIES[entry.category] || entry.category,
      group: entry.group,
      groupLabel: GROUPS[entry.group] || entry.group
    }))
    .sort((left, right) => {
      const category = CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category);
      if (category) return category;
      const group = groupOrderIndex(left.group) - groupOrderIndex(right.group);
      if (group) return group;
      return Math.abs(right.value) - Math.abs(left.value);
    });
}

/** Engine sheet → profile.majorStats ({ [key]: { key, label, value, displayValue, breakdown } }). */
function formatMajorStats(sheet) {
  return Object.fromEntries(
    STAT_KEYS.map((key) => {
      const value = roundFor(key, sheet.totals[key]);
      return [
        key,
        {
          key,
          label: STAT_LABELS[key],
          value,
          displayValue: formatStatValue(key, value),
          breakdown: breakdownFor(key, sheet.contributions)
        }
      ];
    })
  );
}

function majorStatOrder(sheet) {
  return [...(sheet.attackType === "magical" ? MAGICAL_ORDER : PHYSICAL_ORDER)];
}

/** Which presets the boss setting uses, next to the ones in use now. */
function formatStatSetting(result) {
  const dimensions = PRESET_DIMENSIONS.filter((dimension) => result.options[dimension].available.length).map((dimension) => ({
    key: dimension,
    label: PRESET_DIMENSION_LABELS[dimension],
    boss: result.boss.selection[dimension],
    current: result.current.selection[dimension],
    available: result.options[dimension].available,
    excluded:
      dimension === "link"
        ? result.options.link.available.filter((no) => !result.options.link.searched.includes(no))
        : []
  }));
  return {
    mode: "boss",
    modeLabel: "보스 세팅",
    combinationCount: result.combinationCount,
    selection: { ...result.boss.selection },
    currentSelection: { ...result.current.selection },
    sameAsCurrent: PRESET_DIMENSIONS.every((dimension) => result.boss.selection[dimension] === result.current.selection[dimension]),
    combatPower: { boss: result.boss.combatPower, current: result.current.combatPower },
    combatPowerNote:
      "추정치: 깡공×(공격력%+0.3×(1+보스 공격력))×(1+대미지)×(1.2+치명타 피해)×(1+최종 대미지)×(최대 대미지/1억)^0.2. 넥슨 API에 없는 스타코러스·유니온 챔피언·성흔·축복·명예 배지·몬스터 컬렉션은 0으로 둬서 공식 전투력보다 낮게 나옵니다(경쟁 사이트도 같음).",
    attackType: result.boss.attackType,
    dimensions,
    rule: "장비·기계 심장·하이퍼 스탯·쥬얼·링크 스킬·유니온 스탯 프리셋 조합 가운데 계산 전투력이 가장 높은 조합"
  };
}

module.exports = { formatMajorStats, formatStatSetting, formatStatValue, formatStatDelta, majorStatOrder };
