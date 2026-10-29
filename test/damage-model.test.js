const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../web/src/lib/damageModel.mjs");
// 피카츄(보스 세팅) 근처 값
const t = { attack: 136380, attackPercent: 506, damage: 725.29, boss: 510.58, critical: 0, finalDamage: 267.6, ignoreDefense: 80 };

test("실전 딜: 보공은 스킬 퍼뎀 400%에 곱해져 전투력 공식보다 훨씬 크다(최종 1% ≈ 보공 2%)", async () => {
  const { damageGain, damageAmountForRatio } = await load();
  const final = damageGain(t, "finalDamage", 1);
  const boss = damageAmountForRatio(t, "boss", final.ratio);
  assert.ok(boss > 1.8 && boss < 2.2, String(boss));
  // 같은 비율로 되짚으면 같은 양
  assert.ok(Math.abs(damageGain(t, "boss", boss).ratio - final.ratio) < 1e-12);
});

test("실전 딜: 방무는 곱으로 더하고(80% + 50% = 90%), 같은 효과 방무 양을 되짚는다", async () => {
  const { raise, damageGain, damageAmountForRatio } = await load();
  assert.ok(Math.abs(raise(t, "ignoreDefense", 50).ignoreDefense - 90) < 1e-9);
  const final = damageGain(t, "finalDamage", 1);
  const ied = damageAmountForRatio(t, "ignoreDefense", final.ratio);
  assert.ok(Math.abs(damageGain(t, "ignoreDefense", ied).ratio - final.ratio) < 1e-9);
});

test("실전 딜: 도핑은 합계에 더한다(기본 5종·맥피)", async () => {
  const { withDoping, DEFAULT_DOPING } = await load();
  const doped = withDoping(t, DEFAULT_DOPING);
  assert.equal(doped.attackPercent, 506 + 30 + 50);
  assert.equal(doped.critical, 0 + 30 + 50);
  assert.equal(doped.boss, 510.58 + 30);
});
