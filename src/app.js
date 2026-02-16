const path = require("path");
const express = require("express");
const { apiRouter } = require("./routes/api.routes");

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use("/api", apiRouter);

  // Keep API responses JSON-only, even for unknown API routes.
  app.use("/api", (req, res) => {
    res.status(404).json({
      ok: false,
      message: `API route not found: ${req.method} ${req.originalUrl}`
    });
  });

  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });

  return app;
}

module.exports = { createApp };
