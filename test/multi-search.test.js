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
  assert.equal(result.hint, "스카니아");
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

test("멀티서치: 꾸민 대화명은 월드·직업·레벨을 빼고 남는 이름(직업 이름뿐이면 뺌), 대화 내용은 안 봄", async () => {
  const { parseNames } = await load();
  const chat = [
    "[🦋 울보루팡 카데나 269 스카] [오후 3:39] 팬텀 무기 전수해서 팔지 그냥 처분할지 고민이네요",
    "[스카 𝓑 푱둉 나로] [오후 3:40] 거래소가격보고정하시는게",
    "[🚀마쎄 스카] [오후 3:40] 문신이면",
    "[🆚️냠도일²⁹ⁿ카데나,팔,엔🥪] [오후 3:40] 마쎄님 체인 사냥용 매물좀요",
    "[🦋 울보루팡 카데나 269 스카] [오후 3:40] 아델 나로 비숍 구해요",
    "[아델] [오후 3:41] 저요",
    "[디올269루나] [오후 3:41] ㅇㅇ"
  ].join("\n");
  const result = parseNames(chat, WORLDS);
  assert.equal(result.fromChat, true);
  assert.deepEqual(result.entries, [
    { world: "스카니아", name: "울보루팡" },
    { world: "스카니아", name: "푱둉" },
    { world: "스카니아", name: "마쎄" },
    { world: "", name: "냠도일" },
    { world: "", name: "디올269루나", alts: ["디올"] }
  ]);
  assert.equal(result.hint, "스카니아");
  // 한 줄만 붙여 넣어도, 여러 줄 메시지의 이어진 줄이 있어도 대화 내용은 안 봄
  const one = parseNames("[🦋 울보루팡 카데나 269 스카] [오후 3:39] 팬텀 무기 전수해서 팔지 그냥 처분할지 고민이네요\n잠재 다 완작인데\n2026년 11월 1일 일요일", WORLDS);
  assert.equal(one.fromChat, true);
  assert.deepEqual(one.entries, [{ world: "스카니아", name: "울보루팡" }]);
  // 목록: 직업·레벨·월드가 섞인 줄은 한 사람, 아니면 띄어 쓴 이름마다
  assert.deepEqual(parseNames("몬밀 캡틴 295 스카\n디올 브룩", WORLDS).entries, [
    { world: "스카니아", name: "몬밀" },
    { world: "", name: "디올" },
    { world: "", name: "브룩" }
  ]);
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
