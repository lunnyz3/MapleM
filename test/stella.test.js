const test = require("node:test");
const assert = require("node:assert/strict");
const board = require("../src/game-data/stella.json");

const load = () => import("../web/src/lib/stella.mjs");

test("별자리판: 이어진 별만 열리고, 닫으면 끊긴 별도 닫힌다", async () => {
  const { canOpen, toggle } = await load();
  let open = new Set();
  assert.equal(canOpen(board.nodes, open, "pd-b1"), false, "시작 별 전에는 못 연다");
  open = toggle(board.nodes, open, "start");
  open = toggle(board.nodes, open, "pd-b1");
  open = toggle(board.nodes, open, "pd-b2");
  open = toggle(board.nodes, open, "pd-a1");
  assert.deepEqual([...open].sort(), ["pd-a1", "pd-b1", "pd-b2", "start"]);
  open = toggle(board.nodes, open, "pd-b1");
  assert.deepEqual([...open], ["start"], "pd-b1 을 닫으면 그 뒤 별도 닫힌다");
});

test("별자리판: 모두 열면 직접 입력 최대치, 범위 별은 고른 값(안 고르면 가장 작은 값)", async () => {
  const { boardTotals, toManualValues } = await load();
  const all = new Set(board.nodes.map((node) => node.id));
  const picks = Object.fromEntries(board.nodes.filter((node) => node.range).map((node) => [node.id, Math.max(...board.ranges[node.stat])]));
  const { totals, cost } = boardTotals(board.nodes, all, picks, board.ranges);
  assert.deepEqual(toManualValues(totals, board.manualIds), {
    starcorusDamage: 36,
    starcorusAttackPercent: 36,
    starcorusMaxDamage: 550000000,
    starcorusFinalDamage: 40,
    starcorusCriticalDamage: 28,
    starcorusBossDamage: 28
  });
  assert.equal(cost, board.nodes.reduce((sum, node) => sum + node.cost, 0));
  const low = boardTotals(board.nodes, new Set(["start"]), {}, board.ranges).totals;
  assert.equal(low["최대 대미지"], 30000000);
});
