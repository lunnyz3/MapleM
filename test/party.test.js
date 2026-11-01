const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanPostInput, entryStatus, publicPost, PartyInputError } = require("../src/domain/community/party");

const bosses = [{ name: "감시자 칼로스", difficulty: "하드", level: 268, power: 351320000 }];
const now = new Date("2026-11-01T06:00:00Z");

test("파티 모집 글: 보스·조건 전투력·인원·시간·한마디 검사, 끝나는 때", () => {
  const post = cleanPostInput({ boss: { name: "감시자 칼로스", difficulty: "하드" }, minPower: 400000000, slots: 4, startsAt: "2026-11-01T12:00:00Z", note: "  숙련자만  " }, bosses, now);
  assert.equal(post.minPower, 400000000);
  assert.equal(post.slots, 4);
  assert.equal(post.note, "숙련자만");
  assert.equal(post.expiresAt.toISOString(), "2026-11-01T18:00:00.000Z");
  const plain = cleanPostInput({ boss: { name: "감시자 칼로스", difficulty: "하드" } }, bosses, now);
  assert.equal(plain.minPower, 351320000);
  assert.equal(plain.slots, 6);
  assert.equal(plain.expiresAt.toISOString(), "2026-11-04T06:00:00.000Z");
  const bad = (input, message) => assert.throws(() => cleanPostInput({ boss: { name: "감시자 칼로스", difficulty: "하드" }, ...input }, bosses, now), (error) => error instanceof PartyInputError && error.message.includes(message));
  assert.throws(() => cleanPostInput({ boss: { name: "없는 보스", difficulty: "하드" } }, bosses, now), PartyInputError);
  bad({ minPower: 1000 }, "조건 전투력");
  bad({ slots: 9 }, "2~6명");
  bad({ startsAt: "2026-11-09T00:00:00Z" }, "3일 안");
  bad({ note: "http://spam.example" }, "링크");
});

test("파티 모집: 지원자 입장 판정과 공개 모양", () => {
  const post = { boss: { level: 268, power: 351320000 }, minPower: 400000000 };
  assert.equal(entryStatus({ level: 280, power: 500000000 }, post), "ok");
  assert.equal(entryStatus({ level: 260, power: 900000000 }, post), "level");
  assert.equal(entryStatus({ level: 280, power: 380000000 }, post), "power");
  assert.equal(entryStatus({ level: 280, power: 0 }, post), "unknown");
  const view = publicPost({ _id: "abc", world: "스카니아", boss: {}, minPower: 1, slots: 6, hostKey: "secret", visitor: "v", host: { name: "가", status: "ok" }, applicants: [{ name: "나", key: "k", status: "power" }] });
  assert.equal(view.id, "abc");
  assert.equal(JSON.stringify(view).includes("secret"), false);
  assert.equal(JSON.stringify(view).includes('"k"'), false);
  assert.deepEqual(view.applicants.map((row) => [row.name, row.status]), [["나", "power"]]);
});
