const mongoose = require("mongoose");
const { env } = require("./env");

const connectOptions = {
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 10,
  retryWrites: true
};

// After a reboot PM2 can start the app before the MongoDB container is ready,
// so keep retrying instead of running without a database until the next restart.
async function connectMongo({
  uri = env.mongoUri,
  connect = (target) => mongoose.connect(target, connectOptions),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  retryDelayMs = 10000,
  maxAttempts = Infinity
} = {}) {
  if (!uri) {
    console.log("[MongoDB] MONGODB_URI not set. Running without DB connection.");
    return false;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await connect(uri);
      console.log("[MongoDB] Connected.");
      return true;
    } catch (error) {
      console.error(`[MongoDB] Connection failed (attempt ${attempt}):`, error.message);
      if (attempt < maxAttempts) {
        await sleep(retryDelayMs);
      }
    }
  }
  return false;
}

module.exports = { connectMongo };
