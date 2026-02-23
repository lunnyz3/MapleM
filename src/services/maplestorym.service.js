const axios = require("axios");
const mongoose = require("mongoose");
const { env } = require("../config/env");
const { RequestLog } = require("../models/request-log.model");

const idEndpointPath = "/maplestorym/v1/id";
const unionEndpointPath = "/maplestorym/v1/user/union";
const unionRaiderEndpointPath = "/maplestorym/v1/user/union-raider";
const guildIdEndpointPath = "/maplestorym/v1/guild/id";
const guildBasicEndpointPath = "/maplestorym/v1/guild/basic";
const defaultRetryMs = 1200;
const maxRetryCount = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(headers, attempt) {
  const retryAfterHeader = headers?.["retry-after"];
  const retryAfterSec = Number(retryAfterHeader);

  if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    return retryAfterSec * 1000;
  }

  return defaultRetryMs * attempt;
}

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

      const delayMs = getRetryDelayMs(error.response?.headers, attempt);
      await sleep(delayMs);
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
    return;
  }

  await RequestLog.create({
    characterName: characterName || "",
    worldName: worldName || "",
    ocid: ocid || "",
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
