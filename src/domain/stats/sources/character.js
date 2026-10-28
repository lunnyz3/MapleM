"use strict";

// Job passive, V matrix cores and the base max damage. At full core levels every job gets
// 공격력% 300, 대미지 60, 보공 10, 치피 30, 최종 10, 최대 대미지 4억; the value is split into
// job passive + V cores so characters with lower core levels get a lower value
// (src/game-data/skill-passives.json).

const passives = require("../../../game-data/skill-passives.json");
const characterBase = require("../../../game-data/character-base.json");
const { getActiveVcores } = require("../../../transform/vmatrix");
const { makeContribution } = require("../contribution");

function normalizeClass(name) {
  return String(name || "").replace(/\s+/g, "").replace(/\./g, ",");
}

function jobPassiveFor(className) {
  const normalized = normalizeClass(className);
  const override = Object.entries(passives.jobPassive.byJob).find(([job]) => normalizeClass(job) === normalized);
  return { ...passives.jobPassive.default, ...(override ? override[1] : {}) };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function commonCoreAttackPercent(level) {
  const rule = passives.vmatrix.commonAttackCores;
  if (!Number.isFinite(level) || level < 1) return 0;
  return Math.min(rule.max, round2(rule.base + rule.perLevel * level));
}

function jobLineCoreDamage(level) {
  const rule = passives.vmatrix.jobLineFormula;
  if (!Number.isFinite(level) || level < 1) return 0;
  return Math.min(rule.max, round2(rule.base + rule.perLevel * level));
}

function passiveContributions(className) {
  const passive = jobPassiveFor(className);
  const label = "직업 패시브";
  const rawText = `${className || "직업 미상"} 만렙 패시브`;
  const contributions = [];
  const push = (key, value) => {
    if (value) contributions.push(makeContribution({ key, value, category: "skill", group: "passive", label, rawText }));
  };
  push("physicalAttackPercent", passive.attackPercent);
  push("magicalAttackPercent", passive.attackPercent);
  push("physicalDamagePercent", passive.damagePercent);
  push("magicalDamagePercent", passive.damagePercent);
  push("bossDamage", passive.bossDamage);
  push("criticalDamage", passive.criticalDamage);
  push("finalDamage", passive.finalDamage);
  contributions.push(
    makeContribution({
      key: "maxDamage",
      value: characterBase.maxDamageBase,
      category: "skill",
      group: "passive",
      label: "기본 최대 대미지",
      rawText: "모든 캐릭터 기본값 4억"
    })
  );
  return contributions;
}

function vmatrixContributions(vmatrixData, className) {
  const cores = getActiveVcores(vmatrixData);
  const contributions = [];
  const commonNames = new Set(passives.vmatrix.commonAttackCores.names);
  const common = cores.filter((core) => commonNames.has(core.name));
  const commonTotal = round2(common.reduce((sum, core) => sum + commonCoreAttackPercent(core.level), 0));
  if (commonTotal > 0) {
    const rawText = common.map((core) => `${core.name} Lv.${core.level}`).join(", ");
    ["physicalAttackPercent", "magicalAttackPercent"].forEach((key) => {
      contributions.push(
        makeContribution({
          key,
          value: commonTotal,
          category: "skill",
          group: "vmatrix",
          label: `공용 코어 ${common.length}개`,
          rawText
        })
      );
    });
  }

  const normalizedClass = normalizeClass(className);
  passives.vmatrix.jobLineCores
    .filter((line) => line.classes.some((job) => normalizeClass(job) === normalizedClass))
    .forEach((line) => {
      const core = cores.find((entry) => entry.name === line.core);
      const value = core ? jobLineCoreDamage(core.level) : 0;
      if (!value) return;
      line.stats.forEach((key) => {
        contributions.push(
          makeContribution({
            key,
            value,
            category: "skill",
            group: "vmatrix",
            label: `${line.core} Lv.${core.level}`,
            rawText: `${line.group} 계열 공용 코어`
          })
        );
      });
    });
  return contributions;
}

const LEVEL_ATTACK_ANCHORS = Object.entries(characterBase.levelBaseAttack.anchors)
  .map(([lvl, value]) => [Number(lvl), Number(value)])
  .sort((left, right) => left[0] - right[0]);

// Level base attack: interpolated between measured anchors, extrapolated past the last one.
function levelBaseAttack(level) {
  const anchors = LEVEL_ATTACK_ANCHORS;
  const target = Number(level);
  if (!Number.isFinite(target) || target < anchors[0][0]) return 0;
  for (let index = 0; index < anchors.length; index += 1) {
    const [lvl, value] = anchors[index];
    if (lvl === target) return value;
    const next = anchors[index + 1];
    if (next && target > lvl && target < next[0]) {
      return Math.round(value + ((next[1] - value) * (target - lvl)) / (next[0] - lvl));
    }
  }
  const [lastLevel, lastValue] = anchors[anchors.length - 1];
  const [prevLevel, prevValue] = anchors[anchors.length - 2];
  return Math.round(lastValue + ((lastValue - prevValue) / (lastLevel - prevLevel)) * (target - lastLevel));
}

function isMagicJob(className) {
  const name = String(className || "");
  return characterBase.magicJobs.some((job) => name.includes(job));
}

module.exports = {
  passiveContributions,
  vmatrixContributions,
  levelBaseAttack,
  isMagicJob,
  normalizeClass,
  commonCoreAttackPercent,
  jobLineCoreDamage
};
