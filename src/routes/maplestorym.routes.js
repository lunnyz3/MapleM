const express = require("express");
const {
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
  getCharacterHexamatrixStat
} = require("../controllers/maplestorym.controller");

const router = express.Router();

router.get("/id", getCharacterId);
router.get("/character/all", getAllCharacterDetails);
router.get("/character/page-data", getCharacterPageData);
router.get("/character/exp-history", getCharacterExpHistory);
router.get("/character/log-status", getCharacterLogStatus);
router.get("/character/basic", getCharacterBasic);
router.get("/character/stat", getCharacterStat);
router.get("/character/hyper-stat", getCharacterHyperStat);
router.get("/character/guild", getCharacterGuild);
router.get("/user/union", getUserUnionController);
router.get("/user/union-raider", getUserUnionRaiderController);
router.get("/guild/id", getGuildIdController);
router.get("/guild/basic", getGuildBasicController);
router.get("/character/item-equipment", getCharacterItemEquipment);
router.get("/character/cashitem-equipment", getCharacterCashItemEquipment);
router.get("/character/symbol", getCharacterSymbol);
router.get("/character/set-effect", getCharacterSetEffect);
router.get("/character/android-equipment", getCharacterAndroidEquipment);
router.get("/character/jewel", getCharacterJewel);
router.get("/character/beauty-equipment", getCharacterBeautyEquipment);
router.get("/character/pet-equipment", getCharacterPetEquipment);
router.get("/character/skill-equipment", getCharacterSkillEquipment);
router.get("/character/link-skill", getCharacterLinkSkill);
router.get("/character/vmatrix", getCharacterVmatrix);
router.get("/character/hexamatrix-skill", getCharacterHexamatrixSkill);
router.get("/character/hexamatrix-stat", getCharacterHexamatrixStat);
// Aliases to tolerate short or typo-prone client paths.
router.get("/character/item-equip", getCharacterItemEquipment);
router.get("/character/cashitem", getCharacterCashItemEquipment);
router.get("/character/cash-item-equipment", getCharacterCashItemEquipment);

module.exports = { maplestorymRouter: router };
