const mongoose = require("mongoose");

// 즐겨찾기 알림(웹 푸시) 구독: 브라우저마다 한 건 — 푸시 주소·키, 따라가는 캐릭터·길드, 이벤트 종료 알림 여부.
// 화면이 열릴 때마다 따라가는 목록을 다시 보내 updatedAt 이 새로워진다. 90일 동안 안 오면 지운다.
const PUSH_TTL_SECONDS = 90 * 24 * 60 * 60;

const pushSubscriptionSchema = new mongoose.Schema(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
    // { characters: [{ world, name }], guilds: [{ world, name }] }
    follows: { type: mongoose.Schema.Types.Mixed, default: () => ({ characters: [], guilds: [] }) },
    events: { type: Boolean, default: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true }
  },
  { collection: "push_subscriptions", versionKey: false }
);

pushSubscriptionSchema.index({ "follows.characters.world": 1, "follows.characters.name": 1 });
pushSubscriptionSchema.index({ "follows.guilds.world": 1, "follows.guilds.name": 1 });
pushSubscriptionSchema.index({ updatedAt: 1 }, { name: "updatedAt_ttl", expireAfterSeconds: PUSH_TTL_SECONDS });

const PushSubscription = mongoose.model("PushSubscription", pushSubscriptionSchema);

module.exports = { PushSubscription };
