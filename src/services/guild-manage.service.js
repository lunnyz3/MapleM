"use strict";

// 길드장 도구: 길드원마다 마지막 접속(넥슨 character/basic, 캐릭터마다 12시간 보관), 모은 스펙의 전투력(사냥 프리셋으로 잰 듯하면 0),
// 최근 7일 성장(날짜별 기록), 이번 주 들어온·나간 길드원(들고 난 기록). 길드마다 1시간 보관.
// ocid 는 모은 스펙에서 먼저 찾고, 없으면 넥슨 id 로(6시간 보관).
const { CharacterSpec } = require("../models/character-spec.model");
const { CharacterRecord } = require("../models/character-record.model");
const { getCharacterByOcid, getCharacterOcid, getGuildBasic, getGuildId } = require("./maplestorym.service");
const { recordGuildRoster, guildRoster } = require("./guild-roster.service");
const { plausiblePowers } = require("./stats.service");
const { daysSince, memberGrowth } = require("../domain/guild/manage");
const { TtlLruCache } = require("../nexon/client");

const GUILD_TTL_MS = 60 * 60 * 1000;
const LOGIN_TTL_MS = 12 * 60 * 60 * 1000;
const WORKERS = 4;
const DB_TIMEOUT_MS = 5000;
const guildCache = new TtlLruCache({ maxEntries: 200, maxBytes: 8 * 1024 * 1024 });
const loginCache = new TtlLruCache({ maxEntries: 20000, maxBytes: 4 * 1024 * 1024 });
const DAY_MS = 24 * 60 * 60 * 1000;

async function lastLogin(ocid) {
  const known = loginCache.get(ocid);
  if (known !== undefined) return known;
  const basic = (await getCharacterByOcid("/maplestorym/v1/character/basic", ocid))?.data;
  const value = basic?.character_date_last_login || null;
  loginCache.set(ocid, value, LOGIN_TTL_MS, 64);
  return value;
}

/** → { guild: { name, world, level }, generatedAt, members: [...], week: { joined, left } } 또는 길드가 없으면 null */
async function guildManage({ worldName, guildName }) {
  const key = `${worldName}|${guildName}`;
  const hit = guildCache.get(key);
  if (hit) return hit;
  const id = (await getGuildId(guildName, worldName))?.data?.oguild_id;
  if (!id) return null;
  const basic = (await getGuildBasic(id))?.data;
  if (!basic) return null;
  recordGuildRoster(basic).catch(() => {});
  const roster = (Array.isArray(basic.guild_member) ? basic.guild_member : []).filter((member) => member?.character_name && member.character_name !== "-");
  const names = roster.map((member) => member.character_name);
  const specs = await CharacterSpec.find(
    { worldName, characterName: { $in: names } },
    { _id: 0, ocid: 1, characterName: 1, characterClass: 1, characterLevel: 1, combatPower: 1, itemScore: 1 }
  )
    .maxTimeMS(DB_TIMEOUT_MS)
    .lean();
  const powers = await plausiblePowers(specs).catch(() => specs.map(() => 0));
  const byName = new Map(specs.map((spec, index) => [spec.characterName, { ...spec, power: powers[index] }]));

  const rows = roster.map((member) => ({ member, spec: byName.get(member.character_name) || null, ocid: byName.get(member.character_name)?.ocid || "", login: null }));
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const row = rows[next];
      next += 1;
      try {
        if (!row.ocid) row.ocid = (await getCharacterOcid(row.member.character_name, worldName))?.data?.ocid || "";
        if (row.ocid) row.login = await lastLogin(row.ocid);
      } catch {
        // 지운 캐릭터·이름 바꾼 캐릭터는 모름으로 둔다
      }
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));

  const ocids = rows.map((row) => row.ocid).filter(Boolean);
  const records = await CharacterRecord.find({ ocid: { $in: ocids } }, { _id: 0, ocid: 1, journal: { $slice: -14 } })
    .maxTimeMS(DB_TIMEOUT_MS)
    .lean();
  const journals = new Map(records.map((record) => [record.ocid, record.journal]));
  const now = Date.now();
  const members = rows.map(({ member, spec, ocid, login }) => ({
    name: member.character_name,
    level: Number(member.character_level) || spec?.characterLevel || 0,
    className: spec?.characterClass || String(member.character_class || member.character_job_name || ""),
    activity: Number(member.guild_activity) || 0,
    power: spec?.power || 0,
    itemScore: spec?.itemScore || 0,
    lastLoginAt: login,
    daysAway: daysSince(login, now),
    growth: ocid ? memberGrowth(journals.get(ocid), now) : null
  }));

  const history = await guildRoster(worldName, guildName).catch(() => null);
  const since = new Date(now + 9 * 60 * 60 * 1000 - 7 * DAY_MS).toISOString().slice(0, 10);
  const week = { joined: [], left: [] };
  for (const event of history?.events || []) {
    if (event.date <= since) continue;
    week.joined.push(...event.joined);
    week.left.push(...event.left);
  }
  const result = {
    guild: { name: String(basic.guild_name || guildName), world: String(basic.world_name || worldName), level: Number(basic.guild_level) || 0 },
    rosterSince: history?.since || null,
    generatedAt: new Date(now).toISOString(),
    members,
    week
  };
  guildCache.set(key, result, GUILD_TTL_MS, 64 * 1024);
  return result;
}

module.exports = { guildManage };
