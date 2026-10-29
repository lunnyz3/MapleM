const test = require("node:test");
const assert = require("node:assert/strict");
const { weights } = require("../src/game-data/item-score.json");

const load = () => import("../web/src/lib/sectionScore.mjs");
const bucket = [
  [{ option: "마법 대미지", value: "20.70%" }, { option: "최대 HP", value: "5000" }],
  [{ option: "마법 대미지", value: "18.20%" }, { option: "보스 공격력", value: "16.00%" }],
  [{ option: "마법 대미지", value: "18.20%" }, { option: "보스 공격력", value: "16.00%" }]
];

test("묶음 점수: 줄별 최고 줄이 100점, 딜과 상관없는 옵션은 0점, 다른 직업 계열은 0점", async () => {
  const { cubeSectionScore, lineScore } = await load();
  const best = cubeSectionScore({ weights, side: "magical", lines: [{ name: "마법 대미지", value: "20.70%" }, { name: "마법 대미지", value: "18.20%" }, { name: "마법 대미지", value: "18.20%" }], bucket });
  assert.equal(Math.round(best.score), 100);
  const hp = cubeSectionScore({ weights, side: "magical", lines: [{ name: "최대 HP", value: "5000" }, { name: "최대 HP", value: "5000" }, { name: "최대 HP", value: "5000" }], bucket });
  assert.equal(hp.score, 0, "딜 옵션이 있는 부위에서 HP 줄은 0점");
  // 딜 옵션이 없는 부위(모자 잠재처럼): 줄마다 그 옵션 최고 수치 대비
  const hatBucket = [[{ option: "최대 HP", value: "16,589" }, { option: "최대 HP", value: "10,000" }], [{ option: "최대 HP", value: "13,000" }], [{ option: "최대 HP", value: "13,000" }]];
  const hat = cubeSectionScore({ weights, side: "magical", lines: [{ name: "최대 HP", value: "15,483" }, { name: "최대 HP", value: "13,000" }, { name: "최대 HP", value: "6,500" }], bucket: hatBucket });
  assert.equal(hat.basis, "value");
  assert.equal(Math.round(hat.score), Math.round(((15483 / 16589 + 1 + 0.5) / 3) * 100));
  assert.equal(lineScore(weights, "물리 대미지", "20%", "magical"), 0);
  assert.ok(Math.abs(lineScore(weights, "마법 공격력", "1,000", "magical") - 1000 * weights.attack) < 1e-9);
  assert.ok(Math.abs(lineScore(weights, "마법 공격력", "3%", "magical") - 3 * weights.attackPercent) < 1e-9);
});

test("추옵 점수: 가장 좋은 옵션 최댓값 × 2줄이 100점", async () => {
  const { flameSectionScore, scoreTier } = await load();
  const options = [{ option: "최종 대미지 증가", max: 6.3, percent: true }, { option: "마법공격력", max: 1931, percent: false }];
  // 마법공격력 1,931(9.15점)이 최종 6.3%(8.96점)보다 커서 공격력 2줄이 100점
  const attack = flameSectionScore({ weights, side: "magical", lines: [{ name: "마법공격력", value: "1931" }, { name: "마법 공격력", value: "1,931" }], options });
  assert.equal(Math.round(attack.score), 100);
  const final = flameSectionScore({ weights, side: "magical", lines: [{ name: "최종 대미지", value: "6.30%" }, { name: "최종 대미지", value: "6.30%" }], options });
  assert.equal(Math.round(final.score), 98);
  assert.equal(scoreTier(95), "top");
  assert.equal(scoreTier(10), "low");
});
