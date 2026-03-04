const express = require("express");
const { healthRouter } = require("./health.routes");
const { maplestorymRouter } = require("./maplestorym.routes");
const { chatRouter } = require("./chat.routes");

const router = express.Router();

router.use("/health", healthRouter);
router.get("/health/routes", (req, res) => {
  const maplestorymRoutes = maplestorymRouter.stack
    .filter((layer) => layer.route && layer.route.path)
    .map((layer) => ({
      method: Object.keys(layer.route.methods)[0].toUpperCase(),
      path: `/api/maplestorym${layer.route.path}`
    }));

  res.json({
    ok: true,
    maplestorymRoutes
  });
});
router.use("/maplestorym", maplestorymRouter);
router.use("/chat", chatRouter);

module.exports = { apiRouter: router };
