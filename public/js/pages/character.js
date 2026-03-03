import {
  abbreviateEquipmentOptionName,
  applyPageIdentity,
  bindCharacterSearchForm,
  buildGuildProfileHref,
  buildScopedIdentityLabel,
  equipmentOrder,
  equipmentOrderIndex,
  equipmentSlotLabels,
  escapeHtml,
  formatExpRateText,
  formatKstDateKey,
  formatKstDateLabel,
  formatKstTooltipDateTime,
  formatNumber,
  formatPercentValue,
  formatTimestamp,
  getCharacterRouteInfo,
  magicalJobNames,
  normalizeCharacterLookupErrorMessage,
  normalizeForMatch,
  parseNumericValue,
  parseResponseSafely,
  physicalJobNames,
  rankingDateFloor,
  rankingThumbDefaultSrc,
  renderErrorCard,
  renderLoadingCard,
  renderNotFoundCard,
  resolveWorldIcon,
  sanitizeEquipmentText,
  setMessage,
  setupTabNav,
  toArray,
} from "../core/common.js";
import {
  getKstDateString,
  resolveOverallRankingByOcid,
  resolveRankingGuildMark,
} from "../features/ranking-shared.js";
import { renderGuildTab } from "../features/guild-shared.js";
import {
  renderEquipmentHoverCard,
  renderHoverOptionRows,
  renderHoverTierBadge,
  resolveEquipmentGradeClass,
  resolvePotentialTierKey,
  resolveUnionGradeIcon,
} from "../features/equipment-shared.js";

const resolveJobMode = (p) => {
  const j = normalizeForMatch(p?.jobName || "");
  const c = normalizeForMatch(p?.className || "");
  if (magicalJobNames.has(j) || magicalJobNames.has(c)) return "magical";
  if (physicalJobNames.has(j) || physicalJobNames.has(c)) return "physical";
  return "physical";
};
function classifyEquipmentSlot(item) {
  const n = normalizeForMatch(
    `${item?.slotName || ""} ${item?.pageName || ""}`,
  );
  if (n.includes("보조무기"))
    return { key: "subWeapon", label: equipmentSlotLabels.subWeapon };
  if (n.includes("엠블렘"))
    return { key: "emblem", label: equipmentSlotLabels.emblem };
  if (n.includes("무기"))
    return { key: "weapon", label: equipmentSlotLabels.weapon };
  if (n.includes("모자")) return { key: "hat", label: equipmentSlotLabels.hat };
  if (n.includes("한벌"))
    return { key: "overall", label: equipmentSlotLabels.overall };
  if (n.includes("장갑"))
    return { key: "gloves", label: equipmentSlotLabels.gloves };
  if (n.includes("신발"))
    return { key: "shoes", label: equipmentSlotLabels.shoes };
  if (n.includes("어깨") || n.includes("숄더"))
    return { key: "shoulder", label: equipmentSlotLabels.shoulder };
  if (n.includes("망토"))
    return { key: "cape", label: equipmentSlotLabels.cape };
  if (n.includes("벨트"))
    return { key: "belt", label: equipmentSlotLabels.belt };
  if (n.includes("목걸이") || n.includes("펜던") || n.includes("네클")) {
    if (n.includes("2"))
      return { key: "necklace2", label: equipmentSlotLabels.necklace2 };
    return { key: "necklace1", label: equipmentSlotLabels.necklace1 };
  }
  if (n.includes("반지")) {
    if (n.includes("4"))
      return { key: "ring4", label: equipmentSlotLabels.ring4 };
    if (n.includes("3"))
      return { key: "ring3", label: equipmentSlotLabels.ring3 };
    if (n.includes("2"))
      return { key: "ring2", label: equipmentSlotLabels.ring2 };
    return { key: "ring1", label: equipmentSlotLabels.ring1 };
  }
  if (n.includes("귀고리") || n.includes("귀걸"))
    return { key: "earring", label: equipmentSlotLabels.earring };
  if (n.includes("포켓"))
    return { key: "pocket", label: equipmentSlotLabels.pocket };
  if (n.includes("얼굴장식"))
    return { key: "face", label: equipmentSlotLabels.face };
  if (n.includes("눈장식"))
    return { key: "eye", label: equipmentSlotLabels.eye };
  if (n.includes("하트"))
    return { key: "heart", label: equipmentSlotLabels.heart };
  if (n.includes("뱃지"))
    return { key: "badge", label: equipmentSlotLabels.badge };
  if (n.includes("칭호"))
    return { key: "title", label: equipmentSlotLabels.title };
  if (n.includes("훈장"))
    return { key: "medal", label: equipmentSlotLabels.medal };
  return { key: "unknown", label: item?.slotName || item?.pageName || "-" };
}
function compareEquipmentItems(l, r) {
  const ls = classifyEquipmentSlot(l),
    rs = classifyEquipmentSlot(r);
  const li = equipmentOrderIndex.has(ls.key)
    ? equipmentOrderIndex.get(ls.key)
    : 999;
  const ri = equipmentOrderIndex.has(rs.key)
    ? equipmentOrderIndex.get(rs.key)
    : 999;
  if (li !== ri) return li - ri;
  return String(l?.itemName || "").localeCompare(
    String(r?.itemName || ""),
    "ko-KR",
  );
}
const cashBoardLeftSlotDefs = Object.freeze([
  { key: "weapon", label: "무기" },
  { key: "subWeapon", label: "보조무기" },
  { key: "ring1", label: "반지" },
  { key: "ring2", label: "반지 2" },
  { key: "ring3", label: "반지 3" },
  { key: "ring4", label: "반지 4" },
  { key: "earring", label: "귀고리" },
  { key: "icon", label: "아이콘" },
]);
const cashBoardRightSlotDefs = Object.freeze([
  { key: "hat", label: "모자" },
  { key: "gloves", label: "장갑" },
  { key: "overall2", label: "한벌옷" },
  { key: "overall", label: "한벌옷" },
  { key: "cape", label: "망토" },
  { key: "shoes", label: "신발" },
]);
const cashBoardBottomSlotDefs = Object.freeze([
  { key: "face", label: "얼굴장식" },
  { key: "eye", label: "눈장식" },
  { key: "effect", label: "이펙트" },
  { key: "chair", label: "의자" },
  { key: "mount", label: "탈것" },
]);
const androidBoardLeftSlotDefs = Object.freeze([
  { key: "hat", label: "모자" },
  { key: "top", label: "상의" },
  { key: "cape", label: "망토" },
]);
const androidBoardRightSlotDefs = Object.freeze([
  { key: "gloves", label: "장갑" },
  { key: "bottom", label: "하의" },
  { key: "shoes", label: "신발" },
  { key: "face", label: "얼굴장식" },
]);
function resolveCashSlotKey(slotName) {
  const n = normalizeForMatch(slotName);
  if (!n) return "extra";
  if (n.includes(normalizeForMatch("보조무기"))) return "subWeapon";
  if (n.includes(normalizeForMatch("엠블렘"))) return "emblem";
  if (n.includes(normalizeForMatch("무기"))) return "weapon";
  if (n.includes(normalizeForMatch("모자"))) return "hat";
  if (
    n.includes(normalizeForMatch("목걸이")) ||
    n.includes(normalizeForMatch("펜던")) ||
    n.includes(normalizeForMatch("네클"))
  ) {
    if (n.includes("2")) return "ring4";
    return "ring3";
  }
  if (n.includes(normalizeForMatch("반지"))) {
    if (n.includes("4")) return "ring4";
    if (n.includes("3")) return "ring3";
    if (n.includes("2")) return "ring2";
    return "ring1";
  }
  if (
    n.includes(normalizeForMatch("귀고리")) ||
    n.includes(normalizeForMatch("귀걸"))
  ) {
    return "earring";
  }
  if (
    n.includes(normalizeForMatch("아이콘")) ||
    n.includes(normalizeForMatch("뱃지"))
  ) {
    return "icon";
  }
  if (n.includes(normalizeForMatch("어깨")) || n.includes(normalizeForMatch("숄더"))) {
    return "subWeapon";
  }
  if (n.includes(normalizeForMatch("장갑"))) return "gloves";
  if (n.includes(normalizeForMatch("망토"))) return "cape";
  if (
    n.includes(normalizeForMatch("한벌")) ||
    n.includes(normalizeForMatch("상의")) ||
    n.includes(normalizeForMatch("하의"))
  ) {
    return "overall";
  }
  if (n.includes(normalizeForMatch("신발"))) return "shoes";
  if (n.includes(normalizeForMatch("벨트"))) return "overall2";
  if (n.includes(normalizeForMatch("얼굴장식"))) return "face";
  if (n.includes(normalizeForMatch("눈장식"))) return "eye";
  if (
    n.includes(normalizeForMatch("이펙트")) ||
    n.includes(normalizeForMatch("effect"))
  ) {
    return "effect";
  }
  if (
    n.includes(normalizeForMatch("의자")) ||
    n.includes(normalizeForMatch("chair"))
  ) {
    return "chair";
  }
  if (
    n.includes(normalizeForMatch("탈것")) ||
    n.includes(normalizeForMatch("탑승")) ||
    n.includes(normalizeForMatch("라이딩")) ||
    n.includes(normalizeForMatch("mount"))
  ) {
    return "mount";
  }
  if (n.includes(normalizeForMatch("안드로이드"))) return "android";
  if (n.includes(normalizeForMatch("칭호"))) return "title";
  if (n.includes(normalizeForMatch("훈장"))) return "medal";
  return "extra";
}
function buildCashSlotMap(cashItems) {
  const byKey = new Map();
  const extras = [];
  toArray(cashItems).forEach((item) => {
    const key = resolveCashSlotKey(item?.slotName);
    const normalizedItem = {
      cashItemName: sanitizeEquipmentText(item?.cashItemName || "-") || "-",
      cashItemIcon: String(item?.cashItemIcon || "").trim(),
      slotName: sanitizeEquipmentText(item?.slotName || "-") || "-",
    };
    if (key === "extra" || byKey.has(key)) {
      extras.push(normalizedItem);
      return;
    }
    byKey.set(key, normalizedItem);
  });
  const overallPrimary = byKey.get("overall");
  const overallSecondary = byKey.get("overall2");
  if (overallPrimary && !overallSecondary) {
    byKey.set("overall2", { ...overallPrimary });
  } else if (overallSecondary && !overallPrimary) {
    byKey.set("overall", { ...overallSecondary });
  }
  return { byKey, extras };
}
function renderCashHoverCard(item, slotLabel) {
  const itemName = sanitizeEquipmentText(item?.cashItemName || "-") || "-";
  const icon = String(item?.cashItemIcon || "").trim();
  const resolvedSlot = sanitizeEquipmentText(item?.slotName || slotLabel || "-") || "-";
  return `<article class="cash-hover-card"><header class="cash-hover__header"><div class="cash-hover__icon-wrap">${icon ? `<img class="cash-hover__icon" src="${escapeHtml(icon)}" alt="${escapeHtml(itemName)}" loading="lazy" />` : '<div class="cash-hover__icon cash-hover__icon--empty">NO</div>'}</div><div class="cash-hover__title-wrap"><h4>${escapeHtml(itemName)}</h4><p>${escapeHtml(resolvedSlot)}</p></div></header><section class="cash-hover__body"><dl><div><dt>종류</dt><dd>캐시 장비</dd></div><div><dt>부위</dt><dd>${escapeHtml(resolvedSlot)}</dd></div><div><dt>아이템명</dt><dd>${escapeHtml(itemName)}</dd></div></dl></section></article>`;
}
function renderCashSlotCard(slotDef, slotMap, prefix = "cash") {
  const item = slotMap.byKey.get(slotDef.key) || null;
  const hasItem = !!(item && item.cashItemIcon);
  const dataAttr = `data-cash-slot="${escapeHtml(slotDef.key)}"`;
  if (!item) {
    return `<article class="cash-slot-card is-empty" ${dataAttr}><span class="cash-slot-card__placeholder">${escapeHtml(slotDef.label)}</span></article>`;
  }
  const hoverTemplate = renderCashHoverCard(item, slotDef.label);
  return `<article class="cash-slot-card ${hasItem ? "is-filled" : "is-empty"}" ${dataAttr}>${hasItem ? `<img src="${escapeHtml(item.cashItemIcon)}" alt="${escapeHtml(item.cashItemName)}" loading="lazy" />` : `<span class="cash-slot-card__placeholder">${escapeHtml(slotDef.label)}</span>`}<template class="cash-hover-template">${hoverTemplate}</template></article>`;
}
function renderCashEquipmentBoard(cashItems, profile) {
  const slotMap = buildCashSlotMap(cashItems);
  const leftCards = cashBoardLeftSlotDefs
    .map((slotDef) => renderCashSlotCard(slotDef, slotMap, "left"))
    .join("");
  const rightCards = cashBoardRightSlotDefs
    .map((slotDef) => renderCashSlotCard(slotDef, slotMap, "right"))
    .join("");
  const bottomCards = cashBoardBottomSlotDefs
    .map((slotDef) => renderCashSlotCard(slotDef, slotMap, "bottom"))
    .join("");
  const avatar = String(profile?.imageUrl || "").trim() || rankingThumbDefaultSrc;
  const profileName = String(profile?.name || "-").trim() || "-";
  const levelText = Number.isFinite(parseNumericValue(profile?.level))
    ? `Lv.${parseNumericValue(profile.level)}`
    : "Lv.-";

  return `<article class="data-card cash-board-card"><h3>캐시 장비</h3><div class="cash-board"><div class="cash-board__left">${leftCards}</div><div class="cash-board__center"><div class="cash-board__meta"><strong>${escapeHtml(levelText)}</strong><span>${escapeHtml(profileName)}</span></div><div class="cash-board__avatar-wrap"><img class="cash-board__avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(profileName)} 캐릭터" loading="lazy" /></div></div><div class="cash-board__right">${rightCards}</div></div><div class="cash-board__bottom">${bottomCards}</div></article>`;
}
function resolveAndroidCashSlotKey(slotName) {
  const normalized = normalizeForMatch(slotName);
  if (!normalized) return "extra";
  if (normalized.includes(normalizeForMatch("모자"))) return "hat";
  if (
    normalized.includes(normalizeForMatch("상의")) ||
    normalized.includes(normalizeForMatch("한벌"))
  ) {
    return "top";
  }
  if (normalized.includes(normalizeForMatch("하의"))) return "bottom";
  if (normalized.includes(normalizeForMatch("망토"))) return "cape";
  if (normalized.includes(normalizeForMatch("장갑"))) return "gloves";
  if (normalized.includes(normalizeForMatch("신발"))) return "shoes";
  if (normalized.includes(normalizeForMatch("얼굴장식"))) return "face";
  return "extra";
}
function buildAndroidCashSlotMap(cashItems) {
  const byKey = new Map();
  const extras = [];
  toArray(cashItems).forEach((item) => {
    const normalizedItem = {
      name: sanitizeEquipmentText(item?.name || "-") || "-",
      icon: String(item?.icon || "").trim(),
      slotName: sanitizeEquipmentText(item?.slotName || "-") || "-",
    };
    const key = resolveAndroidCashSlotKey(normalizedItem.slotName);
    if (key === "extra" || byKey.has(key)) {
      extras.push(normalizedItem);
      return;
    }
    byKey.set(key, normalizedItem);
  });
  return { byKey, extras };
}
function renderAndroidCashHoverCard(item, slotLabel) {
  return renderCashHoverCard(
    {
      cashItemName: item?.name,
      cashItemIcon: item?.icon,
      slotName: item?.slotName,
    },
    slotLabel,
  );
}
function renderAndroidEquipmentHoverCard(androidEquipment) {
  const name = sanitizeEquipmentText(androidEquipment?.androidName || "-") || "-";
  const icon = String(androidEquipment?.androidIcon || "").trim();
  const grade = sanitizeEquipmentText(androidEquipment?.androidGrade || "-") || "-";
  const gender = sanitizeEquipmentText(androidEquipment?.androidGender || "-") || "-";
  const nickname =
    sanitizeEquipmentText(androidEquipment?.androidNickname || "-") || "-";
  const warehouseUsableFlag = String(
    androidEquipment?.warehouseUsableFlag ?? "-",
  ).trim();
  const earSensorClipFlag = String(
    androidEquipment?.earSensorClipFlag ?? "-",
  ).trim();
  const description =
    sanitizeEquipmentText(androidEquipment?.androidDescription || "") || "-";

  return `<article class="cash-hover-card"><header class="cash-hover__header"><div class="cash-hover__icon-wrap">${icon ? `<img class="cash-hover__icon" src="${escapeHtml(icon)}" alt="${escapeHtml(name)}" loading="lazy" />` : '<div class="cash-hover__icon cash-hover__icon--empty">NO</div>'}</div><div class="cash-hover__title-wrap"><h4>${escapeHtml(
    name,
  )}</h4><p>${escapeHtml(
    `${grade} | ${gender}`,
  )}</p></div></header><section class="cash-hover__body"><dl><div><dt>종류</dt><dd>안드로이드</dd></div><div><dt>닉네임</dt><dd>${escapeHtml(
    nickname,
  )}</dd></div><div><dt>창고 이동</dt><dd>${escapeHtml(
    warehouseUsableFlag,
  )}</dd></div><div><dt>이어센서 클립</dt><dd>${escapeHtml(
    earSensorClipFlag,
  )}</dd></div><div><dt>설명</dt><dd>${escapeHtml(
    description,
  )}</dd></div></dl></section></article>`;
}
function renderAndroidHeartHoverCard(heartEquipment) {
  const itemName = sanitizeEquipmentText(heartEquipment?.heartName || "-") || "-";
  const icon = String(heartEquipment?.heartIcon || "").trim();
  const description =
    sanitizeEquipmentText(heartEquipment?.heartDescription || "").trim();
  const additionalOptions = toArray(heartEquipment?.additionalOption);
  const potentialOptions = toArray(heartEquipment?.potentialOption);
  const additionalPotentialOptions = toArray(
    heartEquipment?.additionalPotentialOption,
  );

  const renderOptionBlock = (titleHtml, list, emptyText) =>
    `<div class="equip-hover__option-block"><h5>${titleHtml}</h5><ul>${renderHoverOptionRows(
      list,
      emptyText,
    )}</ul></div>`;
  const descriptionBlock = description
    ? `<div class="equip-hover__misc"><p><span>설명</span><strong>${escapeHtml(description)}</strong></p></div>`
    : "";

  return `<article class="equip-hover-card"><header class="equip-hover__header"><div class="equip-hover__icon-wrap">${icon ? `<img class="equip-hover__icon" src="${escapeHtml(icon)}" alt="${escapeHtml(itemName)}" />` : '<div class="equip-hover__icon equip-hover__icon--empty">NO</div>'}</div><div class="equip-hover__head-meta"><h4 class="equip-hover__name">${escapeHtml(
    itemName,
  )}</h4><p class="equip-hover__grade"><span>하트 장비</span><span class="equip-hover__starforce-text">-</span></p></div></header><section class="equip-hover__body"><div class="equip-hover__info-grid"><div><span>부위</span><strong>하트</strong></div><div><span>아이템명</span><strong>${escapeHtml(
    itemName,
  )}</strong></div></div>${descriptionBlock}${renderOptionBlock(
    "추가 옵션",
    additionalOptions,
    "추가 옵션 없음",
  )}${renderOptionBlock(
    renderHoverTierBadge(potentialOptions, "", "잠재능력"),
    potentialOptions,
    "잠재 옵션 없음",
  )}${renderOptionBlock(
    renderHoverTierBadge(additionalPotentialOptions, "", "에디셔널 잠재능력"),
    additionalPotentialOptions,
    "에디셔널 잠재 옵션 없음",
  )}</section></article>`;
}
function renderAndroidCashSlotCard(slotDef, slotMap) {
  const item = slotMap.byKey.get(slotDef.key) || null;
  const hasItem = !!(item && item.icon);
  const dataAttr = `data-cash-slot="android-${escapeHtml(slotDef.key)}"`;

  if (!item) {
    return `<article class="cash-slot-card android-slot-card is-empty" ${dataAttr}><span class="cash-slot-card__placeholder">${escapeHtml(slotDef.label)}</span></article>`;
  }

  const hoverTemplate = renderAndroidCashHoverCard(item, slotDef.label);
  return `<article class="cash-slot-card android-slot-card ${hasItem ? "is-filled" : "is-empty"}" ${dataAttr}>${hasItem ? `<img src="${escapeHtml(item.icon)}" alt="${escapeHtml(item.name)}" loading="lazy" />` : `<span class="cash-slot-card__placeholder">${escapeHtml(slotDef.label)}</span>`}<template class="cash-hover-template">${hoverTemplate}</template></article>`;
}
function renderAndroidMainSlotCard(kind, androidEquipment, heartEquipment) {
  const isHeart = kind === "heart";
  const name = isHeart
    ? sanitizeEquipmentText(heartEquipment?.heartName || "-") || "-"
    : sanitizeEquipmentText(androidEquipment?.androidName || "-") || "-";
  const icon = isHeart
    ? String(heartEquipment?.heartIcon || "").trim()
    : String(androidEquipment?.androidIcon || "").trim();
  const slotLabel = isHeart ? "하트" : "안드로이드";
  const hasItem = !!icon;
  const hoverTemplate = isHeart
    ? `<template class="equip-hover-template">${renderAndroidHeartHoverCard(
        heartEquipment,
      )}</template>`
    : `<template class="cash-hover-template">${renderAndroidEquipmentHoverCard(
        androidEquipment,
      )}</template>`;

  return `<article class="cash-slot-card android-main-slot ${hasItem ? "is-filled" : "is-empty"}" data-cash-slot="android-main-${escapeHtml(
    kind,
  )}">${hasItem ? `<img src="${escapeHtml(icon)}" alt="${escapeHtml(name)}" loading="lazy" />` : `<span class="cash-slot-card__placeholder">${escapeHtml(
    slotLabel,
  )}</span>`}<p class="android-main-slot__name">${escapeHtml(
    slotLabel,
  )}</p>${hasItem ? hoverTemplate : ""}</article>`;
}
function collectDamageAndBossOptions(list) {
  const t = {
    physicalDamage: 0,
    magicalDamage: 0,
    bossDamage: 0,
    expGain: 0,
    maxHp: 0,
    itemDrop: 0,
    expGainPercent: false,
    maxHpPercent: false,
    itemDropPercent: false,
  };
  toArray(list).forEach((o) => {
    const optionName = String(o?.name || o?.option_name || "");
    const optionValue = String(o?.value || o?.option_value || "");
    const rawOption = `${optionName} ${optionValue}`;
    const n = normalizeForMatch(optionName);
    const v = parseNumericValue(optionValue);
    const hasPercent = rawOption.includes("%");
    if (!Number.isFinite(v)) return;
    if (
      n.includes(normalizeForMatch("물리대미지")) ||
      n.includes(normalizeForMatch("물리데미지"))
    ) {
      t.physicalDamage += v;
      return;
    }
    if (
      n.includes(normalizeForMatch("마법대미지")) ||
      n.includes(normalizeForMatch("마법데미지"))
    ) {
      t.magicalDamage += v;
      return;
    }
    if (n.includes(normalizeForMatch("보스공격력"))) {
      t.bossDamage += v;
      return;
    }
    if (n.includes(normalizeForMatch("경험치획득량"))) {
      t.expGain += v;
      t.expGainPercent = t.expGainPercent || hasPercent;
      return;
    }
    if (
      n.includes(normalizeForMatch("최대hp")) ||
      n.includes(normalizeForMatch("최대체력"))
    ) {
      t.maxHp += v;
      t.maxHpPercent = t.maxHpPercent || hasPercent;
      return;
    }
    if (
      n.includes(normalizeForMatch("아이템드롭률")) ||
      n.includes(normalizeForMatch("드롭률"))
    ) {
      t.itemDrop += v;
      t.itemDropPercent = t.itemDropPercent || hasPercent;
    }
  });
  return t;
}
function formatPotentialValue(value, hasPercent) {
  if (!Number.isFinite(value)) return "-";
  return hasPercent ? formatPercentValue(value) : formatNumber(value);
}
function buildPotentialSummary(label, list, mode) {
  const t = collectDamageAndBossOptions(list);
  const p = [];
  if (mode === "magical") {
    if (t.magicalDamage > 0)
      p.push(`마뎀 ${formatPercentValue(t.magicalDamage)}`);
  } else if (t.physicalDamage > 0)
    p.push(`물뎀 ${formatPercentValue(t.physicalDamage)}`);
  if (t.bossDamage > 0) p.push(`보공 ${formatPercentValue(t.bossDamage)}`);
  if (t.expGain > 0)
    p.push(`경획 ${formatPotentialValue(t.expGain, t.expGainPercent)}`);
  if (t.maxHp > 0)
    p.push(`최대 HP ${formatPotentialValue(t.maxHp, t.maxHpPercent)}`);
  if (t.itemDrop > 0)
    p.push(`드롭 ${formatPotentialValue(t.itemDrop, t.itemDropPercent)}`);
  return p.length ? `${label}: ${p.join(" / ")}` : "";
}
function buildPotentialOptionPreview(list, maxCount = 3) {
  return toArray(list)
    .map((option) => {
      const name = sanitizeEquipmentText(option?.name || "").trim();
      const value = sanitizeEquipmentText(option?.value || "").trim();
      const shortName = abbreviateEquipmentOptionName(name);
      return `${shortName} ${value}`.trim();
    })
    .filter(Boolean)
    .slice(0, maxCount)
    .join(" ");
}
function renderEquipmentPotentialLine(label, list, tierKey) {
  const preview = buildPotentialOptionPreview(list);
  if (!preview) return "";
  return `<span class="equip-option-line ${tierKey ? `is-${escapeHtml(tierKey)}` : "is-none"}"><em>${escapeHtml(label)}</em><span>${escapeHtml(preview)}</span></span>`;
}
function renderEquipmentSoulLine(text, mode) {
  const summary = String(buildSoulSummary(text, mode) || "").replace(/^소울:\s*/u, "").trim();
  if (!summary) return "";
  return `<span class="equip-option-line equip-option-line--soul"><em>소울</em><span>${escapeHtml(summary)}</span></span>`;
}
function buildSoulSummary(text, mode) {
  const s = sanitizeEquipmentText(text).trim();
  if (!s) return "";
  const t = {
    physicalDamage: 0,
    magicalDamage: 0,
    bossDamage: 0,
    finalDamage: 0,
  };
  s.split(",").forEach((seg) => {
    const x = String(seg || "").trim();
    if (!x) return;
    const n = normalizeForMatch(x);
    const v = parseNumericValue(x);
    if (!Number.isFinite(v)) return;
    if (
      n.includes(normalizeForMatch("물리대미지")) ||
      n.includes(normalizeForMatch("물리데미지"))
    ) {
      t.physicalDamage += v;
      return;
    }
    if (
      n.includes(normalizeForMatch("마법대미지")) ||
      n.includes(normalizeForMatch("마법데미지"))
    ) {
      t.magicalDamage += v;
      return;
    }
    if (n.includes(normalizeForMatch("보스공격력"))) {
      t.bossDamage += v;
      return;
    }
    if (
      n.includes(normalizeForMatch("최종대미지")) ||
      n.includes(normalizeForMatch("최종데미지"))
    )
      t.finalDamage += v;
  });
  const p = [];
  if (mode === "magical") {
    if (t.magicalDamage > 0)
      p.push(`마뎀 ${formatPercentValue(t.magicalDamage)}`);
  } else if (t.physicalDamage > 0)
    p.push(`물뎀 ${formatPercentValue(t.physicalDamage)}`);
  if (t.bossDamage > 0) p.push(`보공 ${formatPercentValue(t.bossDamage)}`);
  if (t.finalDamage > 0) p.push(`최종 ${formatPercentValue(t.finalDamage)}`);
  return p.length ? `소울: ${p.join(" / ")}` : `소울: ${s}`;
}
const renderOptionList = (list) => {
  const items = toArray(list);
  if (!items.length) return '<li class="empty">옵션 없음</li>';
  return items
    .map(
      (o) =>
        `<li><span>${escapeHtml(sanitizeEquipmentText(o?.name || o?.option_name || "-") || "-")}</span><strong>${escapeHtml(sanitizeEquipmentText(o?.value || o?.option_value || "-") || "-")}</strong></li>`,
    )
    .join("");
};
function splitOptionText(text) {
  const source = String(text || "").trim();
  if (!source) {
    return [];
  }

  const segments = [];
  let current = "";

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (ch === "," || ch === "\n" || ch === "|") {
      if (ch === ",") {
        const prev = source[i - 1] || "";
        let nextIndex = i + 1;
        while (source[nextIndex] === " ") {
          nextIndex += 1;
        }
        const next = source[nextIndex] || "";
        const isThousandsSeparator = /\d/.test(prev) && /\d/.test(next);
        if (isThousandsSeparator) {
          current += ch;
          continue;
        }
      }

      if (current.trim()) {
        segments.push(current.trim());
      }
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}
function parseSetCountMeta(setCount) {
  const label = String(setCount ?? "-").trim() || "-";
  const matched = label.match(/(\d+)\s*\/\s*(\d+)/);
  if (!matched) {
    return { label, ratio: 0 };
  }

  const current = Number(matched[1]);
  const total = Number(matched[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return { label, ratio: 0 };
  }

  return {
    label,
    ratio: Math.max(0, Math.min(1, current / total))
  };
}
function renderMajorStats(profile, options = {}) {
  const majorStats = profile?.majorStats || {};
  const mode = resolveJobMode(profile);
  const collapseLimitRaw = Number(options?.collapseLimit || 0);
  const collapseLimit =
    Number.isFinite(collapseLimitRaw) && collapseLimitRaw > 0
      ? Math.floor(collapseLimitRaw)
      : 0;
  const listId = String(options?.listId || "").trim();
  const order = toArray(profile?.majorStatOrder).length
    ? profile.majorStatOrder
    : [
        "physicalAttack",
        "physicalAttackPercent",
        "physicalDamagePercent",
        "bossDamage",
        "criticalDamage",
        "finalDamage",
        "maxDamage",
        "ignoreDefense",
      ];
  const rowList = order
    .map((key) => {
      const stat = majorStats[key];
      if (!stat) return "";
      const list = toArray(stat.breakdown).length
        ? stat.breakdown
            .map(
              (e) =>
                `<li><span>${escapeHtml(e.source || "-")}</span><strong>${escapeHtml(e.displayValue || "-")}</strong></li>`,
            )
            .join("")
        : '<li class="empty">기여 항목이 없습니다.</li>';
      return `<details class="major-row"><summary class="major-row__summary"><span class="major-row__label">${escapeHtml(stat.label || key)}</span><strong class="major-row__value">${escapeHtml(stat.displayValue || "-")}</strong></summary><ul class="major-row__list">${list}</ul></details>`;
    })
    .filter(Boolean)
  if (!rowList.length) return "";
  const rows = rowList.join("");
  const listClass = [
    "major-stats__list",
    collapseLimit > 0 && rowList.length > collapseLimit ? "is-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const listAttrs = [
    listId ? `id="${escapeHtml(listId)}"` : "",
    `class="${escapeHtml(listClass)}"`,
  ]
    .filter(Boolean)
    .join(" ");
  const moreButton =
    collapseLimit > 0 && rowList.length > collapseLimit && listId
      ? `<button type="button" class="section-more-btn" data-expand-target="#${escapeHtml(listId)}" data-expand-label-close="더보기" data-expand-label-open="접기">더보기</button>`
      : "";

  return `<section class="major-stats major-stats--compact"><div ${listAttrs}>${rows}</div>${moreButton}</section>`;
}
function renderProfile(profile, query) {
  const profileImage = String(profile?.imageUrl || "").trim() || rankingThumbDefaultSrc;
  const profileName = String(profile?.name || "-");
  const worldName = query.worldNameCanonical || "-";
  const worldIcon = resolveWorldIcon(worldName);
  const guildMark = String(profile?.guildMarkIcon || "").trim();
  const guildName = String(profile?.guildName || "-").trim() || "-";
  const rankingValueFromProfile = parseNumericValue(profile?.overallRanking);
  const rankingValueFromText = parseNumericValue(profile?.overallRankingText);
  const rankingValueFallback = parseNumericValue(profile?.ranking);
  const overallRankingValue =
    rankingValueFromProfile !== null
      ? rankingValueFromProfile
      : rankingValueFromText !== null
        ? rankingValueFromText
        : rankingValueFallback;
  const overallRankingText = overallRankingValue !== null && overallRankingValue > 0
    ? `전체랭킹 ${formatNumber(overallRankingValue)}위`
    : "전체랭킹 -";
  const expRateText = formatExpRateText(profile?.expRate ?? profile?.expText);
  const levelText = `Lv.${String(profile?.level || "-")}`;
  const percentText = expRateText === "-" ? "" : expRateText;
  const progressValueRaw = parseNumericValue(profile?.expRate);
  const progressValue =
    progressValueRaw === null
      ? 0
      : Math.max(0, Math.min(100, Number(progressValueRaw)));
  const rankingHref = (() => {
    const today = getKstDateString();
    const date = today < rankingDateFloor ? rankingDateFloor : today;
    const queryParams = new URLSearchParams({
      type: "level",
      date,
    });
    if (profileName && profileName !== "-") {
      queryParams.set("character_name", profileName);
    }
    if (worldName && worldName !== "-") {
      queryParams.set("character_world_name", worldName);
    }
    const queryText = queryParams.toString();
    return `/ranking.html?${queryText}`;
  })();
  const guildHref = buildGuildProfileHref(worldName, guildName);
  const guildChip = guildHref
    ? `<a class="char-hero__chip char-hero__chip--guild" href="${escapeHtml(
        guildHref,
      )}">${guildMark ? `<img class="char-hero__guild-mark" src="${escapeHtml(
        guildMark,
      )}" alt="${escapeHtml(
        guildName,
      )} 마크" loading="lazy" />` : ""}<span>${escapeHtml(
        guildName,
      )}</span><b>›</b></a>`
    : `<span class="char-hero__chip char-hero__chip--guild">${guildMark ? `<img class="char-hero__guild-mark" src="${escapeHtml(
        guildMark,
      )}" alt="${escapeHtml(
        guildName,
      )} 마크" loading="lazy" />` : ""}<span>${escapeHtml(
        guildName,
      )}</span><b>›</b></span>`;

  return `<section class="char-hero"><article class="char-hero__card"><div class="char-hero__main"><div class="char-hero__avatar-wrap"><img class="profile-avatar" src="${escapeHtml(profileImage)}" alt="${escapeHtml(profileName)} 이미지" loading="lazy" /></div><div class="char-hero__body"><div class="char-hero__head"><h1>${escapeHtml(profileName)}</h1><span class="char-hero-world">${worldIcon ? `<img src="${escapeHtml(worldIcon)}" alt="${escapeHtml(worldName)}" />` : ""}${escapeHtml(worldName)}</span></div><p class="char-hero__level"><span class="char-hero__level-main">${escapeHtml(levelText)}</span>${percentText ? `<span class="char-hero__level-rate">${escapeHtml(percentText)}</span>` : ""}</p><div class="char-hero__progress" role="img" aria-label="${escapeHtml(`경험치 ${expRateText}`)}"><span style="width:${escapeHtml(progressValue.toFixed(2))}%"></span></div><div class="char-hero__chips"><span class="char-hero__chip">${escapeHtml(profile.className || "-")}</span><a class="char-hero__chip char-hero__chip--rank" href="${escapeHtml(rankingHref)}"><span>${escapeHtml(overallRankingText)}</span><b>›</b></a>${guildChip}</div></div></div></article></section>`;
}
function resolveSelectedPresetNo(tabKey, tabData, state) {
  const selected = parseNumericValue(state.selectedPresetByTab[tabKey]);
  const nos = toArray(tabData?.presets)
    .map((p) => parseNumericValue(p?.presetNo))
    .filter((n) => n !== null);
  if (selected !== null && nos.includes(selected)) return selected;
  const active = parseNumericValue(tabData?.activePresetNo);
  if (active !== null && nos.includes(active)) return active;
  return nos.length ? nos[0] : null;
}
function resolveSelectedPreset(tabKey, tabData, state) {
  const no = resolveSelectedPresetNo(tabKey, tabData, state);
  if (no === null) return null;
  return (
    toArray(tabData?.presets).find(
      (p) => parseNumericValue(p?.presetNo) === no,
    ) || null
  );
}
function renderEquipmentTab(tabData, profile, state) {
  const selected = resolveSelectedPreset("equipment", tabData, state);
  const data = selected?.data || {};
  const mode = resolveJobMode(profile || {});
  const items = toArray(data.itemEquipment).sort(compareEquipmentItems);
  const equipmentCardLimit = 9;
  const equipmentGridId = "equipCardGrid";
  const equipmentCards = items.length
    ? items
        .map((item) => {
          const slot = classifyEquipmentSlot(item);
          const slotLabel = sanitizeEquipmentText(slot.label) || "-";
          const itemName = sanitizeEquipmentText(item.itemName || "-") || "-";
          const itemGrade = sanitizeEquipmentText(item.itemGrade || "-") || "-";
          const itemGradeClass = resolveEquipmentGradeClass(itemGrade);
          const icon = item.itemIcon
            ? `<img src="${escapeHtml(item.itemIcon)}" alt="${escapeHtml(itemName || "아이템")}" />`
            : '<div class="item-icon-empty">NO</div>';
          const sf = parseNumericValue(item?.starforceUpgrade);
          const sfTag = Number.isFinite(sf)
            ? `<span class="item-sf">+${escapeHtml(String(Math.round(sf)))}</span>`
            : "";
          const potentialTierKey = resolvePotentialTierKey(
            item?.potentialOption,
            item?.potentialGrade,
          );
          const additionalPotentialTierKey = resolvePotentialTierKey(
            item.additionalPotentialOption,
            item.additionalPotentialGrade,
          );
          const potentialLine = renderEquipmentPotentialLine(
            "잠재",
            item?.potentialOption,
            potentialTierKey,
          );
          const additionalPotentialLine = renderEquipmentPotentialLine(
            "에디",
            item?.additionalPotentialOption,
            additionalPotentialTierKey,
          );
          const soulLine = renderEquipmentSoulLine(item?.soulInfo?.soulOption, mode);
          const summaryLines = [potentialLine, additionalPotentialLine, soulLine].filter(Boolean);
          const starforceText = Number.isFinite(sf)
            ? `⭐ ${Math.round(sf)}`
            : `⭐ ${item.starforceUpgrade ?? "-"}`;
          const summaryBlock =
            summaryLines.length
              ? summaryLines.join("")
              : "";

          const hoverTemplate = renderEquipmentHoverCard(item);

          return `<article class="equip-card"><div class="equip-card__summary"><p class="equip-card__slot">${escapeHtml(
            slotLabel,
          )}</p><div class="equip-item-main"><div class="item-icon-wrap">${icon}${sfTag}</div><div><strong>${escapeHtml(
            itemName,
          )}</strong><p><span class="equip-item-grade ${escapeHtml(
            itemGradeClass,
          )}">${escapeHtml(itemGrade)}</span> | ${escapeHtml(starforceText)}</p></div></div><div class="equip-option-chips">${summaryBlock}</div></div><template class="equip-hover-template">${hoverTemplate}</template></article>`;
        })
        .join("")
    : '<p class="empty">장비 데이터가 없습니다.</p>';
  const equipmentGridClass = [
    "equip-card-grid",
    items.length > equipmentCardLimit ? "is-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const equipmentMoreButton =
    items.length > equipmentCardLimit
      ? `<button type="button" class="section-more-btn" data-expand-target="#${equipmentGridId}" data-expand-label-close="더보기" data-expand-label-open="접기">더보기</button>`
      : "";
  const cashFromSelected = toArray(data.cashItemEquipment);
  const additionalCashFromSelected = toArray(data.additionalCashItemEquipment);
  const firstPresetWithCash =
    toArray(tabData?.presets)
      .map((preset) => toArray(preset?.data?.cashItemEquipment))
      .find((list) => list.length > 0) || [];
  const firstPresetWithAdditionalCash =
    toArray(tabData?.presets)
      .map((preset) => toArray(preset?.data?.additionalCashItemEquipment))
      .find((list) => list.length > 0) || [];
  const cashBase = cashFromSelected.length ? cashFromSelected : firstPresetWithCash;
  const additionalCashBase = additionalCashFromSelected.length
    ? additionalCashFromSelected
    : firstPresetWithAdditionalCash;
  const cash = [...cashBase, ...additionalCashBase].filter(
    (item, index, array) =>
      index ===
      array.findIndex(
        (target) =>
          String(target?.cashItemName || "").trim() ===
            String(item?.cashItemName || "").trim() &&
          String(target?.slotName || "").trim() ===
            String(item?.slotName || "").trim() &&
          String(target?.cashItemIcon || "").trim() ===
            String(item?.cashItemIcon || "").trim(),
      ),
  );
  const cashBoard = renderCashEquipmentBoard(cash, profile);
  const androidBoard = renderAndroidBoardCard(
    state.pageData?.tabs?.android || {},
    state,
  );
  const statsPanel = renderMajorStats(profile);
  return `<section class="tab-grid"><div class="char-equip-layout"><article class="data-card char-stat-panel"><h3>주요스탯</h3>${statsPanel || '<p class="empty">스탯 정보가 없습니다.</p>'}</article><article class="data-card char-equip-panel"><div class="char-equip-panel__head"><h3>장비</h3>${renderJewelPresetSwitch(
    "equipment",
    tabData,
    state,
    "장비 프리셋",
  )}</div><div id="${equipmentGridId}" class="${escapeHtml(equipmentGridClass)}">${equipmentCards}</div>${equipmentMoreButton}</article></div><div class="char-cash-android-layout">${cashBoard}${androidBoard}</div></section>`;
}
function buildDailySnapshotsFromHistory(expHistoryState) {
  const sourcePoints = toArray(expHistoryState?.data?.points)
    .map((point) => ({
      ts: point?.ts,
      exp: parseNumericValue(point?.exp),
      expRate: parseNumericValue(point?.expRate),
      level: parseNumericValue(point?.level),
    }))
    .filter((point) => point.ts && !Number.isNaN(new Date(point.ts).getTime()))
    .sort(
      (left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime(),
    );
  const pointByTs = new Map(
    sourcePoints.map((point) => [String(point.ts), point]),
  );

  const apiSnapshots = toArray(expHistoryState?.data?.dailySnapshots)
    .map((point) => ({
      dateKst: String(point?.dateKst || "").trim(),
      ts: point?.ts,
      exp: parseNumericValue(point?.exp),
      expRate:
        parseNumericValue(point?.expRate) ??
        parseNumericValue(pointByTs.get(String(point?.ts || ""))?.expRate),
      level: parseNumericValue(point?.level),
    }))
    .filter((point) => point.ts && !Number.isNaN(new Date(point.ts).getTime()))
    .sort((left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime());

  if (apiSnapshots.length) {
    return apiSnapshots;
  }

  const grouped = new Map();
  sourcePoints.forEach((point) => {
    const dateKst = formatKstDateKey(point.ts);
    if (!dateKst) {
      return;
    }

    const current = grouped.get(dateKst);
    if (!current || new Date(point.ts).getTime() >= new Date(current.ts).getTime()) {
      grouped.set(dateKst, {
        dateKst,
        ts: point.ts,
        exp: point.exp,
        expRate: point.expRate,
        level: point.level,
      });
    }
  });

  return [...grouped.values()].sort(
    (left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime(),
  );
}

function buildExpSeriesForChart(snapshots, expTab, profile) {
  const snapshotItems = toArray(snapshots).filter(
    (item) =>
      Number.isFinite(item?.exp) &&
      item.exp > 0 &&
      item?.ts &&
      !Number.isNaN(new Date(item.ts).getTime()),
  );
  if (snapshotItems.length) {
    const sorted = [...snapshotItems].sort(
      (left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime(),
    );
    return sorted.slice(-7);
  }

  const currentExp = parseNumericValue(expTab?.currentExp);
  if (currentExp === null || currentExp <= 0) {
    return [];
  }

  return [
    {
      ts: new Date().toISOString(),
      exp: currentExp,
      expRate: parseNumericValue(expTab?.currentExpRate ?? profile?.expRate),
      level: parseNumericValue(expTab?.currentLevel ?? profile?.level),
    },
  ];
}

function buildLevelSeriesForChart(snapshots, expHistoryState, expTab, profile) {
  const rawHistoryItems = toArray(expHistoryState?.data?.points)
    .map((point) => ({
      ts: point?.ts,
      level: parseNumericValue(point?.level),
      exp: parseNumericValue(point?.exp),
      expRate: parseNumericValue(point?.expRate),
    }))
    .filter(
      (item) =>
        item?.ts &&
        !Number.isNaN(new Date(item.ts).getTime()) &&
        Number.isFinite(item?.level),
    )
    .sort((left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime());

  const fallbackSnapshotItems = toArray(snapshots)
    .filter((item) => Number.isFinite(item?.level) && item?.ts)
    .sort((left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime());
  const items = rawHistoryItems.length ? rawHistoryItems : fallbackSnapshotItems;

  const levelChanges = [];
  let previousLevel = null;
  items.forEach((item) => {
    const levelValue = parseNumericValue(item.level);
    if (levelValue === null) {
      return;
    }
    if (previousLevel === null || levelValue !== previousLevel) {
      levelChanges.push({
        ...item,
        level: levelValue,
      });
      previousLevel = levelValue;
    }
  });

  const recentChanges = levelChanges.slice(-7);
  if (recentChanges.length >= 2) {
    return recentChanges;
  }

  const fallbackLevel =
    recentChanges.length === 1
      ? parseNumericValue(recentChanges[0]?.level)
      : parseNumericValue(expTab?.currentLevel ?? profile?.level);
  if (fallbackLevel === null) {
    return [];
  }

  const now = new Date();
  const previous = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const currentExp = parseNumericValue(expTab?.currentExp);
  const currentExpRate = parseNumericValue(expTab?.currentExpRate ?? profile?.expRate);
  return [
    {
      ts: previous.toISOString(),
      level: fallbackLevel,
      exp: currentExp,
      expRate: currentExpRate,
    },
    {
      ts: now.toISOString(),
      level: fallbackLevel,
      exp: currentExp,
      expRate: currentExpRate,
    },
  ];
}

function renderExpBarChart(snapshots, expTab, profile) {
  const items = buildExpSeriesForChart(snapshots, expTab, profile);
  if (!items.length) {
    return '<p class="empty">경험치 히스토리가 부족하여 그래프를 표시할 수 없습니다.</p>';
  }

  const maxExp = Math.max(...items.map((item) => item.exp), 1);
  return `<div class="exp-chart-wrap"><div class="exp-bar-chart">${items
    .map((item, index) => {
      const ratio = Math.max(0.08, item.exp / maxExp);
      const height = Math.round(ratio * 236);
      const dateLabel = formatKstDateLabel(item.ts);
      const levelLabel = Number.isFinite(item.level)
        ? `Lv.${formatNumber(item.level)}`
        : "Lv.-";
      const expRateLabel = item.expRate !== null && item.expRate !== undefined
        ? formatExpRateText(item.expRate)
        : "";
      const tooltip = `${formatKstTooltipDateTime(item.ts)} | 총 경험치 ${formatNumber(item.exp)} | ${levelLabel} | ${expRateLabel}`;
      return `<div class="exp-bar-item"><p class="exp-bar-item__top">${escapeHtml(levelLabel)}</p><div class="exp-bar ${index === items.length - 1 ? "is-current" : ""}" style="height:${height}px" title="${escapeHtml(tooltip)}"></div><p class="exp-bar-item__date">${escapeHtml(dateLabel)}</p>${expRateLabel ? `<small class="exp-bar-item__rate">${escapeHtml(expRateLabel)}</small>` : ""}</div>`;
    })
    .join("")}</div></div>`;
}

function renderLevelLineChart(snapshots, expHistoryState, expTab, profile) {
  const items = buildLevelSeriesForChart(snapshots, expHistoryState, expTab, profile);
  if (!items.length) {
    return '<p class="empty">레벨 히스토리를 표시할 데이터가 없습니다.</p>';
  }

  const width = 680;
  const height = 320;
  const paddingX = 42;
  const paddingTop = 36;
  const paddingBottom = 62;
  const values = items.map((item) => item.level);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const isFlatLevel = max === min;

  const points = items.map((item, index) => {
    const x = paddingX + (index / (items.length - 1)) * (width - paddingX * 2);
    const y = isFlatLevel
      ? paddingTop + (height - paddingTop - paddingBottom) / 2
      : height -
        paddingBottom -
        ((item.level - min) / range) * (height - paddingTop - paddingBottom);
    return {
      ...item,
      x,
      y,
    };
  });

  const polyline = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const labels = points
    .map(
      (point) =>
        `<text x="${point.x.toFixed(2)}" y="${(height - 14).toFixed(2)}" text-anchor="middle" class="level-chart__label">${escapeHtml(
          formatKstDateLabel(point.ts),
        )}</text>`,
    )
    .join("");
  const nodes = points
    .map((point) => {
      const expRateText =
        point.expRate !== null && point.expRate !== undefined
          ? formatExpRateText(point.expRate)
          : "-";
      const tooltip = `${formatKstTooltipDateTime(point.ts)} | 총 경험치 ${formatNumber(point.exp)} | 레벨 Lv.${formatNumber(point.level)} | 경험치율 ${expRateText}`;
      return `<g><circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="5.5" class="level-chart__point"><title>${escapeHtml(
        tooltip,
      )}</title></circle><text x="${point.x.toFixed(2)}" y="${(point.y - 10).toFixed(2)}" text-anchor="middle" class="level-chart__value">Lv.${escapeHtml(
        formatNumber(point.level),
      )}</text></g>`;
    })
    .join("");

  return `<div class="level-chart-wrap"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="레벨 그래프"><defs><linearGradient id="levelLineGradientChart" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7ec5ff"></stop><stop offset="100%" stop-color="#2f6bff"></stop></linearGradient></defs><line x1="${paddingX}" y1="${paddingTop}" x2="${paddingX}" y2="${height - paddingBottom}" class="level-chart__axis" /><line x1="${paddingX}" y1="${height - paddingBottom}" x2="${width - paddingX}" y2="${height - paddingBottom}" class="level-chart__axis" /><polyline points="${polyline}" class="level-chart__line" />${nodes}${labels}</svg></div>`;
}

function renderExpTab(expTab, expHistoryState, profile) {
  if (expHistoryState.loading)
    return '<section class="tab-grid exp-grid"><article class="data-card"><h3>경험치 그래프</h3><p class="empty">히스토리를 불러오는 중입니다...</p></article><article class="data-card"><h3>레벨 그래프</h3><p class="empty">히스토리를 불러오는 중입니다...</p></article></section>';

  const snapshots = buildDailySnapshotsFromHistory(expHistoryState);

  return `<section class="tab-grid exp-grid"><article class="data-card"><h3>경험치 그래프</h3>${renderExpBarChart(
    snapshots,
    expTab,
    profile,
  )}</article><article class="data-card"><h3>레벨 그래프</h3>${renderLevelLineChart(
    snapshots,
    expHistoryState,
    expTab,
    profile,
  )}</article></section>`;
}
function splitUnionOptionLabelValue(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    return { name: "", value: "" };
  }

  const matchedValue = text.match(/([+-]?\d[\d,]*(?:\.\d+)?\s*%?)\s*$/);
  if (!matchedValue || matchedValue.index === undefined) {
    return { name: text, value: "" };
  }

  const value = String(matchedValue[1] || "").replace(/\s+/g, "").trim();
  const name = text
    .slice(0, matchedValue.index)
    .replace(/[:\-|]+$/g, "")
    .trim();

  if (!name || !value) {
    return { name: text, value: "" };
  }

  return { name, value };
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
function normalizeUnionOptionRows(optionRows) {
  return toArray(optionRows)
    .map((row) => {
      const directName = String(row?.name || "").trim();
      const directValue = String(row?.value || "").trim();
      if (directName && directValue) {
        return { name: directName, value: directValue };
      }
      if (directName) {
        return splitUnionOptionLabelValue(directName);
      }
      return splitUnionOptionLabelValue(row);
    })
    .filter((row) => String(row?.name || "").trim());
}
function renderUnionStatList(optionRows, emptyText) {
  const rows = normalizeUnionOptionRows(optionRows);
  if (!rows.length) {
    return `<ul class="union-stat-list"><li class="is-empty">${escapeHtml(emptyText || "효과 정보가 없습니다.")}</li></ul>`;
  }
  return `<ul class="union-stat-list">${rows
    .map((row) => {
      if (row.value) {
        return `<li><span>${escapeHtml(row.name)}</span><strong>${escapeHtml(row.value)}</strong></li>`;
      }
      return `<li class="is-single"><span>${escapeHtml(row.name)}</span></li>`;
    })
    .join("")}</ul>`;
}
function renderUnionTab(tabData, state) {
  const selected = resolveSelectedPreset("union", tabData, state);
  const data = selected?.data || {};
  const occupied = toArray(data.occupiedOptions).length
    ? toArray(data.occupiedOptions)
    : toArray(tabData?.activeOccupiedOptions);
  const raider = toArray(data.raiderOptions).length
    ? toArray(data.raiderOptions)
    : toArray(tabData?.activeRaiderOptions);
  const summary = tabData?.summary || {};
  const levelRaw = parseNumericValue(summary.unionLevel);
  const unionLevelText =
    levelRaw === null
      ? String(summary.unionLevel || "-")
      : formatNumber(Math.max(0, Math.floor(levelRaw)));
  const unionGradeText = String(summary.unionGrade || "-").trim() || "-";
  const unionGradeIcon = resolveUnionGradeIcon(
    unionGradeText,
    summary.unionGradeIcon,
  );
  const summarySegments = toArray(summary.unionLevelTotalOptionSegments).length
    ? toArray(summary.unionLevelTotalOptionSegments)
    : splitStatSegments(summary.unionLevelTotalOption || "");
  const totalEffectRows = summarySegments.map((segment) =>
    splitUnionOptionLabelValue(segment),
  );
  return `<section class="tab-grid"><article class="data-card data-card--wide"><div class="union-header"><h3>유니온</h3>${renderJewelPresetSwitch(
    "union",
    tabData,
    state,
    "유니온 프리셋",
  )}</div><div class="union-dashboard"><section class="union-dashboard__left"><div class="union-emblem-wrap">${unionGradeIcon ? `<img class="union-emblem" src="${escapeHtml(unionGradeIcon)}" alt="${escapeHtml(unionGradeText)}" loading="lazy" />` : '<div class="union-emblem union-emblem--empty">UNION</div>'}</div><p class="union-grade-text">${escapeHtml(
    unionGradeText,
  )}</p><p class="union-level-label">유니온 레벨 총합</p><strong class="union-level-value">${escapeHtml(
    unionLevelText,
  )}</strong></section><section class="union-dashboard__right"><article class="union-panel"><h4>레벨 총합 효과 누적</h4>${renderUnionStatList(
    totalEffectRows,
    "레벨 총합 효과 정보가 없습니다.",
  )}</article><article class="union-panel"><h4>전투 지도 적용 효과</h4><div class="union-panel__group"><h5>점령 효과</h5>${renderUnionStatList(
    occupied,
    "적용 점령 효과가 없습니다.",
  )}</div><div class="union-panel__group"><h5>공격대원 효과</h5>${renderUnionStatList(
    raider,
    "적용 공격대 효과가 없습니다.",
  )}</div></article></section></div></article></section>`;
}
function renderAndroidBoardCard(tabData, state) {
  const selected = resolveSelectedPreset("android", tabData, state);
  const data = selected?.data || {};
  const a = data.androidEquipment || {},
    h = data.heartEquipment || {};
  const androidName = sanitizeEquipmentText(a.androidName || "-") || "-";
  const androidNickname =
    sanitizeEquipmentText(a.androidNickname || "").trim() || "-";
  const androidGrade = sanitizeEquipmentText(a.androidGrade || "-") || "-";
  const androidGender = sanitizeEquipmentText(a.androidGender || "-") || "-";
  const androidIcon = String(a.androidIcon || "").trim();
  const subtitleParts = [androidGrade, androidGender].filter(
    (part) => String(part || "").trim() && part !== "-",
  );
  const subtitle = subtitleParts.length
    ? subtitleParts.join(" | ")
    : "안드로이드 정보";

  const cashSlotMap = buildAndroidCashSlotMap(toArray(a.cashItemEquipment));
  const leftSlots = androidBoardLeftSlotDefs
    .map((slotDef) => renderAndroidCashSlotCard(slotDef, cashSlotMap))
    .join("");
  const rightSlots = androidBoardRightSlotDefs
    .map((slotDef) => renderAndroidCashSlotCard(slotDef, cashSlotMap))
    .join("");
  const extraSlots = cashSlotMap.extras.length
    ? cashSlotMap.extras
        .map((item, index) => {
          const key = `extra-${index + 1}`;
          return renderAndroidCashSlotCard(
            { key, label: item.slotName || "기타" },
            { byKey: new Map([[key, item]]) },
          );
        })
        .join("")
    : "";

  const mainSlots = `${renderAndroidMainSlotCard("android", a, h)}${renderAndroidMainSlotCard(
    "heart",
    a,
    h,
  )}`;

  return `<article class="data-card android-board-card"><div class="android-board-card__head"><h3>안드로이드</h3>${renderJewelPresetSwitch(
    "android",
    tabData,
    state,
    "안드로이드 프리셋",
  )}</div><div class="android-board"><div class="android-board__left">${leftSlots}</div><div class="android-board__center"><div class="android-stage"><div class="android-stage__frame">${androidIcon ? `<img class="android-stage__avatar" src="${escapeHtml(androidIcon)}" alt="${escapeHtml(androidName)}" loading="lazy" />` : '<div class="android-stage__empty">NO IMAGE</div>'}</div><div class="android-stage__platform" style="display:flex;align-items:center;justify-content:center;padding:0 10px;"><span style="color:rgba(16,38,10,0.92);font-size:10px;font-weight:900;line-height:1;letter-spacing:0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 0 rgba(255,255,255,0.35);">${escapeHtml(
    androidNickname,
  )}</span></div><div class="android-stage__meta"><strong>${escapeHtml(
    androidName,
  )}</strong><span>${escapeHtml(subtitle)}</span></div></div><div class="android-main-slots">${mainSlots}</div>${extraSlots ? `<div class="android-extra-slots">${extraSlots}</div>` : ""}</div><div class="android-board__right">${rightSlots}</div></div></article>`;
}

const arcaneSymbolFallbackIcons = [
  "/assets/simbol-1.png",
  "/assets/simbol-2.png",
  "/assets/simbol-3.png",
  "/assets/simbol-4.png",
  "/assets/simbol-5.png",
  "/assets/simbol-6.png",
];

function parseSymbolOptionMetric(optionText, labelPattern) {
  const text = String(optionText || "");
  if (!text.trim()) return 0;
  const regex = new RegExp(
    `(?:${labelPattern})[^\\d+.-]*\\+?\\s*([\\d,.]+)`,
    "i",
  );
  const match = text.match(regex);
  if (!match || !match[1]) return 0;
  return parseNumericValue(match[1]) || 0;
}

function resolveSymbolMetrics(symbol, forcePatterns) {
  const forceDirect = parseNumericValue(symbol?.arcaneForce ?? symbol?.authenticForce);
  const physicalAttackDirect = parseNumericValue(symbol?.physicalAttack);
  const magicalAttackDirect = parseNumericValue(symbol?.magicalAttack);
  const criticalDamageDirect = parseNumericValue(symbol?.criticalDamage);
  const optionText = String(symbol?.symbolOption || "");

  const force =
    forceDirect ??
    parseSymbolOptionMetric(optionText, forcePatterns);
  const physicalAttack =
    physicalAttackDirect ??
    parseSymbolOptionMetric(optionText, "물리\\s*공격력|물리공격력");
  const magicalAttack =
    magicalAttackDirect ??
    parseSymbolOptionMetric(optionText, "마법\\s*공격력|마법공격력");
  const criticalDamage =
    criticalDamageDirect ??
    parseSymbolOptionMetric(optionText, "치명타\\s*피해|치명타피해");

  return {
    force: Number.isFinite(force) ? force : 0,
    physicalAttack: Number.isFinite(physicalAttack) ? physicalAttack : 0,
    magicalAttack: Number.isFinite(magicalAttack) ? magicalAttack : 0,
    criticalDamage: Number.isFinite(criticalDamage) ? criticalDamage : 0,
  };
}

function buildSymbolDisplayItems(items, options = {}) {
  const {
    prefixPattern = "",
    orderedNames = [],
    forcePatterns = "아케인\\s*포스|아케인포스",
  } = options;
  const stripPrefix = (rawName) =>
    prefixPattern
      ? String(rawName || "").replace(prefixPattern, "").trim()
      : String(rawName || "").trim();
  const orderMap = new Map(
    orderedNames.map((name, index) => [normalizeForMatch(name), index]),
  );
  const sortedItems = toArray(items)
    .map((symbol, index) => ({
      ...symbol,
      _sourceIndex: index,
      _displayName: stripPrefix(symbol?.symbolName || "-") || "-",
    }))
    .sort((left, right) => {
      const leftIndex = orderMap.get(normalizeForMatch(left._displayName));
      const rightIndex = orderMap.get(normalizeForMatch(right._displayName));
      const safeLeft = Number.isFinite(leftIndex) ? leftIndex : 999;
      const safeRight = Number.isFinite(rightIndex) ? rightIndex : 999;
      if (safeLeft !== safeRight) return safeLeft - safeRight;
      return left._sourceIndex - right._sourceIndex;
    });

  return sortedItems.slice(0, 6).map((symbol, index) => {
    const level = parseNumericValue(symbol?.symbolLevel);
    const isMax = level !== null && level >= 20;
    const metrics = resolveSymbolMetrics(symbol, forcePatterns);
    return {
      ...symbol,
      metrics,
      level,
      isMax,
      levelText: isMax ? "MAX" : level !== null ? `Lv.${formatNumber(level)}` : "Lv.-",
      displayName: symbol._displayName,
      iconUrl:
        String(symbol?.symbolIcon || "").trim() ||
        arcaneSymbolFallbackIcons[index % arcaneSymbolFallbackIcons.length],
    };
  });
}

function renderSymbolBoard(displayItems, options = {}) {
  const {
    boardClass = "",
    summaryTitle = "아케인포스 증가",
    showCriticalDamage = false,
  } = options;
  const totals = displayItems.reduce(
    (acc, item) => {
      acc.force += item.metrics.force;
      acc.physicalAttack += item.metrics.physicalAttack;
      acc.magicalAttack += item.metrics.magicalAttack;
      acc.criticalDamage += item.metrics.criticalDamage;
      return acc;
    },
    { force: 0, physicalAttack: 0, magicalAttack: 0, criticalDamage: 0 },
  );
  const attackTotal = totals.physicalAttack + totals.magicalAttack;
  const criticalDamageText = formatPercentValue(totals.criticalDamage);

  return `<div class="symbol-board ${escapeHtml(boardClass)}"><div class="symbol-board__summary"><p><span>${escapeHtml(
    summaryTitle,
  )}</span><strong>${escapeHtml(
    formatNumber(totals.force),
  )}</strong></p><p><span>공격력</span><strong>${escapeHtml(
    formatNumber(attackTotal),
  )}</strong></p>${showCriticalDamage ? `<p><span>치명타 피해</span><strong>${escapeHtml(criticalDamageText)}</strong></p>` : ""}</div><div class="symbol-board__grid">${displayItems
    .map(
      (item) =>
        `<article class="symbol-card"><div class="symbol-card__icon-wrap"><img src="${escapeHtml(
          item.iconUrl,
        )}" alt="${escapeHtml(item.symbolName || "심볼")}" loading="lazy" /><span class="symbol-card__level">${escapeHtml(
          item.levelText,
        )}</span></div><h4>${escapeHtml(item.displayName || "-")}</h4></article>`,
    )
    .join("")}</div></div>`;
}

function renderArcaneSymbolBoard(arcaneSymbols) {
  const items = toArray(arcaneSymbols);
  if (!items.length) {
    return '<p class="empty">아케인 심볼이 없습니다.</p>';
  }

  const arcaneOrderNames = [
    "소멸의 여로",
    "츄츄 아일랜드",
    "레헬른",
    "아르카나",
    "모라스",
    "에스페라",
  ];
  const displayItems = buildSymbolDisplayItems(items, {
    prefixPattern: /^아케인\s*심볼\s*[:：]?\s*|^아케인심볼\s*[:：]?\s*/i,
    orderedNames: arcaneOrderNames,
    forcePatterns: "아케인\\s*포스|아케인포스",
  });
  return renderSymbolBoard(displayItems, {
    boardClass: "symbol-board--arcane",
    summaryTitle: "아케인포스 증가",
    showCriticalDamage: false,
  });
}

function renderAuthenticSymbolBoard(authenticSymbols) {
  const items = toArray(authenticSymbols);
  if (!items.length) {
    return '<p class="empty">어센틱 심볼이 없습니다.</p>';
  }
  const authenticOrderNames = [
    "아에르",
    "에세테라",
    "세르니움",
    "아르크스",
    "오디움",
    "도원경",
    "아르테리아",
    "카르시온",
  ];
  const displayItems = buildSymbolDisplayItems(items, {
    prefixPattern: /^어센틱\s*심볼\s*[:：]?\s*|^어센틱심볼\s*[:：]?\s*/i,
    orderedNames: authenticOrderNames,
    forcePatterns: "어센틱\\s*포스|어센틱포스|authentic\\s*force",
  });
  return renderSymbolBoard(displayItems, {
    boardClass: "symbol-board--authentic",
    summaryTitle: "어센틱포스 증가",
    showCriticalDamage: true,
  });
}

function renderJewelSymbolVmatrixTab(tabData, state) {
  const selectedPreset = resolveSelectedPreset("jewelSymbolVmatrix", tabData, state);
  const selectedNo = resolveSelectedPresetNo("jewelSymbolVmatrix", tabData, state);
  const presets = toArray(tabData?.presets);
  const data = selectedPreset?.data || {};
  const jewels = toArray(data.jewelInfo);
  const arcane = toArray(tabData?.symbol?.arcaneSymbols);
  const auth = toArray(tabData?.symbol?.authenticSymbols);

  const colorLabelByKey = {
    green: "그린",
    yellow: "옐로",
    blue: "블루",
    red: "레드",
    purple: "퍼플",
  };
  const normalizeJewelThemeKey = (raw) => {
    const value = String(raw || "").toLowerCase();
    if (value.includes("그린") || value.includes("green")) return "green";
    if (value.includes("옐로") || value.includes("yellow") || value.includes("노랑"))
      return "yellow";
    if (value.includes("블루") || value.includes("blue")) return "blue";
    if (value.includes("레드") || value.includes("red")) return "red";
    if (value.includes("퍼플") || value.includes("purple") || value.includes("보라"))
      return "purple";
    return "";
  };
  const resolveJewelThemeKey = () => {
    const fromSet = normalizeJewelThemeKey(tabData?.activeSetOption || "");
    if (fromSet) return fromSet;
    const counts = new Map();
    jewels.forEach((jewel) => {
      const key = normalizeJewelThemeKey(
        `${jewel?.jewelColor || ""} ${jewel?.jewelName || ""}`,
      );
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    if (!counts.size) return "neutral";
    let bestKey = "neutral";
    let bestCount = -1;
    counts.forEach((count, key) => {
      if (count > bestCount) {
        bestCount = count;
        bestKey = key;
      }
    });
    return bestKey;
  };
  const normalizeOptionText = (raw) =>
    String(raw || "")
      .replace(/\s+/g, " ")
      .trim();
  const buildJewelSlots = () => {
    const normalized = jewels.map((jewel, index) => ({
      ...jewel,
      _slotNo:
        parseNumericValue(jewel?.slotNo) !== null
          ? Math.round(parseNumericValue(jewel?.slotNo))
          : index + 1,
    }));
    const slotMap = new Map();
    normalized.forEach((jewel) => {
      if (jewel._slotNo >= 1 && jewel._slotNo <= 5 && !slotMap.has(jewel._slotNo)) {
        slotMap.set(jewel._slotNo, jewel);
      }
    });
    const remains = normalized.filter(
      (jewel) => !slotMap.has(jewel._slotNo) || slotMap.get(jewel._slotNo) !== jewel,
    );
    for (let slotNo = 1; slotNo <= 5; slotNo += 1) {
      if (!slotMap.has(slotNo) && remains.length) {
        slotMap.set(slotNo, remains.shift());
      }
    }
    return Array.from({ length: 5 }, (_, index) => ({
      slotNo: index + 1,
      jewel: slotMap.get(index + 1) || null,
    }));
  };

  const slots = buildJewelSlots();
  const filledJewels = slots.map((slot) => slot.jewel).filter(Boolean);
  const filledCount = filledJewels.length;
  const resolveJewelGradeTier = (jewel) => {
    const gradeText = String(jewel?.jewelGrade || "").toUpperCase();
    if (gradeText.includes("SSS")) return "SSS";
    if (gradeText.includes("SS")) return "SS";
    return "";
  };
  const gradeList = filledJewels.map(resolveJewelGradeTier);
  const sssCount = gradeList.filter((grade) => grade === "SSS").length;
  const ssCount = gradeList.filter((grade) => grade === "SS").length;
  const isAllSssFive = filledCount === 5 && sssCount === 5;
  const isSsSetFive =
    filledCount === 5 &&
    sssCount + ssCount === 5 &&
    !isAllSssFive;
  const colorKeys = filledJewels
    .map((jewel) => normalizeJewelThemeKey(`${jewel?.jewelColor || ""} ${jewel?.jewelName || ""}`))
    .filter(Boolean);
  const isSameColor = colorKeys.length === 5 && new Set(colorKeys).size === 1;
  const activeColorKey = isSameColor ? colorKeys[0] : "";
  const themeKey = activeColorKey || resolveJewelThemeKey();
  const setSummary = isAllSssFive && isSameColor
    ? {
        title: `SSS등급 ${colorLabelByKey[activeColorKey] || "동일색"} 쥬얼 세트`,
        lines: ["맥스 피버 확률 +9%", "방어율 무시 +2%"],
        inactive: false,
      }
    : isSsSetFive && isSameColor
      ? {
          title: `SS등급 ${colorLabelByKey[activeColorKey] || "동일색"} 쥬얼 세트`,
          lines: ["맥스 피버 확률 +3%"],
          inactive: false,
        }
    : {
        title: "세트 옵션 미적용",
        lines: ["SS등급 이상", "동일 색상 쥬얼 5개 장착 시", "세트 옵션 활성화"],
        inactive: true,
      };
  const nodeClassByIndex = [
    "jewel-node--top",
    "jewel-node--right-top",
    "jewel-node--right-bottom",
    "jewel-node--left-bottom",
    "jewel-node--left-top",
  ];
  const presetIndex = presets.findIndex(
    (preset) => parseNumericValue(preset?.presetNo) === selectedNo,
  );
  const hasPresetCycle = presets.length > 1 && presetIndex !== -1;
  const previousPresetNo = hasPresetCycle
    ? parseNumericValue(
        presets[(presetIndex - 1 + presets.length) % presets.length]?.presetNo,
      )
    : null;
  const nextPresetNo = hasPresetCycle
    ? parseNumericValue(presets[(presetIndex + 1) % presets.length]?.presetNo)
    : null;

  const pageButtons = presets
    .map((preset) => {
      const no = parseNumericValue(preset?.presetNo);
      const selected = no !== null && no === selectedNo;
      return `<button type="button" class="jewel-page-btn ${selected ? "is-selected" : ""}" data-preset-tab="jewelSymbolVmatrix" data-preset-no="${escapeHtml(no ?? "")}" aria-label="쥬얼 페이지 ${escapeHtml(no ?? "-")}">${escapeHtml(no ?? "-")}</button>`;
    })
    .join("");
  const nodeMarkup = slots
    .map((slot, index) => {
      const jewel = slot.jewel;
      const optionText = normalizeOptionText(jewel?.jewelOption || "");
      const bubbleText =
        optionText || normalizeOptionText(jewel?.jewelName || "") || `슬롯 ${slot.slotNo}`;
      const iconMarkup = jewel?.jewelIcon
        ? `<img src="${escapeHtml(jewel.jewelIcon)}" alt="${escapeHtml(jewel.jewelName || "쥬얼")}" loading="lazy" />`
        : `<span class="jewel-node__slot-no">${escapeHtml(String(slot.slotNo))}</span>`;
      return `<div class="jewel-node ${nodeClassByIndex[index]} ${jewel ? "is-filled" : "is-empty"}"><div class="jewel-node__bubble">${escapeHtml(
        bubbleText,
      )}</div><div class="jewel-node__hex">${iconMarkup}</div></div>`;
    })
    .join("");
  const dotButtons = presets.length
    ? presets
        .map((preset) => {
          const no = parseNumericValue(preset?.presetNo);
          const selected = no !== null && no === selectedNo;
          return `<button type="button" class="jewel-dot ${selected ? "is-selected" : ""}" data-preset-tab="jewelSymbolVmatrix" data-preset-no="${escapeHtml(no ?? "")}" aria-label="쥬얼 페이지 ${escapeHtml(no ?? "-")}"></button>`;
        })
        .join("")
    : '<span class="jewel-dot is-selected" aria-hidden="true"></span>';

  return `<section class="tab-grid"><article class="data-card jewel-slot-card jewel-slot-card--compact"><div class="jewel-slot-card__head"><h3>쥬얼 슬롯</h3><div class="jewel-page-switch">${pageButtons}</div></div><div class="jewel-board jewel-theme--${escapeHtml(
    themeKey,
  )}"><button type="button" class="jewel-nav jewel-nav--left" ${previousPresetNo !== null ? `data-preset-tab="jewelSymbolVmatrix" data-preset-no="${escapeHtml(previousPresetNo)}"` : "disabled"} aria-label="이전 페이지">‹</button><div class="jewel-ring-stage"><div class="jewel-ring"><svg class="jewel-ring__lines" viewBox="0 0 100 100" aria-hidden="true"><polyline points="50,7 84,31 70,74 30,74 16,31 50,7" /></svg>${nodeMarkup}</div><article class="jewel-set-card"><h4 class="${setSummary.inactive ? "is-inactive" : ""}">${escapeHtml(
    setSummary.title,
  )}</h4>${setSummary.lines.length ? `<ul>${setSummary.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}</article></div><button type="button" class="jewel-nav jewel-nav--right" ${nextPresetNo !== null ? `data-preset-tab="jewelSymbolVmatrix" data-preset-no="${escapeHtml(nextPresetNo)}"` : "disabled"} aria-label="다음 페이지">›</button></div><div class="jewel-page-dots">${dotButtons}</div></article><div class="symbol-side-stack"><article class="data-card arcane-symbol-panel"><h3>아케인 심볼</h3>${renderArcaneSymbolBoard(
    arcane,
  )}</article><article class="data-card authentic-symbol-panel"><h3>어센틱 심볼</h3>${renderAuthenticSymbolBoard(
    auth,
  )}</article></div></section>`;
}
function renderSquarePresetSwitch(tabKey, tabData, state, labelPrefix) {
  const presets = toArray(tabData?.presets);
  if (!presets.length) {
    return '<div class="preset-empty">프리셋 데이터가 없습니다.</div>';
  }

  const selectedNo = resolveSelectedPresetNo(tabKey, tabData, state);
  return `<div class="jewel-page-switch hyper-link-preset">${presets
    .map((preset) => {
      const no = parseNumericValue(preset?.presetNo);
      const selected = no !== null && no === selectedNo;
      const activeClass = preset?.isActive ? "is-active" : "";
      const aria = `${labelPrefix || "프리셋"} ${no ?? "-"}`;
      return `<button type="button" class="jewel-page-btn hyper-link-preset__btn ${selected ? "is-selected" : ""} ${activeClass}" data-preset-tab="${escapeHtml(
        tabKey,
      )}" data-preset-no="${escapeHtml(no ?? "")}" aria-label="${escapeHtml(aria)}">${escapeHtml(
        no ?? "-",
      )}</button>`;
    })
    .join("")}</div>`;
}
function renderJewelPresetSwitch(tabKey, tabData, state, labelPrefix) {
  const presets = toArray(tabData?.presets);
  if (!presets.length) {
    return '<div class="preset-empty">프리셋 데이터가 없습니다.</div>';
  }

  const selectedNo = resolveSelectedPresetNo(tabKey, tabData, state);
  return `<div class="jewel-page-switch">${presets
    .map((preset) => {
      const no = parseNumericValue(preset?.presetNo);
      const selected = no !== null && no === selectedNo;
      const activeClass = preset?.isActive ? "is-active" : "";
      const aria = `${labelPrefix || "프리셋"} ${no ?? "-"}`;
      return `<button type="button" class="jewel-page-btn ${selected ? "is-selected" : ""} ${activeClass}" data-preset-tab="${escapeHtml(
        tabKey,
      )}" data-preset-no="${escapeHtml(no ?? "")}" aria-label="${escapeHtml(aria)}">${escapeHtml(
        no ?? "-",
      )}</button>`;
    })
    .join("")}</div>`;
}
function splitLinkSkillEffectLines(text) {
  const lines = String(text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^[-•·]\s*/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);

  return lines
    .flatMap((line) =>
      line
        .split(/,(?=\s*[A-Za-z가-힣])/)
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .map((line) => line.replace(/^[-•·]\s*/, "").trim())
    .filter(Boolean);
}
function extractLinkSkillMaxLevel(skill) {
  const sourceText = [skill?.skillDescription, skill?.skillEffectNext]
    .filter(Boolean)
    .join(" ");
  if (!sourceText) {
    return null;
  }

  const match = sourceText.match(/max\s*lv\.?\s*(\d+)/i);
  if (!match) {
    return null;
  }

  return parseNumericValue(match[1]);
}
function parseMergedEffectLine(line) {
  const cleaned = String(line || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return null;
  }

  const parsed = cleaned.match(
    /^(.+?)([+-]?\d{1,3}(?:,\d{3})*(?:\.\d+)?)(\s*(?:%|초))?\s*$/,
  );
  if (!parsed) {
    return {
      key: `text:${normalizeForMatch(cleaned)}`,
      label: cleaned,
      value: null,
      unit: "",
    };
  }

  const rawLabel = String(parsed[1] || "")
    .replace(/[+:：]\s*$/, "")
    .replace(/\s+[+]\s*$/, "")
    .trim();
  const numericValue = Number(String(parsed[2] || "").replaceAll(",", ""));
  if (!rawLabel || !Number.isFinite(numericValue)) {
    return {
      key: `text:${normalizeForMatch(cleaned)}`,
      label: cleaned,
      value: null,
      unit: "",
    };
  }

  const unit = String(parsed[3] || "").trim();
  return {
    key: `num:${normalizeForMatch(rawLabel)}|${unit}`,
    label: rawLabel,
    value: numericValue,
    unit,
  };
}
function formatMergedEffectNumber(value) {
  const abs = Math.abs(Number(value) || 0);
  const hasDecimal = Math.abs(abs - Math.round(abs)) > 0.0001;
  const text = abs.toLocaleString("ko-KR", {
    minimumFractionDigits: hasDecimal ? 1 : 0,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? "-" : ""}${text}`;
}
function mergeEffectLines(lines) {
  const grouped = new Map();

  lines.forEach((line) => {
    const parsed = parseMergedEffectLine(line);
    if (!parsed) {
      return;
    }

    if (!grouped.has(parsed.key)) {
      grouped.set(parsed.key, { ...parsed });
      return;
    }

    const current = grouped.get(parsed.key);
    if (current && current.value !== null && parsed.value !== null) {
      current.value += parsed.value;
    }
  });

  return [...grouped.values()].map((entry) => {
    if (entry.value === null) {
      return {
        label: entry.label,
        valueText: "",
      };
    }
    return {
      label: entry.label,
      valueText: `${formatMergedEffectNumber(entry.value)}${entry.unit || ""}`,
    };
  });
}
function mergeLinkSkillsByName(links) {
  const grouped = new Map();

  links.forEach((skill) => {
    const skillName = String(skill?.skillName || "-").trim() || "-";
    const key = normalizeForMatch(skillName) || skillName;
    const skillLevel = parseNumericValue(skill?.skillLevel);
    const maxLevel = extractLinkSkillMaxLevel(skill);
    const effectLines = splitLinkSkillEffectLines(
      skill?.skillEffect || skill?.skillDescription,
    );

    if (!grouped.has(key)) {
      grouped.set(key, {
        skillName,
        skillIcon: String(skill?.skillIcon || "").trim(),
        levelSum: skillLevel !== null ? skillLevel : 0,
        hasNumericLevel: skillLevel !== null,
        levelTextFallback: String(skill?.skillLevel ?? "-"),
        maxLevel,
        count: 1,
        effectLines: [...effectLines],
      });
      return;
    }

    const current = grouped.get(key);
    if (!current) {
      return;
    }

    current.count += 1;
    if (!current.skillIcon && skill?.skillIcon) {
      current.skillIcon = String(skill.skillIcon).trim();
    }
    if (skillLevel !== null) {
      current.levelSum += skillLevel;
      current.hasNumericLevel = true;
    }
    if (maxLevel !== null) {
      current.maxLevel =
        current.maxLevel === null ? maxLevel : Math.max(current.maxLevel, maxLevel);
    }
    if (effectLines.length) {
      current.effectLines.push(...effectLines);
    }
  });

  return [...grouped.values()].map((entry) => {
    const mergedEffects = mergeEffectLines(entry.effectLines);
    return {
      skillName: entry.skillName,
      skillIcon: entry.skillIcon,
      count: entry.count,
      levelText: entry.hasNumericLevel
        ? `Lv.${formatNumber(entry.levelSum)}`
        : `Lv.${entry.levelTextFallback}`,
      maxLevelText:
        entry.maxLevel !== null ? `MAX Lv.${formatNumber(entry.maxLevel)}` : "",
      mergedEffects,
      effectLines: entry.effectLines,
    };
  });
}
function escapeRegexText(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildHyperStatValueText(statType, statIncrease, statLevel) {
  const statName = String(statType || "").replace(/\s+/g, " ").trim();
  const increaseText = String(statIncrease || "").replace(/\s+/g, " ").trim();

  if (increaseText) {
    if (!statName) {
      return increaseText;
    }
    const prefixPattern = new RegExp(
      `^${escapeRegexText(statName)}\\s*[:：]?\\s*`,
      "i",
    );
    const stripped = increaseText.replace(prefixPattern, "").trim();
    return stripped || increaseText;
  }

  const level = parseNumericValue(statLevel);
  return level !== null ? `Lv.${level}` : "-";
}
function renderHyperStatTab(hyperTabData, skillLinkTabData, state) {
  const selectedHyper = resolveSelectedPreset("hyperStat", hyperTabData, state);
  const hyperData = selectedHyper?.data || {};
  const hyperInfo = toArray(hyperData.hyperStatInfo);

  const selectedLink = resolveSelectedPreset("skillLink", skillLinkTabData, state);
  const linkData = selectedLink?.data || {};
  const links = toArray(linkData.linkSkillInfo);
  const mergedSkills = mergeLinkSkillsByName(links);
  const mergedAppliedEffects = mergeEffectLines(
    mergedSkills.flatMap((skill) => skill.effectLines),
  );
  const hyperRows = hyperInfo.length
    ? hyperInfo
        .map((info) => {
          const statName = String(info?.statType || "-").trim() || "-";
          const valueText = buildHyperStatValueText(
            statName,
            info?.statIncrease,
            info?.statLevel,
          );
          return `<li><span>${escapeHtml(statName)}</span><strong>${escapeHtml(valueText)}</strong></li>`;
        })
        .join("")
    : '<li class="is-empty">하이퍼스탯 정보가 없습니다.</li>';
  const linkCards = mergedSkills.length
    ? mergedSkills
        .map((skill) => {
          const mergedEffects = skill.mergedEffects.length
            ? skill.mergedEffects
                .map((effect) => {
                  if (!effect.valueText) {
                    return `<li><span>${escapeHtml(effect.label)}</span></li>`;
                  }
                  return `<li><span>${escapeHtml(effect.label)}</span><strong>${escapeHtml(effect.valueText)}</strong></li>`;
                })
                .join("")
            : '<li><span>효과 정보가 없습니다.</span></li>';

          return `<article class="link-skill-item"><div class="link-skill-item__icon-wrap">${skill.skillIcon ? `<img src="${escapeHtml(skill.skillIcon)}" alt="${escapeHtml(skill.skillName || "링크 스킬")}" loading="lazy" />` : '<div class="link-skill-item__icon-empty">NO</div>'}</div><div class="link-skill-item__body"><h4>${escapeHtml(skill.skillName || "-")}</h4><p class="link-skill-item__level">${escapeHtml(
            skill.levelText,
          )}</p>${skill.maxLevelText ? `<p class="link-skill-item__max">${escapeHtml(skill.maxLevelText)}</p>` : ""}<ul class="link-skill-item__effects">${mergedEffects}</ul></div></article>`;
        })
        .join("")
    : '<p class="empty">링크스킬 정보가 없습니다.</p>';
  const mergedEffectRows = mergedAppliedEffects.length
    ? mergedAppliedEffects
        .map((effect) => {
          if (!effect.valueText) {
            return `<li><span>${escapeHtml(effect.label)}</span></li>`;
          }
          return `<li><span>${escapeHtml(effect.label)}</span><strong>${escapeHtml(effect.valueText)}</strong></li>`;
        })
        .join("")
    : '<li class="is-empty">적용 중인 효과가 없습니다.</li>';

  return `<section class="tab-grid hyper-link-grid"><article class="data-card hyper-stat-card"><div class="hyper-link-card__head"><h3>하이퍼스탯</h3>${renderSquarePresetSwitch(
    "hyperStat",
    hyperTabData,
    state,
    "하이퍼스탯 프리셋",
  )}</div><ul class="hyper-stat-list">${hyperRows}</ul></article><article class="data-card link-skill-card"><div class="hyper-link-card__head"><h3>링크스킬</h3>${renderSquarePresetSwitch(
    "skillLink",
    skillLinkTabData,
    state,
    "링크스킬 프리셋",
  )}</div><div class="link-skill-layout"><section class="link-skill-list-panel"><h4 class="link-panel-title">스킬 목록</h4><div class="link-skill-list">${linkCards}</div></section><section class="link-skill-effect-panel"><h4 class="link-panel-title">적용 중인 효과</h4><ul class="link-effect-list">${mergedEffectRows}</ul></section></div></article></section>`;
}

function resolveHexaSkillGroup(skill) {
  const typeNorm = normalizeForMatch(skill?.skillType || "");
  const nameNorm = normalizeForMatch(skill?.skillName || "");
  const combined = `${typeNorm} ${nameNorm}`;

  if (/common|공용|shared|쉐어|쉐어드/.test(combined)) return "common";
  if (/mastery|마스터리/.test(combined)) return "mastery";
  if (/reinforce|enhance|boost|강화/.test(combined)) return "enhance";
  if (/skill|스킬|attack|공격/.test(combined)) return "skill";
  return "unknown";
}
const HEXA_CORE_CUMULATIVE_COST = Object.freeze({
  mastery: [
    null,
    { energy: 1, fragment: 10 },
    { energy: 2, fragment: 30 },
    { energy: 3, fragment: 55 },
    { energy: 5, fragment: 85 },
    { energy: 7, fragment: 120 },
    { energy: 9, fragment: 160 },
    { energy: 12, fragment: 205 },
    { energy: 15, fragment: 255 },
    { energy: 18, fragment: 310 },
    { energy: 22, fragment: 372 },
    { energy: 26, fragment: 441 },
    { energy: 30, fragment: 517 },
    { energy: 35, fragment: 600 },
    { energy: 40, fragment: 690 },
    { energy: 45, fragment: 787 },
    { energy: 51, fragment: 891 },
    { energy: 57, fragment: 1002 },
    { energy: 63, fragment: 1120 },
    { energy: 69, fragment: 1245 },
    { energy: 76, fragment: 1380 },
    { energy: 83, fragment: 1525 },
    { energy: 90, fragment: 1680 },
    { energy: 98, fragment: 1845 },
    { energy: 106, fragment: 2020 },
    { energy: 114, fragment: 2205 },
    { energy: 122, fragment: 2400 },
    { energy: 131, fragment: 2605 },
    { energy: 140, fragment: 2820 },
    { energy: 149, fragment: 3045 },
    { energy: 159, fragment: 3285 },
  ],
  origin: [
    null,
    { energy: 0, fragment: 0 },
    { energy: 2, fragment: 40 },
    { energy: 5, fragment: 90 },
    { energy: 8, fragment: 150 },
    { energy: 11, fragment: 220 },
    { energy: 15, fragment: 300 },
    { energy: 19, fragment: 390 },
    { energy: 24, fragment: 490 },
    { energy: 29, fragment: 600 },
    { energy: 35, fragment: 725 },
    { energy: 41, fragment: 865 },
    { energy: 48, fragment: 1020 },
    { energy: 55, fragment: 1190 },
    { energy: 63, fragment: 1375 },
    { energy: 71, fragment: 1575 },
    { energy: 80, fragment: 1790 },
    { energy: 89, fragment: 2020 },
    { energy: 99, fragment: 2265 },
    { energy: 109, fragment: 2525 },
    { energy: 120, fragment: 2805 },
    { energy: 131, fragment: 3105 },
    { energy: 143, fragment: 3425 },
    { energy: 155, fragment: 3765 },
    { energy: 168, fragment: 4125 },
    { energy: 181, fragment: 4505 },
    { energy: 195, fragment: 4905 },
    { energy: 209, fragment: 5325 },
    { energy: 224, fragment: 5765 },
    { energy: 239, fragment: 6225 },
    { energy: 254, fragment: 6725 },
  ],
  enhance: [
    null,
    { energy: 1, fragment: 20 },
    { energy: 3, fragment: 50 },
    { energy: 5, fragment: 85 },
    { energy: 7, fragment: 125 },
    { energy: 9, fragment: 170 },
    { energy: 11, fragment: 220 },
    { energy: 13, fragment: 275 },
    { energy: 15, fragment: 335 },
    { energy: 17, fragment: 400 },
    { energy: 22, fragment: 475 },
    { energy: 27, fragment: 560 },
    { energy: 32, fragment: 655 },
    { energy: 37, fragment: 760 },
    { energy: 42, fragment: 875 },
    { energy: 47, fragment: 1000 },
    { energy: 52, fragment: 1135 },
    { energy: 57, fragment: 1280 },
    { energy: 62, fragment: 1435 },
    { energy: 67, fragment: 1600 },
    { energy: 77, fragment: 1780 },
    { energy: 87, fragment: 1975 },
    { energy: 97, fragment: 2185 },
    { energy: 107, fragment: 2410 },
    { energy: 117, fragment: 2650 },
    { energy: 127, fragment: 2905 },
    { energy: 137, fragment: 3175 },
    { energy: 147, fragment: 3460 },
    { energy: 157, fragment: 3760 },
    { energy: 167, fragment: 4075 },
    { energy: 182, fragment: 4410 },
  ],
  common: [
    null,
    { energy: 10, fragment: 200 },
    { energy: 14, fragment: 255 },
    { energy: 18, fragment: 324 },
    { energy: 23, fragment: 407 },
    { energy: 28, fragment: 504 },
    { energy: 34, fragment: 614 },
    { energy: 40, fragment: 738 },
    { energy: 47, fragment: 876 },
    { energy: 54, fragment: 1028 },
    { energy: 64, fragment: 1201 },
  ],
});
function resolveHexaCostTableByGroup(group) {
  if (group === "mastery") return HEXA_CORE_CUMULATIVE_COST.mastery;
  if (group === "enhance") return HEXA_CORE_CUMULATIVE_COST.enhance;
  if (group === "common") return HEXA_CORE_CUMULATIVE_COST.common;
  return HEXA_CORE_CUMULATIVE_COST.origin;
}
function getHexaCumulativeCostByGroupAndLevel(group, level) {
  const table = resolveHexaCostTableByGroup(group);
  const maxLevel = table.length - 1;
  const lvRaw = parseNumericValue(level);
  const lv = lvRaw === null ? 0 : Math.max(1, Math.min(maxLevel, Math.floor(lvRaw)));
  if (lv <= 0) return { energy: 0, fragment: 0 };
  return table[lv] || { energy: 0, fragment: 0 };
}
function getHexaUsedResourceTotals(skills) {
  return toArray(skills).reduce(
    (acc, skill) => {
      const levelValue =
        parseNumericValue(skill?.skillLevel) ?? parseNumericValue(skill?.slotLevel);
      const coreGroup = String(skill?.__group || resolveHexaSkillGroup(skill) || "unknown");
      const usedCost = getHexaCumulativeCostByGroupAndLevel(coreGroup, levelValue);
      acc.energy += parseNumericValue(usedCost?.energy) ?? 0;
      acc.fragment += parseNumericValue(usedCost?.fragment) ?? 0;
      return acc;
    },
    { energy: 0, fragment: 0 },
  );
}
function sortHexaQueueBySlotNo(queue, preferredOrder = []) {
  const orderMap = new Map(
    preferredOrder.map((slotNo, index) => [Number(slotNo), index]),
  );

  return [...toArray(queue)].sort((left, right) => {
    const leftSlotNo = parseNumericValue(left?.slotNo);
    const rightSlotNo = parseNumericValue(right?.slotNo);
    const leftRank = orderMap.has(leftSlotNo)
      ? orderMap.get(leftSlotNo)
      : Number.MAX_SAFE_INTEGER;
    const rightRank = orderMap.has(rightSlotNo)
      ? orderMap.get(rightSlotNo)
      : Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    if (
      leftSlotNo !== null &&
      rightSlotNo !== null &&
      leftSlotNo !== rightSlotNo
    ) {
      return leftSlotNo - rightSlotNo;
    }

    return (left?.__idx ?? 0) - (right?.__idx ?? 0);
  });
}
function buildHexaSkillBoardSlots(skills) {
  const normalizedSkills = toArray(skills).map((skill, index) => ({
    ...skill,
    __idx: index,
    __group: resolveHexaSkillGroup(skill),
    __level:
      parseNumericValue(skill?.skillLevel) ?? parseNumericValue(skill?.slotLevel) ?? null,
  }));

  const groupSlots = {
    skill: ["t8", "t3", "t7", "t2", "t6", "t1"],       // 좌상: 스킬 코어(우하부터 역지그재그)
    mastery: ["t9", "t10", "t4", "t5"],               // 우상: 마스터리 코어
    enhance: ["b1", "b2", "b5", "b6"],                // 좌하: 강화 코어
    common: ["b3", "b4", "b7", "b8"],                 // 우하: 공용 코어
  };

  const allSlotIds = [
    ...groupSlots.skill,
    ...groupSlots.mastery,
    ...groupSlots.enhance,
    ...groupSlots.common,
  ];
  const slotMap = Object.fromEntries(allSlotIds.map((slotId) => [slotId, null]));

  const queues = {
    skill: [],
    mastery: [],
    enhance: [],
    common: [],
    unknown: [],
  };

  normalizedSkills.forEach((skill) => {
    const group = skill.__group;
    if (group in queues) {
      queues[group].push(skill);
    } else {
      queues.unknown.push(skill);
    }
  });

  queues.skill = sortHexaQueueBySlotNo(queues.skill, [1, 2, 3, 4, 5, 6]);
  // 요청사항: 마스터리 코어 2개 순서 교체
  queues.mastery = sortHexaQueueBySlotNo(queues.mastery, [2, 1, 3, 4, 5, 6]);
  // 요청사항: 강화 코어 slot_no 정렬 2,1,3,4 (위 왼쪽부터)
  queues.enhance = sortHexaQueueBySlotNo(queues.enhance, [2, 1, 3, 4, 5, 6]);
  queues.common = sortHexaQueueBySlotNo(queues.common, [1, 2, 3, 4, 5, 6]);
  queues.unknown = sortHexaQueueBySlotNo(queues.unknown, [1, 2, 3, 4, 5, 6]);

  const fillSlots = (slotIds, primaryQueue, secondaryQueue = null) => {
    slotIds.forEach((slotId) => {
      if (primaryQueue.length) {
        slotMap[slotId] = primaryQueue.shift();
        return;
      }
      if (secondaryQueue && secondaryQueue.length) {
        slotMap[slotId] = secondaryQueue.shift();
      }
    });
  };

  fillSlots(groupSlots.skill, queues.skill, queues.unknown);
  fillSlots(groupSlots.mastery, queues.mastery, queues.unknown);
  fillSlots(groupSlots.enhance, queues.enhance, queues.unknown);
  fillSlots(groupSlots.common, queues.common, queues.unknown);

  const rest = [
    ...queues.skill,
    ...queues.mastery,
    ...queues.enhance,
    ...queues.common,
    ...queues.unknown,
  ];
  if (rest.length) {
    allSlotIds.forEach((slotId) => {
      if (!slotMap[slotId] && rest.length) {
        slotMap[slotId] = rest.shift();
      }
    });
  }

  return slotMap;
}
function renderHexaSkillNode(skill, theme = "purple") {
  if (!skill) {
    return `<div class="hexa-node hexa-node--${theme} is-empty"><div class="hexa-node__shape"><div class="hexa-node__lock" aria-hidden="true">LOCK</div></div></div>`;
  }

  const levelValue =
    parseNumericValue(skill?.skillLevel) ?? parseNumericValue(skill?.slotLevel);
  const levelText = levelValue === null ? "-" : String(Math.max(0, Math.floor(levelValue)));
  const name = String(skill?.skillName || "헥사 스킬").trim() || "헥사 스킬";
  const type = String(skill?.skillType || "").trim();
  const titleParts = [name, type, `Lv.${levelText}`].filter(Boolean);

  return `<div class="hexa-node hexa-node--${theme} is-filled" title="${escapeHtml(
    titleParts.join(" | "),
  )}"><div class="hexa-node__shape">${skill?.skillIcon ? `<img src="${escapeHtml(
    skill.skillIcon,
  )}" alt="${escapeHtml(name)}" loading="lazy" />` : '<div class="hexa-node__no">NO</div>'}</div>${levelText ? `<span class="hexa-node__level">${escapeHtml(
    levelText,
  )}</span>` : ""}</div>`;
}
function renderHexaSkillBoard(skills) {
  const slotMap = buildHexaSkillBoardSlots(skills);
  const resourceTotals = getHexaUsedResourceTotals(toArray(skills));
  const slotDefs = [
    { id: "t1", className: "hexa-slot--t1", theme: "purple" },
    { id: "t2", className: "hexa-slot--t2", theme: "purple" },
    { id: "t3", className: "hexa-slot--t3", theme: "purple" },
    { id: "t4", className: "hexa-slot--t4", theme: "pink" },
    { id: "t5", className: "hexa-slot--t5", theme: "pink" },
    { id: "t6", className: "hexa-slot--t6", theme: "purple" },
    { id: "t7", className: "hexa-slot--t7", theme: "purple" },
    { id: "t8", className: "hexa-slot--t8", theme: "purple" },
    { id: "t9", className: "hexa-slot--t9", theme: "pink" },
    { id: "t10", className: "hexa-slot--t10", theme: "pink" },
    { id: "b1", className: "hexa-slot--b1", theme: "blue" },
    { id: "b2", className: "hexa-slot--b2", theme: "blue" },
    { id: "b3", className: "hexa-slot--b3", theme: "silver" },
    { id: "b4", className: "hexa-slot--b4", theme: "indigo" },
    { id: "b5", className: "hexa-slot--b5", theme: "blue" },
    { id: "b6", className: "hexa-slot--b6", theme: "blue" },
    { id: "b7", className: "hexa-slot--b7", theme: "indigo" },
    { id: "b8", className: "hexa-slot--b8", theme: "indigo" },
  ];

  const slotMarkup = slotDefs
    .map((slot) => {
      const skill = slotMap[slot.id] || null;
      return `<div class="hexa-slot ${slot.className}">${renderHexaSkillNode(
        skill,
        slot.theme,
      )}</div>`;
    })
    .join("");

  return `<div class="hexa-skill-board"><div class="hexa-skill-board__field"><div class="hexa-skill-board__glow" aria-hidden="true"></div>${slotMarkup}<div class="hexa-core-mark" aria-hidden="true">VI</div></div><aside class="hexa-resource-panel"><h4>사용재화</h4><div class="hexa-resource-entry"><img src="/assets/sole_erda.png" alt="솔 에르다" loading="lazy" /><div class="hexa-resource-entry__text"><span class="hexa-resource-entry__label">솔 에르다</span><strong class="hexa-resource-entry__value">${escapeHtml(
    `${formatNumber(resourceTotals.energy)}개`,
  )}</strong></div></div><div class="hexa-resource-entry"><img src="/assets/sole_erda_piece.png" alt="솔 에르다 조각" loading="lazy" /><div class="hexa-resource-entry__text"><span class="hexa-resource-entry__label">솔 에르다 조각</span><strong class="hexa-resource-entry__value">${escapeHtml(
    `${formatNumber(resourceTotals.fragment)}개`,
  )}</strong></div></div></aside></div>`;
}
function resolveHexaStatLevel(level, maxLevel = 10) {
  const parsed = parseNumericValue(level);
  if (parsed === null) return 0;
  return Math.max(0, Math.min(maxLevel, Math.floor(parsed)));
}
function renderHexaStatGauge(level, tone = "sub") {
  const totalSegment = 10;
  const filled = resolveHexaStatLevel(level, totalSegment);
  const segments = Array.from({ length: totalSegment }, (_, index) => {
    const stateClass = index < filled ? "is-on" : "is-off";
    return `<span class="hexa-stat-gauge__segment ${stateClass}" aria-hidden="true"></span>`;
  }).join("");
  return `<div class="hexa-stat-gauge hexa-stat-gauge--${tone}" role="img" aria-label="레벨 ${escapeHtml(String(filled))}/${escapeHtml(String(totalSegment))}"><div class="hexa-stat-gauge__segments">${segments}</div></div>`;
}
function renderHexaStatEntry(row) {
  const tone = row?.tone === "main" ? "main" : "sub";
  const typeText = tone === "main" ? "메인 스탯" : "부가 스탯";
  const statLabel = String(row?.stat || "-").trim() || "-";
  const levelValue = parseNumericValue(row?.level);
  const levelText = levelValue === null ? "-" : String(Math.max(0, Math.floor(levelValue)));
  return `<li class="hexa-stat-entry hexa-stat-entry--${tone}"><div class="hexa-stat-entry__icon" aria-hidden="true">VI</div><div class="hexa-stat-entry__body"><p class="hexa-stat-entry__type">${escapeHtml(
    typeText,
  )}</p><h5 class="hexa-stat-entry__name">${escapeHtml(
    statLabel,
  )}</h5>${renderHexaStatGauge(levelValue, tone)}<span class="hexa-stat-entry__level">Lv.${escapeHtml(
    levelText,
  )}</span></div></li>`;
}
function renderHexaStatSideNode(isActive, levelText, nodeClass) {
  return `<div class="hexa-stat-node ${nodeClass} ${isActive ? "is-active" : "is-locked"}">${isActive ? `<span class="hexa-stat-node__level">${escapeHtml(
    levelText,
  )}</span><span class="hexa-stat-node__icon" aria-hidden="true">VI</span>` : '<span class="hexa-stat-node__lock" aria-hidden="true">LOCK</span>'}</div>`;
}
function resolveActiveHexaStatInfo(core) {
  const pages = toArray(core?.statInfo);
  const activeIndexByFlag = pages.findIndex(
    (page) => String(page?.activateFlag ?? "0") === "1",
  );
  const activeIndex = activeIndexByFlag >= 0 ? activeIndexByFlag : 0;
  return pages[activeIndex] || {};
}
function normalizeHexaStatCores(cores) {
  const mergedBySlot = new Map();

  toArray(cores).forEach((core, index) => {
    const slotNo = parseNumericValue(core?.statCoreSlot);
    const key = slotNo !== null ? `slot:${slotNo}` : `idx:${index}`;
    if (!mergedBySlot.has(key)) {
      mergedBySlot.set(key, {
        statCoreSlot:
          slotNo !== null ? slotNo : core?.statCoreSlot ?? index + 1,
        statInfo: [],
        __idx: index,
      });
    }
    const target = mergedBySlot.get(key);
    if (!target) return;
    target.statInfo.push(...toArray(core?.statInfo));
  });

  return [...mergedBySlot.values()]
    .map((core) => {
      const pageMap = new Map();
      toArray(core?.statInfo).forEach((info, index) => {
        const pageNo = parseNumericValue(info?.pageNo);
        const key = pageNo !== null ? `page:${pageNo}` : `idx:${index}`;
        if (!pageMap.has(key)) {
          pageMap.set(key, info);
          return;
        }
        const current = pageMap.get(key);
        const currentActive = String(current?.activateFlag ?? "0") === "1";
        const nextActive = String(info?.activateFlag ?? "0") === "1";
        if (!currentActive && nextActive) {
          pageMap.set(key, info);
        }
      });
      return {
        ...core,
        statInfo: [...pageMap.values()],
      };
    })
    .sort((left, right) => {
      const leftSlot = parseNumericValue(left?.statCoreSlot);
      const rightSlot = parseNumericValue(right?.statCoreSlot);
      if (leftSlot !== null && rightSlot !== null && leftSlot !== rightSlot) {
        return leftSlot - rightSlot;
      }
      if (leftSlot !== null && rightSlot === null) return -1;
      if (leftSlot === null && rightSlot !== null) return 1;
      return (left?.__idx ?? 0) - (right?.__idx ?? 0);
    });
}
function buildHexaStatPagePresetTabData(core) {
  const pages = toArray(core?.statInfo);
  if (!pages.length) {
    return { presets: [] };
  }

  const pageMap = new Map();
  let fallbackNo = 1;
  pages.forEach((page, index) => {
    let presetNo = parseNumericValue(page?.pageNo);
    if (presetNo === null || pageMap.has(presetNo)) {
      while (pageMap.has(fallbackNo)) {
        fallbackNo += 1;
      }
      presetNo = fallbackNo;
    }
    pageMap.set(presetNo, {
      presetNo,
      isActive: String(page?.activateFlag ?? "0") === "1",
      data: { pageInfo: page, pageIndex: index },
    });
  });

  const presets = [...pageMap.values()].sort((left, right) => {
    const leftNo = parseNumericValue(left?.presetNo) ?? Number.MAX_SAFE_INTEGER;
    const rightNo = parseNumericValue(right?.presetNo) ?? Number.MAX_SAFE_INTEGER;
    return leftNo - rightNo;
  });

  if (!presets.some((preset) => preset?.isActive) && presets[0]) {
    presets[0].isActive = true;
  }

  return { presets };
}
function renderHexaStatCore(core, activeInfoRaw = null, presetSwitchMarkup = "") {
  const activeInfo = activeInfoRaw || resolveActiveHexaStatInfo(core);

  const mainLevel = resolveHexaStatLevel(
    parseNumericValue(activeInfo?.mainStatLevel) ??
      parseNumericValue(activeInfo?.slotLevel),
  );
  const sub1Level = resolveHexaStatLevel(parseNumericValue(activeInfo?.sub1StatLevel));
  const sub2Level = resolveHexaStatLevel(parseNumericValue(activeInfo?.sub2StatLevel));
  const usedEnhanceCount = Math.min(20, mainLevel + sub1Level + sub2Level);
  const topNodeLevelText = String(mainLevel);
  const statCoreText = String(core?.statCoreSlot ?? "-").trim() || "-";

  const rows = [
    {
      tone: "main",
      stat: activeInfo?.mainStat || "-",
      level: mainLevel,
    },
    {
      tone: "sub",
      stat: activeInfo?.sub1Stat || "-",
      level: sub1Level,
    },
    {
      tone: "sub",
      stat: activeInfo?.sub2Stat || "-",
      level: sub2Level,
    },
  ];

  const appliedRows = rows
    .filter((row) => {
      const label = String(row?.stat || "").trim();
      return !!label && label !== "-";
    })
    .map((row) => {
      const numericLevel = parseNumericValue(row?.level);
      const levelText = numericLevel === null ? "-" : String(Math.max(0, Math.floor(numericLevel)));
      return `<li>${escapeHtml(String(row.stat || "-"))} <strong>Lv.${escapeHtml(
        levelText,
      )}</strong></li>`;
    })
    .join("");

  return `<article class="hexa-stat-core"><header class="hexa-stat-core__head"><h4>스탯 코어 ${escapeHtml(
    statCoreText,
  )} (${escapeHtml(String(usedEnhanceCount))}/20)</h4>${presetSwitchMarkup}</header><div class="hexa-stat-core__body"><section class="hexa-stat-core__left"><ul class="hexa-stat-list">${rows
    .map((row) => renderHexaStatEntry(row))
    .join(
      "",
    )}</ul></section><aside class="hexa-stat-core__right"><div class="hexa-stat-visual"><div class="hexa-stat-visual__bg" aria-hidden="true"></div>${renderHexaStatSideNode(
    true,
    topNodeLevelText,
    "hexa-stat-node--top",
  )}${renderHexaStatSideNode(
    false,
    "-",
    "hexa-stat-node--left-top",
  )}${renderHexaStatSideNode(
    false,
    "-",
    "hexa-stat-node--right-top",
  )}${renderHexaStatSideNode(
    false,
    "-",
    "hexa-stat-node--left-bottom",
  )}${renderHexaStatSideNode(
    false,
    "-",
    "hexa-stat-node--right-bottom",
  )}${renderHexaStatSideNode(
    false,
    "-",
    "hexa-stat-node--bottom",
  )}<div class="hexa-stat-visual__mark" aria-hidden="true">VI</div></div><div class="hexa-stat-applied"><h5>적용 능력치</h5><ul>${appliedRows || '<li class="is-empty">적용 능력치가 없습니다.</li>'}</ul></div></aside></div></article>`;
}
function renderHexaStatBoard(cores, state) {
  const normalizedCores = normalizeHexaStatCores(cores);
  const currentCore = normalizedCores[0] || null;
  if (!currentCore) {
    return '<p class="empty">헥사 스탯 데이터가 없습니다.</p>';
  }

  const presetTabData = buildHexaStatPagePresetTabData(currentCore);
  const presets = toArray(presetTabData?.presets);
  if (!presets.length) {
    return '<p class="empty">헥사 스탯 데이터가 없습니다.</p>';
  }

  const selectedPreset = resolveSelectedPreset("hexaStat", presetTabData, state);
  const selectedPage =
    selectedPreset?.data?.pageInfo ||
    presets.find((preset) => preset?.isActive)?.data?.pageInfo ||
    presets[0]?.data?.pageInfo ||
    null;
  const presetSwitch = renderJewelPresetSwitch(
    "hexaStat",
    presetTabData,
    state,
    "헥사 스탯 페이지",
  );
  return `<div class="hexa-stat-board">${renderHexaStatCore(
    currentCore,
    selectedPage,
    presetSwitch,
  )}</div>`;
}
function resolveVmatrixCoreGroup(core) {
  const typeNorm = normalizeForMatch(core?.vcoreType || "");
  if (/강화|enhance|boost/.test(typeNorm)) {
    return "enhance";
  }
  if (/특수|special|common/.test(typeNorm)) {
    return "special";
  }
  if (/스킬|skill/.test(typeNorm)) {
    return "skill";
  }
  return "skill";
}
function renderSimpleVmatrixCoreBoard(vcores) {
  const grouped = {
    skill: [],
    enhance: [],
    special: [],
  };
  toArray(vcores).forEach((core) => {
    const key = resolveVmatrixCoreGroup(core);
    grouped[key].push(core);
  });

  const groupDefs = [
    { key: "skill", label: "스킬 코어" },
    { key: "enhance", label: "강화 코어" },
    { key: "special", label: "특수 코어" },
  ];
  const renderCoreLine = (core, groupKey) => {
    const levelValue = parseNumericValue(core?.vcoreLevel);
    const levelText =
      levelValue === null ? "-" : String(Math.max(0, Math.floor(levelValue)));
    const skillsText = toArray(core?.skills)
      .map((name) => String(name || "").trim())
      .filter(Boolean)
      .join("/");
    const titleText =
      groupKey === "enhance" && skillsText
        ? skillsText
        : String(core?.vcoreName || "").trim() || skillsText || "-";
    return `<li>${escapeHtml(titleText)} (Lv. ${escapeHtml(levelText)})</li>`;
  };

  return `<div class="vmatrix-simple"><div class="vmatrix-simple__grid">${groupDefs
    .map((group) => {
      const list = grouped[group.key] || [];
      return `<section class="vmatrix-simple__group"><h5>${escapeHtml(
        `${group.label} (${list.length})`,
      )}</h5><ul class="vmatrix-simple__list">${list.length ? list.map((core) => renderCoreLine(core, group.key)).join("") : '<li class="is-empty">코어 정보가 없습니다.</li>'}</ul></section>`;
    })
    .join("")}</div></div>`;
}
function renderHexamatrixTab(tabData, jewelSymbolVmatrixTabData, state) {
  const vcores = toArray(jewelSymbolVmatrixTabData?.vmatrix?.vCores);
  const skills = toArray(tabData?.hexaSkills);
  const cores = toArray(tabData?.hexaStatCoreList);
  return `<section class="tab-grid"><article class="data-card data-card--wide"><h3>V매트릭스</h3>${vcores.length ? renderSimpleVmatrixCoreBoard(
    vcores,
  ) : '<p class="empty">V코어 정보가 없습니다.</p>'}</article><article class="data-card data-card--wide"><h3>헥사 스킬</h3>${skills.length ? renderHexaSkillBoard(skills) : '<p class="empty">헥사 스킬 데이터가 없습니다.</p>'}</article><article class="data-card data-card--wide"><h3>헥사 스탯</h3>${renderHexaStatBoard(
    cores,
    state,
  )}</article></section>`;
}
function renderTabContent(state) {
  const tabs = state.pageData?.tabs || {};
  if (state.activeTab === "equipment")
    return renderEquipmentTab(
      tabs.equipment || {},
      state.pageData?.profile || {},
      state,
    );
  if (state.activeTab === "exp")
    return renderExpTab(
      tabs.exp || {},
      state.expHistory,
      state.pageData?.profile || {},
    );
  if (state.activeTab === "jewelSymbolVmatrix")
    return renderJewelSymbolVmatrixTab(tabs.jewelSymbolVmatrix || {}, state);
  if (state.activeTab === "hexamatrix")
    return renderHexamatrixTab(
      tabs.hexamatrix || {},
      tabs.jewelSymbolVmatrix || {},
      state,
    );
  if (state.activeTab === "hyperStat")
    return renderHyperStatTab(
      tabs.hyperStat || {},
      tabs.skillLink || {},
      state,
    );
  if (state.activeTab === "skillLink")
    return renderHyperStatTab(
      tabs.hyperStat || {},
      tabs.skillLink || {},
      state,
    );
  if (state.activeTab === "guild")
    return renderGuildTab(
      tabs.guild || {},
      state.pageData?.profile?.name || "",
    );
  if (state.activeTab === "union")
    return renderUnionTab(tabs.union || {}, state);
  return '<section class="tab-grid"><article class="data-card data-card--wide"><p class="empty">표시할 탭이 없습니다.</p></article></section>';
}

let equipHoverOverlayEl = null;
function getEquipHoverOverlayEl() {
  if (equipHoverOverlayEl && document.body.contains(equipHoverOverlayEl)) {
    return equipHoverOverlayEl;
  }

  equipHoverOverlayEl = document.createElement("div");
  equipHoverOverlayEl.className = "equip-hover-overlay";
  document.body.appendChild(equipHoverOverlayEl);
  return equipHoverOverlayEl;
}

function hideEquipHoverOverlay() {
  const overlay = getEquipHoverOverlayEl();
  overlay.innerHTML = "";
  overlay.classList.remove("is-touch");
  overlay.classList.remove("is-visible");
}

function positionEquipHoverOverlay(cardEl) {
  if (!cardEl) return;
  const overlay = getEquipHoverOverlayEl();
  const margin = 14;
  const gap = 12;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const overlayRect = overlay.getBoundingClientRect();
  const width = overlayRect.width || 420;
  const height = overlayRect.height || 520;
  const cardRect = cardEl.getBoundingClientRect();

  let left = cardRect.right + gap;
  let top = cardRect.top;

  if (left + width + margin > viewportWidth) {
    left = cardRect.left - width - gap;
  }
  if (left < margin) {
    left = margin;
  }
  if (top + height + margin > viewportHeight) {
    top = viewportHeight - height - margin;
  }
  if (top < margin) {
    top = margin;
  }

  overlay.style.left = `${Math.round(left)}px`;
  overlay.style.top = `${Math.round(top)}px`;
}

function showEquipHoverOverlay(cardEl, options = {}) {
  if (!cardEl) return;
  const template = cardEl.querySelector(".equip-hover-template, .cash-hover-template");
  if (!template) return;

  const overlay = getEquipHoverOverlayEl();
  const useTouchMode = options?.touch === true;
  if (useTouchMode) {
    overlay.classList.add("is-touch");
    overlay.innerHTML = `<div class="equip-touch-modal">${template.innerHTML}</div>`;
    overlay.classList.add("is-visible");
    return;
  }

  overlay.classList.remove("is-touch");
  overlay.innerHTML = template.innerHTML;
  overlay.classList.add("is-visible");
  positionEquipHoverOverlay(cardEl);
}

async function initCharacterPage() {
  applyPageIdentity();
  const messageEl = document.getElementById("pageMessage");
  const profileCardEl = document.getElementById("profileCard");
  const tabNavEl = document.getElementById("tabNav");
  const tabContentEl = document.getElementById("tabContent");
  if (!messageEl || !profileCardEl || !tabNavEl || !tabContentEl) return;
  const routeInfo = getCharacterRouteInfo();
  if (!routeInfo) {
    setMessage(messageEl, "URL 형식이 올바르지 않습니다.", "error");
    return;
  }
  const { worldName, characterName } = routeInfo;
  applyPageIdentity(buildScopedIdentityLabel(characterName, worldName));
  const quickSearchForm = document.getElementById("quickSearchForm");
  bindCharacterSearchForm(quickSearchForm);
  if (quickSearchForm) {
    const qws = quickSearchForm.querySelector('select[name="world_name"]');
    const qci = quickSearchForm.querySelector('input[name="character_name"]');
    if (qws) qws.value = worldName;
    if (qci) qci.value = characterName;
  }
  const state = {
    activeTab: "equipment",
    pageData: null,
    logStatus: null,
    expHistory: { loading: false, data: { ok: true, points: [] } },
    selectedPresetByTab: {
      equipment: null,
      union: null,
      android: null,
      jewelSymbolVmatrix: null,
      hyperStat: null,
      skillLink: null,
      hexaStat: null,
    },
  };
  const renderProfileCard = () => {
    profileCardEl.innerHTML = renderProfile(
      state.pageData?.profile || {},
      state.pageData?.query || {},
    );
  };
  const hydrateProfileSummaryMeta = async () => {
    const pageData = state.pageData;
    if (!pageData || !pageData.profile || !pageData.query) {
      return;
    }

    const profile = pageData.profile;
    const worldName = String(pageData?.query?.worldNameCanonical || "").trim();
    const guildName = String(profile?.guildName || "").trim();
    let changed = false;

    if (!String(profile?.guildMarkIcon || "").trim() && worldName && guildName && guildName !== "-") {
      const guildMark = await resolveRankingGuildMark(worldName, guildName);
      if (guildMark) {
        profile.guildMarkIcon = guildMark;
        changed = true;
      }
    }

    const currentRank =
      parseNumericValue(profile?.overallRanking) ??
      parseNumericValue(profile?.overallRankingText) ??
      parseNumericValue(profile?.ranking);
    if ((!currentRank || currentRank < 1) && pageData?.ocid) {
      const resolvedRanking = await resolveOverallRankingByOcid(pageData.ocid, { days: 7 });
      if (resolvedRanking?.ranking) {
        profile.overallRanking = resolvedRanking.ranking;
        profile.overallRankingText = `전체랭킹 - ${Number(resolvedRanking.ranking).toLocaleString("ko-KR")}위`;
        changed = true;
      }
    }

    if (changed) {
      renderProfileCard();
    }
  };
  const render = () => {
    if (typeof clearTouchPopover === "function") {
      clearTouchPopover();
    }
    tabContentEl.innerHTML = renderTabContent(state);
  };
  tabContentEl.hidden = false;
  tabContentEl.innerHTML = renderLoadingCard(
    "캐릭터 데이터를 불러오는 중입니다...",
  );
  setupTabNav(tabNavEl, (tabId) => {
    state.activeTab = tabId;
    hideEquipHoverOverlay();
    render();
  });
  let activeHoverCardEl = null;
  let activeTouchCard = null;
  const clearTouchPopover = () => {
    if (activeTouchCard) {
      activeTouchCard.classList.remove("is-touch-open");
      activeTouchCard = null;
    }
    hideEquipHoverOverlay();
  };
  const showTouchPopover = (cardEl) => {
    if (!cardEl) return;
    cardEl.classList.add("is-touch-open");
    activeTouchCard = cardEl;
    showEquipHoverOverlay(cardEl, { touch: true });
  };
  const supportsHoverPointer =
    window.matchMedia &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const prefersTouchInteraction =
    window.matchMedia &&
    (window.matchMedia("(hover: none), (pointer: coarse)").matches ||
      window.matchMedia("(max-width: 980px)").matches);
  const useHoverInteraction = !!(supportsHoverPointer && !prefersTouchInteraction);

  if (useHoverInteraction) {
    tabContentEl.addEventListener("pointerover", (event) => {
      const cardEl = event.target.closest(".equip-card, .cash-slot-card");
      if (!cardEl || !tabContentEl.contains(cardEl)) {
        return;
      }

      activeHoverCardEl = cardEl;
      showEquipHoverOverlay(cardEl);
    });
    tabContentEl.addEventListener("pointerout", (event) => {
      if (!activeHoverCardEl) {
        return;
      }
      const leavingFromActive = event.target.closest(".equip-card, .cash-slot-card");
      if (leavingFromActive !== activeHoverCardEl) {
        return;
      }
      const related = event.relatedTarget;
      if (related && activeHoverCardEl.contains(related)) {
        return;
      }

      activeHoverCardEl = null;
      hideEquipHoverOverlay();
    });
    window.addEventListener("scroll", () => {
      if (!activeHoverCardEl) return;
      positionEquipHoverOverlay(activeHoverCardEl);
    });
    window.addEventListener("resize", () => {
      if (!activeHoverCardEl) return;
      positionEquipHoverOverlay(activeHoverCardEl);
    });
  }
  if (!useHoverInteraction) {
    const overlayEl = getEquipHoverOverlayEl();
    overlayEl.addEventListener("click", (event) => {
      if (!overlayEl.classList.contains("is-touch")) return;
      const modalEl = overlayEl.querySelector(".equip-touch-modal");
      if (modalEl && modalEl.contains(event.target)) return;
      clearTouchPopover();
    });
  }

  tabContentEl.addEventListener("click", (e) => {
    if (!useHoverInteraction) {
      const cardEl = e.target.closest(".equip-card, .cash-slot-card");
      if (cardEl && tabContentEl.contains(cardEl)) {
        if (activeTouchCard === cardEl) {
          clearTouchPopover();
        } else {
          clearTouchPopover();
          showTouchPopover(cardEl);
        }
        return;
      }
      if (activeTouchCard) {
        clearTouchPopover();
      }
    }

    const expandBtn = e.target.closest("[data-expand-target]");
    if (expandBtn && tabContentEl.contains(expandBtn)) {
      const targetSelector = String(expandBtn.dataset.expandTarget || "").trim();
      const targetEl = targetSelector
        ? tabContentEl.querySelector(targetSelector)
        : null;
      if (targetEl) {
        const collapsed = targetEl.classList.toggle("is-collapsed");
        expandBtn.classList.toggle("is-open", !collapsed);
        const closeLabel = String(
          expandBtn.dataset.expandLabelClose || "더보기",
        );
        const openLabel = String(
          expandBtn.dataset.expandLabelOpen || "접기",
        );
        expandBtn.textContent = collapsed ? closeLabel : openLabel;
      }
      return;
    }

    const summaryEl = e.target.closest("details > summary");
    if (summaryEl && tabContentEl.contains(summaryEl)) {
      e.preventDefault();
      const detailsEl = summaryEl.parentElement;
      if (detailsEl && detailsEl.tagName === "DETAILS") {
        detailsEl.open = !detailsEl.open;
      }
      return;
    }

    const btn = e.target.closest("[data-preset-tab][data-preset-no]");
    if (!btn) return;
    const tabKey = btn.dataset.presetTab;
    const presetNo = parseNumericValue(btn.dataset.presetNo);
    if (!tabKey || presetNo === null) return;
    state.selectedPresetByTab[tabKey] = presetNo;
    hideEquipHoverOverlay();
    render();
  });
  const params = new URLSearchParams({
    world_name: worldName,
    character_name: characterName,
  });
  try {
    const pageRes = await fetch(
      `/api/maplestorym/character/page-data?${params.toString()}`,
    );
    const page = await parseResponseSafely(pageRes);
    if (!pageRes.ok || !page.ok) {
      const mRaw =
        page?.message ||
        page?.error?.error?.message ||
        "캐릭터 조회에 실패했습니다.";
      const m = normalizeCharacterLookupErrorMessage(mRaw);
      setMessage(messageEl, m, "error");
      tabContentEl.innerHTML =
        m === "검색 결과가 없습니다."
          ? renderNotFoundCard(m)
          : renderErrorCard(m);
      return;
    }
    state.pageData = page;
    applyPageIdentity(
      buildScopedIdentityLabel(
        page?.profile?.name || characterName,
        page?.query?.worldNameCanonical || worldName,
      ),
    );
    renderProfileCard();
    profileCardEl.hidden = false;
    tabNavEl.hidden = false;
    hideEquipHoverOverlay();
    render();
    setMessage(messageEl, "", "info");
    hydrateProfileSummaryMeta();
    if (page.ocid) {
      state.expHistory.loading = true;
      if (state.activeTab === "exp") render();
      const [hRes, lRes] = await Promise.all([
        fetch(
          `/api/maplestorym/character/exp-history?${new URLSearchParams({ ocid: page.ocid, limit: "200" }).toString()}`,
        ),
        fetch(
          `/api/maplestorym/character/log-status?${new URLSearchParams({ ocid: page.ocid }).toString()}`,
        ),
      ]);
      const [hPayload, lPayload] = await Promise.all([
        parseResponseSafely(hRes),
        parseResponseSafely(lRes),
      ]);
      state.expHistory.loading = false;
      state.expHistory.data =
        hRes.ok && hPayload.ok ? hPayload : { ok: true, points: [] };
      state.logStatus = lRes.ok && lPayload.ok ? lPayload : null;
      renderProfileCard();
      hydrateProfileSummaryMeta();
      hideEquipHoverOverlay();
      render();
    }
  } catch (error) {
    const m = `네트워크 오류: ${error.message}`;
    setMessage(messageEl, m, "error");
    tabContentEl.innerHTML = renderErrorCard(m);
  }
}


export async function init() {
  await initCharacterPage();
}
