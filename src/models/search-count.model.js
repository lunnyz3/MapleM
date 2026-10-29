const mongoose = require("mongoose");

// Character page lookups per KST day for the popular-search list. Only the character and the
// count are kept (no visitor data); rows expire 3 days after their last lookup.
const SEARCH_COUNT_TTL_SECONDS = 3 * 24 * 60 * 60;

const searchCountSchema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    worldName: { type: String, required: true },
    characterName: { type: String, required: true },
    characterClass: { type: String, default: "" },
    count: { type: Number, default: 0 },
    lastAt: { type: Date, required: true }
  },
  { collection: "search_counts", versionKey: false }
);

searchCountSchema.index({ day: 1, worldName: 1, characterName: 1 }, { unique: true });
searchCountSchema.index({ day: 1, count: -1 });
searchCountSchema.index({ lastAt: 1 }, { name: "lastAt_ttl", expireAfterSeconds: SEARCH_COUNT_TTL_SECONDS });

const SearchCount = mongoose.model("SearchCount", searchCountSchema);

module.exports = { SearchCount };
