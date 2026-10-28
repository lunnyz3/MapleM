"use strict";

const combatPowerRules = require("../../game-data/combat-power.json");
const { STAT_KEYS } = require("./keys");
const { makeContribution } = require("./contribution");
const { levelBaseAttack } = require("./sources/character");

function emptyTotals() {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
}

function cleanNumber(value) {
  return Math.round(value * 1e9) / 1e9;
}

/**
 * Totals of every stat. 방어율 무시 multiplies every option line: 1 − Π(1 − v/100)
 * (maplemworlds; the arcane set and arcane starforce option count as one line). Everything
 * else is a plain sum.
 *
 * maplemtool groups before multiplying instead: the lines of one item are summed, a set and
 * its own starforce set are summed, and all non-equipment sources (jewel, HEXA stat, …) are
 * summed into one term. Both rules reproduce their site on 47/48 characters
 * (docs/research/calibration/README.md 2-2); maplemworlds' rule is the operator's reference,
 * so it is the one used here. Line-level factors are kept on each contribution, so switching
 * would only change how `factors` are grouped below.
 */
function sumContributions(contributions) {
  const totals = emptyTotals();
  let remaining = 1;
  contributions.forEach((entry) => {
    if (entry.key === "ignoreDefense") {
      (entry.factors || [entry.value]).forEach((factor) => {
        remaining *= 1 - Math.min(100, Math.max(0, factor)) / 100;
      });
      return;
    }
    totals[entry.key] += entry.value;
  });
  totals.ignoreDefense = (1 - remaining) * 100;
  STAT_KEYS.forEach((key) => {
    totals[key] = cleanNumber(totals[key]);
  });
  return totals;
}

/**
 * Level base attack goes to whichever flat attack (physical or magical) is larger, as both
 * reference sites build flat attack from sources instead of reading the API stat.
 */
function baseAttackContribution(level, totals) {
  const value = levelBaseAttack(level);
  if (!value) return null;
  const key = totals.magicalAttack > totals.physicalAttack ? "magicalAttack" : "physicalAttack";
  return makeContribution({
    key,
    value,
    category: "skill",
    group: "baseAttack",
    label: `레벨 기준 기본 공격력 (Lv.${level})`,
    rawText: "레벨별 기본 공격력 표"
  });
}

// 깡공 × (공% + 0.3×(1+보공)) × (1+대미지) × (1.2+치피) × (1+최종) × (최대 대미지/1억)^0.2
function combatPower(totals) {
  const attack = Math.max(totals.physicalAttack, totals.magicalAttack, 1);
  const attackPercent = Math.max(totals.physicalAttackPercent, totals.magicalAttackPercent) / 100;
  const damage = Math.max(totals.physicalDamagePercent, totals.magicalDamagePercent) / 100;
  const boss = totals.bossDamage / 100;
  const critical = totals.criticalDamage / 100;
  const finalDamage = totals.finalDamage / 100;
  const maxDamage = Math.max(totals.maxDamage, 1);
  const value =
    attack *
    (attackPercent + combatPowerRules.bossBase * (1 + boss)) *
    (1 + damage) *
    (combatPowerRules.criticalBase + critical) *
    (1 + finalDamage) *
    Math.pow(maxDamage / combatPowerRules.maxDamageReference, combatPowerRules.maxDamageExponent);
  return Math.round(value);
}

module.exports = { sumContributions, baseAttackContribution, combatPower, emptyTotals };
