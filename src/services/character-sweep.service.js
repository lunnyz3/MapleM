// Candidate list for a level sweep (e.g. everyone at Lv.270+). Nexon rankings only go down to the
// top 10,000 (the level ranking ends around Lv.283), so the list is widened through guilds: every
// guild seen in the character rankings and the guild rankings is opened, and its member list
// carries each member's level.
//
// Dependencies are injected (see scripts/data/sweep-characters.js).
const CHARACTER_RANKINGS = ["level", "combat-power", "root-of-time", "union", "achievement"];
const GUILD_RANKINGS = ["sharenian-waterway", "sharenian-battlefield"];
const MAX_PAGES = 50;

/**
 * @param {{
 *   fetchRanking: (type: string, page: number) => Promise<any[]>,
 *   fetchGuildMembers: (worldName: string, guildName: string) => Promise<Array<{ character_name: string, character_level: number }>>,
 *   minLevel: number,
 *   guildWorkers?: number,
 *   logger?: { log: Function }
 * }} deps
 * @returns {Promise<{ rows: any[], stats: Record<string, number> }>} rows: highest level first
 */
async function sweepCandidates({ fetchRanking, fetchGuildMembers, minLevel, guildWorkers = 4, logger = console }) {
  /** @type {Map<string, any>} */
  const people = new Map();
  /** @type {Map<string, { world: string, guild: string }>} */
  const guilds = new Map();
  const keyOf = (world, name) => `${world}\u0000${name}`;
  const addGuild = (world, guild) => {
    if (world && guild) guilds.set(keyOf(world, guild), { world, guild });
  };
  const addPerson = (row) => {
    const world = String(row?.world_name || "").trim();
    const name = String(row?.character_name || "").trim();
    if (!world || !name) return;
    const key = keyOf(world, name);
    const known = people.get(key) || { world_name: world, character_name: name };
    const level = Number(row.character_level) || 0;
    people.set(key, {
      ...known,
      character_level: Math.max(Number(known.character_level) || 0, level),
      character_class: known.character_class || row.character_class || "",
      character_combat_power: known.character_combat_power || row.character_combat_power || null,
      date: known.date || (row.character_combat_power ? row.date : undefined)
    });
  };

  for (const type of CHARACTER_RANKINGS) {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const rows = await fetchRanking(type, page);
      if (!rows.length) break;
      rows.forEach((row) => {
        addPerson(row);
        addGuild(String(row.world_name || "").trim(), String(row.guild_name || "").trim());
      });
    }
  }
  for (const type of GUILD_RANKINGS) {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const rows = await fetchRanking(type, page);
      if (!rows.length) break;
      rows.forEach((row) => addGuild(String(row.world_name || "").trim(), String(row.guild_name || "").trim()));
    }
  }
  logger.log(`[sweep] rankings: ${people.size} characters, ${guilds.size} guilds`);

  const queue = [...guilds.values()];
  let opened = 0;
  let failed = 0;
  const worker = async () => {
    while (queue.length) {
      const { world, guild } = queue.shift();
      try {
        const members = await fetchGuildMembers(world, guild);
        members.forEach((member) => addPerson({ ...member, world_name: world }));
        opened += 1;
      } catch {
        failed += 1;
      }
      if ((opened + failed) % 500 === 0) logger.log(`[sweep] guilds ${opened + failed}/${guilds.size}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, guildWorkers) }, worker));

  const all = [...people.values()];
  const rows = all.filter((row) => row.character_level >= minLevel).sort((a, b) => b.character_level - a.character_level);
  const stats = {
    characters: all.length,
    unknownLevel: all.filter((row) => !row.character_level).length,
    guilds: guilds.size,
    guildsOpened: opened,
    guildsFailed: failed,
    candidates: rows.length
  };
  logger.log(`[sweep] ${JSON.stringify(stats)}`);
  return { rows, stats };
}

module.exports = { sweepCandidates, CHARACTER_RANKINGS, GUILD_RANKINGS };
