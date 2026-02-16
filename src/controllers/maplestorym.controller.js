const { env } = require("../config/env");
const {
  getCharacterOcid,
  getCharacterByOcid,
  saveRequestLog
} = require("../services/maplestorym.service");

async function getCharacterId(req, res) {
  const { character_name: characterName, world_name: worldName } = req.query;

  if (!env.nexonApiKey) {
    return res.status(500).json({
      ok: false,
      message: "NEXON_OPEN_API_KEY is missing in .env"
    });
  }

  if (!characterName || !worldName) {
    return res.status(400).json({
      ok: false,
      message: "character_name and world_name are required"
    });
  }

  try {
    const result = await getCharacterOcid(characterName, worldName);

    await saveRequestLog({
      characterName,
      worldName,
      endpoint: result.endpoint,
      statusCode: result.statusCode,
      success: true,
      responseBody: result.data
    });

    return res.json({
      ok: true,
      endpoint: result.endpoint,
      query: { characterName, worldName },
      data: result.data
    });
  } catch (error) {
    const statusCode = error.response?.status || 500;
    const errorBody = error.response?.data || { message: error.message };
    const endpoint = `${env.nexonBaseUrl}/maplestorym/v1/id`;

    await saveRequestLog({
      characterName,
      worldName,
      endpoint,
      statusCode,
      success: false,
      responseBody: errorBody
    });

    return res.status(statusCode).json({
      ok: false,
      endpoint,
      query: { characterName, worldName },
      error: errorBody
    });
  }
}

async function getCharacterByOcidController(req, res, endpointPath) {
  const { ocid } = req.query;

  if (!env.nexonApiKey) {
    return res.status(500).json({
      ok: false,
      message: "NEXON_OPEN_API_KEY is missing in .env"
    });
  }

  if (!ocid) {
    return res.status(400).json({
      ok: false,
      message: "ocid is required"
    });
  }

  try {
    const result = await getCharacterByOcid(endpointPath, ocid);

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
    const statusCode = error.response?.status || 500;
    const errorBody = error.response?.data || { message: error.message };
    const endpoint = `${env.nexonBaseUrl}${endpointPath}`;

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

module.exports = {
  getCharacterId,
  getCharacterBasic,
  getCharacterStat,
  getCharacterHyperStat,
  getCharacterGuild,
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
  getCharacterHexamatrixStat
};
