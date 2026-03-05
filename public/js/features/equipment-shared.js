import {
  abbreviateEquipmentOptionName,
  sanitizeEquipmentText,
  escapeHtml,
  formatNumber,
  formatPercentValue,
  normalizeForMatch,
  parseNumericValue,
  potentialTierAssets,
  toArray,
} from "../core/common.js";

function resolveEquipmentGradeClass(itemGrade) {
  const grade = normalizeForMatch(itemGrade);
  if (!grade) return "";
  if (grade.includes("레전") || grade.includes("legendary")) {
    return "equip-item-grade--legendary";
  }
  if (grade.includes("유니크") || grade.includes("unique")) {
    return "equip-item-grade--unique";
  }
  if (grade.includes("에픽") || grade.includes("epic")) {
    return "equip-item-grade--epic";
  }
  if (grade.includes("레어") || grade.includes("rare")) {
    return "equip-item-grade--rare";
  }
  return "";
}

function resolveEquipmentGradeKey(itemGrade) {
  const grade = normalizeForMatch(itemGrade);
  if (!grade) return "";
  if (grade.includes("레전") || grade.includes("legendary")) return "legendary";
  if (grade.includes("유니크") || grade.includes("unique")) return "unique";
  if (grade.includes("에픽") || grade.includes("epic")) return "epic";
  if (grade.includes("레어") || grade.includes("rare")) return "rare";
  return "";
}

function resolvePotentialTierKey(optionList, potentialGradeText = "") {
  const options = toArray(optionList);
  if (!options.length) {
    return "";
  }

  const mapPotentialGradeValueToTier = (value) => {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return "";
    if (text === "4") return "legendary";
    if (text === "3") return "unique";
    if (text === "2") return "epic";
    if (text === "1") return "rare";
    const normalized = normalizeForMatch(text);
    if (
      normalized.includes(normalizeForMatch("레전더리")) ||
      normalized.includes("legendary")
    )
      return "legendary";
    if (
      normalized.includes(normalizeForMatch("유니크")) ||
      normalized.includes("unique")
    )
      return "unique";
    if (
      normalized.includes(normalizeForMatch("에픽")) ||
      normalized.includes("epic")
    )
      return "epic";
    if (
      normalized.includes(normalizeForMatch("레어")) ||
      normalized.includes("rare")
    )
      return "rare";
    return "";
  };

  const gradeText = String(potentialGradeText || "").trim();
  const mappedFromPotentialGrade = mapPotentialGradeValueToTier(gradeText);
  if (mappedFromPotentialGrade) {
    return mappedFromPotentialGrade;
  }

  for (const option of options) {
    const mappedFromOptionGrade = mapPotentialGradeValueToTier(option?.optionGrade);
    if (mappedFromOptionGrade) {
      return mappedFromOptionGrade;
    }
  }

  const normalizedGrade = normalizeForMatch(gradeText);
  if (
    normalizedGrade.includes(normalizeForMatch("레전더리")) ||
    normalizedGrade.includes("legendary")
  ) {
    return "legendary";
  }
  if (
    normalizedGrade.includes(normalizeForMatch("유니크")) ||
    normalizedGrade.includes("unique")
  ) {
    return "unique";
  }
  if (
    normalizedGrade.includes(normalizeForMatch("에픽")) ||
    normalizedGrade.includes("epic")
  ) {
    return "epic";
  }
  if (
    normalizedGrade.includes(normalizeForMatch("레어")) ||
    normalizedGrade.includes("rare")
  ) {
    return "rare";
  }

  const text = `${options
    .map((option) => `${option?.name || ""} ${option?.value || ""}`)
    .join(" ")} ${options
    .map((option) => option?.optionGrade || "")
    .join(" ")}`;
  const normalized = normalizeForMatch(text);
  if (normalized.includes(normalizeForMatch("레전더리")) || normalized.includes("legendary")) {
    return "legendary";
  }
  if (normalized.includes(normalizeForMatch("유니크")) || normalized.includes("unique")) {
    return "unique";
  }
  if (normalized.includes(normalizeForMatch("에픽")) || normalized.includes("epic")) {
    return "epic";
  }
  if (normalized.includes(normalizeForMatch("레어")) || normalized.includes("rare")) {
    return "rare";
  }
  return "";
}

function renderHoverOptionRows(list, emptyText) {
  const options = toArray(list);
  if (!options.length) {
    return `<li class="is-empty">${escapeHtml(emptyText || "옵션 정보 없음")}</li>`;
  }

  return options
    .map((option) => {
      const name = sanitizeEquipmentText(option?.name || "-") || "-";
      const value = sanitizeEquipmentText(option?.value || "-") || "-";
      return `<li><span>${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong></li>`;
    })
    .join("");
}

function renderHoverTierBadge(optionList, potentialGrade, label) {
  const tierKey = resolvePotentialTierKey(optionList, potentialGrade);
  const tier = potentialTierAssets[tierKey] || null;
  if (!tier) {
    return `<span class="equip-hover__tier is-none"><b>${escapeHtml(label)}</b></span>`;
  }

  return `<span class="equip-hover__tier is-${escapeHtml(tierKey)}"><img src="${escapeHtml(tier.icon)}" alt="${escapeHtml(label)}" /><b>${escapeHtml(label)}</b></span>`;
}

function getHoverStarGroupsPerLine() {
  if (typeof window !== "undefined" && window.matchMedia) {
    if (window.matchMedia("(max-width: 620px)").matches) {
      return 2;
    }
    if (window.matchMedia("(max-width: 980px)").matches) {
      return 3;
    }
  }
  return 4;
}

function buildStarGlyphHtml(starforceValue, groupsPerLine = 4) {
  const numeric = parseNumericValue(starforceValue);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }

  const count = Math.max(1, Math.round(numeric));
  const groups = [];
  let remaining = count;

  while (remaining > 0) {
    const groupCount = Math.min(5, remaining);
    groups.push("★".repeat(groupCount));
    remaining -= groupCount;
  }

  const lines = [];
  const normalizedGroupsPerLine = Math.max(1, Math.floor(groupsPerLine) || 1);
  for (let index = 0; index < groups.length; index += normalizedGroupsPerLine) {
    lines.push(groups.slice(index, index + normalizedGroupsPerLine).join(" "));
  }

  return lines.join("<br />");
}

function classifyEquipmentSlot(item) {
  const n = normalizeForMatch(`${item?.slotName || ""} ${item?.pageName || ""}`);
  if (n.includes(normalizeForMatch("보조무기")) || n.includes("subweapon")) {
    return { key: "subWeapon" };
  }
  if (n.includes(normalizeForMatch("엠블렘")) || n.includes("emblem")) {
    return { key: "emblem" };
  }
  if (n.includes(normalizeForMatch("무기")) || n.includes("weapon")) {
    return { key: "weapon" };
  }
  if (n.includes(normalizeForMatch("어깨")) || n.includes(normalizeForMatch("숄더"))) {
    return { key: "shoulder" };
  }
  if (n.includes(normalizeForMatch("망토")) || n.includes("cape")) {
    return { key: "cape" };
  }
  if (n.includes(normalizeForMatch("벨트")) || n.includes("belt")) {
    return { key: "belt" };
  }
  if (n.includes(normalizeForMatch("목걸이")) || n.includes(normalizeForMatch("펜던트"))) {
    if (n.includes("2")) return { key: "necklace2" };
    return { key: "necklace1" };
  }
  if (n.includes(normalizeForMatch("반지")) || n.includes("ring")) {
    if (n.includes("4")) return { key: "ring4" };
    if (n.includes("3")) return { key: "ring3" };
    if (n.includes("2")) return { key: "ring2" };
    return { key: "ring1" };
  }
  if (n.includes(normalizeForMatch("귀고리")) || n.includes("earring")) {
    return { key: "earring" };
  }
  if (n.includes(normalizeForMatch("포켓")) || n.includes("pocket")) {
    return { key: "pocket" };
  }
  if (n.includes(normalizeForMatch("눈장식")) || n.includes("eye")) {
    return { key: "eye" };
  }
  if (n.includes(normalizeForMatch("얼굴장식")) || n.includes("face")) {
    return { key: "face" };
  }
  if (n.includes(normalizeForMatch("뱃지")) || n.includes("badge")) {
    return { key: "badge" };
  }
  if (n.includes(normalizeForMatch("칭호")) || n.includes("title")) {
    return { key: "title" };
  }
  if (n.includes(normalizeForMatch("훈장")) || n.includes("medal")) {
    return { key: "medal" };
  }
  return { key: "" };
}

const hoverSoulSlotKeys = new Set([
  "weapon",
  "subWeapon",
  "emblem",
  "shoulder",
  "cape",
  "belt",
]);
const hoverAccessoryOptionalOptionSlotKeys = new Set([
  "necklace1",
  "necklace2",
  "ring1",
  "ring2",
  "ring3",
  "ring4",
  "earring",
  "pocket",
  "badge",
  "eye",
  "face",
  "title",
  "medal",
]);
function renderEquipmentHoverCard(item) {
  const slot = classifyEquipmentSlot(item);
  const showAttackPower = ["weapon", "subWeapon", "emblem"].includes(slot.key);
  const itemName = sanitizeEquipmentText(item?.itemName || "-") || "-";
  const itemGrade = sanitizeEquipmentText(item?.itemGrade || "-") || "-";
  const itemGradeClass = resolveEquipmentGradeClass(itemGrade);
  const slotName = sanitizeEquipmentText(item?.slotName || "-") || "-";
  const icon = String(item?.itemIcon || "").trim();
  const equipmentLevel = sanitizeEquipmentText(item?.equipmentLevel ?? "-") || "-";
  const combatPower = sanitizeEquipmentText(item?.combatPower ?? "-") || "-";
  const karmaScissorsRemaining = sanitizeEquipmentText(item?.karmaScissorsRemaining ?? "");
  const remainingStarforceExpansion = sanitizeEquipmentText(item?.remainingStarforceExpansion ?? "");
  const starforceValue = item?.starforceUpgrade ?? "-";
  const starGlyphsHtml = buildStarGlyphHtml(
    starforceValue,
    getHoverStarGroupsPerLine(),
  );
  const starforceNumeric = parseNumericValue(starforceValue);
  const starText = Number.isFinite(starforceNumeric)
    ? `⭐ ${Math.round(starforceNumeric)}`
    : `⭐ ${escapeHtml(String(starforceValue || "-"))}`;
  const soulOption = sanitizeEquipmentText(item?.soulInfo?.soulOption || "").trim();
  const additionalOptions = toArray(item?.additionalOption);
  const potentialOptions = toArray(item?.potentialOption);
  const additionalPotentialOptions = toArray(item?.additionalPotentialOption);
  const hideEmptyOptionalOptions = hoverAccessoryOptionalOptionSlotKeys.has(slot.key);
  const miscInfo = [
    karmaScissorsRemaining
      ? `<p><span>남은 카르마의 가위 사용 수</span><strong>${escapeHtml(karmaScissorsRemaining)}</strong></p>`
      : "",
    remainingStarforceExpansion
      ? `<p><span>남은 스타포스 확장 수</span><strong>${escapeHtml(remainingStarforceExpansion)}</strong></p>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const renderOptionBlock = ({
    title,
    list,
    emptyText,
    hideWhenEmpty = false,
    withPotentialTier = false,
    potentialGrade = "",
  }) => {
    const options = toArray(list);
    if (hideWhenEmpty && !options.length) {
      return "";
    }
    const titleHtml = withPotentialTier
      ? renderHoverTierBadge(options, potentialGrade, title)
      : escapeHtml(title);
    return `<div class="equip-hover__option-block"><h5>${titleHtml}</h5><ul>${renderHoverOptionRows(options, emptyText)}</ul></div>`;
  };

  const basicOptionBlock = renderOptionBlock({
    title: "기본 옵션",
    list: item?.basicOption,
    emptyText: "기본 옵션 없음",
  });
  const additionalOptionBlock = renderOptionBlock({
    title: "추가 옵션",
    list: additionalOptions,
    emptyText: "추가 옵션 없음",
    hideWhenEmpty: hideEmptyOptionalOptions,
  });
  const potentialOptionBlock = renderOptionBlock({
    title: "잠재능력",
    list: potentialOptions,
    emptyText: "잠재 옵션 없음",
    hideWhenEmpty: hideEmptyOptionalOptions,
    withPotentialTier: true,
    potentialGrade: item?.potentialGrade,
  });
  const additionalPotentialOptionBlock = renderOptionBlock({
    title: "에디셔널 잠재능력",
    list: additionalPotentialOptions,
    emptyText: "에디 옵션 없음",
    hideWhenEmpty: hideEmptyOptionalOptions,
    withPotentialTier: true,
    potentialGrade: item?.additionalPotentialGrade,
  });
  const soulBlock =
    hoverSoulSlotKeys.has(slot.key) && soulOption
      ? `<div class="equip-hover__option-block equip-hover__option-block--soul"><h5>소울</h5><p>${escapeHtml(soulOption)}</p></div>`
      : "";

  return `<article class="equip-hover-card"><header class="equip-hover__header"><div class="equip-hover__icon-wrap ${escapeHtml(itemGradeClass)}">${icon ? `<img class="equip-hover__icon" src="${escapeHtml(icon)}" alt="${escapeHtml(itemName)}" />` : '<div class="equip-hover__icon equip-hover__icon--empty">NO</div>'}</div><div class="equip-hover__head-meta">${starGlyphsHtml ? `<p class="equip-hover__stars">${starGlyphsHtml}</p>` : ""}<h4 class="equip-hover__name">${escapeHtml(itemName)}</h4><p class="equip-hover__grade"><span>${escapeHtml(itemGrade)}</span><span class="equip-hover__starforce-text">${escapeHtml(starText)}</span></p></div></header><section class="equip-hover__body"><div class="equip-hover__info-grid"><div><span>부위</span><strong>${escapeHtml(slotName)}</strong></div><div><span>장비 레벨</span><strong>${escapeHtml(String(equipmentLevel))}</strong></div><div><span>등급</span><strong>${escapeHtml(itemGrade)}</strong></div>${showAttackPower ? `<div><span>공격력</span><strong>${escapeHtml(String(combatPower))}</strong></div>` : ""}</div>${miscInfo ? `<div class="equip-hover__misc">${miscInfo}</div>` : ""}${basicOptionBlock}${additionalOptionBlock}${potentialOptionBlock}${additionalPotentialOptionBlock}${soulBlock}</section></article>`;
}

function resolveUnionGradeIcon(unionGrade, unionGradeIcon) {
  const provided = String(unionGradeIcon || "").trim();
  if (provided) return provided;

  const normalized = normalizeForMatch(unionGrade);
  const levelMatch = String(unionGrade || "").match(/([1-5])/);
  const level = levelMatch ? Number(levelMatch[1]) : null;
  if (!level || level < 1 || level > 5) return "";

  if (normalized.includes("supreme")) return `/assets/ico-supreme${level}.png`;
  if (normalized.includes("grandmaster"))
    return `/assets/ico-grandmaster${level}.png`;
  if (normalized.includes("master")) return `/assets/ico-master${level}.png`;
  if (normalized.includes("veteran")) return `/assets/ico-veteran${level}.png`;
  if (normalized.includes("nobis")) return `/assets/ico-nobis${level}.png`;

  return "";
}


export {
  buildStarGlyphHtml,
  getHoverStarGroupsPerLine,
  renderEquipmentHoverCard,
  renderHoverOptionRows,
  renderHoverTierBadge,
  resolveEquipmentGradeClass,
  resolveEquipmentGradeKey,
  resolvePotentialTierKey,
  resolveUnionGradeIcon,
};


