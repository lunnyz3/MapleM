"use strict";

const { STAT_SHORT_LABELS } = require("./keys");

/**
 * One stat contribution. For 방어율 무시, `factors` keeps every option line so the total can
 * be multiplied line by line (maplemworlds rule) while the breakdown shows one row per item.
 */
function makeContribution({ key, value, category, group, label, rawText = "", factors }) {
  const contribution = { key, value, category, group, label, rawText };
  if (key === "ignoreDefense") {
    contribution.factors = Array.isArray(factors) && factors.length ? factors : [value];
  }
  return contribution;
}

/**
 * Sums parsed entries ({ key, value, text }) per stat key into one contribution each, so a
 * three-line potential becomes "아이템 · 마법 대미지 57.3%".
 */
function contributionsFromParsed(parsed, { category, group, label, labelWithStat = false }) {
  const byKey = new Map();
  parsed.forEach((entry) => {
    if (!Number.isFinite(entry.value) || entry.value === 0) return;
    const current = byKey.get(entry.key) || { value: 0, texts: [], factors: [] };
    current.value += entry.value;
    current.texts.push(entry.text);
    current.factors.push(entry.value);
    byKey.set(entry.key, current);
  });
  return [...byKey.entries()].map(([key, current]) =>
    makeContribution({
      key,
      value: current.value,
      category,
      group,
      label: labelWithStat ? `${label} · ${STAT_SHORT_LABELS[key]}` : label,
      rawText: current.texts.join(" | "),
      factors: current.factors
    })
  );
}

module.exports = { makeContribution, contributionsFromParsed };
