const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeWorldName } = require("../src/config/worlds");

test("live worlds are accepted with Korean or English names", () => {
  assert.equal(normalizeWorldName("스카니아").worldNameCanonical, "스카니아");
  assert.equal(normalizeWorldName("arcane").worldNameCanonical, "아케인");
});

// 챌린저스 ran from 2026-07-30 to 2026-09-30 and its characters were deleted.
test("the closed Challengers world is rejected", () => {
  const result = normalizeWorldName("챌린저스");
  assert.equal(result.ok, false);
  assert.ok(!result.allowedWorldNames.includes("챌린저스"));
});
