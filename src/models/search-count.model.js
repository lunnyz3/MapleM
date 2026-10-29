const mongoose = require("mongoose");

// Page lookups per KST day for the popular-search lists (characters, guilds). Only the name and
// the count are kept (no visitor data); rows expire 3 days after their last lookup.
const SEARCH_COUNT_TTL_SECONDS = 3 * 24 * 60 * 60;

function createSchema(collection) {
  const schema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    worldName: { type: String, required: true },
    characterName: { type: String, required: true },
    characterClass: { type: String, default: "" },
    count: { type: Number, default: 0 },
    lastAt: { type: Date, required: true }
  },
  { collection, versionKey: false }
  );
  schema.index({ day: 1, worldName: 1, characterName: 1 }, { unique: true });
  schema.index({ day: 1, count: -1 });
  schema.index({ lastAt: 1 }, { name: "lastAt_ttl", expireAfterSeconds: SEARCH_COUNT_TTL_SECONDS });
  return schema;
}

// characterName holds the guild name for guild rows; characterClass holds "Lv.N" for guilds.
const SearchCount = mongoose.model("SearchCount", createSchema("search_counts"));
const GuildSearchCount = mongoose.model("GuildSearchCount", createSchema("guild_search_counts"));

module.exports = { SearchCount, GuildSearchCount };
