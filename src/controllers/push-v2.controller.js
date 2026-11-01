// v2 즐겨찾기 알림(웹 푸시).
//   GET  /api/v2/push/key                                    → { ok, publicKey } (알림을 못 쓰면 503)
//   POST /api/v2/push/subscribe { subscription, follows: { characters, guilds }, events } → { ok, follows }
//   POST /api/v2/push/unsubscribe { endpoint }               → { ok }
//   POST /api/v2/push/test { endpoint }                      → { ok, sent } (그 브라우저에만 확인 알림)
const { env } = require("../config/env");
const { isEnabled, removeSubscription, saveSubscription, sendTest } = require("../services/push.service");

function getPushKey(req, res) {
  if (!isEnabled()) return res.status(503).json({ ok: false, message: "알림을 쓸 수 없습니다." });
  res.set("Cache-Control", "public, max-age=3600");
  return res.json({ ok: true, publicKey: env.vapidPublicKey });
}

async function postSubscribe(req, res) {
  if (!isEnabled()) return res.status(503).json({ ok: false, message: "알림을 쓸 수 없습니다." });
  try {
    const follows = await saveSubscription({ subscription: req.body?.subscription, follows: req.body?.follows, events: req.body?.events !== false });
    if (!follows) return res.status(400).json({ ok: false, message: "구독 정보가 올바르지 않습니다." });
    return res.json({ ok: true, follows });
  } catch (error) {
    console.error("[push] subscribe failed:", error?.message || error);
    return res.status(503).json({ ok: false, message: "알림을 켜지 못했습니다." });
  }
}

async function postUnsubscribe(req, res) {
  try {
    await removeSubscription(String(req.body?.endpoint || ""));
    return res.json({ ok: true });
  } catch (error) {
    return res.status(503).json({ ok: false, message: "알림을 끄지 못했습니다." });
  }
}

async function postPushTest(req, res) {
  try {
    return res.json({ ok: true, sent: await sendTest(String(req.body?.endpoint || "")) });
  } catch (error) {
    return res.status(503).json({ ok: false, message: "알림을 보내지 못했습니다." });
  }
}

module.exports = { getPushKey, postSubscribe, postUnsubscribe, postPushTest };
