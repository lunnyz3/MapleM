"use strict";

// 방문자가 쓰는 짧은 글(전광판 글, 게임 랭킹 닉네임) 검사(순수 함수). 누구에게나 보이므로 욕설·링크·전화번호·도배를 막는다.

// 띄어쓰기·기호를 뺀 뒤 찾는 낱말(초성 줄임말 포함)
const BANNED = [
  "시발",
  "씨발",
  "씨바",
  "씨빨",
  "시빨",
  "ㅅㅂ",
  "ㅆㅂ",
  "ㅄ",
  "병신",
  "븅신",
  "빙신",
  "ㅂㅅ",
  "좆",
  "존나",
  "ㅈㄴ",
  "개새",
  "개색",
  "새끼",
  "ㅅㄲ",
  "느금",
  "니애미",
  "니에미",
  "애미",
  "에미뒤",
  "엠창",
  "꺼져",
  "닥쳐",
  "ㄲㅈ",
  "ㄷㅊ",
  "섹스",
  "ㅗㅗ",
  "fuck",
  "shit",
  "bitch",
  "sex"
];

const LINK = /(https?:|www\.|\.(com|net|org|kr|io|gg|me|ly|co|xyz|site|shop)\b|open\s*\.?\s*kakao|discord\s*\.?\s*gg|t\.me\/|오픈\s*채팅|오픈톡)/i;
const PHONE = /0\s*1\s*[016789][\s.-]*\d{3,4}[\s.-]*\d{4}/;
const REPEAT = /(.)\1{5,}/u;

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** 비교용: 소문자, 한글·영문·숫자·자음만. */
const compact = (value) => value.toLowerCase().replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z0-9]/g, "");

const length = (value) => [...value].length;

function hasBanned(value) {
  const text = compact(value);
  return BANNED.some((word) => text.includes(word));
}

/**
 * 전광판 글 검사.
 * @returns {{ ok: true, text: string } | { ok: false, reason: "empty" | "long" | "link" | "phone" | "repeat" | "banned" }}
 */
function checkMessage(value, max) {
  const text = normalize(value);
  if (!text) return { ok: false, reason: "empty" };
  if (length(text) > max) return { ok: false, reason: "long" };
  if (LINK.test(text)) return { ok: false, reason: "link" };
  if (PHONE.test(text.replace(/[oO]/g, "0"))) return { ok: false, reason: "phone" };
  if (REPEAT.test(text.replace(/\s/g, ""))) return { ok: false, reason: "repeat" };
  if (hasBanned(text)) return { ok: false, reason: "banned" };
  return { ok: true, text };
}

/**
 * 닉네임 검사: 한글·영문·숫자·공백·._- 만, 1~max 자.
 * @returns {{ ok: true, text: string } | { ok: false, reason: "empty" | "long" | "chars" | "banned" }}
 */
function checkNickname(value, max) {
  const text = normalize(value);
  if (!text) return { ok: false, reason: "empty" };
  if (length(text) > max) return { ok: false, reason: "long" };
  if (!/^[가-힣a-zA-Z0-9 ._-]+$/.test(text)) return { ok: false, reason: "chars" };
  if (hasBanned(text)) return { ok: false, reason: "banned" };
  return { ok: true, text };
}

const REASON_TEXT = {
  empty: "내용을 입력해 주세요.",
  long: "글자 수를 넘었어요.",
  link: "링크·주소는 쓸 수 없어요.",
  phone: "전화번호는 쓸 수 없어요.",
  repeat: "같은 글자를 너무 많이 이어 썼어요.",
  banned: "쓸 수 없는 말이 들어 있어요.",
  chars: "한글·영문·숫자만 쓸 수 있어요."
};

module.exports = { checkMessage, checkNickname, normalize, REASON_TEXT };
