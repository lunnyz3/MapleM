const worldDefinitions = Object.freeze([
  { canonical: "스카니아", nexon: "Scania", aliases: ["스카니아", "scania"] },
  { canonical: "루나", nexon: "Luna", aliases: ["루나", "luna"] },
  { canonical: "엘리시움", nexon: "Elysium", aliases: ["엘리시움", "elysium"] },
  { canonical: "유니온", nexon: "Union", aliases: ["유니온", "union"] },
  { canonical: "제니스", nexon: "Zenith", aliases: ["제니스", "zenith"] },
  { canonical: "아케인", nexon: "Arcane", aliases: ["아케인", "arcane"] }
]);

const worldNameAliases = new Map();
for (const world of worldDefinitions) {
  for (const alias of world.aliases) {
    worldNameAliases.set(alias, world);
  }
}

const allowedWorldNames = Object.freeze([
  "스카니아",
  "루나",
  "엘리시움",
  "유니온",
  "제니스",
  "아케인"
]);

function normalizeWorldName(input) {
  const raw = String(input || "").trim();
  if (!raw) {
    return {
      ok: false,
      worldNameInput: raw,
      allowedWorldNames
    };
  }

  const world = worldNameAliases.get(raw) || worldNameAliases.get(raw.toLowerCase());
  if (!world) {
    return {
      ok: false,
      worldNameInput: raw,
      allowedWorldNames
    };
  }

  return {
    ok: true,
    worldNameInput: raw,
    worldNameCanonical: world.canonical,
    nexonWorldName: world.nexon,
    allowedWorldNames
  };
}

module.exports = {
  allowedWorldNames,
  normalizeWorldName
};
