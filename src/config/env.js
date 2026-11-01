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
  guildCollectionEnabled: parseBoolean(process.env.GUILD_COLLECTION_ENABLED, true),
  // Daily item-equipment collection of the combat-power top 10,000 (item and spec rankings).
  itemCollectionEnabled: parseBoolean(process.env.ITEM_COLLECTION_ENABLED, true),
  // 전투력 순찰: 모은 캐릭터의 전투력(stat)을 주기마다 다시 읽어 그날 최고·최근 14일 최고를 남긴다.
  powerPatrolEnabled: parseBoolean(process.env.POWER_PATROL_ENABLED, true),
  // 길드 들고 난 기록: 하루 한 번 지하수로 랭킹 상위 1,000개 길드의 길드원 목록을 읽는다.
  guildRosterEnabled: parseBoolean(process.env.GUILD_ROSTER_ENABLED, true),
  // 코디 채우기: 하루 한 번 모은 캐릭터 중 코디가 없거나 7일 지난 캐릭터를 4만 명까지 읽는다.
  lookCollectionEnabled: parseBoolean(process.env.LOOK_COLLECTION_ENABLED, true),
  // 레벨 300 레이스: 15분마다 레벨 랭킹 상위 20명의 레벨·경험치를 읽는다. 빼 달라는 캐릭터는 "월드/이름,월드/이름".
  levelRaceEnabled: parseBoolean(process.env.LEVEL_RACE_ENABLED, true),
  levelRaceExclude: String(process.env.LEVEL_RACE_EXCLUDE || "").trim(),
  // 즐겨찾기 알림(웹 푸시) 서명 키. 없으면 알림을 끈다.
  vapidPublicKey: String(process.env.VAPID_PUBLIC_KEY || "").trim(),
  vapidPrivateKey: String(process.env.VAPID_PRIVATE_KEY || "").trim(),
  vapidSubject: String(process.env.VAPID_SUBJECT || "https://maplem.co.kr").trim(),
  powerPatrolIntervalMinutes: Math.max(5, parseNumber(process.env.POWER_PATROL_INTERVAL_MINUTES, 60)),
  powerPatrolConcurrency: Math.min(32, Math.max(1, parseNumber(process.env.POWER_PATROL_CONCURRENCY, 10))),
  guildCollectionMemberDelayMs: Math.max(0, parseNumber(process.env.GUILD_COLLECTION_MEMBER_DELAY_MS, 1000)),
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
