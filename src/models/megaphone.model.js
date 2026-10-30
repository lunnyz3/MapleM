const mongoose = require("mongoose");

// 첫 화면 전광판 글. 화면에는 24시간 안의 최근 글만 보이고, 글은 3일 뒤 지워진다.
// 운영자는 scripts/ops/megaphone.js 로 목록을 보고 글을 숨긴다(hidden).
const MEGAPHONE_TTL_SECONDS = 3 * 24 * 60 * 60;

const megaphoneSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    text: { type: String, required: true },
    // 방문자 IP 를 서버 비밀값과 섞은 해시(원래 IP 는 남기지 않는다)
    visitor: { type: String, default: "" },
    hidden: { type: Boolean, default: false },
    createdAt: { type: Date, required: true }
  },
  { collection: "megaphones", versionKey: false }
);

// 최근 글 읽기(createdAt 내림차순)도 이 색인을 거꾸로 쓴다.
megaphoneSchema.index({ createdAt: 1 }, { name: "createdAt_ttl", expireAfterSeconds: MEGAPHONE_TTL_SECONDS });

const Megaphone = mongoose.model("Megaphone", megaphoneSchema);

module.exports = { Megaphone, MEGAPHONE_TTL_SECONDS };
