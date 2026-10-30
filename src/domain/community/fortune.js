"use strict";

// 오늘의 운세(순수 함수, 재미용): 월드·캐릭터 이름·서울 날짜로 정해지는 값이라 같은 날에는 몇 번을 봐도 같다.
// 행운의 장비는 서버가 seed 로 모은 장비 중 하나를 고른다(src/services/arcade.service.js).
const crypto = require("crypto");
const bosses = require("../../game-data/boss-entry.json").bosses;

const WORLDS = ["스카니아", "루나", "엘리시움", "크로아", "아케인", "제니스", "유니온"];
const GRADES = ["레어", "에픽", "유니크", "레전더리"];

const TOTAL_LINES = [
  [90, "뭘 해도 되는 날! 미뤄 둔 도전을 오늘 해 보세요."],
  [75, "기분 좋은 하루예요. 보스 한 판 더 가 볼까요?"],
  [60, "무난한 하루예요. 꾸준한 사냥이 답이에요."],
  [45, "조심스러운 하루예요. 큰 도전은 내일로 미뤄요."],
  [0, "쉬어 가는 날이에요. 메소는 지갑에 그대로 두세요."]
];

// 별 1~5개마다 한 줄
const AREA_LINES = {
  starforce: ["강화 버튼은 내일 누르세요.", "한두 번만 눌러 보고 멈추세요.", "올라가긴 하는데 천천히요.", "한 단계쯤은 기대해도 좋아요.", "스타포스 대박 예감!"],
  cube: ["큐브는 아껴 두세요.", "등급은 그대로일 것 같아요.", "옵션 한 줄은 건질 수 있어요.", "좋은 줄이 겹쳐 나올지도요.", "등급 업 냄새가 나요!"],
  hunting: ["사냥보다 정리하는 날.", "짧게 몇 판만.", "평소만큼은 벌어요.", "경험치가 잘 붙는 날이에요.", "레벨 업 각이에요!"],
  boss: ["보스는 다음 주에.", "익숙한 보스만 가세요.", "파티원 운이 따라요.", "처음 잡는 보스도 해 볼 만해요.", "드롭 운이 최고예요!"]
};

const AREAS = [
  { key: "starforce", label: "스타포스" },
  { key: "cube", label: "큐브" },
  { key: "hunting", label: "사냥" },
  { key: "boss", label: "보스" }
];

/** 같은 입력이면 같은 바이트(32개). */
function seedOf(world, name, date) {
  return crypto.createHash("sha256").update(`${world}|${name}|${date}`).digest();
}

/**
 * @param {{ world: string, name: string, date: string }} input date: 서울 날짜 "YYYY-MM-DD"
 */
function fortuneOf({ world, name, date }) {
  const seed = seedOf(world, name, date);
  const total = 30 + (seed.readUInt16BE(0) % 71);
  const areas = AREAS.map((area, index) => {
    // 총운이 높으면 별도 조금 더 잘 나오게
    const stars = Math.min(5, Math.max(1, 1 + (seed[2 + index] % 5) + (total >= 85 ? 1 : 0) - (total < 45 ? 1 : 0)));
    return { key: area.key, label: area.label, stars, line: AREA_LINES[area.key][stars - 1] };
  });
  const boss = bosses[seed[7] % bosses.length];
  return {
    date,
    total,
    line: TOTAL_LINES.find(([min]) => total >= min)[1],
    areas,
    luckyWorld: WORLDS[seed[8] % WORLDS.length],
    luckyGrade: GRADES[seed[9] % GRADES.length],
    luckyNumber: 1 + (seed[10] % 99),
    luckyBoss: `${boss.difficulty} ${boss.name}`,
    // 행운의 장비 고르기(서버): 칸 번호와 그 칸 점수 순서
    pick: { slot: seed[11], rank: seed.readUInt16BE(12) % 300 }
  };
}

module.exports = { fortuneOf, seedOf };
