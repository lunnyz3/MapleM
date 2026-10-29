// Wires the daily item collection (src/services/item-collection.service.js) to Nexon and
// MongoDB. Started from server.js only, so tests and scripts never run it.
const mongoose = require("mongoose");
const { env } = require("../config/env");
const { getRankingCombatPower, getCharacterOcid, getCharacterByOcid } = require("../services/maplestorym.service");
const { recordCharacterItems } = require("../services/item-ranking.service");
const { observeCombatPower, rankingObservedAt } = require("../services/combat-power.service");
const { CharacterSpec } = require("../models/character-spec.model");
const { SCORE_VERSION } = require("../domain/items/score");
const { createItemCollector } = require("../services/item-collection.service");

const itemEquipmentPath = "/maplestorym/v1/character/item-equipment";

/** Nexon/MongoDB dependencies shared by the daily job and one-off sweeps (scripts/data). */
const collectorDeps = {
  isAvailable: () => env.itemCollectionEnabled && mongoose.connection.readyState === 1,
  fetchRankingPage: async (date, page) => {
    const result = await getRankingCombatPower({ date, page });
    const rows = result?.data?.ranking;
    return Array.isArray(rows) ? rows : [];
  },
  resolveOcid: async (characterName, worldName) => (await getCharacterOcid(characterName, worldName))?.data?.ocid || null,
  fetchItems: async (ocid) => (await getCharacterByOcid(itemEquipmentPath, ocid, { useCache: false }))?.data || null,
  // Collected today with the current score rules (a rule change re-collects without --force).
  collectedSince: async (worldName, characterName, since) =>
    Boolean(await CharacterSpec.exists({ worldName, characterName, checkedAt: { $gte: since }, scoreVersion: SCORE_VERSION })),
  record: async ({ row, ocid, itemData }) => {
    await recordCharacterItems({
      ocid,
      characterName: row.character_name,
      worldName: row.world_name,
      characterClass: row.character_class,
      characterLevel: row.character_level,
      itemData,
      combatPower: row.character_combat_power,
      source: "ranking"
    });
    if (row.character_combat_power && row.date) {
      await observeCombatPower(ocid, [
        { value: row.character_combat_power, observedAt: rankingObservedAt(row.date), source: "ranking" }
      ]);
    }
  }
};

const itemCollector = createItemCollector(collectorDeps);

module.exports = { itemCollector, collectorDeps };
