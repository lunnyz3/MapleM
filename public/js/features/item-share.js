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
    // If these files are not present in probability/, calculation gracefully falls back.
    potentialFile: "gloves_potential_prob.json.json",
    additionalFile: "gloves_additional_potential_prob.json.json",
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

async function buildTopPercentCaption(item, profileContext = null) {
  const breakdown = await resolveTopPercentBreakdown(item, profileContext);
  const topPercent = normalizeTopPercentValue(breakdown?.totalPercent);
  if (topPercent === null) {
    return DEFAULT_TOP_PERCENT_CAPTION;
  }

  const blackCubeLabel = formatCubeCountLabel(
    resolveExpectedCubeCount(breakdown?.potentialProbability),
  );
  const additionalCubeLabel = formatCubeCountLabel(
    resolveExpectedCubeCount(breakdown?.additionalProbability),
  );
  return `\uC0C1\uC704 ${formatTopPercentValue(topPercent)}%, \uBE14\uB799\uD050\uBE0C ${blackCubeLabel}, \uC5D0\uB514\uC154\uB110 \uD050\uBE0C ${additionalCubeLabel} \uC9DC\uB9AC \uC544\uC774\uD15C\uC785\uB2C8\uB2E4!`;
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

async function resolveSourceProbability(
  item,
  sourceType,
  config,
  validKinds,
  normalizedRows = null,
) {
  const fileName =
    sourceType === "potential" ? config.potentialFile : config.additionalFile;
  if (!fileName) {
    return null;
  }

  const rows = Array.isArray(normalizedRows)
    ? normalizedRows
    : sourceType === "potential"
      ? normalizeOptionRows(item?.potentialOption)
      : normalizeOptionRows(item?.additionalPotentialOption);
  const optionRows = rows.filter((row) => validKinds.has(row.kind));
  if (!optionRows.length) {
    return null;
  }

  const tableData = await loadProbabilityTable(fileName);
  if (!tableData) {
    return null;
  }

  const itemLevel = resolveItemLevel(item);
  const tableKey = resolveTableKey(tableData, config.keyLabel, itemLevel);
  const tableByGrade = tableData?.[tableKey];
  if (!tableByGrade || typeof tableByGrade !== "object") {
    return null;
  }

  const gradeKey = resolveGradeKey(tableByGrade, item, sourceType, optionRows);
  if (resolveGradeRank(gradeKey) < 3) {
    return null;
  }
  const gradeBucket = tableByGrade?.[gradeKey];
  if (!gradeBucket || typeof gradeBucket !== "object") {
    return null;
  }

  let probabilityProduct = 1;
  let usedLines = 0;
  for (const row of optionRows) {
    const lineKey =
      LINE_BUCKET_KEYS[row.sourceIndex] ||
      LINE_BUCKET_KEYS[LINE_BUCKET_KEYS.length - 1];
    const lineRows = gradeBucket?.[lineKey] || gradeBucket?.first || [];
    const lineProbabilityFraction = resolveLineProbabilityFraction(lineRows, row);
    if (lineProbabilityFraction === null) {
      return null;
    }
    probabilityProduct *= lineProbabilityFraction;
    usedLines += 1;
  }

  return usedLines > 0 ? probabilityProduct : null;
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

  const [potentialProbability, additionalProbability] = await Promise.all([
    resolveSourceProbability(
      item,
      "potential",
      config,
      potentialValidKinds,
      potentialRows,
    ),
    resolveSourceProbability(
      item,
      "additional",
      config,
      additionalValidKinds,
      additionalRows,
    ),
  ]);

  const sourceProbabilities = [potentialProbability, additionalProbability].filter(
    (value) => value !== null,
  );
  if (!sourceProbabilities.length) {
    return null;
  }

  const combinedProbability = sourceProbabilities.reduce(
    (product, value) => product * value,
    1,
  );
  return {
    totalPercent: combinedProbability * 100,
    potentialProbability:
      potentialProbability !== null ? Number(potentialProbability) : null,
    additionalProbability:
      additionalProbability !== null ? Number(additionalProbability) : null,
  };
}

async function resolveTopPercent(item, profileContext = null) {
  const breakdown = await resolveTopPercentBreakdown(item, profileContext);
  return breakdown?.totalPercent ?? null;
}

export {
  buildItemShareFileName,
  buildTopPercentCaption,
  resolveTopPercent,
  resolveTopPercentBreakdown,
};
