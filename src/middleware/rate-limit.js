// Fixed-window rate limiter per client IP, kept in memory (single PM2 process).
// The site sits behind Cloudflare Tunnel + nginx, so the socket address is always
// 127.0.0.1; the visitor IP comes from CF-Connecting-IP / X-Forwarded-For.

function resolveClientIp(req) {
  const cloudflareIp = String(req.headers?.["cf-connecting-ip"] || "").trim();
  if (cloudflareIp) {
    return cloudflareIp;
  }
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

function createRateLimiter({ name, windowMs, max, now = Date.now, message = "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }) {
  const hits = new Map();
  let lastSweepAt = now();

  function sweep(currentTime) {
    if (currentTime - lastSweepAt < windowMs) {
      return;
    }
    lastSweepAt = currentTime;
    for (const [key, entry] of hits) {
      if (entry.resetAt <= currentTime) {
        hits.delete(key);
      }
    }
  }

  return function rateLimit(req, res, next) {
    const currentTime = now();
    sweep(currentTime);
    const key = resolveClientIp(req);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= currentTime) {
      entry = { count: 0, resetAt: currentTime + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000));
      res.set("Retry-After", String(retryAfterSec));
      return res.status(429).json({ ok: false, code: "RATE_LIMITED", limiter: name, message });
    }
    return next();
  };
}

module.exports = { createRateLimiter, resolveClientIp };
