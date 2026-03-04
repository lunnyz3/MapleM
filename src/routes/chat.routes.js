const express = require("express");
const {
  getChatSessionStatus,
  postChatMessage,
  resetChatSession
} = require("../controllers/chat.controller");

const router = express.Router();

router.get("/session/status", getChatSessionStatus);
router.post("/message", postChatMessage);
router.post("/session/reset", resetChatSession);

module.exports = { chatRouter: router };
