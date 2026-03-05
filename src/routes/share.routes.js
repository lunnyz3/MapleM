const express = require("express");
const {
  getShareClientConfig,
  getShareItemImageDownload,
  parseItemImageUpload,
  postShareItemImage,
} = require("../controllers/share.controller");

const router = express.Router();

router.get("/config", getShareClientConfig);
router.post("/item-image", parseItemImageUpload, postShareItemImage);
router.get("/item-image-download/:fileName", getShareItemImageDownload);

module.exports = { shareRouter: router };
