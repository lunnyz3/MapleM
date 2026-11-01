"use strict";

// 즐겨찾기 알림(웹 푸시): 구독 저장, 따라가는 캐릭터·길드 소식 보내기. 같은 날 같은 구독·같은 캐릭터(길드)는 한 번만
// (메모리, 서버를 다시 켜면 그날 한 번 더 갈 수 있다). 푸시 서버가 404·410 이면 구독을 지운다. 보내기는 응답을 막지 않는다.
const crypto = require("crypto");
const mongoose = require("mongoose");
const webpush = require("web-push");
const { env } = require("../config/env");
const { PushSubscription } = require("../models/push-subscription.model");

const MAX_FOLLOWS = 30;
const SEND_TTL_SECONDS = 12 * 60 * 60;
const WORKERS = 4;
let configured = false;
const sentToday = new Map();

const isMongoConnected = () => mongoose.connection.readyState === 1;
const kstDate = (now = Date.now()) => new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

function isEnabled() {
  if (!env.vapidPublicKey || !env.vapidPrivateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    configured = true;
  }
  return true;
}

const cleanList = (list) =>
  (Array.isArray(list) ? list : [])
    .map((entry) => ({ world: String(entry?.world || "").trim().slice(0, 12), name: String(entry?.name || "").trim().slice(0, 24) }))
    .filter((entry) => entry.world && entry.name)
    .slice(0, MAX_FOLLOWS);

/** 구독(새로 또는 따라가는 목록 고침). subscription: 브라우저 PushSubscription.toJSON() */
async function saveSubscription({ subscription, follows, events = true, now = new Date() }) {
  const endpoint = String(subscription?.endpoint || "");
  const p256dh = String(subscription?.keys?.p256dh || "");
  const auth = String(subscription?.keys?.auth || "");
  if (!/^https:\/\/[^\s]{10,800}$/.test(endpoint) || !/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(auth)) return null;
  if (!isMongoConnected()) return null;
  const clean = { characters: cleanList(follows?.characters), guilds: cleanList(follows?.guilds) };
  await PushSubscription.updateOne(
    { endpoint },
    { $set: { keys: { p256dh, auth }, follows: clean, events: Boolean(events), updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  return clean;
}

async function removeSubscription(endpoint) {
  if (!isMongoConnected() || !endpoint) return;
  await PushSubscription.deleteOne({ endpoint: String(endpoint) });
}

/** 같은 날 같은 구독에 같은 key 는 한 번만 */
function firstToday(endpoint, key) {
  const day = kstDate();
  const id = `${crypto.createHash("sha1").update(endpoint).digest("base64url")}|${key}`;
  if (sentToday.get(id) === day) return false;
  if (sentToday.size > 50000) for (const [old, date] of sentToday) if (date !== day) sentToday.delete(old);
  sentToday.set(id, day);
  return true;
}

/** 구독들에 하나씩 보낸다. payload: { title, body, url, tag } */
async function sendAll(subscriptions, payload, key) {
  if (!isEnabled()) return 0;
  const queue = subscriptions.filter((row) => firstToday(row.endpoint, key));
  let sent = 0;
  const worker = async () => {
    while (queue.length) {
      const row = queue.shift();
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: row.keys }, JSON.stringify(payload), { TTL: SEND_TTL_SECONDS });
        sent += 1;
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) await removeSubscription(row.endpoint).catch(() => {});
      }
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  return sent;
}

/** 따라가는 캐릭터 소식(하루에 캐릭터마다 한 번) */
async function notifyCharacter({ worldName, characterName, title, body, url }) {
  if (!isEnabled() || !isMongoConnected() || !worldName || !characterName) return 0;
  const subscriptions = await PushSubscription.find(
    { "follows.characters": { $elemMatch: { world: worldName, name: characterName } } },
    { _id: 0, endpoint: 1, keys: 1 }
  ).lean();
  if (!subscriptions.length) return 0;
  return sendAll(subscriptions, { title, body, url, tag: `char-${worldName}-${characterName}` }, `char|${worldName}|${characterName}`);
}

/** 따라가는 길드 소식(하루에 길드마다 한 번) */
async function notifyGuild({ worldName, guildName, title, body, url }) {
  if (!isEnabled() || !isMongoConnected()) return 0;
  const subscriptions = await PushSubscription.find(
    { "follows.guilds": { $elemMatch: { world: worldName, name: guildName } } },
    { _id: 0, endpoint: 1, keys: 1 }
  ).lean();
  if (!subscriptions.length) return 0;
  return sendAll(subscriptions, { title, body, url, tag: `guild-${worldName}-${guildName}` }, `guild|${worldName}|${guildName}`);
}

/** 이벤트 종료 알림을 켠 구독 모두에(하루 한 번) */
async function notifyEvents({ title, body, url }) {
  if (!isEnabled() || !isMongoConnected()) return 0;
  const subscriptions = await PushSubscription.find({ events: true }, { _id: 0, endpoint: 1, keys: 1 }).lean();
  return sendAll(subscriptions, { title, body, url, tag: "events" }, "events");
}

/** 방금 켠 브라우저에만 확인 알림 */
async function sendTest(endpoint) {
  if (!isEnabled() || !isMongoConnected()) return false;
  const row = await PushSubscription.findOne({ endpoint: String(endpoint || "") }, { _id: 0, endpoint: 1, keys: 1 }).lean();
  if (!row) return false;
  return (await sendAll([row], { title: "메이플M 플러스 알림이 켜졌어요", body: "즐겨찾기 캐릭터·길드 소식을 알려 드릴게요.", url: "/my", tag: "hello" }, `hello|${Date.now()}`)) > 0;
}

module.exports = { isEnabled, saveSubscription, removeSubscription, notifyCharacter, notifyGuild, notifyEvents, sendTest, kstDate };
