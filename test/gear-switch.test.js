const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const itemSets = require("../src/game-data/item-sets.json");
const starforceSets = require("../src/game-data/starforce-sets.json");
const characterBase = require("../src/game-data/character-base.json");
const enhance = require("../src/game-data/enhance.json");
const db = require("../src/game-data/item-db.json");
const powerRules = require("../src/game-data/combat-power.json");
const { computeItemSets } = require("../src/domain/stats/sources/sets");
const { buildCharacterStats } = require("../src/domain/stats");

const load = () => import("../web/src/lib/gearSwitch.mjs");
const tables = { itemSets, starforceSets, characterBase, enhance };

// 화면 전투력(web/src/lib/efficiency.js combatPower·totalsFromStats)과 같은 식. 그 파일은 JSON import 라 Node 에서 바로 못 읽는다.
const combatPower = (t) =>
  Math.max(t.attack, 1) *
  (t.attackPercent / 100 + powerRules.bossBase * (1 + t.boss / 100)) *
  (1 + t.damage / 100) *
  (powerRules.criticalBase + t.critical / 100) *
  (1 + t.finalDamage / 100) *
  Math.pow(Math.max(t.maxDamage, 1) / powerRules.maxDamageReference, powerRules.maxDamageExponent);
const totalsOf = (majorStats, attackType) => {
  const read = (key) => Number(majorStats?.[key]?.value) || 0;
  const magic = attackType === "magical";
  return {
    attack: read(magic ? "magicalAttack" : "physicalAttack"),
    attackPercent: read(magic ? "magicalAttackPercent" : "physicalAttackPercent"),
    damage: read(magic ? "magicalDamagePercent" : "physicalDamagePercent"),
    boss: read("bossDamage"),
    critical: read("criticalDamage"),
    finalDamage: read("finalDamage"),
    maxDamage: read("maxDamage")
  };
};

const lines = (list) => (list || []).map((option) => ({ name: option.option_name, value: option.option_value }));
/** 넥슨 원본 장비 → 화면 장비 모양(src/controllers/maplestorym.controller.js mapEquipmentItemForView 의 필요한 칸) */
const view = (item) => ({
  itemName: item.item_name,
  slotName: item.item_equipment_slot_name,
  pageName: item.item_equipment_page_name,
  itemGrade: item.item_grade,
  starforceUpgrade: item.starforce_upgrade ?? "-",
  basicOption: lines(item.item_basic_option),
  additionalOption: lines(item.item_additional_option),
  potentialOption: lines(item.item_potential_option),
  additionalPotentialOption: lines(item.item_additional_potential_option),
  soulInfo: { soulName: item.soul_info?.soul_name || "", soulOption: item.soul_info?.soul_option || "" },
  emblemInfo: item.emblem_info || null
});

/** 고정 데이터 캐릭터의 보스 세팅 장비(넥슨 원본·화면 모양)와 합계 */
function bossSetting(name) {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "characters", `${name}.json`), "utf8"));
  const stats = buildCharacterStats(raw.details);
  const presetNo = stats.statSetting.dimensions.find((dim) => dim.key === "equipment").boss;
  const data = raw.details.itemEquipment.data;
  const rawItems = (data.equipment_preset || [])
    .find((preset) => Number(preset.preset_no) === Number(presetNo))
    .item_equipment.filter((item) => item.item_name);
  const attackType = stats.statSetting.attackType;
  return { rawItems, items: rawItems.map(view), attackType, totals: totalsOf(stats.majorStats, attackType) };
}

const sumByKey = (contributions) => {
  const out = {};
  for (const entry of contributions) out[entry.key] = Math.round(((out[entry.key] || 0) + entry.value) * 1e6) / 1e6;
  return out;
};
const rounded = (stats) => Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, Math.round(value * 1e6) / 1e6]));

test("갈아타기: 세트 효과는 서버(sets.js)와 같은 값 — 앱솔 7세트 261성(몬밀), 아케인 7세트 280성(피카츄)", async () => {
  const { setStats } = await load();
  for (const name of ["스카니아-몬밀", "유니온-피카츄", "스카니아-디올"]) {
    const { rawItems, items } = bossSetting(name);
    const server = sumByKey(computeItemSets(rawItems).contributions.filter((entry) => !String(entry.setId || "").startsWith("cash:")));
    assert.deepEqual(rounded(setStats(items, tables).stats), server, name);
  }
  const { items } = bossSetting("스카니아-몬밀");
  const result = setStats(items, tables);
  assert.equal(result.counts.absolab, 7);
  assert.equal(result.stars.absolab, 261);
});

const piece = (itemName, slotName, star) => ({ itemName, slotName, itemGrade: "레전더리", starforceUpgrade: String(star) });
const absolab = [
  piece("앱솔랩스 시프캡", "모자", 34),
  piece("앱솔랩스 시프슈트", "한벌옷", 34),
  piece("앱솔랩스 시프케이프", "망토", 34),
  piece("앱솔랩스 시프숄더", "어깨", 34),
  piece("앱솔랩스 시프글러브", "장갑", 34),
  piece("앱솔랩스 시프슈즈", "신발", 34)
];

test("갈아타기: 7/30 세트옵션 보정 — 아케인 1종은 앱솔 1종 + 그 별을 앱솔 합에, 2종부터 보정 해제", async () => {
  const { setStats } = await load();
  const one = setStats([...absolab.slice(1), piece("아케인셰이드 시프햇", "모자", 17)], tables);
  assert.equal(one.counts.absolab, 6, "앱솔 5 + 빌린 아케인 1");
  assert.equal(one.counts.arcane, undefined);
  assert.equal(one.stars.absolab, 34 * 6 + 17, "한벌옷 두 배 + 아케인 ★17");
  assert.equal(one.borrowed, true);
  const two = setStats([...absolab.slice(2), piece("아케인셰이드 시프햇", "모자", 17), piece("아케인셰이드 시프슈트", "한벌옷", 17)], tables);
  assert.equal(two.counts.absolab, 4);
  assert.equal(two.counts.arcane, 2);
  assert.equal(two.stars.arcane, 17 * 3);
  assert.equal(two.borrowed, false);
  // 앱솔랩스가 없으면 보정도 없다
  assert.equal(setStats([piece("아케인셰이드 시프햇", "모자", 17)], tables).borrowed, false);
  // 제네시스 무기(럭키): 3개 이상 모인 무기 칸 세트마다 +1, 별도 더한다
  const lucky = setStats(
    [...absolab.slice(0, 3).map((item) => ({ ...item, itemName: item.itemName.replace("앱솔랩스", "아케인셰이드") })), piece("제네시스 대거", "무기", 35)],
    tables
  );
  assert.equal(lucky.counts.arcane, 4);
  assert.equal(lucky.stars.arcane, 34 * 4 + 35);
});

test("갈아타기: 앱솔 → 아케인 한 칸은 보정으로 세트 손해가 없고, 전수(지금 별·잠재 그대로)면 전투력도 그대로", async () => {
  const { switchTargets, breakEven, headlineRow } = await load();
  const { items, attackType, totals } = bossSetting("스카니아-몬밀");
  const hat = items.find((item) => item.slotName === "모자");
  const targets = switchTargets(db, [hat]);
  assert.equal(targets[0].name, "아케인셰이드 파이렛햇", "같은 직업 이름의 아케인 모자");
  assert.deepEqual(
    targets[0].stars,
    Array.from({ length: 26 }, (_, star) => star),
    "★0~25"
  );
  const boss = (value) => [{ name: "보스 공격력", value }];
  const levels = [
    [
      { key: "q25", label: "하위 25%", potential: [], additionalPotential: boss("4%") },
      { key: "q50", label: "중간", potential: [], additionalPotential: boss("8%") },
      { key: "q75", label: "상위 25%", potential: [], additionalPotential: boss("24%") }
    ]
  ];
  const result = breakEven({ totals, items, targets, levels, attackType, tables, combatPower });
  assert.ok(Math.abs(result.transfer.ratio) < 1e-12, `전수: ${result.transfer.ratio}`);
  assert.equal(result.sets.borrowed, true);
  assert.equal(result.sets.arcaneOn, false);
  assert.ok(result.lowest.ratio < 0, "★0·잠재 없음이면 손해(앱솔 합 261 → 241)");
  const [none, low, middle, high] = result.rows;
  // 지금 모자 에디 보공 6.8%: 없음·4% 는 ★25여도 못 넘고, 8% 는 앱솔 245 구간(★4)부터, 24% 는 더 낮은 별부터
  assert.equal(none.found, null);
  assert.equal(low.found, null);
  assert.ok(low.top.ratio < 0);
  assert.equal(middle.found.star, 4);
  assert.ok(middle.found.ratio > 0);
  // ★0→4 평균 횟수(방지권 사용) = 단계마다 1/성공률: 1 + 1/0.95 + 1/0.9 + 1/0.85
  assert.ok(Math.abs(middle.found.tries - (1 + 1 / 0.95 + 1 / 0.9 + 1 / 0.85)) < 1e-9);
  assert.ok(high.found.star <= middle.found.star);
  assert.equal(headlineRow(result).key, "q50");
});

test("갈아타기: 두 칸을 같이 바꾸면 아케인 2세트가 켜지고 보정이 풀린다", async () => {
  const { switchTargets, breakEven } = await load();
  const { items, attackType, totals } = bossSetting("스카니아-몬밀");
  const picked = items.filter((item) => item.slotName === "모자" || item.slotName === "장갑");
  const result = breakEven({ totals, items, targets: switchTargets(db, picked), levels: [[], []], attackType, tables, combatPower });
  assert.equal(result.sets.arcaneOn, true);
  assert.equal(result.sets.borrowed, false);
  assert.equal(result.sets.after.absolab, 5);
  assert.equal(result.sets.after.arcane, 2);
  assert.equal(result.rows.length, 1, "잠재 수준을 모르면 잠재 없음만");
  // 여러 칸은 같은 별로 재고, 범위는 가장 높은 지금 별(장갑 ★35)까지
  assert.equal(result.stars[0], 0);
  assert.equal(result.stars[result.stars.length - 1], 35);
  // 전수(★20·★35 그대로)면 아케인 별 합 55 → 아케인 스타포스 첫 구간이 켜진다
  assert.ok(result.transfer.ratio > 0);
  // 두 칸 강화 횟수는 칸마다 더한다
  const { starCost } = await load();
  const targets = switchTargets(db, picked);
  assert.ok(Math.abs(starCost(targets, 17, enhance).tries - 2 * starCost(targets.slice(0, 1), 17, enhance).tries) < 1e-9);
});

test("갈아타기: 아케인 무기 → 제네시스는 ★35 그대로·해방 최종 대미지 +10%·전수 없음", async () => {
  const { switchTargets, breakEven, switchRatio, NO_POTENTIAL } = await load();
  const { items, attackType, totals } = bossSetting("유니온-피카츄");
  const wand = items.find((item) => item.slotName === "무기");
  const targets = switchTargets(db, [wand]);
  assert.equal(targets[0].family, "제네시스");
  assert.equal(targets[0].name, "제네시스 완드");
  assert.deepEqual(targets[0].stars, [35]);
  const result = breakEven({ totals, items, targets, levels: [[]], attackType, tables, combatPower });
  assert.equal(result.transfer, null, "제네시스는 전수할 수 없다");
  assert.equal(result.genesis, true);
  const keep = { key: "own", potential: wand.potentialOption, additionalPotential: wand.additionalPotentialOption };
  const withLiberation = switchRatio({ totals, items, swaps: [{ target: targets[0], star: 35, level: keep }], attackType, tables, combatPower });
  const without = switchRatio({
    totals,
    items,
    swaps: [{ target: targets[0], star: 35, level: keep }],
    attackType,
    tables: { ...tables, characterBase: { ...characterBase, liberationWeapon: { ...characterBase.liberationWeapon, finalDamage: 0 } } },
    combatPower
  });
  const fd = totals.finalDamage;
  assert.ok(Math.abs((1 + withLiberation) / (1 + without) - (100 + fd + 10) / (100 + fd)) < 1e-9, "해방 최종 대미지 10%는 곱으로");
  assert.ok(withLiberation > 0);
  // 잠재 없이 바로 끼면(★35) 그 값
  assert.equal(result.lowest.star, 35);
  assert.ok(
    Math.abs(
      result.lowest.ratio - switchRatio({ totals, items, swaps: [{ target: targets[0], star: 35, level: NO_POTENTIAL }], attackType, tables, combatPower })
    ) < 1e-12
  );
  // 강화 없이 ★35 → 횟수 0
  const found = result.rows[0].found;
  if (found) assert.equal(found.tries, 0);
});

test("갈아타기: 무기 별이 아이템 DB에 없으면 그 별은 재지 않는다, 바꿀 계열", async () => {
  const { switchTargets, switchRatio, upgradeFamily, levelSlot, NO_POTENTIAL } = await load();
  const gun = {
    itemName: "앱솔랩스 포인팅건",
    slotName: "무기",
    pageName: "총",
    itemGrade: "레전더리",
    starforceUpgrade: "35",
    basicOption: [],
    additionalOption: []
  };
  assert.equal(upgradeFamily(gun), "아케인셰이드");
  assert.equal(upgradeFamily({ itemName: "아케인셰이드 피스톨", slotName: "무기" }), "제네시스");
  assert.equal(upgradeFamily({ itemName: "아케인셰이드 메이지햇", slotName: "모자" }), "");
  assert.equal(upgradeFamily({ itemName: "제네시스 완드", slotName: "무기" }), "");
  assert.equal(levelSlot(gun), "총");
  const [target] = switchTargets(db, [gun]);
  assert.equal(target.name, "아케인셰이드 피스톨");
  assert.deepEqual(target.stars, [35], "피스톨은 ★35·36만 표에 있고 지금 별(35)까지 잰다");
  const totals = { attack: 100000, attackPercent: 100, damage: 100, boss: 100, critical: 100, finalDamage: 50, maxDamage: 1e9 };
  assert.equal(switchRatio({ totals, items: [gun], swaps: [{ target, star: 20, level: NO_POTENTIAL }], attackType: "magical", tables, combatPower }), null);
});
