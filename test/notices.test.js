const test = require("node:test");
const assert = require("node:assert/strict");

const { createNoticesHandler } = require("../src/controllers/notices-v2.controller");

test("공지: 세 목록을 최신순 6개씩, https 주소만 돌려주고 하나가 실패해도 나머지는 보낸다", async () => {
  const rows = (prefix, count) =>
    Array.from({ length: count }, (_, index) => ({ title: `${prefix}${index}`, url: `https://m.nexon.com/${prefix}/${index}`, notice_id: index, date: `2026-10-${String(10 + index).padStart(2, "0")}T10:00+09:00` }));
  const handler = createNoticesHandler({
    hasApiKey: () => true,
    fetchList: async (path) => {
      if (path === "notice-event") throw new Error("down");
      if (path === "notice") return { data: { notice: [...rows("n", 8), { title: "bad", url: "javascript:alert(1)", date: "2026-10-30" }] } };
      return { data: { patch_notice: rows("p", 2) } };
    }
  });
  let body;
  await handler({}, { set() {}, status() { return this; }, json(value) { body = value; } });
  assert.equal(body.ok, true);
  assert.equal(body.notice.length, 6);
  assert.equal(body.notice[0].title, "n7");
  assert.ok(body.notice.every((row) => row.url.startsWith("https://")));
  assert.equal(body.patch.length, 2);
  assert.deepEqual(body.event, []);
});
