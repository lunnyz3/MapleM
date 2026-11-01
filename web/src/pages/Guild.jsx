// 길드 화면: /preview/guild(길드 검색) · /preview/guild/<월드>/<이름>(길드 상세).
// 데이터: GET /api/maplestorym/guild/id → GET /api/maplestorym/guild/basic, 길드원 썸네일은 /api/maplestorym/character/image.
// 길드원 스펙(전투력 순위·보스 파티): POST /api/v2/specs(사이트가 모은 길드원만, power = 사냥 프리셋으로 잰 듯하면 0).
// 길드 비교(/guild/compare?a=월드/길드&b=월드/길드): 두 길드의 인원·평균 레벨·전투력·템환산·보스 입장 인원·직업.
// 들고 난 기록: GET /api/v2/guild-roster(길드 화면을 열 때와 하루 한 번 랭킹 상위 길드를 훑을 때 서버가 남긴 날짜별 들어옴·나감).
// 관리(길드장 도구): GET /api/v2/guild-manage — 오래 안 들어온 길드원, 이번 주 성장·들고 남, 길드 활동 낮은 순, 단톡방용 주간 요약 복사.
import "../styles/guild.css";
import bossData from "../../../src/game-data/boss-entry.json";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Avatar } from "../components/Avatar.jsx";
import { Card } from "../components/Card.jsx";
import { WorldIcon } from "../components/GameIcons.jsx";
import { Icon } from "../components/Icon.jsx";
import { Aurora, CountUp, Particles, Reveal, SplitText, Tilt, spotlightHandlers } from "../components/Motion.jsx";
import { SearchBox } from "../components/SearchBox.jsx";
import { RankBadge } from "../components/RankBadge.jsx";
import { Skeleton, SkeletonList } from "../components/Skeleton.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { Segmented, TabPanel, Tabs } from "../components/Tabs.jsx";
import { toast } from "../components/Toast.jsx";
import { getJson, loadCharacterImage, peekCharacterClass } from "../lib/api.js";
import { loadGuild } from "../lib/data.js";
import { downloadCsv } from "../lib/csv.mjs";
import { formatComma, formatDateDot, formatKoreanUnits, formatRelativeTime, kstToday, toNumber } from "../lib/format.js";
import { DEFAULT_WORLD, WORLDS, getRankingType, urls } from "../lib/game.js";
import { RankRow, useRanking } from "./Home.jsx";
import { useInView } from "../lib/motion.js";
import { copyText, sharePageUrl } from "../lib/share.js";
import { addRecent, entryKey, toggleFavorite, useSaved } from "../lib/storage.js";
import { setScorePoints, setScoreText } from "../lib/itemScore.js";
import { weeklySummary } from "../lib/guildManage.mjs";
import { bossRoster, defaultBoss, guildSummary, splitParties } from "../lib/guildParty.mjs";

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
  { id: "power", label: "전투력 순위", icon: "bolt" },
  { id: "boss", label: "보스 파티", icon: "swords" },
  { id: "roster", label: "들고 난 기록", icon: "clock" },
  { id: "manage", label: "관리", icon: "crown" },
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
          <a class="btn btn--secondary btn--sm" href={`/guild/compare?${new URLSearchParams({ a: `${guild.world}/${guild.name}` })}`}>
            <Icon name="swords" size={18} />
            다른 길드와 비교
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

/**
 * 길드원 전투력 순위: 사이트가 모은 길드원 스펙(전투력·템환산). 아직 모으지 못한 길드원은 맨 아래.
 * @param {{ guild: GuildView }} props
 */
function PowerPanel({ guild }) {
  const { state, retry } = useGuildSpecs(guild);

  const rows = useMemo(() => {
    const byName = new Map((state.specs || []).map((spec) => [spec.characterName, spec]));
    return guild.members
      .map((member) => ({ member, spec: byName.get(member.name) || null }))
      .sort((a, b) => (b.spec?.combatPower || 0) - (a.spec?.combatPower || 0) || (b.member.level ?? 0) - (a.member.level ?? 0));
  }, [guild, state.specs]);

  if (state.status === "loading") return <SkeletonList rows={6} />;
  if (state.status === "error") return <ErrorState compact title="전투력 순위를 불러오지 못했어요" onRetry={retry} />;

  // 엑셀(CSV): 순위·이름·직업·레벨·전투력·템환산·잠재·에디·길드 활동
  const exportCsv = () => {
    let place = 0;
    const table = rows.map(({ member, spec }) => {
      const power = Number(spec?.combatPower) || 0;
      if (power) place += 1;
      return [
        power ? place : "",
        member.name,
        spec?.characterClass || member.job || "",
        spec?.characterLevel || member.level || "",
        power || "",
        spec?.itemScore ? setScoreText(spec.itemScore) : "",
        spec?.potential ?? "",
        spec?.additionalPotential ?? "",
        member.activity ?? "",
        member.master ? "길드 마스터" : ""
      ];
    });
    downloadCsv(`${guild.world}-${guild.name}-길드원-${kstToday()}.csv`, [["순위", "이름", "직업", "레벨", "전투력", "템환산", "잠재", "에디", "길드 활동", "직위"], ...table]);
  };

  let rank = 0;
  return (
    <>
      <div class="gd-power__tools">
        <span class="gd-power__count num">
          기록 있는 길드원 {formatComma(rows.filter((row) => Number(row.spec?.combatPower) > 0).length)}/{formatComma(rows.length)}명
        </span>
        <button type="button" class="btn btn--secondary btn--sm" onClick={exportCsv}>
          <Icon name="download" size={16} />
          엑셀로 받기
        </button>
      </div>
      <ol class="gd-power stagger-in" aria-label="길드원 전투력 순위">
        {rows.map(({ member, spec }, index) => {
          const power = Number(spec?.combatPower) || 0;
          if (power) rank += 1;
          return (
            <li key={member.name} style={{ "--stagger": Math.min(index, 12) }}>
              <a class="gd-power__row" href={urls.character(guild.world, member.name)}>
                {power ? <RankBadge rank={rank} size={32} /> : <span class="gd-power__none" aria-hidden="true">-</span>}
                <Avatar world={guild.world} name={member.name} size={40} lazy />
                <span class="gd-power__text">
                  <span class="gd-power__name">
                    {member.name}
                    {member.master ? <Icon name="crown" size={14} class="gd-power__crown" /> : null}
                  </span>
                  <span class="gd-power__meta">
                    <span class="num">Lv.{spec?.characterLevel || member.level || "-"}</span>
                    {spec?.characterClass || member.job ? <span>{spec?.characterClass || member.job}</span> : null}
                    {spec?.itemScore ? <span class="num">템환산 {setScoreText(spec.itemScore)}점</span> : null}
                  </span>
                </span>
                <span class="gd-power__value num">{power ? formatKoreanUnits(power, { maxGroups: 2 }) : "기록 없음"}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </>
  );
}

// 길드원 스펙: 전투력 순위·보스 파티 탭이 같이 쓴다(길드마다 한 번, 실패하면 다시 읽는다).
const specCache = new Map();

/** @param {GuildView} guild */
function loadGuildSpecs(guild) {
  const key = `${guild.world}/${guild.name}`;
  if (!specCache.has(key)) {
    const names = guild.members.map((member) => member.name).filter((name) => name && name !== "-");
    const request = getJson("/api/v2/specs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ world_name: guild.world, names })
    }).then(({ response, body }) => {
      if (!response.ok || !body?.ok) throw new Error("specs");
      return body.specs || [];
    });
    request.catch(() => specCache.delete(key));
    specCache.set(key, request);
  }
  return specCache.get(key);
}

/** @param {GuildView} guild */
function useGuildSpecs(guild) {
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", specs?: any[] }} */ ({ status: "loading" }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    loadGuildSpecs(guild).then(
      (specs) => alive && setState({ status: "ready", specs }),
      () => alive && setState({ status: "error" })
    );
    return () => {
      alive = false;
    };
  }, [guild, attempt]);
  return { state, retry: () => setAttempt((n) => n + 1) };
}

const PARTY_SIZE = 6;
const BOSSES = [...bossData.bosses].sort((a, b) => a.power - b.power);
const SPLITS = [
  { value: "strong", label: "강한 순" },
  { value: "even", label: "고르게" }
];
const shortPower = (/** @type {number} */ value) => formatKoreanUnits(value, { maxGroups: value >= 1e8 ? 2 : 1 });
const bossLabel = (/** @type {any} */ boss) => `${boss.difficulty} ${boss.name}`;

/**
 * 보스 파티: 보스를 고르면 들어갈 수 있는 길드원(레벨·전투력)을 6인 파티로 나눈다(강한 순 / 고르게). 나눈 결과 복사.
 * @param {{ guild: GuildView }} props
 */
function BossPanel({ guild }) {
  const { state, retry } = useGuildSpecs(guild);
  const [pick, setPick] = useState(-1);
  const [split, setSplit] = useState("strong");

  const members = useMemo(() => {
    const byName = new Map((state.specs || []).map((spec) => [spec.characterName, spec]));
    return guild.members
      .filter((member) => member.name && member.name !== "-")
      .map((member) => {
        const spec = byName.get(member.name);
        return { name: member.name, level: Number(spec?.characterLevel) || member.level || 0, power: Number(spec?.power) || 0, className: spec?.characterClass || member.job || "" };
      });
  }, [guild, state.specs]);

  if (state.status === "loading") return <SkeletonList rows={6} />;
  if (state.status === "error") return <ErrorState compact title="길드원 기록을 불러오지 못했어요" onRetry={retry} />;

  const index = pick >= 0 ? pick : Math.max(0, defaultBoss(members, BOSSES, PARTY_SIZE));
  const boss = BOSSES[index];
  const roster = bossRoster(members, boss);
  const parties = splitParties(roster.ready, PARTY_SIZE, /** @type {"strong" | "even"} */ (split));
  const recommended = roster.ready.filter((member) => member.recommended).length;

  const copy = async () => {
    const lines = [`[${bossLabel(boss)}] ${guild.name}`, ...parties.map((party, i) => `${i + 1}파티: ${party.map((member) => member.name).join(", ")}`)];
    toast((await copyText(lines.join("\n"))) ? "파티 목록을 복사했어요" : "복사하지 못했어요", "success");
  };

  return (
    <div class="gd-boss">
      <div class="gd-boss__tools">
        <span class="select">
          <select aria-label="보스" value={String(index)} onChange={(event) => setPick(Number(/** @type {HTMLSelectElement} */ (event.currentTarget).value))}>
            {BOSSES.map((entry, i) => (
              <option key={bossLabel(entry)} value={String(i)}>
                {bossLabel(entry)} · Lv.{entry.level} · {shortPower(entry.power)}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={18} class="select__icon" />
        </span>
        <Segmented name="gd-boss-split" legend="나누는 방법" value={split} onChange={setSplit} options={SPLITS} />
      </div>
      <div class="gd-boss__head">
        <ul class="gd-boss__summary">
          <li>
            입장 가능 <strong class="num">{formatComma(roster.ready.length)}</strong>명
          </li>
          {boss.recommend?.power ? (
            <li>
              권장 전투력 이상 <strong class="num">{formatComma(recommended)}</strong>명
            </li>
          ) : null}
          <li>
            파티 <strong class="num">{formatComma(parties.length)}</strong>개
          </li>
        </ul>
        {parties.length ? (
          <button type="button" class="btn btn--secondary btn--sm" onClick={copy}>
            <Icon name="chat" size={16} />
            파티 목록 복사
          </button>
        ) : null}
      </div>
      {parties.length ? (
        <ol class="gd-boss__parties">
          {parties.map((party, i) => (
            <li key={i} class="gd-party">
              <div class="gd-party__head">
                <strong>{i + 1}파티</strong>
                <span class="num">
                  {party.length}명 · 합 {shortPower(party.reduce((sum, member) => sum + member.power, 0))}
                </span>
              </div>
              <ol class="gd-party__members">
                {party.map((member) => (
                  <li key={member.name}>
                    <a class="gd-party__member" href={urls.character(guild.world, member.name)}>
                      <Avatar world={guild.world} name={member.name} size={36} lazy />
                      <span class="gd-party__who">
                        <strong>{member.name}</strong>
                        <span class="num">
                          {member.className ? `${member.className} · ` : ""}Lv.{member.level}
                        </span>
                      </span>
                      <span class="gd-party__power num">
                        {shortPower(member.power)}
                        {member.recommended ? <span class="gd-party__good">권장</span> : null}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState compact title="이 보스에 들어갈 수 있는 길드원이 없어요" />
      )}
      {roster.short.length ? (
        <details class="gd-boss__more">
          <summary>
            조건이 모자란 길드원 <span class="num">{formatComma(roster.short.length)}</span>명
          </summary>
          <ul>
            {roster.short.map((member) => (
              <li key={member.name}>
                <a href={urls.character(guild.world, member.name)}>
                  <strong>{member.name}</strong>
                  <span class="num">{member.level < boss.level ? `Lv.${boss.level} 필요` : `${shortPower(boss.power - member.power)} 부족`}</span>
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {roster.unknown.length ? <p class="gd-boss__note num">기록 없음·전투력 모름 {formatComma(roster.unknown.length)}명(캐릭터를 한 번 열어 보면 생겨요)</p> : null}
    </div>
  );
}

// ---------------- 들고 난 기록 ----------------

const ROSTER_SHOWN = 14;

/** 인원 변화 선(점 2개 이상일 때) @param {{ counts: Array<{ date: string, count: number }> }} props */
function RosterSpark({ counts }) {
  if (counts.length < 2) return null;
  const width = 160;
  const height = 36;
  const values = counts.map((row) => row.count);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (index) => 3 + (index / (counts.length - 1)) * (width - 6);
  const y = (value) => (max === min ? height / 2 : 3 + (1 - (value - min) / (max - min)) * (height - 6));
  return (
    <svg class="gd-roster__spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`인원 ${values[0]}명에서 ${values[values.length - 1]}명`}>
      <polyline points={counts.map((row, index) => `${x(index)},${y(row.count)}`).join(" ")} />
    </svg>
  );
}

/** @param {{ guild: GuildView }} props */
function RosterPanel({ guild }) {
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", roster?: any }} */ ({ status: "loading" }));
  const [all, setAll] = useState(false);
  useEffect(() => {
    let alive = true;
    getJson(`/api/v2/guild-roster?${new URLSearchParams({ world_name: guild.world, guild_name: guild.name })}`).then(
      ({ response, body }) => alive && setState(response.ok && body?.ok ? { status: "ready", roster: body.roster } : { status: "error" }),
      () => alive && setState({ status: "error" })
    );
    return () => {
      alive = false;
    };
  }, [guild]);

  if (state.status === "loading") return <SkeletonList rows={4} />;
  if (state.status === "error") return <ErrorState compact title="기록을 불러오지 못했어요" />;
  const roster = state.roster;
  if (!roster) return <EmptyState compact title="오늘부터 길드원이 들고 나는 것을 기록해요" />;
  const recent = (days) => {
    const since = new Date(Date.now() + 9 * 3600000 - days * 86400000).toISOString().slice(0, 10);
    const rows = roster.events.filter((event) => event.date > since);
    return { joined: rows.reduce((sum, event) => sum + event.joined.length, 0), left: rows.reduce((sum, event) => sum + event.left.length, 0) };
  };
  const week = recent(7);
  const events = all ? roster.events : roster.events.slice(0, ROSTER_SHOWN);
  const person = (name) => (
    <li key={name}>
      <a href={urls.character(guild.world, name)}>{name}</a>
    </li>
  );

  return (
    <div class="gd-roster">
      <div class="gd-roster__head">
        <ul class="gd-boss__summary">
          <li>
            기록 시작 <strong class="num">{formatDateDot(new Date(Date.parse(roster.since) + 9 * 3600000).toISOString().slice(0, 10))}</strong>
          </li>
          <li>
            최근 7일 <strong class="num is-up">+{formatComma(week.joined)}</strong> <strong class="num is-down">−{formatComma(week.left)}</strong>
          </li>
        </ul>
        <RosterSpark counts={roster.counts} />
      </div>
      {!roster.events.length ? <EmptyState compact title="기록을 시작한 뒤로 들고 난 길드원이 없어요" /> : null}
      {events.length ? (
        <ol class="gd-roster__list">
          {events.map((event) => (
            <li key={event.date} class="gd-roster__day">
              <span class="gd-roster__date num">{formatDateDot(event.date)}</span>
              <div class="gd-roster__changes">
                {event.joined.length ? (
                  <div class="gd-roster__group is-joined">
                    <span class="gd-roster__label">들어옴 {event.joined.length}</span>
                    <ul>{event.joined.map(person)}</ul>
                  </div>
                ) : null}
                {event.left.length ? (
                  <div class="gd-roster__group is-left">
                    <span class="gd-roster__label">나감 {event.left.length}</span>
                    <ul>{event.left.map(person)}</ul>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {roster.events.length > ROSTER_SHOWN ? (
        <button type="button" class="btn btn--ghost btn--sm" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? "접기" : `${formatComma(roster.events.length - ROSTER_SHOWN)}일 더 보기`}
        </button>
      ) : null}
    </div>
  );
}

// ---------------- 관리(길드장 도구) ----------------

const AWAY_DAYS = 3;
const INACTIVE_DAYS = 7;

/** 템환산 100점 기준 증가와 전투력(오른 경우만)·레벨 글 */
function growthOf(member) {
  const growth = member.growth;
  if (!growth) return null;
  const points = growth.scoreFrom > 0 && growth.scoreTo > 0 ? setScorePoints(growth.scoreTo) - setScorePoints(growth.scoreFrom) : 0;
  const parts = [];
  if (points >= 0.05) parts.push(`템환산 +${points.toFixed(1)}점`);
  if (growth.power > 0.005) parts.push(`전투력 +${(growth.power * 100).toFixed(1)}%`);
  if (growth.level > 0) parts.push(`Lv +${growth.level}`);
  return parts.length ? { points, text: parts.join(" · ") } : null;
}

/** @param {{ guild: GuildView }} props */
function ManagePanel({ guild }) {
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", manage?: any }} */ ({ status: "loading" }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    getJson(`/api/v2/guild-manage?${new URLSearchParams({ world_name: guild.world, guild_name: guild.name })}`).then(
      ({ response, body }) => alive && setState(response.ok && body?.ok && body.manage ? { status: "ready", manage: body.manage } : { status: "error" }),
      () => alive && setState({ status: "error" })
    );
    return () => {
      alive = false;
    };
  }, [guild, attempt]);

  if (state.status === "loading") return <SkeletonList rows={6} />;
  if (state.status === "error") return <ErrorState compact title="길드원 정보를 불러오지 못했어요" onRetry={() => setAttempt((n) => n + 1)} />;
  const manage = state.manage;
  const members = manage.members;
  const away = members.filter((member) => member.daysAway !== null && member.daysAway >= AWAY_DAYS).sort((a, b) => b.daysAway - a.daysAway);
  const inactive = away.filter((member) => member.daysAway >= INACTIVE_DAYS);
  const growing = members
    .map((member) => ({ member, growth: growthOf(member) }))
    .filter((row) => row.growth)
    .sort((a, b) => b.growth.points - a.growth.points)
    .slice(0, 5);
  const quiet = [...members].sort((a, b) => a.activity - b.activity).slice(0, 5);
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

  const copySummary = async () => {
    const text = weeklySummary({
      guildName: manage.guild.name,
      count: members.length,
      joined: manage.week.joined,
      left: manage.week.left,
      growth: growing.slice(0, 3).map((row) => ({ name: row.member.name, text: row.growth.text })),
      inactive: inactive.map((member) => ({ name: member.name, days: member.daysAway })),
      today
    });
    toast((await copyText(text)) ? "주간 요약을 복사했어요" : "복사하지 못했어요", "success");
  };
  const person = (member, detail, tone = "") => (
    <li key={member.name}>
      <a class="gd-manage__row" href={urls.character(guild.world, member.name)}>
        <Avatar world={guild.world} name={member.name} size={32} lazy />
        <span class="gd-manage__who">
          <strong>{member.name}</strong>
          <span class="num">
            {member.className ? `${member.className} · ` : ""}Lv.{member.level || "-"}
          </span>
        </span>
        <span class={`gd-manage__detail num${tone ? ` is-${tone}` : ""}`}>{detail}</span>
      </a>
    </li>
  );

  return (
    <div class="gd-manage">
      <div class="gd-boss__head">
        <ul class="gd-boss__summary">
          <li>
            길드원 <strong class="num">{formatComma(members.length)}</strong>명
          </li>
          <li>
            {INACTIVE_DAYS}일 넘게 안 들어옴 <strong class="num">{formatComma(inactive.length)}</strong>명
          </li>
          <li>
            이번 주 <strong class="num is-up">+{formatComma(manage.week.joined.length)}</strong> <strong class="num is-down">−{formatComma(manage.week.left.length)}</strong>
          </li>
        </ul>
        <button type="button" class="btn btn--secondary btn--sm" onClick={copySummary}>
          <Icon name="chat" size={16} />
          주간 요약 복사
        </button>
      </div>

      <section class="gd-manage__section">
        <h3 class="gd-manage__title">
          오래 안 들어온 길드원 <span class="num">{AWAY_DAYS}일 이상</span>
        </h3>
        {away.length ? (
          <ol class="gd-manage__list">{away.slice(0, 15).map((member) => person(member, `${member.daysAway}일 전`, member.daysAway >= 14 ? "bad" : member.daysAway >= INACTIVE_DAYS ? "warn" : ""))}</ol>
        ) : (
          <p class="gd-manage__empty">모두 {AWAY_DAYS}일 안에 들어왔어요.</p>
        )}
      </section>

      <section class="gd-manage__section">
        <h3 class="gd-manage__title">이번 주 성장</h3>
        {growing.length ? (
          <ol class="gd-manage__list">{growing.map((row) => person(row.member, row.growth.text, "good"))}</ol>
        ) : (
          <p class="gd-manage__empty">이번 주 모은 기록에서 오른 길드원이 없어요.</p>
        )}
      </section>

      {manage.week.joined.length || manage.week.left.length ? (
        <section class="gd-manage__section">
          <h3 class="gd-manage__title">이번 주 들고 남</h3>
          <div class="gd-roster__changes">
            {manage.week.joined.length ? (
              <div class="gd-roster__group is-joined">
                <span class="gd-roster__label">들어옴 {manage.week.joined.length}</span>
                <ul>
                  {manage.week.joined.map((name) => (
                    <li key={name}>
                      <a href={urls.character(guild.world, name)}>{name}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {manage.week.left.length ? (
              <div class="gd-roster__group is-left">
                <span class="gd-roster__label">나감 {manage.week.left.length}</span>
                <ul>
                  {manage.week.left.map((name) => (
                    <li key={name}>
                      <a href={urls.character(guild.world, name)}>{name}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section class="gd-manage__section">
        <h3 class="gd-manage__title">길드 활동 낮은 순</h3>
        <ol class="gd-manage__list">{quiet.map((member) => person(member, `활동 ${formatComma(member.activity)}`))}</ol>
      </section>
      <p class="gd-boss__note num">
        {formatRelativeTime(Math.min(Date.parse(manage.generatedAt) || Date.now(), Date.now()))} 기준
      </p>
    </div>
  );
}

// ---------------- 길드 비교 ----------------

const COMPARE_BOSSES = [
  ["선택받은 세렌", "하드"],
  ["감시자 칼로스", "노말"],
  ["감시자 칼로스", "하드"],
  ["카링", "노말"]
]
  .map(([name, difficulty]) => BOSSES.find((boss) => boss.name === name && boss.difficulty === difficulty))
  .filter(Boolean);

/** "스카니아/레전드" → { world, name } */
function parseSide(value) {
  const [world, ...rest] = String(value || "").split("/");
  return WORLDS.includes(world) ? { world, name: rest.join("/").trim() } : { world: DEFAULT_WORLD, name: "" };
}

/** 한 길드: 넥슨 길드 정보 + 모은 길드원 스펙 → 요약 */
async function loadSide({ world, name }) {
  const guild = shapeGuild(await loadGuild(world, name), world, name);
  const specs = await loadGuildSpecs(guild);
  const byName = new Map(specs.map((spec) => [spec.characterName, spec]));
  const members = guild.members
    .filter((member) => member.name && member.name !== "-")
    .map((member) => {
      const spec = byName.get(member.name);
      return {
        name: member.name,
        level: Number(spec?.characterLevel) || member.level || 0,
        power: Number(spec?.power) || 0,
        itemScore: Number(spec?.itemScore) || 0,
        className: spec?.characterClass || member.job || ""
      };
    });
  return { guild, summary: guildSummary(members, COMPARE_BOSSES) };
}

/** 길드 비교 표의 줄: 큰 쪽에 표시(같으면 둘 다 없음) */
const COMPARE_ROWS = [
  { label: "길드 레벨", value: (side) => side.guild.level || 0, text: (side) => `Lv.${side.guild.level ?? "-"}` },
  { label: "길드원", value: (side) => side.summary.count, text: (side) => `${formatComma(side.summary.count)}명` },
  { label: "평균 레벨", value: (side) => side.summary.avgLevel, text: (side) => (side.summary.avgLevel ? `Lv.${side.summary.avgLevel.toFixed(1)}` : "-") },
  { label: "전투력 합", value: (side) => side.summary.powerSum, text: (side) => (side.summary.powerSum ? shortPower(side.summary.powerSum) : "-") },
  { label: "상위 10명 평균", value: (side) => side.summary.top10, text: (side) => (side.summary.top10 ? shortPower(side.summary.top10) : "-") },
  { label: "1위 길드원", value: (side) => side.summary.best?.power || 0, text: (side) => (side.summary.best ? `${side.summary.best.name} · ${shortPower(side.summary.best.power)}` : "-") },
  { label: "평균 템환산", value: (side) => side.summary.avgItemScore, text: (side) => (side.summary.avgItemScore ? `${setScoreText(side.summary.avgItemScore)}점` : "-") },
  ...COMPARE_BOSSES.map((boss, index) => ({
    label: `${boss.difficulty} ${boss.name.replace(/^(선택받은|감시자) /, "")} 입장`,
    value: (side) => side.summary.bosses[index].count,
    text: (side) => `${formatComma(side.summary.bosses[index].count)}명`
  }))
];

/** @param {{ id: string, label: string, side: { world: string, name: string }, onChange: (side: { world: string, name: string }) => void }} props */
function SideInput({ id, label, side, onChange }) {
  return (
    <fieldset class="gdc-side">
      <legend>{label}</legend>
      <span class="select">
        <select aria-label={`${label} 월드`} value={side.world} onChange={(event) => onChange({ ...side, world: /** @type {HTMLSelectElement} */ (event.currentTarget).value })}>
          {WORLDS.map((world) => (
            <option key={world} value={world}>
              {world}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={18} class="select__icon" />
      </span>
      <input
        id={id}
        class="input"
        type="text"
        maxLength={24}
        autoComplete="off"
        aria-label={`${label} 이름`}
        placeholder="길드 이름"
        value={side.name}
        onInput={(event) => onChange({ ...side, name: /** @type {HTMLInputElement} */ (event.currentTarget).value })}
      />
    </fieldset>
  );
}

export function GuildCompare() {
  const [form, setForm] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return { a: parseSide(params.get("a")), b: parseSide(params.get("b")) };
  });
  const [state, setState] = useState(/** @type {{ status: "idle" | "loading" | "ready" | "error", sides?: any[], message?: string }} */ ({ status: "idle" }));

  const run = (/** @type {typeof form} */ pair) => {
    const sides = [pair.a, pair.b].map((side) => ({ world: side.world, name: side.name.trim() }));
    if (!sides.every((side) => side.name)) return;
    setState({ status: "loading" });
    const url = `/guild/compare?${new URLSearchParams({ a: `${sides[0].world}/${sides[0].name}`, b: `${sides[1].world}/${sides[1].name}` })}`;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(null, "", url);
    Promise.all(sides.map((side) => loadSide(side).catch((error) => Promise.reject({ side, error })))).then(
      (loaded) => setState({ status: "ready", sides: loaded }),
      ({ side, error }) =>
        setState({ status: "error", message: error?.status === 404 ? `${side.world} 월드에서 '${side.name}' 길드를 찾지 못했어요.` : "길드 정보를 불러오지 못했어요." })
    );
  };
  useEffect(() => {
    document.title = "길드 비교 · 메이플M 플러스";
    if (form.a.name && form.b.name) run(form);
  }, []);

  const sides = state.status === "ready" ? state.sides || [] : [];
  return (
    <div class="gd gdc">
      <header class="page-head page-head--rank tone-mint">
        <Aurora tone="mint" />
        <span class="page-head__icon" aria-hidden="true">
          <Icon name="swords" size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText text="길드 비교" />
        </h1>
      </header>
      <form
        class="card gdc-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(form);
        }}
      >
        <SideInput id="gdc-a" label="첫째 길드" side={form.a} onChange={(a) => setForm({ ...form, a })} />
        <span class="gdc-vs display" aria-hidden="true">
          VS
        </span>
        <SideInput id="gdc-b" label="둘째 길드" side={form.b} onChange={(b) => setForm({ ...form, b })} />
        <button type="submit" class="btn btn--primary gdc-go" disabled={!form.a.name.trim() || !form.b.name.trim() || state.status === "loading"}>
          <Icon name="swords" size={18} />
          {state.status === "loading" ? "불러오는 중" : "비교하기"}
        </button>
      </form>
      {state.status === "loading" ? <SkeletonList rows={8} /> : null}
      {state.status === "error" ? <ErrorState compact title={state.message || "불러오지 못했어요"} /> : null}
      {sides.length === 2 ? (
        <section class="card gdc-result" aria-label="길드 비교">
          <table class="gdc-table">
            <thead>
              <tr>
                <th scope="col">
                  <span class="sr-only">항목</span>
                </th>
                {sides.map((side) => (
                  <th scope="col" key={`${side.guild.world}/${side.guild.name}`}>
                    <a href={urls.guild(side.guild.world, side.guild.name)}>
                      {side.guild.mark ? <img src={side.guild.mark} alt="" width={28} height={28} /> : <Icon name="flag" size={20} />}
                      <span>
                        <strong>{side.guild.name}</strong>
                        <span>
                          <WorldIcon world={side.guild.world} size={12} /> {side.guild.world}
                        </span>
                      </span>
                    </a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row) => {
                const [a, b] = sides.map((side) => row.value(side));
                return (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {sides.map((side, index) => {
                      const mine = index ? b : a;
                      const other = index ? a : b;
                      return (
                        <td key={index} class={`num${mine > other ? " is-win" : ""}`}>
                          {row.text(side)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr>
                <th scope="row">많은 직업</th>
                {sides.map((side, index) => (
                  <td key={index} class="gdc-classes">
                    {side.summary.classes.map((entry) => `${entry.className} ${entry.count}`).join(" · ") || "-"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p class="gdc-note num">
            전투력·템환산은 사이트가 모은 길드원 기준(
            {sides.map((side) => `${side.guild.name} ${formatComma(side.summary.known)}/${formatComma(side.summary.count)}명`).join(", ")})
          </p>
        </section>
      ) : null}
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

/** 길드 검색 화면(/guild): 검색창 + 즐겨찾기·최근 본 길드. */
/** 길드 랭킹(전장·지하수로) 상위 길드. */
function GuildRankingCard({ typeId }) {
  const type = getRankingType(typeId);
  const [state, retry] = useRanking(typeId);
  const rows = state.status === "ready" ? state.result.rows : [];
  return (
    <Card
      class="gd-top"
      title={`${type.short} 상위 길드`}
      icon={type.icon}
      tone={type.tone}
      action={
        <a class="text-link" href={urls.ranking(type.id)}>
          전체 보기
          <Icon name="chevronRight" size={18} />
        </a>
      }
    >
      {state.status === "loading" ? <SkeletonList rows={5} /> : null}
      {state.status === "error" ? <ErrorState compact title="랭킹을 불러오지 못했어요" onRetry={retry} /> : null}
      {rows.length ? (
        <ol class="rank-list stagger-in" aria-label={`${type.label} 상위 길드`}>
          {rows.map((row, index) => (
            <RankRow key={`${row.ranking}-${row.guild_name}`} type={type} row={row} index={index} />
          ))}
        </ol>
      ) : null}
      {state.status === "ready" && !rows.length ? <EmptyState compact title="최근 집계된 랭킹이 없어요" /> : null}
    </Card>
  );
}

/** 오늘·어제 사이트에서 많이 본 길드. 기록이 없으면 그리지 않는다. */
function PopularGuilds() {
  const [items, setItems] = useState(/** @type {any[]} */ ([]));
  useEffect(() => {
    let alive = true;
    getJson("/api/v2/popular").then(
      ({ response, body }) => alive && response.ok && body?.ok && setItems(Array.isArray(body.guilds) ? body.guilds : []),
      () => {}
    );
    return () => {
      alive = false;
    };
  }, []);
  if (!items.length) return null;
  return (
    <Card title="많이 본 길드" icon="sparkle" tone="peach">
      <ul class="gd-saved stagger-in">
        {items.map((item, index) => (
          <li key={`${item.worldName}/${item.characterName}`} style={{ "--stagger": index }}>
            <a class="gd-saved__link spotlight" href={urls.guild(item.worldName, item.characterName)} {...spotlightHandlers()}>
              <Avatar kind="guild" world={item.worldName} name={item.characterName} size={44} />
              <span class="gd-saved__text">
                <span class="gd-saved__name">{item.characterName}</span>
                <span class="gd-saved__meta">
                  <WorldIcon world={item.worldName} />
                  {item.characterClass ? <span>{item.characterClass}</span> : null}
                </span>
              </span>
              <Icon name="chevronRight" size={18} />
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}

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
      <div class="gd-tops">
        <GuildRankingCard typeId="sharenian-battlefield" />
        <GuildRankingCard typeId="sharenian-waterway" />
      </div>
      <PopularGuilds />
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
  const counts = { power: undefined, boss: undefined, roster: undefined, manage: undefined, members: guild.members.length, skills: guild.skills.length, buildings: guild.buildings.length, abilities: guild.abilities.length };

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
          {tab === "power" ? <PowerPanel guild={guild} /> : null}
          {tab === "boss" ? <BossPanel guild={guild} /> : null}
          {tab === "roster" ? <RosterPanel guild={guild} /> : null}
          {tab === "manage" ? <ManagePanel guild={guild} /> : null}
          {tab === "skills" ? <SkillsPanel guild={guild} /> : null}
          {tab === "buildings" ? <BuildingsPanel guild={guild} /> : null}
          {tab === "abilities" ? <AbilitiesPanel guild={guild} /> : null}
        </TabPanel>
      </section>
    </div>
  );
}
