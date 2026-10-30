// 미니게임 랭킹 · 전광판 · 오늘의 운세.
//   POST /api/v2/game/start { game }                         → { ok, token }
//   POST /api/v2/game/score { game, nickname, value, token } → { ok, rank, value, improved }
//   GET  /api/v2/game/leaderboard?game=                      → { ok, game, week, rows: [{ rank, nickname, value }] }
//   GET  /api/v2/megaphone                                   → { ok, messages: [{ id, name, text, at }], news: [{ id, text, world, name }] }
//   POST /api/v2/megaphone { name, text }                    → { ok, message }
//   GET  /api/v2/fortune?world_name=&name=                   → { ok, fortune }
//   GET  /api/v2/match?a_world=&a_name=&b_world=&b_name=   → { ok, match: { score, line, points, a, b } } (캐릭터 궁합)
//   GET  /api/v2/fun/nicknames?kind=ko|en&prefix=          → { ok, names } (닉네임 생성기)
//   GET  /api/v2/news?day=yesterday                          → { ok, date, counts, events } (오늘의 강화 소식)
const { normalizeWorldName } = require("../config/worlds");
const { resolveClientIp } = require("../middleware/rate-limit");
const { ArcadeError, startGame, leaderboard, submitScore, megaphones, postMegaphone, fortune, characterMatch, nicknames } = require("../services/arcade.service");
const { upgradeNews } = require("../services/news.service");

const text = (value, max = 200) => String(value ?? "").slice(0, max);

function fail(res, error) {
  if (error instanceof ArcadeError) return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
  console.error("[arcade] failed:", error?.message || error);
  return res.status(503).json({ ok: false, message: "잠시 뒤에 다시 시도해 주세요." });
}

function route(handler, cache = "no-store") {
  return async (req, res) => {
    try {
      const result = await handler(req);
      res.set("Cache-Control", cache);
      return res.json({ ok: true, ...result });
    } catch (error) {
      return fail(res, error);
    }
  };
}

const postGameStart = route(async (req) => startGame(text(req.body?.game, 20)));

const postGameScore = route((req) =>
  submitScore({
    game: text(req.body?.game, 20),
    nickname: text(req.body?.nickname, 40),
    value: Number(req.body?.value),
    token: text(req.body?.token, 120),
    ip: resolveClientIp(req)
  })
);

const getLeaderboard = route((req) => leaderboard(text(req.query.game, 20)), "public, max-age=10");

const getMegaphones = route(() => megaphones(), "public, max-age=10");

const postMegaphones = route((req) => postMegaphone({ name: text(req.body?.name, 40), text: text(req.body?.text, 200), ip: resolveClientIp(req) }));

const getFortune = route(async (req) => {
  const world = normalizeWorldName(text(req.query.world_name, 20));
  const name = text(req.query.name, 24).trim();
  if (!world.ok || !name) throw new ArcadeError(400, "INPUT", "월드와 캐릭터 이름을 입력해 주세요.");
  return fortune({ world: world.worldNameCanonical, name });
}, "public, max-age=300");

const whoOf = (req, side) => {
  const world = normalizeWorldName(text(req.query[`${side}_world`], 20));
  const name = text(req.query[`${side}_name`], 24).trim();
  if (!world.ok || !name) throw new ArcadeError(400, "INPUT", "두 캐릭터의 월드와 이름을 입력해 주세요.");
  return { world: world.worldNameCanonical, name };
};

const getMatch = route(async (req) => characterMatch({ a: whoOf(req, "a"), b: whoOf(req, "b") }), "public, max-age=300");

const getNicknames = route((req) => nicknames({ kind: text(req.query.kind, 4) === "en" ? "en" : "ko", prefix: text(req.query.prefix, 4) }));

const getNews = route((req) => upgradeNews({ day: text(req.query.day, 12) === "yesterday" ? "yesterday" : "" }), "public, max-age=60");

module.exports = { postGameStart, postGameScore, getLeaderboard, getMegaphones, postMegaphones, getFortune, getMatch, getNicknames, getNews };
