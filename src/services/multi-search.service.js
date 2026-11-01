// 멀티서치(/multi): 붙여 넣은 이름들을 모은 스펙에서 찾고, 없는 이름은 넥슨에서 바로 조회한다(캐릭터 화면을 연 것처럼 장비·스펙을
// 기록해 다음부터는 모은 스펙에서 나온다). 이름 후보(name, alts)는 앞에서부터 처음 찾은 것, 월드를 모르면 7월드 모두
// (넥슨은 hint 월드부터, 찾으면 멈춤). 넥슨 호출은 한 번에 NEXON_BUDGET 번까지.
const mongoose = require("mongoose");
const { CharacterSpec } = require("../models/character-spec.model");
const { allowedWorldNames } = require("../config/worlds");
const { getCharacterOcid, getCharacterByOcid } = require("./maplestorym.service");
const { recordCharacterItems } = require("./item-ranking.service");
const { observeCombatPower } = require("./combat-power.service");
const { plausiblePowers } = require("./stats.service");

const MAX_ENTRIES = 30;
const MAX_CANDIDATES = 3;
const NEXON_CANDIDATES = 2;
const NEXON_BUDGET = 240;
const NEXON_WORKERS = 6;
const DB_TIMEOUT_MS = 3000;
const SPEC_FIELDS = {
  _id: 0,
  ocid: 1,
  worldName: 1,
  characterName: 1,
  characterClass: 1,
  characterLevel: 1,
  combatPower: 1,
  itemScore: 1,
  potential: 1,
  additionalPotential: 1,
  checkedAt: 1
};
const PATH = {
  basic: "/maplestorym/v1/character/basic",
  stat: "/maplestorym/v1/character/stat",
  items: "/maplestorym/v1/character/item-equipment"
};

const isMongoConnected = () => mongoose.connection.readyState === 1;
const specKey = (world, name) => `${world}\u0000${name}`;

/** 넥슨에서 찾은 캐릭터의 장비·스펙을 기록하고 스펙 한 줄(장비가 없으면 기본 정보만) */
async function recordFromNexon(ocid, world, name) {
  const read = (path) => getCharacterByOcid(path, ocid).then((result) => result?.data || null, () => null);
  const [basic, stat, itemData] = await Promise.all([read(PATH.basic), read(PATH.stat), read(PATH.items)]);
  const entry = (Array.isArray(stat?.stat) ? stat.stat : []).find((item) => String(item?.stat_name || "").trim() === "전투력");
  const statPower = Number(String(entry?.stat_value ?? "").replace(/[^0-9.]/g, "")) || 0;
  const power = statPower > 0 ? ((await observeCombatPower(ocid, [{ value: statPower, source: "stat" }]).catch(() => null))?.value ?? statPower) : null;
  const owner = {
    ocid,
    worldName: world,
    characterName: String(basic?.character_name || name),
    characterClass: String(basic?.character_class || ""),
    characterLevel: Number(basic?.character_level) || 0
  };
  if (itemData) {
    await recordCharacterItems({ ...owner, itemData, combatPower: power, source: "lookup" }).catch(() => null);
    const spec = await CharacterSpec.findOne({ ocid }, SPEC_FIELDS).maxTimeMS(DB_TIMEOUT_MS).lean();
    if (spec) return spec;
  }
  return { ...owner, combatPower: power || 0, itemScore: 0, potential: 0, additionalPotential: 0, checkedAt: new Date() };
}

/** 이름 후보 앞에서 둘까지 × 월드 순서대로 넥슨에서 찾기. 남은 호출이 없으면 null */
async function lookupNexon(names, worlds, budget) {
  for (const name of names.slice(0, NEXON_CANDIDATES)) {
    for (const world of worlds) {
      if (budget.left <= 0) {
        budget.out = true;
        return null;
      }
      budget.left -= 1;
      const ocid = (await getCharacterOcid(name, world).catch(() => null))?.data?.ocid;
      if (!ocid) continue;
      budget.left -= 3;
      return recordFromNexon(ocid, world, name);
    }
  }
  return null;
}

/**
 * @param {Array<{ world: string, name: string, alts?: string[] }>} entries
 * @param {{ worldName?: string, hint?: string }} [options] worldName: 월드를 모르는 이름을 찾을 월드, hint: 넥슨에서 먼저 볼 월드
 * @returns {Promise<{ rows: object[], partial: boolean }>} rows: [{ input, world, name, className, level, power, itemScore, potential,
 *   additionalPotential, checkedAt }] (input = entries 순번, 같은 이름이 여러 월드에 있으면 모두). partial: 넥슨 호출이 모자라 다 못 찾음
 */
async function multiSearch(entries, { worldName = "", hint = "" } = {}) {
  if (!isMongoConnected()) return { rows: [], partial: false };
  const list = entries.slice(0, MAX_ENTRIES).map((entry) => ({
    names: [entry.name, ...(entry.alts || [])].slice(0, MAX_CANDIDATES),
    worlds: entry.world ? [entry.world] : worldName ? [worldName] : allowedWorldNames
  }));

  const byWorld = new Map();
  for (const { names, worlds } of list) {
    for (const world of worlds) {
      if (!byWorld.has(world)) byWorld.set(world, new Set());
      names.forEach((name) => byWorld.get(world).add(name));
    }
  }
  const stored = new Map();
  const found = await Promise.all(
    [...byWorld].map(([world, names]) => CharacterSpec.find({ worldName: world, characterName: { $in: [...names] } }, SPEC_FIELDS).maxTimeMS(DB_TIMEOUT_MS).lean())
  );
  for (const spec of found.flat()) {
    const key = specKey(spec.worldName, spec.characterName);
    stored.set(key, [...(stored.get(key) || []), spec]);
  }

  const hits = [];
  const missing = [];
  list.forEach(({ names, worlds }, input) => {
    for (const name of names) {
      const specs = worlds.flatMap((world) => stored.get(specKey(world, name)) || []);
      if (specs.length) return specs.forEach((spec) => hits.push({ spec, input }));
    }
    missing.push(input);
  });

  const budget = { left: NEXON_BUDGET, out: false };
  let next = 0;
  const worker = async () => {
    while (next < missing.length) {
      const input = missing[next];
      next += 1;
      const { names, worlds } = list[input];
      const order = hint && worlds.includes(hint) ? [hint, ...worlds.filter((world) => world !== hint)] : worlds;
      const spec = await lookupNexon(names, order, budget).catch(() => null);
      if (spec) hits.push({ spec, input });
    }
  };
  await Promise.all(Array.from({ length: Math.min(NEXON_WORKERS, missing.length) }, worker));

  const seen = new Set();
  const unique = hits.filter(({ spec }) => !seen.has(spec.ocid) && seen.add(spec.ocid));
  const powers = await plausiblePowers(unique.map(({ spec }) => spec)).catch(() => unique.map(() => 0));
  const rows = unique.map(({ spec, input }, index) => ({
    input,
    world: spec.worldName,
    name: spec.characterName,
    className: spec.characterClass || "",
    level: spec.characterLevel || 0,
    power: powers[index] || 0,
    itemScore: spec.itemScore || 0,
    potential: spec.potential || 0,
    additionalPotential: spec.additionalPotential || 0,
    checkedAt: spec.checkedAt
  }));
  return { rows, partial: budget.out };
}

module.exports = { multiSearch, MAX_CANDIDATES };
