const mongoose = require("mongoose");

// Items owned by characters seen on the site (lookups) or in the daily combat-power ranking
// collection. One row per character and distinct item (worn + presets, deduplicated by
// fingerprint). Rows not seen again for 30 days expire.
const ITEM_TTL_SECONDS = 30 * 24 * 60 * 60;

const equipmentItemSchema = new mongoose.Schema(
  {
    ocid: { type: String, required: true },
    fingerprint: { type: String, required: true },
    characterName: { type: String, default: "" },
    worldName: { type: String, default: "" },
    characterClass: { type: String, default: "" },
    characterLevel: { type: Number, default: 0 },
    attackType: { type: String, default: "physical" },
    slot: { type: String, required: true },
    // "" = not ranked (only 제네시스·아케인셰이드 are).
    family: { type: String, default: "" },
    label: { type: String, default: "" },
    itemName: { type: String, default: "" },
    starforce: { type: Number, default: 0 },
    score: { type: Number, required: true },
    scoreWithoutEmblem: { type: Number, required: true },
    // Points per part: basic, additional, potential, additionalPotential, soul, emblem.
    parts: { type: mongoose.Schema.Types.Mixed, default: null },
    scoreVersion: { type: Number, required: true },
    // Raw Nexon item, for the tooltip in the item ranking.
    item: { type: mongoose.Schema.Types.Mixed, required: true },
    source: { type: String, default: "lookup" },
    checkedAt: { type: Date, required: true }
  },
  { collection: "equipment_items", versionKey: false }
);

equipmentItemSchema.index({ ocid: 1, fingerprint: 1 }, { unique: true });
equipmentItemSchema.index({ slot: 1, family: 1, score: -1 });
equipmentItemSchema.index({ slot: 1, family: 1, scoreWithoutEmblem: -1 });
equipmentItemSchema.index({ slot: 1, score: -1 });
equipmentItemSchema.index({ worldName: 1, slot: 1, family: 1, score: -1 });
equipmentItemSchema.index({ checkedAt: 1 }, { name: "checkedAt_ttl", expireAfterSeconds: ITEM_TTL_SECONDS });

const EquipmentItem = mongoose.model("EquipmentItem", equipmentItemSchema);

module.exports = { EquipmentItem, ITEM_TTL_SECONDS };
