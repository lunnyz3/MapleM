const mongoose = require("mongoose");

// 미니게임 이번 주 랭킹: 게임·주·닉네임마다 가장 좋은 기록 한 줄. score 는 높을수록 위(낮을수록 좋은 기록은 음수,
// src/domain/community/arcade-scores.js). 지난 주 기록은 60일 뒤 지워진다.
const SCORE_TTL_SECONDS = 60 * 24 * 60 * 60;

const gameScoreSchema = new mongoose.Schema(
  {
    game: { type: String, required: true },
    week: { type: String, required: true },
    nickname: { type: String, required: true },
    score: { type: Number, required: true },
    // 방문자 IP 를 서버 비밀값과 섞은 해시(원래 IP 는 남기지 않는다)
    visitor: { type: String, default: "" },
    updatedAt: { type: Date, required: true }
  },
  { collection: "game_scores", versionKey: false }
);

gameScoreSchema.index({ game: 1, week: 1, nickname: 1 }, { unique: true });
gameScoreSchema.index({ game: 1, week: 1, score: -1 });
gameScoreSchema.index({ updatedAt: 1 }, { name: "updatedAt_ttl", expireAfterSeconds: SCORE_TTL_SECONDS });

const GameScore = mongoose.model("GameScore", gameScoreSchema);

module.exports = { GameScore, SCORE_TTL_SECONDS };
