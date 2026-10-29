const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { FLAME_OUTPUTS, OUTPUTS, parseFlamePage, parseLevelRange, splitOfficialKey } = require("../scripts/data/sync-probability");

// public/probability/*.json 은 scripts/data/sync-probability.js 가 공식 '확률형 아이템 정보' 큐브 페이지
// (2026-10-28 기준)에서 만든 파일이다. 공식 표의 줄별 합계는 반올림 때문에 99.99996% ~ 100.06% 이다.
const PROBABILITY_DIR = path.join(__dirname, "..", "public", "probability");
const ITEM_SHARE_FILE = path.join(__dirname, "..", "public", "js", "features", "item-share.js");
const GRADES = ["레어", "에픽", "유니크", "레전더리"];
const LINES = ["first", "second", "third"];
const SUM_TOLERANCE = 0.1;

const cache = new Map();
function readTable(file) {
  if (!cache.has(file)) cache.set(file, JSON.parse(fs.readFileSync(path.join(PROBABILITY_DIR, file), "utf8")));
  return cache.get(file);
}
const tableKeys = (data) => Object.keys(data).filter((key) => key !== "_meta");
const percent = (text) => Number(String(text).replace(/[%,\s]/g, ""));
const squash = (text) => String(text).replace(/\s+/g, "");
const rowsOf = (file, key, grade, line) => readTable(file)[key][grade][line];

let itemSharePromise = null;
// item-share.js 는 브라우저용 ES 모듈이다. common.js 가 불러올 때 document.body 를 읽으므로 최소한의 document 를 두고,
// fetch('/probability/<파일>') 는 public/probability 에서 읽도록 바꾼다.
// package.json 에 "type" 이 없어 Node 가 ES 모듈로 다시 읽으며 MODULE_TYPELESS_PACKAGE_JSON 경고를 낸다.
// 서버 코드는 CommonJS 라 package.json 을 바꾸면 안 되므로, 불러오는 동안만 경고 출력을 막는다.
function importItemShare() {
  if (!itemSharePromise) {
    itemSharePromise = (async () => {
      globalThis.document = globalThis.document || { body: { dataset: {} }, querySelector: () => null };
      globalThis.fetch = async (url) => {
        const name = decodeURIComponent(String(url).replace(/^\/probability\//, ""));
        const file = path.join(PROBABILITY_DIR, name);
        const ok = path.dirname(file) === PROBABILITY_DIR && fs.existsSync(file);
        return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
      };
      const listeners = process.listeners("warning");
      process.removeAllListeners("warning");
      try {
        const mod = await import(pathToFileURL(ITEM_SHARE_FILE).href);
        await new Promise((resolve) => setImmediate(resolve));
        return mod;
      } finally {
        for (const listener of listeners) process.on("warning", listener);
      }
    })();
  }
  return itemSharePromise;
}

async function tableKeyFor(item, sourceType = "potential") {
  const { SLOT_PROBABILITY_CONFIG, classifyProbabilitySlot, resolveTableKey, resolveTableLevel } = await importItemShare();
  const slotKind = classifyProbabilitySlot(item);
  const config = SLOT_PROBABILITY_CONFIG[slotKind];
  assert.ok(config, `확률표 대상 부위가 아님: ${item.slotName}`);
  const file = sourceType === "potential" ? config.potentialFile : config.additionalFile;
  return resolveTableKey(readTable(file), config.keyLabel, resolveTableLevel(item, slotKind, sourceType));
}

test("공식 정정 1: 한벌옷 200 최대 HP는 1683이고 1638은 없다", () => {
  const table = readTable("clothes_potential_prob.json")["한벌옷 200"];
  let rows1683 = 0;
  for (const grade of Object.keys(table)) {
    for (const line of LINES) {
      const hp = table[grade][line].filter((row) => squash(row.option) === "최대HP").map((row) => row.value);
      assert.ok(!hp.includes("1638"), `${grade}/${line}에 1638이 남아 있음`);
      rows1683 += hp.filter((value) => value === "1683").length;
    }
  }
  // 레어 첫째·둘째·셋째 줄, 에픽·유니크·레전더리 둘째·셋째 줄(낮은 등급 수치가 섞이는 줄)
  assert.equal(rows1683, 9);
  assert.match(readTable("clothes_potential_prob.json")._meta.official_notes.join(" "), /1638\s*\S\s*1683/);
});

test("공식 정정 2: 망토 200 유니크 첫째 줄 HP 회복력 확률은 2.41833%", () => {
  const rows = rowsOf("cape_potential_prob.json", "망토 200", "유니크", "first").filter((row) => squash(row.option) === "HP회복력");
  assert.deepEqual(rows.map((row) => row.value), ["140", "135", "130", "125", "120", "118"]);
  for (const row of rows) assert.equal(row.p, "2.41833%");
});

test("공식 정정 3: 모자 180 레전더리 둘째·셋째 줄 보스 공격력(7.90~6.70%) 확률은 0.62500%", () => {
  for (const line of ["second", "third"]) {
    const rows = rowsOf("hat_additional_potential_prob.json", "모자 180", "레전더리", line).filter(
      (row) => squash(row.option) === "보스공격력" && ["7.90%", "7.50%", "7.10%", "6.70%"].includes(row.value),
    );
    assert.equal(rows.length, 4, line);
    for (const row of rows) assert.equal(row.p, "0.62500%", `${line} ${row.value}`);
  }
});

test("모든 표의 줄별 확률 합계가 100%(±0.1%p)이고 둘째·셋째 줄 분포가 같다", () => {
  let lineCount = 0;
  for (const { file } of OUTPUTS) {
    const data = readTable(file);
    assert.ok(tableKeys(data).length > 0, file);
    for (const key of tableKeys(data)) {
      for (const [grade, lines] of Object.entries(data[key])) {
        assert.ok(GRADES.includes(grade), `${file} ${key}: 알 수 없는 등급 ${grade}`);
        assert.deepEqual(Object.keys(lines), LINES, `${file} ${key}/${grade}`);
        assert.deepEqual(lines.second, lines.third, `${file} ${key}/${grade}: second ≠ third`);
        for (const line of LINES) {
          const sum = lines[line].reduce((acc, row) => acc + percent(row.p), 0);
          assert.ok(Math.abs(sum - 100) <= SUM_TOLERANCE, `${file} ${key}/${grade}/${line} 합계 ${sum.toFixed(5)}%`);
          lineCount += 1;
        }
      }
    }
  }
  assert.ok(lineCount > 1000);
});

test("모든 표 키에 레벨이 있다: 한벌옷/상의/하의 에디셔널은 170/180/200으로 나뉜다", () => {
  for (const { file } of OUTPUTS) {
    for (const key of tableKeys(readTable(file))) {
      assert.match(key, /^\S.* \d+$/, `${file}: 레벨 없는 키 '${key}'`);
    }
  }
  const expected = ["170", "180", "200"].flatMap((level) => ["한벌옷", "상의", "하의"].map((label) => `${label} ${level}`));
  for (const file of ["clothes_additional_potential_prob.json", "upper_additional_potential_prob.json", "pants_additional_potential_prob.json"]) {
    assert.deepEqual(tableKeys(readTable(file)), expected, file);
  }
  assert.deepEqual(tableKeys(readTable("assistanceweapon_additional_potential_prob.json")), ["보조무기 180"]);
});

test("엠블렘 잠재능력 표는 에디셔널 표와 다른 공식 6266 표다", () => {
  const potential = readTable("emblem_potential_prob.json");
  const additional = readTable("emblem_additional_potential_prob.json");
  assert.match(potential._meta.source, /\/probability\/6266\?/);
  assert.match(additional._meta.source, /\/probability\/6265\?/);
  assert.deepEqual(tableKeys(potential), ["엠블렘 180", "엠블렘 200", "감시자의 눈 200", "모방된 신의 매듭 200"]);
  for (const key of tableKeys(potential)) {
    assert.ok(additional[key], `에디셔널 파일에 ${key} 없음`);
    assert.notDeepEqual(potential[key], additional[key], `${key}: 잠재와 에디셔널 표가 같음`);
  }
  // 2026-03 실제 응답의 Lv.180 레전더리 엠블렘 잠재 '물리 대미지 5.28%'는 잠재 표에만 있다.
  const has528 = (rows) => rows.some((row) => squash(row.option) === "물리대미지" && row.value === "5.28%");
  assert.ok(has528(potential["엠블렘 180"]["레전더리"].first));
  assert.ok(!has528(additional["엠블렘 180"]["레전더리"].first));
});

test("확률 파일 이름은 <부위>_[additional_]potential_prob.json · <묶음>_flame_prob.json 이고 item-share.js 설정과 일치한다", async () => {
  const files = fs.readdirSync(PROBABILITY_DIR).sort();
  const cubeFiles = files.filter((file) => file.endsWith("potential_prob.json"));
  const flameFiles = files.filter((file) => file.endsWith("_flame_prob.json"));
  for (const file of cubeFiles) {
    assert.match(file, /^[a-z]+_(?:additional_)?potential_prob\.json$/, `파일명 규칙 위반: ${file}`);
  }
  assert.deepEqual(cubeFiles, OUTPUTS.map((output) => output.file).sort());
  assert.deepEqual(flameFiles, FLAME_OUTPUTS.map((output) => output.file).sort());
  assert.deepEqual(files, [...cubeFiles, ...flameFiles, "equipment_mastery.json"].sort());

  const { SLOT_PROBABILITY_CONFIG, FLAME_FILE_BY_SLOT } = await importItemShare();
  const referenced = Object.values(SLOT_PROBABILITY_CONFIG).flatMap((config) => [config.potentialFile, config.additionalFile]);
  assert.equal(referenced.length, 24);
  for (const file of referenced) assert.ok(files.includes(file), `item-share.js 가 없는 파일을 참조: ${file}`);
  assert.equal(SLOT_PROBABILITY_CONFIG.gloves.potentialFile, "gloves_potential_prob.json");
  assert.equal(SLOT_PROBABILITY_CONFIG.gloves.additionalFile, "gloves_additional_potential_prob.json");
  assert.deepEqual(Object.keys(FLAME_FILE_BY_SLOT).sort(), Object.keys(SLOT_PROBABILITY_CONFIG).sort());
  for (const file of Object.values(FLAME_FILE_BY_SLOT)) assert.ok(flameFiles.includes(file), `item-share.js 가 없는 파일을 참조: ${file}`);
});

test("item-share.js 의 레벨 예외 목록이 공식 '잠재옵션 범위' 표와 같다", async () => {
  const { TABLE_LEVEL_EXCEPTIONS } = await importItemShare();
  const official = readTable("weapon_potential_prob.json")._meta.level_exceptions;
  assert.equal(official.length, 12);
  for (const entry of official) {
    const rule = TABLE_LEVEL_EXCEPTIONS.find((candidate) => candidate.equipment === entry.equipment);
    assert.ok(rule, `item-share.js 에 없는 공식 예외: ${entry.equipment}`);
    assert.equal(rule.level ?? null, entry.levels.default, entry.equipment);
    assert.deepEqual(rule.levelBySlot || {}, entry.levels.bySlot, entry.equipment);
    assert.deepEqual(rule.sources, ["potential"], entry.equipment);
  }
  for (const rule of TABLE_LEVEL_EXCEPTIONS.filter((candidate) => candidate.equipment !== "제네시스 무기")) {
    assert.ok(official.some((entry) => entry.equipment === rule.equipment), `공식 표에 없는 예외: ${rule.equipment}`);
  }
  // 부위별 잠재옵션 페이지는 모두 같은 예외 표를 싣는다.
  for (const file of ["clothes_potential_prob.json", "hat_potential_prob.json", "cape_potential_prob.json", "shoes_potential_prob.json", "shoulder_potential_prob.json"]) {
    assert.deepEqual(readTable(file)._meta.level_exceptions, official, file);
  }
  // 제네시스 무기 200 은 표가 아닌 안내 문구로, 잠재옵션·에디셔널 무기 페이지 둘 다에 있다.
  const genesis = TABLE_LEVEL_EXCEPTIONS.find((rule) => rule.equipment === "제네시스 무기");
  assert.equal(genesis.level, 200);
  assert.deepEqual(genesis.sources, ["potential", "additional"]);
  for (const file of ["weapon_potential_prob.json", "weapon_additional_potential_prob.json"]) {
    assert.ok(readTable(file)._meta.official_notes.some((note) => note.includes("제네시스 무기는 장비 레벨 200")), file);
  }
});

test("레벨 표 선택: 예외 장비는 공식 레벨 표, 나머지는 가장 가까운 레벨 표", async () => {
  // 노바 디멘션: 2026-03 실제 응답의 노바 리카온 숄더(Lv.110, 에픽 '물리 대미지 6.42%/6.50%')는 어깨 100 표에만 있는 수치다.
  assert.equal(await tableKeyFor({ itemName: "노바 리카온 숄더", slotName: "어깨", equipmentLevel: 110 }), "어깨 100");
  assert.equal(await tableKeyFor({ itemName: "앱솔랩스 시프숄더", slotName: "어깨", equipmentLevel: 110 }), "어깨 120");
  assert.equal(await tableKeyFor({ itemName: "노바 리카온 클록", slotName: "망토", equipmentLevel: 120 }), "망토 120");
  // 루타비스(Lv.170): 잠재는 160 표, 에디셔널은 예외가 없어 170 표
  assert.equal(await tableKeyFor({ itemName: "파프니르 페니텐시아", slotName: "무기", pageName: "두손검", equipmentLevel: 170 }), "무기 160");
  assert.equal(await tableKeyFor({ itemName: "파프니르 페니텐시아", slotName: "무기", pageName: "두손검", equipmentLevel: 170 }, "additional"), "무기 170");
  assert.equal(await tableKeyFor({ itemName: "하이네스 워리어헬름", slotName: "모자", equipmentLevel: 170 }), "모자 160");
  assert.equal(await tableKeyFor({ itemName: "앱솔랩스 브로드세이버", slotName: "무기", pageName: "두손검", equipmentLevel: 170 }), "무기 180");
  // 제네시스 무기는 레벨 정보가 없어도 200 표(잠재·에디셔널)
  assert.equal(await tableKeyFor({ itemName: "제네시스 그람", slotName: "무기", pageName: "그람", equipmentLevel: "-" }), "무기 200");
  assert.equal(await tableKeyFor({ itemName: "제네시스 그람", slotName: "무기", pageName: "그람", equipmentLevel: "-" }, "additional"), "무기 200");
  // 일반 장비
  assert.equal(await tableKeyFor({ itemName: "펜살리르 배틀글러브", slotName: "장갑", equipmentLevel: 156 }), "장갑 160");
  assert.equal(await tableKeyFor({ itemName: "앱솔랩스 나이트슈트", slotName: "한벌옷", equipmentLevel: 180 }, "additional"), "한벌옷 180");
  assert.equal(await tableKeyFor({ itemName: "테스트 상의", slotName: "상의", equipmentLevel: 200 }, "additional"), "상의 200");
  assert.equal(await tableKeyFor({ itemName: "검은 빛의 학살자 : 도적", slotName: "엠블렘", equipmentLevel: 180 }), "엠블렘 180");
  assert.equal(await tableKeyFor({ itemName: "미트라의 분노 : 전사", slotName: "엠블렘", equipmentLevel: 200 }), "엠블렘 200");
});

test("확률 계산이 새 파일명·엠블렘 표·레벨 예외로 동작한다", async () => {
  const { resolveTopPercentBreakdown } = await importItemShare();
  const physical = { attackType: "physical" };

  // 장갑: 이름을 고친 파일을 읽는다(2026-03 실제 응답 값).
  const gloves = await resolveTopPercentBreakdown(
    {
      itemName: "아케인셰이드 나이트글러브",
      slotName: "장갑",
      equipmentLevel: 200,
      potentialGrade: "4",
      additionalPotentialGrade: "4",
      potentialOption: [{ name: "보스 공격력", value: "18.70%" }, { name: "보스 공격력", value: "18.22%" }, { name: "보스 공격력", value: "17.74%" }],
      additionalPotentialOption: [{ name: "보스 공격력", value: "18.00%" }, { name: "보스 공격력", value: "17.00%" }],
    },
    physical,
  );
  assert.ok(gloves && gloves.potentialProbability > 0 && gloves.additionalProbability > 0);

  // 엠블렘 180 레전더리 첫째 줄 물리대미지 5.28% 이상: 5.70/5.56/5.42/5.28 × 3.60833%
  const emblem = await resolveTopPercentBreakdown(
    {
      itemName: "검은 빛의 학살자 : 도적",
      slotName: "엠블렘",
      equipmentLevel: 180,
      potentialGrade: "4",
      potentialOption: [{ name: "물리 대미지", value: "5.28%" }],
    },
    physical,
  );
  assert.ok(Math.abs(emblem.potentialProbability - (4 * 3.60833) / 100) < 1e-12);

  // 노바 디멘션 어깨(Lv.110): 어깨 100 유니크 첫째 줄에서 9.00%는 최고 수치(4.17667%).
  // 가장 가까운 레벨(어깨 120, 9.10~10.00%)을 쓰면 여섯 줄이 모두 더해져 25.06%가 된다.
  const nova = await resolveTopPercentBreakdown(
    {
      itemName: "노바 리카온 숄더",
      slotName: "어깨",
      equipmentLevel: 110,
      potentialGrade: "3",
      potentialOption: [{ name: "물리 대미지", value: "9.00%" }],
    },
    physical,
  );
  assert.ok(Math.abs(nova.potentialProbability - 0.0417667) < 1e-12);
});

test("동기화 스크립트가 공식 표 이름과 잠재옵션 범위를 해석한다", () => {
  assert.deepEqual(splitOfficialKey("한벌옷, 상하의 170").map((part) => part.key), ["한벌옷 170", "상의 170", "하의 170"]);
  assert.deepEqual(splitOfficialKey("엠블렘 200 / 감시자의 눈 / 모방된 신의 매듭").map((part) => part.key), [
    "엠블렘 200",
    "감시자의 눈 200",
    "모방된 신의 매듭 200",
  ]);
  assert.deepEqual(splitOfficialKey("신발, 망토 180").map((part) => part.key), ["신발 180", "망토 180"]);
  assert.throws(() => splitOfficialKey("반지 200"), /알 수 없는 부위/);
  assert.deepEqual(parseLevelRange("100레벨 장비 (망토(케이프)의 경우, 90레벨 장비)"), { default: 100, bySlot: { 망토: 90 } });
  assert.deepEqual(parseLevelRange("신발 / 어깨 : 100레벨 장비 망토 : 120레벨 장비"), { default: null, bySlot: { 신발: 100, 어깨: 100, 망토: 120 } });
  assert.deepEqual(parseLevelRange("160레벨 장비"), { default: 160, bySlot: {} });
});

// ---------------------------------------------------------------------------
// 추가 옵션(환생의 불꽃) 확률표: 공식 5795 페이지에서 만든 public/probability/*_flame_prob.json

const FLAME_NAMES = ["골드리프 환생의 불꽃", "환생의 불꽃", "강력한 환생의 불꽃", "영원한 환생의 불꽃"];
const flameOption = (file, flame, option) => readTable(file)[flame].options.find((entry) => squash(entry.option) === squash(option));

test("추가 옵션 표: 불꽃 4종, 옵션 확률 합계 100%, MIN ≤ MAX, 레벨 목록이 같다", () => {
  const chance = { "골드리프 환생의 불꽃": "5%", "환생의 불꽃": "10%", "강력한 환생의 불꽃": "50%", "영원한 환생의 불꽃": "100%" };
  for (const { file, group } of FLAME_OUTPUTS) {
    const data = readTable(file);
    assert.equal(data._meta.source, "https://m.nexon.com/probability/5795?language=ko", file);
    assert.equal(data._meta.official_group, group, file);
    assert.deepEqual(tableKeys(data), FLAME_NAMES, file);
    for (const flame of FLAME_NAMES) {
      const block = data[flame];
      assert.equal(block.two_option_chance, chance[flame], `${file} ${flame}`);
      assert.equal(block.level_basis, file === "heart_flame_prob.json" ? "등급" : "장비 레벨", `${file} ${flame}`);
      const sum = block.options.reduce((acc, entry) => acc + percent(entry.p), 0);
      assert.ok(Math.abs(sum - 100) <= SUM_TOLERANCE, `${file} ${flame} 옵션 확률 합계 ${sum}`);
      const levels = Object.keys(block.options[0].ranges);
      for (const entry of block.options) {
        assert.deepEqual(Object.keys(entry.ranges), levels, `${file} ${flame} ${entry.option}`);
        assert.ok(percent(entry.step) > 0, `${file} ${flame} ${entry.option} 증가값`);
        for (const [level, range] of Object.entries(entry.ranges)) {
          assert.ok(percent(range.min) <= percent(range.max), `${file} ${flame} ${entry.option} ${level}`);
        }
      }
    }
  }
  assert.deepEqual(Object.keys(readTable("weapon_flame_prob.json")["영원한 환생의 불꽃"].options[0].ranges), ["100", "120", "140", "160", "180", "200"]);
  assert.ok(readTable("weapon_flame_prob.json")._meta.official_notes.some((note) => note.includes("검은 환생의 불꽃")));
});

test("추가 옵션 표 대표 값: 영원한 200 방어구 방어율 무시·무기 물리공격력, 강력한 180 치명타확률", () => {
  const ignore = flameOption("armor_flame_prob.json", "영원한 환생의 불꽃", "방어율 무시");
  assert.equal(ignore.p, "9.0909%");
  assert.equal(ignore.step, "0.001%");
  assert.deepEqual(ignore.ranges["200"], { min: "4.90%", max: "5.90%" });
  const attack = flameOption("weapon_flame_prob.json", "영원한 환생의 불꽃", "물리공격력");
  assert.equal(attack.p, "7.1429%");
  assert.deepEqual(attack.ranges["200"], { min: "1609", max: "1931" });
  // 공식 패치노트의 마스터리 예시(앱솔랩스 그람 치명타 확률 1.7%, 최대 HP 1,481)는 강력한 환생의 불꽃 180 범위다.
  assert.deepEqual(flameOption("weapon_flame_prob.json", "강력한 환생의 불꽃", "치명타확률").ranges["180"], { min: "1.70%", max: "1.90%" });
  assert.deepEqual(flameOption("weapon_flame_prob.json", "강력한 환생의 불꽃", "최대 HP").ranges["180"], { min: "1411", max: "1560" });
  // 영원한 환생의 불꽃에만 있는 옵션
  assert.ok(flameOption("weapon_flame_prob.json", "영원한 환생의 불꽃", "마법대미지"));
  assert.ok(!flameOption("weapon_flame_prob.json", "강력한 환생의 불꽃", "마법대미지"));
  assert.ok(flameOption("armor_flame_prob.json", "영원한 환생의 불꽃", "경험치 획득량"));
});

test("동기화 스크립트가 추가 옵션 블록(옵션·확률·증가값·MIN/MAX)을 해석한다", () => {
  const raw = {
    headLines: ["환생의 불꽃 - 추가 옵션"],
    introLines: ["⊙ 옵션값은 각 옵션의 최솟값(MIN)~최댓값(MAX) 범위에서 균등 확률로 결정됩니다.", "장비 레벨 180에 해당하는 추가 옵션이 부여됩니다.", "환생의 불꽃 종류"],
    tables: [
      {
        rows: [
          ["환생의 불꽃 종류", "2개 등장 확률"],
          ...FLAME_NAMES.map((name, index) => [name === "환생의 불꽃" ? "환생의 불꽃 (캐시상점)" : name, ["5%", "10%", "50%", "100%"][index]]),
        ],
      },
      {
        rows: [
          ["방어구, 공용 방어구 – 영원한 환생의 불꽃", "옵션", "최대 HP", "방어율 무시", ""],
          ["확률", "50.0000%", "50.0000%%", ""],
          ["증가값", "1", "0.001%", ""],
          ["장비 레벨", "MIN", "MAX", "MIN", "MAX", ""],
          ["180", "4801", "5657", "4.00%", "4.80%", ""],
          ["200", "5658", "6788", "4.90%", "5.90%", ""],
        ],
      },
    ],
  };
  const parsed = parseFlamePage(raw, { id: 5795, type: "flame", title: "환생의 불꽃 - 추가 옵션" });
  const problems = parsed.problems.filter((problem) => !problem.startsWith("빈 표"));
  assert.deepEqual(problems, []);
  assert.equal(parsed.twoOptionChance["환생의 불꽃"], "10%");
  const block = parsed.groups["방어구, 공용 방어구"]["영원한 환생의 불꽃"];
  assert.equal(block.levelBasis, "장비 레벨");
  assert.deepEqual(block.options[1], { option: "방어율 무시", p: "50.0000%%", step: "0.001%", ranges: { 180: { min: "4.00%", max: "4.80%" }, 200: { min: "4.90%", max: "5.90%" } } });
  assert.deepEqual(parsed.notes, raw.introLines.slice(0, 2));
});

// ---------------------------------------------------------------------------
// 장비 마스터리: 확률은 마스터리 보너스를 뺀 원래 값으로 찾는다(public/probability/equipment_mastery.json).

// 넥슨 API 응답(test/fixtures/characters/유니온-피카츄.json)의 장비를 화면용 필드로 옮긴다.
const PIKACHU = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "characters", "유니온-피카츄.json"), "utf8"));
const toOptions = (list) => (list || []).map((option) => ({ name: option.option_name, value: option.option_value }));
function pikachuItem(slot) {
  const raw = PIKACHU.details.itemEquipment.data.item_equipment.find((item) => item.item_equipment_slot_name === slot);
  const mastery = raw.mastery_info;
  return {
    itemName: raw.item_name,
    slotName: raw.item_equipment_slot_name,
    pageName: raw.item_equipment_page_name,
    equipmentLevel: raw.equipment_level,
    potentialGrade: String(raw.item_potential_option_grade),
    additionalPotentialGrade: String(raw.item_additional_potential_option_grade),
    additionalOptionGrade: String(raw.item_additional_option_grade),
    potentialOption: toOptions(raw.item_potential_option),
    additionalPotentialOption: toOptions(raw.item_additional_potential_option),
    additionalOption: toOptions(raw.item_additional_option),
    masteryInfo: mastery
      ? {
          level: mastery.mastery_level,
          basicPoint: mastery.base_option_point,
          potentialPoint: mastery.potential_option_point,
          additionalPoint: mastery.additional_option_point,
          additionalPotentialPoint: mastery.additional_potential_option_point,
        }
      : null,
  };
}
const MAGICAL = { attackType: "magical" };
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * 1e-9, `${label}: ${actual} ≠ ${expected}`);
// 부동소수 합 순서가 달라 생기는 차이까지 허용(검산용).
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * 1e-6, `${label}: ${actual} ≠ ${expected}`);
const ITEM_SCORE_WEIGHTS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "game-data", "item-score.json"), "utf8")).weights;

/**
 * 검산(전수 조합): 줄마다 공식 표의 모든 행을 다 조합해, 쓸모 있는 옵션 값 합이 target 이상인 확률을 더한다.
 * item-share.js 의 합성곱 계산과 다른 방법으로 같은 값을 구한다.
 */
function cubeTopOracle(rowsByLine, isValid, target) {
  const units = (value) => Math.round(value * 100);
  const goal = units(target);
  let total = 0;
  const walk = (index, sum, p) => {
    if (index === rowsByLine.length) {
      if (sum >= goal) total += p;
      return;
    }
    for (const row of rowsByLine[index]) {
      const value = percent(row.value);
      walk(index + 1, sum + (isValid(squash(row.option)) && Number.isFinite(value) ? units(value) : 0), (p * percent(row.p)) / 100);
    }
  };
  walk(0, 0, 1);
  return total;
}

/** 검산(전수 조합): 불꽃 한 줄 점수 분포를 펼쳐 첫 줄·둘째 줄(two_option_chance) 모든 쌍을 센다. */
function flameTopOracle(block, levelKey, weightOf, target) {
  const dist = [];
  for (const option of block.options) {
    const p = percent(option.p) / 100;
    const weight = weightOf(squash(option.option).replace(/데미지/g, "대미지").replace(/증가$/, ""));
    const range = option.ranges?.[levelKey];
    if (!weight || !range) {
      dist.push([0, p]);
      continue;
    }
    const min = percent(range.min);
    const step = percent(option.step);
    const count = Math.round((percent(range.max) - min) / step) + 1;
    for (let i = 0; i < count; i += 1) dist.push([(min + i * step) * weight, p / count]);
  }
  const two = percent(block.two_option_chance) / 100;
  let one = 0;
  let pair = 0;
  for (const [a, pa] of dist) {
    if (a >= target - 1e-5) one += pa;
    for (const [b, pb] of dist) if (a + b >= target - 1e-5) pair += pa * pb;
  }
  return (1 - two) * one + two * pair;
}

const LINES3 = ["first", "second", "third"];
const lineTexts = (section) => section.lines.map((line) => line.text);

test("마스터리 표: 공식 출처·확인일·줄당 최대 2개, 근거 없는 항목은 비워 둔다", () => {
  const table = readTable("equipment_mastery.json");
  assert.equal(table._meta.checked_at, "2026-10-29");
  const urls = table._meta.sources.map((source) => source.url);
  assert.ok(urls.includes("https://maplestorym.nexon.com/1198/board/1215/view/3511972"));
  assert.ok(urls.includes("https://m.nexon.com/probability/5795?language=ko"));
  for (const url of urls) assert.match(url, /^https:\/\/(?:maplestorym\.nexon\.com|m\.nexon\.com|openapi\.nexon\.com)\//, url);
  assert.equal(table.max_bonus_per_line, 2);
  assert.deepEqual(table.cube, { 레전더리: { percent: 2 }, 유니크: { percent: 1.5 } });
  assert.deepEqual(table.flame["강력한 환생의 불꽃"], { 치명타확률: 1.5, "최대 HP": 450, "방어율 무시": [1.2, 1.0], 물리공격력: 450, 마법공격력: 450, "최종 대미지 증가": 1.5 });
  assert.deepEqual(Object.keys(table.flame_grade), ["2", "3"]);
  for (const flame of Object.keys(table.flame)) {
    for (const option of Object.keys(table.flame[flame])) {
      assert.ok(flameOption("weapon_flame_prob.json", flame, option) || flameOption("armor_flame_prob.json", flame, option), `${flame} ${option}`);
    }
  }
  assert.ok(table._meta.unverified.length >= 3);
});

test("마스터리: 장갑 잠재 보너스 6 → 줄마다 +4%p 를 빼고(22.70/19.76/22.70 → 18.70/15.76/18.70) 확률표를 찾는다", async () => {
  const { resolveTopPercentBreakdown } = await importItemShare();
  const gloves = pikachuItem("장갑");
  assert.equal(gloves.masteryInfo.potentialPoint, 6);
  const withMastery = await resolveTopPercentBreakdown(gloves, MAGICAL);
  assert.deepEqual(lineTexts(withMastery.mastery.potential), ["+4%", "+4%", "+4%"]);
  assert.equal(withMastery.mastery.potential.status, "exact");
  assert.deepEqual(lineTexts(withMastery.mastery.additionalPotential), ["", "", ""]);

  // 같은 장비를 마스터리 없이 원래 값으로 넣은 결과와 같다.
  const rolled = await resolveTopPercentBreakdown(
    {
      ...gloves,
      masteryInfo: null,
      potentialOption: [{ name: "보스 공격력", value: "18.70%" }, { name: "보스 공격력", value: "15.76%" }, { name: "보스 공격력", value: "18.70%" }],
    },
    MAGICAL,
  );
  near(withMastery.potentialProbability, rolled.potentialProbability, "잠재");
  // 상위 % = 새로 돌린 잠재에서 보스 공격력 합(장갑에 쓸모 있는 옵션)이 18.70 + 15.76 + 18.70 = 53.16% 이상일 확률
  const key = await tableKeyFor(gloves, "potential");
  const rows = LINES3.map((line) => rowsOf("gloves_potential_prob.json", key, "레전더리", line));
  close(withMastery.potentialProbability, cubeTopOracle(rows, (name) => name === "보스공격력", 53.16), "잠재 값");
  near(withMastery.additionalProbability, rolled.additionalProbability, "에디셔널(보너스 없음)");

});

test("마스터리 정보가 없어도(착용하지 않은 프리셋 장비) 표에 없는 값은 +2%씩 빼서 맞으면 마스터리로 본다", async () => {
  const { resolveTopPercentBreakdown } = await importItemShare();
  const gloves = pikachuItem("장갑");
  const known = await resolveTopPercentBreakdown(gloves, MAGICAL);
  const inferred = await resolveTopPercentBreakdown({ ...gloves, masteryInfo: null }, MAGICAL);
  assert.deepEqual(lineTexts(inferred.mastery.potential), ["+4%", "+4%", "+4%"]);
  assert.equal(inferred.mastery.potential.status, "inferred");
  near(inferred.potentialProbability, known.potentialProbability, "잠재");
  // 표에 있는 값은 건드리지 않는다.
  const plain = await resolveTopPercentBreakdown(
    { ...gloves, masteryInfo: null, potentialOption: [{ name: "보스 공격력", value: "18.70%" }, { name: "보스 공격력", value: "15.76%" }, { name: "보스 공격력", value: "18.70%" }] },
    MAGICAL,
  );
  assert.deepEqual(lineTexts(plain.mastery.potential), ["", "", ""]);
});

test("마스터리: 어깨 에디셔널 보너스 6 → 16.40/10.30/16.40 을 12.40/6.30/12.40 으로 찾는다", async () => {
  const { resolveTopPercentBreakdown } = await importItemShare();
  const shoulder = pikachuItem("어깨");
  assert.equal(shoulder.masteryInfo.additionalPotentialPoint, 6);
  const result = await resolveTopPercentBreakdown(shoulder, MAGICAL);
  assert.deepEqual(lineTexts(result.mastery.additionalPotential), ["+4%", "+4%", "+4%"]);
  // 에디셔널은 마법 대미지 + 보스 공격력 합: 12.40 + 6.30 + 12.40 = 31.10% 이상일 확률
  const key = await tableKeyFor(shoulder, "additional");
  const rows = LINES3.map((line) => rowsOf("shoulder_additional_potential_prob.json", key, "레전더리", line));
  close(result.additionalProbability, cubeTopOracle(rows, (name) => name === "마법대미지" || name === "보스공격력", 31.1), "에디셔널");
  const raw = await resolveTopPercentBreakdown({ ...shoulder, masteryInfo: null }, MAGICAL);
  near(result.potentialProbability, raw.potentialProbability, "잠재(보너스 없음)");
});

test("마스터리: 보너스가 줄 수보다 적으면 공식 표에 맞는 줄만 고른다(신발 에디셔널 4 → +4/+4/0, 추가 옵션 2 → 방어율 무시 +3.2)", async () => {
  const { resolveTopPercentBreakdown } = await importItemShare();
  const shoes = pikachuItem("신발");
  const result = await resolveTopPercentBreakdown(shoes, MAGICAL);
  assert.deepEqual(lineTexts(result.mastery.additionalPotential), ["+4%", "+4%", ""]);
  assert.equal(result.mastery.additionalPotential.status, "exact");
  assert.deepEqual(lineTexts(result.mastery.additional), ["+3.2%", ""]);
  assert.equal(result.mastery.additional.flameName, "영원한 환생의 불꽃");
  // 방어율 무시 8.63% − 2 × 1.6 = 5.43%(점수 5.43 × 1.42216). HP 회복력은 0점.
  const block = readTable("armor_flame_prob.json")["영원한 환생의 불꽃"];
  const combat = { "마법공격력": ITEM_SCORE_WEIGHTS.attack, "마법대미지": ITEM_SCORE_WEIGHTS.damagePercent, "최종대미지": ITEM_SCORE_WEIGHTS.finalDamage, "방어율무시": ITEM_SCORE_WEIGHTS.ignoreDefense };
  close(result.additionalOptionProbability, flameTopOracle(block, "200", (name) => combat[name] || 0, 5.43 * ITEM_SCORE_WEIGHTS.ignoreDefense), "추가 옵션");
  near(result.additionalOptionPercent, result.additionalOptionProbability * 100, "추가 옵션 %");
});

test("마스터리: 무기 공격력 추옵 보너스(강력 +450·영원 +600/개)를 빼고 계산해 터무니없는 상위 % 가 나오지 않는다", async () => {
  const { resolveTopPercentBreakdown } = await importItemShare();
  // 수집 장비: 아케인셰이드 ESP리미터 강력한 불꽃 마법 공격력 2,212·2,208, 추가 옵션 보너스 4
  const limiter = {
    itemName: "아케인셰이드 ESP리미터",
    slotName: "무기",
    pageName: "ESP리미터",
    equipmentLevel: 200,
    potentialGrade: "",
    additionalPotentialGrade: "",
    additionalOptionGrade: "2",
    potentialOption: [],
    additionalPotentialOption: [],
    additionalOption: [{ name: "마법 공격력", value: "2,212" }, { name: "마법 공격력", value: "2,208" }],
    masteryInfo: { level: 6, basicPoint: 2, potentialPoint: 0, additionalPoint: 4, additionalPotentialPoint: 0 },
  };
  const result = await resolveTopPercentBreakdown(limiter, MAGICAL);
  assert.deepEqual(lineTexts(result.mastery.additional), ["+900", "+900"]);
  assert.ok(result.additionalOptionProbability > 1e-4, String(result.additionalOptionProbability));
  // 영원한 불꽃 최종 대미지는 +2%p 와 +1.5%p 가 섞여 있다: 9.0% 보너스 2 → 6.0%(+3.0)
  const staff = { ...limiter, additionalOptionGrade: "3", additionalOption: [{ name: "최종 대미지", value: "9.00%" }], masteryInfo: { ...limiter.masteryInfo, additionalPoint: 2 } };
  const mixed = await resolveTopPercentBreakdown(staff, MAGICAL);
  assert.deepEqual(lineTexts(mixed.mastery.additional), ["+3%"]);
  assert.ok(mixed.additionalOptionProbability > 1e-4, String(mixed.additionalOptionProbability));
});

test("마스터리 포인트가 0이면(정보가 있고 기본 옵션에만 넣음) 옵션 값을 그대로 쓴다", async () => {
  const { resolveTopPercentBreakdown } = await importItemShare();
  for (const slot of ["장갑", "어깨", "신발", "무기", "한벌옷"]) {
    const item = pikachuItem(slot);
    const zero = await resolveTopPercentBreakdown(
      { ...item, masteryInfo: { level: 6, basicPoint: 6, potentialPoint: 0, additionalPoint: 0, additionalPotentialPoint: 0 } },
      MAGICAL,
    );
    for (const section of ["potential", "additionalPotential", "additional"]) {
      assert.ok(zero.mastery[section].lines.every((line) => line.text === ""), `${slot} ${section}`);
    }
  }
  // 앞선 테스트의 2026-03 응답 값(마스터리 없음)과 같은 엠블렘 계산도 그대로다.
  const emblem = pikachuItem("엠블렘");
  const result = await resolveTopPercentBreakdown(emblem, MAGICAL);
  assert.equal(result.mastery.potential.status, "none");
});

test("근거 없는 상승량은 빼지 않는다: 잠재 최대 HP 줄, 골드리프·캐시 불꽃(등급 1)", async () => {
  const { resolveTopPercentBreakdown } = await importItemShare();
  const shoes = pikachuItem("신발"); // 잠재 최대 HP 16,036 / 6,316 / 16,036
  const none = await resolveTopPercentBreakdown({ ...shoes, masteryInfo: null }, MAGICAL);
  const withHpBonus = await resolveTopPercentBreakdown(
    { ...shoes, masteryInfo: { ...shoes.masteryInfo, potentialPoint: 2, additionalPoint: 0, additionalPotentialPoint: 0 } },
    MAGICAL,
  );
  assert.equal(withHpBonus.potentialProbability, none.potentialProbability);
  assert.deepEqual(lineTexts(withHpBonus.mastery.potential), ["", "", ""]);
  const rare = await resolveTopPercentBreakdown({ ...shoes, additionalOptionGrade: "1" }, MAGICAL);
  assert.equal(rare.additionalOptionProbability, null);
});

test("추가 옵션 상위 %: 둘째 줄 등장 확률까지 넣고, 직업에 맞는 옵션만 센다", async () => {
  const { resolveTopPercentBreakdown, formatAdditionalOptionPercent, buildTopPercentCaption } = await importItemShare();
  // 제네시스 그람(영원한, 보너스 4): 물리 공격력 3,107·2,875 → 1,907·1,675 (보너스 1개당 600)
  const gram = {
    itemName: "제네시스 그람",
    slotName: "무기",
    pageName: "그람",
    equipmentLevel: 200,
    additionalOptionGrade: "3",
    additionalOption: [{ name: "물리 공격력", value: "3,107" }, { name: "물리 공격력", value: "2,875" }],
    masteryInfo: { level: 6, basicPoint: 2, potentialPoint: 0, additionalPoint: 4, additionalPotentialPoint: 0 },
  };
  const result = await resolveTopPercentBreakdown(gram, { attackType: "physical" });
  assert.deepEqual(lineTexts(result.mastery.additional), ["+1,200", "+1,200"]);
  // 점수 = (1,907 + 1,675) × 공격력 가중치, 둘째 줄 등장 100%
  const weaponBlock = readTable("weapon_flame_prob.json")["영원한 환생의 불꽃"];
  const physicalCombat = { "물리공격력": ITEM_SCORE_WEIGHTS.attack, "물리대미지": ITEM_SCORE_WEIGHTS.damagePercent, "최종대미지": ITEM_SCORE_WEIGHTS.finalDamage, "방어율무시": ITEM_SCORE_WEIGHTS.ignoreDefense };
  close(result.additionalOptionProbability, flameTopOracle(weaponBlock, "200", (name) => physicalCombat[name] || 0, (1907 + 1675) * ITEM_SCORE_WEIGHTS.attack), "그람");
  assert.equal(result.totalPercent, null);
  // 마법사에게 물리 공격력은 세지 않는다.
  const mage = await resolveTopPercentBreakdown(gram, MAGICAL);
  assert.equal(mage.additionalOptionProbability, null);

  // 강력한 환생의 불꽃(등급 2): 둘째 줄 등장 50%
  const strong = await resolveTopPercentBreakdown(
    {
      itemName: "테스트 숄더",
      slotName: "어깨",
      equipmentLevel: 180,
      additionalOptionGrade: "2",
      additionalOption: [{ name: "최대 HP", value: "1,500" }, { name: "아이템 드롭률", value: "2.40%" }],
    },
    MAGICAL,
  );
  // 사냥 옵션(드롭·메획·경험치)은 % 그대로 점수: 드롭률 2.40 이상(최대 HP 는 0점), 둘째 줄 등장 50%
  const strongBlock = readTable("armor_flame_prob.json")["강력한 환생의 불꽃"];
  const farming = (name) => (["아이템드롭률", "메소획득량", "경험치획득량"].includes(name) ? 1 : 0);
  close(strong.additionalOptionProbability, flameTopOracle(strongBlock, "180", farming, 2.4), "강력한");

  assert.equal(formatAdditionalOptionPercent(3.2349), "3.2%");
  assert.equal(formatAdditionalOptionPercent(0.08196), "0.082%");
  assert.equal(formatAdditionalOptionPercent(null), "");
  const caption = await buildTopPercentCaption(pikachuItem("신발"), MAGICAL);
  assert.match(caption, /^상위 [\d.]+%, 블랙큐브 [\d,]+개, 에디셔널 큐브 [\d,]+개 짜리 아이템입니다!$/);
});

test("줄 나누기: 보너스 수를 줄마다 최대 2개로 나누는 모든 경우", async () => {
  const { enumerateBonusSplits } = await importItemShare();
  assert.deepEqual(enumerateBonusSplits(3, 6, 2), [[2, 2, 2]]);
  assert.deepEqual(enumerateBonusSplits(2, 3, 2), [[2, 1], [1, 2]]);
  assert.equal(enumerateBonusSplits(3, 4, 2).length, 6);
  assert.deepEqual(enumerateBonusSplits(3, 7, 2), []);
});

test("추가 옵션 점수 가중치는 템환산 가중치와 같다(src/game-data/item-score.json)", async () => {
  const { FLAME_SCORE_WEIGHTS } = await importItemShare();
  assert.equal(FLAME_SCORE_WEIGHTS["물리공격력"], ITEM_SCORE_WEIGHTS.attack);
  assert.equal(FLAME_SCORE_WEIGHTS["마법대미지"], ITEM_SCORE_WEIGHTS.damagePercent);
  assert.equal(FLAME_SCORE_WEIGHTS["최종대미지"], ITEM_SCORE_WEIGHTS.finalDamage);
  assert.equal(FLAME_SCORE_WEIGHTS["방어율무시"], ITEM_SCORE_WEIGHTS.ignoreDefense);
});

test("상위 %: 쓸모없는 옵션만 있으면 상위 100%, 같은 옵션이면 값이 클수록 상위 % 가 작다", async () => {
  const { resolveTopPercentBreakdown } = await importItemShare();
  const gloves = (lines) => ({ itemName: "아케인셰이드 나이트글러브", slotName: "장갑", equipmentLevel: 200, potentialGrade: "4", potentialOption: lines });
  const physical = { attackType: "physical" };
  const junk = await resolveTopPercentBreakdown(gloves([{ name: "최대 HP", value: "1,000" }, { name: "STR", value: "10" }]), physical);
  assert.equal(junk.potentialProbability, null); // 쓸모 있는 줄이 없으면 내세울 게 없다
  const low = await resolveTopPercentBreakdown(gloves([{ name: "보스 공격력", value: "12.00%" }, { name: "최대 HP", value: "1,000" }]), physical);
  const high = await resolveTopPercentBreakdown(gloves([{ name: "보스 공격력", value: "18.70%" }, { name: "최대 HP", value: "1,000" }]), physical);
  assert.ok(low.potentialProbability > high.potentialProbability, `${low.potentialProbability} vs ${high.potentialProbability}`);
  // 보스 1줄짜리가 보스 2줄짜리보다 흔하다(상위 % 가 크다).
  const two = await resolveTopPercentBreakdown(gloves([{ name: "보스 공격력", value: "12.00%" }, { name: "보스 공격력", value: "12.00%" }]), physical);
  assert.ok(low.potentialProbability > two.potentialProbability);
});
