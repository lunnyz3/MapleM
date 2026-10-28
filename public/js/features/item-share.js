import {
  magicalJobNames,
  normalizeForMatch,
  parseNumericValue,
  physicalJobNames,
  toArray,
} from "../core/common.js";

const DEFAULT_TOP_PERCENT_CAPTION = "-";
const TOP_PERCENT_DECIMAL_PLACES = 6;
const LINE_BUCKET_KEYS = Object.freeze(["first", "second", "third"]);

const OPTION_KIND = Object.freeze({
  PHYSICAL_DAMAGE: "physicalDamage",
  MAGICAL_DAMAGE: "magicalDamage",
  MAX_HP: "maxHp",
  MESO_GAIN: "mesoGain",
  ITEM_DROP: "itemDrop",
  EXP_GAIN: "expGain",
  BOSS_ATTACK: "bossAttack",
});

const SLOT_KIND = Object.freeze({
  WEAPON: "weapon",
  SUB_WEAPON: "subWeapon",
  EMBLEM: "emblem",
  OVERALL: "overall",
  UPPER: "upper",
  PANTS: "pants",
  HAT: "hat",
  GLOVES: "gloves",
  SHOES: "shoes",
  SHOULDER: "shoulder",
  CAPE: "cape",
  BELT: "belt",
});

const LABEL = Object.freeze({
  WEAPON: "\uBB34\uAE30",
  SUB_WEAPON: "\uBCF4\uC870\uBB34\uAE30",
  EMBLEM: "\uC5E0\uBE14\uB818",
  OVERALL: "\uD55C\uBC8C\uC637",
  UPPER: "\uC0C1\uC758",
  PANTS: "\uD558\uC758",
  HAT: "\uBAA8\uC790",
  GLOVES: "\uC7A5\uAC11",
  SHOES: "\uC2E0\uBC1C",
  SHOULDER: "\uC5B4\uAE68",
  CAPE: "\uB9DD\uD1A0",
  BELT: "\uBCA8\uD2B8",
  PHYSICAL_DAMAGE: "\uBB3C\uB9AC \uB300\uBBF8\uC9C0",
  MAGICAL_DAMAGE: "\uB9C8\uBC95 \uB300\uBBF8\uC9C0",
  BOSS_ATTACK: "\uBCF4\uC2A4 \uACF5\uACA9\uB825",
  MAX_HP: "\uCD5C\uB300 HP",
  MESO_GAIN: "\uBA54\uC18C \uD68D\uB4DD\uB7C9",
  ITEM_DROP: "\uC544\uC774\uD15C \uB4DC\uB78D\uB960",
  EXP_GAIN: "\uACBD\uD5D8\uCE58 \uD68D\uB4DD\uB7C9",
});

const SLOT_PROBABILITY_CONFIG = Object.freeze({
  [SLOT_KIND.WEAPON]: {
    potentialFile: "weapon_potential_prob.json",
    additionalFile: "weapon_additional_potential_prob.json",
    keyLabel: LABEL.WEAPON,
  },
  [SLOT_KIND.SUB_WEAPON]: {
    potentialFile: "assistanceweapon_potential_prob.json",
    additionalFile: "assistanceweapon_additional_potential_prob.json",
    keyLabel: LABEL.SUB_WEAPON,
  },
  [SLOT_KIND.EMBLEM]: {
    potentialFile: "emblem_potential_prob.json",
    additionalFile: "emblem_additional_potential_prob.json",
    keyLabel: LABEL.EMBLEM,
  },
  [SLOT_KIND.OVERALL]: {
    potentialFile: "clothes_potential_prob.json",
    additionalFile: "clothes_additional_potential_prob.json",
    keyLabel: LABEL.OVERALL,
  },
  [SLOT_KIND.UPPER]: {
    potentialFile: "upper_potential_prob.json",
    additionalFile: "upper_additional_potential_prob.json",
    keyLabel: LABEL.UPPER,
  },
  [SLOT_KIND.PANTS]: {
    potentialFile: "pants_potential_prob.json",
    additionalFile: "pants_additional_potential_prob.json",
    keyLabel: LABEL.PANTS,
  },
  [SLOT_KIND.HAT]: {
    potentialFile: "hat_potential_prob.json",
    additionalFile: "hat_additional_potential_prob.json",
    keyLabel: LABEL.HAT,
  },
  [SLOT_KIND.GLOVES]: {
    potentialFile: "gloves_potential_prob.json",
    additionalFile: "gloves_additional_potential_prob.json",
    keyLabel: LABEL.GLOVES,
  },
  [SLOT_KIND.SHOES]: {
    potentialFile: "shoes_potential_prob.json",
    additionalFile: "shoes_additional_potential_prob.json",
    keyLabel: LABEL.SHOES,
  },
  [SLOT_KIND.SHOULDER]: {
    potentialFile: "shoulder_potential_prob.json",
    additionalFile: "shoulder_additional_potential_prob.json",
    keyLabel: LABEL.SHOULDER,
  },
  [SLOT_KIND.CAPE]: {
    potentialFile: "cape_potential_prob.json",
    additionalFile: "cape_additional_potential_prob.json",
    keyLabel: LABEL.CAPE,
  },
  [SLOT_KIND.BELT]: {
    potentialFile: "belt_potential_prob.json",
    additionalFile: "belt_additional_potential_prob.json",
    keyLabel: LABEL.BELT,
  },
});

// Official table-selection exceptions (m.nexon.com/probability cube pages, checked 2026-10-28).
// - "제네시스 무기는 장비 레벨 200에 해당하는 잠재능력이 부여됩니다." (weapon potential and additional pages)
// - "일부 장비는 아래 잠재옵션 범위에 해당하는 잠재옵션 수치로 적용됩니다." (potential pages; the table is copied
//   into _meta.level_exceptions of public/probability/*_potential_prob.json, and test/probability.test.js
//   checks that this list matches it)
// The official table names equipment sets only, so a rule applies only when namePattern can tell the set
// from the item name. Rules without a pattern keep the nearest-level table (see docs/research/probability-sync.md).
const TABLE_LEVEL_EXCEPTIONS = Object.freeze([
  {
    equipment: "제네시스 무기",
    namePattern: /^제네시스\s/, // 제네시스 <무기>
    slots: [LABEL.WEAPON],
    sources: ["potential", "additional"],
    level: 200,
  },
  {
    equipment: "1주년 세인트 장비",
    namePattern: null,
    sources: ["potential"],
    level: 40,
  },
  {
    equipment: "2주년 화이트 장비",
    namePattern: null,
    sources: ["potential"],
    level: 100,
    levelBySlot: { [LABEL.CAPE]: 90 },
  },
  {
    equipment: "2주년 블랙 장비",
    namePattern: null,
    sources: ["potential"],
    level: 120,
  },
  {
    equipment: "3주년 화이트 장비",
    namePattern: null,
    sources: ["potential"],
    level: 100,
    levelBySlot: { [LABEL.CAPE]: 90 },
  },
  {
    equipment: "3주년 블랙 장비",
    namePattern: null,
    sources: ["potential"],
    level: 120,
  },
  {
    equipment: "5주년 블랙 장비",
    namePattern: null,
    sources: ["potential"],
    level: 120,
  },
  {
    equipment: "노바 디멘션 장비",
    // e.g. 노바 리카온 숄더 (Lv.110): its potential values exist only in the 어깨 100 table.
    namePattern: /^노바\s/,
    sources: ["potential"],
    level: null,
    levelBySlot: { [LABEL.SHOES]: 100, [LABEL.SHOULDER]: 100, [LABEL.CAPE]: 120 },
  },
  {
    equipment: "시그너스 여제 장비",
    namePattern: null,
    sources: ["potential"],
    level: 140,
  },
  {
    equipment: "루타비스 장비",
    // 파프니르(무기), 하이네스(모자), 이글아이(상의), 트릭스터(하의)
    namePattern: /^(파프니르|하이네스|이글아이|트릭스터)\s/,
    sources: ["potential"],
    level: 160,
  },
  {
    equipment: "네크로 장비 (모두의 성장 지원 시즌 3)",
    namePattern: null, // season 3 and 4 share the "네크로" name prefix
    sources: ["potential"],
    level: 60,
  },
  {
    equipment: "네크로 장비 (모두의 성장 지원 시즌 4)",
    namePattern: null,
    sources: ["potential"],
    level: 80,
  },
  {
    equipment: "아가레스, 엘리고스, 이포스, 헬파스, 베파르 장비 (프리미엄 성장 지원 시즌 3, 4)",
    namePattern: /^(아가레스|엘리고스|이포스|헬파스|베파르)/,
    sources: ["potential"],
    level: 160,
  },
]);

const probabilityTableCache = new Map();

function buildItemShareFileName(itemName, mode = "share") {
  const normalizedMode = String(mode || "share").trim().toLowerCase() || "share";
  const safeMode = normalizedMode.replace(/[^a-z0-9_-]+/g, "");
  const safeItemName = String(itemName || "item")
    .trim()
    .replace(/[^\w\uAC00-\uD7AF-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = safeItemName || "item";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `maplem-${safeMode}-${suffix}-${stamp}.png`;
}

function normalizeTopPercentValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const bounded = Math.max(0, Math.min(100, numeric));
  return Number(bounded.toFixed(TOP_PERCENT_DECIMAL_PLACES));
}

function formatTopPercentValue(value) {
  return Number(value).toFixed(TOP_PERCENT_DECIMAL_PLACES);
}

function resolveExpectedCubeCount(probabilityFraction) {
  const numeric = Number(probabilityFraction);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.ceil(1 / numeric);
}

function formatCubeCountLabel(count) {
  if (!Number.isFinite(Number(count)) || Number(count) <= 0) {
    return "-";
  }
  return `${Number(count).toLocaleString("ko-KR")}\uAC1C`;
}

// Additional-option (flame) share as a short percent: one decimal from 1%, two significant digits below.
function formatAdditionalOptionPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }
  const bounded = Math.min(100, numeric);
  const digits = bounded >= 1 ? 1 : Math.min(12, -Math.floor(Math.log10(bounded)) + 1);
  return `${Number(bounded.toFixed(digits))}%`;
}

async function buildTopPercentCaption(item, profileContext = null) {
  const breakdown = await resolveTopPercentBreakdown(item, profileContext);
  const topPercent = normalizeTopPercentValue(breakdown?.totalPercent);
  const additionalOption = formatAdditionalOptionPercent(breakdown?.additionalOptionPercent);
  const additionalOptionLabel = additionalOption
    ? `\uCD94\uAC00 \uC635\uC158 \uC0C1\uC704 ${additionalOption}`
    : "";
  if (topPercent === null) {
    return additionalOptionLabel
      ? `${additionalOptionLabel} \uC9DC\uB9AC \uC544\uC774\uD15C\uC785\uB2C8\uB2E4!`
      : DEFAULT_TOP_PERCENT_CAPTION;
  }

  const blackCubeLabel = formatCubeCountLabel(
    resolveExpectedCubeCount(breakdown?.potentialProbability),
  );
  const additionalCubeLabel = formatCubeCountLabel(
    resolveExpectedCubeCount(breakdown?.additionalProbability),
  );
  const additionalOptionPart = additionalOptionLabel ? `, ${additionalOptionLabel}` : "";
  return `\uC0C1\uC704 ${formatTopPercentValue(topPercent)}%, \uBE14\uB799\uD050\uBE0C ${blackCubeLabel}, \uC5D0\uB514\uC154\uB110 \uD050\uBE0C ${additionalCubeLabel}${additionalOptionPart} \uC9DC\uB9AC \uC544\uC774\uD15C\uC785\uB2C8\uB2E4!`;
}

function resolveOptionKind(optionName) {
  const normalized = normalizeForMatch(optionName);
  if (!normalized) {
    return "";
  }

  if (
    normalized.includes(normalizeForMatch("\uBB3C\uB9AC\uB300\uBBF8\uC9C0")) ||
    normalized.includes(normalizeForMatch("\uBB3C\uB9AC\uB370\uBBF8\uC9C0")) ||
    normalized.includes(normalizeForMatch("\uBB3C\uB380"))
  ) {
    return OPTION_KIND.PHYSICAL_DAMAGE;
  }
  if (
    normalized.includes(normalizeForMatch("\uB9C8\uBC95\uB300\uBBF8\uC9C0")) ||
    normalized.includes(normalizeForMatch("\uB9C8\uBC95\uB370\uBBF8\uC9C0")) ||
    normalized.includes(normalizeForMatch("\uB9C8\uB380"))
  ) {
    return OPTION_KIND.MAGICAL_DAMAGE;
  }
  if (
    normalized.includes(normalizeForMatch("\uBCF4\uC2A4\uACF5\uACA9\uB825")) ||
    normalized.includes(normalizeForMatch("\uBCF4\uACF5"))
  ) {
    return OPTION_KIND.BOSS_ATTACK;
  }
  if (
    normalized.includes(normalizeForMatch("\uCD5C\uB300HP")) ||
    normalized.includes(normalizeForMatch("\uCD5C\uB300 HP")) ||
    normalized.includes(normalizeForMatch("\uCD5C\uB300\uCCB4\uB825"))
  ) {
    return OPTION_KIND.MAX_HP;
  }
  if (normalized.includes(normalizeForMatch("\uBA54\uC18C\uD68D\uB4DD\uB7C9"))) {
    return OPTION_KIND.MESO_GAIN;
  }
  if (
    normalized.includes(normalizeForMatch("\uC544\uC774\uD15C\uB4DC\uB78D\uB960")) ||
    normalized.includes(normalizeForMatch("\uC544\uC774\uD15C\uB4DC\uB86D\uB960"))
  ) {
    return OPTION_KIND.ITEM_DROP;
  }
  if (normalized.includes(normalizeForMatch("\uACBD\uD5D8\uCE58\uD68D\uB4DD\uB7C9"))) {
    return OPTION_KIND.EXP_GAIN;
  }

  return "";
}

function normalizeOptionRows(optionList) {
  return toArray(optionList)
    .map((option, index) => {
      const name = String(option?.name || option?.option_name || "").trim();
      const valueText = String(option?.value || option?.option_value || "").trim();
      const value = parseNumericValue(valueText);
      const kind = resolveOptionKind(name);
      if (!name || !kind || !Number.isFinite(value)) {
        return null;
      }
      return {
        sourceIndex: index,
        kind,
        value,
        optionGrade: String(option?.optionGrade || option?.option_grade || "").trim(),
      };
    })
    .filter(Boolean);
}

function resolveProfileJobMode(item, profileContext = null) {
  const attackType = profileContext?.attackType || item?.attackType;
  if (attackType === "magical" || attackType === "physical") {
    return attackType;
  }
  const profileClassCandidates = [
    profileContext?.className,
    profileContext?.jobName,
    item?.className,
    item?.jobName,
  ];

  if (typeof document !== "undefined") {
    const classChip = document.querySelector(".char-hero__chips .char-hero__chip");
    if (classChip?.textContent) {
      profileClassCandidates.push(classChip.textContent);
    }
  }

  for (const candidate of profileClassCandidates) {
    const normalized = normalizeForMatch(candidate);
    if (!normalized) {
      continue;
    }
    if (magicalJobNames.has(normalized)) {
      return "magical";
    }
    if (physicalJobNames.has(normalized)) {
      return "physical";
    }
  }

  return "physical";
}

function resolveProfileDamageKind(item, profileContext = null) {
  const jobMode = resolveProfileJobMode(item, profileContext);
  return jobMode === "magical"
    ? OPTION_KIND.MAGICAL_DAMAGE
    : OPTION_KIND.PHYSICAL_DAMAGE;
}

function countRowsForKinds(rows, kindList) {
  const kindSet = new Set(kindList);
  let count = 0;
  for (const row of toArray(rows)) {
    if (kindSet.has(row.kind)) {
      count += 1;
    }
  }
  return count;
}

function findFirstIndexForKinds(rows, kindList) {
  const kindSet = new Set(kindList);
  let firstIndex = Infinity;
  for (const row of toArray(rows)) {
    if (kindSet.has(row.kind)) {
      firstIndex = Math.min(firstIndex, Number(row.sourceIndex) || 0);
    }
  }
  return firstIndex;
}

function chooseKindGroupByLineCount(rows, firstKinds, secondKinds) {
  const firstCount = countRowsForKinds(rows, firstKinds);
  const secondCount = countRowsForKinds(rows, secondKinds);

  if (firstCount > secondCount) {
    return firstKinds;
  }
  if (secondCount > firstCount) {
    return secondKinds;
  }
  if (firstCount <= 0) {
    return [];
  }

  const firstIndex = findFirstIndexForKinds(rows, firstKinds);
  const secondIndex = findFirstIndexForKinds(rows, secondKinds);
  return firstIndex <= secondIndex ? firstKinds : secondKinds;
}

function classifyProbabilitySlot(item) {
  const normalized = normalizeForMatch(
    `${item?.slotName || ""} ${item?.pageName || ""}`,
  );

  if (
    normalized.includes(normalizeForMatch(LABEL.EMBLEM)) ||
    normalized.includes("emblem")
  ) {
    return SLOT_KIND.EMBLEM;
  }
  if (
    normalized.includes(normalizeForMatch(LABEL.SUB_WEAPON)) ||
    normalized.includes("subweapon")
  ) {
    return SLOT_KIND.SUB_WEAPON;
  }
  if (
    normalized.includes(normalizeForMatch(LABEL.WEAPON)) ||
    normalized.includes("weapon")
  ) {
    return SLOT_KIND.WEAPON;
  }
  if (
    normalized.includes(normalizeForMatch(LABEL.OVERALL)) ||
    normalized.includes("overall")
  ) {
    return SLOT_KIND.OVERALL;
  }
  if (
    normalized.includes(normalizeForMatch(LABEL.UPPER)) ||
    normalized.includes("top")
  ) {
    return SLOT_KIND.UPPER;
  }
  if (
    normalized.includes(normalizeForMatch(LABEL.PANTS)) ||
    normalized.includes("bottom") ||
    normalized.includes("pants")
  ) {
    return SLOT_KIND.PANTS;
  }
  if (
    normalized.includes(normalizeForMatch(LABEL.HAT)) ||
    normalized.includes("hat")
  ) {
    return SLOT_KIND.HAT;
  }
  if (
    normalized.includes(normalizeForMatch(LABEL.GLOVES)) ||
    normalized.includes("glove")
  ) {
    return SLOT_KIND.GLOVES;
  }
  if (
    normalized.includes(normalizeForMatch(LABEL.SHOES)) ||
    normalized.includes("shoe")
  ) {
    return SLOT_KIND.SHOES;
  }
  if (
    normalized.includes(normalizeForMatch(LABEL.SHOULDER)) ||
    normalized.includes("shoulder")
  ) {
    return SLOT_KIND.SHOULDER;
  }
  if (
    normalized.includes(normalizeForMatch(LABEL.CAPE)) ||
    normalized.includes("cape")
  ) {
    return SLOT_KIND.CAPE;
  }
  if (
    normalized.includes(normalizeForMatch(LABEL.BELT)) ||
    normalized.includes("belt")
  ) {
    return SLOT_KIND.BELT;
  }

  return "";
}

function resolveValidOptionKinds(
  slotKind,
  item,
  profileContext = null,
  sourceType = "potential",
  sourceRows = null,
) {
  const rows = Array.isArray(sourceRows)
    ? sourceRows
    : sourceType === "potential"
      ? normalizeOptionRows(item?.potentialOption)
      : normalizeOptionRows(item?.additionalPotentialOption);
  const valid = new Set();
  const profileDamageKind = resolveProfileDamageKind(item, profileContext);

  if (sourceType === "additional") {
    valid.add(profileDamageKind);
    valid.add(OPTION_KIND.BOSS_ATTACK);
    return valid;
  }

  switch (slotKind) {
    case SLOT_KIND.WEAPON:
    case SLOT_KIND.SUB_WEAPON:
    case SLOT_KIND.EMBLEM:
    case SLOT_KIND.SHOULDER: {
      valid.add(profileDamageKind);
      break;
    }
    case SLOT_KIND.OVERALL:
    case SLOT_KIND.UPPER:
    case SLOT_KIND.PANTS: {
      const winner = chooseKindGroupByLineCount(
        rows,
        [OPTION_KIND.MAX_HP],
        [OPTION_KIND.MESO_GAIN, OPTION_KIND.ITEM_DROP],
      );
      if (winner.includes(OPTION_KIND.MAX_HP)) {
        valid.add(OPTION_KIND.MAX_HP);
      } else if (winner.length) {
        valid.add(OPTION_KIND.MESO_GAIN);
        valid.add(OPTION_KIND.ITEM_DROP);
      }
      break;
    }
    case SLOT_KIND.HAT: {
      const winner = chooseKindGroupByLineCount(
        rows,
        [OPTION_KIND.MAX_HP],
        [OPTION_KIND.EXP_GAIN],
      );
      for (const kind of winner) {
        valid.add(kind);
      }
      break;
    }
    case SLOT_KIND.GLOVES: {
      valid.add(OPTION_KIND.BOSS_ATTACK);
      break;
    }
    case SLOT_KIND.SHOES: {
      const winner = chooseKindGroupByLineCount(
        rows,
        [OPTION_KIND.MAX_HP],
        [OPTION_KIND.MESO_GAIN],
      );
      for (const kind of winner) {
        valid.add(kind);
      }
      break;
    }
    case SLOT_KIND.CAPE: {
      const winner = chooseKindGroupByLineCount(
        rows,
        [OPTION_KIND.MAX_HP],
        [OPTION_KIND.ITEM_DROP],
      );
      for (const kind of winner) {
        valid.add(kind);
      }
      break;
    }
    case SLOT_KIND.BELT: {
      const winner = chooseKindGroupByLineCount(
        rows,
        [OPTION_KIND.BOSS_ATTACK],
        [OPTION_KIND.EXP_GAIN],
      );
      for (const kind of winner) {
        valid.add(kind);
      }
      break;
    }
    default:
      break;
  }

  return valid;
}

function resolveItemLevel(item) {
  const candidates = [
    item?.equipmentLevel,
    item?.itemLevel,
    item?.level,
  ];
  for (const candidate of candidates) {
    const parsed = parseNumericValue(candidate);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function findTableLevelException(item, slotKind, sourceType = "potential") {
  const itemName = String(item?.itemName || "").trim();
  const slotLabel = SLOT_PROBABILITY_CONFIG[slotKind]?.keyLabel || "";
  if (!itemName || !slotLabel) {
    return null;
  }

  for (const rule of TABLE_LEVEL_EXCEPTIONS) {
    if (!rule.namePattern || !rule.sources.includes(sourceType)) {
      continue;
    }
    if (rule.slots && !rule.slots.includes(slotLabel)) {
      continue;
    }
    if (!rule.namePattern.test(itemName)) {
      continue;
    }
    const level = rule.levelBySlot?.[slotLabel] ?? rule.level;
    if (Number.isFinite(level)) {
      return { equipment: rule.equipment, level };
    }
  }
  return null;
}

// Level used to pick the "<slot> <level>" table: the official exception level when one applies,
// otherwise the item's own level (resolveTableKey then takes the nearest table).
function resolveTableLevel(item, slotKind, sourceType = "potential") {
  const exception = findTableLevelException(item, slotKind, sourceType);
  return exception ? exception.level : resolveItemLevel(item);
}

function getTableEntryKeys(tableData) {
  return Object.keys(tableData || {}).filter((key) => key !== "_meta");
}

function parseTrailingLevel(keyText) {
  const match = String(keyText || "").match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : null;
}

function resolveTableKey(tableData, keyLabel, itemLevel) {
  const keys = getTableEntryKeys(tableData);
  if (!keys.length) {
    return "";
  }

  const normalizedLabel = normalizeForMatch(keyLabel);
  let candidates = keys.filter((key) =>
    normalizeForMatch(key).startsWith(normalizedLabel),
  );
  if (!candidates.length) {
    candidates = keys;
  }

  if (!Number.isFinite(itemLevel)) {
    return candidates[0];
  }

  const candidatesWithLevel = candidates
    .map((key) => ({ key, level: parseTrailingLevel(key) }))
    .filter((entry) => Number.isFinite(entry.level));

  if (!candidatesWithLevel.length) {
    return candidates[0];
  }

  candidatesWithLevel.sort((left, right) => {
    const leftDiff = Math.abs(left.level - itemLevel);
    const rightDiff = Math.abs(right.level - itemLevel);
    if (leftDiff !== rightDiff) {
      return leftDiff - rightDiff;
    }
    return right.level - left.level;
  });
  return candidatesWithLevel[0].key;
}

function normalizeGradeCandidate(value) {
  const normalized = normalizeForMatch(value);
  if (!normalized) {
    return [];
  }

  const normalizedRare = normalizeForMatch("\uB808\uC5B4");
  const normalizedEpic = normalizeForMatch("\uC5D0\uD53D");
  const normalizedUnique = normalizeForMatch("\uC720\uB2C8\uD06C");
  const normalizedLegendary = normalizeForMatch("\uB808\uC804\uB354\uB9AC");

  const candidates = [normalized];
  if (normalized === "1") {
    candidates.push(normalizedRare);
  } else if (normalized === "2") {
    candidates.push(normalizedEpic);
  } else if (normalized === "3") {
    candidates.push(normalizedUnique);
  } else if (normalized === "4") {
    candidates.push(normalizedLegendary);
  }

  if (normalized.includes("rare")) {
    candidates.push(normalizedRare);
  }
  if (normalized.includes("epic")) {
    candidates.push(normalizedEpic);
  }
  if (normalized.includes("unique")) {
    candidates.push(normalizedUnique);
  }
  if (normalized.includes("legendary")) {
    candidates.push(normalizedLegendary);
  }

  return [...new Set(candidates)];
}

function resolveGradeRank(value) {
  const normalized = normalizeForMatch(value);
  if (!normalized) {
    return 0;
  }
  if (
    normalized === "4" ||
    normalized.includes(normalizeForMatch("\uB808\uC804\uB354\uB9AC")) ||
    normalized.includes("legendary")
  ) {
    return 4;
  }
  if (
    normalized === "3" ||
    normalized.includes(normalizeForMatch("\uC720\uB2C8\uD06C")) ||
    normalized.includes("unique")
  ) {
    return 3;
  }
  if (
    normalized === "2" ||
    normalized.includes(normalizeForMatch("\uC5D0\uD53D")) ||
    normalized.includes("epic")
  ) {
    return 2;
  }
  if (
    normalized === "1" ||
    normalized.includes(normalizeForMatch("\uB808\uC5B4")) ||
    normalized.includes("rare")
  ) {
    return 1;
  }
  return 0;
}

function resolveGradeKey(tableByGrade, item, sourceType, optionRows) {
  const gradeKeys = Object.keys(tableByGrade || {});
  if (!gradeKeys.length) {
    return "";
  }
  if (gradeKeys.length === 1) {
    return gradeKeys[0];
  }

  const normalizedToGrade = new Map(
    gradeKeys.map((gradeKey) => [normalizeForMatch(gradeKey), gradeKey]),
  );
  const gradeSourceValues = [
    sourceType === "potential"
      ? item?.potentialGrade
      : item?.additionalPotentialGrade,
    ...optionRows.map((row) => row.optionGrade),
  ];

  for (const rawValue of gradeSourceValues) {
    for (const candidate of normalizeGradeCandidate(rawValue)) {
      if (normalizedToGrade.has(candidate)) {
        return normalizedToGrade.get(candidate);
      }
    }
  }

  return "";
}

function parseProbabilityPercent(rawPercent) {
  const parsed = parseNumericValue(rawPercent);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveLineProbabilityFraction(lineTableRows, optionRow) {
  if (!Array.isArray(lineTableRows) || !lineTableRows.length) {
    return null;
  }

  const sameKindRows = [];
  let cumulativePercent = 0;
  for (const row of lineTableRows) {
    const rowKind = resolveOptionKind(row?.option);
    if (rowKind !== optionRow.kind) {
      continue;
    }
    sameKindRows.push(row);
    const rowValue = parseNumericValue(row?.value);
    if (!Number.isFinite(rowValue)) {
      continue;
    }
    if (rowValue + 1e-9 >= optionRow.value) {
      cumulativePercent += parseProbabilityPercent(row?.p);
    }
  }

  if (cumulativePercent <= 0 && sameKindRows.length) {
    // When source value is slightly above table max (rounding/level boundary),
    // use the best available value's probability instead of dropping to fallback.
    let bestValue = -Infinity;
    for (const row of sameKindRows) {
      const rowValue = parseNumericValue(row?.value);
      if (Number.isFinite(rowValue)) {
        bestValue = Math.max(bestValue, rowValue);
      }
    }
    if (Number.isFinite(bestValue)) {
      for (const row of sameKindRows) {
        const rowValue = parseNumericValue(row?.value);
        if (Number.isFinite(rowValue) && Math.abs(rowValue - bestValue) <= 1e-9) {
          cumulativePercent += parseProbabilityPercent(row?.p);
        }
      }
    }
  }

  if (cumulativePercent <= 0) {
    return null;
  }

  return cumulativePercent / 100;
}

async function loadProbabilityTable(fileName) {
  if (!fileName) {
    return null;
  }

  if (!probabilityTableCache.has(fileName)) {
    const loadPromise = fetch(`/probability/${encodeURIComponent(fileName)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`failed to load ${fileName}`);
        }
        return response.json();
      })
      .catch(() => null);
    probabilityTableCache.set(fileName, loadPromise);
  }

  return probabilityTableCache.get(fileName);
}

// ---------------------------------------------------------------------------
// Equipment mastery (장비 마스터리) and additional options (추가 옵션, 환생의 불꽃)
//
// Mastery bonuses raise option values after they were rolled, so the probability tables must be read with
// the rolled value: displayed value minus the bonus. public/probability/equipment_mastery.json holds the
// per-bonus increases that are backed by official sources (see its _meta and docs/research/probability-sync.md).
// The API only gives the bonus count per option group, not per line, so the split over lines is inferred:
// every split with at most max_bonus_per_line per line is tried, and only splits whose pre-bonus values exist
// in the official tables are kept. Lines whose increase is unknown are neither checked nor reduced.

const MASTERY_FILE = "equipment_mastery.json";
const DEFAULT_MAX_BONUS_PER_LINE = 2;
const VALUE_EPSILON = 1e-6;

// Additional-option (flame) files: the official page groups weapons/sub weapons/emblems and armor.
const FLAME_FILE_BY_SLOT = Object.freeze({
  [SLOT_KIND.WEAPON]: "weapon_flame_prob.json",
  [SLOT_KIND.SUB_WEAPON]: "weapon_flame_prob.json",
  [SLOT_KIND.EMBLEM]: "weapon_flame_prob.json",
  [SLOT_KIND.OVERALL]: "armor_flame_prob.json",
  [SLOT_KIND.UPPER]: "armor_flame_prob.json",
  [SLOT_KIND.PANTS]: "armor_flame_prob.json",
  [SLOT_KIND.HAT]: "armor_flame_prob.json",
  [SLOT_KIND.GLOVES]: "armor_flame_prob.json",
  [SLOT_KIND.SHOES]: "armor_flame_prob.json",
  [SLOT_KIND.SHOULDER]: "armor_flame_prob.json",
  [SLOT_KIND.CAPE]: "armor_flame_prob.json",
  [SLOT_KIND.BELT]: "armor_flame_prob.json",
});

// Official flame page: "제네시스 무기(해방 퀘스트) … 장비 레벨 200에 해당하는 추가 옵션이 부여됩니다."
const FLAME_LEVEL_EXCEPTIONS = Object.freeze([
  { equipment: "제네시스 무기", namePattern: /^제네시스\s/, slots: [SLOT_KIND.WEAPON], level: 200 },
]);

// Flame options that make an item worth showing off. Like the potential slots, the larger group wins.
const FLAME_COMBAT_NAMES = Object.freeze(["최종대미지", "방어율무시"]);
const FLAME_FARMING_NAMES = Object.freeze(["아이템드롭률", "메소획득량", "경험치획득량"]);

const SECTION_SOURCE = Object.freeze({
  potential: { optionsKey: "potentialOption", pointKeys: ["potentialPoint", "potential_option_point"] },
  additionalPotential: {
    optionsKey: "additionalPotentialOption",
    pointKeys: ["additionalPotentialPoint", "additional_potential_option_point"],
  },
  additional: { optionsKey: "additionalOption", pointKeys: ["additionalPoint", "additional_option_point"] },
});

function roundValue(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}

function isPercentText(text) {
  return String(text || "").includes("%");
}

// "최종 대미지 증가" (table) and "최종 대미지" (API) are the same option.
function flameOptionKey(name) {
  return normalizeForMatch(String(name || "").replace(/데미지/g, "대미지")).replace(/증가$/, "");
}

function readMasteryPoints(item, section) {
  const info = item?.masteryInfo || item?.mastery_info;
  if (!info || typeof info !== "object") {
    return 0;
  }
  for (const key of SECTION_SOURCE[section].pointKeys) {
    const value = Number(info[key]);
    if (Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  }
  return 0;
}

function readOptionLines(item, section) {
  return toArray(item?.[SECTION_SOURCE[section].optionsKey]).map((option, index) => {
    const name = String(option?.name || option?.option_name || "").trim();
    const valueText = String(option?.value || option?.option_value || "").trim();
    return { index, name, valueText, value: parseNumericValue(valueText) };
  });
}

// Every way to put `points` bonuses on `lineCount` lines, at most `maxPerLine` each. Earlier lines first.
function enumerateBonusSplits(lineCount, points, maxPerLine) {
  const splits = [];
  const walk = (index, left, acc) => {
    if (index === lineCount) {
      if (left === 0) splits.push(acc.slice());
      return;
    }
    for (let count = Math.min(maxPerLine, left); count >= 0; count -= 1) {
      acc.push(count);
      walk(index + 1, left - count, acc);
      acc.pop();
    }
  };
  if (lineCount > 0 && points >= 0 && points <= lineCount * maxPerLine) {
    walk(0, points, []);
  }
  return splits;
}

// Picks the line split. `lines[i]` = { increment: number | null, fits(value) → boolean | null }.
// fits() returns null when the table cannot tell (unknown option), which never rules a split out.
// score(split) → probability (higher = less rare); the most conservative surviving split wins.
function chooseBonusSplit(lines, points, maxPerLine, score) {
  const empty = lines.map(() => 0);
  if (!points) {
    return { split: empty, status: "none" };
  }
  const splits = enumerateBonusSplits(lines.length, points, maxPerLine);
  const valid = splits.filter((split) =>
    split.every((count, index) => {
      const line = lines[index];
      if (count > 0 && !Number.isFinite(line.increment)) {
        return true;
      }
      const value = roundValue(line.value - count * (Number.isFinite(line.increment) ? line.increment : 0));
      return line.fits(value) !== false;
    }),
  );
  if (!valid.length) {
    return { split: empty, status: "unresolved" };
  }
  if (valid.length === 1) {
    return { split: valid[0], status: "exact" };
  }
  let best = valid[0];
  let bestScore = -Infinity;
  for (const split of valid) {
    const value = Number(score(split));
    const comparable = Number.isFinite(value) ? value : -1;
    if (comparable > bestScore + 1e-15) {
      best = split;
      bestScore = comparable;
    }
  }
  return { split: best, status: "ambiguous" };
}

function describeBonus(count, increment, valueText) {
  if (!count || !Number.isFinite(increment)) {
    return { count, bonus: null, text: "" };
  }
  const bonus = roundValue(count * increment);
  const unit = isPercentText(valueText) ? "%" : "";
  const number = unit ? String(bonus) : Number(bonus).toLocaleString("ko-KR");
  return { count, bonus, text: `+${number}${unit}` };
}

// ---- cube (potential / additional potential) ----

async function loadCubeContext(item, sourceType, config, slotKind, optionRows) {
  const fileName =
    sourceType === "potential" ? config.potentialFile : config.additionalFile;
  if (!fileName) {
    return null;
  }
  const tableData = await loadProbabilityTable(fileName);
  if (!tableData) {
    return null;
  }
  const tableLevel = resolveTableLevel(item, slotKind, sourceType);
  const tableKey = resolveTableKey(tableData, config.keyLabel, tableLevel);
  const tableByGrade = tableData?.[tableKey];
  if (!tableByGrade || typeof tableByGrade !== "object") {
    return null;
  }
  const gradeKey = resolveGradeKey(tableByGrade, item, sourceType, optionRows);
  const gradeBucket = tableByGrade?.[gradeKey];
  if (!gradeBucket || typeof gradeBucket !== "object") {
    return null;
  }
  return { fileName, tableKey, gradeKey, gradeBucket };
}

function lineRowsFor(gradeBucket, index) {
  const lineKey =
    LINE_BUCKET_KEYS[index] || LINE_BUCKET_KEYS[LINE_BUCKET_KEYS.length - 1];
  return gradeBucket?.[lineKey] || gradeBucket?.first || [];
}

function computeCubeProbability(gradeBucket, optionRows) {
  if (!optionRows.length) {
    return null;
  }
  let probabilityProduct = 1;
  for (const row of optionRows) {
    const lineProbabilityFraction = resolveLineProbabilityFraction(
      lineRowsFor(gradeBucket, row.sourceIndex),
      row,
    );
    if (lineProbabilityFraction === null) {
      return null;
    }
    probabilityProduct *= lineProbabilityFraction;
  }
  return probabilityProduct;
}

function cubeIncrement(masteryTable, gradeKey, valueText) {
  if (!isPercentText(valueText)) {
    return null;
  }
  const increment = Number(masteryTable?.cube?.[gradeKey]?.percent);
  return Number.isFinite(increment) && increment > 0 ? increment : null;
}

function cubeLineFits(gradeBucket, line) {
  const target = normalizeForMatch(line.name);
  const rows = lineRowsFor(gradeBucket, line.index).filter(
    (row) => normalizeForMatch(row?.option) === target,
  );
  return (value) => {
    if (!rows.length || !Number.isFinite(value)) {
      return null;
    }
    return rows.some((row) => Math.abs(parseNumericValue(row?.value) - value) <= VALUE_EPSILON);
  };
}

// Applies a split to normalized rows: each row's value becomes the pre-bonus value.
function applySplitToRows(rows, lines, split) {
  return rows.map((row) => {
    const line = lines[row.sourceIndex];
    const count = split[row.sourceIndex] || 0;
    if (!line || !count || !Number.isFinite(line.increment)) {
      return row;
    }
    return { ...row, value: roundValue(row.value - count * line.increment) };
  });
}

async function resolveCubeSource(item, sourceType, config, validKinds, normalizedRows, slotKind, masteryTable) {
  const section = sourceType === "potential" ? "potential" : "additionalPotential";
  const rows = Array.isArray(normalizedRows) ? normalizedRows : [];
  const validRows = rows.filter((row) => validKinds.has(row.kind));
  const lines = readOptionLines(item, section);
  const points = readMasteryPoints(item, section);
  const empty = { probability: null, lines: lines.map(() => describeBonus(0)), points, status: "none" };
  if (!lines.length) {
    return empty;
  }

  const context = await loadCubeContext(item, sourceType, config, slotKind, validRows.length ? validRows : rows);
  if (!context) {
    return empty;
  }
  const maxPerLine = Number(masteryTable?.max_bonus_per_line) || DEFAULT_MAX_BONUS_PER_LINE;
  const lineSpecs = lines.map((line) => ({
    ...line,
    increment: cubeIncrement(masteryTable, context.gradeKey, line.valueText),
    fits: cubeLineFits(context.gradeBucket, line),
  }));
  const countsForProbability = resolveGradeRank(context.gradeKey) >= 3 && validRows.length > 0;
  const probabilityFor = (split) =>
    countsForProbability
      ? computeCubeProbability(context.gradeBucket, applySplitToRows(validRows, lineSpecs, split))
      : null;
  const choice = chooseBonusSplit(lineSpecs, points, maxPerLine, probabilityFor);
  return {
    probability: probabilityFor(choice.split),
    lines: lineSpecs.map((line, index) => describeBonus(choice.split[index], line.increment, line.valueText)),
    points,
    status: choice.status,
    tableKey: context.tableKey,
    gradeKey: context.gradeKey,
  };
}

// ---- additional options (flame) ----

function resolveFlameName(item, masteryTable) {
  const raw = String(item?.additionalOptionGrade ?? item?.item_additional_option_grade ?? "").trim();
  if (!raw) {
    return "";
  }
  const byGrade = masteryTable?.flame_grade || {};
  if (byGrade[raw]) {
    return byGrade[raw];
  }
  const rank = resolveGradeRank(raw);
  return rank ? byGrade[String(rank)] || "" : "";
}

function resolveFlameLevelKey(block, item, slotKind) {
  const levels = Object.keys(block?.options?.[0]?.ranges || {})
    .map(Number)
    .filter(Number.isFinite);
  if (!levels.length) {
    return "";
  }
  const itemName = String(item?.itemName || item?.item_name || "").trim();
  const exception = FLAME_LEVEL_EXCEPTIONS.find(
    (rule) => rule.slots.includes(slotKind) && rule.namePattern.test(itemName),
  );
  const level = exception ? exception.level : resolveItemLevel(item);
  if (!Number.isFinite(level)) {
    return "";
  }
  const sorted = levels.slice().sort((left, right) => {
    const diff = Math.abs(left - level) - Math.abs(right - level);
    return diff !== 0 ? diff : right - left;
  });
  return String(sorted[0]);
}

function parseFlameNumber(text) {
  const value = parseNumericValue(text);
  return Number.isFinite(value) ? value : null;
}

// Share of the uniform MIN..MAX grid (step = official 증가값) that is at least `value`.
function flameValueFraction(option, levelKey, value) {
  const range = option?.ranges?.[levelKey];
  const min = parseFlameNumber(range?.min);
  const max = parseFlameNumber(range?.max);
  const step = parseFlameNumber(option?.step);
  if (min === null || max === null || !step || max < min) {
    return null;
  }
  const total = Math.round((max - min) / step) + 1;
  if (value <= min + VALUE_EPSILON) {
    return 1;
  }
  if (value > max + VALUE_EPSILON) {
    // Above the table (rounding or an unknown bonus): count it as the best value, like the cube tables.
    return 1 / total;
  }
  const firstIndex = Math.ceil((value - min) / step - VALUE_EPSILON);
  return Math.max(1, total - firstIndex) / total;
}

function flameValidNames(item, profileContext, lines) {
  const damageKind = resolveProfileDamageKind(item, profileContext);
  const physical = damageKind === OPTION_KIND.PHYSICAL_DAMAGE;
  const combat = new Set([
    physical ? "물리공격력" : "마법공격력",
    physical ? "물리대미지" : "마법대미지",
    ...FLAME_COMBAT_NAMES,
  ]);
  const farming = new Set(FLAME_FARMING_NAMES);
  const keyed = lines.map((line) => flameOptionKey(line.name));
  const combatCount = keyed.filter((key) => combat.has(key)).length;
  const farmingCount = keyed.filter((key) => farming.has(key)).length;
  if (!combatCount && !farmingCount) {
    return new Set();
  }
  if (combatCount === farmingCount) {
    const firstCombat = keyed.findIndex((key) => combat.has(key));
    const firstFarming = keyed.findIndex((key) => farming.has(key));
    return firstCombat <= firstFarming ? combat : farming;
  }
  return combatCount > farmingCount ? combat : farming;
}

function computeFlameProbability(context, lines, validNames, split) {
  let product = 1;
  let used = 0;
  for (const line of lines) {
    if (!validNames.has(flameOptionKey(line.name)) || !line.option) {
      continue;
    }
    const count = split[line.index] || 0;
    const value = Number.isFinite(line.increment)
      ? roundValue(line.value - count * line.increment)
      : line.value;
    const fraction = flameValueFraction(line.option, context.levelKey, value);
    const optionChance = parseProbabilityPercent(line.option.p) / 100;
    if (fraction === null || optionChance <= 0) {
      return null;
    }
    const lineChance = line.index === 0 ? 1 : context.twoOptionChance;
    product *= lineChance * optionChance * fraction;
    used += 1;
  }
  return used ? product : null;
}

async function resolveFlameSource(item, slotKind, profileContext, masteryTable) {
  const lines = readOptionLines(item, "additional");
  const points = readMasteryPoints(item, "additional");
  const empty = { probability: null, lines: lines.map(() => describeBonus(0)), points, status: "none" };
  const fileName = FLAME_FILE_BY_SLOT[slotKind];
  const flameName = resolveFlameName(item, masteryTable);
  if (!lines.length || !fileName || !flameName) {
    return empty;
  }
  const tableData = await loadProbabilityTable(fileName);
  const block = tableData?.[flameName];
  if (!block || !Array.isArray(block.options)) {
    return empty;
  }
  const levelKey = resolveFlameLevelKey(block, item, slotKind);
  if (!levelKey) {
    return empty;
  }
  const context = {
    levelKey,
    twoOptionChance: parseProbabilityPercent(block.two_option_chance) / 100,
  };
  const increments = masteryTable?.flame?.[flameName] || {};
  const incrementByKey = new Map(
    Object.entries(increments).map(([name, value]) => [flameOptionKey(name), Number(value)]),
  );
  const lineSpecs = lines.map((line) => {
    const key = flameOptionKey(line.name);
    const option = block.options.find((entry) => flameOptionKey(entry.option) === key) || null;
    const increment = incrementByKey.get(key);
    const range = option?.ranges?.[levelKey];
    const min = parseFlameNumber(range?.min);
    const max = parseFlameNumber(range?.max);
    return {
      ...line,
      option,
      increment: Number.isFinite(increment) && increment > 0 ? increment : null,
      fits: (value) =>
        min === null || max === null || !Number.isFinite(value)
          ? null
          : value >= min - VALUE_EPSILON && value <= max + VALUE_EPSILON,
    };
  });
  const validNames = flameValidNames(item, profileContext, lines);
  const maxPerLine = Number(masteryTable?.max_bonus_per_line) || DEFAULT_MAX_BONUS_PER_LINE;
  const probabilityFor = (split) =>
    validNames.size ? computeFlameProbability(context, lineSpecs, validNames, split) : null;
  const choice = chooseBonusSplit(lineSpecs, points, maxPerLine, probabilityFor);
  return {
    probability: probabilityFor(choice.split),
    lines: lineSpecs.map((line, index) => describeBonus(choice.split[index], line.increment, line.valueText)),
    points,
    status: choice.status,
    flameName,
    levelKey,
  };
}

async function resolveTopPercentBreakdown(item, profileContext = null) {
  const slotKind = classifyProbabilitySlot(item);
  const config = SLOT_PROBABILITY_CONFIG[slotKind];
  if (!config) {
    return null;
  }

  const potentialRows = normalizeOptionRows(item?.potentialOption);
  const additionalRows = normalizeOptionRows(item?.additionalPotentialOption);
  const potentialValidKinds = resolveValidOptionKinds(
    slotKind,
    item,
    profileContext,
    "potential",
    potentialRows,
  );
  const additionalValidKinds = resolveValidOptionKinds(
    slotKind,
    item,
    profileContext,
    "additional",
    additionalRows,
  );

  const masteryTable = (await loadProbabilityTable(MASTERY_FILE)) || {};
  const [potential, additionalPotential, flame] = await Promise.all([
    resolveCubeSource(item, "potential", config, potentialValidKinds, potentialRows, slotKind, masteryTable),
    resolveCubeSource(item, "additional", config, additionalValidKinds, additionalRows, slotKind, masteryTable),
    resolveFlameSource(item, slotKind, profileContext, masteryTable),
  ]);
  const potentialProbability = potential.probability;
  const additionalProbability = additionalPotential.probability;
  const additionalOptionProbability = flame.probability;

  const sourceProbabilities = [potentialProbability, additionalProbability].filter(
    (value) => value !== null,
  );
  const combinedProbability = sourceProbabilities.reduce(
    (product, value) => product * value,
    1,
  );
  return {
    totalPercent: sourceProbabilities.length ? combinedProbability * 100 : null,
    potentialProbability:
      potentialProbability !== null ? Number(potentialProbability) : null,
    additionalProbability:
      additionalProbability !== null ? Number(additionalProbability) : null,
    additionalOptionProbability:
      additionalOptionProbability !== null ? Number(additionalOptionProbability) : null,
    additionalOptionPercent:
      additionalOptionProbability !== null ? Number(additionalOptionProbability) * 100 : null,
    mastery: {
      potential,
      additionalPotential,
      additional: flame,
    },
  };
}

async function resolveTopPercent(item, profileContext = null) {
  const breakdown = await resolveTopPercentBreakdown(item, profileContext);
  return breakdown?.totalPercent ?? null;
}

export {
  FLAME_FILE_BY_SLOT,
  SLOT_PROBABILITY_CONFIG,
  TABLE_LEVEL_EXCEPTIONS,
  buildItemShareFileName,
  buildTopPercentCaption,
  classifyProbabilitySlot,
  enumerateBonusSplits,
  formatAdditionalOptionPercent,
  resolveTableKey,
  resolveTableLevel,
  resolveTopPercent,
  resolveTopPercentBreakdown,
};
