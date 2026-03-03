import {
  escapeHtml,
  formatNumber,
  normalizeForMatch,
  parseNumericValue,
  rankingThumbDefaultSrc,
  renderRankingCharacterNameLink,
  resolveWorldIcon,
  sanitizeEquipmentText,
  toArray,
  guildBuildingSlots,
} from "../core/common.js";

function parseGuildMemberCount(value) {
  const rawText = String(value ?? "").trim();
  const compact = rawText.replace(/\s+/g, "");
  const ratioMatch = compact.match(/^(\d+)\/(\d+)$/);
  if (ratioMatch) {
    const current = Number(ratioMatch[1]);
    const max = Number(ratioMatch[2]);
    const percent =
      Number.isFinite(current) && Number.isFinite(max) && max > 0
        ? Math.max(0, Math.min(100, (current / max) * 100))
        : null;
    return {
      displayText: `${formatNumber(current)} / ${formatNumber(max)}`,
      percent,
    };
  }
  const parsed = parseNumericValue(rawText);
  if (parsed !== null) {
    return { displayText: formatNumber(parsed), percent: null };
  }
  return { displayText: rawText || "-", percent: null };
}
function formatGuildCreateDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const directMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (directMatch) return directMatch[0];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.split(" ")[0] || raw;
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(parsed);
}
function renderGuildSkillHoverCard(skill) {
  const skillName = sanitizeEquipmentText(skill?.skillName || "-") || "-";
  const skillLevel = formatGuildSkillLevelText(skill?.skillLevel);
  const skillOption =
    sanitizeEquipmentText(skill?.skillOption || "").trim() || "-";
  const skillIcon = String(skill?.skillIcon || "").trim();
  return `<article class="cash-hover-card guild-skill-hover-card"><header class="cash-hover__header"><div class="cash-hover__icon-wrap">${skillIcon ? `<img class="cash-hover__icon" src="${escapeHtml(skillIcon)}" alt="${escapeHtml(skillName)}" loading="lazy" />` : '<div class="cash-hover__icon cash-hover__icon--empty">NO</div>'}</div><div class="cash-hover__title-wrap"><h4>${escapeHtml(
    skillName,
  )}</h4><p>개인 길드 스킬</p></div></header><section class="cash-hover__body"><dl><div><dt>스킬명</dt><dd>${escapeHtml(
    skillName,
  )}</dd></div><div><dt>레벨</dt><dd>${escapeHtml(
    skillLevel,
  )}</dd></div><div><dt>효과</dt><dd>${escapeHtml(
    skillOption,
  )}</dd></div></dl></section></article>`;
}
function formatGuildSkillLevelText(levelValue) {
  const raw = String(levelValue ?? "").trim();
  if (!raw || raw === "-") return "-";
  if (/max/i.test(raw)) return "Max";
  const parsed = parseNumericValue(raw);
  if (parsed === null) return raw;
  return `Lv.${formatNumber(parsed)}`;
}
function resolveGuildSkillTierByColumn(columnNo) {
  if (columnNo <= 3) return "R";
  if (columnNo <= 6) return "E";
  if (columnNo <= 8) return "U";
  return "L";
}
const fixedGuildPersonalSkillSlots = Object.freeze([
  {
    row: 1,
    col: 2,
    skillName: "스타포스 Lv.5",
    skillIcon:
      "https://open.api.nexon.com/static/maplestorym/asset/icon/f4feeb05dc55c86dd33d29ad37c268ce2f8bf5edaa792ba649f2072479f22f7f53149cd8e1c0890ad6af5b72c3e6b014",
  },
  {
    row: 1,
    col: 4,
    skillName: "경험치 획득량 Lv.5",
    skillIcon:
      "https://open.api.nexon.com/static/maplestorym/asset/icon/35f263049887745d84612c5996a16ef1012f5b2ecea4288fadfb57c1a4f2be7d",
  },
  {
    row: 1,
    col: 6,
    skillName: "최대 HP/MP Lv.5",
    skillIcon:
      "https://open.api.nexon.com/static/maplestorym/asset/icon/f4feeb05dc55c86dd33d29ad37c268ceb575e577ca90c47160b3280e8d1ba314",
  },
  {
    row: 1,
    col: 8,
    skillName: "파티 경험치 획득량 Lv.5",
    skillIcon:
      "https://open.api.nexon.com/static/maplestorym/asset/icon/90b7a3f582eddc7be19de69db8ee1ec175c8d03915ddc856346c2056cf16d358149cea6a461c1caa092d808a1d1fe968",
  },
  {
    row: 1,
    col: 10,
    skillName: "맥스 피버 확률 Lv.5",
    skillIcon:
      "https://open.api.nexon.com/static/maplestorym/asset/icon/f4feeb05dc55c86dd33d29ad37c268ce43c849099fb0ac0173993ebc9f00391e",
  },
  {
    row: 2,
    col: 1,
    skillName: "물리/마법 공격력 Lv.5",
    skillIcon:
      "https://open.api.nexon.com/static/maplestorym/asset/icon/f4feeb05dc55c86dd33d29ad37c268cee03f625dbe0b910cc678fd0fddbb1cee",
  },
  {
    row: 2,
    col: 3,
    skillName: "물리/마법 대미지 Lv.5",
    skillIcon:
      "https://open.api.nexon.com/static/maplestorym/asset/icon/f4feeb05dc55c86dd33d29ad37c268ce9ea5ab1fda56f8229190af5d1999ec1d73f542ba3e59fd26c3640f084b378cdb",
  },
  {
    row: 2,
    col: 5,
    skillName: "물리/마법 공격력 Lv.5",
    skillIcon:
      "https://open.api.nexon.com/static/maplestorym/asset/icon/f4feeb05dc55c86dd33d29ad37c268cee03f625dbe0b910cc678fd0fddbb1cee",
  },
  {
    row: 2,
    col: 7,
    skillName: "물리/마법 대미지 Lv.5",
    skillIcon:
      "https://open.api.nexon.com/static/maplestorym/asset/icon/f4feeb05dc55c86dd33d29ad37c268ce9ea5ab1fda56f8229190af5d1999ec1d73f542ba3e59fd26c3640f084b378cdb",
  },
  {
    row: 2,
    col: 9,
    skillName: "최대 대미지 Lv.5",
    skillIcon:
      "https://open.api.nexon.com/static/maplestorym/asset/icon/f4feeb05dc55c86dd33d29ad37c268cea60daf41af1fdf0bc8b8c273e0fe4b7ff2f6ca7dbf581182a4c066612cb33fc7",
  },
  {
    row: 3,
    col: 2,
    skillName: "치명타 확률 Lv.5",
    skillIcon:
      "https://open.api.nexon.com/static/maplestorym/asset/icon/f4feeb05dc55c86dd33d29ad37c268ce2e26d4a0b0585c3a55e313a94dcc347e59dc4da775dff8c0901a5894d4a678b9",
  },
  {
    row: 3,
    col: 4,
    skillName: "보스 공격력 Lv.5",
    skillIcon:
      "https://open.api.nexon.com/static/maplestorym/asset/icon/8370d11a0f30624fab0e8bdfd0ff95b3c6230ef69a880ef610b80d5e936ebd8f",
  },
  {
    row: 3,
    col: 6,
    skillName: "치명타 피해 Lv.5",
    skillIcon:
      "https://open.api.nexon.com/static/maplestorym/asset/icon/f4feeb05dc55c86dd33d29ad37c268cea5675d667b675ed450c8c4d859f46ea14e07aff98ea876012dbf7ee44f1efefe",
  },
  {
    row: 3,
    col: 8,
    skillName: "최종 대미지 Lv.5",
    skillIcon:
      "https://open.api.nexon.com/static/maplestorym/asset/icon/90b7a3f582eddc7be19de69db8ee1ec1cd5641726723db7b727b38f045a7344d",
  },
  {
    row: 3,
    col: 10,
    skillName: "최종 대미지 Lv.5",
    skillIcon:
      "https://open.api.nexon.com/static/maplestorym/asset/icon/90b7a3f582eddc7be19de69db8ee1ec1cd5641726723db7b727b38f045a7344d",
  },
]);
function normalizeGuildSkillLookupName(value) {
  return normalizeForMatch(
    String(value || "")
      .replace(/lv\.?\s*\d+/gi, "")
      .replace(/레벨\s*\d+/gi, "")
      .replace(/max/gi, ""),
  );
}
function stripGuildSkillLevelText(value) {
  return String(value || "")
    .replace(/\s*lv\.?\s*\d+/gi, "")
    .replace(/\s*레벨\s*\d+/gi, "")
    .trim();
}
function renderGuildSkillSlot(skill, index, options = {}) {
  const skillName = sanitizeEquipmentText(skill?.skillName || "-") || "-";
  const skillLevel = formatGuildSkillLevelText(skill?.skillLevel);
  const skillIcon = String(skill?.skillIcon || "").trim();
  const slotKey = `guild-skill-${index + 1}`;
  const tierLabel =
    String(options.tierLabel || "").trim() ||
    resolveGuildSkillTierByColumn((index % 10) + 1);
  const hasNext = !!options.hasNext;
  const hoverTemplate = renderGuildSkillHoverCard(skill);
  return `<article class="cash-slot-card guild-skill-slot ${skillIcon ? "is-filled" : "is-empty"}" data-cash-slot="${escapeHtml(
    slotKey,
  )}">${skillIcon ? `<img src="${escapeHtml(skillIcon)}" alt="${escapeHtml(
    skillName,
  )}" loading="lazy" />` : '<span class="cash-slot-card__placeholder">NO</span>'}<span class="guild-skill-slot__tier guild-skill-slot__tier--${escapeHtml(
    tierLabel,
  )}">${escapeHtml(
    tierLabel,
  )}</span><p class="guild-skill-slot__level">${escapeHtml(
    skillLevel,
  )}</p>${hasNext ? '<span class="guild-skill-slot__link" aria-hidden="true"></span>' : ""}<template class="cash-hover-template">${hoverTemplate}</template></article>`;
}
function renderGuildPersonalSkillBoard(skills) {
  const personalSkills = toArray(skills);
  const skillByName = new Map();
  personalSkills.forEach((skill) => {
    const lookup = normalizeGuildSkillLookupName(skill?.skillName || "");
    if (!lookup || skillByName.has(lookup)) return;
    skillByName.set(lookup, skill);
  });
  const nodes = new Map();
  fixedGuildPersonalSkillSlots.forEach((slot, index) => {
    const lookup = normalizeGuildSkillLookupName(slot.skillName);
    const apiSkill = skillByName.get(lookup) || null;
    const mergedSkill = {
      skillName: apiSkill?.skillName || stripGuildSkillLevelText(slot.skillName) || slot.skillName,
      skillIcon: slot.skillIcon,
      skillLevel: apiSkill?.skillLevel ?? apiSkill?.skill_level ?? 0,
      skillOption: apiSkill?.skillOption || apiSkill?.skill_option || "-",
    };
    const row = slot.row;
    const col = slot.col;
    nodes.set(`${row}-${col}`, {
      skill: mergedSkill,
      sequence: index + 1,
      tierLabel: resolveGuildSkillTierByColumn(col),
    });
  });
  const hasNode = (row, col) => nodes.has(`${row}-${col}`);
  const renderRow = (row) =>
    `<div class="guild-personal-row">${Array.from({ length: 10 }, (_, idx) => {
      const col = idx + 1;
      const key = `${row}-${col}`;
      const payload = nodes.get(key);
      if (!payload) {
        return '<article class="guild-skill-slot guild-skill-slot--empty" aria-hidden="true"></article>';
      }
      return renderGuildSkillSlot(payload.skill, payload.sequence - 1, {
        hasNext: hasNode(row, col + 2),
        tierLabel: payload.tierLabel,
      });
    }).join("")}</div>`;

  const columnHead = Array.from(
    { length: 10 },
    (_, idx) => `<span>${escapeHtml(String(idx + 1))}</span>`,
  ).join("");

  return `<div class="guild-personal-board-wrap"><section class="guild-personal-board"><div class="guild-personal-board__head">${columnHead}</div>${renderRow(
    1,
  )}${renderRow(2)}${renderRow(3)}</section></div>`;
}
function renderGuildTab(tabData, name) {
  const s = tabData?.summary || {};
  const m = tabData?.memberSelf || null;
  const worldIcon = resolveWorldIcon(s.worldName);
  const mark = s.guildMarkIcon
    ? `<img class="guild-overview-mark" src="${escapeHtml(s.guildMarkIcon)}" alt="${escapeHtml(s.guildName || "길드")} 마크" loading="lazy" />`
    : '<div class="guild-overview-mark guild-overview-mark--empty">NO MARK</div>';
  const guildMasterLink = renderRankingCharacterNameLink(
    s.guildMasterName || "-",
    s.worldName || "",
  );
  const guildCreateDate = formatGuildCreateDateOnly(s.guildCreateDate || "-");
  const memberCount = parseGuildMemberCount(s.guildMemberCount);
  const progressPercent = memberCount.percent ?? 100;
  const progressText =
    memberCount.percent === null
      ? "100%"
      : `${Math.round(progressPercent)}%`;
  const guildActivityValue = parseNumericValue(m?.guildActivity);
  const guildActivityText =
    guildActivityValue === null
      ? String(m?.guildActivity || "-")
      : formatNumber(guildActivityValue);
  const skillGrid = m
    ? renderGuildPersonalSkillBoard(m.guildPersonalSkill)
    : `<p class="empty">${escapeHtml(name || "현재 캐릭터")}와 일치하는 길드원 정보가 없습니다.</p>`;

  return `<section class="tab-grid guild-tab-grid"><article class="data-card data-card--wide guild-overview-card"><h3>길드 기본 정보</h3><div class="guild-overview-head">${mark}<div class="guild-overview-title"><strong>${worldIcon ? `<img class="guild-overview-world" src="${escapeHtml(worldIcon)}" alt="${escapeHtml(
    s.worldName || "-",
  )}" />` : ""}<span>${escapeHtml(
    s.guildName || "-",
  )}</span></strong><p>길드장 <span class="guild-master-link">${guildMasterLink}</span></p></div></div><div class="guild-overview-progress"><span class="guild-overview-level">Lv.${escapeHtml(
    s.guildLevel ?? "-",
  )}</span><div class="guild-overview-progressbar" role="img" aria-label="${escapeHtml(
    `길드 현황 ${progressText}`,
  )}"><span style="width:${escapeHtml(progressPercent.toFixed(2))}%"></span></div><strong class="guild-overview-percent">${escapeHtml(
    progressText,
  )}</strong></div><ul class="guild-overview-meta"><li><span>길드원</span><strong>${escapeHtml(
    memberCount.displayText,
  )}</strong></li><li><span>생성일</span><strong>${escapeHtml(
    guildCreateDate,
  )}</strong></li><li><span>길드활동</span><strong>${escapeHtml(
    guildActivityText,
  )}</strong></li><li><span>캐릭터</span><strong>${escapeHtml(
    m?.characterName || name || "-",
  )}</strong></li></ul></article><article class="data-card data-card--wide guild-personal-card"><h3>길드 개인 스킬</h3>${skillGrid}</article></section>`;
}
function resolveGuildAbilityGradeLabel(rawValue) {
  const raw = String(rawValue ?? "").trim();
  const normalized = normalizeForMatch(raw);
  if (normalized.includes("legendary") || normalized.includes("레전")) return "L";
  if (normalized.includes("unique") || normalized.includes("유니크")) return "U";
  if (normalized.includes("epic") || normalized.includes("에픽")) return "E";
  if (normalized.includes("rare") || normalized.includes("레어")) return "R";
  const numeric = parseNumericValue(raw);
  if (numeric === 4) return "L";
  if (numeric === 3) return "U";
  if (numeric === 2) return "E";
  if (numeric === 1) return "R";
  return raw || "-";
}
function resolveGuildAbilityGradeClass(label) {
  const tier = String(label || "").trim();
  if (tier === "L") return "guild-ability-grade--L";
  if (tier === "U") return "guild-ability-grade--U";
  if (tier === "E") return "guild-ability-grade--E";
  if (tier === "R") return "guild-ability-grade--R";
  return "";
}
function buildGuildBuildingSlots(buildings) {
  const list = toArray(buildings).map((building) => ({
    buildingName: building?.buildingName || building?.building_name || "-",
    buildingLevel: building?.buildingLevel ?? building?.building_level ?? 0,
  }));
  const slots = guildBuildingSlots.map((slot) => {
    const matched = list.find((entry) =>
      slot.keywords.some((keyword) =>
        normalizeForMatch(entry.buildingName).includes(
          normalizeForMatch(keyword),
        ),
      ),
    );
    const levelValue = parseNumericValue(matched?.buildingLevel) ?? 0;
    return {
      ...slot,
      buildingName: matched?.buildingName || slot.label,
      buildingLevel: levelValue,
    };
  });
  return slots.sort((a, b) => {
    const left = parseNumericValue(a.buildingLevel);
    const right = parseNumericValue(b.buildingLevel);
    if (left !== null && right !== null) return right - left;
    if (left !== null) return -1;
    if (right !== null) return 1;
    return String(a.buildingName || "").localeCompare(
      String(b.buildingName || ""),
    );
  });
}
function renderGuildSummaryCard(summary) {
  const s = summary || {};
  const worldIcon = resolveWorldIcon(s.worldName);
  const mark = s.guildMarkIcon
    ? `<img class="guild-overview-mark" src="${escapeHtml(s.guildMarkIcon)}" alt="${escapeHtml(s.guildName || "길드")} 마크" loading="lazy" />`
    : '<div class="guild-overview-mark guild-overview-mark--empty">NO MARK</div>';
  const memberCount = parseGuildMemberCount(s.guildMemberCount);
  const progressPercent = memberCount.percent ?? 100;
  const progressText =
    memberCount.percent === null
      ? "100%"
      : `${Math.round(progressPercent)}%`;
  const guildCreateDate = formatGuildCreateDateOnly(s.guildCreateDate || "-");
  const guildMasterLink = renderRankingCharacterNameLink(
    s.guildMasterName || "-",
    s.worldName || "",
  );
  return `<section class="tab-grid guild-summary-grid"><article class="data-card data-card--wide guild-overview-card"><h3>길드 기본 정보</h3><div class="guild-overview-head">${mark}<div class="guild-overview-title"><strong>${worldIcon ? `<img class="guild-overview-world" src="${escapeHtml(worldIcon)}" alt="${escapeHtml(
    s.worldName || "-",
  )}" />` : ""}<span>${escapeHtml(
    s.guildName || "-",
  )}</span></strong><p>길드장 <span class="guild-master-link">${guildMasterLink}</span></p></div></div><div class="guild-overview-progress"><span class="guild-overview-level">Lv.${escapeHtml(
    s.guildLevel ?? "-",
  )}</span><div class="guild-overview-progressbar" role="img" aria-label="${escapeHtml(
    `길드 현황 ${progressText}`,
  )}"><span style="width:${escapeHtml(progressPercent.toFixed(2))}%"></span></div><strong class="guild-overview-percent">${escapeHtml(
    progressText,
  )}</strong></div><ul class="guild-overview-meta"><li><span>길드원</span><strong>${escapeHtml(
    memberCount.displayText,
  )}</strong></li><li><span>생성일</span><strong>${escapeHtml(
    guildCreateDate,
  )}</strong></li><li><span>월드</span><strong>${escapeHtml(
    s.worldName || "-",
  )}</strong></li><li><span>길드 레벨</span><strong>${escapeHtml(
    s.guildLevel ?? "-",
  )}</strong></li></ul></article></section>`;
}
function renderGuildMemberListTab(members, worldName) {
  const list = toArray(members);
  const sorted = [...list].sort((left, right) => {
    const leftLevel = parseNumericValue(
      left?.characterLevel ?? left?.character_level,
    );
    const rightLevel = parseNumericValue(
      right?.characterLevel ?? right?.character_level,
    );
    if (leftLevel !== null && rightLevel !== null) {
      return rightLevel - leftLevel;
    }
    if (leftLevel !== null) return -1;
    if (rightLevel !== null) return 1;
    return String(left?.characterName || left?.character_name || "").localeCompare(
      String(right?.characterName || right?.character_name || ""),
    );
  });
  if (!sorted.length) {
    return `<section class="tab-grid"><article class="data-card data-card--wide"><p class="empty">길드원 정보가 없습니다.</p></article></section>`;
  }
  const cards = sorted
    .map((member) => {
      const name = member?.characterName || member?.character_name || "-";
      const level = member?.characterLevel ?? member?.character_level ?? "-";
      const job =
        member?.characterJob ||
        member?.character_class ||
        member?.character_job_name ||
        "-";
      const grade =
        member?.guildMemberGrade ||
        member?.guild_member_grade ||
        member?.guild_grade ||
        "";
      const activityRaw =
        member?.guildActivity ?? member?.guild_activity ?? "-";
      const activityValue = parseNumericValue(activityRaw);
      const activityText =
        activityValue === null ? String(activityRaw || "-") : formatNumber(activityValue);
      const portrait =
        member?.characterImage ||
        member?.character_image ||
        member?.characterIcon ||
        member?.character_icon ||
        "";
      const needsResolve = !portrait && name && name !== "-";
      const thumbSrc = portrait || rankingThumbDefaultSrc;
      const nameLink = renderRankingCharacterNameLink(name, worldName);
      return `<article class="guild-member-card"><div class="guild-member-card__avatar"><img class="guild-member-thumb js-guild-member-thumb${needsResolve ? " is-placeholder" : ""}" src="${escapeHtml(
        thumbSrc,
      )}" alt="${escapeHtml(name)}" loading="lazy" ${needsResolve ? `data-world-name="${escapeHtml(
        worldName || "",
      )}" data-char-name="${escapeHtml(name)}" data-thumb-needs-resolve="1"` : ""} /></div><div class="guild-member-card__body"><div class="guild-member-card__top"><strong>${nameLink}</strong>${grade ? `<span class="guild-member-card__grade">${escapeHtml(
        grade,
      )}</span>` : ""}</div><div class="guild-member-card__meta"><span>Lv.${escapeHtml(
        level,
      )}</span><span>${escapeHtml(
        job || "-",
      )}</span></div><div class="guild-member-card__activity">길드활동 ${escapeHtml(
        activityText,
      )}</div></div></article>`;
    })
    .join("");
  return `<section class="tab-grid"><article class="data-card data-card--wide"><div class="guild-member-grid">${cards}</div></article></section>`;
}
function renderGuildBuildingTab(buildings) {
  const slots = buildGuildBuildingSlots(buildings);
  const cards = slots
    .map(
      (slot) =>
        `<article class="guild-building-card"><div class="guild-building-card__image"><img src="${escapeHtml(
          slot.asset,
        )}" alt="${escapeHtml(
          slot.buildingName,
        )}" loading="lazy" /></div><div class="guild-building-card__info"><strong>${escapeHtml(
          slot.buildingName,
        )}</strong><span>Lv.${escapeHtml(
          slot.buildingLevel,
        )}</span></div></article>`,
    )
    .join("");
  return `<section class="tab-grid"><article class="data-card data-card--wide"><div class="guild-building-grid">${cards}</div></article></section>`;
}
function renderGuildAbilityTab(abilities) {
  const list = toArray(abilities);
  if (!list.length) {
    return `<section class="tab-grid"><article class="data-card data-card--wide"><p class="empty">길드 어빌리티 정보가 없습니다.</p></article></section>`;
  }
  const cards = list
    .map((ability) => {
      const name = ability?.abilityName || ability?.ability_name || "-";
      const level = formatGuildSkillLevelText(
        ability?.abilityLevel ?? ability?.ability_level ?? "-",
      );
      const option =
        ability?.abilityOption ||
        ability?.ability_option ||
        ability?.ability_desc ||
        "";
      const icon = ability?.abilityIcon || ability?.ability_icon || "";
      const gradeLabel = resolveGuildAbilityGradeLabel(
        ability?.abilityGrade ||
          ability?.ability_grade ||
          ability?.ability_grade_name ||
          "",
      );
      const gradeClass = resolveGuildAbilityGradeClass(gradeLabel);
      return `<article class="guild-ability-tile ${escapeHtml(
        gradeClass,
      )}"><div class="guild-ability-tile__frame ${escapeHtml(
        gradeClass,
      )}">${icon ? `<img src="${escapeHtml(icon)}" alt="${escapeHtml(
        name,
      )}" loading="lazy" />` : '<div class="guild-ability-card__icon-empty">NO</div>'}${gradeLabel && gradeLabel !== "-" ? `<span class="guild-ability-tile__grade">${escapeHtml(
        gradeLabel,
      )}</span>` : ""}${level && level !== "-" ? `<span class="guild-ability-tile__level">${escapeHtml(
        level,
      )}</span>` : ""}</div><div class="guild-ability-tile__info"><strong>${escapeHtml(
        name,
      )}</strong>${option ? `<span>${escapeHtml(option)}</span>` : ""}</div></article>`;
    })
    .join("");
  return `<section class="tab-grid"><article class="data-card data-card--wide"><div class="guild-ability-board">${cards}</div></article></section>`;
}


export {
  renderGuildAbilityTab,
  renderGuildBuildingTab,
  renderGuildMemberListTab,
  renderGuildSummaryCard,
  renderGuildTab,
};
