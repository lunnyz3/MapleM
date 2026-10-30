const mongoose = require("mongoose");

// 길드 들고 난 기록(src/domain/guild/roster.js): 길드마다 한 건 — 지금 길드원 이름, 날짜별 들어옴·나감(최근 200일치),
// 날짜별 인원(최근 180일). 길드 화면을 열 때와 하루 한 번 길드 랭킹 상위 길드를 훑을 때 고친다.
const guildRosterSchema = new mongoose.Schema(
  {
    worldName: { type: String, required: true },
    guildName: { type: String, required: true },
    members: { type: [String], default: [] },
    // [{ date: "YYYY-MM-DD"(서울), joined: [이름], left: [이름] }]
    events: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // [{ date, count }]
    counts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    since: { type: Date, required: true },
    updatedAt: { type: Date, required: true }
  },
  { collection: "guild_rosters", versionKey: false }
);

guildRosterSchema.index({ worldName: 1, guildName: 1 }, { unique: true });

const GuildRoster = mongoose.model("GuildRoster", guildRosterSchema);

module.exports = { GuildRoster };
