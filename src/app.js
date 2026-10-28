const path = require("path");
const express = require("express");
const { apiRouter } = require("./routes/api.routes");
const { initShareImageCleanupJob } = require("./controllers/share.controller");

const publicDir = path.join(__dirname, "..", "public");

function sendPublicPage(fileName) {
  // root 옵션을 써야 체크아웃 경로에 점(.)으로 시작하는 폴더가 있어도 send 가 거부하지 않는다.
  return (req, res) => res.sendFile(fileName, { root: publicDir });
}

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(publicDir));
  app.use(
    "/vendor/html2canvas",
    express.static(path.join(__dirname, "..", "node_modules", "html2canvas", "dist")),
  );

  initShareImageCleanupJob();

  app.use("/api", apiRouter);

  // Keep API responses JSON-only, even for unknown API routes.
  app.use("/api", (req, res) => {
    res.status(404).json({
      ok: false,
      message: `API route not found: ${req.method} ${req.originalUrl}`
    });
  });

  app.get("/character/:worldName/:characterName", sendPublicPage("character.html"));
  app.get(/^\/character\/[^/]+\/.+$/, sendPublicPage("character.html"));
  app.get("/ranking", sendPublicPage("ranking.html"));
  app.get("/ranking/:rankingType", sendPublicPage("ranking.html"));
  app.get("/guild", sendPublicPage("guild.html"));
  app.get("/guild/:worldName/:guildName", sendPublicPage("guild.html"));
  app.get(/^\/guild\/[^/]+\/.+$/, sendPublicPage("guild.html"));
  app.get("/go/maplem", (req, res) => {
    res.redirect(302, "https://maplem.co.kr");
  });

  app.get(/.*/, sendPublicPage("index.html"));

  return app;
}

module.exports = { createApp };
