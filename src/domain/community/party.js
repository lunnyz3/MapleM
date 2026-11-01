"use strict";

// 보스 파티 모집(순수 함수): 글 입력 검사, 지원자 입장 판정, 화면에 내보낼 모양(관리 키 해시는 뺀다).
const { checkMessage, REASON_TEXT } = require("./text-filter");

const NAME = /^[가-힣A-Za-z0-9]{2,12}$/;
const NOTE_MAX = 60;
const LIFE_MS = 3 * 24 * 60 * 60 * 1000;
const AFTER_START_MS = 6 * 60 * 60 * 1000;

class PartyInputError extends Error {}

/**
 * @param {{ boss?: { name: string, difficulty: string }, minPower?: any, slots?: any, startsAt?: any, note?: any }} input
 * @param {Array<{ name: string, difficulty: string, level: number, power: number }>} bosses
 * @returns {{ boss: any, minPower: number, slots: number, startsAt: Date | null, note: string, expiresAt: Date }}
 */
function cleanPostInput(input, bosses, now = new Date()) {
  const boss = bosses.find((entry) => entry.name === input?.boss?.name && entry.difficulty === input?.boss?.difficulty);
  if (!boss) throw new PartyInputError("보스를 골라 주세요.");
  const minPower = Math.round(Number(input?.minPower) || boss.power);
  if (minPower < boss.power || minPower > boss.power * 20) throw new PartyInputError("조건 전투력이 올바르지 않아요.");
  const slots = Math.round(Number(input?.slots) || 6);
  if (slots < 2 || slots > 6) throw new PartyInputError("파티 인원은 2~6명이에요.");
  let startsAt = null;
  if (input?.startsAt) {
    startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < now.getTime() - 60 * 60 * 1000 || startsAt.getTime() > now.getTime() + LIFE_MS) {
      throw new PartyInputError("시간은 지금부터 3일 안으로 골라 주세요.");
    }
  }
  let note = "";
  if (String(input?.note || "").trim()) {
    const checked = checkMessage(input.note, NOTE_MAX);
    if (!checked.ok) throw new PartyInputError(REASON_TEXT[checked.reason] || "쓸 수 없는 내용이에요.");
    note = checked.text;
  }
  const expiresAt = new Date(Math.min(now.getTime() + LIFE_MS, startsAt ? startsAt.getTime() + AFTER_START_MS : Infinity));
  return { boss: { name: boss.name, difficulty: boss.difficulty, level: boss.level, power: boss.power }, minPower, slots, startsAt, note, expiresAt };
}

/** 지원자(또는 글쓴이)가 이 파티 조건을 넘는지: ok | level | power | unknown */
function entryStatus(member, post) {
  if (!(member?.level > 0)) return "unknown";
  if (member.level < post.boss.level) return "level";
  if (!(member.power > 0)) return "unknown";
  return member.power >= post.minPower ? "ok" : "power";
}

const person = (row) => ({ name: row.name, className: row.className || "", level: row.level || 0, power: row.power || 0, status: row.status, at: row.at });

/** 화면에 내보낼 모양(관리 키 해시·방문자는 뺀다) */
function publicPost(doc) {
  return {
    id: String(doc._id),
    world: doc.world,
    boss: doc.boss,
    minPower: doc.minPower,
    slots: doc.slots,
    startsAt: doc.startsAt || null,
    note: doc.note || "",
    closed: Boolean(doc.closed),
    host: person(doc.host),
    applicants: (doc.applicants || []).map(person),
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt
  };
}

module.exports = { cleanPostInput, entryStatus, publicPost, PartyInputError, NAME };
