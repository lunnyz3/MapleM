const fs = require("fs");
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const { apiRouter } = require("./routes/api.routes");
const { v2Router } = require("./routes/v2.routes");
const { initShareImageCleanupJob } = require("./controllers/share.controller");
const { createRateLimiter } = require("./middleware/rate-limit");
const { securityHeaders } = require("./middleware/security-headers");
const { pageMeta, renderIndex } = require("./web/page-meta");
const { CharacterSpec } = require("./models/character-spec.model");
const { normalizeWorldName } = require("./config/worlds");

const minute = 60 * 1000;
// Per-IP limits, generous for real use: one ranking page loads 50 thumbnails.
const rateLimiters = {
  thumbnails: createRateLimiter({ name: "thumbnails", windowMs: minute, max: 300 }),
  characterPages: createRateLimiter({ name: "character-pages", windowMs: minute, max: 30 }),
  nexonData: createRateLimiter({ name: "nexon-data", windowMs: minute, max: 120 }),
  shareUploads: createRateLimiter({ name: "share-uploads", windowMs: minute, max: 10 }),
  // 미니게임 시작 표·기록, 전광판 글, 운세(글은 서비스가 방문자마다 2분에 한 번으로 따로 막는다)
  gameStarts: createRateLimiter({ name: "game-starts", windowMs: minute, max: 60 }),
  gameScores: createRateLimiter({ name: "game-scores", windowMs: minute, max: 20 }),
  megaphones: createRateLimiter({ name: "megaphones", windowMs: minute, max: 5 }),
  fortunes: createRateLimiter({ name: "fortunes", windowMs: minute, max: 30 }),
  // 검색 자동완성은 글자를 칠 때마다 부른다
  suggest: createRateLimiter({ name: "suggest", windowMs: minute, max: 120 }),
  // 공식 랭킹 1년 기록은 한 번에 넥슨 과거 랭킹을 약 16번 읽는다(캐릭터마다 6시간 보관)
  rankingHistory: createRateLimiter({ name: "ranking-history", windowMs: minute, max: 10 }),
  // 멀티서치는 한 번에 최대 30명(월드를 모르면 7월드)을 읽는다
  multiSearch: createRateLimiter({ name: "multi-search", windowMs: minute, max: 12 })
};

const publicDir = path.join(__dirname, "..", "public");
// 사이트 화면(web/ 의 Vite 빌드 결과). `npm run build:web` 으로 만든다. 스크립트·스타일은 app/ 아래.
const webDir = path.join(__dirname, "..", "dist", "web");
const webAssetsDir = path.join(webDir, "app") + path.sep;


function sendPublicPage(fileName) {
  // root 옵션을 써야 체크아웃 경로에 점(.)으로 시작하는 폴더가 있어도 send 가 거부하지 않는다.
  return (req, res) => res.sendFile(fileName, { root: publicDir });
}

function setWebCacheHeaders(res, filePath) {
  // 파일명에 해시가 붙는 app/ 만 오래 캐시하고, 나머지는 매번 확인한다.
  res.setHeader("Cache-Control", filePath.startsWith(webAssetsDir) ? "public, max-age=31536000, immutable" : "no-cache");
}

// 공유 미리보기 설명에 쓸 저장된 스펙(레벨·직업·전투력·템환산). 화면 응답을 늦추지 않게 짧게 기다린다.
async function findSpecForMeta(world, name) {
  const worldName = normalizeWorldName(world);
  if (!worldName.ok || mongoose.connection.readyState !== 1) return null;
  return CharacterSpec.findOne({ worldName: worldName.worldNameCanonical, characterName: name })
    .select({ _id: 0, characterLevel: 1, characterClass: 1, combatPower: 1, itemScore: 1 })
    .maxTimeMS(300)
    .lean();
}

async function sendWebPage(req, res) {
  // 확장자가 있는 요청이 여기까지 오면 없는 파일이다. HTML로 대체하지 않는다.
  if (path.extname(req.path)) {
    return res.status(404).type("text/plain").send("Not found");
  }
  let html;
  try {
    html = await fs.promises.readFile(path.join(webDir, "index.html"), "utf8");
  } catch {
    return res.status(404).type("text/plain").send("Web is not built. Run `npm run build:web`.");
  }
  // 제목·설명·공유 미리보기(og) 태그는 주소마다 서버가 채운다(미리보기 수집기는 스크립트를 돌리지 않는다).
  const meta = await pageMeta(req.path, { findSpec: findSpecForMeta });
  res.set("Cache-Control", "no-cache");
  return res.type("html").send(renderIndex(html, meta));
}

// 예전 미리보기 주소(/preview/...)와 기존 화면 파일 주소는 새 주소로 옮긴다(공유된 링크 유지).
function redirectTo(target) {
  return (req, res) => {
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    res.redirect(301, `${target(req)}${query}`);
  };
}

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(express.json());
  // 기존 화면 파일 주소는 정적 파일보다 먼저 새 주소로 옮긴다.
  app.get("/index.html", redirectTo(() => "/"));
  app.get("/ranking.html", redirectTo(() => "/ranking"));
  // 기존 화면의 상세 주소(?world_name=&character_name=)는 새 상세 주소로.
  app.get(["/character.html", "/guild.html"], (req, res) => {
    const world = String(req.query.world_name || "").trim();
    const name = String(req.query.character_name || req.query.guild_name || "").trim();
    const kind = req.path === "/character.html" ? "character" : "guild";
    res.redirect(301, world && name ? `/${kind}/${encodeURIComponent(world)}/${encodeURIComponent(name)}` : kind === "guild" ? "/guild" : "/");
  });

  // 새 화면 빌드(index.html 은 아래 라우트가 보낸다)와 기존 화면의 정적 파일(이미지·확률표·스크립트).
  app.use(express.static(webDir, { index: false, setHeaders: setWebCacheHeaders }));
  app.use(express.static(publicDir, { index: false }));
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
  // Recomputes a character from Nexon data, so it shares the character-page budget.
  app.post("/api/v2/character-stats", rateLimiters.characterPages);
  // One ranking page with ▲▼ costs up to ~5 Nexon calls (most are cached for hours).
  app.use("/api/v2/ranking", rateLimiters.nexonData);
  app.post("/api/v2/game/start", rateLimiters.gameStarts);
  app.post("/api/v2/game/score", rateLimiters.gameScores);
  app.post("/api/v2/megaphone", rateLimiters.megaphones);
  app.get(["/api/v2/fortune", "/api/v2/match", "/api/v2/fun/nicknames"], rateLimiters.fortunes);
  app.get("/api/v2/suggest", rateLimiters.suggest);
  // 길드장 도구는 길드원마다 넥슨 기본 정보를 읽는다(길드마다 1시간 보관)
  app.get(["/api/v2/ranking-history", "/api/v2/ranking-cuts", "/api/v2/guild-manage"], rateLimiters.rankingHistory);
  app.post("/api/v2/multi-search", rateLimiters.multiSearch);
  // 코디 모아 보기·무작위 구경은 부를 때마다 무작위로 읽는다
  app.get(["/api/v2/looks/wearers", "/api/v2/looks/random"], rateLimiters.fortunes);
  app.post(["/api/v2/push/subscribe", "/api/v2/push/unsubscribe", "/api/v2/push/test"], rateLimiters.fortunes);
  // 파티 모집: 글 쓰기는 전광판과 같은 제한, 지원·관리는 운세와 같은 제한(방문자마다 하루 횟수는 서비스가 따로 센다)
  app.post("/api/v2/party", rateLimiters.megaphones);
  app.post("/api/v2/party/:id/:action", rateLimiters.fortunes);

  app.use("/api/v2", v2Router);
  app.use("/api", apiRouter);

  // Keep API responses JSON-only, even for unknown API routes.
  app.use("/api", (req, res) => {
    res.status(404).json({
      ok: false,
      message: `API route not found: ${req.method} ${req.originalUrl}`
    });
  });

  // 기존 첫 화면은 /legacy 에 남긴다(거기서 여는 상세 화면은 새 화면으로 간다).
  app.get(["/legacy", "/legacy/"], sendPublicPage("index.html"));
  app.get("/go/maplem", (req, res) => {
    res.redirect(302, "https://maplem.co.kr");
  });

  app.get(/^\/preview(?:\/.*)?$/, redirectTo((req) => req.path.replace(/^\/preview/, "") || "/"));
  app.get("/ranking/:rankingType", (req, res) => res.redirect(301, `/ranking?type=${encodeURIComponent(req.params.rankingType)}`));

  // 나머지 주소는 새 화면이 맡는다(없는 화면은 새 화면이 "준비 중"으로 안내).
  app.get(/.*/, sendWebPage);

  return app;
}

module.exports = { createApp };
