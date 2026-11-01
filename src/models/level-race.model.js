const mongoose = require("mongoose");

// 레벨 300 레이스(src/services/level-race.service.js): 레벨 랭킹 상위 캐릭터의 레벨·경험치를 15분마다 한 줄씩(kind "point",
// 14일 뒤 자동 삭제)과 처음 Lv.299·300에 닿은 것을 확인한 기록(kind "first", expiresAt 이 없어 지우지 않음).
const levelRaceSchema = new mongoose.Schema(
  {
    kind: { type: String, required: true },
    ocid: { type: String, default: "" },
    worldName: { type: String, default: "" },
    characterName: { type: String, default: "" },
    characterClass: { type: String, default: "" },
    level: { type: Number, default: 0 },
    exp: { type: Number, default: 0 },
    expRate: { type: Number, default: 0 },
    at: { type: Date, required: true },
    expiresAt: { type: Date, default: undefined }
  },
  { collection: "level_race", versionKey: false }
);

levelRaceSchema.index({ kind: 1, ocid: 1, at: -1 });
levelRaceSchema.index({ kind: 1, level: 1 });
levelRaceSchema.index({ expiresAt: 1 }, { name: "expiresAt_ttl", expireAfterSeconds: 0 });

const LevelRace = mongoose.model("LevelRace", levelRaceSchema);

module.exports = { LevelRace };
