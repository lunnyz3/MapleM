const mongoose = require("mongoose");

// Best records and growth journal per character (src/domain/records/journal.js). No TTL: one
// small document per character, and the journal keeps only the last 180 days.
const characterRecordSchema = new mongoose.Schema(
  {
    ocid: { type: String, required: true, unique: true },
    worldName: { type: String, default: "" },
    characterName: { type: String, default: "" },
    // { combatPower: { value, at }, itemScore: { value, at }, … }
    best: { type: mongoose.Schema.Types.Mixed, default: {} },
    // [{ date: "YYYY-MM-DD" (KST), combatPower, itemScore, potential, additionalPotential, level, changes?: [{ slot, from, to }] }]
    journal: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // Latest best-preset gear [{ slot, name, starforce, score }] to diff the next snapshot against.
    gear: { type: [mongoose.Schema.Types.Mixed], default: [] },
    scoreVersion: { type: Number, required: true },
    updatedAt: { type: Date, required: true }
  },
  { collection: "character_records", versionKey: false, minimize: false }
);

const CharacterRecord = mongoose.model("CharacterRecord", characterRecordSchema);

module.exports = { CharacterRecord };
