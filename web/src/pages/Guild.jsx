// 길드 화면: /preview/guild(길드 검색) · /preview/guild/<월드>/<이름>(길드 상세).
// 데이터: GET /api/maplestorym/guild/id → GET /api/maplestorym/guild/basic, 길드원 썸네일은 /api/maplestorym/character/image.
import "../styles/guild.css";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Avatar } from "../components/Avatar.jsx";
import { Card } from "../components/Card.jsx";
import { WorldIcon } from "../components/GameIcons.jsx";
import { Icon } from "../components/Icon.jsx";
import { Aurora, CountUp, Particles, Reveal, SplitText, Tilt, spotlightHandlers } from "../components/Motion.jsx";
import { SearchBox } from "../components/SearchBox.jsx";
import { Skeleton } from "../components/Skeleton.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { Segmented, TabPanel, Tabs } from "../components/Tabs.jsx";
import { toast } from "../components/Toast.jsx";
import { loadCharacterImage, peekCharacterClass } from "../lib/api.js";
import { loadGuild } from "../lib/data.js";
import { formatComma, formatDateDot, formatKoreanUnits, formatRelativeTime, toNumber } from "../lib/format.js";
import { WORLDS, urls } from "../lib/game.js";
import { useInView } from "../lib/motion.js";
import { copyText, sharePageUrl } from "../lib/share.js";
import { addRecent, entryKey, toggleFavorite, useSaved } from "../lib/storage.js";

/** 길드 건물 5종(기존 화면과 같은 이름 규칙·그림) */
const BUILDINGS = [
  { key: "library", label: "길드 도서관", art: "/assets/guild-library.png", words: ["도서관", "library"] },
  { key: "mapletree", label: "길드 메이플나무", art: "/assets/guild-mapletree.png", words: ["메이플", "나무", "maple", "tree"] },
  { key: "accountant", label: "길드 회계사", art: "/assets/guild-accountant.png", words: ["회계", "account"] },
  { key: "campfire", label: "길드 캠프파이어", art: "/assets/guild-campfire.png", words: ["캠프", "camp", "모닥불"] },
  { key: "chef", label: "길드 요리사", art: "/assets/guild-chef.png", words: ["요리", "chef", "cook"] }
];

const TAB_ITEMS = [
  { id: "members", label: "길드원", icon: "user" },
  { id: "skills", label: "길드 스킬", icon: "sparkle" },
  { id: "buildings", label: "건물", icon: "home" },
  { id: "abilities", label: "어빌리티", icon: "medal" }
];

/** @typedef {{ name: string, level: number | null, activity: number | null, job: string, master: boolean }} Member */

/**
 * 넥슨 guild/basic 응답 → 화면용 값.
 * @param {Record<string, any>} raw @param {string} world @param {string} name
 */
function shapeGuild(raw, world, name) {
  const list = (/** @type {unknown} */ value) => (Array.isArray(value) ? value : []);
  const master = String(raw.guild_master_name || "");
  /** @type {Member[]} */
  const members = list(raw.guild_member).map((member) => ({
    name: String(member?.character_name || "-"),
    level: toNumber(member?.character_level),
    activity: toNumber(member?.guild_activity),
    job: String(member?.character_class || member?.character_job_name || "").trim(),
    master: String(member?.character_name || "") === master
  }));
  const buildingRows = list(raw.guild_building).map((row) => ({ name: String(row?.building_name || ""), level: toNumber(row?.building_level) ?? 0 }));
  const buildings = BUILDINGS.map((slot) => {
    const found = buildingRows.find((row) => slot.words.some((word) => row.name.toLowerCase().includes(word)));
    return { ...slot, name: found?.name ? `길드 ${found.name}`.replace(/^길드 길드/, "길드") : slot.label, level: found?.level ?? 0 };
  }).sort((a, b) => b.level - a.level);
  return {
    name: String(raw.guild_name || name),
    world: String(raw.world_name || world),
    level: toNumber(raw.guild_level),
    created: String(raw.guild_create_date || "").slice(0, 10),
    mark: String(raw.guild_mark_icon || ""),
    master,
    memberCount: toNumber(raw.guild_member_count) ?? members.length,
    keywords: list(raw.guild_keyword).map(String).filter(Boolean),
    members,
    skills: list(raw.guild_skill).map((skill) => ({
      name: String(skill?.skill_name || "-"),
      level: skill?.skill_level ?? "-",
      option: String(skill?.skill_option || ""),
      icon: String(skill?.skill_icon || "")
    })),
    buildings,
    abilities: list(raw.guild_ability).map((ability) => {
      const fullName = String(ability?.ability_name || "-");
      return {
        no: ability?.ability_no ?? "",
        // "Lv.3 조금만 깎아주세요" → 레벨은 배지로 따로 보여준다.
        name: fullName.replace(/^\s*Lv\.?\s*\d+\s*/i, "") || fullName,
        level: toNumber(ability?.ability_level),
        option: String(ability?.ability_option || ""),
        icon: String(ability?.ability_icon || "")
      };
    })
  };
}

/** @typedef {ReturnType<typeof shapeGuild>} GuildView */

/** @param {{ src?: string, size?: number }} props */
function GameIcon({ src, size = 40 }) {
  return (
    <span class="gd-icon" style={{ "--icon-size": `${size}px` }} aria-hidden="true">
      {src ? <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" /> : <Icon name="sparkle" size={Math.round(size * 0.55)} />}
    </span>
  );
}

/**
 * 길드 머리: 오로라 · 길드 마크(틸트) · 이름 · 레벨/길드원/마스터/창설 · 즐겨찾기 · 링크 복사.
 * @param {{ guild: GuildView }} props
 */
function GuildHero({ guild }) {
  const saved = useSaved();
  const entry = { kind: /** @type {const} */ ("guild"), world: guild.world, name: guild.name };
  const favorite = saved.favorites.some((item) => entryKey(item) === entryKey(entry));

  const copyLink = async () => {
    const url = await sharePageUrl(urls.guild(guild.world, guild.name));
    toast((await copyText(url)) ? "링크를 복사했어요" : url, "success");
  };

  return (
    <section class="gd-hero" aria-labelledby="gd-name">
      <Aurora tone="mint" />
      <Particles count={14} />
      <Tilt maxDeg={16} scale={1.05} class="gd-hero__art">
        <div class="gd-hero__stage">
          {guild.mark ? <img src={guild.mark} alt={`${guild.name} 길드 마크`} width={96} height={96} /> : <Icon name="flag" size={56} />}
        </div>
      </Tilt>
      <div class="gd-hero__info">
        <p class="gd-hero__eyebrow">
          <span class="gd-hero__world">
            <WorldIcon world={guild.world} size={16} />
            {guild.world}
          </span>
          {guild.keywords.map((keyword) => (
            <span key={keyword} class="gd-hero__keyword">
              #{keyword}
            </span>
          ))}
        </p>
        <h1 id="gd-name" class="gd-hero__name display">
          <SplitText text={guild.name} stagger={55} />
        </h1>
        <ul class="gd-hero__chips">
          <li class="chip gd-chip--level spotlight" {...spotlightHandlers()}>
            <Icon name="flag" size={18} />
            <span class="chip__label">길드 레벨</span>
            <strong class="chip__value display num">Lv.{guild.level ?? "-"}</strong>
          </li>
          {guild.master ? (
            <li>
              <a class="chip" href={urls.character(guild.world, guild.master)}>
                <Icon name="crown" size={18} />
                <span class="chip__label">마스터</span>
                <strong class="chip__value">{guild.master}</strong>
              </a>
            </li>
          ) : null}
          {guild.created ? (
            <li class="chip">
              <Icon name="clock" size={18} />
              <span class="chip__label">창설</span>
              <strong class="chip__value num">{formatDateDot(guild.created)}</strong>
            </li>
          ) : null}
        </ul>
        <div class="gd-hero__actions">
          <button
            type="button"
            class={`btn btn--secondary btn--sm fav-btn${favorite ? " is-on" : ""}`}
            aria-pressed={favorite ? "true" : "false"}
            onClick={() => toggleFavorite(entry)}
          >
            <Icon name="heart" size={18} filled={favorite} />
            {favorite ? "즐겨찾기됨" : "즐겨찾기"}
          </button>
          <button type="button" class="btn btn--secondary btn--sm gd-copy" onClick={copyLink}>
            <Icon name="link" size={18} />
            링크 복사
          </button>
          <a class="btn btn--ghost btn--sm" href={urls.legacyGuild(guild.world, guild.name)}>
            기존 화면에서 보기
            <Icon name="external" size={16} />
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * 요약 숫자 4개: 길드 레벨 · 길드원 · 총 기여도 · 평균 레벨.
 * @param {{ guild: GuildView }} props
 */
function GuildStats({ guild }) {
  const activities = guild.members.map((m) => m.activity).filter((v) => v !== null);
  const total = activities.reduce((sum, v) => sum + Number(v), 0);
  const levels = guild.members.map((m) => m.level).filter((v) => v !== null);
  const average = levels.length ? levels.reduce((sum, v) => sum + Number(v), 0) / levels.length : null;
  const tiles = [
    { key: "level", label: "길드 레벨", icon: "flag", tone: "mint", value: guild.level, prefix: "Lv.", format: (/** @type {number} */ n) => formatComma(n) },
    { key: "members", label: "길드원", icon: "user", tone: "sky", value: guild.memberCount, unit: "명", format: (/** @type {number} */ n) => formatComma(n) },
    { key: "activity", label: "총 기여도", icon: "bolt", tone: "peach", value: activities.length ? total : null, format: (/** @type {number} */ n) => formatKoreanUnits(n), full: formatComma(total) },
    { key: "avg", label: "평균 레벨", icon: "trophy", tone: "lavender", value: average !== null ? Math.round(average) : null, prefix: "Lv.", format: (/** @type {number} */ n) => formatComma(n) }
  ];
  return (
    <ul class="gd-stats">
      {tiles.map((tile, index) => (
        <li key={tile.key} class={`gd-stat tone-${tile.tone} spotlight`} style={{ "--stagger": index }} {...spotlightHandlers()}>
          <span class="gd-stat__label">
            <span class="gd-stat__icon">
              <Icon name={tile.icon} size={18} />
            </span>
            {tile.label}
          </span>
          <strong class="gd-stat__value display num" title={tile.full}>
            {tile.value !== null && tile.value !== undefined ? (
              <>
                {tile.prefix ? <span class="gd-stat__affix">{tile.prefix}</span> : null}
                <CountUp value={Number(tile.value)} format={tile.format} duration={1100} />
                {tile.unit ? <span class="gd-stat__affix">{tile.unit}</span> : null}
              </>
            ) : (
              "-"
            )}
          </strong>
        </li>
      ))}
    </ul>
  );
}

/**
 * 길드원 카드: 썸네일 · 이름(마스터 왕관) · 레벨 · 직업(썸네일 응답에 있으면) · 기여도 막대. 누르면 캐릭터 화면.
 * @param {{ member: Member, world: string, maxActivity: number, index: number }} props
 */
function MemberCard({ member, world, maxActivity, index }) {
  const ref = useRef(/** @type {HTMLLIElement | null} */ (null));
  const inView = useInView(ref, { rootMargin: "200px 0px", threshold: 0 });
  const [job, setJob] = useState(member.job || peekCharacterClass(world, member.name));

  useEffect(() => {
    if (job || !inView || member.name === "-") return undefined;
    let alive = true;
    loadCharacterImage(world, member.name).then(() => {
      const found = peekCharacterClass(world, member.name);
      if (alive && found) setJob(found);
    });
    return () => {
      alive = false;
    };
  }, [inView]);

  const share = maxActivity > 0 && member.activity !== null ? Math.max(2, (member.activity / maxActivity) * 100) : 0;
  return (
    <li ref={ref} class="gd-member" style={{ "--stagger": Math.min(index, 12) }}>
      <a class={`gd-member__link spotlight${member.master ? " is-master" : ""}`} href={urls.character(world, member.name)} {...spotlightHandlers()}>
        <span class="gd-member__avatar">
          <Avatar world={world} name={member.name} size={56} lazy />
          {member.master ? (
            <span class="gd-member__crown" title="길드 마스터">
              <Icon name="crown" size={14} />
              <span class="sr-only">길드 마스터</span>
            </span>
          ) : null}
        </span>
        <span class="gd-member__text">
          <span class="gd-member__name">{member.name}</span>
          <span class="gd-member__meta">
            <span class="num">Lv.{member.level ?? "-"}</span>
            {job ? <span>{job}</span> : null}
          </span>
          <span class="gd-member__act" title={`길드 기여도 ${formatComma(member.activity)}`}>
            <span class="gd-member__bar" aria-hidden="true">
              <span style={{ width: `${share}%` }} />
            </span>
            <span class="gd-member__act-value num">{formatKoreanUnits(member.activity)}</span>
          </span>
        </span>
        <Icon name="chevronRight" size={18} class="gd-member__go" />
      </a>
    </li>
  );
}

const SORTS = [
  { value: "activity", label: "기여도순", icon: "bolt" },
  { value: "level", label: "레벨순", icon: "trophy" },
  { value: "name", label: "이름순", icon: "user" }
];

/** @param {{ guild: GuildView }} props */
function MembersPanel({ guild }) {
  const [sort, setSort] = useState("activity");
  const [filter, setFilter] = useState("");
  const maxActivity = Math.max(0, ...guild.members.map((m) => m.activity ?? 0));
  const list = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const rows = guild.members.filter((m) => !query || m.name.toLowerCase().includes(query));
    const by = {
      activity: (/** @type {Member} */ a, /** @type {Member} */ b) => (b.activity ?? -1) - (a.activity ?? -1) || (b.level ?? 0) - (a.level ?? 0),
      level: (/** @type {Member} */ a, /** @type {Member} */ b) => (b.level ?? -1) - (a.level ?? -1) || (b.activity ?? 0) - (a.activity ?? 0),
      name: (/** @type {Member} */ a, /** @type {Member} */ b) => a.name.localeCompare(b.name, "ko-KR")
    };
    return [...rows].sort(by[/** @type {keyof typeof by} */ (sort)]);
  }, [guild, sort, filter]);

  if (!guild.members.length) return <EmptyState title="길드원 정보가 없어요" />;
  return (
    <div class="gd-members">
      <div class="gd-members__tools">
        <Segmented name="gd-sort" legend="길드원 정렬" options={SORTS} value={sort} onChange={setSort} />
        <label class="gd-filter">
          <Icon name="search" size={18} />
          <span class="sr-only">길드원 이름 찾기</span>
          <input
            type="search"
            class="gd-filter__input"
            placeholder="이름 찾기"
            maxLength={24}
            value={filter}
            onInput={(event) => setFilter(/** @type {HTMLInputElement} */ (event.currentTarget).value)}
          />
        </label>
      </div>
      {list.length ? (
        <ol class="gd-member-grid stagger-in" aria-label={`길드원 ${list.length}명`} key={sort}>
          {list.map((member, index) => (
            <MemberCard key={member.name} member={member} world={guild.world} maxActivity={maxActivity} index={index} />
          ))}
        </ol>
      ) : (
        <EmptyState compact art="search" title={`'${filter.trim()}' 길드원이 없어요`} />
      )}
    </div>
  );
}

/** @param {{ guild: GuildView }} props */
function SkillsPanel({ guild }) {
  if (!guild.skills.length) return <EmptyState title="길드 스킬 정보가 없어요" />;
  return (
    <ul class="gd-skills stagger-in">
      {guild.skills.map((skill, index) => (
        <li key={`${skill.name}-${index}`} class="gd-skill spotlight" style={{ "--stagger": index }} {...spotlightHandlers()}>
          <GameIcon src={skill.icon} size={44} />
          <span class="gd-skill__text">
            <span class="gd-skill__head">
              <strong>{skill.name}</strong>
              <span class="badge tone-mint num">Lv.{skill.level}</span>
            </span>
            {skill.option ? <span class="gd-skill__opt">{skill.option}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** @param {{ guild: GuildView }} props */
function BuildingsPanel({ guild }) {
  return (
    <ul class="gd-buildings stagger-in">
      {guild.buildings.map((building, index) => (
        <li key={building.key} style={{ "--stagger": index }}>
          <Tilt maxDeg={12} scale={1.04} class="gd-building__tilt">
            <div class={`gd-building spotlight${building.level ? "" : " is-empty"}`} {...spotlightHandlers()}>
              <span class="gd-building__art">
                <img src={building.art} alt="" loading="lazy" decoding="async" />
              </span>
              <span class="gd-building__name">{building.name}</span>
              <strong class="gd-building__lv display num">Lv.{building.level}</strong>
            </div>
          </Tilt>
        </li>
      ))}
    </ul>
  );
}

/** @param {{ guild: GuildView }} props */
function AbilitiesPanel({ guild }) {
  if (!guild.abilities.length) return <EmptyState title="길드 어빌리티 정보가 없어요" />;
  return (
    <ul class="gd-abilities stagger-in">
      {guild.abilities.map((ability, index) => (
        <li key={`${ability.no}-${index}`} class="gd-ability spotlight" style={{ "--stagger": Math.min(index, 14) }} {...spotlightHandlers()}>
          <span class="gd-ability__frame">
            <GameIcon src={ability.icon} size={40} />
            {ability.level !== null ? <span class="gd-ability__lv num">Lv.{ability.level}</span> : null}
          </span>
          <span class="gd-ability__text">
            <strong>{ability.name}</strong>
            {ability.option ? <span>{ability.option}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function GuildSkeleton() {
  return (
    <div class="gd" aria-busy="true">
      <div class="gd-hero gd-hero--loading">
        <Skeleton width={140} height={140} radius={28} />
        <div class="gd-hero__info">
          <Skeleton width={120} height={20} />
          <Skeleton width={220} height={40} radius={10} />
          <Skeleton width="60%" height={36} radius={999} />
        </div>
      </div>
      <div class="gd-stats">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} height={88} radius={16} />
        ))}
      </div>
      <span class="sr-only">길드 정보를 불러오는 중입니다.</span>
    </div>
  );
}

/** 길드 검색 화면(/preview/guild): 검색창 + 즐겨찾기·최근 본 길드. */
function GuildSearch() {
  const saved = useSaved();
  const seen = new Set();
  const entries = [...saved.favorites, ...saved.recent].filter((entry) => {
    const key = entryKey(entry);
    if (entry.kind !== "guild" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const favoriteKeys = new Set(saved.favorites.map(entryKey));
  return (
    <div class="gd gd--search">
      <header class="page-head gd-head tone-mint">
        <Aurora tone="mint" />
        <Particles count={14} />
        <span class="page-head__icon gd-head__icon" aria-hidden="true">
          <Icon name="flag" size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText text="길드" />
        </h1>
      </header>
      <section class="card gd-search" aria-label="길드 검색">
        <SearchBox id="gd-search" size="md" showKindSwitch={false} defaultKind="guild" />
      </section>
      {entries.length ? (
        <Card title="내 길드" icon="heart" tone="peach">
          <ul class="gd-saved stagger-in">
            {entries.slice(0, 8).map((entry, index) => (
              <li key={entryKey(entry)} style={{ "--stagger": index }}>
                <a class="gd-saved__link spotlight" href={urls.guild(entry.world, entry.name)} {...spotlightHandlers()}>
                  <Avatar kind="guild" world={entry.world} name={entry.name} size={44} />
                  <span class="gd-saved__text">
                    <span class="gd-saved__name">{entry.name}</span>
                    <span class="gd-saved__meta">
                      <WorldIcon world={entry.world} />
                      {favoriteKeys.has(entryKey(entry)) ? <Icon name="heart" size={14} filled /> : null}
                      {entry.at ? <span>{formatRelativeTime(entry.at)}</span> : null}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={18} />
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * @param {{ world?: string, name?: string }} props
 */
export function Guild({ world = "", name = "" }) {
  const [state, setState] = useState(/** @type {{ status: "loading" } | { status: "ready", guild: GuildView } | { status: "error", error: any }} */ ({ status: "loading" }));
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState(() => {
    const hash = window.location.hash.replace("#", "");
    return TAB_ITEMS.some((item) => item.id === hash) ? hash : "members";
  });
  const validWorld = WORLDS.includes(world);
  const searchOnly = !world && !name;

  useEffect(() => {
    if (searchOnly || !validWorld || !name) return undefined;
    let alive = true;
    setState({ status: "loading" });
    loadGuild(world, name).then(
      (raw) => {
        if (!alive) return;
        const guild = shapeGuild(raw, world, name);
        setState({ status: "ready", guild });
        addRecent({ kind: "guild", world: guild.world, name: guild.name });
        document.title = `${guild.name} · ${guild.world} 길드 · 메이플M 플러스`;
      },
      (error) => alive && setState({ status: "error", error })
    );
    return () => {
      alive = false;
    };
  }, [world, name, attempt]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const next = tab === "members" ? "" : `#${tab}`;
    if (window.location.hash !== next) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
  }, [tab, state.status]);

  if (searchOnly) return <GuildSearch />;

  const searchCard = (
    <div class="card gd-search">
      <SearchBox id="gd-search" size="md" showKindSwitch={false} defaultKind="guild" />
    </div>
  );

  if (!validWorld || !name) {
    return (
      <div class="gd gd--empty">
        <EmptyState art="search" title="월드와 길드 이름을 확인해 주세요" />
        {searchCard}
      </div>
    );
  }

  if (state.status === "loading") return <GuildSkeleton />;

  if (state.status === "error") {
    const notFound = state.error?.status === 404;
    return (
      <div class="gd gd--empty">
        {notFound ? (
          <EmptyState art="search" title={`${world} 월드에서 '${name}' 길드를 찾지 못했어요`} />
        ) : (
          <ErrorState title="길드 정보를 불러오지 못했어요" description={state.error?.message} detail={state.error?.detail} onRetry={() => setAttempt((n) => n + 1)} />
        )}
        {searchCard}
      </div>
    );
  }

  const guild = state.guild;
  const counts = { members: guild.members.length, skills: guild.skills.length, buildings: guild.buildings.length, abilities: guild.abilities.length };

  return (
    <div class="gd">
      <GuildHero guild={guild} />
      <Reveal>
        <GuildStats guild={guild} />
      </Reveal>
      <section class="gd-tabs" aria-label="길드 정보">
        <Tabs
          idBase="gd"
          label="길드 정보"
          scrollable
          value={tab}
          onChange={setTab}
          items={TAB_ITEMS.map((item) => ({ ...item, count: counts[/** @type {keyof typeof counts} */ (item.id)] }))}
        />
        <TabPanel idBase="gd" value={tab} class="gd-tabs__panel card">
          {tab === "members" ? <MembersPanel guild={guild} /> : null}
          {tab === "skills" ? <SkillsPanel guild={guild} /> : null}
          {tab === "buildings" ? <BuildingsPanel guild={guild} /> : null}
          {tab === "abilities" ? <AbilitiesPanel guild={guild} /> : null}
        </TabPanel>
      </section>
    </div>
  );
}
