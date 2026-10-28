// Compares the stat engine (src/domain/stats) with maplemworlds.kr / maplemtool.com screen values
// for every character that has both a Nexon capture and a competitor capture, and writes
// docs/research/calibration/engine-report.md.
//   node scripts/dev/calibration-report.js
//
// Inputs (read only):
//   test/fixtures/characters/*.json              core 5 Nexon captures
//   docs/research/calibration/<월드>-<이름>.json  core 5 competitor captures
//   .cache/calibration/fixtures/*.json            extra Nexon captures
//   .cache/calibration/competitor/<월드>-<이름>/<월드>-<이름>.json (or <월드>-<이름>.json) extra competitor captures
const fs = require("fs");
const path = require("path");
const { computeStatSheets, computeStatSheetForSelection } = require("../../src/domain/stats/engine");
const { levelBaseAttack } = require("../../src/domain/stats/sources/character");
const { soulBoss } = require("../../src/domain/stats/sources/equipment");
const equipmentRules = require("../../src/game-data/equipment-rules.json");
const itemSetData = require("../../src/game-data/item-sets.json");
const linkRules = require("../../src/game-data/link-skills.json");
const { normalizeManualInputs } = require("../../src/domain/stats/sources/manual");

const root = path.resolve(__dirname, "../..");
const reportPath = path.join(root, "docs/research/calibration/engine-report.md");

const STAT_NAMES = Object.freeze({
  "물리 공격력": "physicalAttack",
  "마법 공격력": "magicalAttack",
  "물리 공격력%": "physicalAttackPercent",
  "마법 공격력%": "magicalAttackPercent",
  "물리 대미지": "physicalDamagePercent",
  "마법 대미지": "magicalDamagePercent",
  "보스 공격력": "bossDamage",
  "치명타 피해": "criticalDamage",
  "최대 대미지": "maxDamage",
  "최종 대미지": "finalDamage",
  "방어율 무시": "ignoreDefense"
});
// Stats are compared by role so physical and magical jobs share one row.
const ROLES = Object.freeze([
  ["깡공", ["physicalAttack", "magicalAttack"]],
  ["공격력%", ["physicalAttackPercent", "magicalAttackPercent"]],
  ["대미지", ["physicalDamagePercent", "magicalDamagePercent"]],
  ["보스 공격력", ["bossDamage"]],
  ["치명타 피해", ["criticalDamage"]],
  ["최대 대미지", ["maxDamage"]],
  ["최종 대미지", ["finalDamage"]],
  ["방어율 무시", ["ignoreDefense"]]
]);
const TOGGLES = Object.freeze({
  boss: { mw: "보스 세팅 켬(기본)", mt: "보스 프리셋(기본)", mwPreset: "보스 세팅(기본)", mtPreset: "보스 프리셋(기본)" },
  current: { mw: "게임 현재 조합", mt: "처음 조회 조합(게임 현재)", mwPreset: "게임 현재 조합", mtPreset: "처음 조회 조합(게임 현재)" }
});
const MW_PASSIVE = Object.freeze({ physicalAttackPercent: 300, magicalAttackPercent: 300, physicalDamagePercent: 60, magicalDamagePercent: 60 });
const MW_SETS = new Set(["arcane", "absolab", "chaos"]);
const MW_CASH_NAMES = ["플로라", "포니 기프트", "죽음의 데스", "초롱나비", "페어리"];
const MT_LEVEL_ATTACK = (() => {
  const rules = JSON.parse(fs.readFileSync(path.join(root, "docs/research/rules/job-passives.json"), "utf8"));
  const entry = rules.sites.maplemtool.entries.find((item) => item.id === "levelAttack");
  return { ...(entry?.value?.estimated || {}), ...(entry?.value?.measured || {}) };
})();

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function toNumber(text) {
  if (text === null || text === undefined) return null;
  const value = Number(String(text).replace(/[,%\s]/g, ""));
  return Number.isFinite(value) ? value : null;
}

function tolerance(key) {
  if (key === "ignoreDefense") return 0.001;
  if (key.endsWith("Attack") || key === "maxDamage") return 0.5;
  return 0.01;
}

function presetNumber(value) {
  if (value === null || value === undefined) return null;
  const matched = String(value).match(/\d+/);
  return matched ? Number(matched[0]) : null;
}

function findCompetitorFile(key) {
  const candidates = [
    path.join(root, "docs/research/calibration", `${key}.json`),
    path.join(root, ".cache/calibration/competitor", key, `${key}.json`),
    path.join(root, ".cache/calibration/competitor", `${key}.json`)
  ];
  return candidates.find((file) => fs.existsSync(file)) || null;
}

function listCharacters() {
  const list = [];
  const add = (dir, group) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .forEach((file) => {
        const key = file.replace(/\.json$/, "");
        if (list.some((entry) => entry.key === key)) return;
        list.push({ key, group, fixtureFile: path.join(dir, file), competitorFile: findCompetitorFile(key) });
      });
  };
  add(path.join(root, "test/fixtures/characters"), "core");
  add(path.join(root, ".cache/calibration/fixtures"), "extra");
  return list;
}

function siteValue(site, statName, toggle) {
  const stat = site?.stats?.[statName];
  return toNumber(stat?.byToggle?.[toggle] ?? (toggle.startsWith("보스") ? stat?.total : undefined));
}

// The competitor shows one side (the larger flat attack); pick our key on that side.
function roleValues(role, keys, site, toggle) {
  for (const key of keys) {
    const name = Object.keys(STAT_NAMES).find((label) => STAT_NAMES[label] === key);
    const value = siteValue(site, name, toggle);
    if (value !== null) return { key, value };
  }
  return { key: keys[0], value: null };
}

function sumBy(contributions, predicate, key) {
  return contributions.filter((entry) => entry.key === key && predicate(entry)).reduce((sum, entry) => sum + entry.value, 0);
}

function isMwCashSet(setId) {
  const [, name = "", count = "0"] = String(setId).split(":");
  return Number(count) >= 3 && (name.startsWith("마스터 ") || MW_CASH_NAMES.some((keyword) => name.includes(keyword)));
}

function mwSelfLink(sheet, character, key) {
  const pattern = linkRules.selfLinks.find((link) =>
    link.classes.some((job) => job.replace(/\s/g, "") === character.className.replace(/\s/g, ""))
  );
  const mwNoEffect = new Set(["피버킬 어드밴티지", "보스 어태커", "빛의 수호"]);
  if (!pattern || mwNoEffect.has(pattern.name)) return 0;
  const natural = linkRules.selfLinkLevelByCharacterLevel.find((rule) => character.level >= rule.minLevel)?.linkLevel || 0;
  return (pattern.perLevel[key] || 0) * natural;
}

/**
 * Rule differences between our engine and maplemworlds, per stat key: our value + delta is
 * what maplemworlds' rules give on the same data.
 */
function mwAdjustments(sheet, character, key) {
  const parts = [];
  const contributions = sheet.contributions;
  if (MW_PASSIVE[key] !== undefined) {
    const ours = sumBy(contributions, (entry) => entry.group === "passive" || entry.group === "vmatrix", key);
    const delta = MW_PASSIVE[key] - ours;
    if (Math.abs(delta) > 1e-9) parts.push({ reason: "직업 패시브+V 코어(레벨 반영) vs maplemworlds 상수", delta });
  }
  const extraSets = sumBy(
    contributions,
    (entry) =>
      (entry.group === "setEffect" || entry.group === "starforceSet") &&
      entry.setId &&
      !MW_SETS.has(entry.setId) &&
      !(String(entry.setId).startsWith("cash:") && isMwCashSet(entry.setId)),
    key
  );
  if (Math.abs(extraSets) > 1e-9) parts.push({ reason: "maplemworlds가 넣지 않는 세트(군단장·160제·차원 균열 등)", delta: -extraSets });
  if (key === "maxDamage") {
    const absolab70 = contributions.find(
      (entry) => entry.key === "maxDamage" && entry.group === "starforceSet" && entry.setId === "absolab" && entry.value === 5500000
    );
    if (absolab70) parts.push({ reason: "앱솔 스타포스 70구간 최대 대미지(maplemworlds 500만)", delta: -500000 });
  }
  if (key === "physicalAttack" || key === "magicalAttack") {
    const ours = sumBy(contributions, (entry) => entry.group === "soulSet", key);
    const label = contributions.find((entry) => entry.group === "soulSet")?.label || "";
    const matched = label.match(/^(.+) 소울 (\d+)개$/);
    const table = matched ? (equipmentRules.soulSetAttackFallback[matched[1]] || 0) * Number(matched[2]) : 0;
    if (Math.abs(ours - table) > 1e-9) parts.push({ reason: "소울 세트 공격력(API 값 vs maplemworlds 보스 표)", delta: table - ours });
  }
  const selfLink = sumBy(contributions, (entry) => entry.group === "linkSkill" && entry.label.startsWith("본인 링크"), key);
  const mwSelf = mwSelfLink(sheet, character, key);
  if (Math.abs(mwSelf - selfLink) > 1e-9) parts.push({ reason: "본인 링크(상한·링크 표 차이)", delta: mwSelf - selfLink });
  return parts;
}

// maplemtool sums 방무 per item, per set family (set + starforce), and all non-equipment sources
// together before multiplying (docs/research/calibration/README.md 4-3).
function mtIgnoreDefense(sheet) {
  const groups = new Map();
  sheet.contributions
    .filter((entry) => entry.key === "ignoreDefense")
    .forEach((entry) => {
      let group = "non-equipment";
      if (["basicOption", "additionalOption", "potential", "additionalPotential", "soul", "emblem"].includes(entry.group)) {
        group = `item:${entry.label.split(" · ")[0]}`;
      } else if (entry.group === "setEffect" || entry.group === "starforceSet" || entry.group === "arcaneSetMerged") {
        group = `set:${String(entry.setId || entry.label).split(":").slice(0, 2).join(":")}`;
      }
      groups.set(group, (groups.get(group) || 0) + entry.value);
    });
  let remaining = 1;
  groups.forEach((value) => {
    remaining *= 1 - Math.min(100, value) / 100;
  });
  return (1 - remaining) * 100;
}

function mtAdjustments(sheet, character, key) {
  const parts = [];
  if ((key === "physicalAttack" || key === "magicalAttack") && sheet.totals[key] >= Math.max(sheet.totals.physicalAttack, sheet.totals.magicalAttack)) {
    const ours = levelBaseAttack(character.level);
    const theirs = MT_LEVEL_ATTACK[String(character.level)];
    if (theirs !== undefined && theirs !== ours) parts.push({ reason: "레벨 기본 공격력 표(maplemtool)", delta: theirs - ours });
  }
  // maplemtool has no soul gauge +30 but adds a pet +30 ("펫 (개별·펫장비)"), so flat attack
  // only differs by its level table (plus its own rounding, up to 1).
  if (key === "ignoreDefense") {
    const delta = mtIgnoreDefense(sheet) - sheet.totals.ignoreDefense;
    if (Math.abs(delta) > 1e-6) parts.push({ reason: "방무 그룹 합산 후 곱(maplemtool)", delta });
  }
  if (key === "physicalDamagePercent" || key === "magicalDamagePercent") {
    const count = sheet.contributions.filter(
      (entry) => entry.key === key && entry.group === "additionalOption" && /7\.74%/.test(entry.rawText)
    ).length;
    if (count) parts.push({ reason: "추가 옵션 대미지 7.74→7.745 보정(maplemtool)", delta: 0.005 * count });
  }
  return parts;
}

// Manual-input groups on maplemworlds (verified characters keep server-saved inputs). They are
// outside the Nexon API, so they are taken out before comparing.
const MW_MANUAL_GROUPS = new Set([
  "성장>펫",
  "콘텐츠>스타코러스",
  "콘텐츠>유니온 챔피언",
  "콘텐츠>빛의 성소 축복",
  "장비>성흔",
  "콘텐츠>몬스터 컬렉션",
  "콘텐츠>명예 배지"
]);

function mwManualItems(site, statName, mode) {
  const stat = site?.stats?.[statName];
  const categories = mode === "boss" ? stat?.categories : stat?.categoriesByToggle?.[TOGGLES.current.mw];
  const values = [];
  Object.entries(categories || {}).forEach(([category, value]) => {
    (value?.items || []).forEach((item) => {
      if (MW_MANUAL_GROUPS.has(`${category}>${item.group}`) && Number.isFinite(item.valueNumber)) values.push(item.valueNumber);
    });
  });
  return values;
}

function withoutManual(key, value, manual) {
  if (value === null || !manual.length) return value;
  if (key === "ignoreDefense") {
    const remaining = manual.reduce((product, item) => product * (1 - item / 100), 1);
    return (1 - (1 - value / 100) / remaining) * 100;
  }
  return value - manual.reduce((sum, item) => sum + item, 0);
}

// maplemworlds 인증 캐릭터의 서버 저장 입력(화면 분류 '스타코러스'·'성흔'… 항목)을 우리 직접 입력
// 항목(src/game-data/manual-inputs.json)으로 옮긴 값. 유니온 챔피언·명예 배지·몬스터 컬렉션은 화면
// 합계를 만드는 등급·배지·지역 조합으로 풀었다(예: 명예 배지 치피 15 = 보스 헌터 Lv.4+3+2).
const MW_MANUAL_INPUTS = Object.freeze({
  "아케인-나로": {
    petAttack: 2252,
    starcorusAttackPercent: 36,
    starcorusDamage: 36,
    starcorusCriticalDamage: 28,
    starcorusFinalDamage: 35.5,
    starcorusMaxDamage: 485000000,
    unionChampion1: 4,
    unionChampion2: 4,
    unionChampion3: 4,
    unionChampion4: 4,
    blessingDamage: 25.03,
    blessingBossDamage: 11.63,
    blessingCriticalDamage: 16.5,
    stigmaAkan: 1,
    stigmaAzazel: 1,
    honorBadge1: 8,
    honorBadge2: 7,
    honorBadge3: 6,
    collectionIer: 1,
    collectionMuLung: 1,
    collectionEsfera: 1,
    collectionBurningCernium: 1,
    collectionLabyrinth: 1,
    collectionOdiu: 1
  },
  "크로아-여신": {
    petAttack: 2252,
    starcorusAttackPercent: 36,
    starcorusDamage: 36,
    starcorusCriticalDamage: 28,
    starcorusFinalDamage: 37,
    starcorusMaxDamage: 445000000,
    unionChampion1: 4,
    unionChampion2: 3,
    unionChampion3: 2,
    blessingDamage: 9.03,
    blessingCriticalDamage: 5.18,
    blessingFinalDamage: 4.9,
    stigmaAkan: 1,
    stigmaAzazel: 1,
    honorBadge1: 8,
    honorBadge2: 7,
    honorBadge3: 6,
    collectionIer: 1,
    collectionLabyrinth: 1
  }
});

// Our engine with maplemworlds' boss-setting selection, with and without the inputs above,
// against that site's screen totals (inputs included).
function manualInputCheck(entry) {
  const raw = MW_MANUAL_INPUTS[entry.key];
  if (!raw || !entry.competitorFile) return null;
  const fixture = readJson(entry.fixtureFile);
  const competitor = readJson(entry.competitorFile);
  const { values, warnings } = normalizeManualInputs(raw);
  if (warnings.length) throw new Error(`${entry.key} manual input warnings: ${JSON.stringify(warnings)}`);
  const base = computeStatSheets(fixture.details);
  const selection = Object.fromEntries(
    Object.entries(siteSelection(competitor, "mw", "boss")).map(([dimension, no]) => [dimension, no ?? base.boss.selection[dimension]])
  );
  const without = computeStatSheetForSelection(fixture.details, selection);
  const withManual = computeStatSheetForSelection(fixture.details, selection, { manual: values });
  const rows = ROLES.map(([roleLabel, keys]) => {
    const mwRaw = roleValues(roleLabel, keys, competitor.maplemworlds, TOGGLES.boss.mw);
    const key = mwRaw.key;
    const statName = Object.keys(STAT_NAMES).find((label) => STAT_NAMES[label] === key);
    const mwManual = mwManualItems(competitor.maplemworlds, statName, "boss");
    const mwManualDelta = mwRaw.value === null ? null : mwRaw.value - withoutManual(key, mwRaw.value, mwManual);
    const oursDelta = withManual.totals[key] - without.totals[key];
    return {
      role: roleLabel,
      key,
      without: without.totals[key],
      with: withManual.totals[key],
      oursDelta,
      mwManualDelta,
      mw: mwRaw.value,
      manualMatch: mwManualDelta !== null && Math.abs(oursDelta - mwManualDelta) <= tolerance(key),
      totalMatch: mwRaw.value !== null && Math.abs(withManual.totals[key] - mwRaw.value) <= tolerance(key)
    };
  });
  const full = computeStatSheets(fixture.details, { manual: values });
  return {
    key: entry.key,
    className: base.character.className,
    inputCount: Object.keys(values).length,
    rows,
    combatPower: {
      without: without.combatPower,
      with: withManual.combatPower,
      mw: competitor.maplemworlds?.combatPower?.["보스 세팅(기본) 전투력"] ?? null
    },
    bossSelection: { plain: base.boss.selection, manual: full.boss.selection }
  };
}

function siteSelection(competitor, site, mode) {
  const preset = competitor[site === "mw" ? "maplemworlds" : "maplemtool"]?.presets?.[TOGGLES[mode][site === "mw" ? "mwPreset" : "mtPreset"]] || {};
  if (site === "mw") {
    return {
      equipment: presetNumber(preset["장비 프리셋"]),
      android: presetNumber(preset["안드로이드 슬롯"]),
      hyper: presetNumber(preset["하이퍼 스탯"]),
      jewel: presetNumber(preset["쥬얼"]),
      link: presetNumber(preset["링크 스킬"]),
      unionStat: presetNumber(preset["유니온 스탯"])
    };
  }
  return {
    equipment: presetNumber(preset["장비"]),
    android: presetNumber(preset["기계 심장"]),
    hyper: presetNumber(preset["하이퍼 스탯"]),
    jewel: presetNumber(preset["쥬얼"]),
    link: presetNumber(preset["링크 스킬"]),
    unionStat: presetNumber(preset["유니온 스탯"])
  };
}

function compareCharacter(entry) {
  const fixture = readJson(entry.fixtureFile);
  const competitor = readJson(entry.competitorFile);
  const result = computeStatSheets(fixture.details);
  const character = { ...result.character };
  const rows = [];
  const selections = {};
  for (const mode of ["boss", "current"]) {
    const ourSheet = result[mode];
    const toggle = TOGGLES[mode];
    const siteSheets = {};
    selections[mode] = { ours: ourSheet.selection };
    for (const site of ["mw", "mt"]) {
      const theirs = siteSelection(competitor, site, mode);
      selections[mode][site] = theirs;
      // A dimension the site does not name (single preset) keeps our choice.
      const filled = Object.fromEntries(Object.entries(ourSheet.selection).map(([dimension, no]) => [dimension, theirs[dimension] ?? no]));
      const same = Object.entries(filled).every(([dimension, no]) => ourSheet.selection[dimension] === no);
      siteSheets[site] = { same, sheet: same ? ourSheet : computeStatSheetForSelection(fixture.details, filled) };
    }
    for (const [roleLabel, keys] of ROLES) {
      const sideKey = keys.length > 1 ? (ourSheet.attackType === "magical" ? keys[1] : keys[0]) : keys[0];
      const mwRaw = roleValues(roleLabel, keys, competitor.maplemworlds, toggle.mw);
      const mt = roleValues(roleLabel, keys, competitor.maplemtool, toggle.mt);
      const key = mwRaw.value !== null ? mwRaw.key : mt.value !== null ? mt.key : sideKey;
      const statName = Object.keys(STAT_NAMES).find((label) => STAT_NAMES[label] === key);
      const manual = mwManualItems(competitor.maplemworlds, statName, mode);
      const mwValue = withoutManual(key, mwRaw.value, manual);
      const tol = tolerance(key);
      const row = {
        mode,
        role: roleLabel,
        key,
        ours: ourSheet.totals[key],
        oursMw: siteSheets.mw.sheet.totals[key],
        oursMt: siteSheets.mt.sheet.totals[key],
        mwSameSelection: siteSheets.mw.same,
        mtSameSelection: siteSheets.mt.same,
        mw: mwValue,
        mwRaw: mwRaw.value,
        mwManual: manual.length ? manual : null,
        mt: mt.value
      };
      row.mwMatch = mwValue === null ? null : Math.abs(row.oursMw - mwValue) <= tol;
      row.mtMatch = mt.value === null ? null : Math.abs(row.oursMt - mt.value) <= tol;
      if (row.mwMatch === false) {
        const parts = mwAdjustments(siteSheets.mw.sheet, character, key);
        const expected = row.oursMw + parts.reduce((sum, part) => sum + part.delta, 0);
        row.mwExplained = Math.abs(expected - mwValue) <= tol * 2;
        row.mwParts = parts;
      }
      if (row.mtMatch === false) {
        const parts = mtAdjustments(siteSheets.mt.sheet, character, key);
        const expected = row.oursMt + parts.reduce((sum, part) => sum + part.delta, 0);
        const mtTolerance = key === "ignoreDefense" ? 0.002 : key.endsWith("Attack") ? 1.5 : tol * 2;
        row.mtExplained = Math.abs(expected - mt.value) <= mtTolerance;
        row.mtParts = parts;
      }
      rows.push(row);
    }
  }
  const selectionAgrees = (mode, site) => {
    const { ours } = selections[mode];
    const compared = Object.entries(selections[mode][site]).filter(([, value]) => value !== null);
    if (!compared.length) return null;
    return compared.every(([dimension, value]) => ours[dimension] === value);
  };
  const mwManualFilled = (competitor.maplemworlds?.manualInputs?.status || [])
    .filter((item) => item.status && item.status !== "미입력" && item.item !== "펫")
    .map((item) => item.item);
  return {
    key: entry.key,
    group: entry.group,
    character,
    combinationCount: result.combinationCount,
    combatPower: { boss: result.boss.combatPower, current: result.current.combatPower },
    competitorCp: {
      mwBoss: competitor.maplemworlds?.combatPower?.["보스 세팅(기본) 전투력"] ?? null,
      mwBest: competitor.maplemworlds?.combatPower?.["기본정보 · 캐릭터 최고 기록 · 최고 전투력(최고치 기준)"] ?? null,
      mtBoss: competitor.maplemtool?.combatPower?.["계산 전투력 · 보스 프리셋(기본 표시)"] ?? null
    },
    capturedAt: fixture.capturedAt || null,
    mwDataAsOf: competitor.maplemworlds?.dataAsOf || null,
    mtDataAsOf: competitor.maplemtool?.dataAsOf || null,
    mwManualFilled,
    rows,
    selections,
    bossSelection: { mw: selectionAgrees("boss", "mw"), mt: selectionAgrees("boss", "mt") },
    currentSelection: { mw: selectionAgrees("current", "mw"), mt: selectionAgrees("current", "mt") }
  };
}

function pct(numerator, denominator) {
  return denominator ? `${((numerator / denominator) * 100).toFixed(1)}% (${numerator}/${denominator})` : "-";
}

function fmt(key, value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  if (key === "ignoreDefense") return value.toFixed(3);
  if (key.endsWith("Attack") || key === "maxDamage") return Math.round(value).toLocaleString("ko-KR");
  return String(Math.round(value * 1000) / 1000);
}

function summarize(results, mode, filter = () => true) {
  return ROLES.map(([role]) => {
    const rows = results.flatMap((result) => result.rows.filter((row) => row.mode === mode && row.role === role && filter(result)));
    const withMw = rows.filter((row) => row.mw !== null);
    const withMt = rows.filter((row) => row.mt !== null);
    const either = rows.filter((row) => row.mw !== null || row.mt !== null);
    const mwMatch = withMw.filter((row) => row.mwMatch).length;
    const mtMatch = withMt.filter((row) => row.mtMatch).length;
    const eitherMatch = either.filter((row) => row.mwMatch || row.mtMatch).length;
    const mwExplained = withMw.filter((row) => row.mwMatch || row.mwExplained).length;
    const errors = withMw.map((row) => Math.abs(row.oursMw - row.mw) / Math.max(1e-9, Math.abs(row.mw)));
    const meanError = errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : null;
    const maxError = errors.length ? Math.max(...errors) : null;
    return { role, mwMatch, withMw: withMw.length, mtMatch, withMt: withMt.length, eitherMatch, either: either.length, mwExplained, meanError, maxError };
  });
}

function reasonCounts(results, mode) {
  const counts = new Map();
  results.forEach((result) =>
    result.rows
      .filter((row) => row.mode === mode && row.mwMatch === false)
      .forEach((row) =>
        (row.mwParts || []).forEach((part) => {
          const current = counts.get(part.reason) || { rows: 0, characters: new Set() };
          current.rows += 1;
          current.characters.add(result.key);
          counts.set(part.reason, current);
        })
      )
  );
  return [...counts.entries()].sort((left, right) => right[1].rows - left[1].rows);
}

// The Nexon set-effect API describes the preset in use, so for that preset our item-set table
// can be checked against the game's own numbers.
function validateSetTable(entries) {
  const { parseStatText } = require("../../src/domain/stats/text");
  const tableId = (name) => {
    const set = itemSetData.sets.find(
      (item) => (item.apiNames || []).includes(name) || (item.apiNamePattern && new RegExp(item.apiNamePattern).test(name))
    );
    return set ? set.id : null;
  };
  let agree = 0;
  const differences = [];
  const unknown = new Map();
  entries.forEach((entry) => {
    const fixture = readJson(entry.fixtureFile);
    const { current } = computeStatSheets(fixture.details);
    (fixture.details.setEffect?.data?.set_info || []).forEach((apiSet) => {
      const name = String(apiSet.set_name || "").trim();
      const id = tableId(name);
      if (!id) {
        if (!/성흔/.test(name) && !/마스터|스페셜|페어리|포니 기프트|플로라|초롱나비|죽음의 데스/.test(name)) {
          unknown.set(name, (unknown.get(name) || 0) + 1);
        }
        return;
      }
      const api = {};
      parseStatText(apiSet.set_option).forEach((item) => {
        api[item.key] = (api[item.key] || 0) + item.value;
      });
      const ours = {};
      current.contributions
        .filter((item) => item.setId === id && item.group === "setEffect")
        .forEach((item) => {
          ours[item.key] = (ours[item.key] || 0) + item.value;
        });
      const merged = current.contributions.find((item) => item.group === "arcaneSetMerged");
      if (id === "arcane" && merged) {
        const matched = merged.label.match(/세트 효과 · .*?\(\+([\d.]+)%\)/);
        if (matched) ours.ignoreDefense = Number(matched[1]);
      }
      const keys = new Set([...Object.keys(ours), ...Object.keys(api)]);
      if ([...keys].every((key) => Math.abs((ours[key] || 0) - (api[key] || 0)) < 1e-6)) agree += 1;
      else differences.push(`${entry.key} ${name}`);
    });
  });
  return { agree, differences, unknown: [...unknown.entries()] };
}

function buildReport(results, missing, setCheck, manualChecks = []) {
  const lines = [];
  const now = new Date().toISOString();
  const core = results.filter((result) => result.group === "core");
  lines.push("# 스탯 엔진 보정 보고서");
  lines.push("");
  lines.push(`- 생성: ${now} (\`node scripts/dev/calibration-report.js\`)`);
  lines.push(`- 대상: 넥슨 원본과 경쟁 사이트 화면값이 모두 있는 캐릭터 ${results.length}명(기준 ${core.length}명 + 추가 ${results.length - core.length}명). 경쟁 사이트 값이 아직 없는 캐릭터 ${missing.length}명은 빠졌다.`);
  lines.push("- 엔진: `src/domain/stats`(상수 `src/game-data/*.json`). 보스 세팅 = 장비·기계 심장·하이퍼·쥬얼·링크·유니온 스탯 프리셋 조합 중 계산 전투력 최고. HEXA 스탯은 넥슨 API의 사용 중 페이지(activate_flag=1)만 쓴다(두 사이트 53/53 같음).");
  lines.push("- 경쟁 사이트 수집·사이트 간 비교는 `docs/research/calibration/README.md`, 규칙 추출은 `docs/research/rules/`.");
  lines.push("- 일치 기준: 깡공·최대 대미지 ±0.5, % 스탯 ±0.01, 방어율 무시 ±0.001. 직업 계열(물리/마법)은 사이트가 보여 준 쪽으로 비교한다.");
  lines.push("- 스탯 비교는 각 사이트가 고른 프리셋 조합으로 우리 엔진을 다시 계산해 한다(조합 선택 차이와 규칙 차이를 나눠 보려는 것). 조합 선택이 같은지는 따로 센다.");
  lines.push("- maplemworlds 인증 캐릭터는 수동 입력(펫 깡공, 스타코러스, 성흔, 축복, 유니온 챔피언, 명예 배지, 몬스터 컬렉션)이 서버에 저장돼 화면값에 섞인다. 그 사이트 화면의 해당 항목을 빼고 비교했다(넥슨 API에 없는 값). 그 값을 우리 직접 입력으로 넣어 맞춰 본 결과는 7장.");
  lines.push("- '설명됨'은 아래 4장의 규칙 차이를 우리 값에 되돌려 넣었을 때 그 사이트 값과 같아지는 경우다. 설명되지 않는 불일치는 대부분 데이터 시점 차이(사이트가 캐시한 넥슨 데이터와 우리 캡처 시각이 다름)다.");
  lines.push("");

  for (const mode of ["boss", "current"]) {
    const title = mode === "boss" ? "보스 세팅" : "현재 착용(게임 현재 조합)";
    lines.push(`## ${mode === "boss" ? "1" : "2"}. ${title} 스탯별 일치율`);
    lines.push("");
    lines.push("| 스탯 | maplemworlds 일치 | maplemworlds 일치+설명됨 | maplemtool 일치 | 둘 중 하나 일치 | maplemworlds 대비 평균 오차 | 최대 오차 |");
    lines.push("|---|---|---|---|---|---|---|");
    summarize(results, mode).forEach((row) => {
      lines.push(
        `| ${row.role} | ${pct(row.mwMatch, row.withMw)} | ${pct(row.mwExplained, row.withMw)} | ${pct(row.mtMatch, row.withMt)} | ${pct(row.eitherMatch, row.either)} | ${row.meanError === null ? "-" : `${(row.meanError * 100).toFixed(3)}%`} | ${row.maxError === null ? "-" : `${(row.maxError * 100).toFixed(2)}%`} |`
      );
    });
    lines.push("");
    const agree = results.filter((result) => result[`${mode}Selection`].mw !== null);
    const agreeMt = results.filter((result) => result[`${mode}Selection`].mt !== null);
    lines.push(
      `- 고른 프리셋 일치: maplemworlds ${pct(agree.filter((result) => result[`${mode}Selection`].mw).length, agree.length)}, maplemtool ${pct(agreeMt.filter((result) => result[`${mode}Selection`].mt).length, agreeMt.length)}`
    );
    const mwOnly = results.flatMap((result) =>
      result.rows.filter((row) => row.mode === mode && row.mwMatch === false && !row.mwExplained && row.mtMatch === true)
    );
    const characters = new Set(
      results.filter((result) => result.rows.some((row) => mwOnly.includes(row))).map((result) => result.key)
    );
    lines.push(
      `- maplemworlds와만 다르고 maplemtool과는 같은 값: ${mwOnly.length}행 · ${characters.size}명(${[...characters].join(", ") || "-"}). maplemworlds가 캐시한 넥슨 데이터가 더 오래된 경우로 보인다.`
    );
    const reasons = reasonCounts(results, mode);
    if (reasons.length) {
      lines.push("- maplemworlds와 다른 값의 원인(규칙 차이, 행 수 · 캐릭터 수):");
      reasons.forEach(([reason, value]) => lines.push(`  - ${reason}: ${value.rows}행 · ${value.characters.size}명`));
    }
    lines.push("");
  }

  lines.push("## 3. 기준 5명 보스 세팅");
  lines.push("");
  lines.push("| 캐릭터 | 스탯 | 우리 | maplemworlds | maplemtool | 맞춘 쪽 |");
  lines.push("|---|---|---|---|---|---|");
  core.forEach((result) => {
    result.rows
      .filter((row) => row.mode === "boss")
      .forEach((row) => {
        const side = row.mwMatch && row.mtMatch ? "둘 다" : row.mwMatch ? "maplemworlds" : row.mtMatch ? "maplemtool" : "없음";
        lines.push(`| ${result.key} | ${row.role} | ${fmt(row.key, row.ours)} | ${fmt(row.key, row.mwRaw)} | ${fmt(row.key, row.mt)} | ${side} |`);
      });
  });
  lines.push("");
  lines.push("- 전투력은 두 사이트와 같은 공식이다. maplemworlds가 보스 세팅 화면에 보이는 전투력은 활성 HEXA 스탯 페이지가 1이 아니면 HEXA 스탯을 빼고 계산한 값으로 보인다(그 사이트 표시 스탯으로 다시 계산하면 '최고 기록' 열과 같다). 성령의 최고 기록은 서버에 저장된 과거 최고값이다.");
  lines.push("");
  lines.push("| 캐릭터 | 우리 보스 세팅(장비/심장/하이퍼/쥬얼/링크/유니온) | 조합 수 | 우리 전투력 | maplemworlds 표시 전투력 | maplemworlds 최고 기록 | maplemtool 전투력 |");
  lines.push("|---|---|---|---|---|---|---|");
  core.forEach((result) => {
    const sel = result.selections.boss.ours;
    const text = ["equipment", "android", "hyper", "jewel", "link", "unionStat"].map((dimension) => sel[dimension] ?? "-").join("/");
    lines.push(
      `| ${result.key} | ${text} | ${result.combinationCount} | ${result.combatPower.boss.toLocaleString("ko-KR")} | ${result.competitorCp.mwBoss?.toLocaleString("ko-KR") ?? "-"} | ${result.competitorCp.mwBest?.toLocaleString("ko-KR") ?? "-"} | ${result.competitorCp.mtBoss?.toLocaleString("ko-KR") ?? "-"} |`
    );
  });
  lines.push("");

  lines.push("## 4. 사이트와 다르게 정한 규칙");
  lines.push("");
  lines.push("두 사이트가 같으면 그대로 따랐다. 다를 때 고른 쪽과 근거:");
  lines.push("");
  lines.push("| 항목 | maplemworlds | maplemtool | 우리 | 근거 |");
  lines.push("|---|---|---|---|---|");
  lines.push("| 공격력%·대미지 패시브 | 상수 300·60 | 직업 패시브 50·35 + V 코어 레벨 | maplemtool | V 코어 공식은 운영자 확인값. 만렙이면 두 방식이 같다 |");
  lines.push("| 그 밖의 장비 세트(군단장·보스 전리품·160제·루타비스·차원 균열 등) | 넣지 않음 | 넣음 | maplemtool | 넥슨 set-effect API가 현재 착용 세트로 이 효과를 보고한다 |");
  lines.push("| 160제·루타비스·도전자 스타포스 세트, 앱솔 빌림 | 없음 | 있음 | maplemtool | 같은 이유, 2026-07-30 '세트옵션 자동 보정' |");
  lines.push("| 앱솔 스타포스 70구간 최대 대미지 | 500만 | 550만 | 550만 | 공식 스크린샷(docs/game-data-audit.md G05) |");
  lines.push("| 소울 세트 공격력 | 자체 표(칼로스·카링 등 0) | API soul_set_option | API | 넥슨 API가 프리셋마다 값을 준다 |");
  lines.push("| 레벨 기본 공격력 | 기준점 보간 | 자체 표(14~16 큼) | maplemworlds | 두 표 모두 실측 섞임. 깡공이 maplemworlds와 정확히 맞는다 |");
  lines.push("| 소울 게이지 +30 | 넣음 | 없음 | maplemworlds | 기본은 maplemworlds |");
  lines.push("| 방어율 무시 곱연산 | 옵션 줄마다(아케인 세트+스타포스만 합산) | 아이템·세트 이름별 합산 후 | maplemworlds | 운영자 지정 기준 |");
  lines.push("| 본인 링크 | 항상 더함 | 장착 링크와 합쳐 최대 레벨에서 자름 | maplemtool | 상한 미만이면 같다 |");
  lines.push("| 추가 옵션 대미지 7.74% | 그대로 | 7.745로 보정 | maplemworlds | 표시 반올림 보정이라 근거 약함 |");
  lines.push("| 사냥용 링크 프리셋(엘프의 축복 경험치) | 보스 세팅 후보에서 뺌 | 후보에 넣음 | maplemtool | 운영 정의(프리셋 조합 중 계산 전투력 최고). 조합 수도 maplemtool 표시와 같다(디올 324, 피카츄 144). game-data 스위치 excludeFromBossSetting |");
  lines.push("");
  lines.push("두 사이트와 같게 둔 기본 조건:");
  lines.push("");
  lines.push("- 넥슨 API에 없는 수동 입력(스타코러스, 컨스텔라 코어, 유니온 챔피언, 축복, 성흔, 명예 배지, 몬스터 컬렉션, 펫 깡공)은 기본 0이다. 그래서 계산 전투력은 공식 랭킹 전투력보다 낮다(두 사이트 중앙값 기준 공식이 약 1.29배, README 2-2). 화면에는 '계산 전투력(추정)'으로 표시한다. 사용자가 '직접 입력'(POST /api/v2/character-stats, 항목 src/game-data/manual-inputs.json)으로 넣으면 더하고 보스 세팅 조합도 다시 고른다(7장). 컨스텔라 코어는 두 사이트처럼 전투력 밖이다.");
  lines.push("- 성흔 세트(API 세트명에 '성흔')와 길드 공용 스킬은 넣지 않는다. 지하수로·전장 전용 길드 어빌리티도 뺀다.");
  lines.push("- 깡공은 넥슨 API 능력치 값이 아니라 출처 합 + 레벨 기본 공격력으로 만든다.");
  lines.push("- 전투력 공식에 방어율 무시와 치명타 확률은 들어가지 않는다.");
  lines.push("");

  if (setCheck) {
    lines.push("세트 표 검증: 현재 착용 프리셋은 넥슨 set-effect API가 세트 효과를 직접 알려 주므로 우리 세트 표(src/game-data/item-sets.json, 개수·럭키·빌림 규칙 포함)와 대조했다.");
    lines.push("");
    lines.push(`- 일치 ${setCheck.agree} / ${setCheck.agree + setCheck.differences.length}개 세트${setCheck.differences.length ? ` (다름: ${setCheck.differences.join(", ")})` : ""}`);
    lines.push(`- 표에 없는 API 세트(전투 스탯 없음): ${setCheck.unknown.map(([name, count]) => `${name} ${count}명`).join(", ") || "없음"}`);
    lines.push("");
  }
  lines.push("## 5. 설명되지 않은 불일치");
  lines.push("");
  const unexplained = [];
  results.forEach((result) =>
    result.rows
      .filter((row) => row.mwMatch === false && !row.mwExplained && row.mtMatch !== true && !(row.mtMatch === false && row.mtExplained))
      .forEach((row) => unexplained.push({ result, row }))
  );
  if (!unexplained.length) {
    lines.push("없음.");
  } else {
    lines.push("| 캐릭터 | 모드 | 스탯 | 우리(mw 조합) | maplemworlds | 우리(mt 조합) | maplemtool | 적용한 규칙 차이 | 데이터 시점(우리 / mw / mt) |");
    lines.push("|---|---|---|---|---|---|---|---|---|");
    unexplained.forEach(({ result, row }) => {
      const parts = [...(row.mwParts || [])].map((part) => `${part.reason} ${part.delta > 0 ? "+" : ""}${fmt(row.key, part.delta)}`).join("; ") || "-";
      const manual = row.mwManual ? ` (수동 입력 ${row.mwManual.length}개 뺌)` : "";
      lines.push(
        `| ${result.key} | ${row.mode === "boss" ? "보스" : "현재"} | ${row.role} | ${fmt(row.key, row.oursMw)} | ${fmt(row.key, row.mw)}${manual} | ${fmt(row.key, row.oursMt)} | ${fmt(row.key, row.mt)} | ${parts} | ${result.capturedAt?.slice(0, 16) || "-"} / ${result.mwDataAsOf || "-"} / ${result.mtDataAsOf || "-"} |`
      );
    });
  }
  lines.push("");

  lines.push("## 6. 캐릭터별 결과");
  lines.push("");
  lines.push("| 캐릭터 | 직업 | 보스 세팅 mw 일치 스탯 | mt 일치 스탯 | 프리셋 일치(mw/mt) | 현재 착용 mw 일치 | mt 일치 |");
  lines.push("|---|---|---|---|---|---|---|");
  results.forEach((result) => {
    const count = (mode, site) => {
      const rows = result.rows.filter((row) => row.mode === mode && row[site] !== null);
      return `${rows.filter((row) => row[`${site}Match`]).length}/${rows.length}`;
    };
    const flag = (value) => (value === null ? "-" : value ? "O" : "X");
    lines.push(
      `| ${result.key} | ${result.character.className} | ${count("boss", "mw")} | ${count("boss", "mt")} | ${flag(result.bossSelection.mw)}/${flag(result.bossSelection.mt)} | ${count("current", "mw")} | ${count("current", "mt")} |`
    );
  });
  lines.push("");
  if (missing.length) {
    lines.push(`경쟁 사이트 값이 아직 없는 캐릭터: ${missing.join(", ")}`);
    lines.push("");
  }

  if (manualChecks.length) {
    lines.push("## 7. 직접 입력 대조 (maplemworlds 인증 캐릭터)");
    lines.push("");
    lines.push("maplemworlds 인증 캐릭터는 수동 입력이 서버에 저장돼 화면 합계에 들어 있다. 그 화면의 수동 입력 항목(스타코러스·성흔·축복·유니온 챔피언·명예 배지·몬스터 컬렉션·펫)을 우리 직접 입력 항목으로 옮겨 넣고(scripts/dev/calibration-report.js `MW_MANUAL_INPUTS`), 그 사이트가 고른 보스 세팅 조합으로 다시 계산했다.");
    lines.push("");
    lines.push("- '입력 기여'는 우리 엔진에서 직접 입력이 더한 값, 'mw 입력 항목'은 그 사이트 화면의 수동 입력 항목 합(방어율 무시는 곱연산으로 환산)이다. 둘이 같으면 입력 규칙이 같다는 뜻이다.");
    lines.push("- '합계 차이'는 직접 입력을 넣은 우리 합계 − 그 사이트 화면 합계다. 남는 차이는 입력과 무관한 1·4장의 규칙 차이다.");
    lines.push("");
    manualChecks.forEach((check) => {
      const matched = check.rows.filter((row) => row.manualMatch).length;
      lines.push(`### ${check.key} (${check.className}, 입력 ${check.inputCount}개)`);
      lines.push("");
      lines.push("| 스탯 | 우리(입력 없음) | 우리(직접 입력) | 입력 기여 | mw 입력 항목 | maplemworlds 화면 | 합계 차이 |");
      lines.push("|---|---|---|---|---|---|---|");
      check.rows.forEach((row) => {
        const gap = row.mw === null ? null : row.with - row.mw;
        const diff = gap === null ? "-" : fmt(row.key, Math.abs(gap) < tolerance(row.key) / 10 ? 0 : gap);
        lines.push(
          `| ${row.role} | ${fmt(row.key, row.without)} | ${fmt(row.key, row.with)} | ${fmt(row.key, row.oursDelta)} | ${row.mwManualDelta === null ? "-" : fmt(row.key, row.mwManualDelta)}${row.manualMatch ? " ✓" : ""} | ${fmt(row.key, row.mw)} | ${diff} |`
        );
      });
      lines.push("");
      lines.push(`- 입력 기여 일치 ${matched}/${check.rows.length}, 합계 일치 ${check.rows.filter((row) => row.totalMatch).length}/${check.rows.length}.`);
      lines.push(
        `- 계산 전투력(mw 조합): 입력 없음 ${fmt("physicalAttack", check.combatPower.without)} → 직접 입력 ${fmt("physicalAttack", check.combatPower.with)}, maplemworlds 화면 ${fmt("physicalAttack", check.combatPower.mw)}.`
      );
      const same = JSON.stringify(check.bossSelection.plain) === JSON.stringify(check.bossSelection.manual);
      lines.push(`- 우리 보스 세팅 조합: 입력 없음 ${JSON.stringify(check.bossSelection.plain)} → 직접 입력 ${same ? "같음" : JSON.stringify(check.bossSelection.manual)}.`);
      lines.push("");
    });
  }
  return lines.join("\n");
}

function run() {
  const characters = listCharacters();
  const missing = characters.filter((entry) => !entry.competitorFile).map((entry) => entry.key);
  const results = [];
  characters
    .filter((entry) => entry.competitorFile)
    .forEach((entry) => {
      try {
        const competitor = readJson(entry.competitorFile);
        if (!competitor?.maplemworlds?.stats && !competitor?.maplemtool?.stats) {
          missing.push(entry.key);
          return;
        }
        results.push(compareCharacter(entry));
      } catch (error) {
        console.error(`skip ${entry.key}: ${error.message}`);
        missing.push(entry.key);
      }
    });
  const setCheck = validateSetTable(characters);
  const manualChecks = characters.map((entry) => manualInputCheck(entry)).filter(Boolean);
  fs.writeFileSync(reportPath, `${buildReport(results, missing, setCheck, manualChecks)}\n`);
  console.log(`report: ${path.relative(root, reportPath)} (${results.length} characters, ${missing.length} without competitor data)`);
  return results;
}

if (require.main === module) {
  run();
}

module.exports = { run, compareCharacter, listCharacters };
