const axios = require("axios");
const mongoose = require("mongoose");
const { env } = require("../config/env");
const { RequestLog } = require("../models/request-log.model");

const idEndpointPath = "/maplestorym/v1/id";

async function requestNexon(endpoint, params) {
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
  saveRequestLog
};
