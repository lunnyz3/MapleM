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

const detailRequestIntervalMs = 220;
const aggregateLogEndpoint = `${env.nexonBaseUrl}/maplestorym/v1/character/all`;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  for (const { key, path } of ocidDetailEndpoints) {
    if (settledDetails.length > 0) {
      await sleep(detailRequestIntervalMs);
    }

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

      settledDetails.push({
        key,
        ok: true,
        statusCode: result.statusCode,
        endpoint: result.endpoint,
        data: result.data
      });
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

      settledDetails.push({
        key,
        ok: false,
        statusCode,
        endpoint,
        error: errorBody
      });
    }
  }

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
    if (settledDetails.length > 0) {
      await sleep(detailRequestIntervalMs);
    }

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
      await sleep(detailRequestIntervalMs);

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
  await saveRequestLog({
    characterName,
    worldName: worldNameCanonical,
    ocid,
    endpoint: aggregateLogEndpoint,
    statusCode,
    success,
    responseBody
  });
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

  if (responseBody.character_exp !== undefined || responseBody.character_exp_rate !== undefined) {
    return {
      exp: responseBody.character_exp,
      expRate: responseBody.character_exp_rate
    };
  }

  if (responseBody.details?.basic?.data) {
    return {
      exp: responseBody.details.basic.data.character_exp,
      expRate: responseBody.details.basic.data.character_exp_rate
    };
  }

  if (responseBody.details?.stat?.data) {
    return {
      exp: responseBody.details.stat.data.character_exp,
      expRate: responseBody.details.stat.data.character_exp_rate
    };
  }

  if (responseBody.tabs?.exp) {
    const basicData = responseBody.tabs.exp.basic?.data || {};
    const statData = responseBody.tabs.exp.stat?.data || {};
    return {
      exp: basicData.character_exp ?? statData.character_exp ?? responseBody.tabs.exp.currentExp,
      expRate: basicData.character_exp_rate ?? statData.character_exp_rate ?? responseBody.tabs.exp.currentExpRate
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

  return {
    characterGuild: details.guild,
    guildId: details.guildId,
    guildBasic: details.guildBasic,
    guildSummary: {
      guildName: guildBasicData.guild_name || characterGuildData.guild_name || "-",
      worldName: guildBasicData.world_name || worldNameCanonical || "-",
      guildLevel: guildBasicData.guild_level ?? "-",
      guildCreateDate: guildBasicData.guild_create_date || guildBasicData.world_create_date || "-",
      guildMarkIcon: guildBasicData.guild_mark_icon || "",
      guildMasterName: guildBasicData.guild_master_name || "-",
      guildMemberCount: guildBasicData.guild_member_count ?? "-",
      oguildId: guildIdData.oguild_id || ""
    },
    memberSelf
  };
}

function buildUnionTab(details) {
  const unionData = details?.union?.data || {};
  const unionRaiderData = details?.unionRaider?.data || {};

  return {
    union: details.union,
    unionRaider: details.unionRaider,
    unionSummary: {
      unionLevel: unionData.union_level ?? "-",
      unionGrade: unionData.union_grade || "-",
      unionLevelTotalOption: unionData.union_level_total_option || "-",
      usePresetNo: unionRaiderData.use_preset_no ?? "-",
      occupiedOptionCount: Array.isArray(unionRaiderData.use_union_occupied_option) ? unionRaiderData.use_union_occupied_option.length : 0,
      raiderOptionCount: Array.isArray(unionRaiderData.use_union_raider_option) ? unionRaiderData.use_union_raider_option.length : 0
    }
  };
}

function buildAndroidTab(details) {
  const androidEndpoint = details?.androidEquipment;
  const androidData = androidEndpoint?.data || {};
  const activePreset = resolveActiveAndroidPreset(androidData);
  const activeAndroidEquipment = androidData.android_equipment || activePreset?.android_equipment || {};
  const activeHeartEquipment = resolveActiveAndroidHeartEquipment(androidData) || {};

  return {
    androidEquipment: androidEndpoint,
    usePresetNo: androidData.use_preset_no ?? activePreset?.preset_no ?? "-",
    active: {
      androidEquipment: activeAndroidEquipment,
      heartEquipment: activeHeartEquipment
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

function buildPageData({ characterName, worldNameInput, worldNameCanonical, ocid, details }) {
  const basic = details?.basic?.data || {};
  const stat = details?.stat?.data || {};
  const guild = details?.guild?.data || {};

  const expRaw = basic.character_exp ?? stat.character_exp;
  const expRateRaw = basic.character_exp_rate ?? stat.character_exp_rate;
  const expText = expRateRaw || expRaw || "-";
  const majorStats = buildMajorStats(details);
  const profileName = basic.character_name || characterName;
  const guildTab = buildGuildTab(details, profileName, worldNameCanonical);
  const unionTab = buildUnionTab(details);
  const androidTab = buildAndroidTab(details);

  const profile = {
    name: profileName,
    className: basic.character_class || "-",
    level: basic.character_level || "-",
    imageUrl: basic.character_image || basic.character_icon || "",
    guildName: guild.guild_name || basic.guild_name || "-",
    expText,
    ranking: basic.ranking || stat.ranking || "-",
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
      equipment: {
        itemEquipment: details.itemEquipment,
        cashitemEquipment: details.cashitemEquipment,
        setEffect: details.setEffect,
        androidEquipment: details.androidEquipment,
        petEquipment: details.petEquipment,
        beautyEquipment: details.beautyEquipment
      },
      exp: {
        stat: details.stat,
        basic: details.basic,
        currentExp: parseNumericValue(expRaw),
        currentExpRate: parseNumericValue(expRateRaw)
      },
      jewelSymbolVmatrix: {
        jewel: details.jewel,
        symbol: details.symbol,
        vmatrix: details.vmatrix
      },
      hexamatrix: {
        skill: details.hexamatrixSkill,
        stat: details.hexamatrixStat
      },
      hyperStat: details.hyperStat,
      skillLink: {
        skillEquipment: details.skillEquipment,
        linkSkill: details.linkSkill
      },
      android: androidTab,
      guild: guildTab,
      union: unionTab
    },
    meta: {
      dataTimestamp: new Date().toISOString()
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

    const pageData = buildPageData({
      characterName,
      worldNameInput,
      worldNameCanonical,
      ocid,
      details
    });

    pageData.meta.historyAvailable = historyAvailable;

    await saveAggregatedCharacterLog({
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

  if (mongoose.connection.readyState !== 1) {
    return res.json({
      ok: true,
      ocid,
      points: [],
      historyAvailable: false
    });
  }

  const docs = await RequestLog.find(buildExpHistoryFilter(ocid))
    .sort({ createdAt: -1 })
    .limit(limit)
    .select({ createdAt: 1, responseBody: 1, _id: 0 })
    .lean();

  const points = docs
    .map((doc) => {
      const expInfo = extractExpInfoFromLog(doc.responseBody);
      if (!expInfo) {
        return null;
      }

      const exp = parseNumericValue(expInfo.exp);
      const expRate = parseNumericValue(expInfo.expRate);
      const ts = doc.createdAt instanceof Date ? doc.createdAt.toISOString() : new Date(doc.createdAt).toISOString();

      return {
        ts,
        exp,
        expRate
      };
    })
    .filter(Boolean)
    .filter((point) => point.exp !== null || point.expRate !== null)
    .reverse();

  return res.json({
    ok: true,
    ocid,
    points,
    historyAvailable: points.length > 0
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

module.exports = {
  getCharacterId,
  getAllCharacterDetails,
  getCharacterPageData,
  getCharacterExpHistory,
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
  getCharacterHexamatrixStat
};
