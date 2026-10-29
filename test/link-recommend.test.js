const test = require("node:test");
const assert = require("node:assert/strict");
const linkData = require("../src/game-data/link-skills.json");

const load = () => import("../web/src/lib/linkRecommend.mjs");

// 전투력 공식(combat-power.json 과 같은 모양)을 단순하게: 곱셈이라 비율만 본다.
const combatPower = (t) =>
  (t.attack || 1) * ((t.attackPercent || 0) / 100 + 0.3 * (1 + (t.boss || 0) / 100)) * (1 + (t.damage || 0) / 100) * (1.2 + (t.critical || 0) / 100) * (1 + (t.finalDamage || 0) / 100);
const base = { attack: 100000, attackPercent: 400, damage: 500, boss: 400, critical: 350, finalDamage: 200, maxDamage: 1e9 };

test("링크 효과: 공격 타입이 다른 공격력·대미지는 0", async () => {
  const { linkStats } = await load();
  const thief = linkData.selfLinks.find((link) => link.name === "시프 커닝");
  assert.deepEqual(linkStats(thief, 9, "physical"), { attackPercent: 13.5, damage: 2.7 });
  assert.deepEqual(linkStats(thief, 9, "magical"), {});
});

test("링크 추천: 칸 수만큼 전투력이 가장 많이 오르는 순서로 고르고, 전투력에 안 쓰이는 링크·본인 링크는 빼고, 뽑을수록 오름폭이 줄어든다", async () => {
  const { recommendLinks } = await load();
  const result = recommendLinks({ base, links: linkData.selfLinks, attackType: "magical", slots: 6, level: "max", exclude: ["임피리컬 널리지"], combatPower });
  assert.equal(result.picks.length, 6);
  const names = result.picks.map((pick) => pick.name);
  assert.ok(!names.includes("임피리컬 널리지"));
  assert.ok(!names.includes("엘프의 축복")); // 경험치 링크
  assert.ok(!names.includes("시프 커닝")); // 물리 공격력
  for (let i = 1; i < result.picks.length; i += 1) assert.ok(result.picks[i].gain <= result.picks[i - 1].gain + 1e-12);
  const product = result.picks.reduce((value, pick) => value * (1 + pick.gain), 1);
  assert.ok(Math.abs(result.power / result.basePower - product) < 1e-9);
});

test("링크 추천: 레벨 2로 고르면 최대 레벨보다 오름폭이 작고, 최대 레벨을 넘지 않는다", async () => {
  const { recommendLinks } = await load();
  const max = recommendLinks({ base, links: linkData.selfLinks, attackType: "physical", slots: 4, level: "max", combatPower });
  const two = recommendLinks({ base, links: linkData.selfLinks, attackType: "physical", slots: 4, level: 2, combatPower });
  assert.ok(two.power < max.power);
  assert.ok(two.picks.every((pick) => pick.level <= 2));
});

test("링크 추천: 이미 가진 링크는 지금 레벨보다 낮게 추천하지 않는다", async () => {
  const { recommendLinks } = await load();
  const result = recommendLinks({ base, links: linkData.selfLinks, attackType: "physical", slots: 3, level: 2, owned: { "트리 오브 스타라이트": 9 }, combatPower });
  const tree = result.picks.find((pick) => pick.name === "트리 오브 스타라이트");
  assert.ok(tree, "레벨 9 트리 오브 스타라이트가 뽑힌다");
  assert.equal(tree.level, 9);
});
