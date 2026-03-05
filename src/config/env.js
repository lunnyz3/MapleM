require("dotenv").config();

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

const env = {
  port: parseNumber(process.env.PORT, 3000),
  nexonApiKey: process.env.NEXON_OPEN_API_KEY || "",
  nexonBaseUrl: process.env.NEXON_API_BASE_URL || "https://open.api.nexon.com",
  mongoUri: process.env.MONGODB_URI || "",
  mongoLogThrottleMs: Math.max(0, parseNumber(process.env.MONGODB_LOG_THROTTLE_MS, 120000)),
  chatbotEnabled: parseBoolean(process.env.CHATBOT_ENABLED, false),
  pythonChatBaseUrl: process.env.PYTHON_CHAT_BASE_URL || "http://localhost:8001",
  chatProxyTimeoutMs: Math.max(1000, parseNumber(process.env.CHAT_PROXY_TIMEOUT_MS, 20000)),
  chatCookieName: process.env.CHAT_COOKIE_NAME || "chat_sid",
  chatCookieMaxAgeSec: Math.max(60, parseNumber(process.env.CHAT_COOKIE_MAX_AGE_SEC, 15552000)),
  chatCookieSecure: parseBoolean(process.env.CHAT_COOKIE_SECURE, false),
  kakaoJsKey: String(process.env.KAKAO_JS_KEY || "").trim(),
  shareWebBaseUrl: String(process.env.SHARE_WEB_BASE_URL || "https://maplem.co.kr")
    .trim()
    .replace(/\/+$/g, ""),
  shareItemImagePublicDir: String(process.env.SHARE_ITEM_IMAGE_PUBLIC_DIR || "uploads/item-share")
    .trim()
    .replace(/^\/+|\/+$/g, ""),
  shareItemImageMaxBytes: Math.max(
    64 * 1024,
    parseNumber(process.env.SHARE_ITEM_IMAGE_MAX_BYTES, 2 * 1024 * 1024),
  ),
  shareItemImageTtlSec: Math.max(60, parseNumber(process.env.SHARE_ITEM_IMAGE_TTL_SEC, 86400)),
  shareItemImageCleanupIntervalMs: Math.max(
    60 * 1000,
    parseNumber(process.env.SHARE_ITEM_IMAGE_CLEANUP_INTERVAL_MS, 10 * 60 * 1000),
  ),
};

module.exports = { env };
