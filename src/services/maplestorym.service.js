const axios = require("axios");
const mongoose = require("mongoose");
const { env } = require("../config/env");
const { RequestLog } = require("../models/request-log.model");

const idEndpointPath = "/maplestorym/v1/id";
const unionEndpointPath = "/maplestorym/v1/user/union";
const unionRaiderEndpointPath = "/maplestorym/v1/user/union-raider";
const guildIdEndpointPath = "/maplestorym/v1/guild/id";
const guildBasicEndpointPath = "/maplestorym/v1/guild/basic";
const maxRetryCount = 2;

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

async function saveRequestLog({
  characterName,
  worldName,
  ocid,
  endpoint,
  statusCode,
  success,
  responseBody
}) {
  if (mongoose.connection.readyState !== 1) {
    return null;
  }

  const normalizedCharacterName = characterName || "";
  const normalizedWorldName = worldName || "";
  const normalizedOcid = ocid || "";
  const logMode = responseBody?.mode ? String(responseBody.mode) : "";
  const throttleMs = Number.isFinite(env.mongoLogThrottleMs) ? Math.max(0, env.mongoLogThrottleMs) : 120000;

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
  saveRequestLog
};
