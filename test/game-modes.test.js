const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// 상단·전체 메뉴의 게임 목록(GAME_MODES)이 오락실 화면의 게임과 같은지
test("오락실 게임 목록: 메뉴(GAME_MODES)와 오락실 화면(GAMES)이 같은 게임", () => {
  const web = path.join(__dirname, "..", "web", "src");
  const lib = fs.readFileSync(path.join(web, "lib", "game.js"), "utf8");
  const block = lib.slice(lib.indexOf("export const GAME_MODES"), lib.indexOf("];", lib.indexOf("export const GAME_MODES")));
  const menu = [...block.matchAll(/value: "([a-z]+)"/g)].map((match) => match[1]);
  const page = fs.readFileSync(path.join(web, "pages", "Game.jsx"), "utf8");
  const games = [...page.matchAll(/\{ mode: "([a-z]+)", title: GAME_TITLE\.([a-z]+)/g)];
  assert.equal(menu.length, 15);
  assert.deepEqual(
    games.map((match) => match[1]),
    menu
  );
  games.forEach((match) => assert.equal(match[1], match[2]));
});
