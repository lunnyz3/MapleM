const express = require("express");
const { getManualInputs, postCharacterStats } = require("../controllers/stats-v2.controller");
const { getRankingV2 } = require("../controllers/ranking-v2.controller");
const { getEvents, getNotices } = require("../controllers/notices-v2.controller");
const { getClassStats, getLevelStats, getJobMeta, getJobTop, getHallOfFame, getCharacterCard, getSpecTwins, getJobTiers, getWorldStats, getBossReach, getGamePool, getGameGear, getGameItems } = require("../controllers/stats-page-v2.controller");
const { getPopular } = require("../controllers/popular-v2.controller");
const { postGameStart, postGameScore, getLeaderboard, getMegaphones, postMegaphones, getFortune, getMatch, getNicknames, getNews } = require("../controllers/arcade-v2.controller");
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
  getRankingHistory,
  getRankingCuts,
  postMultiSearch,
  getGuildRoster,
  postRecordBriefs,
  getSuggest,
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
router.get("/ranking-history", getRankingHistory);
router.get("/ranking-cuts", getRankingCuts);
router.post("/multi-search", postMultiSearch);
router.get("/guild-roster", getGuildRoster);
router.post("/records/brief", postRecordBriefs);
router.get("/suggest", getSuggest);
router.get("/collection-summary", getCollectionSummary);
router.get("/notices", getNotices);
router.get("/events", getEvents);
router.get("/popular", getPopular);
router.get("/stats/classes", getClassStats);
router.get("/stats/levels", getLevelStats);
router.get("/stats/job-meta", getJobMeta);
router.get("/stats/hall-of-fame", getHallOfFame);
router.get("/stats/job-top", getJobTop);
router.get("/stats/card", getCharacterCard);
router.get("/stats/twins", getSpecTwins);
router.get("/stats/tiers", getJobTiers);
router.get("/stats/worlds", getWorldStats);
router.get("/stats/boss-reach", getBossReach);
router.get("/game/pool", getGamePool);
router.get("/game/gear", getGameGear);
router.get("/game/items", getGameItems);
router.post("/game/start", postGameStart);
router.post("/game/score", postGameScore);
router.get("/game/leaderboard", getLeaderboard);
router.get("/megaphone", getMegaphones);
router.post("/megaphone", postMegaphones);
router.get("/fortune", getFortune);
router.get("/news", getNews);
router.get("/match", getMatch);
router.get("/fun/nicknames", getNicknames);
router.get("/item-collection", (req, res) => res.json({ ok: true, ...itemCollector.getStatus() }));

module.exports = { v2Router: router };
