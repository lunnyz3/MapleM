"use strict";

// 캐릭터 궁합(순수 함수, 재미용): 두 캐릭터(월드·이름)로 정해지는 20~100점(순서를 바꿔도 같다)과,
// 모은 스펙이 있으면 실제 비교 몇 줄(같은 월드·직업, 물리·마법, 전투력·레벨 차이).
const crypto = require("crypto");

const LINES = [
  [95, "환상의 짝꿍! 보스 파티 고정이 확정이에요."],
  [80, "손발이 척척 맞아요. 같이 사냥하면 시간 가는 줄 몰라요."],
  [60, "무난한 사이예요. 가끔 같이 보스 가면 좋아요."],
  [40, "조금 어색하지만 금방 친해질 수 있어요."],
  [0, "아직은 서먹서먹. 길드 채팅부터 시작해 볼까요?"]
];

const keyOf = (who) => `${who.world}|${who.name}`;

/** 20~100(두 캐릭터 순서와 상관없이 같다) */
function matchScore(a, b) {
  const [x, y] = [keyOf(a), keyOf(b)].sort();
  const seed = crypto.createHash("sha256").update(`${x}#${y}`).digest();
  return 20 + (seed.readUInt16BE(0) % 81);
}

const lineOf = (score) => LINES.find(([min]) => score >= min)[1];

/**
 * 실제 비교 줄(최대 4개). spec: { world, name, className, level, power, attackType } | null
 */
function matchPoints(a, b) {
  const points = [];
  points.push(a.world === b.world ? `둘 다 ${a.world} 월드라 바로 만날 수 있어요.` : `${a.world}와 ${b.world}, 월드가 달라 아쉬워요.`);
  if (a.className && b.className) {
    if (a.className === b.className) points.push(`같은 ${a.className}끼리 통하는 게 많아요.`);
    else if (a.attackType && b.attackType && a.attackType !== b.attackType) points.push("물리·마법이 섞여 균형이 좋아요.");
    else points.push(`${a.className}와 ${b.className}의 만남이에요.`);
  }
  if (a.power > 0 && b.power > 0) {
    const [strong, weak] = a.power >= b.power ? [a, b] : [b, a];
    const ratio = strong.power / weak.power;
    // 수십 배 차이는 한쪽이 사냥 프리셋으로 잰 값일 때가 많아 말하지 않는다
    if (ratio <= 20) points.push(ratio < 1.15 ? "전투력이 비슷해서 막상막하예요." : `${strong.name}님이 전투력 ${Math.round(ratio * 10) / 10}배로 든든하게 이끌어요.`);
  }
  if (a.level > 0 && b.level > 0) {
    const gap = Math.abs(a.level - b.level);
    points.push(gap <= 3 ? "레벨도 비슷해요." : `${a.level > b.level ? a.name : b.name}님이 ${gap}레벨 선배예요.`);
  }
  return points.slice(0, 4);
}

module.exports = { matchScore, matchPoints, lineOf };
