const mongoose = require("mongoose");
const { env } = require("../config/env");
const { starforceSetOptionGroups } = require("../config/starforce-set-options");
const { normalizeWorldName } = require("../config/worlds");
const { RequestLog } = require("../models/request-log.model");
const {
  getCharacterOcid,
  getCharacterByOcid,
  getUserUnion,
  getUserUnionRaider,
  getGuildId: getGuildIdByName,
  getGuildBasic: getGuildBasicById,
  getRankingLevel,
  getRankingUnion,
  getRankingAchievement,
  getRankingSharenianBattlefield,
  getRankingSharenianWaterway,
  getRankingRootOfTime,
  saveRequestLog
} = require("../services/maplestorym.service");

const characterDetailEndpoints = [
  { key: "basic", path: "/maplestorym/v1/character/basic" },
  { key: "stat", path: "/maplestorym/v1/character/stat" },
  { key: "hyperStat", path: "/maplestorym/v1/character/hyper-stat" },
  { key: "guild", path: "/maplestorym/v1/character/guild" },
  { key: "itemEquipment", path: "/maplestorym/v1/character/item-equipment" },
  { key: "cashitemEquipment", path: "/maplestorym/v1/character/cashitem-equipment" },
  { key: "symbol", path: "/maplestorym/v1/character/symbol" },
  { key: "setEffect", path: "/maplestorym/v1/character/set-effect" },
  { key: "androidEquipment", path: "/maplestorym/v1/character/android-equipment" },
  { key: "jewel", path: "/maplestorym/v1/character/jewel" },
  { key: "beautyEquipment", path: "/maplestorym/v1/character/beauty-equipment" },
  { key: "petEquipment", path: "/maplestorym/v1/character/pet-equipment" },
  { key: "skillEquipment", path: "/maplestorym/v1/character/skill-equipment" },
  { key: "linkSkill", path: "/maplestorym/v1/character/link-skill" },
  { key: "vmatrix", path: "/maplestorym/v1/character/vmatrix" },
  { key: "hexamatrixSkill", path: "/maplestorym/v1/character/hexamatrix-skill" },
  { key: "hexamatrixStat", path: "/maplestorym/v1/character/hexamatrix-stat" }
];

const userDetailEndpoints = [
  { key: "union", path: "/maplestorym/v1/user/union" },
  { key: "unionRaider", path: "/maplestorym/v1/user/union-raider" }
];

const aggregateLogEndpoint = `${env.nexonBaseUrl}/maplestorym/v1/character/all`;
const presetFallbackLookbackLimit = 30;
const rankingDateFloor = "2025-12-01";

const majorStatKeys = Object.freeze([
  "physicalAttack",
  "physicalAttackPercent",
  "magicalAttack",
  "magicalAttackPercent",
  "physicalDamagePercent",
  "magicalDamagePercent",
  "bossDamage",
  "criticalDamage",
  "finalDamage",
  "maxDamage",
  "ignoreDefense"
]);

const percentStatKeys = new Set([
  "physicalAttackPercent",
  "magicalAttackPercent",
  "physicalDamagePercent",
  "magicalDamagePercent",
  "bossDamage",
  "criticalDamage",
  "finalDamage",
  "ignoreDefense"
]);

const majorStatLabels = Object.freeze({
  physicalAttack: "물리 공격력",
  physicalAttackPercent: "물리 공격력 %",
  magicalAttack: "마법 공격력",
  magicalAttackPercent: "마법 공격력 %",
  physicalDamagePercent: "물리 데미지 %",
  magicalDamagePercent: "마법 데미지 %",
  bossDamage: "보스 공격력",
  criticalDamage: "치명타 피해",
  finalDamage: "최종 데미지",
  maxDamage: "최대 데미지",
  ignoreDefense: "방어율 무시 %"
});

const vmatrixAdvancedBlessName = normalizeForMatch("쓸만한 어드밴스드 블레스");
const vmatrixCombatOrdersName = normalizeForMatch("쓸만한 컴뱃 오더스");
const vmatrixSharpEyesName = normalizeForMatch("쓸만한 샤프 아이즈");
const vmatrixWindBoosterName = normalizeForMatch("쓸만한 윈드 부스터");
const vmatrixAttackScaleSkillNames = new Set(
  [
    "쓸만한 컴뱃 오더스",
    "블링크",
    "쓸만한 홀리 심볼",
    "쓸만한 샤프 아이즈",
    "쓸만한 하이퍼 바디",
    "쓸만한 윈드 부스터",
    "로프 커넥트",
    "쓸만한 마녀 모자 자리",
    "쓸만한 홀리 파운틴",
    "쓸만한 어드밴스드 블레스",
    "판테온"
  ].map((name) => normalizeForMatch(name))
);
const treeOfStarlightName = normalizeForMatch("트리 오브 스타라이트");
const guildPhysicalMagicalDamageIncreaseSkillName = normalizeForMatch("물리 및 마법 대미지 증가");
const unionGuildContributionKeys = new Set([
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

const guildPhysicalMagicalDamageExcludedKeys = new Set(["physicalDamagePercent", "magicalDamagePercent"]);
const guildPhysicalMagicalDamageFilteredKeys = new Set(
  [...unionGuildContributionKeys].filter((key) => !guildPhysicalMagicalDamageExcludedKeys.has(key))
);

const androidMajorStatContributionKeys = new Set([
  "physicalAttackPercent",
  "physicalDamagePercent",
  "magicalDamagePercent",
  "bossDamage",
  "criticalDamage",
  "finalDamage",
  "maxDamage",
  "ignoreDefense"
]);

const physicalMajorStatOrder = Object.freeze([
  "physicalAttack",
  "physicalAttackPercent",
  "physicalDamagePercent",
  "bossDamage",
  "criticalDamage",
  "finalDamage",
  "maxDamage",
  "ignoreDefense"
]);

const magicalMajorStatOrder = Object.freeze([
  "magicalAttack",
  "magicalAttackPercent",
  "magicalDamagePercent",
  "bossDamage",
  "criticalDamage",
  "finalDamage",
  "maxDamage",
  "ignoreDefense"
]);

const physicalJobNames = new Set(
  [
    "히어로",
    "팔라딘",
    "다크나이트",
    "보우마스터",
    "신궁",
    "패스파인더",
    "나이트로드",
    "섀도어",
    "듀얼블레이드",
    "바이퍼",
    "캡틴",
    "캐논슈터",
    "소울마스터",
    "윈드브레이커",
    "나이트워커",
    "스트라이커",
    "미하일",
    "아란",
    "메르세데스",
    "팬텀",
    "은월",
    "블래스터",
    "와일드헌터",
    "메카닉",
    "제논",
    "데몬슬레이어",
    "데몬어벤져",
    "카이저",
    "카데나",
    "카인",
    "아크",
    "아델",
    "호영",
    "아이엘",
    "에릴",
    "칼리"
  ].map((name) => normalizeForMatch(name))
);

const magicalJobNames = new Set(
  [
    "아크메이지(불,독)",
    "아크메이지(썬,콜)",
    "비숍",
    "플레임위자드",
    "에반",
    "루미너스",
    "배틀메이지",
    "엔젤릭버스터",
    "키네시스",
    "라라",
    "시아",
    "일리움"
  ].map((name) => normalizeForMatch(name))
);

function normalizeForMatch(text) {
  return String(text || "")
    .replace(/[:：(),]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function parseFirstNumberFromText(text) {
  const matched = String(text || "").match(/[-+]?\d[\d,]*(?:\.\d+)?/);
  if (!matched) {
    return null;
  }

  const parsed = Number(matched[0].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function splitStatSegments(text) {
  const source = String(text || "");
  if (!source) {
    return [];
  }

  const segments = [];
  let current = "";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (char === ",") {
      const prev = source[index - 1] || "";
      let nextIndex = index + 1;
      while (source[nextIndex] === " ") {
        nextIndex += 1;
      }
      const next = source[nextIndex] || "";
      const isThousandsSeparator = /\d/.test(prev) && /\d/.test(next);

      if (!isThousandsSeparator) {
        if (current.trim()) {
          segments.push(current.trim());
        }
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

function inferMajorStatKey(text) {
  const normalized = normalizeForMatch(text);
  const hasPercent = String(text || "").includes("%");

  if (normalized.includes("물리공격력")) {
    return hasPercent ? "physicalAttackPercent" : "physicalAttack";
  }

  if (normalized.includes("마법공격력")) {
    return hasPercent ? "magicalAttackPercent" : "magicalAttack";
  }

  if (normalized.includes("물리피해감소")) {
    return null;
  }

  if (normalized.includes("마법피해감소")) {
    return null;
  }

  if (normalized.includes("물리대미지") || normalized.includes("물리데미지")) {
    return "physicalDamagePercent";
  }

  if (normalized.includes("마법대미지") || normalized.includes("마법데미지")) {
    return "magicalDamagePercent";
  }

  if (normalized.includes("보스공격력")) {
    return "bossDamage";
  }

  if (normalized.includes("방어율무시시") || normalized.includes("방어율무시") || normalized.includes("방어율 무시")) {
    return "ignoreDefense";
  }

  if (normalized.includes("치명타피해감소")) {
    return null;
  }

  if (normalized.includes("치명타피해")) {
    return "criticalDamage";
  }

  if (normalized.includes("최종대미지") || normalized.includes("최종데미지")) {
    return "finalDamage";
  }

  if (normalized.includes("최대대미지") || normalized.includes("최대데미지")) {
    return "maxDamage";
  }

  return null;
}

function shouldSkipMajorStatContribution({ key, source, rawText, value }) {
  const normalizedSource = normalizeForMatch(source);
  const normalizedText = normalizeForMatch(rawText);

  if (key === "finalDamage" && normalizedSource.includes(treeOfStarlightName) && value >= 10) {
    return true;
  }

  if (key === "finalDamage" && normalizedSource.includes(treeOfStarlightName) && normalizedText.includes("버프중최종대미지")) {
    return true;
  }

  return false;
}

function formatMajorStatValue(key, value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  if (percentStatKeys.has(key)) {
    return `${value.toLocaleString("ko-KR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}%`;
  }

  if (Math.abs(value - Math.round(value)) < 1e-9) {
    return Math.round(value).toLocaleString("ko-KR");
  }

  return value.toLocaleString("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatMajorStatDelta(key, value) {
  const sign = value >= 0 ? "+" : "";
  const absValue = Math.abs(value);
  const formatted = percentStatKeys.has(key)
    ? `${absValue.toLocaleString("ko-KR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}%`
    : Math.abs(absValue - Math.round(absValue)) < 1e-9
      ? Math.round(absValue).toLocaleString("ko-KR")
      : absValue.toLocaleString("ko-KR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });

  return `${sign}${formatted}`;
}

function createMajorStatTrackers() {
  const trackers = {};

  majorStatKeys.forEach((key) => {
    trackers[key] = {
      key,
      label: majorStatLabels[key],
      value: key === "maxDamage" ? 100000000 : 0,
      breakdown: []
    };
  });

  trackers.maxDamage.breakdown.push({
    source: "기본값",
    value: 100000000,
    rawText: "최대 대미지 기본값"
  });

  return trackers;
}

function addMajorStatContribution(trackers, key, source, rawText, value) {
  if (!trackers[key] || !Number.isFinite(value)) {
    return;
  }

  if (key === "physicalAttack" || key === "magicalAttack") {
    return;
  }

  if (shouldSkipMajorStatContribution({ key, source, rawText, value })) {
    return;
  }

  trackers[key].value += value;
  trackers[key].breakdown.push({
    source,
    value,
    rawText
  });
}

function addContributionsFromText(trackers, source, text, options = {}) {
  const allowedKeys = options.allowedKeys || null;
  const segments = splitStatSegments(text);
  segments.forEach((segment) => {
    const key = inferMajorStatKey(segment);
    if (!key || key === "physicalAttack") {
      return;
    }

    if (allowedKeys && !allowedKeys.has(key)) {
      return;
    }

    const value = parseFirstNumberFromText(segment);
    if (value === null) {
      return;
    }

    addMajorStatContribution(trackers, key, source, segment, value);
  });
}

function addContributionsFromOptionList(trackers, source, optionList, options = {}) {
  if (!Array.isArray(optionList)) {
    return;
  }

  optionList.forEach((option) => {
    const name = option?.option_name || option?.stat_type || "";
    const value = option?.option_value || option?.stat_increase || "";
    addContributionsFromText(trackers, source, `${name} ${value}`.trim(), options);
  });
}

function applyPhysicalAttackFromStat(trackers, details) {
  const statList = details?.stat?.data?.stat;
  if (!Array.isArray(statList)) {
    return;
  }

  const physicalAttack = statList.find((item) => normalizeForMatch(item?.stat_name) === normalizeForMatch("물리 공격력"));
  const value = parseNumericValue(physicalAttack?.stat_value);
  if (value === null) {
    return;
  }

  trackers.physicalAttack.value = value;
  trackers.physicalAttack.breakdown = [
    {
      source: "캐릭터 스탯",
      value,
      rawText: `${physicalAttack.stat_name} ${physicalAttack.stat_value}`
    }
  ];
}

function applyMagicalAttackFromStat(trackers, details) {
  const statList = details?.stat?.data?.stat;
  if (!Array.isArray(statList)) {
    return;
  }

  const magicalAttack = statList.find((item) => normalizeForMatch(item?.stat_name) === normalizeForMatch("마법 공격력"));
  const value = parseNumericValue(magicalAttack?.stat_value);
  if (value === null) {
    return;
  }

  trackers.magicalAttack.value = value;
  trackers.magicalAttack.breakdown = [
    {
      source: "캐릭터 스탯",
      value,
      rawText: `${magicalAttack.stat_name} ${magicalAttack.stat_value}`
    }
  ];
}

function collectSetEffectContributions(trackers, details) {
  const setInfo = details?.setEffect?.data?.set_info;
  if (!Array.isArray(setInfo)) {
    return;
  }

  setInfo.forEach((item) => {
    const source = `세트 효과 (${item?.set_name || "-"})`;
    addContributionsFromText(trackers, source, item?.set_option);
  });
}

function doesItemMatchStarforceRule(item, rule) {
  const itemName = normalizeForMatch(item?.item_name);
  if (!itemName) {
    return false;
  }

  const keywords = Array.isArray(rule?.keywords) ? rule.keywords : [];
  const matchesKeyword = keywords.some((keyword) => itemName.includes(normalizeForMatch(keyword)));
  if (!matchesKeyword) {
    return false;
  }

  const itemGrades = Array.isArray(rule?.itemGrades) ? rule.itemGrades : [];
  if (!itemGrades.length) {
    return true;
  }

  const itemGrade = normalizeForMatch(item?.item_grade);
  if (!itemGrade) {
    return false;
  }

  return itemGrades.some((grade) => itemGrade === normalizeForMatch(grade));
}

function resolveStarforceTier(tiers, totalStarforce) {
  if (!Array.isArray(tiers) || !Number.isFinite(totalStarforce)) {
    return null;
  }

  return (
    tiers.find((tier) => {
      const min = Number(tier?.min);
      const max = tier?.max === null || tier?.max === undefined ? null : Number(tier.max);

      if (!Number.isFinite(min)) {
        return false;
      }

      if (max === null) {
        return totalStarforce >= min;
      }

      if (!Number.isFinite(max)) {
        return false;
      }

      return totalStarforce >= min && totalStarforce <= max;
    }) || null
  );
}

function formatStarforceTierRange(tier) {
  const min = Number(tier?.min);
  const max = tier?.max === null || tier?.max === undefined ? null : Number(tier.max);

  if (!Number.isFinite(min)) {
    return "-";
  }

  if (max === null) {
    return `${min} 이상`;
  }

  if (min === max) {
    return String(min);
  }

  return `${min}~${max}`;
}

function getEffectiveStarforceUpgrade(item) {
  const baseStarforce = parseNumericValue(item?.starforce_upgrade);
  if (!Number.isFinite(baseStarforce)) {
    return 0;
  }

  const normalizedSlotName = normalizeForMatch(item?.item_equipment_slot_name);
  const isOnePieceOverall = normalizedSlotName.includes(normalizeForMatch("한벌옷"));
  const effectiveValue = isOnePieceOverall ? baseStarforce * 2 : baseStarforce;

  return Math.max(0, effectiveValue);
}

function collectStarforceSetContributions(trackers, details) {
  const itemList = details?.itemEquipment?.data?.item_equipment;
  if (!Array.isArray(itemList) || !itemList.length) {
    return;
  }

  starforceSetOptionGroups.forEach((rule) => {
    const matchedItems = itemList.filter((item) => doesItemMatchStarforceRule(item, rule));
    if (!matchedItems.length) {
      return;
    }

    const totalStarforce = matchedItems.reduce((sum, item) => {
      return sum + getEffectiveStarforceUpgrade(item);
    }, 0);

    const tier = resolveStarforceTier(rule?.tiers, totalStarforce);
    if (!tier || !tier.stats) {
      return;
    }

    const rangeText = formatStarforceTierRange(tier);
    const source = `스타포스 세트옵션 (${rule?.label || "-"})`;
    const rawText = `스타포스 합계 ${totalStarforce} (조건 ${rangeText})`;

    Object.entries(tier.stats).forEach(([key, value]) => {
      if (!majorStatKeys.includes(key)) {
        return;
      }

      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return;
      }

      addMajorStatContribution(trackers, key, source, rawText, numericValue);
    });
  });
}

function collectHexaStatContributions(trackers, details) {
  const hexaStat = details?.hexamatrixStat?.data?.hexamatrix_stat;
  if (!Array.isArray(hexaStat)) {
    return;
  }

  hexaStat.forEach((core) => {
    const statInfo = Array.isArray(core?.stat_info) ? core.stat_info : [];
    statInfo.forEach((info) => {
      if (String(info?.activate_flag || "0") !== "1") {
        return;
      }

      addContributionsFromText(trackers, "헥사 스탯", info?.main_stat);
      addContributionsFromText(trackers, "헥사 스탯", info?.sub_1_stat);
      addContributionsFromText(trackers, "헥사 스탯", info?.sub_2_stat);
    });
  });
}

function collectHyperStatContributions(trackers, details) {
  const hyperData = details?.hyperStat?.data;
  if (!hyperData) {
    return;
  }

  const usePresetNo = Number(hyperData.use_preset_no);
  const presetList = Array.isArray(hyperData.hyper_stat) ? hyperData.hyper_stat : [];
  const selected = presetList.find((preset) => Number(preset?.preset_no) === usePresetNo) || presetList[0];
  const infos = Array.isArray(selected?.hyper_stat_info) ? selected.hyper_stat_info : [];

  infos.forEach((info) => {
    const source = `하이퍼 스탯 (${info?.stat_type || "-"})`;
    addContributionsFromText(trackers, source, info?.stat_increase);
  });
}

function collectLinkSkillContributions(trackers, details) {
  const linkData = details?.linkSkill?.data;
  if (!linkData) {
    return;
  }

  const usePresetNo = Number(linkData.use_prest_no || linkData.use_preset_no);
  const presetList = Array.isArray(linkData.link_skill) ? linkData.link_skill : [];
  const selectedPreset = presetList.find((preset) => Number(preset?.preset_no) === usePresetNo) || presetList[0];
  const skills = Array.isArray(selectedPreset?.link_skill_info) ? selectedPreset.link_skill_info : [];

  skills.forEach((skill) => {
    const source = `링크 스킬 (${skill?.skill_name || "-"})`;
    addContributionsFromText(trackers, source, skill?.skill_effect);
  });
}

function collectSymbolContributions(trackers, details) {
  const symbolData = details?.symbol?.data;
  if (!symbolData) {
    return;
  }

  const allSymbols = [
    ...(Array.isArray(symbolData.arcane_symbol) ? symbolData.arcane_symbol : []),
    ...(Array.isArray(symbolData.authentic_symbol) ? symbolData.authentic_symbol : [])
  ];

  allSymbols.forEach((symbol) => {
    const source = `심볼 (${symbol?.symbol_name || "-"})`;
    addContributionsFromText(trackers, source, symbol?.symbol_option);
  });
}

function collectItemContributions(trackers, details) {
  const itemData = details?.itemEquipment?.data;
  if (!itemData) {
    return;
  }

  addContributionsFromText(trackers, "소울 세트 효과", itemData.soul_set_option);

  const itemList = Array.isArray(itemData.item_equipment) ? itemData.item_equipment : [];
  itemList.forEach((item) => {
    const itemName = item?.item_name || "-";
    addContributionsFromOptionList(trackers, `아이템 기본 옵션 (${itemName})`, item?.item_basic_option);
    addContributionsFromOptionList(trackers, `아이템 추가 옵션 (${itemName})`, item?.item_additional_option);
    addContributionsFromOptionList(trackers, `아이템 잠재능력 (${itemName})`, item?.item_potential_option);
    addContributionsFromOptionList(trackers, `아이템 에디셔널 잠재능력 (${itemName})`, item?.item_additional_potential_option);
    addContributionsFromText(trackers, `소울 (${itemName})`, item?.soul_info?.soul_option);
  });
}

function resolveActiveAndroidPreset(androidData) {
  const presets = Array.isArray(androidData?.android_heart_equipment_preset) ? androidData.android_heart_equipment_preset : [];
  if (!presets.length) {
    return null;
  }

  const usePresetNo = Number(androidData?.use_preset_no);
  return presets.find((preset) => Number(preset?.preset_no) === usePresetNo) || presets[0] || null;
}

function resolveActiveAndroidHeartEquipment(androidData) {
  if (androidData?.heart_equipment && typeof androidData.heart_equipment === "object") {
    return androidData.heart_equipment;
  }

  const activePreset = resolveActiveAndroidPreset(androidData);
  if (activePreset?.heart_equipment && typeof activePreset.heart_equipment === "object") {
    return activePreset.heart_equipment;
  }

  return null;
}

function collectAndroidEquipmentContributions(trackers, details) {
  const androidData = details?.androidEquipment?.data;
  if (!androidData) {
    return;
  }

  const heartEquipment = resolveActiveAndroidHeartEquipment(androidData);
  if (!heartEquipment) {
    return;
  }

  const heartName = heartEquipment?.heart_name || "-";

  addContributionsFromOptionList(trackers, `안드로이드 하트 추가 옵션 (${heartName})`, heartEquipment?.item_additional_option, {
    allowedKeys: androidMajorStatContributionKeys
  });
  addContributionsFromOptionList(trackers, `안드로이드 하트 잠재능력 (${heartName})`, heartEquipment?.item_potential_option, {
    allowedKeys: androidMajorStatContributionKeys
  });
  addContributionsFromOptionList(
    trackers,
    `안드로이드 하트 에디셔널 잠재능력 (${heartName})`,
    heartEquipment?.item_additional_potential_option,
    {
      allowedKeys: androidMajorStatContributionKeys
    }
  );
}

function collectPetEquipmentContributions(trackers, details) {
  const petData = details?.petEquipment?.data;
  if (!petData) {
    return;
  }

  const petSetOptions = Array.isArray(petData.pet_set_option) ? petData.pet_set_option : [];
  petSetOptions.forEach((setOption) => {
    addContributionsFromText(trackers, `펫 세트 효과 (${setOption?.set_name || "-"})`, setOption?.set_option);
  });

  addContributionsFromText(trackers, "펫 자동 스킬 효과", petData.pet_auto_skill_option);
}

function collectUnionContributions(trackers, details) {
  const unionData = details?.union?.data;
  const unionRaiderData = details?.unionRaider?.data;

  addContributionsFromText(trackers, "유니온 레벨 효과", unionData?.union_level_total_option, {
    allowedKeys: unionGuildContributionKeys
  });
  addContributionsFromOptionList(trackers, "유니온 점령 효과", unionRaiderData?.use_union_occupied_option, {
    allowedKeys: unionGuildContributionKeys
  });
  addContributionsFromOptionList(trackers, "유니온 공격대 효과", unionRaiderData?.use_union_raider_option, {
    allowedKeys: unionGuildContributionKeys
  });
}

function collectGuildContributions(trackers, details) {
  const guildBasicData = details?.guildBasic?.data;
  if (!guildBasicData) {
    return;
  }

  const characterName = String(details?.basic?.data?.character_name || "").trim();
  const memberSelf = findGuildMemberForCharacter(guildBasicData, characterName);
  const guildSkills = Array.isArray(guildBasicData.guild_skill) ? guildBasicData.guild_skill : [];
  const guildAbilities = Array.isArray(guildBasicData.guild_ability) ? guildBasicData.guild_ability : [];
  const personalSkills = Array.isArray(memberSelf?.guild_personal_skill) ? memberSelf.guild_personal_skill : [];

  guildSkills.forEach((skill) => {
    const normalizedSkillName = normalizeForMatch(skill?.skill_name);
    const allowedKeys =
      normalizedSkillName === guildPhysicalMagicalDamageIncreaseSkillName
        ? guildPhysicalMagicalDamageFilteredKeys
        : unionGuildContributionKeys;

    addContributionsFromText(trackers, `길드 스킬 (${skill?.skill_name || "-"})`, skill?.skill_option, {
      allowedKeys
    });
  });

  guildAbilities.forEach((ability) => {
    addContributionsFromText(trackers, `길드 어빌리티 (${ability?.ability_name || "-"})`, ability?.ability_option, {
      allowedKeys: unionGuildContributionKeys
    });
  });

  personalSkills.forEach((skill) => {
    addContributionsFromText(trackers, `길드 개인 스킬 (${skill?.skill_name || "-"})`, skill?.skill_option, {
      allowedKeys: unionGuildContributionKeys
    });
  });
}

function getVmatrixAttackPercentBonusByLevel(level) {
  if (!Number.isFinite(level) || level < 1) {
    return 0;
  }

  const rawBonus = 7.6 + (level - 1) * 0.6;
  return Math.max(0, Math.min(25, rawBonus));
}

function collectVmatrixContributions(trackers, details) {
  const cores = details?.vmatrix?.data?.character_v_core_equipment;
  if (!Array.isArray(cores)) {
    return;
  }

  const appliedBaseSkillEffects = new Set();

  cores.forEach((core) => {
    const name = String(core?.vcore_name || "");
    const normalizedName = normalizeForMatch(name);
    const vcoreLevelRaw = Number(core?.vcore_level);
    const slotLevelRaw = Number(core?.slot_level);
    const vcoreLevel = Number.isFinite(vcoreLevelRaw) ? Math.max(0, vcoreLevelRaw) : 0;
    const slotLevel = Number.isFinite(slotLevelRaw) ? Math.max(0, slotLevelRaw) : 0;
    const effectiveLevel = vcoreLevel + slotLevel;

    if (vmatrixAttackScaleSkillNames.has(normalizedName)) {
      const bonus = getVmatrixAttackPercentBonusByLevel(effectiveLevel);
      if (bonus > 0) {
        const levelText = `V코어 레벨 ${vcoreLevel} + 슬롯 레벨 ${slotLevel} = ${effectiveLevel}`;
        addMajorStatContribution(
          trackers,
          "physicalAttackPercent",
          `V매트릭스 (${name})`,
          levelText,
          bonus
        );
        addMajorStatContribution(
          trackers,
          "magicalAttackPercent",
          `V매트릭스 (${name})`,
          levelText,
          bonus
        );
      }
    }

    if (appliedBaseSkillEffects.has(normalizedName)) {
      return;
    }

    if (normalizedName === vmatrixCombatOrdersName) {
      addMajorStatContribution(trackers, "physicalDamagePercent", `V매트릭스 (${name})`, "기본 효과", 9);
      addMajorStatContribution(trackers, "magicalDamagePercent", `V매트릭스 (${name})`, "기본 효과", 9);
      appliedBaseSkillEffects.add(normalizedName);
      return;
    }

    if (normalizedName === vmatrixSharpEyesName) {
      addMajorStatContribution(trackers, "criticalDamage", `V매트릭스 (${name})`, "기본 효과", 12);
      appliedBaseSkillEffects.add(normalizedName);
      return;
    }

    if (normalizedName === vmatrixWindBoosterName) {
      addMajorStatContribution(trackers, "bossDamage", `V매트릭스 (${name})`, "기본 효과", 12);
      appliedBaseSkillEffects.add(normalizedName);
      return;
    }

    if (normalizedName === vmatrixAdvancedBlessName) {
      addMajorStatContribution(trackers, "physicalAttackPercent", `V매트릭스 (${name})`, "기본 효과", 12);
      addMajorStatContribution(trackers, "magicalAttackPercent", `V매트릭스 (${name})`, "기본 효과", 12);
      appliedBaseSkillEffects.add(normalizedName);
    }
  });
}

function extractGroupNameFromSource(source, prefix) {
  const text = String(source || "");
  const marker = `${prefix} (`;
  if (!text.startsWith(marker) || !text.endsWith(")")) {
    return null;
  }

  return text.slice(marker.length, -1).trim() || null;
}

function normalizeSetGroupKey(name) {
  return normalizeForMatch(name).replace(/세트$/, "");
}

function mergeRawTextText(left, right) {
  const merged = new Set();

  [left, right].forEach((text) => {
    String(text || "")
      .split(" | ")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => merged.add(part));
  });

  return [...merged].join(" | ");
}

function mergeIgnoreDefenseSetAndStarforceBreakdown(entries) {
  if (!Array.isArray(entries) || entries.length < 2) {
    return entries;
  }

  const setEntries = [];
  const starforceEntries = [];

  entries.forEach((entry, index) => {
    const setGroupName = extractGroupNameFromSource(entry?.source, "세트 효과");
    if (setGroupName) {
      setEntries.push({
        index,
        entry,
        groupName: setGroupName,
        normalizedKey: normalizeSetGroupKey(setGroupName)
      });
    }

    const starforceGroupName = extractGroupNameFromSource(entry?.source, "스타포스 세트옵션");
    if (starforceGroupName) {
      starforceEntries.push({
        index,
        entry,
        groupName: starforceGroupName,
        normalizedKey: normalizeSetGroupKey(starforceGroupName)
      });
    }
  });

  if (!setEntries.length || !starforceEntries.length) {
    return entries;
  }

  const consumedIndexes = new Set();
  const mergedEntries = [];

  starforceEntries.forEach((starforceEntry) => {
    const matchedSetEntry = setEntries.find((setEntry) => {
      if (consumedIndexes.has(setEntry.index)) {
        return false;
      }

      return (
        setEntry.normalizedKey === starforceEntry.normalizedKey ||
        setEntry.normalizedKey.includes(starforceEntry.normalizedKey) ||
        starforceEntry.normalizedKey.includes(setEntry.normalizedKey)
      );
    });

    if (!matchedSetEntry) {
      return;
    }

    consumedIndexes.add(matchedSetEntry.index);
    consumedIndexes.add(starforceEntry.index);

    mergedEntries.push({
      source: `세트효과+스타포스 (${matchedSetEntry.groupName})`,
      value: matchedSetEntry.entry.value + starforceEntry.entry.value,
      rawText: mergeRawTextText(matchedSetEntry.entry.rawText, starforceEntry.entry.rawText)
    });
  });

  if (!mergedEntries.length) {
    return entries;
  }

  const remainingEntries = entries.filter((_, index) => !consumedIndexes.has(index));
  return [...remainingEntries, ...mergedEntries];
}

function buildMajorStats(details) {
  const trackers = createMajorStatTrackers();

  applyPhysicalAttackFromStat(trackers, details);
  applyMagicalAttackFromStat(trackers, details);
  collectSetEffectContributions(trackers, details);
  collectStarforceSetContributions(trackers, details);
  collectHexaStatContributions(trackers, details);
  collectHyperStatContributions(trackers, details);
  collectLinkSkillContributions(trackers, details);
  collectSymbolContributions(trackers, details);
  collectItemContributions(trackers, details);
  collectAndroidEquipmentContributions(trackers, details);
  collectPetEquipmentContributions(trackers, details);
  collectUnionContributions(trackers, details);
  collectGuildContributions(trackers, details);
  collectVmatrixContributions(trackers, details);

  return majorStatKeys.reduce((acc, key) => {
    const tracker = trackers[key];
    const mergedBreakdownMap = new Map();

    tracker.breakdown.forEach((entry) => {
      const source = entry.source || "-";
      const current = mergedBreakdownMap.get(source) || {
        source,
        value: 0,
        rawTexts: new Set()
      };

      current.value += entry.value;
      if (entry.rawText) {
        current.rawTexts.add(entry.rawText);
      }

      mergedBreakdownMap.set(source, current);
    });

    let breakdownEntries = [...mergedBreakdownMap.values()]
      .map((entry) => ({
        source: entry.source,
        rawText: [...entry.rawTexts].join(" | "),
        value: entry.value
      }));

    if (key === "ignoreDefense") {
      breakdownEntries = mergeIgnoreDefenseSetAndStarforceBreakdown(breakdownEntries);
    }

    const breakdown = breakdownEntries
      .map((entry) => ({
        ...entry,
        displayValue: formatMajorStatDelta(key, entry.value)
      }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    acc[key] = {
      key,
      label: tracker.label,
      value: tracker.value,
      displayValue: formatMajorStatValue(key, tracker.value),
      breakdown
    };

    return acc;
  }, {});
}

function buildApiKeyError() {
  return {
    ok: false,
    message: "NEXON_OPEN_API_KEY is missing in .env"
  };
}

function buildQueryError() {
  return {
    ok: false,
    message: "character_name and world_name are required"
  };
}

function parseCharacterQuery(req, res) {
  const characterName = String(req.query.character_name || "").trim();
  const worldNameInput = String(req.query.world_name || "").trim();

  if (!characterName || !worldNameInput) {
    res.status(400).json(buildQueryError());
    return null;
  }

  const worldValidation = normalizeWorldName(worldNameInput);
  if (!worldValidation.ok) {
    res.status(400).json({
      ok: false,
      message: "world_name must be one of the supported worlds.",
      worldNameInput: worldValidation.worldNameInput,
      allowedWorldNames: worldValidation.allowedWorldNames
    });
    return null;
  }

  return {
    characterName,
    worldNameInput,
    worldNameCanonical: worldValidation.worldNameCanonical,
    nexonWorldName: worldValidation.nexonWorldName
  };
}

function parseGuildQuery(req, res) {
  const guildName = String(req.query.guild_name || "").trim();
  const worldNameInput = String(req.query.world_name || "").trim();

  if (!guildName || !worldNameInput) {
    res.status(400).json({
      ok: false,
      message: "guild_name and world_name are required"
    });
    return null;
  }

  const worldValidation = normalizeWorldName(worldNameInput);
  if (!worldValidation.ok) {
    res.status(400).json({
      ok: false,
      message: "world_name must be one of the supported worlds.",
      worldNameInput: worldValidation.worldNameInput,
      allowedWorldNames: worldValidation.allowedWorldNames
    });
    return null;
  }

  return {
    guildName,
    worldNameInput,
    worldNameCanonical: worldValidation.worldNameCanonical
  };
}

function normalizeRankingDateInput(value) {
  return String(value || "").trim().replace(/[./\s]+/g, "-");
}

function isValidDateText(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return false;
  }

  const [year, month, day] = dateText.split("-").map((part) => Number(part));
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function parseRankingQuery(req, res) {
  const dateInput = normalizeRankingDateInput(req.query.date);
  const worldNameInputRaw = String(req.query.world_name || "").trim();
  const worldNameInput = worldNameInputRaw === "전체" ? "" : worldNameInputRaw;
  const ocid = String(req.query.ocid || "").trim();
  const pageRaw = String(req.query.page || "").trim();

  if (!dateInput) {
    res.status(400).json({
      ok: false,
      message: "date is required"
    });
    return null;
  }

  if (!isValidDateText(dateInput)) {
    res.status(400).json({
      ok: false,
      message: "date must be YYYY-MM-DD"
    });
    return null;
  }

  if (dateInput < rankingDateFloor) {
    res.status(400).json({
      ok: false,
      message: `date must be ${rankingDateFloor} or later`
    });
    return null;
  }

  if (worldNameInput && ocid) {
    res.status(400).json({
      ok: false,
      message: "world_name and ocid cannot be used together"
    });
    return null;
  }

  let worldNameCanonical = "";
  if (worldNameInput) {
    const worldValidation = normalizeWorldName(worldNameInput);
    if (!worldValidation.ok) {
      res.status(400).json({
        ok: false,
        message: "world_name must be one of the supported worlds.",
        worldNameInput: worldValidation.worldNameInput,
        allowedWorldNames: worldValidation.allowedWorldNames
      });
      return null;
    }

    worldNameCanonical = worldValidation.worldNameCanonical;
  }

  let page = 1;
  if (pageRaw) {
    const parsedPage = Number(pageRaw);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      res.status(400).json({
        ok: false,
        message: "page must be a positive integer"
      });
      return null;
    }
    page = parsedPage;
  }

  const params = {
    date: dateInput
  };

  // Nexon ranking API can reject "page" when querying by ocid.
  if (!ocid) {
    params.page = page;
  }

  if (ocid) {
    params.ocid = ocid;
  }

  return {
    params,
    worldNameCanonical,
    ocid,
    query: {
      date: dateInput,
      page,
      worldNameInput: worldNameInputRaw || null,
      worldNameCanonical: worldNameCanonical || null,
      ocid: ocid || null
    }
  };
}

function getErrorInfo(error, endpointPath) {
  const statusCode = error.response?.status || 500;
  const errorBody = error.response?.data || { message: error.message };
  const endpoint = endpointPath ? `${env.nexonBaseUrl}${endpointPath}` : `${env.nexonBaseUrl}/maplestorym/v1/id`;

  return {
    statusCode,
    errorBody,
    endpoint
  };
}

function buildQueryPayload(characterName, worldNameInput, worldNameCanonical) {
  return {
    characterName,
    worldNameInput,
    worldNameCanonical
  };
}

async function resolveOcid(characterName, worldNameCanonical, nexonWorldName, options = {}) {
  const shouldLog = options.shouldLog ?? true;
  const worldCandidates = [...new Set([nexonWorldName, worldNameCanonical])];
  let lastError = null;

  for (let index = 0; index < worldCandidates.length; index += 1) {
    const worldCandidate = worldCandidates[index];

    try {
      const result = await getCharacterOcid(characterName, worldCandidate);

      if (shouldLog) {
        await saveRequestLog({
          characterName,
          worldName: worldNameCanonical,
          endpoint: result.endpoint,
          statusCode: result.statusCode,
          success: true,
          responseBody: result.data
        });
      }

      return result;
    } catch (error) {
      lastError = error;

      const { statusCode, errorBody, endpoint } = getErrorInfo(error);
      if (shouldLog) {
        await saveRequestLog({
          characterName,
          worldName: worldNameCanonical,
          endpoint,
          statusCode,
          success: false,
          responseBody: errorBody
        });
      }

      const isFinalAttempt = index === worldCandidates.length - 1;
      const errorName = error.response?.data?.error?.name || "";
      const canRetryWithNextWorld = statusCode === 400 && errorName === "OPENAPI00004" && !isFinalAttempt;

      if (!canRetryWithNextWorld) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function fetchCharacterDetails({ characterName, worldNameCanonical, ocid, shouldLog = true }) {
  const settledDetails = [];
  const ocidDetailEndpoints = [...characterDetailEndpoints, ...userDetailEndpoints];

  const initialResults = await Promise.all(
    ocidDetailEndpoints.map(async ({ key, path }) => {
      try {
        const result = await getCharacterByOcid(path, ocid);

        if (shouldLog) {
          await saveRequestLog({
            characterName,
            worldName: worldNameCanonical,
            ocid,
            endpoint: result.endpoint,
            statusCode: result.statusCode,
            success: true,
            responseBody: result.data
          });
        }

        return {
          key,
          ok: true,
          statusCode: result.statusCode,
          endpoint: result.endpoint,
          data: result.data
        };
      } catch (error) {
        const { statusCode, errorBody, endpoint } = getErrorInfo(error, path);

        if (shouldLog) {
          await saveRequestLog({
            characterName,
            worldName: worldNameCanonical,
            ocid,
            endpoint,
            statusCode,
            success: false,
            responseBody: errorBody
          });
        }

        return {
          key,
          ok: false,
          statusCode,
          endpoint,
          error: errorBody
        };
      }
    })
  );

  settledDetails.push(...initialResults);

  const draftDetails = settledDetails.reduce((acc, item) => {
    acc[item.key] = item.ok
      ? {
          ok: true,
          statusCode: item.statusCode,
          endpoint: item.endpoint,
          data: item.data
        }
      : {
          ok: false,
          statusCode: item.statusCode,
          endpoint: item.endpoint,
          error: item.error
        };

    return acc;
  }, {});

  const guildName = String(draftDetails?.guild?.data?.guild_name || draftDetails?.basic?.data?.guild_name || "").trim();

  if (guildName) {
    let guildIdResult = null;

    try {
      guildIdResult = await getGuildIdByName(guildName, worldNameCanonical);

      if (shouldLog) {
        await saveRequestLog({
          characterName,
          worldName: worldNameCanonical,
          ocid,
          endpoint: guildIdResult.endpoint,
          statusCode: guildIdResult.statusCode,
          success: true,
          responseBody: guildIdResult.data
        });
      }

      settledDetails.push({
        key: "guildId",
        ok: true,
        statusCode: guildIdResult.statusCode,
        endpoint: guildIdResult.endpoint,
        data: guildIdResult.data
      });
    } catch (error) {
      const { statusCode, errorBody, endpoint } = getErrorInfo(error, "/maplestorym/v1/guild/id");

      if (shouldLog) {
        await saveRequestLog({
          characterName,
          worldName: worldNameCanonical,
          ocid,
          endpoint,
          statusCode,
          success: false,
          responseBody: errorBody
        });
      }

      settledDetails.push({
        key: "guildId",
        ok: false,
        statusCode,
        endpoint,
        error: errorBody
      });
    }

    const oguildId = String(guildIdResult?.data?.oguild_id || "").trim();
    if (oguildId) {
      try {
        const guildBasicResult = await getGuildBasicById(oguildId);

        if (shouldLog) {
          await saveRequestLog({
            characterName,
            worldName: worldNameCanonical,
            ocid,
            endpoint: guildBasicResult.endpoint,
            statusCode: guildBasicResult.statusCode,
            success: true,
            responseBody: guildBasicResult.data
          });
        }

        settledDetails.push({
          key: "guildBasic",
          ok: true,
          statusCode: guildBasicResult.statusCode,
          endpoint: guildBasicResult.endpoint,
          data: guildBasicResult.data
        });
      } catch (error) {
        const { statusCode, errorBody, endpoint } = getErrorInfo(error, "/maplestorym/v1/guild/basic");

        if (shouldLog) {
          await saveRequestLog({
            characterName,
            worldName: worldNameCanonical,
            ocid,
            endpoint,
            statusCode,
            success: false,
            responseBody: errorBody
          });
        }

        settledDetails.push({
          key: "guildBasic",
          ok: false,
          statusCode,
          endpoint,
          error: errorBody
        });
      }
    }
  }

  const details = settledDetails.reduce((acc, item) => {
    acc[item.key] = item.ok
      ? {
          ok: true,
          statusCode: item.statusCode,
          endpoint: item.endpoint,
          data: item.data
        }
      : {
          ok: false,
          statusCode: item.statusCode,
          endpoint: item.endpoint,
          error: item.error
        };

    return acc;
  }, {});

  const successCount = settledDetails.filter((item) => item.ok).length;
  const failureCount = settledDetails.length - successCount;

  return {
    details,
    summary: {
      total: settledDetails.length,
      successCount,
      failureCount
    }
  };
}

async function saveAggregatedCharacterLog({
  characterName,
  worldNameCanonical,
  ocid,
  statusCode,
  success,
  responseBody
}) {
  try {
    const saved = await saveRequestLog({
      characterName,
      worldName: worldNameCanonical,
      ocid,
      endpoint: aggregateLogEndpoint,
      statusCode,
      success,
      responseBody
    });

    return Boolean(saved);
  } catch (error) {
    return false;
  }
}

function buildExpHistoryFilter(ocid) {
  return {
    ocid,
    success: true,
    $or: [
      { endpoint: { $regex: /\/maplestorym\/v1\/character\/stat$/ } },
      { endpoint: { $regex: /\/maplestorym\/v1\/character\/all$/ } },
      { "responseBody.details.stat.data": { $exists: true } },
      { "responseBody.details.basic.data": { $exists: true } },
      { "responseBody.tabs.exp.stat.data": { $exists: true } }
    ]
  };
}

function extractExpInfoFromLog(responseBody) {
  if (!responseBody || typeof responseBody !== "object") {
    return null;
  }

  if (
    responseBody.character_exp !== undefined ||
    responseBody.character_exp_rate !== undefined ||
    responseBody.character_level !== undefined
  ) {
    return {
      exp: responseBody.character_exp,
      expRate: responseBody.character_exp_rate,
      level: responseBody.character_level
    };
  }

  if (responseBody.details?.basic?.data) {
    return {
      exp: responseBody.details.basic.data.character_exp,
      expRate: responseBody.details.basic.data.character_exp_rate,
      level: responseBody.details.basic.data.character_level
    };
  }

  if (responseBody.details?.stat?.data) {
    return {
      exp: responseBody.details.stat.data.character_exp,
      expRate: responseBody.details.stat.data.character_exp_rate,
      level: responseBody.details.stat.data.character_level
    };
  }

  if (responseBody.tabs?.exp) {
    const basicData = responseBody.tabs.exp.basic?.data || {};
    const statData = responseBody.tabs.exp.stat?.data || {};
    return {
      exp: basicData.character_exp ?? statData.character_exp ?? responseBody.tabs.exp.currentExp,
      expRate: basicData.character_exp_rate ?? statData.character_exp_rate ?? responseBody.tabs.exp.currentExpRate,
      level: basicData.character_level ?? statData.character_level ?? responseBody.tabs.exp.currentLevel
    };
  }

  return null;
}

function parseNumericValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = String(value).replace(/[^0-9.-]/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toIsoString(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function toKstDateText(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function toKstDateTimeKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  })
    .format(date)
    .replace(" ", "T");
}

function buildRecentKstDateRange(limit = 7) {
  const maxDays = Number.isFinite(limit) ? Math.max(1, Math.min(30, Math.floor(limit))) : 7;
  const now = new Date();
  const dates = [];

  for (let offset = 0; offset < maxDays; offset += 1) {
    const base = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    const dateText = toKstDateText(base);
    if (dateText) {
      dates.push(dateText);
    }
  }

  return dates;
}

async function resolveLatestOverallRankingByOcid(ocid, options = {}) {
  const normalizedOcid = String(ocid || "").trim();
  if (!normalizedOcid) {
    return null;
  }

  const days = Number.isFinite(options.days) ? options.days : 7;
  const dateCandidates = buildRecentKstDateRange(days).filter((date) => date >= rankingDateFloor);

  for (const date of dateCandidates) {
    try {
      const result = await getRankingLevel({
        date,
        ocid: normalizedOcid,
        page: 1
      });
      const first = toArray(result?.data?.ranking)[0];
      const rankingValue = parseNumericValue(first?.ranking);
      if (rankingValue !== null) {
        return {
          date,
          ranking: Math.max(1, Math.floor(rankingValue))
        };
      }
    } catch (error) {
      // Ignore lookup failures and continue with older dates.
    }
  }

  return null;
}

function normalizePresetNo(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

async function loadRecentPageDataDetailsByOcid(ocid, limit = presetFallbackLookbackLimit) {
  if (!ocid || !isMongoConnected()) {
    return [];
  }

  const lookback = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : presetFallbackLookbackLimit;
  const docs = await RequestLog.find({
    ocid,
    endpoint: aggregateLogEndpoint,
    success: true,
    "responseBody.mode": "page-data"
  })
    .sort({ createdAt: -1 })
    .limit(lookback)
    .select({ createdAt: 1, "responseBody.details": 1, _id: 0 })
    .allowDiskUse(true)
    .lean();

  return docs
    .map((doc) => ({
      createdAt: doc.createdAt,
      details: doc?.responseBody?.details || null
    }))
    .filter((entry) => entry.details && typeof entry.details === "object");
}

function sortPresetEntries(entries, activePresetNo) {
  const activeNo = normalizePresetNo(activePresetNo);

  return [...entries].sort((left, right) => {
    const leftNo = normalizePresetNo(left?.presetNo);
    const rightNo = normalizePresetNo(right?.presetNo);
    const leftIsActive = activeNo !== null && leftNo === activeNo;
    const rightIsActive = activeNo !== null && rightNo === activeNo;

    if (leftIsActive !== rightIsActive) {
      return leftIsActive ? -1 : 1;
    }

    if (leftNo !== null && rightNo !== null && leftNo !== rightNo) {
      return leftNo - rightNo;
    }

    return String(left?.presetNo || "").localeCompare(String(right?.presetNo || ""), "ko-KR");
  });
}

function mergePresetResult(currentResult, fallbackDetails, extractor) {
  const mergedMap = new Map();
  const extras = { ...(currentResult?.extras || {}) };
  let fallbackUsed = false;
  let activePresetNo = normalizePresetNo(currentResult?.activePresetNo);

  const addRecord = (record, isFallback = false) => {
    const presetNo = normalizePresetNo(record?.presetNo);
    if (presetNo === null) {
      return;
    }

    if (mergedMap.has(presetNo)) {
      return;
    }

    mergedMap.set(presetNo, {
      presetNo,
      source: record?.source || (isFallback ? "mongo" : "api"),
      sourceTimestamp: toIsoString(record?.sourceTimestamp),
      summary: record?.summary || {},
      data: record?.data || {}
    });

    if (isFallback) {
      fallbackUsed = true;
    }
  };

  toArray(currentResult?.records).forEach((record) => {
    addRecord(record, false);
  });

  toArray(fallbackDetails).forEach((entry) => {
    const extracted = extractor(entry?.details, "mongo", toIsoString(entry?.createdAt));
    const candidateActiveNo = normalizePresetNo(extracted?.activePresetNo);
    if (activePresetNo === null && candidateActiveNo !== null) {
      activePresetNo = candidateActiveNo;
    }

    toArray(extracted?.records).forEach((record) => {
      addRecord(record, true);
    });
  });

  const mergedEntries = sortPresetEntries([...mergedMap.values()], activePresetNo);
  if (activePresetNo === null && mergedEntries.length) {
    activePresetNo = normalizePresetNo(mergedEntries[0].presetNo);
  }

  const presets = mergedEntries.map((entry) => ({
    ...entry,
    isActive: activePresetNo !== null && normalizePresetNo(entry.presetNo) === activePresetNo
  }));

  return {
    activePresetNo: activePresetNo ?? "-",
    presets,
    fallbackUsed,
    ...extras
  };
}

function mapOptionEntry(option) {
  const optionGrade = String(
    option?.option_grade ||
      option?.potential_option_grade ||
      option?.item_potential_option_grade ||
      option?.additional_potential_option_grade ||
      option?.item_additional_potential_option_grade ||
      option?.grade ||
      ""
  ).trim();

  return {
    name: String(option?.option_name || option?.stat_type || "").trim() || "-",
    value: String(option?.option_value || option?.stat_increase || "").trim(),
    optionGrade
  };
}

const expHistoryBatchSize = 400;
const expHistoryMaxBatchCount = 8;
const expHistorySortHint = Object.freeze({
  ocid: 1,
  success: 1,
  createdAt: -1
});
const expHistoryProjection = Object.freeze({
  _id: 0,
  createdAt: 1,
  "responseBody.character_exp": 1,
  "responseBody.character_exp_rate": 1,
  "responseBody.character_level": 1,
  "responseBody.details.basic.data.character_exp": 1,
  "responseBody.details.basic.data.character_exp_rate": 1,
  "responseBody.details.basic.data.character_level": 1,
  "responseBody.details.stat.data.character_exp": 1,
  "responseBody.details.stat.data.character_exp_rate": 1,
  "responseBody.details.stat.data.character_level": 1,
  "responseBody.tabs.exp.currentExp": 1,
  "responseBody.tabs.exp.currentExpRate": 1,
  "responseBody.tabs.exp.currentLevel": 1,
  "responseBody.tabs.exp.basic.data.character_exp": 1,
  "responseBody.tabs.exp.basic.data.character_exp_rate": 1,
  "responseBody.tabs.exp.basic.data.character_level": 1,
  "responseBody.tabs.exp.stat.data.character_exp": 1,
  "responseBody.tabs.exp.stat.data.character_exp_rate": 1,
  "responseBody.tabs.exp.stat.data.character_level": 1
});

function isHintNotUsableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("hint") &&
    (
      message.includes("bad hint") ||
      message.includes("provided hint") ||
      message.includes("failed to use hint") ||
      message.includes("does not correspond")
    )
  );
}

function normalizeCreatedAtForCursor(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function fetchExpHistoryLogBatch({
  ocid,
  beforeCreatedAt = null,
  batchLimit = expHistoryBatchSize,
  useHint = true
}) {
  const filter = {
    ocid,
    success: true
  };
  if (beforeCreatedAt instanceof Date && !Number.isNaN(beforeCreatedAt.getTime())) {
    filter.createdAt = { $lt: beforeCreatedAt };
  }

  let query = RequestLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(batchLimit)
    .select(expHistoryProjection)
    .allowDiskUse(true)
    .lean();

  if (useHint) {
    query = query.hint(expHistorySortHint);
  }

  return query;
}

function pickItemFieldValue(item, preferredKeys = [], matcher) {
  if (!item || typeof item !== "object") {
    return null;
  }

  for (const key of preferredKeys) {
    const value = item[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  if (typeof matcher === "function") {
    for (const [key, value] of Object.entries(item)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }

      if (matcher(key, value)) {
        return value;
      }
    }
  }

  return null;
}

function mapEquipmentItemForView(item) {
  const potentialGrade = pickItemFieldValue(
    item,
    [
      "item_potential_option_grade",
      "item_potential_grade",
      "potential_option_grade",
      "potential_grade"
    ],
    (key) => {
      const normalized = String(key || "").toLowerCase();
      return /potential/.test(normalized) && /grade/.test(normalized) && !/additional/.test(normalized);
    }
  );
  const additionalPotentialGrade = pickItemFieldValue(
    item,
    [
      "item_additional_potential_option_grade",
      "item_additional_potential_grade",
      "additional_potential_option_grade",
      "additional_potential_grade"
    ],
    (key) => {
      const normalized = String(key || "").toLowerCase();
      return /additional/.test(normalized) && /potential/.test(normalized) && /grade/.test(normalized);
    }
  );
  const karmaScissorsRemaining = pickItemFieldValue(
    item,
    [
      "remaining_karma_scissors_count",
      "remain_karma_scissors_count",
      "karma_scissors_count",
      "karma_scissor_count",
      "scissors_count",
      "scissor_count",
      "remaining_scissors_count",
      "remain_scissors_count",
      "cuttable_count",
      "remaining_cuttable_count"
    ],
    (key) => {
      const normalized = String(key || "").toLowerCase();
      const hasKeyword = /karma|scissor|scissors|cuttable|cut/.test(normalized);
      const hasCount = /count|remain|remaining|left|usable|use/.test(normalized);
      return hasKeyword && hasCount;
    }
  );
  const remainingStarforceExpansion = pickItemFieldValue(
    item,
    [
      "remaining_starforce_expansion_count",
      "remain_starforce_expansion_count",
      "starforce_expansion_count",
      "starforce_extend_count",
      "remaining_starforce_extend_count",
      "starforce_extension_count"
    ],
    (key) => {
      const normalized = String(key || "").toLowerCase();
      const hasStarforce = /starforce/.test(normalized);
      const hasExpansion = /expand|extension|extend|remain|remaining|count|left/.test(normalized);
      const isUpgrade = /upgrade/.test(normalized);
      return hasStarforce && hasExpansion && !isUpgrade;
    }
  );

  return {
    itemName: item?.item_name || "-",
    slotName: item?.item_equipment_slot_name || "-",
    pageName: item?.item_equipment_page_name || "",
    itemGrade: item?.item_grade || "-",
    itemIcon: item?.item_icon || "",
    starforceUpgrade: item?.starforce_upgrade ?? "-",
    equipmentLevel: item?.equipment_level ?? "-",
    combatPower: item?.item_combat_power ?? "-",
    itemOptionText: item?.item_option || "",
    basicOption: toArray(item?.item_basic_option).map(mapOptionEntry),
    additionalOption: toArray(item?.item_additional_option).map(mapOptionEntry),
    potentialOption: toArray(item?.item_potential_option).map(mapOptionEntry),
    additionalPotentialOption: toArray(item?.item_additional_potential_option).map(mapOptionEntry),
    potentialGrade: String(potentialGrade || "").trim(),
    additionalPotentialGrade: String(additionalPotentialGrade || "").trim(),
    soulInfo: {
      soulName: item?.soul_info?.soul_name || "",
      soulOption: item?.soul_info?.soul_option || ""
    },
    karmaScissorsRemaining,
    remainingStarforceExpansion,
    emblemInfo: item?.emblem_info || null
  };
}

function mapCashEquipmentItemForView(item) {
  return {
    cashItemName: item?.cash_item_name || item?.item_name || "-",
    cashItemIcon: item?.cash_item_icon || item?.miracle_anvil_item_icon || item?.item_icon || "",
    slotName: item?.cash_item_equipment_slot_name || item?.item_equipment_slot_name || "-"
  };
}

function extractEquipmentPresetResult(details, source, sourceTimestamp) {
  const itemData = details?.itemEquipment?.data || {};
  const cashData = details?.cashitemEquipment?.data || {};
  const itemPresets = toArray(itemData.equipment_preset);
  const cashPresets = toArray(cashData.cash_equipment_preset);
  const additionalCashPresets = toArray(cashData.additional_cash_equipment_preset);

  const activeItemPresetNo = normalizePresetNo(itemData.use_preset_no);
  const activeCashPresetNo = normalizePresetNo(cashData.use_preset_no);
  const activeAdditionalCashPresetNo = normalizePresetNo(cashData.use_additional_preset_no);
  const recordsByPreset = new Map();
  const mapCashList = (list) => toArray(list).map(mapCashEquipmentItemForView);
  const resolvePresetCashList = (preset) => {
    const direct = toArray(preset?.cash_item_equipment);
    if (direct.length) {
      return direct;
    }

    return toArray(preset?.additional_cash_item_equipment);
  };

  const ensureRecord = (presetNo) => {
    const numericPresetNo = normalizePresetNo(presetNo);
    if (numericPresetNo === null) {
      return null;
    }

    if (!recordsByPreset.has(numericPresetNo)) {
      recordsByPreset.set(numericPresetNo, {
        presetNo: numericPresetNo,
        source,
        sourceTimestamp,
        data: {
          itemEquipment: [],
          cashItemEquipment: [],
          additionalCashItemEquipment: [],
          soulSetOption: "",
          characterClass: itemData.character_class || "",
          characterGender: cashData.character_gender || ""
        }
      });
    }

    return recordsByPreset.get(numericPresetNo);
  };

  itemPresets.forEach((preset) => {
    const record = ensureRecord(preset?.preset_no);
    if (!record) {
      return;
    }

    record.data.itemEquipment = toArray(preset?.item_equipment).map(mapEquipmentItemForView);
    record.data.soulSetOption = preset?.soul_set_option || "";
  });

  if (!itemPresets.length) {
    const record = ensureRecord(activeItemPresetNo ?? 1);
    if (record) {
      record.data.itemEquipment = toArray(itemData.item_equipment).map(mapEquipmentItemForView);
      record.data.soulSetOption = itemData.soul_set_option || "";
    }
  }

  cashPresets.forEach((preset) => {
    const record = ensureRecord(preset?.preset_no);
    if (!record) {
      return;
    }

    record.data.cashItemEquipment = mapCashList(resolvePresetCashList(preset));
  });

  if (!cashPresets.length) {
    const fallbackCashItems = mapCashList(cashData.cash_item_equipment);
    if (fallbackCashItems.length && recordsByPreset.size) {
      recordsByPreset.forEach((record) => {
        record.data.cashItemEquipment = [...fallbackCashItems];
      });
    } else {
      const record = ensureRecord(activeCashPresetNo ?? activeItemPresetNo ?? 1);
      if (record) {
        record.data.cashItemEquipment = fallbackCashItems;
      }
    }
  }

  additionalCashPresets.forEach((preset) => {
    const record = ensureRecord(preset?.preset_no);
    if (!record) {
      return;
    }

    record.data.additionalCashItemEquipment = mapCashList(resolvePresetCashList(preset));
  });

  if (!additionalCashPresets.length) {
    const fallbackAdditionalCashItems = mapCashList(cashData.additional_cash_item_equipment);
    if (fallbackAdditionalCashItems.length && recordsByPreset.size) {
      recordsByPreset.forEach((record) => {
        record.data.additionalCashItemEquipment = [...fallbackAdditionalCashItems];
      });
    } else {
      const record = ensureRecord(activeAdditionalCashPresetNo ?? activeCashPresetNo ?? activeItemPresetNo ?? 1);
      if (record) {
        record.data.additionalCashItemEquipment = fallbackAdditionalCashItems;
      }
    }
  }

  const topLevelCashItems = mapCashList(cashData.cash_item_equipment);
  const topLevelAdditionalCashItems = mapCashList(cashData.additional_cash_item_equipment);
  const firstPresetCashItems =
    [...recordsByPreset.values()].find((record) => toArray(record?.data?.cashItemEquipment).length > 0)?.data
      ?.cashItemEquipment || [];
  const firstPresetAdditionalCashItems =
    [...recordsByPreset.values()].find((record) => toArray(record?.data?.additionalCashItemEquipment).length > 0)?.data
      ?.additionalCashItemEquipment || [];

  recordsByPreset.forEach((record) => {
    if (!toArray(record?.data?.cashItemEquipment).length) {
      if (topLevelCashItems.length) {
        record.data.cashItemEquipment = [...topLevelCashItems];
      } else if (firstPresetCashItems.length) {
        record.data.cashItemEquipment = [...firstPresetCashItems];
      }
    }

    if (!toArray(record?.data?.additionalCashItemEquipment).length) {
      if (topLevelAdditionalCashItems.length) {
        record.data.additionalCashItemEquipment = [...topLevelAdditionalCashItems];
      } else if (firstPresetAdditionalCashItems.length) {
        record.data.additionalCashItemEquipment = [...firstPresetAdditionalCashItems];
      }
    }
  });

  const records = [...recordsByPreset.values()].map((record) => ({
    presetNo: record.presetNo,
    source: record.source,
    sourceTimestamp: record.sourceTimestamp,
    summary: {
      itemCount: record.data.itemEquipment.length,
      cashCount: record.data.cashItemEquipment.length,
      additionalCashCount: record.data.additionalCashItemEquipment.length,
      soulSetOption: record.data.soulSetOption || "-"
    },
    data: record.data
  }));

  return {
    activePresetNo: activeItemPresetNo ?? activeCashPresetNo ?? activeAdditionalCashPresetNo ?? null,
    extras: {
      activeCashPresetNo: activeCashPresetNo ?? "-",
      activeAdditionalCashPresetNo: activeAdditionalCashPresetNo ?? "-"
    },
    records
  };
}

function extractUnionPresetResult(details, source, sourceTimestamp) {
  const unionRaiderData = details?.unionRaider?.data || {};
  const activePresetNo = normalizePresetNo(unionRaiderData.use_preset_no);
  const battleMaps = toArray(unionRaiderData.battle_map);
  const occupiedOptions = toArray(unionRaiderData.use_union_occupied_option).map(mapOptionEntry);
  const raiderOptions = toArray(unionRaiderData.use_union_raider_option).map(mapOptionEntry);
  const records = [];

  battleMaps.forEach((battleMap) => {
    const presetNo = normalizePresetNo(battleMap?.preset_no);
    if (presetNo === null) {
      return;
    }

    const isActive = activePresetNo !== null && presetNo === activePresetNo;
    const unionRaiders = toArray(battleMap?.union_raider).map((raider) => ({
      blockRank: raider?.block_rank || "-",
      blockType: raider?.block_type || "-",
      blockPosition: toArray(raider?.block_position).map((position) => ({
        cellNo: position?.cell_no ?? "-",
        x: position?.cell_x ?? "-",
        y: position?.cell_y ?? "-"
      }))
    }));

    records.push({
      presetNo,
      source,
      sourceTimestamp,
      summary: {
        occupiedCount: isActive ? occupiedOptions.length : 0,
        raiderOptionCount: isActive ? raiderOptions.length : 0,
        blockCount: unionRaiders.length
      },
      data: {
        optionSetting: battleMap?.option_setting || {},
        unionRaiders,
        occupiedOptions: isActive ? occupiedOptions : [],
        raiderOptions: isActive ? raiderOptions : []
      }
    });
  });

  if (!records.length && (occupiedOptions.length || raiderOptions.length || activePresetNo !== null)) {
    records.push({
      presetNo: activePresetNo ?? 1,
      source,
      sourceTimestamp,
      summary: {
        occupiedCount: occupiedOptions.length,
        raiderOptionCount: raiderOptions.length,
        blockCount: 0
      },
      data: {
        optionSetting: {},
        unionRaiders: [],
        occupiedOptions,
        raiderOptions
      }
    });
  }

  return {
    activePresetNo,
    records
  };
}

function mapAndroidEquipmentForView(androidEquipment) {
  return {
    androidName: androidEquipment?.android_name || "-",
    androidNickname: androidEquipment?.android_nickname || "",
    androidIcon: androidEquipment?.android_icon || "",
    androidDescription: androidEquipment?.android_description || "",
    androidGrade: androidEquipment?.android_grade || "-",
    androidGender: androidEquipment?.android_gender || "-",
    warehouseUsableFlag: androidEquipment?.android_warehouse_usable_flag ?? "-",
    earSensorClipFlag: androidEquipment?.android_ear_sensor_clip_flag ?? "-",
    cashItemEquipment: toArray(androidEquipment?.android_cash_item_equipment).map((item) => ({
      name: item?.cash_item_name || "-",
      icon: item?.cash_item_icon || "",
      slotName: item?.cash_item_equipment_slot_name || "-"
    }))
  };
}

function mapHeartEquipmentForView(heartEquipment) {
  return {
    heartName: heartEquipment?.heart_name || "-",
    heartIcon: heartEquipment?.heart_icon || "",
    heartDescription: heartEquipment?.heart_description || "",
    additionalOption: toArray(heartEquipment?.item_additional_option).map(mapOptionEntry),
    potentialOption: toArray(heartEquipment?.item_potential_option).map(mapOptionEntry),
    additionalPotentialOption: toArray(heartEquipment?.item_additional_potential_option).map(mapOptionEntry)
  };
}

function extractAndroidPresetResult(details, source, sourceTimestamp) {
  const androidData = details?.androidEquipment?.data || {};
  const activePresetNo = normalizePresetNo(androidData.use_preset_no);
  const presetList = toArray(androidData.android_heart_equipment_preset);
  const records = [];

  presetList.forEach((preset) => {
    const presetNo = normalizePresetNo(preset?.preset_no);
    if (presetNo === null) {
      return;
    }

    const androidEquipment = mapAndroidEquipmentForView(preset?.android_equipment || {});
    const heartEquipment = mapHeartEquipmentForView(preset?.heart_equipment || {});
    records.push({
      presetNo,
      source,
      sourceTimestamp,
      summary: {
        androidName: androidEquipment.androidName,
        heartName: heartEquipment.heartName
      },
      data: {
        androidEquipment,
        heartEquipment
      }
    });
  });

  if (!records.length && (androidData.android_equipment || androidData.heart_equipment || activePresetNo !== null)) {
    const androidEquipment = mapAndroidEquipmentForView(androidData.android_equipment || {});
    const heartEquipment = mapHeartEquipmentForView(androidData.heart_equipment || {});
    records.push({
      presetNo: activePresetNo ?? 1,
      source,
      sourceTimestamp,
      summary: {
        androidName: androidEquipment.androidName,
        heartName: heartEquipment.heartName
      },
      data: {
        androidEquipment,
        heartEquipment
      }
    });
  }

  return {
    activePresetNo,
    records
  };
}

function extractJewelPresetResult(details, source, sourceTimestamp) {
  const jewelData = details?.jewel?.data || {};
  const activePresetNo = normalizePresetNo(jewelData.use_jewel_page_no);
  const pages = toArray(jewelData.jewel_equipment);
  const records = pages.map((page) => {
    const presetNo = normalizePresetNo(page?.jewel_page_no);
    return {
      presetNo,
      source,
      sourceTimestamp,
      summary: {
        jewelCount: toArray(page?.jewel_info).length
      },
      data: {
        jewelPageNo: page?.jewel_page_no ?? "-",
        jewelInfo: toArray(page?.jewel_info).map((jewelInfo) => ({
          slotNo: jewelInfo?.slot_no ?? "-",
          jewelName: jewelInfo?.jewel_name || "-",
          jewelGrade: jewelInfo?.jewel_grade || "-",
          jewelColor: jewelInfo?.jewel_color || "-",
          jewelOption: jewelInfo?.jewel_option || "",
          jewelIcon: jewelInfo?.jewel_icon || ""
        }))
      }
    };
  }).filter((entry) => normalizePresetNo(entry.presetNo) !== null);

  if (!records.length && activePresetNo !== null) {
    records.push({
      presetNo: activePresetNo,
      source,
      sourceTimestamp,
      summary: { jewelCount: 0 },
      data: {
        jewelPageNo: activePresetNo,
        jewelInfo: []
      }
    });
  }

  return {
    activePresetNo,
    extras: {
      activeSetOption: jewelData.use_jewel_set_option || "-"
    },
    records
  };
}

function extractHyperStatPresetResult(details, source, sourceTimestamp) {
  const hyperData = details?.hyperStat?.data || {};
  const activePresetNo = normalizePresetNo(hyperData.use_preset_no);
  const presets = toArray(hyperData.hyper_stat);
  const records = presets.map((preset) => {
    const presetNo = normalizePresetNo(preset?.preset_no);
    const hyperStatInfo = toArray(preset?.hyper_stat_info).map((info) => ({
      statType: info?.stat_type || "-",
      statLevel: info?.stat_level ?? "-",
      statIncrease: info?.stat_increase || "-"
    }));

    return {
      presetNo,
      source,
      sourceTimestamp,
      summary: {
        statCount: hyperStatInfo.length
      },
      data: {
        hyperStatInfo,
        remainHyperStat: presetNo === activePresetNo ? hyperData.use_preset_remain_hyper_stat ?? "-" : "-"
      }
    };
  }).filter((entry) => normalizePresetNo(entry.presetNo) !== null);

  if (!records.length && activePresetNo !== null) {
    records.push({
      presetNo: activePresetNo,
      source,
      sourceTimestamp,
      summary: { statCount: 0 },
      data: {
        hyperStatInfo: [],
        remainHyperStat: hyperData.use_preset_remain_hyper_stat ?? "-"
      }
    });
  }

  return {
    activePresetNo,
    extras: {
      presetCount: hyperData.preset_count ?? "-"
    },
    records
  };
}

function extractLinkSkillPresetResult(details, source, sourceTimestamp) {
  const linkData = details?.linkSkill?.data || {};
  const activePresetNo = normalizePresetNo(linkData.use_prest_no ?? linkData.use_preset_no);
  const presets = toArray(linkData.link_skill);
  const records = presets.map((preset) => {
    const presetNo = normalizePresetNo(preset?.preset_no);
    const linkSkillInfo = toArray(preset?.link_skill_info).map((skill) => ({
      skillName: skill?.skill_name || "-",
      skillLevel: skill?.skill_level ?? "-",
      skillDescription: skill?.skill_description || "",
      skillEffect: skill?.skill_effect || "",
      skillEffectNext: skill?.skill_effect_next || "",
      skillIcon: skill?.skill_icon || ""
    }));

    return {
      presetNo,
      source,
      sourceTimestamp,
      summary: {
        skillCount: linkSkillInfo.length
      },
      data: {
        linkSkillInfo
      }
    };
  }).filter((entry) => normalizePresetNo(entry.presetNo) !== null);

  if (!records.length && activePresetNo !== null) {
    records.push({
      presetNo: activePresetNo,
      source,
      sourceTimestamp,
      summary: { skillCount: 0 },
      data: {
        linkSkillInfo: []
      }
    });
  }

  return {
    activePresetNo,
    records
  };
}

function buildEquipmentTab(details, fallbackDetails) {
  const current = extractEquipmentPresetResult(details, "api", new Date().toISOString());
  const merged = mergePresetResult(current, fallbackDetails, extractEquipmentPresetResult);
  const setEffects = toArray(details?.setEffect?.data?.set_info).map((setInfo) => ({
    setName: setInfo?.set_name || "-",
    setCount: setInfo?.set_count ?? "-",
    setOption: setInfo?.set_option || "-"
  }));
  const petData = details?.petEquipment?.data || {};
  const petSetOptions = toArray(petData.pet_set_option).map((setOption) => ({
    setName: setOption?.set_name || "-",
    setOption: setOption?.set_option || "-"
  }));

  return {
    ...merged,
    setEffects,
    petSetOptions,
    petAutoSkillOption: petData.pet_auto_skill_option || "-"
  };
}

function buildUnionTab(details, fallbackDetails) {
  const current = extractUnionPresetResult(details, "api", new Date().toISOString());
  const merged = mergePresetResult(current, fallbackDetails, extractUnionPresetResult);
  const unionData = details?.union?.data || {};
  const unionRaiderData = details?.unionRaider?.data || {};
  const activeOccupiedOptions = toArray(unionRaiderData.use_union_occupied_option).map(mapOptionEntry);
  const activeRaiderOptions = toArray(unionRaiderData.use_union_raider_option).map(mapOptionEntry);

  return {
    ...merged,
    summary: {
      unionLevel: unionData.union_level ?? "-",
      unionGrade: unionData.union_grade || "-",
      unionGradeIcon: unionData.union_grade_icon || "",
      unionLevelTotalOption: unionData.union_level_total_option || "-",
      unionLevelTotalOptionSegments: splitStatSegments(unionData.union_level_total_option || "")
    },
    activeOccupiedOptions,
    activeRaiderOptions
  };
}

function buildAndroidTab(details, fallbackDetails) {
  const current = extractAndroidPresetResult(details, "api", new Date().toISOString());
  return mergePresetResult(current, fallbackDetails, extractAndroidPresetResult);
}

function buildJewelSymbolVmatrixTab(details, fallbackDetails) {
  const current = extractJewelPresetResult(details, "api", new Date().toISOString());
  const merged = mergePresetResult(current, fallbackDetails, extractJewelPresetResult);
  const symbolData = details?.symbol?.data || {};
  const vmatrixData = details?.vmatrix?.data || {};

  const arcaneSymbols = toArray(symbolData.arcane_symbol).map((symbol) => ({
    symbolName: symbol?.symbol_name || "-",
    symbolIcon: symbol?.symbol_icon || "",
    symbolLevel: symbol?.symbol_level ?? "-",
    symbolGrowthValue: symbol?.symbol_growth_value ?? "-",
    symbolOption: symbol?.symbol_option || "-",
    arcaneForce:
      parseNumericValue(
        symbol?.arcane_force ??
          symbol?.arcane_force_value ??
          symbol?.symbol_force ??
          symbol?.symbol_force_value ??
          symbol?.force,
      ) ?? null,
    physicalAttack:
      parseNumericValue(
        symbol?.physical_attack ??
          symbol?.physical_attack_power ??
          symbol?.physical_atk ??
          symbol?.atk,
      ) ?? null,
    magicalAttack:
      parseNumericValue(
        symbol?.magical_attack ??
          symbol?.magical_attack_power ??
          symbol?.magic_attack ??
          symbol?.magic_atk ??
          symbol?.matk,
      ) ?? null,
    authenticForce:
      parseNumericValue(
        symbol?.authentic_force ??
          symbol?.authentic_force_value,
      ) ?? null,
    criticalDamage:
      parseNumericValue(
        symbol?.critical_damage ??
          symbol?.critical_damage_rate ??
          symbol?.critical_damage_percent,
      ) ?? null,
  }));

  const authenticSymbols = toArray(symbolData.authentic_symbol).map((symbol) => ({
    symbolName: symbol?.symbol_name || "-",
    symbolIcon: symbol?.symbol_icon || "",
    symbolLevel: symbol?.symbol_level ?? "-",
    symbolGrowthValue: symbol?.symbol_growth_value ?? "-",
    symbolOption: symbol?.symbol_option || "-",
    arcaneForce:
      parseNumericValue(
        symbol?.arcane_force ??
          symbol?.arcane_force_value ??
          symbol?.symbol_force ??
          symbol?.symbol_force_value ??
          symbol?.force,
      ) ?? null,
    physicalAttack:
      parseNumericValue(
        symbol?.physical_attack ??
          symbol?.physical_attack_power ??
          symbol?.physical_atk ??
          symbol?.atk,
      ) ?? null,
    magicalAttack:
      parseNumericValue(
        symbol?.magical_attack ??
          symbol?.magical_attack_power ??
          symbol?.magic_attack ??
          symbol?.magic_atk ??
          symbol?.matk,
      ) ?? null,
    authenticForce:
      parseNumericValue(
        symbol?.authentic_force ??
          symbol?.authentic_force_value,
      ) ?? null,
    criticalDamage:
      parseNumericValue(
        symbol?.critical_damage ??
          symbol?.critical_damage_rate ??
          symbol?.critical_damage_percent,
      ) ?? null,
  }));

  const vCores = toArray(vmatrixData.character_v_core_equipment).map((core) => ({
    slotId: core?.slot_id ?? "-",
    slotLevel: core?.slot_level ?? "-",
    vcoreName: core?.vcore_name || "-",
    vcoreLevel: core?.vcore_level ?? "-",
    vcoreType: core?.vcore_type || "-",
    skills: [core?.vcore_skill_name1, core?.vcore_skill_name2, core?.vcore_skill_name3].filter(Boolean)
  }));

  return {
    ...merged,
    symbol: {
      arcaneSymbols,
      authenticSymbols
    },
    vmatrix: {
      characterClass: vmatrixData.character_class || "-",
      vCores
    }
  };
}

function buildHexamatrixTab(details) {
  const hexaSkillData = details?.hexamatrixSkill?.data || {};
  const hexaStatData = details?.hexamatrixStat?.data || {};
  const hexaSkills = toArray(hexaSkillData.hexamatrix_skill).map((skill) => ({
    skillName: skill?.skill_name || "-",
    slotNo:
      skill?.slot_no ??
      skill?.hexa_skill_slot_no ??
      skill?.hexamatrix_skill_slot_no ??
      skill?.slot_id ??
      null,
    skillLevel: skill?.skill_level ?? skill?.slot_level ?? "-",
    slotLevel: skill?.slot_level ?? "-",
    skillType: skill?.skill_type || "-",
    skillEffect: skill?.skill_effect || "-",
    skillIcon: skill?.skill_icon || ""
  }));

  const hexaStatCoreList = toArray(hexaStatData.hexamatrix_stat).map((core) => ({
    statCoreSlot: core?.stat_core_slot ?? "-",
    statInfo: toArray(core?.stat_info).map((info) => ({
      pageNo: info?.page_no ?? "-",
      activateFlag: info?.activate_flag ?? "0",
      mainStat: info?.main_stat || "-",
      mainStatLevel: info?.main_stat_level ?? "-",
      slotLevel: info?.slot_level ?? "-",
      sub1Stat: info?.sub_1_stat || "-",
      sub1StatLevel: info?.sub_1_stat_level ?? "-",
      sub2Stat: info?.sub_2_stat || "-",
      sub2StatLevel: info?.sub_2_stat_level ?? "-"
    }))
  }));

  return {
    hexaSkills,
    hexaStatCoreList
  };
}

function buildHyperStatTab(details, fallbackDetails) {
  const current = extractHyperStatPresetResult(details, "api", new Date().toISOString());
  return mergePresetResult(current, fallbackDetails, extractHyperStatPresetResult);
}

function buildSkillLinkTab(details, fallbackDetails) {
  const current = extractLinkSkillPresetResult(details, "api", new Date().toISOString());
  const merged = mergePresetResult(current, fallbackDetails, extractLinkSkillPresetResult);
  const skillEquipmentData = details?.skillEquipment?.data || {};
  const skillSetSource =
    toArray(skillEquipmentData.skill).length
      ? toArray(skillEquipmentData.skill)
      : toArray(skillEquipmentData.skill_equipment).length
        ? toArray(skillEquipmentData.skill_equipment)
        : toArray(skillEquipmentData.character_skill).length
          ? toArray(skillEquipmentData.character_skill)
          : toArray(skillEquipmentData.character_skill_info);
  const skillSet = toArray(skillSetSource).map((skill) => ({
    skillName: skill?.skill_name || "-",
    skillLevel: skill?.skill_level ?? "-",
    skillDescription: skill?.skill_description || "",
    skillEffect: skill?.skill_effect || "",
    skillType: skill?.skill_type || "",
    skillIcon: skill?.skill_icon || ""
  }));

  return {
    ...merged,
    skillSet,
    skillSetRaw: skillSet.length ? null : skillEquipmentData
  };
}

async function hasExpHistory(ocid) {
  if (mongoose.connection.readyState !== 1) {
    return false;
  }

  const count = await RequestLog.countDocuments(buildExpHistoryFilter(ocid));

  return count > 0;
}

function findGuildMemberForCharacter(guildBasicData, characterName) {
  const members = Array.isArray(guildBasicData?.guild_member) ? guildBasicData.guild_member : [];
  const targetName = String(characterName || "").trim();
  if (!targetName) {
    return null;
  }

  return members.find((member) => String(member?.character_name || "").trim() === targetName) || null;
}

function buildGuildTab(details, characterName, worldNameCanonical) {
  const characterGuildData = details?.guild?.data || {};
  const guildIdData = details?.guildId?.data || {};
  const guildBasicData = details?.guildBasic?.data || {};
  const memberSelf = findGuildMemberForCharacter(guildBasicData, characterName);
  const guildSkills = toArray(guildBasicData.guild_skill).map((skill) => ({
    skillName: skill?.skill_name || "-",
    skillLevel: skill?.skill_level ?? "-",
    skillOption: skill?.skill_option || "",
    skillIcon: skill?.skill_icon || ""
  }));
  const guildAbilities = toArray(guildBasicData.guild_ability).map((ability) => ({
    abilityNo: ability?.ability_no ?? "-",
    abilityName: ability?.ability_name || "-",
    abilityLevel: ability?.ability_level ?? "-",
    abilityOption: ability?.ability_option || "",
    abilityIcon: ability?.ability_icon || ""
  }));
  const guildBuildings = toArray(guildBasicData.guild_building).map((building) => ({
    buildingName: building?.building_name || "-",
    buildingLevel: building?.building_level ?? "-"
  }));
  const memberPreview = toArray(guildBasicData.guild_member)
    .slice(0, 20)
    .map((member) => ({
      characterName: member?.character_name || "-",
      characterLevel: member?.character_level ?? "-",
      guildActivity: member?.guild_activity ?? "-"
    }));

  return {
    summary: {
      guildName: guildBasicData.guild_name || characterGuildData.guild_name || "-",
      worldName: guildBasicData.world_name || worldNameCanonical || "-",
      guildLevel: guildBasicData.guild_level ?? "-",
      guildCreateDate: guildBasicData.guild_create_date || guildBasicData.world_create_date || "-",
      guildMarkIcon: guildBasicData.guild_mark_icon || "",
      guildMasterName: guildBasicData.guild_master_name || "-",
      guildMemberCount: guildBasicData.guild_member_count ?? "-",
      oguildId: guildIdData.oguild_id || ""
    },
    memberSelf: memberSelf
      ? {
          characterName: memberSelf.character_name || "-",
          characterLevel: memberSelf.character_level ?? "-",
          guildActivity: memberSelf.guild_activity ?? "-",
          guildPersonalSkill: toArray(memberSelf.guild_personal_skill).map((skill) => ({
            skillName: skill?.skill_name || "-",
            skillLevel: skill?.skill_level ?? "-",
            skillOption: skill?.skill_option || "",
            skillIcon: skill?.skill_icon || ""
          }))
        }
      : null,
    guildSkills,
    guildAbilities,
    guildBuildings,
    guildKeywords: toArray(guildBasicData.guild_keyword).filter(Boolean),
    memberPreview,
    status: {
      characterGuildOk: Boolean(details?.guild?.ok),
      guildIdOk: Boolean(details?.guildId?.ok),
      guildBasicOk: Boolean(details?.guildBasic?.ok)
    }
  };
}

function resolveMajorStatOrderByClassName(jobNameOrClassName) {
  const normalizedClassName = normalizeForMatch(jobNameOrClassName);

  if (magicalJobNames.has(normalizedClassName)) {
    return [...magicalMajorStatOrder];
  }

  if (physicalJobNames.has(normalizedClassName)) {
    return [...physicalMajorStatOrder];
  }

  return [...physicalMajorStatOrder];
}

function buildPageData({
  characterName,
  worldNameInput,
  worldNameCanonical,
  ocid,
  details,
  fallbackDetails,
  overallRankingResult
}) {
  const basic = details?.basic?.data || {};
  const stat = details?.stat?.data || {};
  const guild = details?.guild?.data || {};
  const fallbackList = toArray(fallbackDetails);
  const expRaw = basic.character_exp ?? stat.character_exp;
  const expRateRaw = basic.character_exp_rate ?? stat.character_exp_rate;
  const expRateValue = parseNumericValue(expRateRaw);
  const expText = expRateValue === null
    ? "-"
    : `${expRateValue.toLocaleString("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
  const majorStats = buildMajorStats(details);
  const profileName = basic.character_name || characterName;
  const fallbackOverallRanking = parseNumericValue(basic.ranking ?? stat.ranking);
  const guildTab = buildGuildTab(details, profileName, worldNameCanonical);
  const equipmentTab = buildEquipmentTab(details, fallbackList);
  const unionTab = buildUnionTab(details, fallbackList);
  const androidTab = buildAndroidTab(details, fallbackList);
  const jewelSymbolVmatrixTab = buildJewelSymbolVmatrixTab(details, fallbackList);
  const hexamatrixTab = buildHexamatrixTab(details);
  const hyperStatTab = buildHyperStatTab(details, fallbackList);
  const skillLinkTab = buildSkillLinkTab(details, fallbackList);
  const presetFallbackUsed = [
    equipmentTab?.fallbackUsed,
    unionTab?.fallbackUsed,
    androidTab?.fallbackUsed,
    jewelSymbolVmatrixTab?.fallbackUsed,
    hyperStatTab?.fallbackUsed,
    skillLinkTab?.fallbackUsed
  ].some(Boolean);

  const profile = {
    name: profileName,
    jobName: basic.character_job_name || "",
    className: basic.character_class || "-",
    level: basic.character_level || "-",
    imageUrl: basic.character_image || basic.character_icon || "",
    guildName: guild.guild_name || basic.guild_name || "-",
    guildMarkIcon: guildTab?.summary?.guildMarkIcon || "",
    expText,
    expRate: expRateValue,
    currentExp: parseNumericValue(expRaw),
    ranking: basic.ranking || stat.ranking || "-",
    overallRanking: overallRankingResult?.ranking ?? fallbackOverallRanking ?? null,
    overallRankingText:
      overallRankingResult?.ranking !== null && overallRankingResult?.ranking !== undefined
        ? `\uC804\uCCB4\uB7AD\uD0B9 - ${Number(overallRankingResult.ranking).toLocaleString("ko-KR")}\uC704`
        : fallbackOverallRanking !== null
          ? `\uC804\uCCB4\uB7AD\uD0B9 - ${Number(fallbackOverallRanking).toLocaleString("ko-KR")}\uC704`
        : "\uC804\uCCB4\uB7AD\uD0B9 - -",
    majorStats,
    majorStatOrder: resolveMajorStatOrderByClassName(basic.character_job_name || basic.character_class || "")
  };

  return {
    ok: true,
    query: {
      characterName,
      worldNameInput,
      worldNameCanonical
    },
    ocid,
    profile,
    tabs: {
      equipment: equipmentTab,
      exp: {
        currentExp: parseNumericValue(expRaw),
        currentExpRate: parseNumericValue(expRateRaw),
        currentLevel: parseNumericValue(basic.character_level ?? stat.character_level),
        expText: expText || "-"
      },
      jewelSymbolVmatrix: jewelSymbolVmatrixTab,
      hexamatrix: hexamatrixTab,
      hyperStat: hyperStatTab,
      skillLink: skillLinkTab,
      android: androidTab,
      guild: guildTab,
      union: unionTab
    },
    meta: {
      dataTimestamp: new Date().toISOString(),
      presetFallbackUsed
    }
  };
}

async function getCharacterId(req, res) {
  if (!env.nexonApiKey) {
    return res.status(500).json(buildApiKeyError());
  }

  const parsed = parseCharacterQuery(req, res);
  if (!parsed) {
    return;
  }

  const { characterName, worldNameInput, worldNameCanonical, nexonWorldName } = parsed;

  try {
    const result = await resolveOcid(characterName, worldNameCanonical, nexonWorldName);

    return res.json({
      ok: true,
      endpoint: result.endpoint,
      query: buildQueryPayload(characterName, worldNameInput, worldNameCanonical),
      data: result.data
    });
  } catch (error) {
    const { statusCode, errorBody, endpoint } = getErrorInfo(error);

    return res.status(statusCode).json({
      ok: false,
      endpoint,
      query: buildQueryPayload(characterName, worldNameInput, worldNameCanonical),
      error: errorBody
    });
  }
}

async function getAllCharacterDetails(req, res) {
  if (!env.nexonApiKey) {
    return res.status(500).json(buildApiKeyError());
  }

  const parsed = parseCharacterQuery(req, res);
  if (!parsed) {
    return;
  }

  const { characterName, worldNameInput, worldNameCanonical, nexonWorldName } = parsed;

  try {
    const ocidResult = await resolveOcid(characterName, worldNameCanonical, nexonWorldName, { shouldLog: false });
    const ocid = ocidResult?.data?.ocid;

    if (!ocid) {
      await saveAggregatedCharacterLog({
        characterName,
        worldNameCanonical,
        ocid: "",
        statusCode: 502,
        success: false,
        responseBody: {
          mode: "all",
          query: buildQueryPayload(characterName, worldNameInput, worldNameCanonical),
          message: "OCID was not returned from Nexon API",
          ocidResult: ocidResult.data
        }
      });

      return res.status(502).json({
        ok: false,
        message: "OCID was not returned from Nexon API",
        endpoint: ocidResult.endpoint,
        query: buildQueryPayload(characterName, worldNameInput, worldNameCanonical),
        data: ocidResult.data
      });
    }

    const { details, summary } = await fetchCharacterDetails({
      characterName,
      worldNameCanonical,
      ocid,
      shouldLog: false
    });

    const responsePayload = {
      ok: true,
      query: buildQueryPayload(characterName, worldNameInput, worldNameCanonical),
      ocid,
      summary,
      details
    };

    await saveAggregatedCharacterLog({
      characterName,
      worldNameCanonical,
      ocid,
      statusCode: 200,
      success: summary.failureCount === 0,
      responseBody: {
        mode: "all",
        ...responsePayload
      }
    });

    return res.json(responsePayload);
  } catch (error) {
    const { statusCode, errorBody, endpoint } = getErrorInfo(error);

    await saveAggregatedCharacterLog({
      characterName,
      worldNameCanonical,
      ocid: "",
      statusCode,
      success: false,
      responseBody: {
        mode: "all",
        query: buildQueryPayload(characterName, worldNameInput, worldNameCanonical),
        endpoint,
        error: errorBody
      }
    });

    return res.status(statusCode).json({
      ok: false,
      endpoint,
      query: buildQueryPayload(characterName, worldNameInput, worldNameCanonical),
      error: errorBody
    });
  }
}

async function getCharacterPageData(req, res) {
  if (!env.nexonApiKey) {
    return res.status(500).json(buildApiKeyError());
  }

  const parsed = parseCharacterQuery(req, res);
  if (!parsed) {
    return;
  }

  const { characterName, worldNameInput, worldNameCanonical, nexonWorldName } = parsed;
  const mongoConnected = isMongoConnected();

  try {
    const ocidResult = await resolveOcid(characterName, worldNameCanonical, nexonWorldName, { shouldLog: false });
    const ocid = ocidResult?.data?.ocid;

    if (!ocid) {
      await saveAggregatedCharacterLog({
        characterName,
        worldNameCanonical,
        ocid: "",
        statusCode: 502,
        success: false,
        responseBody: {
          mode: "page-data",
          query: buildQueryPayload(characterName, worldNameInput, worldNameCanonical),
          message: "OCID was not returned from Nexon API",
          ocidResult: ocidResult.data
        }
      });

      return res.status(502).json({
        ok: false,
        message: "OCID was not returned from Nexon API",
        endpoint: ocidResult.endpoint,
        query: buildQueryPayload(characterName, worldNameInput, worldNameCanonical),
        data: ocidResult.data
      });
    }

    const { details } = await fetchCharacterDetails({
      characterName,
      worldNameCanonical,
      ocid,
      shouldLog: false
    });

    const historyAvailable = await hasExpHistory(ocid);
    const fallbackDetails = await loadRecentPageDataDetailsByOcid(ocid, presetFallbackLookbackLimit);
    const overallRankingResult = await resolveLatestOverallRankingByOcid(ocid, { days: 7 });

    const pageData = buildPageData({
      characterName,
      worldNameInput,
      worldNameCanonical,
      ocid,
      details,
      fallbackDetails,
      overallRankingResult
    });

    pageData.meta.historyAvailable = historyAvailable;
    pageData.meta.mongoConnected = mongoConnected;

    const aggregateSaved = await saveAggregatedCharacterLog({
      characterName,
      worldNameCanonical,
      ocid,
      statusCode: 200,
      success: true,
      responseBody: {
        mode: "page-data",
        query: pageData.query,
        ocid,
        details
      }
    });
    pageData.meta.aggregateSaved = aggregateSaved;

    return res.json(pageData);
  } catch (error) {
    const { statusCode, errorBody, endpoint } = getErrorInfo(error);

    await saveAggregatedCharacterLog({
      characterName,
      worldNameCanonical,
      ocid: "",
      statusCode,
      success: false,
      responseBody: {
        mode: "page-data",
        query: buildQueryPayload(characterName, worldNameInput, worldNameCanonical),
        endpoint,
        error: errorBody
      }
    });

    return res.status(statusCode).json({
      ok: false,
      endpoint,
      query: buildQueryPayload(characterName, worldNameInput, worldNameCanonical),
      error: errorBody
    });
  }
}

async function getCharacterExpHistory(req, res) {
  const ocid = String(req.query.ocid || "").trim();
  const limitRaw = Number(req.query.limit || 30);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 30;

  if (!ocid) {
    return res.status(400).json({
      ok: false,
      message: "ocid is required"
    });
  }

  if (!isMongoConnected()) {
    return res.json({
      ok: true,
      ocid,
      points: [],
      historyAvailable: false
    });
  }

  const startedAt = Date.now();
  const pointsDescending = [];
  let cursorCreatedAt = null;
  let scannedDocs = 0;
  let batchCount = 0;
  let hintEnabled = true;
  let hintFallbackUsed = false;

  try {
    while (pointsDescending.length < limit && batchCount < expHistoryMaxBatchCount) {
      batchCount += 1;
      const remaining = limit - pointsDescending.length;
      const batchLimit = Math.max(expHistoryBatchSize, remaining * 2);

      let docs = [];
      try {
        docs = await fetchExpHistoryLogBatch({
          ocid,
          beforeCreatedAt: cursorCreatedAt,
          batchLimit,
          useHint: hintEnabled
        });
      } catch (error) {
        if (hintEnabled && isHintNotUsableError(error)) {
          hintEnabled = false;
          hintFallbackUsed = true;
          docs = await fetchExpHistoryLogBatch({
            ocid,
            beforeCreatedAt: cursorCreatedAt,
            batchLimit,
            useHint: false
          });
        } else {
          throw error;
        }
      }

      if (!docs.length) {
        break;
      }

      scannedDocs += docs.length;

      docs.forEach((doc) => {
        if (pointsDescending.length >= limit) {
          return;
        }

        const expInfo = extractExpInfoFromLog(doc.responseBody);
        if (!expInfo) {
          return;
        }

        const createdAt = normalizeCreatedAtForCursor(doc.createdAt);
        if (!createdAt) {
          return;
        }

        const exp = parseNumericValue(expInfo.exp);
        const expRate = parseNumericValue(expInfo.expRate);
        const level = parseNumericValue(expInfo.level);
        if (exp === null && expRate === null && level === null) {
          return;
        }

        pointsDescending.push({
          ts: createdAt.toISOString(),
          exp,
          expRate,
          level
        });
      });

      const lastCreatedAt = normalizeCreatedAtForCursor(docs[docs.length - 1]?.createdAt);
      if (!lastCreatedAt) {
        break;
      }
      cursorCreatedAt = lastCreatedAt;

      if (docs.length < batchLimit) {
        break;
      }
    }

    const points = pointsDescending.slice(0, limit).reverse();
    const dailySnapshotMap = new Map();
    points.forEach((point) => {
      const dateKst = toKstDateText(point.ts);
      if (!dateKst) {
        return;
      }

      const candidateTime = toKstDateTimeKey(point.ts);
      const current = dailySnapshotMap.get(dateKst);
      if (!current || candidateTime > current.kstDateTimeKey) {
        dailySnapshotMap.set(dateKst, {
          dateKst,
          ts: point.ts,
          exp: point.exp,
          expRate: point.expRate,
          level: point.level,
          kstDateTimeKey: candidateTime
        });
      }
    });

    const dailySnapshots = [...dailySnapshotMap.values()]
      .sort((left, right) => left.dateKst.localeCompare(right.dateKst))
      .map(({ dateKst, ts, exp, expRate, level }) => ({
        dateKst,
        ts,
        exp,
        expRate,
        level
      }));

    const durationMs = Date.now() - startedAt;
    console.info(
      `[ExpHistory] ok ocid=${ocid} limit=${limit} batches=${batchCount} scanned=${scannedDocs} points=${points.length} durationMs=${durationMs} hint=${hintEnabled ? "on" : "off"} hintFallback=${hintFallbackUsed ? "yes" : "no"}`
    );

    return res.json({
      ok: true,
      ocid,
      points,
      dailySnapshots,
      historyAvailable: points.length > 0
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error(
      `[ExpHistory] failed ocid=${ocid} limit=${limit} batches=${batchCount} scanned=${scannedDocs} durationMs=${durationMs}`,
      error
    );

    return res.status(500).json({
      ok: false,
      message: "경험치 히스토리 조회 중 오류가 발생했습니다."
    });
  }
}

async function getCharacterLogStatus(req, res) {
  const ocid = String(req.query.ocid || "").trim();

  if (!ocid) {
    return res.status(400).json({
      ok: false,
      message: "ocid is required"
    });
  }

  if (!isMongoConnected()) {
    return res.json({
      ok: true,
      ocid,
      mongoConnected: false,
      latestAggregateLogAt: null,
      hasUnion: false,
      hasGuild: false,
      hasAndroid: false,
      aggregateCount: 0
    });
  }

  const filter = {
    ocid,
    endpoint: aggregateLogEndpoint,
    "responseBody.mode": "page-data"
  };

  const [latestLog, aggregateCount] = await Promise.all([
    RequestLog.findOne(filter)
      .sort({ createdAt: -1 })
      .select({ createdAt: 1, responseBody: 1, _id: 0 })
      .lean(),
    RequestLog.countDocuments(filter)
  ]);

  const latestDetails = latestLog?.responseBody?.details || {};
  const hasUnion = Boolean(latestDetails?.union || latestDetails?.unionRaider);
  const hasGuild = Boolean(latestDetails?.guild || latestDetails?.guildId || latestDetails?.guildBasic);
  const hasAndroid = Boolean(latestDetails?.androidEquipment);

  return res.json({
    ok: true,
    ocid,
    mongoConnected: true,
    latestAggregateLogAt: latestLog?.createdAt ? toIsoString(latestLog.createdAt) : null,
    hasUnion,
    hasGuild,
    hasAndroid,
    aggregateCount
  });
}

async function getCharacterByOcidController(req, res, endpointPath, fetchByOcid) {
  const { ocid } = req.query;

  if (!env.nexonApiKey) {
    return res.status(500).json(buildApiKeyError());
  }

  if (!ocid) {
    return res.status(400).json({
      ok: false,
      message: "ocid is required"
    });
  }

  try {
    const result = fetchByOcid ? await fetchByOcid(ocid) : await getCharacterByOcid(endpointPath, ocid);

    await saveRequestLog({
      ocid,
      endpoint: result.endpoint,
      statusCode: result.statusCode,
      success: true,
      responseBody: result.data
    });

    return res.json({
      ok: true,
      endpoint: result.endpoint,
      query: { ocid },
      data: result.data
    });
  } catch (error) {
    const { statusCode, errorBody, endpoint } = getErrorInfo(error, endpointPath);

    await saveRequestLog({
      ocid,
      endpoint,
      statusCode,
      success: false,
      responseBody: errorBody
    });

    return res.status(statusCode).json({
      ok: false,
      endpoint,
      query: { ocid },
      error: errorBody
    });
  }
}

async function getCharacterBasic(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/basic");
}

async function getCharacterStat(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/stat");
}

async function getCharacterHyperStat(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/hyper-stat");
}

async function getCharacterGuild(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/guild");
}

async function getUserUnionController(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/user/union", getUserUnion);
}

async function getUserUnionRaiderController(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/user/union-raider", getUserUnionRaider);
}

async function getGuildIdController(req, res) {
  if (!env.nexonApiKey) {
    return res.status(500).json(buildApiKeyError());
  }

  const parsed = parseGuildQuery(req, res);
  if (!parsed) {
    return;
  }

  const { guildName, worldNameInput, worldNameCanonical } = parsed;

  try {
    const result = await getGuildIdByName(guildName, worldNameCanonical);

    await saveRequestLog({
      worldName: worldNameCanonical,
      endpoint: result.endpoint,
      statusCode: result.statusCode,
      success: true,
      responseBody: result.data
    });

    return res.json({
      ok: true,
      endpoint: result.endpoint,
      query: {
        guildName,
        worldNameInput,
        worldNameCanonical
      },
      data: result.data
    });
  } catch (error) {
    const { statusCode, errorBody, endpoint } = getErrorInfo(error, "/maplestorym/v1/guild/id");

    await saveRequestLog({
      worldName: worldNameCanonical,
      endpoint,
      statusCode,
      success: false,
      responseBody: errorBody
    });

    return res.status(statusCode).json({
      ok: false,
      endpoint,
      query: {
        guildName,
        worldNameInput,
        worldNameCanonical
      },
      error: errorBody
    });
  }
}

async function getGuildBasicController(req, res) {
  const oguildId = String(req.query.oguild_id || "").trim();

  if (!env.nexonApiKey) {
    return res.status(500).json(buildApiKeyError());
  }

  if (!oguildId) {
    return res.status(400).json({
      ok: false,
      message: "oguild_id is required"
    });
  }

  try {
    const result = await getGuildBasicById(oguildId);

    await saveRequestLog({
      endpoint: result.endpoint,
      statusCode: result.statusCode,
      success: true,
      responseBody: result.data
    });

    return res.json({
      ok: true,
      endpoint: result.endpoint,
      query: { oguild_id: oguildId },
      data: result.data
    });
  } catch (error) {
    const { statusCode, errorBody, endpoint } = getErrorInfo(error, "/maplestorym/v1/guild/basic");

    await saveRequestLog({
      endpoint,
      statusCode,
      success: false,
      responseBody: errorBody
    });

    return res.status(statusCode).json({
      ok: false,
      endpoint,
      query: { oguild_id: oguildId },
      error: errorBody
    });
  }
}

async function getCharacterItemEquipment(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/item-equipment");
}

async function getCharacterCashItemEquipment(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/cashitem-equipment");
}

async function getCharacterSymbol(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/symbol");
}

async function getCharacterSetEffect(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/set-effect");
}

async function getCharacterAndroidEquipment(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/android-equipment");
}

async function getCharacterJewel(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/jewel");
}

async function getCharacterBeautyEquipment(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/beauty-equipment");
}

async function getCharacterPetEquipment(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/pet-equipment");
}

async function getCharacterSkillEquipment(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/skill-equipment");
}

async function getCharacterLinkSkill(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/link-skill");
}

async function getCharacterVmatrix(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/vmatrix");
}

async function getCharacterHexamatrixSkill(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/hexamatrix-skill");
}

async function getCharacterHexamatrixStat(req, res) {
  return getCharacterByOcidController(req, res, "/maplestorym/v1/character/hexamatrix-stat");
}

async function getRankingController(req, res, endpointPath, fetchRanking) {
  if (!env.nexonApiKey) {
    return res.status(500).json(buildApiKeyError());
  }

  const parsed = parseRankingQuery(req, res);
  if (!parsed) {
    return;
  }

  try {
    const result = await fetchRanking(parsed.params);

    await saveRequestLog({
      worldName: parsed.worldNameCanonical,
      ocid: parsed.ocid,
      endpoint: result.endpoint,
      statusCode: result.statusCode,
      success: true,
      responseBody: result.data
    });

    return res.json({
      ok: true,
      endpoint: result.endpoint,
      query: parsed.query,
      data: result.data
    });
  } catch (error) {
    const { statusCode, errorBody, endpoint } = getErrorInfo(error, endpointPath);

    await saveRequestLog({
      worldName: parsed.worldNameCanonical,
      ocid: parsed.ocid,
      endpoint,
      statusCode,
      success: false,
      responseBody: errorBody
    });

    return res.status(statusCode).json({
      ok: false,
      endpoint,
      query: parsed.query,
      error: errorBody
    });
  }
}

async function getRankingLevelController(req, res) {
  return getRankingController(req, res, "/maplestorym/v1/ranking/level", getRankingLevel);
}

async function getRankingUnionController(req, res) {
  return getRankingController(req, res, "/maplestorym/v1/ranking/union", getRankingUnion);
}

async function getRankingAchievementController(req, res) {
  return getRankingController(req, res, "/maplestorym/v1/ranking/achievement", getRankingAchievement);
}

async function getRankingSharenianBattlefieldController(req, res) {
  return getRankingController(
    req,
    res,
    "/maplestorym/v1/ranking/sharenian-battlefield",
    getRankingSharenianBattlefield
  );
}

async function getRankingSharenianWaterwayController(req, res) {
  return getRankingController(req, res, "/maplestorym/v1/ranking/sharenian-waterway", getRankingSharenianWaterway);
}

async function getRankingRootOfTimeController(req, res) {
  return getRankingController(req, res, "/maplestorym/v1/ranking/root-of-time", getRankingRootOfTime);
}

module.exports = {
  getCharacterId,
  getAllCharacterDetails,
  getCharacterPageData,
  getCharacterExpHistory,
  getCharacterLogStatus,
  getCharacterBasic,
  getCharacterStat,
  getCharacterHyperStat,
  getCharacterGuild,
  getUserUnionController,
  getUserUnionRaiderController,
  getGuildIdController,
  getGuildBasicController,
  getCharacterItemEquipment,
  getCharacterCashItemEquipment,
  getCharacterSymbol,
  getCharacterSetEffect,
  getCharacterAndroidEquipment,
  getCharacterJewel,
  getCharacterBeautyEquipment,
  getCharacterPetEquipment,
  getCharacterSkillEquipment,
  getCharacterLinkSkill,
  getCharacterVmatrix,
  getCharacterHexamatrixSkill,
  getCharacterHexamatrixStat,
  getRankingLevelController,
  getRankingUnionController,
  getRankingAchievementController,
  getRankingSharenianBattlefieldController,
  getRankingSharenianWaterwayController,
  getRankingRootOfTimeController
};
