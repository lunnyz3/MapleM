const axios = require("axios");
const mongoose = require("mongoose");
const { env } = require("../config/env");
const { RequestLog } = require("../models/request-log.model");

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
const maxRetryCount = 2;
const quotaErrorWriteSuspendMs = 10 * 60 * 1000;
let requestLogWritesSuspendedUntil = 0;

async function requestNexon(endpoint, params) {
  for (let attempt = 1; attempt <= maxRetryCount + 1; attempt += 1) {
    try {
      const response = await axios.get(endpoint, {
        params,
        headers: {
          "x-nxopen-api-key": env.nexonApiKey
        },
        timeout: 10000
      });

      return {
        endpoint,
        data: response.data,
        statusCode: response.status
      };
    } catch (error) {
      const status = error.response?.status;
      const canRetry = status === 429 && attempt <= maxRetryCount;

      if (!canRetry) {
        throw error;
      }
    }
  }
}

async function getCharacterOcid(characterName, worldName) {
  const endpoint = `${env.nexonBaseUrl}${idEndpointPath}`;
  return requestNexon(endpoint, {
    character_name: characterName,
    world_name: worldName
  });
}

async function getCharacterByOcid(endpointPath, ocid) {
  const endpoint = `${env.nexonBaseUrl}${endpointPath}`;
  return requestNexon(endpoint, { ocid });
}

async function getUserUnion(ocid) {
  const endpoint = `${env.nexonBaseUrl}${unionEndpointPath}`;
  return requestNexon(endpoint, { ocid });
}

async function getUserUnionRaider(ocid) {
  const endpoint = `${env.nexonBaseUrl}${unionRaiderEndpointPath}`;
  return requestNexon(endpoint, { ocid });
}

async function getGuildId(guildName, worldName) {
  const endpoint = `${env.nexonBaseUrl}${guildIdEndpointPath}`;
  return requestNexon(endpoint, {
    guild_name: guildName,
    world_name: worldName
  });
}

async function getGuildBasic(oguildId) {
  const endpoint = `${env.nexonBaseUrl}${guildBasicEndpointPath}`;
  return requestNexon(endpoint, {
    oguild_id: oguildId
  });
}

async function getRankingLevel(params) {
  const endpoint = `${env.nexonBaseUrl}${rankingLevelEndpointPath}`;
  return requestNexon(endpoint, params);
}

async function getRankingUnion(params) {
  const endpoint = `${env.nexonBaseUrl}${rankingUnionEndpointPath}`;
  return requestNexon(endpoint, params);
}

async function getRankingAchievement(params) {
  const endpoint = `${env.nexonBaseUrl}${rankingAchievementEndpointPath}`;
  return requestNexon(endpoint, params);
}

async function getRankingSharenianBattlefield(params) {
  const endpoint = `${env.nexonBaseUrl}${rankingSharenianBattlefieldEndpointPath}`;
  return requestNexon(endpoint, params);
}

async function getRankingSharenianWaterway(params) {
  const endpoint = `${env.nexonBaseUrl}${rankingSharenianWaterwayEndpointPath}`;
  return requestNexon(endpoint, params);
}

async function getRankingRootOfTime(params) {
  const endpoint = `${env.nexonBaseUrl}${rankingRootOfTimeEndpointPath}`;
  return requestNexon(endpoint, params);
}

function isStorageQuotaError(error) {
  return /space quota/i.test(String(error?.message || ""));
}

// Request logs are best-effort: a failed write (e.g. Atlas blocking writes once the
// storage quota is full) must never turn a successful Nexon response into a 500.
async function saveRequestLog(entry) {
  if (mongoose.connection.readyState !== 1 || Date.now() < requestLogWritesSuspendedUntil) {
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

  if (["all", "page-data"].includes(logMode) && normalizedCharacterName && normalizedWorldName) {
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
        new: true,
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

module.exports = {
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
  saveRequestLog
};
