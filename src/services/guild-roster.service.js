"use strict";

// 길드 들고 난 기록: 넥슨 guild/basic 응답을 받을 때마다(길드 화면, 캐릭터 화면 길드 탭, 하루 한 번 훑기) 지난 목록과 견줘
// 바뀐 것만 쓴다. 쓰기는 응답을 막지 않는다.
const mongoose = require("mongoose");
const { GuildRoster } = require("../models/guild-roster.model");
const { mergeRoster } = require("../domain/guild/roster");

const DB_TIMEOUT_MS = 3000;
const isMongoConnected = () => mongoose.connection.readyState === 1;

/** @param {any} data guild/basic 응답(world_name, guild_name, guild_member) */
async function recordGuildRoster(data, now = new Date()) {
  const worldName = String(data?.world_name || "").trim();
  const guildName = String(data?.guild_name || "").trim();
  const names = (Array.isArray(data?.guild_member) ? data.guild_member : []).map((member) => member?.character_name);
  if (!worldName || !guildName || !names.length || !isMongoConnected()) return null;
  const previous = await GuildRoster.findOne({ worldName, guildName }, { _id: 0, members: 1, events: 1, counts: 1, since: 1 }).maxTimeMS(DB_TIMEOUT_MS).lean();
  const next = mergeRoster(previous, names, now);
  if (!next.changed) return null;
  await GuildRoster.updateOne(
    { worldName, guildName },
    { $set: { members: next.members, events: next.events, counts: next.counts, since: next.since, updatedAt: now } },
    { upsert: true }
  );
  return next;
}

/** → { since, count, events: [{ date, joined, left }](최근 날부터), counts: [{ date, count }] } 또는 기록 없으면 null */
async function guildRoster(worldName, guildName) {
  if (!isMongoConnected()) return null;
  const doc = await GuildRoster.findOne({ worldName, guildName }, { _id: 0, members: 1, events: 1, counts: 1, since: 1 }).maxTimeMS(DB_TIMEOUT_MS).lean();
  if (!doc) return null;
  return { since: doc.since, count: doc.members.length, events: [...(doc.events || [])].reverse(), counts: doc.counts || [] };
}

module.exports = { recordGuildRoster, guildRoster };
