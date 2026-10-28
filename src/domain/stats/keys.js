"use strict";

// Stat keys kept from the previous API response (profile.majorStats) so the view and
// stored snapshots keep working.
const STAT_KEYS = Object.freeze([
  "physicalAttack",
  "magicalAttack",
  "physicalAttackPercent",
  "magicalAttackPercent",
  "physicalDamagePercent",
  "magicalDamagePercent",
  "bossDamage",
  "criticalDamage",
  "finalDamage",
  "maxDamage",
  "ignoreDefense"
]);

const STAT_LABELS = Object.freeze({
  physicalAttack: "물리 공격력",
  magicalAttack: "마법 공격력",
  physicalAttackPercent: "물리 공격력 %",
  magicalAttackPercent: "마법 공격력 %",
  physicalDamagePercent: "물리 대미지",
  magicalDamagePercent: "마법 대미지",
  bossDamage: "보스 공격력",
  criticalDamage: "치명타 피해",
  finalDamage: "최종 대미지",
  maxDamage: "최대 대미지",
  ignoreDefense: "방어율 무시"
});

// Short names used inside breakdown labels ("아케인셰이드 완드 · 마법 공격력").
const STAT_SHORT_LABELS = Object.freeze({
  ...STAT_LABELS,
  physicalAttackPercent: "물리 공격력",
  magicalAttackPercent: "마법 공격력"
});

const PERCENT_KEYS = new Set([
  "physicalAttackPercent",
  "magicalAttackPercent",
  "physicalDamagePercent",
  "magicalDamagePercent",
  "bossDamage",
  "criticalDamage",
  "finalDamage",
  "ignoreDefense"
]);

const CATEGORIES = Object.freeze({
  equipment: "장비",
  skill: "스킬",
  growth: "성장",
  content: "콘텐츠",
  manual: "직접 입력"
});

const CATEGORY_ORDER = Object.freeze(["equipment", "skill", "growth", "content", "manual"]);

const GROUPS = Object.freeze({
  basicOption: "기본 옵션",
  additionalOption: "추가 옵션",
  potential: "잠재 옵션",
  additionalPotential: "에디셔널 잠재",
  soul: "소울",
  soulGauge: "소울 게이지",
  soulSet: "소울 세트",
  emblem: "문장",
  setEffect: "세트 옵션",
  starforceSet: "스타포스 강화옵션",
  arcaneSetMerged: "아케인셰이드 세트 (합산)",
  symbol: "심볼",
  passive: "패시브",
  vmatrix: "V매트릭스",
  liberation: "해방 무기",
  baseAttack: "기본 공격력",
  heart: "기계 심장",
  jewel: "쥬얼",
  pet: "펫",
  hyperStat: "하이퍼 스탯",
  unionStat: "유니온 스탯",
  union: "유니온",
  guild: "길드",
  hexaStat: "헥사 스탯",
  solJanus: "솔 야누스",
  linkSkill: "링크 스킬",
  // 직접 입력(src/game-data/manual-inputs.json groups)
  starcorus: "스타코러스",
  stigma: "성흔",
  blessing: "빛의 성소 축복",
  unionChampion: "유니온 챔피언",
  honorBadge: "명예 배지",
  monsterCollection: "몬스터 컬렉션",
  petAttack: "펫 공격력"
});

const PRESET_DIMENSIONS = Object.freeze(["equipment", "android", "hyper", "jewel", "link", "unionStat"]);

const PRESET_DIMENSION_LABELS = Object.freeze({
  equipment: "장비",
  android: "기계 심장",
  hyper: "하이퍼 스탯",
  jewel: "쥬얼",
  link: "링크 스킬",
  unionStat: "유니온 스탯"
});

const PHYSICAL_ORDER = Object.freeze([
  "physicalAttack",
  "physicalAttackPercent",
  "physicalDamagePercent",
  "bossDamage",
  "criticalDamage",
  "finalDamage",
  "maxDamage",
  "ignoreDefense"
]);

const MAGICAL_ORDER = Object.freeze([
  "magicalAttack",
  "magicalAttackPercent",
  "magicalDamagePercent",
  "bossDamage",
  "criticalDamage",
  "finalDamage",
  "maxDamage",
  "ignoreDefense"
]);

module.exports = {
  STAT_KEYS,
  STAT_LABELS,
  STAT_SHORT_LABELS,
  PERCENT_KEYS,
  CATEGORIES,
  CATEGORY_ORDER,
  GROUPS,
  PRESET_DIMENSIONS,
  PRESET_DIMENSION_LABELS,
  PHYSICAL_ORDER,
  MAGICAL_ORDER
};
