const mongoose = require("mongoose");
const { env } = require("./env");

async function connectMongo() {
  if (!env.mongoUri) {
    console.log("[MongoDB] MONGODB_URI not set. Running without DB connection.");
    return;
  }

  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
      retryWrites: true
    });
    console.log("[MongoDB] Connected.");
  } catch (error) {
    console.error("[MongoDB] Connection failed:", error.message);
  }
}

module.exports = { connectMongo };
