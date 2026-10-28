const express = require("express");
const { getManualInputs, postCharacterStats } = require("../controllers/stats-v2.controller");

const router = express.Router();

router.get("/manual-inputs", getManualInputs);
router.post("/character-stats", postCharacterStats);

module.exports = { v2Router: router };
