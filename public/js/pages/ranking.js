import {
  buildCharacterProfileHref,
  buildGuildProfileHref,
  escapeHtml,
  formatNumber,
  normalizeRankingLookupErrorMessage,
  normalizeForMatch,
  parseNumericValue,
  parseResponseSafely,
  rankingApiPageSize,
  rankingDateFloor,
  rankingPageSize,
  rankingThumbDefaultSrc,
  rankingTypes,
  renderRankingCharacterNameLink,
  resolveWorldIcon,
  setMessage,
  toArray,
  bindCharacterSearchForm,
  applyPageIdentity,
} from "../core/common.js";
import {
  configureRankingTypeSelect,
  configureRankingWorldSelect,
  getKstDateString,
  hydrateRankingCharacterThumbs,
  hydrateRankingGuildMarks,
  isRankingDataNotReadyMessage,
  isRankingNicknameSearchType,
  normalizeRankingDate,
  normalizeRankingPage,
  normalizeRankingType,
  shiftDateText,
} from "../features/ranking-shared.js";
import {
  resolveEquipmentGradeClass,
  resolveEquipmentGradeKey,
  resolvePotentialTierKey,
  resolveUnionGradeIcon,
} from "../features/equipment-shared.js";

function renderRankingCharacterCell(row, fallbackName = "") {
  const worldIcon = resolveWorldIcon(row.world_name);
  const thumb =
    row.character_image ||
    row.character_icon ||
    row.character_image_url ||
    rankingThumbDefaultSrc;
  const name = String(row.character_name || fallbackName || "-");
  const worldName = String(row.world_name || "").trim();
  const href = buildCharacterProfileHref(worldName, name);
  const dataAttrs =
    worldName && name !== "-"
      ? ` data-world-name="${escapeHtml(worldName)}" data-char-name="${escapeHtml(name)}"`
      : "";
  const thumbTag = `<img class="ranking-char-thumb js-ranking-char-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(name)}" loading="lazy"${dataAttrs} />`;
  const thumbWrapper = href
    ? `<a class="ranking-char-thumb-link" href="${escapeHtml(href)}">${thumbTag}</a>`
    : `<span class="ranking-char-thumb-link">${thumbTag}</span>`;

  return `<span class="ranking-char-cell">${thumbWrapper}<span class="ranking-char-meta">${worldIcon ? `<img class="ranking-world-mini" src="${escapeHtml(worldIcon)}" alt="${escapeHtml(String(row.world_name || ""))}" />` : ""}${renderRankingCharacterNameLink(name, worldName)}</span></span>`;
}

function renderRankingGuildCell({
  worldName,
  guildName,
  guildMarkIcon,
  linkable = false,
}) {
  const world = String(worldName || "").trim();
  const guild = String(guildName || "").trim();
  const guildMark = String(guildMarkIcon || "").trim();
  const guildHref =
    linkable && world && guild && guild !== "-"
      ? buildGuildProfileHref(world, guild)
      : "";
  const guildMarkHtml = guildMark
    ? `<img class="ranking-guild-mark" src="${escapeHtml(guildMark)}" alt="${escapeHtml(String(guild || "길드"))}" loading="lazy" />`
    : world && guild && guild !== "-"
      ? `<img class="ranking-guild-mark js-ranking-guild-mark" src="" alt="${escapeHtml(String(guild || "길드"))}" loading="lazy" data-world-name="${escapeHtml(world)}" data-guild-name="${escapeHtml(guild)}" hidden />`
      : "";
  const guildLabel = escapeHtml(guild || "-");
  const guildText = guildHref
    ? `<a class="ranking-char-link" href="${escapeHtml(guildHref)}">${guildLabel}</a>`
    : `<span>${guildLabel}</span>`;
  return `<span class="ranking-guild">${guildMarkHtml}${guildText}</span>`;
}

function renderRankingGradeCell(unionGrade, unionGradeIcon) {
  const icon = resolveUnionGradeIcon(unionGrade, unionGradeIcon);
  return `<span class="ranking-grade-cell">${icon ? `<img class="ranking-grade-icon" src="${escapeHtml(icon)}" alt="${escapeHtml(String(unionGrade || "등급"))}" loading="lazy" />` : ""}<span>${escapeHtml(unionGrade || "-")}</span></span>`;
}

function getRankingColumns(type) {
  if (type === "union") {
    return ["#", "캐릭터", "등급", "유니온 레벨", "직업", "길드"];
  }
  if (type === "achievement") {
    return ["#", "캐릭터", "업적 점수", "티어", "길드"];
  }
  if (type === "sharenian-battlefield") {
    return ["#", "길드", "점수", "길드마스터"];
  }
  if (type === "sharenian-waterway") {
    return ["#", "캐릭터", "점수", "길드", "길드마스터"];
  }
  if (type === "root-of-time") {
    return ["#", "캐릭터", "점수", "직업", "길드"];
  }
  return ["#", "캐릭터", "레벨", "직업", "길드"];
}

function renderRankingRow(type, row, rankNo, targetCharacterNameNorm = "") {
  const rowNameNorm = normalizeForMatch(row?.character_name || row?.guild_master_name || "");
  const isTargetRow =
    !!targetCharacterNameNorm &&
    !!rowNameNorm &&
    rowNameNorm === targetCharacterNameNorm;
  const rowClassAttr = isTargetRow ? ' class="is-target"' : "";

  if (type === "union") {
    return `<tr${rowClassAttr}><td class="is-num">${escapeHtml(String(rankNo))}</td><td>${renderRankingCharacterCell(row)}</td><td>${renderRankingGradeCell(row.union_grade, row.union_grade_icon)}</td><td class="is-num ranking-value-highlight">${escapeHtml(formatNumber(row.union_level))}</td><td>${escapeHtml(row.character_class || "-")}</td><td>${renderRankingGuildCell({ worldName: row.world_name, guildName: row.guild_name, guildMarkIcon: row.guild_mark_icon, linkable: true })}</td></tr>`;
  }

  if (type === "achievement") {
    return `<tr${rowClassAttr}><td class="is-num">${escapeHtml(String(rankNo))}</td><td>${renderRankingCharacterCell(row)}</td><td class="is-num ranking-value-highlight">${escapeHtml(formatNumber(row.achievement_score))}</td><td>${renderRankingGradeCell(row.achievement_grade_name, row.achievement_grade_icon)}</td><td>${renderRankingGuildCell({ worldName: row.world_name, guildName: row.guild_name, guildMarkIcon: row.guild_mark_icon })}</td></tr>`;
  }

  if (type === "sharenian-battlefield") {
    return `<tr${rowClassAttr}><td class="is-num">${escapeHtml(String(rankNo))}</td><td>${renderRankingGuildCell({ worldName: row.world_name, guildName: row.guild_name, guildMarkIcon: row.guild_mark_icon, linkable: true })}</td><td class="is-num ranking-value-highlight">${escapeHtml(formatNumber(parseNumericValue(row.season_score)))}</td><td>${renderRankingCharacterNameLink(row.guild_master_name || "-", row.world_name)}</td></tr>`;
  }

  if (type === "sharenian-waterway") {
    const fallbackCharacterName = String(
      row.character_name || row.guild_master_name || "-",
    );
    return `<tr${rowClassAttr}><td class="is-num">${escapeHtml(String(rankNo))}</td><td>${renderRankingCharacterCell(row, fallbackCharacterName)}</td><td class="is-num ranking-value-highlight">${escapeHtml(formatNumber(parseNumericValue(row.season_score)))}</td><td>${renderRankingGuildCell({ worldName: row.world_name, guildName: row.guild_name, guildMarkIcon: row.guild_mark_icon })}</td><td>${renderRankingCharacterNameLink(row.guild_master_name || "-", row.world_name)}</td></tr>`;
  }

  if (type === "root-of-time") {
    return `<tr${rowClassAttr}><td class="is-num">${escapeHtml(String(rankNo))}</td><td>${renderRankingCharacterCell(row)}</td><td class="is-num ranking-value-highlight">${escapeHtml(formatNumber(parseNumericValue(row.max_damage)))}</td><td>${escapeHtml(row.character_class || "-")}</td><td>${renderRankingGuildCell({ worldName: row.world_name, guildName: row.guild_name, guildMarkIcon: row.guild_mark_icon, linkable: true })}</td></tr>`;
  }

  return `<tr${rowClassAttr}><td class="is-num">${escapeHtml(String(rankNo))}</td><td>${renderRankingCharacterCell(row)}</td><td class="is-num">${escapeHtml(formatNumber(row.character_level))}</td><td>${escapeHtml(row.character_class || "-")}</td><td>${renderRankingGuildCell({ worldName: row.world_name, guildName: row.guild_name, guildMarkIcon: row.guild_mark_icon, linkable: true })}</td></tr>`;
}

function renderRankingTable(type, rows, pageNo, options = {}) {
  const columns = getRankingColumns(type);
  if (!rows.length) {
    return '<p class="empty">조건에 맞는 랭킹 데이터가 없습니다.</p>';
  }

  const targetCharacterNameNorm = isRankingNicknameSearchType(type)
    ? normalizeForMatch(options?.targetCharacterName || "")
    : "";
  const offset = (pageNo - 1) * rankingPageSize;
  const body = rows
    .map((row, index) => {
      const rankNo = parseNumericValue(row?.ranking) ?? offset + index + 1;
      return renderRankingRow(type, row, rankNo, targetCharacterNameNorm);
    })
    .join("");

  return `<table class="ranking-table"><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderRankingPagination(buttonWrapEl, currentPage) {
  if (!buttonWrapEl) return;

  const start = Math.max(1, currentPage - 4);
  const pages = Array.from({ length: 10 }, (_, index) => start + index);
  buttonWrapEl.innerHTML = pages
    .map(
      (page) =>
        `<button type="button" data-ranking-page="${page}" class="${page === currentPage ? "is-active" : ""}">${page}</button>`,
    )
    .join("");
}

async function fetchRankingPageData(type, date, worldName, pageNo, options = {}) {
  const allowReadyFallback = options?.allowReadyFallback !== false;
  const fallbackAttempt = Number.isFinite(options?.fallbackAttempt)
    ? Math.max(0, Math.floor(options.fallbackAttempt))
    : 0;
  const maxFallbackDays = Number.isFinite(options?.maxFallbackDays)
    ? Math.max(1, Math.floor(options.maxFallbackDays))
    : 1;
  const zeroBasedIndex = (pageNo - 1) * rankingPageSize;
  const apiPage = Math.floor(zeroBasedIndex / rankingApiPageSize) + 1;
  const localOffset = zeroBasedIndex % rankingApiPageSize;

  const query = new URLSearchParams({
    date,
    page: String(apiPage),
  });
  if (worldName) query.set("world_name", worldName);

  const response = await fetch(
    `/api/maplestorym/ranking/${encodeURIComponent(rankingTypes[type].endpoint)}?${query.toString()}`,
  );
  const payload = await parseResponseSafely(response);

  if (!response.ok || !payload.ok) {
    const messageRaw =
      payload?.message ||
      payload?.error?.error?.message ||
      "랭킹 조회에 실패했습니다.";
    const message = String(messageRaw || "");

    if (
      allowReadyFallback &&
      normalizeRankingDate(date) === getKstDateString() &&
      isRankingDataNotReadyMessage(message, date) &&
      fallbackAttempt < maxFallbackDays
    ) {
      const previousDate = shiftDateText(date, -1);
      if (previousDate && previousDate >= rankingDateFloor) {
        const fallbackResult = await fetchRankingPageData(
          type,
          previousDate,
          worldName,
          pageNo,
          {
            allowReadyFallback,
            fallbackAttempt: fallbackAttempt + 1,
            maxFallbackDays,
          },
        );
        return {
          ...fallbackResult,
          effectiveDate: fallbackResult?.effectiveDate || previousDate,
          fallbackFromDate: fallbackResult?.fallbackFromDate || date,
        };
      }
    }

    const error = new Error(normalizeRankingLookupErrorMessage(message));
    error.rawMessage = message;
    throw error;
  }

  const ranking = toArray(payload?.data?.ranking);
  const rows = ranking.slice(localOffset, localOffset + rankingPageSize);
  return {
    rows,
    apiPage,
    localOffset,
    effectiveDate: date,
    fallbackFromDate: "",
  };
}
async function fetchCharacterOcidByName(characterName, worldName) {
  const name = String(characterName || "").trim();
  const world = String(worldName || "").trim();
  if (!name || !world) {
    return "";
  }

  const query = new URLSearchParams({
    character_name: name,
    world_name: world,
  });
  const response = await fetch(`/api/maplestorym/id?${query.toString()}`);
  const payload = await parseResponseSafely(response);
  if (!response.ok || !payload?.ok) {
    return "";
  }

  const ocid =
    String(payload?.ocid || payload?.data?.ocid || "").trim() ||
    String(payload?.data?.ocid || "").trim();
  return ocid || "";
}
async function resolveRankingByCharacter({
  type,
  date,
  characterName,
  worldName,
}) {
  const normalizedType = normalizeRankingType(type);
  if (!isRankingNicknameSearchType(normalizedType)) {
    return null;
  }

  const ocid = await fetchCharacterOcidByName(characterName, worldName);
  if (!ocid) {
    return null;
  }

  let probeDate = normalizeRankingDate(date) || getKstDateString();
  if (probeDate < rankingDateFloor) {
    probeDate = rankingDateFloor;
  }
  const today = getKstDateString();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const query = new URLSearchParams({
      date: probeDate,
      ocid,
    });
    const endpoint = rankingTypes[normalizedType]?.endpoint || "level";
    const response = await fetch(
      `/api/maplestorym/ranking/${encodeURIComponent(endpoint)}?${query.toString()}`,
    );
    const payload = await parseResponseSafely(response);
    if (response.ok && payload?.ok) {
      const first = toArray(payload?.data?.ranking)[0] || null;
      const rankingValue = parseNumericValue(first?.ranking);
      if (rankingValue !== null && rankingValue > 0) {
        const normalizedRanking = Math.max(1, Math.floor(rankingValue));
        const targetPage = Math.floor((normalizedRanking - 1) / rankingPageSize) + 1;
        return {
          ocid,
          ranking: normalizedRanking,
          page: targetPage,
          date: probeDate,
          type: normalizedType,
        };
      }
      return null;
    }

    const message =
      payload?.message || payload?.error?.error?.message || "";
    if (!isRankingDataNotReadyMessage(message, probeDate) || probeDate !== today) {
      return null;
    }

    const previousDate = shiftDateText(probeDate, -1);
    if (!previousDate || previousDate < rankingDateFloor) {
      return null;
    }
    probeDate = previousDate;
  }

  return null;
}

function initRankingPage() {
  applyPageIdentity();
  bindCharacterSearchForm(document.getElementById("quickSearchForm"));

  const form = document.getElementById("rankingSearchForm");
  const messageEl = document.getElementById("rankingMessage");
  const titleEl = document.getElementById("rankingResultTitle");
  const tableWrapEl = document.getElementById("rankingTableWrap");
  const pageButtonsEl = document.getElementById("rankingPageButtons");
  const pageJumpForm = document.getElementById("rankingPageJumpForm");
  const pageJumpInput = document.getElementById("rankingPageJumpInput");

  if (
    !form ||
    !messageEl ||
    !titleEl ||
    !tableWrapEl ||
    !pageButtonsEl ||
    !pageJumpForm ||
    !pageJumpInput
  ) {
    return;
  }

  const typeEl = document.getElementById("rankingType");
  const dateEl = document.getElementById("rankingDate");
  const worldEl = document.getElementById("rankingWorldName");
  const characterNameEl = document.getElementById("rankingCharacterName");
  if (!typeEl || !dateEl || !worldEl) return;
  configureRankingTypeSelect(typeEl);
  configureRankingWorldSelect(worldEl);

  const urlParams = new URLSearchParams(window.location.search);
  let currentType = normalizeRankingType(urlParams.get("type"));
  let currentDate = normalizeRankingDate(urlParams.get("date"));
  let currentWorld = String(urlParams.get("world_name") || "").trim();
  let currentPage = normalizeRankingPage(urlParams.get("page"));
  let targetCharacterName = String(urlParams.get("character_name") || "").trim();
  let targetCharacterWorld = String(urlParams.get("character_world_name") || "").trim();
  const targetLookupCache = new Map();

  if (!currentWorld && targetCharacterWorld) {
    currentWorld = targetCharacterWorld;
  }

  const today = getKstDateString();
  const defaultDate = today;
  if (!currentDate) {
    currentDate = defaultDate < rankingDateFloor ? rankingDateFloor : defaultDate;
  }
  if (currentDate < rankingDateFloor) {
    currentDate = rankingDateFloor;
  }

  typeEl.value = currentType;
  dateEl.min = rankingDateFloor;
  dateEl.value = currentDate;
  worldEl.value = currentWorld;
  pageJumpInput.value = String(currentPage);
  if (characterNameEl) {
    characterNameEl.value = targetCharacterName;
  }

  const syncUrl = () => {
    const next = new URLSearchParams();
    next.set("type", currentType);
    next.set("date", currentDate);
    if (currentWorld) next.set("world_name", currentWorld);
    if (targetCharacterName) next.set("character_name", targetCharacterName);
    if (targetCharacterWorld) next.set("character_world_name", targetCharacterWorld);
    next.set("page", String(currentPage));
    history.replaceState(null, "", `/ranking.html?${next.toString()}`);
  };

  const load = async () => {
    if (currentDate < rankingDateFloor) {
      setMessage(
        messageEl,
        `조회일은 ${rankingDateFloor} 이후만 가능합니다.`,
        "error",
      );
      return;
    }

    setMessage(messageEl, "", "info");
    titleEl.textContent = `${rankingTypes[currentType].label} | 조회일 ${currentDate}`;
    tableWrapEl.innerHTML = '<p class="empty">랭킹 데이터를 불러오는 중입니다...</p>';

    try {
      const allowsNicknameSearch = isRankingNicknameSearchType(currentType);
      const rankingLabel = rankingTypes[currentType]?.label || "랭킹";
      let targetLookupResult = null;
      if (allowsNicknameSearch && targetCharacterName) {
        const worldForLookup =
          String(targetCharacterWorld || currentWorld || "").trim();
        const lookupKey = `${currentDate}|${targetCharacterName}|${worldForLookup}`;
        if (targetLookupCache.has(lookupKey)) {
          targetLookupResult = targetLookupCache.get(lookupKey);
        } else if (worldForLookup) {
          targetLookupResult = await resolveRankingByCharacter({
            type: currentType,
            date: currentDate,
            characterName: targetCharacterName,
            worldName: worldForLookup,
          });
          targetLookupCache.set(lookupKey, targetLookupResult || null);
        }
        if (
          targetLookupResult?.page &&
          Number.isInteger(targetLookupResult.page) &&
          targetLookupResult.page > 0
        ) {
          currentPage = targetLookupResult.page;
        }
      }

      let rows = [];
      let effectiveDate = currentDate;
      let jumpedPageFallback = false;
      try {
        const rankingResult = await fetchRankingPageData(
          currentType,
          currentDate,
          currentWorld,
          currentPage,
        );
        rows = rankingResult.rows;
        effectiveDate = rankingResult.effectiveDate || currentDate;
      } catch (fetchError) {
        const fetchMessage = String(
          fetchError?.rawMessage || fetchError?.message || "",
        );
        const looksLikeInvalidParam =
          /please input valid parameter/i.test(fetchMessage) ||
          fetchMessage.includes("랭킹 데이터가 아직 준비되지 않았습니다.");
        const canRetryFirstPage =
          looksLikeInvalidParam &&
          allowsNicknameSearch &&
          !!targetLookupResult?.ranking &&
          currentPage > 1;

        if (!canRetryFirstPage) {
          throw fetchError;
        }

        currentPage = 1;
        const firstPageResult = await fetchRankingPageData(
          currentType,
          currentDate,
          currentWorld,
          currentPage,
        );
        rows = firstPageResult.rows;
        effectiveDate = firstPageResult.effectiveDate || currentDate;
        jumpedPageFallback = true;
      }
      titleEl.textContent = `${rankingTypes[currentType].label} | 조회일 ${effectiveDate || currentDate}`;
      tableWrapEl.innerHTML = renderRankingTable(currentType, rows, currentPage, {
        targetCharacterName,
      });
      if (allowsNicknameSearch && targetCharacterName) {
        if (targetLookupResult?.ranking && jumpedPageFallback) {
          setMessage(
            messageEl,
            `${targetCharacterName} 검색: ${rankingLabel} ${formatNumber(targetLookupResult.ranking)}위 (페이지 ${targetLookupResult.page}) - API 제한으로 1페이지를 표시했습니다.`,
            "success",
          );
        } else if (targetLookupResult?.ranking) {
          setMessage(
            messageEl,
            `${targetCharacterName} 검색: ${rankingLabel} ${formatNumber(targetLookupResult.ranking)}위 (페이지 ${targetLookupResult.page})`,
            "success",
          );
        } else if (!String(targetCharacterWorld || currentWorld || "").trim()) {
          setMessage(
            messageEl,
            "닉네임 검색은 월드 정보가 필요합니다. 월드를 선택해 주세요.",
            "error",
          );
        } else {
          setMessage(
            messageEl,
            `${targetCharacterName} 캐릭터의 ${rankingLabel} 순위를 찾지 못했습니다.`,
            "error",
          );
        }
      } else {
        setMessage(messageEl, "", "info");
      }
      hydrateRankingCharacterThumbs(tableWrapEl);
      hydrateRankingGuildMarks(tableWrapEl);
      renderRankingPagination(pageButtonsEl, currentPage);
      pageJumpInput.value = String(currentPage);
      syncUrl();
    } catch (error) {
      const message = normalizeRankingLookupErrorMessage(error?.message || "");
      tableWrapEl.innerHTML = `<p class="empty">${escapeHtml(message)}</p>`;
      setMessage(messageEl, message, "error");
      renderRankingPagination(pageButtonsEl, currentPage);
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    currentType = normalizeRankingType(typeEl.value);
    currentDate = normalizeRankingDate(dateEl.value) || currentDate;
    currentWorld = String(worldEl.value || "").trim();
    targetCharacterName = characterNameEl
      ? String(characterNameEl.value || "").trim()
      : "";
    targetCharacterWorld = targetCharacterName
      ? String(currentWorld || targetCharacterWorld || "").trim()
      : "";
    if (targetCharacterName && targetCharacterWorld && !currentWorld) {
      currentWorld = targetCharacterWorld;
      worldEl.value = targetCharacterWorld;
    }
    currentPage = 1;
    await load();
  });

  pageButtonsEl.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-ranking-page]");
    if (!button) return;
    const page = normalizeRankingPage(button.dataset.rankingPage);
    if (page === currentPage) return;
    currentPage = page;
    await load();
  });

  pageJumpForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const page = normalizeRankingPage(pageJumpInput.value);
    if (page === currentPage) return;
    currentPage = page;
    await load();
  });

  load();
}


export function init() {
  initRankingPage();
}
