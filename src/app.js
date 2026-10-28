const path = require("path");
const express = require("express");
const { apiRouter } = require("./routes/api.routes");
const { initShareImageCleanupJob } = require("./controllers/share.controller");
const { createRateLimiter } = require("./middleware/rate-limit");
const { securityHeaders } = require("./middleware/security-headers");

const minute = 60 * 1000;
// Per-IP limits, generous for real use: one ranking page loads 50 thumbnails.
const rateLimiters = {
  thumbnails: createRateLimiter({ name: "thumbnails", windowMs: minute, max: 300 }),
  characterPages: createRateLimiter({ name: "character-pages", windowMs: minute, max: 30 }),
  nexonData: createRateLimiter({ name: "nexon-data", windowMs: minute, max: 120 }),
  shareUploads: createRateLimiter({ name: "share-uploads", windowMs: minute, max: 10 })
};

const publicDir = path.join(__dirname, "..", "public");
// 개편 미리보기(web/ 의 Vite 빌드 결과). `npm run build:web` 으로 만든다.
const previewDir = path.join(__dirname, "..", "dist", "preview");
const previewAssetsDir = path.join(previewDir, "assets") + path.sep;

function sendPublicPage(fileName) {
  // root 옵션을 써야 체크아웃 경로에 점(.)으로 시작하는 폴더가 있어도 send 가 거부하지 않는다.
  return (req, res) => res.sendFile(fileName, { root: publicDir });
}

function setPreviewCacheHeaders(res, filePath) {
  // 파일명에 해시가 붙는 assets/ 만 오래 캐시하고, 나머지는 매번 확인한다.
  res.setHeader("Cache-Control", filePath.startsWith(previewAssetsDir) ? "public, max-age=31536000, immutable" : "no-cache");
}

function sendPreviewPage(req, res) {
  // 확장자가 있는 요청이 여기까지 오면 없는 파일이다. HTML로 대체하지 않는다.
  if (path.extname(req.path)) {
    return res.status(404).type("text/plain").send("Not found");
  }
  res.set("Cache-Control", "no-cache");
  return res.sendFile("index.html", { root: previewDir }, (error) => {
    if (error && !res.headersSent) {
      res.status(404).type("text/plain").send("Preview is not built. Run `npm run build:web`.");
    }
  });
}

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(express.json());
  app.use(express.static(publicDir));
  app.use(
    "/vendor/html2canvas",
    express.static(path.join(__dirname, "..", "node_modules", "html2canvas", "dist")),
  );

  initShareImageCleanupJob();

  // Every Nexon-backed endpoint spends our API quota, so cap requests per visitor.
  app.use("/api/maplestorym/character/image", rateLimiters.thumbnails);
  app.use(["/api/maplestorym/character/page-data", "/api/maplestorym/character/all"], rateLimiters.characterPages);
  app.use("/api/maplestorym", (req, res, next) => {
    // Paths with their own limiter above are not counted twice.
    if (/^\/character\/(image|page-data|all)(\/|$)/.test(req.path)) {
      return next();
    }
    return rateLimiters.nexonData(req, res, next);
  });
  app.post("/api/share/item-image", rateLimiters.shareUploads);

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

  // 개편 미리보기: dist/preview 정적 파일, 그 밖의 /preview 하위 경로는 미리보기 index.html 로 대체.
  app.use("/preview", express.static(previewDir, { index: false, setHeaders: setPreviewCacheHeaders }));
  app.get(/^\/preview(?:\/.*)?$/, sendPreviewPage);

  app.get(/.*/, sendPublicPage("index.html"));

  return app;
}

module.exports = { createApp };
