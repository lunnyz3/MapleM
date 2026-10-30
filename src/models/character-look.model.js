const mongoose = require("mongoose");

// 코디(src/domain/looks/look.js): 캐릭터마다 한 건 — 성별, 헤어·성형(이름·색), 피부, 지금 입은 캐시템 [{ slot, name }].
// 캐릭터 조회 때와 하루 한 번 모은 캐릭터를 채울 때 고친다. 30일 동안 다시 보지 않으면 지운다(스펙과 같은 기준).
const LOOK_TTL_SECONDS = 30 * 24 * 60 * 60;

const characterLookSchema = new mongoose.Schema(
  {
    ocid: { type: String, required: true, unique: true },
    worldName: { type: String, default: "" },
    characterName: { type: String, default: "" },
    characterClass: { type: String, default: "" },
    gender: { type: String, default: "" },
    hair: { type: mongoose.Schema.Types.Mixed, default: null },
    face: { type: mongoose.Schema.Types.Mixed, default: null },
    skin: { type: String, default: "" },
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
    checkedAt: { type: Date, required: true }
  },
  { collection: "character_looks", versionKey: false }
);

characterLookSchema.index({ "hair.name": 1 });
characterLookSchema.index({ "face.name": 1 });
characterLookSchema.index({ checkedAt: 1 }, { name: "checkedAt_ttl", expireAfterSeconds: LOOK_TTL_SECONDS });

// 캐시템 아이콘: 이름마다 한 건(처음 본 부위·아이콘)
const cosmeticItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    slot: { type: String, default: "" },
    icon: { type: String, default: "" }
  },
  { collection: "cosmetic_items", versionKey: false }
);

const CharacterLook = mongoose.model("CharacterLook", characterLookSchema);
const CosmeticItem = mongoose.model("CosmeticItem", cosmeticItemSchema);

module.exports = { CharacterLook, CosmeticItem, LOOK_TTL_SECONDS };
