// Character change history (닉네임·길드·직업): stored site lookups (requestlogs, every successful
// character/all snapshot) plus the changes the collection noticed (character_specs.history).
const mongoose = require("mongoose");
const { RequestLog } = require("../models/request-log.model");
const { CharacterSpec } = require("../models/character-spec.model");

const DB_TIMEOUT_MS = 3000;
const MAX_SNAPSHOTS = 400;

/** Turns time-ordered snapshots into change events for each field. */
function changesFrom(snapshots) {
  const events = [];
  const last = {};
  snapshots.forEach((snapshot) => {
    ["name", "guild", "class"].forEach((field) => {
      const value = snapshot[field];
      if (value === undefined || value === null || value === "") return;
      if (last[field] !== undefined && last[field] !== value) {
        events.push({ field, from: last[field], to: value, at: snapshot.at });
      }
      last[field] = value;
    });
  });
  return events;
}

async function characterHistory(ocid) {
  const key = String(ocid || "").trim();
  if (!key || mongoose.connection.readyState !== 1) return [];
  const [logs, spec] = await Promise.all([
    RequestLog.find({ ocid: key, endpoint: /\/character\/all$/, success: true })
      .sort({ createdAt: 1 })
      .limit(MAX_SNAPSHOTS)
      .select({
        createdAt: 1,
        "responseBody.details.basic.data.character_name": 1,
        "responseBody.details.basic.data.character_class": 1,
        "responseBody.details.guild.data.guild_name": 1,
        _id: 0
      })
      .maxTimeMS(DB_TIMEOUT_MS)
      .lean(),
    CharacterSpec.findOne({ ocid: key }).select({ history: 1, _id: 0 }).maxTimeMS(DB_TIMEOUT_MS).lean()
  ]);
  const snapshots = logs.map((log) => {
    const details = log.responseBody?.details || {};
    return {
      at: log.createdAt,
      name: details.basic?.data?.character_name,
      class: details.basic?.data?.character_class,
      // A missing guild response is not "left the guild"; only a successful empty one is.
      guild: details.guild?.data ? details.guild.data.guild_name || "(없음)" : undefined
    };
  });
  const events = [...changesFrom(snapshots), ...(spec?.history || [])];
  const seen = new Set();
  return events
    .filter((event) => {
      const id = `${event.field}|${event.from}|${event.to}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}

module.exports = { characterHistory, changesFrom };
