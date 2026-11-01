const test = require("node:test");
const assert = require("node:assert/strict");
const { powerMessage, gearMessage, bestGearEvent, guildMessage, eventsMessage } = require("../src/domain/community/push-messages");

test("알림 문구: 전투력·장비·길드·이벤트", () => {
  assert.deepEqual(powerMessage({ world: "스카니아", name: "몬밀", from: 14523198, to: 15200000 }), {
    title: "몬밀 전투력이 올랐어요",
    body: "1,452만 → 1,520만 (+4.7%)",
    url: "/character/%EC%8A%A4%EC%B9%B4%EB%8B%88%EC%95%84/%EB%AA%AC%EB%B0%80"
  });
  const star = { type: "star", item: "제네시스 해머", fromStar: 34, toStar: 35, reached: true, gain: 2 };
  assert.equal(gearMessage({ world: "스카니아", name: "압살", event: star }).title, "압살 제네시스 해머 ★35 달성!");
  assert.equal(gearMessage({ world: "스카니아", name: "압살", event: { type: "option", item: "반지", gain: 3.1 } }).body, "스카니아 · 템환산 +3.1");
  assert.equal(gearMessage({ world: "루나", name: "가", event: { type: "new", item: "칠흑 펜던트", toStar: 0 } }).body, "루나 · 칠흑 펜던트");
  assert.equal(bestGearEvent([{ gain: 9 }, { gain: 1, reached: true }, { gain: 5 }]).reached, true);
  assert.equal(bestGearEvent([]), null);
  const guild = guildMessage({ world: "스카니아", guild: "레전드", joined: ["a", "b", "c", "d"], left: ["e"] });
  assert.equal(guild.body, "들어옴 4명(a, b, c 외 1명) · 나감 1명(e)");
  assert.ok(guild.url.endsWith("#roster"));
  assert.deepEqual(eventsMessage([{ name: "가" }, { name: "나" }]), { title: "내일 끝나는 이벤트 2개", body: "가, 나", url: "/events" });
});
