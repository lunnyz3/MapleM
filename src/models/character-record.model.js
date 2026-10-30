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
    // 최근 14일 최고 전투력 { value, at }: 전투력 순찰이 같거나 높은 값을 볼 때마다(같은 값은 하루에 한 번) 새로 남긴다.
    recentPeak: { type: mongoose.Schema.Types.Mixed, default: undefined },
    scoreVersion: { type: Number, required: true },
    updatedAt: { type: Date, required: true }
  },
  { collection: "character_records", versionKey: false, minimize: false }
);

const CharacterRecord = mongoose.model("CharacterRecord", characterRecordSchema);

module.exports = { CharacterRecord };
