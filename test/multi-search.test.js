const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../web/src/lib/multiSearch.mjs");
const WORLDS = ["스카니아", "루나", "엘리시움"];

test("멀티서치: 줄·쉼표·공백으로 나눈 이름, 월드/이름, 중복·이상한 낱말 빼기, 30명까지", async () => {
  const { parseNames } = await load();
  const result = parseNames("몬밀, Siwwz 브룩\n스카니아/디올\n루나/디올\n몬밀\n!!\n아\n몬밀/캡틴/295", WORLDS);
  assert.deepEqual(result.entries, [
    { world: "", name: "몬밀" },
    { world: "", name: "Siwwz" },
    { world: "", name: "브룩" },
    { world: "스카니아", name: "디올" },
    { world: "루나", name: "디올" }
  ]);
  assert.equal(result.fromChat, false);
  const many = parseNames(Array.from({ length: 35 }, (_, i) => `캐릭${i}`).join(" "), WORLDS);
  assert.equal(many.entries.length, 30);
  assert.equal(many.skipped, 5);
});

test("멀티서치: 카톡 대화는 보낸 사람만(대화명 앞부분)", async () => {
  const { parseNames } = await load();
  const mobile = ["[몬밀/캡틴/295] [오후 3:21] 오늘 칼로스 가실 분", "[디올] [오후 3:22] 저요", "[몬밀/캡틴/295] [오후 3:22] 6시에 모여요", "[브룩(비숍)] [오후 3:23] 저도요"].join("\n");
  const fromMobile = parseNames(mobile, WORLDS);
  assert.equal(fromMobile.fromChat, true);
  assert.deepEqual(
    fromMobile.entries.map((entry) => entry.name),
    ["몬밀", "디올", "브룩"]
  );
  const pc = ["2026. 10. 30. 오후 3:21, 몬밀 : 안녕하세요 반가워요", "2026. 10. 30. 오후 3:22, 디올 : 네 안녕하세요"].join("\n");
  assert.deepEqual(
    parseNames(pc, WORLDS).entries.map((entry) => entry.name),
    ["몬밀", "디올"]
  );
});

test("멀티서치: 들어갈 수 있는 가장 어려운 보스", async () => {
  const { hardestBoss } = await load();
  const bosses = [
    { name: "가", difficulty: "노말", level: 200, power: 100 },
    { name: "나", difficulty: "하드", level: 280, power: 500 },
    { name: "다", difficulty: "하드", level: 200, power: 300 }
  ];
  assert.equal(hardestBoss({ level: 270, power: 600 }, bosses).name, "다");
  assert.equal(hardestBoss({ level: 290, power: 600 }, bosses).name, "나");
  assert.equal(hardestBoss({ level: 290, power: 50 }, bosses), null);
  assert.equal(hardestBoss({ level: 0, power: 600 }, bosses), null);
});
