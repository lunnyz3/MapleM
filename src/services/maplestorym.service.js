const mongoose = require("mongoose");
const { env } = require("../config/env");
const { RequestLog } = require("../models/request-log.model");
const { createNexonClient } = require("../nexon/client");

const idEndpointPath = "/maplestorym/v1/id";
const unionEndpointPath = "/maplestorym/v1/user/union";
const unionRaiderEndpointPath = "/maplestorym/v1/user/union-raider";
const guildIdEndpointPath = "/maplestorym/v1/guild/id";
const guildBasicEndpointPath = "/maplestorym/v1/guild/basic";
const rankingLevelEndpointPath = "/maplestorym/v1/ranking/level";
const rankingUnionEndpointPath = "/maplestorym/v1/ranking/union";
const rankingAchievementEndpointPath = "/maplestorym/v1/ranking/achievement";
const rankingSharenianBattlefieldEndpointPath = "/maplestorym/v1/ranking/sharenian-battlefield";
const rankingSharenianWaterwayEndpointPath = "/maplestorym/v1/ranking/sharenian-waterway";
const rankingRootOfTimeEndpointPath = "/maplestorym/v1/ranking/root-of-time";
const rankingCombatPowerEndpointPath = "/maplestorym/v1/ranking/combat-power";
const rankingDojangEndpointPath = "/maplestorym/v1/ranking/dojang";
const rankingKerningMTowerEndpointPath = "/maplestorym/v1/ranking/kerning-m-tower";
const quotaErrorWriteSuspendMs = 10 * 60 * 1000;
let requestLogWritesSuspendedUntil = 0;

// Every Nexon call goes through one client: response cache, in-flight dedupe,
// concurrency cap and backoff on 429/5xx (see src/nexon/client.js).
const nexonClient = createNexonClient({
  baseUrl: env.nexonBaseUrl,
  apiKey: env.nexonApiKey
});

// Periodic usage line in the server log, e.g. to watch the daily Nexon quota.
const statsLogIntervalMs = Number(process.env.NEXON_STATS_LOG_INTERVAL_MS ?? 10 * 60 * 1000);
if (statsLogIntervalMs > 0) {
  let lastLoggedRequests = 0;
  setInterval(() => {
    const stats = nexonClient.getStats();
    if (stats.requests !== lastLoggedRequests) {
      lastLoggedRequests = stats.requests;
      console.log(`[Nexon] ${JSON.stringify(stats)}`);
    }
  }, statsLogIntervalMs).unref();
}

function requestNexon(endpointPath, params, options) {
  return nexonClient.request(endpointPath, params, options);
}

async function getCharacterOcid(characterName, worldName) {
  return requestNexon(idEndpointPath, {
    character_name: characterName,
    world_name: worldName
  });
}

// options.useCache = false for bulk collection, so it does not push user lookups out of the cache.
async function getCharacterByOcid(endpointPath, ocid, options) {
  return requestNexon(endpointPath, { ocid }, options);
}

// Nexon notice lists: "notice" (공지), "notice-patch" (패치 노트), "notice-event" (이벤트).
async function getNoticeList(kind) {
  return requestNexon(`/maplestorym/v1/${kind}`, {});
}

/** 공지 한 건(제목·본문 HTML·날짜). kind: notice | notice-patch | notice-event */
async function getNoticeDetail(kind, noticeId) {
  return requestNexon(`/maplestorym/v1/${kind}/detail`, { notice_id: noticeId });
}

async function getUserUnion(ocid) {
  return requestNexon(unionEndpointPath, { ocid });
}

async function getUserUnionRaider(ocid) {
  return requestNexon(unionRaiderEndpointPath, { ocid });
}

async function getGuildId(guildName, worldName) {
  return requestNexon(guildIdEndpointPath, {
    guild_name: guildName,
    world_name: worldName
  });
}

async function getGuildBasic(oguildId) {
  return requestNexon(guildBasicEndpointPath, {
    oguild_id: oguildId
  });
}

async function getRankingLevel(params) {
  return requestNexon(rankingLevelEndpointPath, params);
}

async function getRankingUnion(params) {
  return requestNexon(rankingUnionEndpointPath, params);
}

async function getRankingAchievement(params) {
  return requestNexon(rankingAchievementEndpointPath, params);
}

async function getRankingSharenianBattlefield(params) {
  return requestNexon(rankingSharenianBattlefieldEndpointPath, params);
}

async function getRankingSharenianWaterway(params) {
  return requestNexon(rankingSharenianWaterwayEndpointPath, params);
}

async function getRankingRootOfTime(params) {
  return requestNexon(rankingRootOfTimeEndpointPath, params);
}

async function getRankingCombatPower(params) {
  return requestNexon(rankingCombatPowerEndpointPath, params);
}

async function getRankingDojang(params) {
  return requestNexon(rankingDojangEndpointPath, params);
}

async function getRankingKerningMTower(params) {
  return requestNexon(rankingKerningMTowerEndpointPath, params);
}

function isStorageQuotaError(error) {
  return /space quota/i.test(String(error?.message || ""));
}

// Request logs are best-effort: a failed write (e.g. Atlas blocking writes once the
// storage quota is full) must never turn a successful Nexon response into a 500.
function canSaveRequestLogs() {
  return mongoose.connection.readyState === 1 && Date.now() >= requestLogWritesSuspendedUntil;
}

async function saveRequestLog(entry) {
  if (!canSaveRequestLogs()) {
    return null;
  }

  try {
    return await writeRequestLog(entry);
  } catch (error) {
    if (isStorageQuotaError(error)) {
      requestLogWritesSuspendedUntil = Date.now() + quotaErrorWriteSuspendMs;
      console.error(
        `[RequestLog] MongoDB storage quota exceeded; skipping log writes for ${quotaErrorWriteSuspendMs / 60000} minutes.`
      );
    } else {
      console.error("[RequestLog] Failed to save request log:", error.message);
    }
    return null;
  }
}

async function writeRequestLog({
  characterName,
  worldName,
  ocid,
  endpoint,
  statusCode,
  success,
  responseBody
}) {
  const normalizedCharacterName = characterName || "";
  const normalizedWorldName = worldName || "";
  const normalizedOcid = ocid || "";
  const logMode = responseBody?.mode ? String(responseBody.mode) : "";
  const throttleMs = Number.isFinite(env.mongoLogThrottleMs) ? Math.max(0, env.mongoLogThrottleMs) : 120000;

  // Failed or partial lookups must not replace the last good daily snapshot.
  // They follow the throttled error-log path below instead.
  if (["all", "page-data"].includes(logMode) && normalizedCharacterName && normalizedWorldName && success && statusCode >= 200 && statusCode < 300) {
    const now = new Date();
    const kstDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now);

    const [year, month, day] = kstDate.split("-").map(Number);
    const kstOffsetMs = 9 * 60 * 60 * 1000;
    const dayStartUtc = new Date(Date.UTC(year, month - 1, day) - kstOffsetMs);
    const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);
    const identityFilter = {
      characterName: normalizedCharacterName,
      worldName: normalizedWorldName,
      endpoint
    };
    const existingToday = await RequestLog.findOne({
      ...identityFilter,
      $or: [
        { snapshotDate: kstDate },
        { createdAt: { $gte: dayStartUtc, $lt: dayEndUtc } }
      ]
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .select({ _id: 1 })
      .lean();
    const replaceFilter = existingToday?._id
      ? { _id: existingToday._id }
      : { ...identityFilter, snapshotDate: kstDate };
    const saved = await RequestLog.findOneAndReplace(
      replaceFilter,
      {
        characterName: normalizedCharacterName,
        worldName: normalizedWorldName,
        ocid: normalizedOcid,
        endpoint,
        snapshotDate: kstDate,
        statusCode,
        success,
        responseBody
      },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
        runValidators: true
      }
    );

    // Remove legacy aggregate logs created earlier on the same KST date.
    // The upserted daily snapshot above is the only document retained for today.
    await RequestLog.deleteMany({
      _id: { $ne: saved._id },
      ...identityFilter,
      createdAt: { $gte: dayStartUtc, $lt: dayEndUtc }
    });

    return saved;
  }

  if (throttleMs > 0) {
    const filter = {
      characterName: normalizedCharacterName,
      worldName: normalizedWorldName,
      ocid: normalizedOcid,
      endpoint
    };

    if (logMode) {
      filter["responseBody.mode"] = logMode;
    }

    const latest = await RequestLog.findOne(filter).sort({ createdAt: -1 }).select({ createdAt: 1 }).lean();
    const latestAt = latest?.createdAt instanceof Date ? latest.createdAt.getTime() : Number.NaN;
    if (Number.isFinite(latestAt) && Date.now() - latestAt < throttleMs) {
      return null;
    }
  }

  return RequestLog.create({
    characterName: normalizedCharacterName,
    worldName: normalizedWorldName,
    ocid: normalizedOcid,
    endpoint,
    statusCode,
    success,
    responseBody
  });
}

function getNexonClientStats() {
  return nexonClient.getStats();
}

module.exports = {
  getNoticeList,
  getNoticeDetail,
  canSaveRequestLogs,
  getNexonClientStats,
  getCharacterOcid,
  getCharacterByOcid,
  getUserUnion,
  getUserUnionRaider,
  getGuildId,
  getGuildBasic,
  getRankingLevel,
  getRankingUnion,
  getRankingAchievement,
  getRankingSharenianBattlefield,
  getRankingSharenianWaterway,
  getRankingRootOfTime,
  getRankingCombatPower,
  getRankingDojang,
  getRankingKerningMTower,
  saveRequestLog
};
