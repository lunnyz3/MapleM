#!/usr/bin/env node
// 잠재능력·에디셔널 잠재능력 확률표 동기화.
//
// 넥슨 메이플스토리M 공식 '확률형 아이템 정보'의 큐브 페이지(잠재옵션 12개, 에디셔널 잠재능력 8개)를
// Headless Chromium 으로 읽어 public/probability/*.json 을 다시 만들고, --verify 로 파일과 공식 페이지를 전 행 대조한다.
//
//   node scripts/data/sync-probability.js               공식 페이지 → public/probability/*.json 재생성
//   node scripts/data/sync-probability.js --dry-run     파일은 그대로 두고 바뀔 항목만 출력
//   node scripts/data/sync-probability.js --verify      공식 페이지와 파일을 전 행 대조(파일 수정 없음, 불일치면 종료 코드 1)
//
//   --snapshot <dir>  읽어 온 페이지 원본(표의 행)을 <dir>/<페이지번호>.json 으로 저장
//   --offline <dir>   공식 페이지 대신 --snapshot 으로 저장한 원본을 읽음(네트워크 없음)
//   --out <dir>       생성·대조할 폴더(기본 public/probability)
//   --changes <file>  재생성할 때 바뀐 항목 목록을 markdown 으로 저장
//   --delay <ms>      페이지 사이 대기 시간(기본 1500, 최소 1000)
//
// 파일 형식(2026-03 판과 같음)
//   { "_meta": {...}, "<부위> <레벨>": { "<등급>": { "first": [{ option, value, p }], "second": [...], "third": [...] } } }
//   - first 는 공식 표의 '첫번째 옵션', second·third 는 '두번째 / 세번째 옵션' 열(같은 분포를 두 번 저장)이다.
//   - option·value·p 는 공식 표의 글자를 그대로 쓴다(예: "최대 HP", "3750", "5.00000%").
//   - 공식 표 이름이 여러 부위를 묶으면(예: '한벌옷, 상하의 170') 부위마다 같은 표를 '<부위> <레벨>' 키로 나눠 저장한다.
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "../..");
const DEFAULT_OUT_DIR = path.join(ROOT_DIR, "public", "probability");
const OFFICIAL_URL = (id) => `https://m.nexon.com/probability/${id}?language=ko`;
const GENERATOR = "scripts/data/sync-probability.js";
const MIN_DELAY_MS = 1000;
const DEFAULT_DELAY_MS = 1500;

const GRADES = ["레어", "에픽", "유니크", "레전더리"];
const LINES = ["first", "second", "third"];
const KNOWN_LABELS = [
  "무기", "보조무기", "엠블렘", "감시자의 눈", "모방된 신의 매듭",
  "한벌옷", "상의", "하의", "모자", "망토", "신발", "장갑", "어깨", "벨트",
];
// 공식 표 이름에서 여러 부위를 한 단어로 묶은 표기
const LABEL_ALIASES = { 상하의: ["상의", "하의"] };
const PERCENT_RE = /^\d+(?:\.\d+)?%$/;

// 공식 큐브 페이지(2026-10-28 기준). 기계심장(5806)과 기타(5809)는 사이트에서 쓰지 않는다.
const PAGES = [
  { id: 5797, type: "potential", title: "큐브 (잠재옵션) - 무기" },
  { id: 5799, type: "potential", title: "큐브 (잠재옵션) - 보조무기" },
  { id: 5800, type: "potential", title: "큐브 (잠재옵션) - 상의" },
  { id: 5801, type: "potential", title: "큐브 (잠재옵션) - 하의" },
  { id: 5798, type: "potential", title: "큐브 (잠재옵션) - 한벌옷" },
  { id: 5802, type: "potential", title: "큐브 (잠재옵션) - 모자" },
  { id: 5807, type: "potential", title: "큐브 (잠재옵션) - 망토" },
  { id: 5804, type: "potential", title: "큐브(잠재옵션) - 신발" },
  { id: 5805, type: "potential", title: "큐브 (잠재옵션) - 장갑" },
  { id: 5808, type: "potential", title: "큐브 (잠재옵션) - 어깨" },
  { id: 5803, type: "potential", title: "큐브 (잠재옵션) - 벨트" },
  { id: 6266, type: "potential", title: "큐브 (잠재옵션) - 엠블렘, 감시자의 눈(반지), 모방된 신의 매듭(목걸이)" },
  { id: 6258, type: "additional", title: "큐브 (에디셔널 잠재능력) - 무기" },
  { id: 6259, type: "additional", title: "큐브 (에디셔널 잠재능력) - 한벌옷, 상의, 하의" },
  { id: 6260, type: "additional", title: "큐브 (에디셔널 잠재능력) - 모자" },
  { id: 6261, type: "additional", title: "큐브 (에디셔널 잠재능력) - 신발, 망토" },
  { id: 6262, type: "additional", title: "큐브 (에디셔널 잠재능력) - 장갑" },
  { id: 6263, type: "additional", title: "큐브 (에디셔널 잠재능력) - 어깨" },
  { id: 6264, type: "additional", title: "큐브 (에디셔널 잠재능력) - 벨트" },
  { id: 6265, type: "additional", title: "큐브 (에디셔널 잠재능력) - 엠블렘, 보조무기, 감시자의 눈(반지), 모방된 신의 매듭(목걸이)" },
];

// 사이트 파일 → 공식 페이지와 담을 부위. 파일 이름은 public/js/features/item-share.js 의 SLOT_PROBABILITY_CONFIG 와 같아야 한다.
const OUTPUTS = [
  { file: "weapon_potential_prob.json", page: 5797, labels: ["무기"] },
  { file: "assistanceweapon_potential_prob.json", page: 5799, labels: ["보조무기"] },
  { file: "upper_potential_prob.json", page: 5800, labels: ["상의"] },
  { file: "pants_potential_prob.json", page: 5801, labels: ["하의"] },
  { file: "clothes_potential_prob.json", page: 5798, labels: ["한벌옷"] },
  { file: "hat_potential_prob.json", page: 5802, labels: ["모자"] },
  { file: "cape_potential_prob.json", page: 5807, labels: ["망토"] },
  { file: "shoes_potential_prob.json", page: 5804, labels: ["신발"] },
  { file: "gloves_potential_prob.json", page: 5805, labels: ["장갑"], legacyFile: "gloves_potential_prob.json.json" },
  { file: "shoulder_potential_prob.json", page: 5808, labels: ["어깨"] },
  { file: "belt_potential_prob.json", page: 5803, labels: ["벨트"] },
  { file: "emblem_potential_prob.json", page: 6266, labels: ["엠블렘", "감시자의 눈", "모방된 신의 매듭"] },
  { file: "weapon_additional_potential_prob.json", page: 6258, labels: ["무기"] },
  { file: "clothes_additional_potential_prob.json", page: 6259, labels: ["한벌옷", "상의", "하의"] },
  { file: "upper_additional_potential_prob.json", page: 6259, labels: ["한벌옷", "상의", "하의"] },
  { file: "pants_additional_potential_prob.json", page: 6259, labels: ["한벌옷", "상의", "하의"] },
  { file: "hat_additional_potential_prob.json", page: 6260, labels: ["모자"] },
  { file: "shoes_additional_potential_prob.json", page: 6261, labels: ["신발", "망토"] },
  { file: "cape_additional_potential_prob.json", page: 6261, labels: ["신발", "망토"] },
  { file: "gloves_additional_potential_prob.json", page: 6262, labels: ["장갑"], legacyFile: "gloves_additional_potential_prob.json.json" },
  { file: "shoulder_additional_potential_prob.json", page: 6263, labels: ["어깨"] },
  { file: "belt_additional_potential_prob.json", page: 6264, labels: ["벨트"] },
  { file: "emblem_additional_potential_prob.json", page: 6265, labels: ["엠블렘", "감시자의 눈", "모방된 신의 매듭"] },
  { file: "assistanceweapon_additional_potential_prob.json", page: 6265, labels: ["보조무기"] },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const squash = (value) => String(value ?? "").replace(/\s+/g, "");
const percentNumber = (text) => Number(String(text).replace(/[%,\s]/g, ""));

function kstTimestamp(date = new Date()) {
  return new Date(date.getTime() + 9 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, "+09:00");
}

// ---------------------------------------------------------------------------
// 1. 공식 페이지 읽기

// 브라우저 안에서 실행된다. 표의 행을 칸 글자 배열로 돌려준다.
function extractPageInBrowser() {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const lines = (document.body ? document.body.innerText : "").split("\n").map(clean).filter(Boolean);
  const tables = Array.from(document.querySelectorAll("table")).map((table) => ({
    nested: Boolean(table.parentElement && table.parentElement.closest("table")),
    spannedCells: Array.from(table.querySelectorAll("td, th")).filter((cell) => cell.rowSpan > 1 || cell.colSpan > 1).length,
    rows: Array.from(table.rows).map((row) => Array.from(row.cells).map((cell) => clean(cell.innerText || cell.textContent))),
  }));
  return { headLines: lines.slice(0, 8), notes: lines.filter((line) => line.startsWith("⊙")), tables };
}

async function waitForStableRows(page, timeoutMs = 30000) {
  const started = Date.now();
  let previous = -1;
  while (Date.now() - started < timeoutMs) {
    const count = await page.evaluate(() => document.querySelectorAll("table tr").length);
    if (count > 0 && count === previous) return count;
    previous = count;
    await sleep(700);
  }
  throw new Error("표가 나타나지 않았습니다");
}

async function fetchOfficialPages(pageDefs, { delayMs, log }) {
  const { launchBrowser } = require("../dev/browser.js");
  const browser = await launchBrowser();
  const results = [];
  try {
    const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 1280, height: 1000 } });
    const page = await context.newPage();
    for (let index = 0; index < pageDefs.length; index += 1) {
      const def = pageDefs[index];
      const url = OFFICIAL_URL(def.id);
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        if (index > 0 || attempt > 1) await sleep(delayMs * attempt);
        try {
          const response = await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
          const status = response ? response.status() : 0;
          if (status >= 400) throw new Error(`HTTP ${status}`);
          await waitForStableRows(page);
          const extracted = await page.evaluate(extractPageInBrowser);
          const rowCount = extracted.tables.reduce((sum, table) => sum + table.rows.length, 0);
          results.push({ id: def.id, url, status, fetchedAt: kstTimestamp(), ...extracted });
          log(`  ${def.id} ${def.title}: 표 ${extracted.tables.length}개, 행 ${rowCount}개`);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          log(`  ${def.id} 읽기 실패(${attempt}/3): ${error.message.split("\n")[0]}`);
        }
      }
      if (lastError) throw new Error(`${url} 를 읽지 못했습니다: ${lastError.message}`);
    }
  } finally {
    await browser.close();
  }
  return results;
}

function readSnapshot(dir, pageDefs) {
  return pageDefs.map((def) => {
    const file = path.join(dir, `${def.id}.json`);
    if (!fs.existsSync(file)) throw new Error(`스냅숏 파일이 없습니다: ${file}`);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  });
}

function writeSnapshot(dir, rawPages) {
  fs.mkdirSync(dir, { recursive: true });
  for (const raw of rawPages) {
    fs.writeFileSync(path.join(dir, `${raw.id}.json`), `${JSON.stringify(raw)}\n`);
  }
}

// ---------------------------------------------------------------------------
// 2. 공식 표 해석

// '100레벨 장비 (망토(케이프)의 경우, 90레벨 장비)', '신발 / 어깨 : 100레벨 장비 망토 : 120레벨 장비' 같은 범위 설명을 숫자로 바꾼다.
function parseLevelRange(text) {
  const result = { default: null, bySlot: {} };
  const slotsOf = (raw) =>
    String(raw)
      .replace(/\([^()]*\)/g, "")
      .split(/[/,]/)
      .map((part) => part.trim())
      .filter(Boolean);
  let rest = cleanText(text);
  rest = rest.replace(/\(((?:[^()]|\([^()]*\))*?)의 경우,\s*(\d+)레벨 장비\)/g, (_, slots, level) => {
    for (const slot of slotsOf(slots)) result.bySlot[slot] = Number(level);
    return " ";
  });
  rest = rest.replace(/([^:]+?)\s*:\s*(\d+)레벨 장비/g, (_, slots, level) => {
    for (const slot of slotsOf(slots)) result.bySlot[slot] = Number(level);
    return " ";
  });
  const plain = rest.match(/(\d+)레벨 장비/);
  if (plain) result.default = Number(plain[1]);
  if (result.default === null && !Object.keys(result.bySlot).length) {
    throw new Error(`잠재옵션 범위를 해석하지 못했습니다: ${text}`);
  }
  return result;
}

// '무기 200' → [무기 200], '한벌옷, 상하의 170' → [한벌옷 170, 상의 170, 하의 170],
// '엠블렘 200 / 감시자의 눈 / 모방된 신의 매듭' → [엠블렘 200, 감시자의 눈 200, 모방된 신의 매듭 200]
function splitOfficialKey(officialKey) {
  const text = cleanText(officialKey);
  const levels = text.match(/\d+/g) || [];
  if (levels.length !== 1) throw new Error(`표 이름에서 레벨 하나를 찾지 못했습니다: ${officialKey}`);
  const level = Number(levels[0]);
  const labels = text
    .replace(/\d+/, " ")
    .split(/[,/]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((name) => LABEL_ALIASES[name] || [name]);
  for (const label of labels) {
    if (!KNOWN_LABELS.includes(label)) throw new Error(`알 수 없는 부위 '${label}' (표 이름: ${officialKey})`);
  }
  return labels.map((label) => ({ label, level, key: `${label} ${level}` }));
}

function parseOfficialPage(raw, def) {
  const problems = [];
  const tables = {};
  const keyOrder = [];
  const exceptions = [];
  let block = null;

  const headOk = (raw.headLines || []).some((line) => squash(line) === squash(def.title));
  if (!headOk) {
    problems.push(`페이지 제목이 '${def.title}' 가 아닙니다: ${JSON.stringify((raw.headLines || []).slice(0, 3))}`);
  }

  const pushRow = (list, option, value, p, cells) => {
    if (!option && !value && !p) return;
    if (!option || !value || !PERCENT_RE.test(p)) {
      problems.push(`행을 해석하지 못했습니다: ${JSON.stringify(cells)}`);
      return;
    }
    list.push({ option, value, p });
  };

  for (const table of raw.tables || []) {
    if (table.nested) continue;
    let inExceptionTable = false;
    block = null;
    for (const cells of table.rows) {
      if (!cells.some(Boolean)) {
        block = null;
        inExceptionTable = false;
        continue;
      }
      const levelCell = cells.indexOf("장비 분류 / 레벨");
      if (levelCell >= 0 && /등급$/.test(cells[0])) {
        const grade = cells[1];
        const key = cleanText(cells.slice(levelCell + 1).filter(Boolean).join(" "));
        if (!GRADES.includes(grade) || !key) {
          problems.push(`등급 머리행을 해석하지 못했습니다: ${JSON.stringify(cells)}`);
          block = null;
          continue;
        }
        if (!tables[key]) {
          tables[key] = {};
          keyOrder.push(key);
        }
        if (tables[key][grade]) problems.push(`같은 표가 두 번 나옵니다: ${key} / ${grade}`);
        block = { first: [], second: [] };
        tables[key][grade] = block;
        inExceptionTable = false;
        continue;
      }
      if (cells.length === 2 && cells[0] === "장비" && cells[1] === "잠재옵션 범위") {
        inExceptionTable = true;
        block = null;
        continue;
      }
      if (inExceptionTable) {
        if (cells.length === 2 && cells[0] && cells[1]) {
          try {
            exceptions.push({ equipment: cells[0], range: cells[1], levels: parseLevelRange(cells[1]) });
          } catch (error) {
            problems.push(error.message);
          }
        } else {
          inExceptionTable = false;
        }
        continue;
      }
      if (!block) continue;
      if (cells[0] === "첫번째 옵션" || (cells[0] === "잠재옵션" && cells[1] === "수치")) continue;
      if (cells.length !== 7) {
        problems.push(`칸 수가 7이 아닌 행: ${JSON.stringify(cells)}`);
        continue;
      }
      const [option1, value1, p1, , option2, value2, p2] = cells;
      pushRow(block.first, option1, value1, p1, cells);
      pushRow(block.second, option2, value2, p2, cells);
    }
  }

  if (!keyOrder.length) problems.push("확률표를 하나도 찾지 못했습니다");
  for (const key of keyOrder) {
    const grades = Object.keys(tables[key]);
    const expectedOrder = GRADES.filter((grade) => grades.includes(grade));
    if (grades.join() !== expectedOrder.join()) problems.push(`등급 순서가 다릅니다: ${key} ${grades.join(",")}`);
    for (const grade of grades) {
      const { first, second } = tables[key][grade];
      if (!first.length || !second.length) problems.push(`빈 표: ${key} / ${grade}`);
    }
    try {
      splitOfficialKey(key);
    } catch (error) {
      problems.push(error.message);
    }
  }
  // 표 선택 규칙(레벨 예외)과 공식 정정·변경 안내만 남긴다.
  const notes = (raw.notes || []).filter((note) => /레벨|잠재옵션 범위|수정|변경/.test(note));
  return { id: def.id, type: def.type, title: def.title, url: OFFICIAL_URL(def.id), tables, keyOrder, exceptions, notes, problems };
}

function parseAllPages(rawPages) {
  const parsedById = new Map();
  const problems = [];
  for (const def of PAGES) {
    const raw = rawPages.find((page) => page.id === def.id);
    if (!raw) {
      problems.push(`${def.id}: 페이지 원본 없음`);
      continue;
    }
    const parsed = parseOfficialPage(raw, def);
    parsed.fetchedAt = raw.fetchedAt;
    parsedById.set(def.id, parsed);
    for (const problem of parsed.problems) problems.push(`${def.id}: ${problem}`);
  }
  return { parsedById, problems };
}

// ---------------------------------------------------------------------------
// 3. 사이트 파일 만들기

function buildOutputFile(output, parsed, generatedAt) {
  const result = {};
  const officialKeys = {};
  for (const officialKey of parsed.keyOrder) {
    const parts = splitOfficialKey(officialKey).filter((part) => output.labels.includes(part.label));
    for (const part of parts) {
      if (result[part.key]) throw new Error(`${output.file}: '${part.key}' 키가 두 번 만들어집니다`);
      const byGrade = {};
      for (const [grade, block] of Object.entries(parsed.tables[officialKey])) {
        byGrade[grade] = {
          first: block.first.map((row) => ({ ...row })),
          second: block.second.map((row) => ({ ...row })),
          third: block.second.map((row) => ({ ...row })),
        };
      }
      result[part.key] = byGrade;
      if (part.key !== officialKey) (officialKeys[officialKey] = officialKeys[officialKey] || []).push(part.key);
    }
  }
  if (!Object.keys(result).length) throw new Error(`${output.file}: 공식 페이지에서 ${output.labels.join(", ")} 표를 찾지 못했습니다`);
  const meta = {
    source: parsed.url,
    source_title: parsed.title,
    generated_at: generatedAt,
    generator: GENERATOR,
    note: "first = 공식 '첫번째 옵션', second·third = 공식 '두번째 / 세번째 옵션'(같은 분포). option·value·p 는 공식 표기 그대로.",
  };
  if (Object.keys(officialKeys).length) meta.official_keys = officialKeys;
  if (parsed.notes.length) meta.official_notes = parsed.notes;
  if (parsed.exceptions.length) meta.level_exceptions = parsed.exceptions;
  return { _meta: meta, ...result };
}

function buildOutputFiles(parsedById, generatedAt) {
  const files = new Map();
  for (const output of OUTPUTS) {
    const parsed = parsedById.get(output.page);
    if (!parsed) throw new Error(`${output.file}: 공식 페이지 ${output.page} 를 읽지 못했습니다`);
    files.set(output.file, buildOutputFile(output, parsed, generatedAt));
  }
  return files;
}

const tableEntries = (data) => Object.entries(data || {}).filter(([key]) => key !== "_meta");

function withoutTimestamp(data) {
  if (!data || !data._meta) return data;
  return { ...data, _meta: { ...data._meta, generated_at: null } };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readExistingOutput(dir, output) {
  for (const name of [output.file, output.legacyFile].filter(Boolean)) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return { name, data: readJson(file) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4. 바뀐 항목 비교

const trailingLevel = (key) => {
  const match = String(key).match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : null;
};
const labelOf = (key) => cleanText(String(key).replace(/\s*\d+\s*$/, ""));
const rowId = (row) => `${squash(row.option)}|${squash(row.value).replace(/,/g, "")}`;

function compareRowLists(oldRows, newRows) {
  const result = { same: 0, textOnly: 0, precision: [], probability: [], removed: [], added: [] };
  const pool = new Map();
  newRows.forEach((row, index) => {
    const id = rowId(row);
    if (!pool.has(id)) pool.set(id, []);
    pool.get(id).push({ row, index, used: false });
  });
  // 옵션 이름·수치의 공백 같은 표기만 다른 행(예: '최대 HP' ↔ '최대HP')은 개수만 센다.
  const countTextOnly = (before, after) => {
    if (cleanText(before.option) !== cleanText(after.option) || cleanText(before.value) !== cleanText(after.value)) result.textOnly += 1;
  };
  const unmatchedOld = [];
  for (const row of oldRows) {
    const candidates = (pool.get(rowId(row)) || []).filter((entry) => !entry.used);
    const exact = candidates.find((entry) => Math.abs(percentNumber(entry.row.p) - percentNumber(row.p)) < 1e-9);
    if (exact) {
      exact.used = true;
      result.same += 1;
      countTextOnly(row, exact.row);
    } else unmatchedOld.push(row);
  }
  for (const row of unmatchedOld) {
    const candidates = (pool.get(rowId(row)) || []).filter((entry) => !entry.used);
    if (candidates.length) {
      candidates.sort((a, b) => Math.abs(percentNumber(a.row.p) - percentNumber(row.p)) - Math.abs(percentNumber(b.row.p) - percentNumber(row.p)));
      const match = candidates[0];
      match.used = true;
      countTextOnly(row, match.row);
      const diff = Math.abs(percentNumber(match.row.p) - percentNumber(row.p));
      // 2026-04-09 공식 표기 소수점 변경(2자리 → 5자리)으로 생긴 차이는 0.005%p 이하다.
      (diff <= 0.005 + 1e-9 ? result.precision : result.probability).push({ before: row, after: match.row });
    } else result.removed.push(row);
  }
  for (const entries of pool.values()) {
    for (const entry of entries) if (!entry.used) result.added.push(entry.row);
  }
  return result;
}

function diffOutputFile(oldData, newData) {
  const oldTables = new Map(tableEntries(oldData));
  const newTables = new Map(tableEntries(newData));
  const diff = { keysAdded: [], keysRemoved: [], merged: [], tables: [], totals: { same: 0, textOnly: 0, precision: 0, probability: 0, removed: 0, added: 0 } };
  const comparePairs = [];
  for (const key of newTables.keys()) if (!oldTables.has(key)) diff.keysAdded.push(key);
  for (const key of oldTables.keys()) {
    if (newTables.has(key)) {
      comparePairs.push({ oldKey: key, newKeys: [key] });
      continue;
    }
    diff.keysRemoved.push(key);
    // 레벨이 없던 옛 키(예: '한벌옷', '보조무기')는 같은 부위의 새 레벨 표 전체와 비교한다.
    if (trailingLevel(key) === null) {
      const newKeys = [...newTables.keys()].filter((candidate) => labelOf(candidate) === key && !oldTables.has(candidate));
      if (newKeys.length) {
        comparePairs.push({ oldKey: key, newKeys });
        diff.merged.push({ oldKey: key, newKeys });
      }
    }
  }
  for (const { oldKey, newKeys } of comparePairs) {
    const oldByGrade = oldTables.get(oldKey);
    const grades = new Set([...Object.keys(oldByGrade), ...newKeys.flatMap((key) => Object.keys(newTables.get(key)))]);
    for (const grade of GRADES.filter((g) => grades.has(g))) {
      for (const line of LINES) {
        const oldRows = (oldByGrade[grade] && oldByGrade[grade][line]) || [];
        const newRows = newKeys.flatMap((key) => {
          const byGrade = newTables.get(key)[grade];
          return (byGrade && byGrade[line]) || [];
        });
        const compared = compareRowLists(oldRows, newRows);
        for (const name of Object.keys(diff.totals)) {
          diff.totals[name] += typeof compared[name] === "number" ? compared[name] : compared[name].length;
        }
        if (compared.precision.length || compared.probability.length || compared.removed.length || compared.added.length) {
          diff.tables.push({ oldKey, newKeys, grade, line, ...compared });
        }
      }
    }
  }
  return diff;
}

const formatRow = (row) => `${row.option} ${row.value} (${row.p})`;

function renderChanges(diffByFile, { generatedAt }) {
  const lines = [`# 확률표 재생성 변경 목록 (${generatedAt})`, ""];
  lines.push(
    "같음·정밀도·확률은 옵션과 수치가 같은 행끼리 비교한 결과다. '표기'는 그중 공백 등 글자 표기만 다른 행 수(별도 집계).",
    "",
    "| 파일 | 같음 | 정밀도만 다름 | 확률 다름 | 사라진 행 | 새 행 | 표기 | 키 변경 |",
    "|---|---:|---:|---:|---:|---:|---:|---|",
  );
  for (const [file, diff] of diffByFile) {
    const t = diff.totals;
    const keyNote = [
      diff.previousName && diff.previousName !== file ? `파일명 ${diff.previousName} → ${file}` : "",
      diff.keysRemoved.length ? `삭제 ${diff.keysRemoved.join(", ")}` : "",
      diff.keysAdded.length ? `추가 ${diff.keysAdded.join(", ")}` : "",
      diff.isNew ? "새 파일" : "",
    ].filter(Boolean).join(" / ");
    lines.push(`| ${file} | ${t.same} | ${t.precision} | ${t.probability} | ${t.removed} | ${t.added} | ${t.textOnly} | ${keyNote || "-"} |`);
  }
  lines.push("", "## 확률·수치가 바뀐 행(정밀도 차이 제외)", "");
  for (const [file, diff] of diffByFile) {
    const tables = diff.tables.filter((table) => table.probability.length || table.removed.length || table.added.length);
    if (!tables.length) continue;
    lines.push(`### ${file}`, "");
    for (const table of tables) {
      const where = `${table.oldKey}${table.newKeys.join() !== table.oldKey ? ` → ${table.newKeys.join(" + ")}` : ""} / ${table.grade} / ${table.line}`;
      const details = [];
      for (const change of table.probability) details.push(`확률 ${formatRow(change.before)} → ${change.after.p}`);
      for (const row of table.removed) details.push(`삭제 ${formatRow(row)}`);
      for (const row of table.added) details.push(`추가 ${formatRow(row)}`);
      const shown = details.slice(0, 12);
      lines.push(`- ${where}: ${shown.join("; ")}${details.length > shown.length ? ` 외 ${details.length - shown.length}건` : ""}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// 5. 전 행 대조(--verify)

const sameText = (a, b) => cleanText(a) === cleanText(b);

function verifyAgainstOfficial(parsedById, dir) {
  const report = { files: [], mismatches: [], rowsCompared: 0, rowsMatched: 0 };
  for (const output of OUTPUTS) {
    const file = path.join(dir, output.file);
    const entry = { file: output.file, page: output.page, rows: 0, matched: 0, problems: [] };
    report.files.push(entry);
    const parsed = parsedById.get(output.page);
    if (!fs.existsSync(file)) {
      entry.problems.push("파일 없음");
      continue;
    }
    const data = readJson(file);
    const expectedKeys = new Set();
    for (const officialKey of parsed.keyOrder) {
      for (const part of splitOfficialKey(officialKey).filter((p) => output.labels.includes(p.label))) {
        expectedKeys.add(part.key);
        const siteTable = data[part.key];
        if (!siteTable) {
          entry.problems.push(`키 없음: ${part.key} (공식 '${officialKey}')`);
          continue;
        }
        const officialGrades = Object.keys(parsed.tables[officialKey]);
        const extraGrades = Object.keys(siteTable).filter((grade) => !officialGrades.includes(grade));
        if (extraGrades.length) entry.problems.push(`${part.key}: 공식에 없는 등급 ${extraGrades.join(", ")}`);
        for (const grade of officialGrades) {
          const block = parsed.tables[officialKey][grade];
          for (const line of LINES) {
            const officialRows = line === "first" ? block.first : block.second;
            const siteRows = (siteTable[grade] && siteTable[grade][line]) || [];
            const count = Math.max(officialRows.length, siteRows.length);
            for (let i = 0; i < count; i += 1) {
              const official = officialRows[i];
              const site = siteRows[i];
              entry.rows += 1;
              if (official && site && sameText(official.option, site.option) && sameText(official.value, site.value) && sameText(official.p, site.p)) {
                entry.matched += 1;
              } else {
                entry.problems.push(`${part.key} / ${grade} / ${line} ${i + 1}행: 공식 ${official ? formatRow(official) : "(없음)"} / 파일 ${site ? formatRow(site) : "(없음)"}`);
              }
            }
          }
        }
      }
    }
    for (const [key] of tableEntries(data)) {
      if (!expectedKeys.has(key)) entry.problems.push(`공식 페이지에 없는 키: ${key}`);
    }
    report.rowsCompared += entry.rows;
    report.rowsMatched += entry.matched;
    for (const problem of entry.problems) report.mismatches.push(`${output.file}: ${problem}`);
  }
  for (const output of OUTPUTS.filter((o) => o.legacyFile)) {
    if (fs.existsSync(path.join(dir, output.legacyFile))) report.mismatches.push(`옛 파일명이 남아 있음: ${output.legacyFile}`);
  }
  return report;
}

// 줄(first/second/third)마다 확률 합계를 구한다.
function lineSums(data) {
  const sums = [];
  for (const [key, byGrade] of tableEntries(data)) {
    for (const [grade, lines] of Object.entries(byGrade)) {
      for (const line of LINES) {
        const rows = lines[line] || [];
        sums.push({ key, grade, line, sum: rows.reduce((acc, row) => acc + percentNumber(row.p), 0) });
      }
    }
  }
  return sums;
}

// ---------------------------------------------------------------------------
// 6. 실행

function parseArgs(argv) {
  const args = { verify: false, dryRun: false, out: DEFAULT_OUT_DIR, snapshot: "", offline: "", changes: "", delay: DEFAULT_DELAY_MS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} 다음에 값이 필요합니다`);
      i += 1;
      return value;
    };
    if (arg === "--verify") args.verify = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--out") args.out = path.resolve(next());
    else if (arg === "--snapshot") args.snapshot = path.resolve(next());
    else if (arg === "--offline") args.offline = path.resolve(next());
    else if (arg === "--changes") args.changes = path.resolve(next());
    else if (arg === "--delay") args.delay = Number(next());
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`알 수 없는 옵션: ${arg}`);
  }
  if (!Number.isFinite(args.delay) || args.delay < MIN_DELAY_MS) args.delay = MIN_DELAY_MS;
  return args;
}

async function loadPages(args, log) {
  if (args.offline) {
    log(`스냅숏에서 읽음: ${args.offline}`);
    return readSnapshot(args.offline, PAGES);
  }
  log(`공식 페이지 ${PAGES.length}개를 읽습니다(페이지 사이 ${args.delay}ms 대기).`);
  const rawPages = await fetchOfficialPages(PAGES, { delayMs: args.delay, log });
  if (args.snapshot) {
    writeSnapshot(args.snapshot, rawPages);
    log(`원본 저장: ${args.snapshot}`);
  }
  return rawPages;
}

function summarizeSums(files) {
  let min = Infinity;
  let max = -Infinity;
  const outliers = [];
  for (const [file, data] of files) {
    for (const entry of lineSums(data)) {
      min = Math.min(min, entry.sum);
      max = Math.max(max, entry.sum);
      if (Math.abs(entry.sum - 100) > 0.1) outliers.push(`${file} ${entry.key}/${entry.grade}/${entry.line} = ${entry.sum.toFixed(5)}%`);
    }
  }
  return { min, max, outliers };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (message) => console.log(message);
  if (args.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 17).join("\n"));
    return 0;
  }

  const rawPages = await loadPages(args, log);
  const { parsedById, problems } = parseAllPages(rawPages);
  if (problems.length) {
    console.error(`공식 표를 해석하지 못한 부분이 있어 중단합니다(${problems.length}건):`);
    for (const problem of problems.slice(0, 40)) console.error(`  - ${problem}`);
    return 2;
  }
  const officialRows = [...parsedById.values()].reduce(
    (sum, parsed) => sum + parsed.keyOrder.reduce((acc, key) => acc + Object.values(parsed.tables[key]).reduce((a, b) => a + b.first.length + b.second.length, 0), 0),
    0,
  );
  log(`공식 표 ${[...parsedById.values()].reduce((sum, p) => sum + p.keyOrder.length, 0)}개, 행 ${officialRows}개(첫번째 + 두번째/세번째 열)를 해석했습니다.`);

  if (args.verify) {
    const report = verifyAgainstOfficial(parsedById, args.out);
    for (const entry of report.files) {
      log(`  ${entry.problems.length ? "불일치" : "일치"}  ${entry.file}  ${entry.matched}/${entry.rows}행 (공식 ${entry.page})`);
    }
    log(`전 행 대조: ${report.rowsMatched}/${report.rowsCompared}행 일치, 문제 ${report.mismatches.length}건`);
    for (const problem of report.mismatches.slice(0, 60)) log(`  - ${problem}`);
    return report.mismatches.length ? 1 : 0;
  }

  const generatedAt = kstTimestamp();
  const files = buildOutputFiles(parsedById, generatedAt);
  const diffByFile = new Map();
  for (const output of OUTPUTS) {
    const existing = readExistingOutput(args.out, output);
    const diff = diffOutputFile(existing ? existing.data : {}, files.get(output.file));
    diff.previousName = existing ? existing.name : "";
    diff.isNew = !existing;
    diffByFile.set(output.file, diff);
  }
  const markdown = renderChanges(diffByFile, { generatedAt });
  if (args.changes) {
    fs.mkdirSync(path.dirname(args.changes), { recursive: true });
    fs.writeFileSync(args.changes, markdown);
    log(`변경 목록 저장: ${args.changes}`);
  }

  const sums = summarizeSums(files);
  log(`줄별 확률 합계: 최소 ${sums.min.toFixed(5)}%, 최대 ${sums.max.toFixed(5)}%`);
  for (const outlier of sums.outliers) log(`  합계가 100%에서 0.1%p 넘게 벗어남: ${outlier}`);

  let written = 0;
  for (const output of OUTPUTS) {
    const diff = diffByFile.get(output.file);
    const t = diff.totals;
    log(`  ${output.file}: 같음 ${t.same}, 정밀도 ${t.precision}, 확률 ${t.probability}, 삭제 ${t.removed}, 추가 ${t.added}, 표기 ${t.textOnly}${diff.keysAdded.length ? `, 새 키 ${diff.keysAdded.length}` : ""}${diff.keysRemoved.length ? `, 없어진 키 ${diff.keysRemoved.length}` : ""}`);
    if (args.dryRun) continue;
    const target = path.join(args.out, output.file);
    const next = files.get(output.file);
    const existing = readExistingOutput(args.out, output);
    const unchanged = existing && existing.name === output.file && existing.data._meta && existing.data._meta.generator === GENERATOR &&
      JSON.stringify(withoutTimestamp(existing.data)) === JSON.stringify(withoutTimestamp(next));
    if (!unchanged) {
      fs.writeFileSync(target, `${JSON.stringify(next, null, 2)}\n`);
      written += 1;
    }
    if (output.legacyFile && fs.existsSync(path.join(args.out, output.legacyFile))) {
      fs.unlinkSync(path.join(args.out, output.legacyFile));
      log(`  옛 파일 삭제: ${output.legacyFile}`);
    }
  }
  const known = new Set(OUTPUTS.map((output) => output.file));
  for (const name of fs.readdirSync(args.out)) {
    if (!known.has(name)) log(`  참고: 이 스크립트가 만들지 않는 파일이 있습니다: ${name}`);
  }
  log(args.dryRun ? "--dry-run: 파일을 쓰지 않았습니다." : `${written}개 파일을 썼습니다(${args.out}).`);
  return 0;
}

module.exports = {
  OUTPUTS,
  PAGES,
  buildOutputFiles,
  diffOutputFile,
  lineSums,
  parseLevelRange,
  parseOfficialPage,
  splitOfficialKey,
  verifyAgainstOfficial,
};

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`[sync-probability] ${error.stack || error.message}`);
      process.exitCode = 1;
    });
}
