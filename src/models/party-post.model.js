const mongoose = require("mongoose");

// 보스 파티 모집 글(src/domain/community/party.js). 관리 키는 해시만 남긴다. 끝나는 때(expiresAt: 3일 또는 시작 6시간 뒤)에 지운다.
const partyPostSchema = new mongoose.Schema(
  {
    world: { type: String, required: true },
    boss: { type: mongoose.Schema.Types.Mixed, required: true },
    minPower: { type: Number, required: true },
    slots: { type: Number, required: true },
    startsAt: { type: Date, default: null },
    note: { type: String, default: "" },
    // { name, className, level, power, status, at }
    host: { type: mongoose.Schema.Types.Mixed, required: true },
    hostKey: { type: String, required: true },
    // [{ name, className, level, power, status, at, key }]
    applicants: { type: [mongoose.Schema.Types.Mixed], default: [] },
    closed: { type: Boolean, default: false },
    visitor: { type: String, default: "" },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true }
  },
  { collection: "party_posts", versionKey: false }
);

partyPostSchema.index({ world: 1, createdAt: -1 });
partyPostSchema.index({ expiresAt: 1 }, { name: "expiresAt_ttl", expireAfterSeconds: 0 });

const PartyPost = mongoose.model("PartyPost", partyPostSchema);

module.exports = { PartyPost };
