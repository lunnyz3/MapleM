// 미니게임 이번 주 랭킹 · 첫 화면 전광판 · 오늘의 운세.
// 랭킹: 게임을 시작할 때 서버가 서명한 표를 주고, 기록은 그 표와 함께만 받는다(게임마다 점수 범위·최소 플레이 시간 확인,
// 표는 한 번만). 전광판: 글 검사(욕설·링크·전화번호·도배) + 방문자마다 2분에 한 번·하루 10번 + 전체 10분에 30개.
const crypto = require("crypto");
const mongoose = require("mongoose");
const { GameScore } = require("../models/game-score.model");
const { Megaphone } = require("../models/megaphone.model");
const { EquipmentItem } = require("../models/equipment-item.model");
const { SCORE_VERSION } = require("../domain/items/score");
const { ACCESSORY_SLOTS } = require("../domain/stats/hall-of-fame");
const { GAME_RULES, weekKey, sortScore, valueOf, checkScore, issueToken, verifyToken, rankRows } = require("../domain/community/arcade-scores");
const { checkMessage, checkNickname, REASON_TEXT } = require("../domain/community/text-filter");
const { fortuneOf } = require("../domain/community/fortune");
const { TtlLruCache } = require("../nexon/client");

const DB_TIMEOUT_MS = 3000;
// 시작 표 서명·방문자 해시용 비밀값. 설정(ARCADE_SECRET)이 없으면 서버가 켜질 때마다 새로 만든다(그 전에 받은 표는 무효).
const SECRET = process.env.ARCADE_SECRET || crypto.randomBytes(32).toString("hex");

class ArcadeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const isMongoConnected = () => mongoose.connection.readyState === 1;
const visitorOf = (ip) => crypto.createHmac("sha256", SECRET).update(String(ip || "")).digest("hex").slice(0, 16);
const kstDate = (now) => new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

// ---------------- 랭킹 ----------------

const NICKNAME_MAX = 12;
const BOARD_SIZE = 20;
const usedTokens = new TtlLruCache({ maxEntries: 20000, maxBytes: 2 * 1024 * 1024 });
const boardCache = new TtlLruCache({ maxEntries: 50, maxBytes: 512 * 1024 });

function requireGame(game) {
  if (!Object.hasOwn(GAME_RULES, game)) throw new ArcadeError(400, "GAME", "없는 게임이에요.");
}

/** 게임 시작 표. */
function startGame(game) {
  requireGame(game);
  return { token: issueToken(SECRET, game) };
}

/** 이번 주 위 20명 → { game, week, rows: [{ rank, nickname, value }] } (15초 보관) */
async function leaderboard(game, now = new Date()) {
  requireGame(game);
  const week = weekKey(now);
  if (!isMongoConnected()) return { game, week, rows: [] };
  const key = `${game}|${week}`;
  const hit = boardCache.get(key);
  if (hit) return hit;
  const docs = await GameScore.find({ game, week }, { _id: 0, nickname: 1, score: 1 })
    .sort({ score: -1, updatedAt: 1 })
    .limit(BOARD_SIZE)
    .lean()
    .maxTimeMS(DB_TIMEOUT_MS);
  const result = { game, week, rows: rankRows(docs).map((row) => ({ rank: row.rank, nickname: row.nickname, value: valueOf(game, row.score) })) };
  boardCache.set(key, result, 15 * 1000, 4096);
  return result;
}

/**
 * 기록 올리기: 닉네임마다 이번 주 가장 좋은 기록만 남는다. → { rank, value, improved }
 */
async function submitScore({ game, nickname, value, token, ip, now = new Date() }) {
  requireGame(game);
  if (!isMongoConnected()) throw new ArcadeError(503, "DB", "지금은 기록을 받을 수 없어요.");
  const ticket = verifyToken(SECRET, token, game, now.getTime());
  if (!ticket.ok || usedTokens.get(token)) throw new ArcadeError(400, "TOKEN", "게임을 처음부터 다시 해 주세요.");
  const checked = checkScore(game, value, now.getTime() - ticket.issuedAt);
  if (!checked.ok) throw new ArcadeError(400, "SCORE", "기록을 확인할 수 없어요.");
  const nick = checkNickname(nickname, NICKNAME_MAX);
  if (!nick.ok) throw new ArcadeError(400, "NICKNAME", REASON_TEXT[nick.reason]);
  usedTokens.set(token, true, 3 * 60 * 60 * 1000, 64);

  const week = weekKey(now);
  const score = sortScore(game, checked.value);
  const filter = { game, week, nickname: nick.text };
  const existing = await GameScore.findOne(filter, { _id: 0, score: 1 }).lean().maxTimeMS(DB_TIMEOUT_MS);
  const improved = !existing || score > existing.score;
  if (improved) {
    try {
      await GameScore.updateOne(filter, { $max: { score }, $set: { updatedAt: now, visitor: visitorOf(ip) } }, { upsert: true });
    } catch (error) {
      // 같은 닉네임이 동시에 올라오면 한쪽이 중복 키로 실패한다: 이미 있는 줄에 다시 맞춘다
      if (error?.code !== 11000) throw error;
      await GameScore.updateOne(filter, { $max: { score } });
    }
    boardCache.delete(`${game}|${week}`);
  }
  const best = existing ? Math.max(existing.score, score) : score;
  const above = await GameScore.countDocuments({ game, week, score: { $gt: best } }).maxTimeMS(DB_TIMEOUT_MS);
  return { rank: above + 1, value: valueOf(game, best), improved };
}

// ---------------- 전광판 ----------------

const MESSAGE_MAX = 40;
const NAME_MAX = 12;
const SHOW_MS = 24 * 60 * 60 * 1000;
const SHOW_COUNT = 20;
const POST_GAP_MS = 2 * 60 * 1000;
const DAILY_POSTS = 10;
const FLOOD_WINDOW_MS = 10 * 60 * 1000;
const FLOOD_MAX = 30;
/** @type {Map<string, { last: number, day: string, count: number }>} */
const posters = new Map();
let flood = { start: 0, count: 0 };
/** @type {{ at: number, messages: any[] } | null} */
let messageCache = null;

const toMessage = (doc) => ({ id: String(doc._id), name: doc.name || "", text: doc.text, at: doc.createdAt });

/** 24시간 안의 최근 글 20개(10초 보관). */
async function megaphones(now = new Date()) {
  if (!isMongoConnected()) return { messages: [] };
  if (messageCache && now.getTime() - messageCache.at < 10 * 1000) return { messages: messageCache.messages };
  const docs = await Megaphone.find({ hidden: { $ne: true }, createdAt: { $gte: new Date(now.getTime() - SHOW_MS) } }, { visitor: 0, hidden: 0 })
    .sort({ createdAt: -1 })
    .limit(SHOW_COUNT)
    .lean()
    .maxTimeMS(DB_TIMEOUT_MS);
  messageCache = { at: now.getTime(), messages: docs.map(toMessage) };
  return { messages: messageCache.messages };
}

/** 전광판 글 쓰기. → { message } */
async function postMegaphone({ name, text, ip, now = new Date() }) {
  if (!isMongoConnected()) throw new ArcadeError(503, "DB", "지금은 글을 받을 수 없어요.");
  const message = checkMessage(text, MESSAGE_MAX);
  if (!message.ok) throw new ArcadeError(400, "TEXT", REASON_TEXT[message.reason]);
  let nick = "";
  if (String(name || "").trim()) {
    const checked = checkNickname(name, NAME_MAX);
    if (!checked.ok) throw new ArcadeError(400, "NAME", `이름: ${REASON_TEXT[checked.reason]}`);
    nick = checked.text;
  }

  const time = now.getTime();
  const visitor = visitorOf(ip);
  const day = kstDate(now);
  const state = posters.get(visitor);
  if (state && time - state.last < POST_GAP_MS) throw new ArcadeError(429, "WAIT", "2분에 한 번 쓸 수 있어요.");
  if (state && state.day === day && state.count >= DAILY_POSTS) throw new ArcadeError(429, "DAILY", `하루에 ${DAILY_POSTS}번까지 쓸 수 있어요.`);
  if (time - flood.start > FLOOD_WINDOW_MS) flood = { start: time, count: 0 };
  if (flood.count >= FLOOD_MAX) throw new ArcadeError(429, "BUSY", "지금은 글이 많아요. 잠시 뒤에 써 주세요.");
  const recent = (await megaphones(now)).messages;
  if (recent.some((entry) => entry.text === message.text)) throw new ArcadeError(400, "SAME", "같은 글이 이미 떠 있어요.");

  const doc = await Megaphone.create({ name: nick, text: message.text, visitor, createdAt: now });
  flood.count += 1;
  posters.set(visitor, { last: time, day, count: state && state.day === day ? state.count + 1 : 1 });
  // 하루 지난 방문자 기록은 지운다
  if (posters.size > 5000) for (const [key, entry] of posters) if (entry.day !== day) posters.delete(key);
  messageCache = null;
  return { message: toMessage(doc.toObject()) };
}

// ---------------- 오늘의 운세 ----------------

const fortuneCache = new TtlLruCache({ maxEntries: 5000, maxBytes: 4 * 1024 * 1024 });

/** 오늘의 운세 + 행운의 장비(모은 장신구 중 seed 로 고른 하나). */
async function fortune({ world, name, now = new Date() }) {
  const date = kstDate(now);
  const key = `${world}|${name}|${date}`;
  const hit = fortuneCache.get(key);
  if (hit) return hit;
  const { pick, ...result } = fortuneOf({ world, name, date });
  let item = null;
  if (isMongoConnected()) {
    const slot = ACCESSORY_SLOTS[pick.slot % ACCESSORY_SLOTS.length];
    const doc = await EquipmentItem.findOne(
      { slot, family: "", scoreVersion: SCORE_VERSION },
      { _id: 0, characterName: 1, worldName: 1, starforce: 1, itemName: 1, "item.item_icon": 1, "item.item_grade": 1 }
    )
      .sort({ score: -1 })
      .skip(pick.rank)
      .lean()
      .maxTimeMS(DB_TIMEOUT_MS)
      .catch(() => null);
    if (doc) {
      item = {
        name: doc.itemName,
        icon: doc.item?.item_icon || "",
        grade: doc.item?.item_grade || "",
        star: Number(doc.starforce) || 0,
        owner: { world: doc.worldName, name: doc.characterName }
      };
    }
  }
  const value = { fortune: { ...result, world, name, item } };
  fortuneCache.set(key, value, 6 * 60 * 60 * 1000, 2048);
  return value;
}

module.exports = { ArcadeError, startGame, leaderboard, submitScore, megaphones, postMegaphone, fortune, MESSAGE_MAX, NAME_MAX, NICKNAME_MAX };
