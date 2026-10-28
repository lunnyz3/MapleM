const mongoose = require("mongoose");
const { env } = require("../config/env");
const { normalizeWorldName } = require("../config/worlds");
const { RequestLog } = require("../models/request-log.model");
const { TtlLruCache } = require("../nexon/client");
const { getActiveVcores } = require("../transform/vmatrix");
const { fillPresetMasteryInfo } = require("../transform/equipment-mastery");
const { buildCharacterStats } = require("../domain/stats");
const { createGuildCollector } = require("../services/guild-collection.service");
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
  getRankingCombatPower,
  getRankingDojang,
  getRankingKerningMTower,
  saveRequestLog,
  canSaveRequestLogs
} = require("../services/maplestorym.service");
const { observeCombatPower, rankingObservedAt } = require("../services/combat-power.service");
const { recordCharacterItems } = require("../services/item-ranking.service");
const { itemFingerprint } = require("../domain/items/collect");

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
  { key: "unionRaider", path: "/maplestorym/v1/user/union-raider" },
  { key: "unionStat", path: "/maplestorym/v1/user/union-stat" }
];

const aggregateLogEndpoint = `${env.nexonBaseUrl}/maplestorym/v1/character/all`;
const guildCollector = createGuildCollector({
  isAvailable: () => env.guildCollectionEnabled && canSaveRequestLogs(),
  memberDelayMs: env.guildCollectionMemberDelayMs,
  listSavedToday: async ({ worldName, names, dateKst }) => {
    const start = new Date(`${dateKst}T00:00:00+09:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const docs = await RequestLog.find({
      worldName,
      characterName: { $in: names },
      endpoint: aggregateLogEndpoint,
      success: true,
      "responseBody.mode": { $in: ["all", "page-data"] },
      $or: [
        { snapshotDate: dateKst },
        { snapshotDate: { $exists: false }, updatedAt: { $gte: start, $lt: end } },
        { snapshotDate: { $exists: false }, updatedAt: null, createdAt: { $gte: start, $lt: end } }
      ]
    }).select({ characterName: 1, _id: 0 }).lean();
    return docs.map((doc) => doc.characterName);
  },
  collectMember: async ({ worldName, characterName }) => {
    const world = normalizeWorldName(worldName);
    if (!world.ok) return false;
    const id = await resolveOcid(characterName, world.worldNameCanonical, world.nexonWorldName, { shouldLog: false });
    const ocid = id?.data?.ocid;
    if (!ocid) return false;
    const { details, summary } = await fetchCharacterDetails({ characterName, worldNameCanonical: world.worldNameCanonical, ocid, shouldLog: false });
    // No enqueue here: collection is bounded to the guild roster that was requested.
    return saveAggregatedCharacterLog({
      characterName, worldNameCanonical: world.worldNameCanonical, ocid,
      statusCode: 200, success: summary.failureCount === 0,
      responseBody: {
        mode: "all", collectionSource: "guild",
        query: buildQueryPayload(characterName, worldName, world.worldNameCanonical),
        ocid, summary, details
      }
    });
  }
});
const presetFallbackLookbackLimit = 30;
// Nexon ranking data starts on 2025-11-27.
const rankingDateFloor = "2025-11-27";

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
    "칼리",
    "렌"
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
    "일리움",
    // 2026-10-28 실측: 캡틴·메카닉은 마법 공격력이 물리의 약 2배(공식 능력치 가이드도 마법 직업).
    "캡틴",
    "메카닉"
  ].map((name) => normalizeForMatch(name))
);

function normalizeForMatch(text) {
  return String(text || "")
    .replace(/[:：(),]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
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

// Major stats come from the stat engine (src/domain/stats). Kept as an export for scripts and
// tests that only need the boss-setting stats.
function buildMajorStats(details) {
  return buildCharacterStats(details).majorStats;
}

// A stat-engine failure on unexpected Nexon data must not take the whole page down.
function buildCharacterStatsSafely(details) {
  try {
    return buildCharacterStats(details);
  } catch (error) {
    console.error("[stats] stat engine failed:", error?.message || error);
    return { majorStats: {}, majorStatsCurrent: {}, statSetting: null, majorStatOrder: [] };
  }
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

  // Nexon filters by world itself (ranking stays overall, world_ranking is in-world).
  if (worldNameCanonical) {
    params.world_name = worldNameCanonical;
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
  // Nexon /id only accepts Korean world names; the English name always fails with 400 OPENAPI00004.
  const worldCandidates = [worldNameCanonical];
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

async function fetchCharacterDetails({ characterName, worldNameCanonical, ocid, shouldLog = true, useCache = true }) {
  const settledDetails = [];
  const ocidDetailEndpoints = [...characterDetailEndpoints, ...userDetailEndpoints];

  const initialResults = await Promise.all(
    ocidDetailEndpoints.map(async ({ key, path }) => {
      try {
        const result = await getCharacterByOcid(path, ocid, { useCache });

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
  responseBody,
  spec = null
}) {
  let saved = false;
  try {
    saved = await saveRequestLog({
      characterName,
      worldName: worldNameCanonical,
      ocid,
      endpoint: aggregateLogEndpoint,
      statusCode,
      success,
      responseBody
    });
  } catch (error) {
    saved = false;
  }
  if (ocid && responseBody?.details?.itemEquipment?.data) {
    await recordLookupItems({ ocid, characterName, worldNameCanonical, details: responseBody.details, spec });
  }
  return Boolean(saved) && success;
}

// Item and spec rankings keep what every successful lookup saw. Best-effort: a failure is
// logged and never affects the response. `spec` carries values the caller already computed.
async function recordLookupItems({ ocid, characterName, worldNameCanonical, details, spec }) {
  try {
    const basic = details?.basic?.data || {};
    let combatPower = spec?.combatPower ?? null;
    let maxDamage = spec?.maxDamage ?? null;
    if (combatPower === null) {
      combatPower = (await observeCombatPower(ocid, [{ value: readStatValue(details?.stat?.data, "전투력"), source: "stat" }])).value;
    }
    if (maxDamage === null && details?.stat?.data) {
      maxDamage = buildCharacterStatsSafely(details).majorStats?.maxDamage?.value ?? null;
    }
    await recordCharacterItems({
      ocid,
      characterName: basic.character_name || characterName,
      worldName: worldNameCanonical,
      characterClass: basic.character_class,
      characterLevel: basic.character_level,
      itemData: details.itemEquipment.data,
      combatPower,
      maxDamage,
      source: "lookup"
    });
  } catch (error) {
    console.error("[item-ranking] record failed:", error?.message || error);
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

// Rankings cover the top 10,000 and are aggregated once a day, so a character's row is
// looked up for the most recent dates only.
async function resolveLatestRankingRowByOcid(ocid, fetchRanking, days = 2) {
  const normalizedOcid = String(ocid || "").trim();
  if (!normalizedOcid) {
    return null;
  }

  const dateCandidates = buildRecentKstDateRange(Number.isFinite(days) ? days : 2).filter(
    (date) => date >= rankingDateFloor
  );

  for (const date of dateCandidates) {
    try {
      const result = await fetchRanking({ date, ocid: normalizedOcid, page: 1 });
      const row = toArray(result?.data?.ranking)[0];
      if (row) {
        return { date, row };
      }
    } catch (error) {
      // Ignore lookup failures and continue with older dates.
    }
  }

  return null;
}

async function resolveLatestOverallRankingByOcid(ocid, options = {}) {
  const found = await resolveLatestRankingRowByOcid(ocid, getRankingLevel, options.days);
  const rankingValue = parseNumericValue(found?.row?.ranking);
  return rankingValue === null ? null : { date: found.date, ranking: Math.max(1, Math.floor(rankingValue)) };
}

// The stat endpoint's 전투력 reflects whatever the character is wearing right now (it can
// be a fraction of the real value on a farming preset); the combat-power ranking holds
// a daily value for the top 10,000.
async function resolveRankingCombatPowerByOcid(ocid, options = {}) {
  const found = await resolveLatestRankingRowByOcid(ocid, getRankingCombatPower, options.days);
  const value = parseNumericValue(found?.row?.character_combat_power);
  return value === null
    ? null
    : { date: found.date, value, ranking: parseNumericValue(found.row.ranking) };
}

function readStatValue(statData, statName) {
  const entry = toArray(statData?.stat).find((item) => String(item?.stat_name || "").trim() === statName);
  return parseNumericValue(entry?.stat_value);
}

// Read recorded API values, not the stat engine's estimated combat power. Daily
// aggregate snapshots are replaced, so the window uses their last saved timestamp.
async function resolveStoredCombatPowerByOcid(ocid, { characterName, worldNameCanonical, now = new Date() } = {}) {
  const empty = { windowHours: 24, value: null, observedAt: null, status: "unavailable" };
  if (!ocid || !isMongoConnected()) return empty;
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  try {
    const docs = await RequestLog.find({
      ocid,
      $or: [
        { updatedAt: { $gte: since, $lte: now } },
        { updatedAt: null, createdAt: { $gte: since, $lte: now } }
      ]
    }).select({
      _id: 0, createdAt: 1, updatedAt: 1, statusCode: 1, success: 1,
      "responseBody.details.stat": 1,
      "responseBody.stat": 1,
      "responseBody.tabs.exp.stat": 1,
      "responseBody.profile.combatPower": 1,
      "responseBody.ranking": 1
    }).lean();

    let best = null;
    for (const doc of docs) {
      const at = new Date(doc.updatedAt || doc.createdAt);
      if (!Number.isFinite(at.getTime()) || at < since || at > now || doc.statusCode < 200 || doc.statusCode >= 300) continue;
      const body = doc.responseBody || {};
      const candidates = [];
      for (const wrapped of [body.details?.stat, body.tabs?.exp?.stat]) {
        if (wrapped && wrapped.ok !== false) candidates.push(readStatValue(wrapped.data, "전투력"));
      }
      if (doc.success !== false) {
        candidates.push(readStatValue(body, "전투력"));
        candidates.push(parseNumericValue(body.profile?.combatPower?.current));
        candidates.push(parseNumericValue(body.profile?.combatPower?.official?.value));
        for (const row of toArray(body.ranking)) {
          // Ranking rows have no OCID; match the name and canonical world (same
          // Nexon shape used by resolveOfficialCombatPowerByOcid above).
          const world = normalizeWorldName(row?.world_name);
          if (row?.character_name === characterName && world.ok && world.worldNameCanonical === worldNameCanonical) {
            candidates.push(parseNumericValue(row.character_combat_power));
          }
        }
      }
      for (const value of candidates) {
        if (value === null || !Number.isFinite(value) || value <= 0) continue;
        if (!best || value > best.value || (value === best.value && at > new Date(best.observedAt))) {
          best = { value, observedAt: at.toISOString() };
        }
      }
    }
    return best ? { ...empty, ...best, status: "ok" } : { ...empty, status: "no_records" };
  } catch (error) {
    console.error("[combat-power-history] lookup failed:", error?.message || error);
    return empty;
  }
}

function normalizePresetNo(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

function enqueueRelatedGuild(details, worldName, triggeredBy, aggregateSaved) {
  if (!env.guildCollectionEnabled) return { status: "disabled" };
  if (!aggregateSaved || !canSaveRequestLogs()) return { status: "unavailable" };
  const guild = details?.guildBasic;
  if (!guild?.ok || !String(guild.data?.guild_name || "").trim()) return { status: "no_guild" };
  try {
    return guildCollector.enqueue({
      worldName,
      guildName: String(guild.data.guild_name).trim(),
      members: toArray(guild.data.guild_member).map((member) => member?.character_name),
      triggeredBy
    });
  } catch (error) {
    console.error("[guild-collection] enqueue failed:", error?.message || error);
    return { status: "unavailable" };
  }
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
    "responseBody.mode": { $in: ["all", "page-data"] }
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
    // Matches /api/v2/item-ranks keys (same item across presets → same fingerprint).
    fingerprint: item?.item_name ? itemFingerprint(item) : "",
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
    // 추가 옵션 등급: 2 = 강력한, 3 = 영원한(검은) 환생의 불꽃 (public/probability/equipment_mastery.json 의 flame_grade)
    additionalOptionGrade: String(item?.item_additional_option_grade ?? "").trim(),
    soulInfo: {
      soulName: item?.soul_info?.soul_name || "",
      soulOption: item?.soul_info?.soul_option || ""
    },
    karmaScissorsRemaining,
    remainingStarforceExpansion,
    emblemInfo: item?.emblem_info || null,
    masteryInfo: mapMasteryInfoForView(item?.mastery_info)
  };
}

// 장비 마스터리: 레벨과 기본 옵션·잠재·추가 옵션·에디셔널 잠재에 넣은 포인트. 없으면 null.
function mapMasteryInfoForView(info) {
  if (!info || typeof info !== "object") {
    return null;
  }
  const toPoint = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  };
  const mastery = {
    level: toPoint(info.mastery_level),
    basicPoint: toPoint(info.base_option_point),
    potentialPoint: toPoint(info.potential_option_point),
    additionalPoint: toPoint(info.additional_option_point),
    additionalPotentialPoint: toPoint(info.additional_potential_option_point)
  };
  const hasPoint = mastery.basicPoint + mastery.potentialPoint + mastery.additionalPoint + mastery.additionalPotentialPoint > 0;
  return mastery.level > 0 || hasPoint ? mastery : null;
}

function mapCashEquipmentItemForView(item) {
  return {
    cashItemName: item?.cash_item_name || item?.item_name || "-",
    cashItemIcon: item?.cash_item_icon || item?.miracle_anvil_item_icon || item?.item_icon || "",
    slotName: item?.cash_item_equipment_slot_name || item?.item_equipment_slot_name || "-"
  };
}

function extractEquipmentPresetResult(details, source, sourceTimestamp) {
  // 프리셋 장비는 API 가 mastery_info 를 비워 주므로 착용 목록의 같은 장비에서 옮겨 온다.
  const itemData = fillPresetMasteryInfo(details?.itemEquipment?.data || {});
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

// Union presets are union-stat presets: the battle map and occupation effects were removed
// from the game on 2026-09-17 and from the API on 2026-10-15 (Nexon notices N-3546529,
// N-3563720). Raider effects still come from union-raider.
function mapUnionStatOptions(list) {
  return toArray(list).map((stat) => mapOptionEntry({ option_name: stat?.stat_name, option_value: stat?.stat_value }));
}

function extractUnionPresetResult(details, source, sourceTimestamp) {
  const unionStatData = details?.unionStat?.data || {};
  const raiderOptions = toArray(details?.unionRaider?.data?.use_union_raider_option).map(mapOptionEntry);
  const activePresetNo = normalizePresetNo(unionStatData.use_preset_no);
  const records = [];

  toArray(unionStatData.union_stat_preset).forEach((preset) => {
    const presetNo = normalizePresetNo(preset?.preset_no);
    if (presetNo === null) {
      return;
    }
    const isActive = activePresetNo !== null && presetNo === activePresetNo;
    const unionStatOptions = mapUnionStatOptions(preset?.union_stat);
    records.push({
      presetNo,
      source,
      sourceTimestamp,
      summary: {
        unionStatCount: unionStatOptions.length,
        raiderOptionCount: isActive ? raiderOptions.length : 0
      },
      data: {
        unionStatOptions,
        raiderOptions: isActive ? raiderOptions : []
      }
    });
  });

  const activeUnionStatOptions = mapUnionStatOptions(unionStatData.use_union_stat);
  if (!records.length && (activeUnionStatOptions.length || raiderOptions.length)) {
    records.push({
      presetNo: activePresetNo ?? 1,
      source,
      sourceTimestamp,
      summary: {
        unionStatCount: activeUnionStatOptions.length,
        raiderOptionCount: raiderOptions.length
      },
      data: {
        unionStatOptions: activeUnionStatOptions,
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

function buildUnionTab(details) {
  const current = extractUnionPresetResult(details, "api", new Date().toISOString());
  // The API returns every union-stat preset, so old logs are not used to fill presets
  // (they would bring back the removed battle map as if it were current).
  const merged = mergePresetResult(current, [], extractUnionPresetResult);
  const unionData = details?.union?.data || {};
  const unionRaiderData = details?.unionRaider?.data || {};
  const activeUnionStatOptions = mapUnionStatOptions(details?.unionStat?.data?.use_union_stat);
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
    activeUnionStatOptions,
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

  // Show only the cores that are equipped and active, as in the in-game V matrix.
  const vCores = getActiveVcores(vmatrixData).map((core) => ({
    vcoreName: core.name || "-",
    vcoreLevel: core.level,
    vcoreType: core.type || "-",
    skills: core.skills
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

// The stat endpoint reports both attack values and the main one is far larger
// (2026-10-28: 캡틴·메카닉 magic ≈ 2.1× physical, 렌 physical ≈ 2.5× magic), so a
// character's own stats decide; the job-name lists are only a fallback.
function resolveAttackTypeFromStat(statData) {
  const values = {};
  toArray(statData?.stat).forEach((entry) => {
    values[String(entry?.stat_name || "").trim()] = parseNumericValue(entry?.stat_value);
  });
  const physical = values["물리 공격력"];
  const magical = values["마법 공격력"];
  if (!Number.isFinite(physical) || !Number.isFinite(magical) || physical === magical) {
    return null;
  }
  return magical > physical ? "magical" : "physical";
}

function resolveAttackType({ statData, className, jobName }) {
  const fromStat = resolveAttackTypeFromStat(statData);
  if (fromStat) {
    return fromStat;
  }
  for (const name of [className, jobName]) {
    const normalized = normalizeForMatch(name);
    if (magicalJobNames.has(normalized)) {
      return "magical";
    }
    if (physicalJobNames.has(normalized)) {
      return "physical";
    }
  }
  return "physical";
}

function buildPageData({
  characterName,
  worldNameInput,
  worldNameCanonical,
  ocid,
  details,
  fallbackDetails,
  overallRankingResult,
  combatPower = null
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
  const characterStats = buildCharacterStatsSafely(details);
  const attackType = resolveAttackType({
    statData: stat,
    className: basic.character_class,
    jobName: basic.character_job_name
  });
  const profileName = basic.character_name || characterName;
  const fallbackOverallRanking = parseNumericValue(basic.ranking ?? stat.ranking);
  const guildTab = buildGuildTab(details, profileName, worldNameCanonical);
  const equipmentTab = buildEquipmentTab(details, fallbackList);
  const unionTab = buildUnionTab(details);
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
    // character_job_name is scheduled for removal by Nexon; character_class carries the same value.
    jobName: basic.character_class || basic.character_job_name || "",
    className: basic.character_class || "-",
    level: basic.character_level || "-",
    imageUrl: basic.character_image || basic.character_icon || "",
    guildName: guild.guild_name || basic.guild_name || "-",
    guildMarkIcon: guildTab?.summary?.guildMarkIcon || "",
    expText,
    expRate: expRateValue,
    currentExp: parseNumericValue(expRaw),
    ranking: basic.ranking || stat.ranking || "-",
    // Highest 전투력 observed in the last 24 hours ({ value, observedAt }).
    combatPower: combatPower || { value: readStatValue(stat, "전투력"), observedAt: null },
    overallRanking: overallRankingResult?.ranking ?? fallbackOverallRanking ?? null,
    overallRankingText:
      overallRankingResult?.ranking !== null && overallRankingResult?.ranking !== undefined
        ? `\uC804\uCCB4\uB7AD\uD0B9 - ${Number(overallRankingResult.ranking).toLocaleString("ko-KR")}\uC704`
        : fallbackOverallRanking !== null
          ? `\uC804\uCCB4\uB7AD\uD0B9 - ${Number(fallbackOverallRanking).toLocaleString("ko-KR")}\uC704`
        : "\uC804\uCCB4\uB7AD\uD0B9 - -",
    // Boss setting first (operator decision 2026-10-28); the presets in use are a toggle.
    majorStats: characterStats.majorStats,
    majorStatsCurrent: characterStats.majorStatsCurrent,
    statSetting: characterStats.statSetting,
    attackType,
    majorStatOrder: characterStats.majorStatOrder
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

// Ranking and guild-member lists show a thumbnail per row. Only the image URL is
// kept (12h), so a popular ranking page costs Nexon calls once, not on every view.
const characterImageCache = new TtlLruCache({ maxEntries: 20000, maxBytes: 8 * 1024 * 1024 });
const characterImageTtlMs = 12 * 60 * 60 * 1000;
const characterImageMissTtlMs = 10 * 60 * 1000;

async function getCharacterImage(req, res) {
  if (!env.nexonApiKey) {
    return res.status(500).json(buildApiKeyError());
  }

  const parsed = parseCharacterQuery(req, res);
  if (!parsed) {
    return;
  }

  const { characterName, worldNameCanonical, nexonWorldName } = parsed;
  const cacheKey = `${worldNameCanonical}::${characterName}`;
  // Cached as { imageUrl, characterClass, characterLevel } so guild member lists can show jobs too.
  let summary = characterImageCache.get(cacheKey);

  if (summary === undefined) {
    try {
      const ocidResult = await resolveOcid(characterName, worldNameCanonical, nexonWorldName, { shouldLog: false });
      const ocid = String(ocidResult?.data?.ocid || "").trim();
      const basic = ocid ? await getCharacterByOcid("/maplestorym/v1/character/basic", ocid) : null;
      summary = {
        imageUrl: String(basic?.data?.character_image || basic?.data?.character_icon || "").trim(),
        characterClass: String(basic?.data?.character_class || "").trim(),
        characterLevel: parseNumericValue(basic?.data?.character_level)
      };
      characterImageCache.set(
        cacheKey,
        summary,
        summary.imageUrl ? characterImageTtlMs : characterImageMissTtlMs,
        summary.imageUrl.length + summary.characterClass.length + 16
      );
    } catch (error) {
      const statusCode = error.response?.status;
      if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
        characterImageCache.set(cacheKey, { imageUrl: "", characterClass: "", characterLevel: null }, characterImageMissTtlMs, 0);
      }
      return res.status(statusCode === 400 ? 404 : 502).json({ ok: false, imageUrl: "" });
    }
  }

  if (!summary.imageUrl) {
    return res.status(404).json({ ok: false, imageUrl: "" });
  }
  res.set("Cache-Control", "public, max-age=3600");
  return res.json({ ok: true, ...summary });
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

    const aggregateSaved = await saveAggregatedCharacterLog({
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

    // Iris needs raw details and the website's stat sheets from one Nexon snapshot.
    // Opt in, and calculate after logging so derived breakdowns do not inflate stored logs.
    if (String(req.query.include_stats || "") === "1") {
      const { majorStats, majorStatsCurrent, statSetting, majorStatOrder } = buildCharacterStatsSafely(details);
      const basic = details?.basic?.data || {};
      responsePayload.stats = {
        majorStats,
        majorStatsCurrent,
        statSetting,
        majorStatOrder,
        attackType: resolveAttackType({
          statData: details?.stat?.data || {},
          className: basic.character_class,
          jobName: basic.character_job_name
        })
      };
    }

    if (String(req.query.include_combat_power || "") === "1") {
      // Use the same observation store and ranking source as the character page.
      // RequestLog alone can contain only the character's low farming-preset value.
      const ranking = await resolveRankingCombatPowerByOcid(ocid, { days: 2 });
      const power = await observeCombatPower(ocid, [
        { value: readStatValue(details?.stat?.data, "전투력"), source: "stat" },
        ranking && { value: ranking.value, observedAt: rankingObservedAt(ranking.date), source: "ranking" }
      ]);
      responsePayload.combatPowerHistory = {
        windowHours: 24,
        ...power,
        status: power.value !== null ? "ok" : isMongoConnected() ? "no_records" : "unavailable"
      };
    }

    responsePayload.meta = {
      mongoConnected: isMongoConnected(),
      aggregateSaved,
      dataTimestamp: new Date().toISOString(),
      guildCollection: enqueueRelatedGuild(details, worldNameCanonical, details?.basic?.data?.character_name || characterName, aggregateSaved)
    };

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

// "갱신" (refresh=1) skips the Nexon response cache, at most once a minute per character.
const pageRefreshCooldownMs = 60 * 1000;
const pageRefreshAt = new TtlLruCache({ maxEntries: 20000, maxBytes: 2 * 1024 * 1024 });

function allowPageRefresh(worldNameCanonical, characterName) {
  const key = `${worldNameCanonical}\u0000${characterName}`;
  if (pageRefreshAt.get(key)) return false;
  pageRefreshAt.set(key, true, pageRefreshCooldownMs, 64);
  return true;
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
  const refreshed = String(req.query.refresh || "") === "1" && allowPageRefresh(worldNameCanonical, characterName);
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

    const { details, summary } = await fetchCharacterDetails({
      characterName,
      worldNameCanonical,
      ocid,
      shouldLog: false,
      useCache: !refreshed
    });

    // Rankings are aggregated once a day (~02:30 KST) for the top 10,000, so today or yesterday is enough.
    const [historyAvailable, fallbackDetails, overallRankingResult, rankingCombatPower] = await Promise.all([
      hasExpHistory(ocid),
      loadRecentPageDataDetailsByOcid(ocid, presetFallbackLookbackLimit),
      resolveLatestOverallRankingByOcid(ocid, { days: 2 }),
      resolveRankingCombatPowerByOcid(ocid, { days: 2 })
    ]);
    const combatPower = await observeCombatPower(ocid, [
      { value: readStatValue(details?.stat?.data, "전투력"), source: "stat" },
      rankingCombatPower && {
        value: rankingCombatPower.value,
        observedAt: rankingObservedAt(rankingCombatPower.date),
        source: "ranking"
      }
    ]);

    const pageData = buildPageData({
      characterName,
      worldNameInput,
      worldNameCanonical,
      ocid,
      details,
      fallbackDetails,
      overallRankingResult,
      combatPower
    });

    pageData.meta.historyAvailable = historyAvailable;
    pageData.meta.refreshed = refreshed;
    pageData.meta.mongoConnected = mongoConnected;

    const aggregateSaved = await saveAggregatedCharacterLog({
      characterName,
      worldNameCanonical,
      ocid,
      statusCode: 200,
      success: summary.failureCount === 0,
      responseBody: {
        mode: "page-data",
        query: pageData.query,
        ocid,
        details
      },
      spec: { combatPower: combatPower?.value ?? null, maxDamage: pageData.profile?.majorStats?.maxDamage?.value ?? null }
    });
    pageData.meta.aggregateSaved = aggregateSaved;
    pageData.meta.guildCollection = enqueueRelatedGuild(details, worldNameCanonical, details?.basic?.data?.character_name || characterName, aggregateSaved);

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

function getGuildCollectionStatus(req, res) {
  const world = normalizeWorldName(req.query.world_name);
  const guildName = String(req.query.guild_name || "").trim();
  if (!world.ok || !guildName) {
    return res.status(400).json({ ok: false, message: "valid world_name and guild_name are required" });
  }
  return res.json({ ok: true, enabled: env.guildCollectionEnabled, collection: guildCollector.getStatus(world.worldNameCanonical, guildName) });
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
    success: true,
    "responseBody.mode": { $in: ["all", "page-data"] }
  };

  const [latestLog, aggregateCount] = await Promise.all([
    RequestLog.findOne(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .select({ updatedAt: 1, createdAt: 1, responseBody: 1, _id: 0 })
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
    latestAggregateLogAt: latestLog?.updatedAt || latestLog?.createdAt ? toIsoString(latestLog.updatedAt || latestLog.createdAt) : null,
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

async function getRankingCombatPowerController(req, res) {
  return getRankingController(req, res, "/maplestorym/v1/ranking/combat-power", getRankingCombatPower);
}

async function getRankingDojangController(req, res) {
  return getRankingController(req, res, "/maplestorym/v1/ranking/dojang", getRankingDojang);
}

async function getRankingKerningMTowerController(req, res) {
  return getRankingController(req, res, "/maplestorym/v1/ranking/kerning-m-tower", getRankingKerningMTower);
}

module.exports = {
  guildCollector,
  getGuildCollectionStatus,
  buildMajorStats,
  resolveAttackType,
  readStatValue,
  resolveStoredCombatPowerByOcid,
  // Shared with the v2 controllers (same Nexon cache and error shape).
  resolveOcid,
  mapEquipmentItemForView,
  fetchCharacterDetails,
  getErrorInfo,
  getCharacterImage,
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
  getRankingRootOfTimeController,
  getRankingCombatPowerController,
  getRankingDojangController,
  getRankingKerningMTowerController
};
