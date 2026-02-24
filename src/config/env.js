require("dotenv").config();

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const env = {
  port: parseNumber(process.env.PORT, 3000),
  nexonApiKey: process.env.NEXON_OPEN_API_KEY || "",
  nexonBaseUrl: process.env.NEXON_API_BASE_URL || "https://open.api.nexon.com",
  mongoUri: process.env.MONGODB_URI || "",
  mongoLogThrottleMs: Math.max(0, parseNumber(process.env.MONGODB_LOG_THROTTLE_MS, 120000))
};

module.exports = { env };
