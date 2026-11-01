const mongoose = require("mongoose");

// Spec summary per character for the spec ranking (템환산 합·잠재·에디·최대 대미지·전투력).
// The equipment numbers come from the preset with the highest item score sum. Rows are kept
// (no expiry); checkedAt says when the equipment was last read.

const characterSpecSchema = new mongoose.Schema(
  {
    ocid: { type: String, required: true, unique: true },
    characterName: { type: String, default: "" },
    worldName: { type: String, default: "" },
    characterClass: { type: String, default: "" },
    characterLevel: { type: Number, default: 0 },
    attackType: { type: String, default: "physical" },
    presetNo: { type: Number, default: null },
    itemScore: { type: Number, default: 0 },
    itemScoreWithoutEmblem: { type: Number, default: 0 },
    potential: { type: Number, default: 0 },
    additionalPotential: { type: Number, default: 0 },
    // Only known for characters looked up on the site (needs every endpoint).
    maxDamage: { type: Number, default: null },
    combatPower: { type: Number, default: null },
    // character/basic 의 생성일(조회·멀티서치·채우기 스크립트가 넣는다). 동급 비교의 '생성 연도' 무리.
    characterCreatedAt: { type: Date, default: undefined },
    scoreVersion: { type: Number, required: true },
    // Name/class changes seen between collections: [{ field, from, to, at }] (last 50).
    history: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    source: { type: String, default: "lookup" },
    checkedAt: { type: Date, required: true }
  },
  { collection: "character_specs", versionKey: false }
);

characterSpecSchema.index({ worldName: 1, characterName: 1 });
["itemScore", "itemScoreWithoutEmblem", "potential", "additionalPotential", "maxDamage", "combatPower", "characterLevel"].forEach((field) => {
  characterSpecSchema.index({ scoreVersion: 1, [field]: -1 });
  characterSpecSchema.index({ scoreVersion: 1, worldName: 1, [field]: -1 });
});
// 코디 모으기가 최근 확인 순으로 읽는다
characterSpecSchema.index({ checkedAt: 1 });

const CharacterSpec = mongoose.model("CharacterSpec", characterSpecSchema);

module.exports = { CharacterSpec };
