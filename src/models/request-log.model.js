const mongoose = require("mongoose");

const requestLogSchema = new mongoose.Schema(
  {
    characterName: { type: String, default: "" },
    worldName: { type: String, default: "" },
    ocid: { type: String, default: "" },
    endpoint: { type: String, required: true },
    statusCode: { type: Number, required: true },
    success: { type: Boolean, required: true },
    responseBody: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
);

const RequestLog = mongoose.model("RequestLog", requestLogSchema);

module.exports = { RequestLog };
