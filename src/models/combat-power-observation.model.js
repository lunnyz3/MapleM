const mongoose = require("mongoose");

// One row per observed 전투력 value. Rows expire after three days; reads only look at the
// last 24 hours.
const OBSERVATION_TTL_SECONDS = 3 * 24 * 60 * 60;

const combatPowerObservationSchema = new mongoose.Schema(
  {
    ocid: { type: String, required: true },
    value: { type: Number, required: true },
    observedAt: { type: Date, required: true },
    // "stat" = character stat endpoint at lookup time, "ranking" = combat-power ranking row.
    source: { type: String, required: true }
  },
  { collection: "combat_power_observations", versionKey: false }
);

combatPowerObservationSchema.index({ ocid: 1, observedAt: -1 });
combatPowerObservationSchema.index(
  { observedAt: 1 },
  { name: "observedAt_ttl", expireAfterSeconds: OBSERVATION_TTL_SECONDS }
);

const CombatPowerObservation = mongoose.model("CombatPowerObservation", combatPowerObservationSchema);

module.exports = { CombatPowerObservation, OBSERVATION_TTL_SECONDS };
