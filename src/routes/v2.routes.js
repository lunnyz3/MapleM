const express = require("express");
const { getManualInputs, postCharacterStats } = require("../controllers/stats-v2.controller");
const { getRankingV2 } = require("../controllers/ranking-v2.controller");
const { itemCollector } = require("../jobs/item-collection.job");
const { getItemRanks, getItemRankingGroups, getItemRanking, getSpecRanking } = require("../controllers/item-ranking-v2.controller");

const router = express.Router();

router.get("/manual-inputs", getManualInputs);
router.post("/character-stats", postCharacterStats);
router.get("/ranking/:type", getRankingV2);
router.get("/item-ranks", getItemRanks);
router.get("/item-ranking/groups", getItemRankingGroups);
router.get("/item-ranking", getItemRanking);
router.get("/spec-ranking", getSpecRanking);
router.get("/item-collection", (req, res) => res.json({ ok: true, ...itemCollector.getStatus() }));

module.exports = { v2Router: router };
