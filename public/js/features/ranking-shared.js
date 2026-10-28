import {
  disabledRankingTypes,
  normalizeForMatch,
  parseNumericValue,
  parseResponseSafely,
  rankingDateFloor,
  rankingNicknameSearchTypes,
  rankingPageSize,
  rankingTypes,
  toArray,
} from "../core/common.js";

function getKstDateString(date = new Date()) {
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return String(formatted).replaceAll("-", "-");
}

function normalizeRankingType(type) {
  const key = String(type || "").trim();
  if (disabledRankingTypes.has(key)) return "level";
  return rankingTypes[key] ? key : "level";
}
function isRankingNicknameSearchType(type) {
  return rankingNicknameSearchTypes.has(normalizeRankingType(type));
}

function normalizeRankingDate(dateText) {
  const date = String(dateText || "").trim().replace(/[./\s]+/g, "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return date;
}

function normalizeRankingPage(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

function getRankingWorldOrderIndex(worldName) {
  const normalized = normalizeForMatch(worldName);
  if (!normalized) return 0;
  if (normalized === normalizeForMatch("스카니아") || normalized === "scania")
    return 1;
  if (normalized === normalizeForMatch("루나") || normalized === "luna") return 2;
  if (normalized === normalizeForMatch("제니스") || normalized === "zenith")
    return 3;
  if (normalized === normalizeForMatch("크로아") || normalized === "croa") return 4;
  if (normalized === normalizeForMatch("유니온") || normalized === "union")
    return 5;
  if (
    normalized === normalizeForMatch("엘리시움") ||
    normalized === "elysium"
  )
    return 6;
  if (normalized === normalizeForMatch("아케인") || normalized === "arcane")
    return 7;
  if (
    normalized === normalizeForMatch("챌린저스") ||
    normalized === "challengers"
  )
    return 8;
  return 99;
}

function configureRankingTypeSelect(typeSelectEl) {
  if (!typeSelectEl) return;
  [...typeSelectEl.querySelectorAll("option")].forEach((optionEl) => {
    const value = String(optionEl.value || "").trim();
    if (disabledRankingTypes.has(value)) {
      optionEl.remove();
    }
  });
}

function configureRankingWorldSelect(worldSelectEl) {
  if (!worldSelectEl) return;
  const options = [...worldSelectEl.querySelectorAll("option")];
  options.sort((left, right) => {
    const leftOrder = getRankingWorldOrderIndex(left.value);
    const rightOrder = getRankingWorldOrderIndex(right.value);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return 0;
  });
  worldSelectEl.replaceChildren(...options);
}

const rankingCharacterImageCache = new Map();
const rankingGuildMarkCache = new Map();
const rankingThumbDefaultSrc = "/assets/maple-hero.svg";

function shiftDateText(dateText, dayOffset) {
  const parts = String(dateText || "")
    .split("-")
    .map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return "";
  }
  const [year, month, day] = parts;
  const shifted = new Date(Date.UTC(year, month - 1, day + dayOffset));
  if (Number.isNaN(shifted.getTime())) {
    return "";
  }
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function isRankingDataNotReadyMessage(message, date = "") {
  const text = String(message || "").toLowerCase();
  if (text.includes("please wait until the data is ready")) {
    return true;
  }

  if (!text.includes("please input valid parameter")) {
    return false;
  }

  // Some ranking endpoints return this message for "today not ready".
  const probeDate = normalizeRankingDate(date);
  const today = getKstDateString();
  return !!probeDate && probeDate === today;
}

async function resolveRankingCharacterImage(worldName, characterName) {
  const world = String(worldName || "").trim();
  const name = String(characterName || "").trim();
  if (!world || !name || name === "-") {
    return "";
  }

  const cacheKey = `${world}::${name}`;
  if (rankingCharacterImageCache.has(cacheKey)) {
    return rankingCharacterImageCache.get(cacheKey);
  }

  const pending = (async () => {
    try {
      const query = new URLSearchParams({
        world_name: world,
        character_name: name,
      });
      const response = await fetch(`/api/maplestorym/character/image?${query.toString()}`);
      const payload = await parseResponseSafely(response);
      return response.ok && payload?.ok ? String(payload.imageUrl || "").trim() : "";
    } catch (_error) {
      return "";
    }
  })();

  rankingCharacterImageCache.set(cacheKey, pending);
  return pending;
}

async function hydrateRankingCharacterThumbs(containerEl) {
  if (!containerEl) return;
  const targets = [
    ...containerEl.querySelectorAll(
      "img.js-ranking-char-thumb[data-world-name][data-char-name]",
    ),
  ];
  if (!targets.length) return;

  let cursor = 0;
  const workerSize = Math.min(4, targets.length);
  const workers = Array.from({ length: workerSize }, async () => {
    while (cursor < targets.length) {
      const currentIndex = cursor;
      cursor += 1;
      const imgEl = targets[currentIndex];
      if (!imgEl || imgEl.dataset.thumbResolved === "1") {
        continue;
      }

      const currentSrc = String(imgEl.getAttribute("src") || "");
      if (currentSrc && !currentSrc.includes(rankingThumbDefaultSrc)) {
        imgEl.dataset.thumbResolved = "1";
        continue;
      }

      const worldName = String(imgEl.dataset.worldName || "").trim();
      const characterName = String(imgEl.dataset.charName || "").trim();
      const resolvedImage = await resolveRankingCharacterImage(
        worldName,
        characterName,
      );
      if (resolvedImage) {
        imgEl.src = resolvedImage;
      }
      imgEl.dataset.thumbResolved = "1";
    }
  });

  await Promise.all(workers);
}
async function hydrateGuildMemberThumbs(containerEl) {
  if (!containerEl) return;
  const targets = [
    ...containerEl.querySelectorAll(
      "img.js-guild-member-thumb[data-world-name][data-char-name]",
    ),
  ].filter((imgEl) => imgEl.dataset.thumbNeedsResolve === "1");
  if (!targets.length) return;

  let cursor = 0;
  const workerSize = Math.min(2, targets.length);
  const workers = Array.from({ length: workerSize }, async () => {
    while (cursor < targets.length) {
      const currentIndex = cursor;
      cursor += 1;
      const imgEl = targets[currentIndex];
      if (!imgEl || imgEl.dataset.thumbResolved === "1") {
        continue;
      }

      const worldName = String(imgEl.dataset.worldName || "").trim();
      const characterName = String(imgEl.dataset.charName || "").trim();
      const resolvedImage = await resolveRankingCharacterImage(
        worldName,
        characterName,
      );
      if (resolvedImage) {
        imgEl.src = resolvedImage;
      }
      imgEl.dataset.thumbResolved = "1";
    }
  });

  await Promise.all(workers);
}

async function resolveRankingGuildMark(worldName, guildName) {
  const world = String(worldName || "").trim();
  const guild = String(guildName || "").trim();
  if (!world || !guild || guild === "-") {
    return "";
  }

  const cacheKey = `${world}::${guild}`;
  if (rankingGuildMarkCache.has(cacheKey)) {
    return rankingGuildMarkCache.get(cacheKey);
  }

  const pending = (async () => {
    try {
      const idQuery = new URLSearchParams({
        world_name: world,
        guild_name: guild,
      });
      const guildIdRes = await fetch(`/api/maplestorym/guild/id?${idQuery.toString()}`);
      const guildIdPayload = await parseResponseSafely(guildIdRes);
      if (!guildIdRes.ok || !guildIdPayload?.ok) {
        return "";
      }

      const oguildId = String(guildIdPayload?.data?.oguild_id || "").trim();
      if (!oguildId) {
        return "";
      }

      const basicQuery = new URLSearchParams({ oguild_id: oguildId });
      const guildBasicRes = await fetch(`/api/maplestorym/guild/basic?${basicQuery.toString()}`);
      const guildBasicPayload = await parseResponseSafely(guildBasicRes);
      if (!guildBasicRes.ok || !guildBasicPayload?.ok) {
        return "";
      }

      return String(guildBasicPayload?.data?.guild_mark_icon || "").trim();
    } catch (_error) {
      return "";
    }
  })();

  rankingGuildMarkCache.set(cacheKey, pending);
  return pending;
}

async function resolveOverallRankingByOcid(ocid, options = {}) {
  const normalizedOcid = String(ocid || "").trim();
  if (!normalizedOcid) return null;
  const maxDays = Number.isFinite(options?.days)
    ? Math.max(1, Math.min(14, Math.floor(options.days)))
    : 7;
  let date = getKstDateString();
  if (date < rankingDateFloor) {
    date = rankingDateFloor;
  }

  for (let attempt = 0; attempt < maxDays; attempt += 1) {
    try {
      const query = new URLSearchParams({
        date,
        ocid: normalizedOcid,
      });
      const response = await fetch(
        `/api/maplestorym/ranking/level?${query.toString()}`,
      );
      const payload = await parseResponseSafely(response);
      if (response.ok && payload?.ok) {
        const first = toArray(payload?.data?.ranking)[0];
        const rankingValue = parseNumericValue(first?.ranking);
        if (rankingValue !== null && rankingValue > 0) {
          return {
            date,
            ranking: Math.floor(rankingValue),
          };
        }
      }
    } catch (_error) {
      // Ignore and continue with older date.
    }

    const previousDate = shiftDateText(date, -1);
    if (!previousDate || previousDate < rankingDateFloor) {
      break;
    }
    date = previousDate;
  }

  return null;
}

async function hydrateRankingGuildMarks(containerEl) {
  if (!containerEl) return;
  const targets = [
    ...containerEl.querySelectorAll(
      "img.js-ranking-guild-mark[data-world-name][data-guild-name]",
    ),
  ];
  if (!targets.length) return;

  let cursor = 0;
  const workerSize = Math.min(2, targets.length);
  const workers = Array.from({ length: workerSize }, async () => {
    while (cursor < targets.length) {
      const currentIndex = cursor;
      cursor += 1;
      const imgEl = targets[currentIndex];
      if (!imgEl || imgEl.dataset.guildMarkResolved === "1") {
        continue;
      }

      const worldName = String(imgEl.dataset.worldName || "").trim();
      const guildName = String(imgEl.dataset.guildName || "").trim();
      const resolvedImage = await resolveRankingGuildMark(worldName, guildName);
      if (resolvedImage) {
        imgEl.src = resolvedImage;
        imgEl.hidden = false;
      }
      imgEl.dataset.guildMarkResolved = "1";
    }
  });

  await Promise.all(workers);
}


export {
  configureRankingTypeSelect,
  configureRankingWorldSelect,
  getKstDateString,
  getRankingWorldOrderIndex,
  hydrateGuildMemberThumbs,
  hydrateRankingCharacterThumbs,
  hydrateRankingGuildMarks,
  isRankingDataNotReadyMessage,
  isRankingNicknameSearchType,
  normalizeRankingDate,
  normalizeRankingPage,
  normalizeRankingType,
  resolveOverallRankingByOcid,
  resolveRankingGuildMark,
  shiftDateText,
};
