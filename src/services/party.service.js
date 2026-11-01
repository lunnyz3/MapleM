"use strict";

// 보스 파티 모집 게시판: 글 쓰기·지원·지원 취소·마감·내보내기·지우기. 로그인이 없어서 글을 쓰거나 지원하면 관리 키를 돌려주고
// (서버에는 해시만), 그 키로만 고칠 수 있다. 캐릭터는 모은 스펙(전투력은 사냥 프리셋으로 잰 듯하면 0)을 먼저 보고, 없으면 넥슨에서
// 있는지·레벨·지금 전투력을 읽는다. 방문자마다 하루 글 5개·지원 30번, 글쓴이 이름마다 열린 글 3개, 글마다 지원 12명.
const crypto = require("crypto");
const mongoose = require("mongoose");
const bossData = require("../game-data/boss-entry.json");
const { PartyPost } = require("../models/party-post.model");
const { CharacterSpec } = require("../models/character-spec.model");
const { getCharacterByOcid, getCharacterOcid } = require("./maplestorym.service");
const { plausiblePowers } = require("./stats.service");
const { cleanPostInput, entryStatus, publicPost, PartyInputError, NAME } = require("../domain/community/party");

const SECRET = process.env.ARCADE_SECRET || crypto.randomBytes(32).toString("hex");
const DAILY_POSTS = 5;
const DAILY_APPLIES = 30;
const OPEN_PER_HOST = 3;
const MAX_APPLICANTS = 12;
const LIST_MAX = 60;
const DB_TIMEOUT_MS = 5000;
const daily = new Map();

class PartyError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isMongoConnected = () => mongoose.connection.readyState === 1;
const visitorOf = (ip) => crypto.createHmac("sha256", SECRET).update(String(ip || "")).digest("hex").slice(0, 16);
const hashKey = (key) => crypto.createHash("sha256").update(String(key || "")).digest("hex");
const newKey = () => crypto.randomBytes(18).toString("base64url");
const kstDate = (now = Date.now()) => new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

function countToday(kind, visitor, limit, message) {
  const key = `${kind}|${visitor}`;
  const day = kstDate();
  const state = daily.get(key);
  if (state && state.day === day && state.count >= limit) throw new PartyError(429, message);
  daily.set(key, { day, count: state && state.day === day ? state.count + 1 : 1 });
}

/** 캐릭터 이름 → { name, className, level, power } (모은 스펙, 없으면 넥슨). 없는 캐릭터면 오류 */
async function characterFor(world, name) {
  const clean = String(name || "").trim();
  if (!NAME.test(clean)) throw new PartyError(400, "캐릭터 이름을 확인해 주세요.");
  const spec = await CharacterSpec.findOne({ worldName: world, characterName: clean }, { _id: 0, characterName: 1, characterClass: 1, characterLevel: 1, combatPower: 1, itemScore: 1 })
    .maxTimeMS(DB_TIMEOUT_MS)
    .lean();
  if (spec) {
    const [power] = await plausiblePowers([spec]).catch(() => [0]);
    return { name: spec.characterName, className: spec.characterClass || "", level: spec.characterLevel || 0, power: power || 0 };
  }
  const ocid = (await getCharacterOcid(clean, world).catch(() => null))?.data?.ocid;
  if (!ocid) throw new PartyError(404, `${world}에서 '${clean}' 캐릭터를 찾지 못했어요.`);
  const [basic, stat] = await Promise.all([
    getCharacterByOcid("/maplestorym/v1/character/basic", ocid).then((result) => result?.data, () => null),
    getCharacterByOcid("/maplestorym/v1/character/stat", ocid).then((result) => result?.data, () => null)
  ]);
  const entry = (Array.isArray(stat?.stat) ? stat.stat : []).find((item) => String(item?.stat_name || "").trim() === "전투력");
  return {
    name: String(basic?.character_name || clean),
    className: String(basic?.character_class || ""),
    level: Number(basic?.character_level) || 0,
    power: Number(String(entry?.stat_value ?? "").replace(/[^0-9.]/g, "")) || 0
  };
}

async function findPost(id) {
  if (!mongoose.isValidObjectId(id)) throw new PartyError(404, "글을 찾지 못했어요.");
  const post = await PartyPost.findOne({ _id: id, expiresAt: { $gt: new Date() } }).lean();
  if (!post) throw new PartyError(404, "끝났거나 지워진 글이에요.");
  return post;
}

function requireHost(post, key) {
  if (!key || hashKey(key) !== post.hostKey) throw new PartyError(403, "글을 쓴 브라우저에서만 할 수 있어요.");
}

/** 열린 글(최근 순, 월드·보스로 거르기) */
async function listPosts({ world = "", boss = "" } = {}) {
  if (!isMongoConnected()) return { posts: [] };
  const filter = { closed: false, expiresAt: { $gt: new Date() } };
  if (world) filter.world = world;
  if (boss) {
    const [name, difficulty] = String(boss).split("|");
    filter["boss.name"] = name;
    if (difficulty) filter["boss.difficulty"] = difficulty;
  }
  const docs = await PartyPost.find(filter, { hostKey: 0, visitor: 0, "applicants.key": 0 }).sort({ createdAt: -1 }).limit(LIST_MAX).maxTimeMS(DB_TIMEOUT_MS).lean();
  return { posts: docs.map(publicPost) };
}

async function createPost({ world, hostName, input, ip, now = new Date() }) {
  if (!isMongoConnected()) throw new PartyError(503, "잠시 뒤에 다시 시도해 주세요.");
  let clean;
  try {
    clean = cleanPostInput(input, bossData.bosses, now);
  } catch (error) {
    if (error instanceof PartyInputError) throw new PartyError(400, error.message);
    throw error;
  }
  const host = await characterFor(world, hostName);
  const open = await PartyPost.countDocuments({ world, "host.name": host.name, closed: false, expiresAt: { $gt: now } });
  if (open >= OPEN_PER_HOST) throw new PartyError(429, `한 캐릭터로 열어 둘 수 있는 글은 ${OPEN_PER_HOST}개예요.`);
  const visitor = visitorOf(ip);
  countToday("post", visitor, DAILY_POSTS, `하루에 ${DAILY_POSTS}개까지 쓸 수 있어요.`);
  const key = newKey();
  const doc = await PartyPost.create({
    world,
    ...clean,
    host: { ...host, status: entryStatus(host, clean), at: now },
    hostKey: hashKey(key),
    applicants: [],
    visitor,
    createdAt: now
  });
  return { post: publicPost(doc.toObject()), key };
}

async function applyToPost({ id, name, ip, now = new Date() }) {
  const post = await findPost(id);
  if (post.closed) throw new PartyError(409, "마감된 글이에요.");
  if ((post.applicants || []).length >= MAX_APPLICANTS) throw new PartyError(409, "지원이 꽉 찼어요.");
  const member = await characterFor(post.world, name);
  if (member.name === post.host.name || (post.applicants || []).some((row) => row.name === member.name)) throw new PartyError(409, "이미 들어 있는 캐릭터예요.");
  countToday("apply", visitorOf(ip), DAILY_APPLIES, `하루에 ${DAILY_APPLIES}번까지 지원할 수 있어요.`);
  const key = newKey();
  const applicant = { ...member, status: entryStatus(member, post), at: now, key: hashKey(key) };
  const updated = await PartyPost.findOneAndUpdate(
    { _id: post._id, closed: false, [`applicants.${MAX_APPLICANTS - 1}`]: { $exists: false }, "applicants.name": { $ne: member.name } },
    { $push: { applicants: applicant } },
    { returnDocument: "after", projection: { hostKey: 0, visitor: 0, "applicants.key": 0 } }
  ).lean();
  if (!updated) throw new PartyError(409, "지원하지 못했어요. 다시 확인해 주세요.");
  return { post: publicPost(updated), name: member.name, key };
}

async function cancelApply({ id, name, key }) {
  const post = await findPost(id);
  const updated = await PartyPost.findOneAndUpdate(
    { _id: post._id },
    { $pull: { applicants: { name: String(name || ""), key: hashKey(key) } } },
    { returnDocument: "after", projection: { hostKey: 0, visitor: 0, "applicants.key": 0 } }
  ).lean();
  return { post: publicPost(updated) };
}

async function hostAction({ id, key, action, name = "" }) {
  const post = await findPost(id);
  requireHost(post, key);
  if (action === "delete") {
    await PartyPost.deleteOne({ _id: post._id });
    return { deleted: true };
  }
  const update = action === "close" ? { $set: { closed: true } } : action === "reopen" ? { $set: { closed: false } } : { $pull: { applicants: { name: String(name) } } };
  if (!["close", "reopen", "kick"].includes(action)) throw new PartyError(400, "할 수 없는 일이에요.");
  const updated = await PartyPost.findOneAndUpdate({ _id: post._id }, update, { returnDocument: "after", projection: { hostKey: 0, visitor: 0, "applicants.key": 0 } }).lean();
  return { post: publicPost(updated) };
}

/** 글 하나(관리 키가 있는 브라우저가 마감한 글도 볼 수 있게) */
async function getPost(id) {
  return { post: publicPost(await findPost(id)) };
}

module.exports = { PartyError, listPosts, createPost, applyToPost, cancelApply, hostAction, getPost };
