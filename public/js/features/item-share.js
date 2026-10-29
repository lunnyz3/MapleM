import {
  magicalJobNames,
  normalizeForMatch,
  parseNumericValue,
  physicalJobNames,
  toArray,
} from "../core/common.js";

const DEFAULT_TOP_PERCENT_CAPTION = "-";
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
  ACCESSORY: "accessory",
});

// 장신구(잠재·에디 공식 표는 없고 추가 옵션 표만 있다): 반지·목걸이·귀고리·눈장식·얼굴장식·포켓
const ACCESSORY_LABELS = Object.freeze(["\ubc18\uc9c0", "\ubaa9\uac78\uc774", "\uadc0\uace0\ub9ac", "\ub208\uc7a5\uc2dd", "\uc5bc\uad74\uc7a5\uc2dd", "\ud3ec\ucf13"]);

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
  [SLOT_KIND.ACCESSORY]: {
    potentialFile: null,
    additionalFile: null,
    keyLabel: "",
  },
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

// 공유 문구: "상위 0.057%, 블랙큐브 1,766개, 에디셔널 큐브 3,548개 짜리 아이템입니다!"
// 상위 % = 잠재 상위 × 에디셔널 상위(둘 다 이 장비 이상 나올 확률), 큐브 개수 = 1 / 그 부분의 확률(기댓값).
// 계산할 수 없는 부분은 뺀다. 둘 다 없으면 DEFAULT_TOP_PERCENT_CAPTION.
function captionFromBreakdown(breakdown) {
  const top = formatAdditionalOptionPercent(breakdown?.totalPercent);
  if (!top) {
    return DEFAULT_TOP_PERCENT_CAPTION;
  }
  const parts = [`\uC0C1\uC704 ${top}`];
  const blackCube = resolveExpectedCubeCount(breakdown?.potentialProbability);
  if (blackCube) parts.push(`\uBE14\uB799\uD050\uBE0C ${formatCubeCountLabel(blackCube)}`);
  const additionalCube = resolveExpectedCubeCount(breakdown?.additionalProbability);
  if (additionalCube) parts.push(`\uC5D0\uB514\uC154\uB110 \uD050\uBE0C ${formatCubeCountLabel(additionalCube)}`);
  return `${parts.join(", ")} \uC9DC\uB9AC \uC544\uC774\uD15C\uC785\uB2C8\uB2E4!`;
}

async function buildTopPercentCaption(item, profileContext = null) {
  return captionFromBreakdown(await resolveTopPercentBreakdown(item, profileContext));
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

  if (ACCESSORY_LABELS.some((label) => normalized.includes(normalizeForMatch(label)))) {
    return SLOT_KIND.ACCESSORY;
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
  [SLOT_KIND.ACCESSORY]: "accessory_flame_prob.json",
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

// Mastery points of a section, or null when the API gave no mastery info (Nexon only reports it for
// worn items; preset copies of unworn items come without it).
function readMasteryPoints(item, section) {
  const info = item?.masteryInfo || item?.mastery_info;
  if (!info || typeof info !== "object") {
    return null;
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

// Without mastery info: a line whose value is not in the table but is once 1 or 2 bonuses are taken
// off (e.g. +2% / +4% on a legendary potential) carries that many bonuses.
function inferBonusSplit(lines, maxPerLine) {
  const split = lines.map((line) => {
    if (!Number.isFinite(line.increment) || line.fits(line.value) !== false) {
      return 0;
    }
    for (let count = 1; count <= maxPerLine; count += 1) {
      if (line.fits(roundValue(line.value - count * line.increment)) === true) {
        return count;
      }
    }
    return 0;
  });
  return { split, status: split.some((count) => count > 0) ? "inferred" : "none" };
}

// Picks the line split. `lines[i]` = { increment: number | null, fits(value) → boolean | null }.
// fits() returns null when the table cannot tell (unknown option), which never rules a split out.
// score(split) → probability (higher = less rare); the most conservative surviving split wins.
// `points` null = mastery info unknown, so the split is inferred line by line.
function chooseBonusSplit(lines, points, maxPerLine, score) {
  const empty = lines.map(() => 0);
  if (points === null) {
    return inferBonusSplit(lines, maxPerLine);
  }
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

// "상위 %" (잠재·에디셔널): 같은 등급 큐브를 새로 돌렸을 때, 이 부위·직업에 쓸모 있는 옵션(validKinds)의 값을
// 모두 더한 값이 지금 장비 이상 나올 확률. 줄마다 공식 확률표의 분포를 만들고 줄 수만큼 합친다(합성곱).
// 쓸모없는 줄은 0으로 세므로 잡옵은 상위 100% 쪽이 되고, 보공 15% 한 줄이 보공 1% 한 줄보다 위다.
// 값은 0.01 단위 정수로 다룬다(부동소수 오차 방지).
function computeCubeTopProbability(gradeBucket, lineCount, validKinds, optionRows) {
  if (!optionRows.length || !lineCount) {
    return null;
  }
  const toUnits = (value) => Math.round(Number(value) * 100);
  const target = optionRows.reduce((sum, row) => sum + toUnits(row.value), 0);
  let dist = new Map([[0, 1]]);
  for (let index = 0; index < lineCount; index += 1) {
    const line = new Map();
    let total = 0;
    for (const row of lineRowsFor(gradeBucket, index)) {
      const p = parseProbabilityPercent(row?.p);
      if (!(p > 0)) continue;
      total += p;
      const value = parseNumericValue(row?.value);
      const score = validKinds.has(resolveOptionKind(row?.option)) && Number.isFinite(value) ? toUnits(value) : 0;
      // 공식 표의 확률을 그대로 쓴다(표기 반올림으로 합이 100%에서 조금 벗어나도 고치지 않는다).
      line.set(score, (line.get(score) || 0) + p / 100);
    }
    if (!(total > 0)) {
      return null;
    }
    const next = new Map();
    for (const [a, pa] of dist) {
      for (const [b, pb] of line) {
        next.set(a + b, (next.get(a + b) || 0) + pa * pb);
      }
    }
    dist = next;
  }
  let tail = 0;
  let best = -Infinity;
  for (const [score, p] of dist) {
    if (score >= target) tail += p;
    best = Math.max(best, score);
  }
  // 표보다 높은 값(반올림·알 수 없는 상승분): 표에서 가장 좋은 경우로 본다.
  return tail > 0 ? Math.min(1, tail) : dist.get(best) || null;
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
      ? computeCubeTopProbability(context.gradeBucket, lines.length, validKinds, applySplitToRows(validRows, lineSpecs, split))
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

const FLAME_SCORE_EPSILON = 1e-5;

// 추가 옵션 점수 가중치(템환산과 같은 값, src/game-data/item-score.json weights): 공격력 1 = 0.0047405,
// 대미지 1% = 0.3792440, 최종 대미지·방어율 무시 1% = 1.4221649. 사냥 옵션(드롭·메획·경험치)은 % 그대로 1.
const FLAME_SCORE_WEIGHTS = Object.freeze({
  "물리공격력": 0.004740549714144853,
  "마법공격력": 0.004740549714144853,
  "물리대미지": 0.3792439771315882,
  "마법대미지": 0.3792439771315882,
  "최종대미지": 1.4221649142434558,
  "방어율무시": 1.4221649142434558,
  "아이템드롭률": 1,
  "메소획득량": 1,
  "경험치획득량": 1,
});

/**
 * 한 줄 점수 분포: [{ score, p }] (점수 오름차순). 쓸모없는 옵션은 0점. 공식 표의 확률을 그대로 쓴다.
 * 수치는 범위 안에서 같은 확률(step 간격)로 나온다고 본다.
 */
function flameLineDistribution(block, levelKey, validNames) {
  const byScore = new Map();
  let total = 0;
  for (const option of block.options || []) {
    const p = parseProbabilityPercent(option?.p);
    if (!(p > 0)) continue;
    total += p;
    const key = flameOptionKey(option.option);
    const weight = validNames.has(key) ? FLAME_SCORE_WEIGHTS[key] || 0 : 0;
    const range = option?.ranges?.[levelKey];
    const min = parseFlameNumber(range?.min);
    const max = parseFlameNumber(range?.max);
    const step = parseFlameNumber(option?.step);
    if (!weight || min === null || max === null || !step || max < min) {
      byScore.set(0, (byScore.get(0) || 0) + p / 100);
      continue;
    }
    const count = Math.round((max - min) / step) + 1;
    for (let i = 0; i < count; i += 1) {
      const score = (min + i * step) * weight;
      byScore.set(score, (byScore.get(score) || 0) + p / 100 / count);
    }
  }
  if (!(total > 0)) return null;
  return [...byScore.entries()].map(([score, p]) => ({ score, p })).sort((a, b) => a.score - b.score);
}

// "상위 %" (추가 옵션): 같은 불꽃을 새로 썼을 때 점수 합이 지금 이상일 확률. 첫 줄은 항상, 둘째 줄은
// two_option_chance 로 붙는다(둘째 줄 옵션 중복 제외는 고려하지 않는 근사).
function computeFlameTopProbability(context, block, lines, validNames, split) {
  const dist = flameLineDistribution(block, context.levelKey, validNames);
  if (!dist) return null;
  let target = 0;
  let used = 0;
  for (const line of lines) {
    const key = flameOptionKey(line.name);
    if (!validNames.has(key) || !line.option) continue;
    const count = split[line.index] || 0;
    const value = Number.isFinite(line.increment) ? roundValue(line.value - count * line.increment) : line.value;
    target += value * (FLAME_SCORE_WEIGHTS[key] || 0);
    used += 1;
  }
  if (!used) return null;
  // 서로 다른 점수 차이는 0.0004 이상(대미지 0.001% × 0.379)이라, 같은 점수를 놓치지 않을 만큼만 낮춘다.
  target -= FLAME_SCORE_EPSILON;
  // 꼬리 확률 P(S ≥ t): 점수 오름차순 누적합을 뒤에서부터.
  const suffix = new Array(dist.length + 1).fill(0);
  for (let i = dist.length - 1; i >= 0; i -= 1) suffix[i] = suffix[i + 1] + dist[i].p;
  const tailAtLeast = (t) => {
    let lo = 0;
    let hi = dist.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (dist[mid].score >= t) hi = mid;
      else lo = mid + 1;
    }
    return suffix[lo];
  };
  const two = Math.min(1, Math.max(0, context.twoOptionChance || 0));
  let both = 0;
  if (two > 0) {
    for (const entry of dist) both += entry.p * tailAtLeast(target - entry.score);
  }
  const tail = (1 - two) * tailAtLeast(target) + two * both;
  if (tail > 0) return Math.min(1, tail);
  // 표보다 높은 값: 가장 좋은 경우의 확률로 본다.
  const top = dist[dist.length - 1];
  return two > 0 ? two * top.p * top.p : top.p;
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
  // 상승량은 숫자 하나 또는 여러 개(같은 옵션에 서로 다른 상승량이 섞여 관찰된 경우).
  const incrementByKey = new Map(
    Object.entries(increments).map(([name, value]) => [
      flameOptionKey(name),
      [].concat(value).map(Number).filter((step) => Number.isFinite(step) && step > 0),
    ]),
  );
  const maxPerLine = Number(masteryTable?.max_bonus_per_line) || DEFAULT_MAX_BONUS_PER_LINE;
  const lineSpecs = lines.map((line) => {
    const key = flameOptionKey(line.name);
    const option = block.options.find((entry) => flameOptionKey(entry.option) === key) || null;
    const range = option?.ranges?.[levelKey];
    const min = parseFlameNumber(range?.min);
    const max = parseFlameNumber(range?.max);
    const fits = (value) =>
      min === null || max === null || !Number.isFinite(value)
        ? null
        : value >= min - VALUE_EPSILON && value <= max + VALUE_EPSILON;
    // 상승량이 여럿이면 이 줄 값을 표 범위에 넣을 수 있는 첫 상승량을 쓴다.
    const steps = incrementByKey.get(key) || [];
    const increment =
      steps.find((step) =>
        Array.from({ length: maxPerLine }, (_, index) => index + 1).some(
          (count) => fits(roundValue(line.value - count * step)) === true,
        ),
      ) ??
      steps[0] ??
      null;
    return { ...line, option, increment, fits };
  });
  const validNames = flameValidNames(item, profileContext, lines);
  const probabilityFor = (split) =>
    validNames.size ? computeFlameTopProbability(context, block, lineSpecs, validNames, split) : null;
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

// 장비 교체 체험용: 이 장비에 붙을 수 있는 옵션 후보(공식 확률표). 잠재·에디는 줄마다 [{ option, value }],
// 추가 옵션은 불꽃 표의 옵션별 범위 [{ option, min, max, step }]. 표를 못 찾으면 그 부분은 빈 배열.
async function resolveOptionCandidates(item) {
  const slotKind = classifyProbabilitySlot(item);
  const config = SLOT_PROBABILITY_CONFIG[slotKind];
  const result = { potential: [], additionalPotential: [], additional: [] };
  if (!config) {
    return result;
  }
  const cubeLines = async (sourceType, section) => {
    const rows = normalizeOptionRows(item?.[SECTION_SOURCE[section].optionsKey]);
    const context = await loadCubeContext(item, sourceType, config, slotKind, rows);
    if (!context) return [];
    const count = Math.max(1, readOptionLines(item, section).length);
    return Array.from({ length: count }, (_, index) => {
      const seen = new Set();
      return lineRowsFor(context.gradeBucket, index)
        .map((row) => ({ option: String(row?.option || "").trim(), value: String(row?.value || "").trim() }))
        .filter((row) => {
          const key = row.option + "|" + row.value;
          if (!row.option || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    });
  };
  const flameOptions = async () => {
    const fileName = FLAME_FILE_BY_SLOT[slotKind];
    const masteryTable = (await loadProbabilityTable(MASTERY_FILE)) || {};
    const flameName = resolveFlameName(item, masteryTable);
    if (!fileName || !flameName) return [];
    const block = (await loadProbabilityTable(fileName))?.[flameName];
    const levelKey = block ? resolveFlameLevelKey(block, item, slotKind) : null;
    if (!levelKey) return [];
    return (block.options || [])
      .map((option) => {
        const range = option?.ranges?.[levelKey];
        return {
          option: String(option?.option || "").trim(),
          min: parseFlameNumber(range?.min),
          max: parseFlameNumber(range?.max),
          step: parseFlameNumber(option?.step),
          percent: String(range?.min || "").includes("%") || String(option?.step || "").includes("%"),
        };
      })
      .filter((option) => option.option && option.min !== null && option.max !== null && option.step);
  };
  const [potential, additionalPotential, additional] = await Promise.all([
    cubeLines("potential", "potential"),
    cubeLines("additional", "additionalPotential"),
    flameOptions(),
  ]);
  return { potential, additionalPotential, additional };
}

// 큐브·불꽃 시뮬레이터용: 이 장비의 등급별 줄 표(공식 확률 p, 0~100)와 지금 불꽃의 옵션 표.
// potential/additionalPotential: { grade, lineCount, grades: { 등급: [first, second, third] } }
// flame: { flameName, twoOptionChance(0~1), options: [{ option, p, min, max, step, percent }] }
async function resolveRollTables(item) {
  const slotKind = classifyProbabilitySlot(item);
  const config = SLOT_PROBABILITY_CONFIG[slotKind];
  const result = { potential: null, additionalPotential: null, flame: null };
  if (!config) {
    return result;
  }
  const cube = async (sourceType, section) => {
    const rows = normalizeOptionRows(item?.[SECTION_SOURCE[section].optionsKey]);
    const context = await loadCubeContext(item, sourceType, config, slotKind, rows);
    if (!context) return null;
    const tableByGrade = (await loadProbabilityTable(context.fileName))?.[context.tableKey] || {};
    const grades = {};
    for (const [grade, bucket] of Object.entries(tableByGrade)) {
      grades[grade] = LINE_BUCKET_KEYS.map((_, index) =>
        lineRowsFor(bucket, index)
          .map((row) => ({
            option: String(row?.option || "").trim(),
            value: String(row?.value || "").trim(),
            p: parseProbabilityPercent(row?.p),
          }))
          .filter((row) => row.option && row.p > 0),
      );
    }
    return { grade: context.gradeKey, lineCount: Math.max(1, readOptionLines(item, section).length), grades };
  };
  const flame = async () => {
    const fileName = FLAME_FILE_BY_SLOT[slotKind];
    const masteryTable = (await loadProbabilityTable(MASTERY_FILE)) || {};
    const flameName = resolveFlameName(item, masteryTable);
    if (!fileName || !flameName) return null;
    const block = (await loadProbabilityTable(fileName))?.[flameName];
    const levelKey = block ? resolveFlameLevelKey(block, item, slotKind) : null;
    if (!levelKey) return null;
    const options = (block.options || [])
      .map((option) => {
        const range = option?.ranges?.[levelKey];
        return {
          option: String(option?.option || "").trim(),
          p: parseProbabilityPercent(option?.p),
          min: parseFlameNumber(range?.min),
          max: parseFlameNumber(range?.max),
          step: parseFlameNumber(option?.step),
          percent: String(range?.min || "").includes("%") || String(option?.step || "").includes("%"),
        };
      })
      .filter((option) => option.option && option.p > 0 && option.min !== null && option.max !== null && option.step);
    return { flameName, twoOptionChance: parseProbabilityPercent(block.two_option_chance) / 100, options };
  };
  const [potential, additionalPotential, flameTable] = await Promise.all([
    cube("potential", "potential"),
    cube("additional", "additionalPotential"),
    flame(),
  ]);
  return { potential, additionalPotential, flame: flameTable };
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
  captionFromBreakdown,
  resolveOptionCandidates,
  resolveRollTables,
  FLAME_SCORE_WEIGHTS,
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
