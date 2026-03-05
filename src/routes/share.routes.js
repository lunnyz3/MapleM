const express = require("express");
const {
  getShareClientConfig,
  parseItemImageUpload,
  postShareItemImage,
} = require("../controllers/share.controller");

const router = express.Router();

router.get("/config", getShareClientConfig);
router.post("/item-image", parseItemImageUpload, postShareItemImage);

module.exports = { shareRouter: router };
