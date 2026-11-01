// v2 보스 파티 모집 게시판.
//   GET  /api/v2/party?world_name=&boss=이름|난이도        → { ok, posts: [...] } (열린 글, 최근 순)
//   GET  /api/v2/party/:id                                 → { ok, post }
//   POST /api/v2/party { world_name, host, boss: { name, difficulty }, minPower, slots, startsAt, note } → { ok, post, key }
//   POST /api/v2/party/:id/apply { name }                   → { ok, post, name, key }
//   POST /api/v2/party/:id/cancel { name, key }             → { ok, post }
//   POST /api/v2/party/:id/host { key, action: close|reopen|kick|delete, name } → { ok, post } | { ok, deleted }
const { normalizeWorldName } = require("../config/worlds");
const { resolveClientIp } = require("../middleware/rate-limit");
const { PartyError, applyToPost, cancelApply, createPost, getPost, hostAction, listPosts } = require("../services/party.service");

const text = (value, max = 80) => String(value ?? "").trim().slice(0, max);

function route(handler, cache = "no-store") {
  return async (req, res) => {
    try {
      const result = await handler(req);
      res.set("Cache-Control", cache);
      return res.json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof PartyError) return res.status(error.status).json({ ok: false, message: error.message });
      console.error("[party] failed:", error?.message || error);
      return res.status(503).json({ ok: false, message: "잠시 뒤에 다시 시도해 주세요." });
    }
  };
}

function worldOf(value, required) {
  const raw = text(value, 20);
  if (!raw && !required) return "";
  const world = normalizeWorldName(raw);
  if (!world.ok) throw new PartyError(400, "월드를 골라 주세요.");
  return world.worldNameCanonical;
}

const getPartyPosts = route((req) => listPosts({ world: worldOf(req.query.world_name, false), boss: text(req.query.boss, 40) }), "no-cache");
const getPartyPost = route((req) => getPost(text(req.params.id, 40)), "no-cache");
const postPartyPost = route((req) =>
  createPost({
    world: worldOf(req.body?.world_name, true),
    hostName: text(req.body?.host, 24),
    input: { boss: req.body?.boss, minPower: req.body?.minPower, slots: req.body?.slots, startsAt: text(req.body?.startsAt, 40), note: text(req.body?.note, 120) },
    ip: resolveClientIp(req)
  })
);
const postPartyApply = route((req) => applyToPost({ id: text(req.params.id, 40), name: text(req.body?.name, 24), ip: resolveClientIp(req) }));
const postPartyCancel = route((req) => cancelApply({ id: text(req.params.id, 40), name: text(req.body?.name, 24), key: text(req.body?.key, 80) }));
const postPartyHost = route((req) => hostAction({ id: text(req.params.id, 40), key: text(req.body?.key, 80), action: text(req.body?.action, 10), name: text(req.body?.name, 24) }));

module.exports = { getPartyPosts, getPartyPost, postPartyPost, postPartyApply, postPartyCancel, postPartyHost };
