const test = require("node:test");
const assert = require("node:assert/strict");
const { pageMeta, renderIndex } = require("../src/web/page-meta");

const INDEX = `<html><head>
    <meta name="description" content="old" />
    <title>old</title>
  </head><body></body></html>`;

test("공유 미리보기: 캐릭터 주소는 이름·월드 제목과 저장된 스펙 설명", async () => {
  const meta = await pageMeta("/character/%EC%9C%A0%EB%8B%88%EC%98%A8/%ED%94%BC%EC%B9%B4%EC%B8%84", {
    findSpec: async (world, name) => (world === "유니온" && name === "피카츄" ? { characterLevel: 298, characterClass: "아크메이지(썬,콜)", combatPower: 192215561, itemScore: 1226.5 } : null)
  });
  assert.equal(meta.title, "피카츄 · 유니온 · 메이플M 플러스");
  const max = require("../src/game-data/item-score-max.json").fullSet.max;
  assert.equal(meta.description, `유니온 · Lv.298 · 아크메이지(썬,콜) · 전투력 1억 9,221만 · 템환산 ${((1226.5 / max) * 100).toFixed(1)}점`);
});

test("공유 미리보기: 스펙을 모르거나 조회가 실패하면 기본 설명", async () => {
  const meta = await pageMeta("/character/%EC%9C%A0%EB%8B%88%EC%98%A8/x", { findSpec: async () => { throw new Error("db"); } });
  assert.match(meta.description, /^유니온 x의 장비·스탯/);
});

test("공유 미리보기: 고정 화면·길드·모르는 주소", async () => {
  assert.equal((await pageMeta("/ranking/")).title, "랭킹 · 메이플M 플러스");
  assert.equal((await pageMeta("/")).title, "메이플M 플러스");
  assert.equal((await pageMeta("/guild/%EC%9C%A0%EB%8B%88%EC%98%A8/%EA%B8%B8%EB%93%9C")).title, "길드 · 유니온 길드 · 메이플M 플러스");
  assert.equal((await pageMeta("/nope")).title, "메이플M 플러스");
});

test("공유 미리보기: 제목·설명을 바꾸고 og 태그를 넣으며 글자는 HTML 이스케이프", () => {
  const html = renderIndex(INDEX, { title: `a<b>"c`, description: "d & e", path: "/character/%EC%9C%A0%EB%8B%88%EC%98%A8/%ED%94%BC" });
  assert.match(html, /<title>a&lt;b&gt;&quot;c<\/title>/);
  assert.match(html, /<meta name="description" content="d &amp; e" \/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/maplem\.co\.kr\/character\/%EC%9C%A0%EB%8B%88%EC%98%A8\/%ED%94%BC" \/>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/maplem\.co\.kr\/og\.png" \/>/);
  assert.equal((html.match(/<title>/g) || []).length, 1);
});
