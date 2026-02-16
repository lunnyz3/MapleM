require("dotenv").config();

const env = {
  port: Number(process.env.PORT || 3000),
  nexonApiKey: process.env.NEXON_OPEN_API_KEY || "",
  nexonBaseUrl: process.env.NEXON_API_BASE_URL || "https://open.api.nexon.com",
  mongoUri: process.env.MONGODB_URI || ""
};

module.exports = { env };
