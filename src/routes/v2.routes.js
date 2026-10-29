const express = require("express");
const { getManualInputs, postCharacterStats } = require("../controllers/stats-v2.controller");
const { getRankingV2 } = require("../controllers/ranking-v2.controller");
const { getNotices } = require("../controllers/notices-v2.controller");
const { getClassStats, getLevelStats, getJobMeta, getJobTop, getHallOfFame } = require("../controllers/stats-page-v2.controller");
const { getPopular } = require("../controllers/popular-v2.controller");
const { itemCollector } = require("../jobs/item-collection.job");
const {
  getItemRanks,
  getItemRankingGroups,
  getItemRanking,
  getItemSearch,
  getItemSearchSlots,
  getSpecRanking,
  postSpecs,
  getSpecSummary,
  getCharacterHistory,
  getCharacterRecord,
  getCollectionSummary
} = require("../controllers/item-ranking-v2.controller");

const router = express.Router();

router.get("/manual-inputs", getManualInputs);
router.post("/character-stats", postCharacterStats);
router.get("/ranking/:type", getRankingV2);
router.get("/item-ranks", getItemRanks);
router.get("/item-ranking/groups", getItemRankingGroups);
router.get("/item-ranking", getItemRanking);
router.get("/item-search/slots", getItemSearchSlots);
router.get("/item-search", getItemSearch);
router.get("/spec-ranking", getSpecRanking);
router.post("/specs", postSpecs);
router.get("/spec-summary", getSpecSummary);
router.get("/character-history", getCharacterHistory);
router.get("/character-record", getCharacterRecord);
router.get("/collection-summary", getCollectionSummary);
router.get("/notices", getNotices);
router.get("/popular", getPopular);
router.get("/stats/classes", getClassStats);
router.get("/stats/levels", getLevelStats);
router.get("/stats/job-meta", getJobMeta);
router.get("/stats/hall-of-fame", getHallOfFame);
router.get("/stats/job-top", getJobTop);
router.get("/item-collection", (req, res) => res.json({ ok: true, ...itemCollector.getStatus() }));

module.exports = { v2Router: router };
