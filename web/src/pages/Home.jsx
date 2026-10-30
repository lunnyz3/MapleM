// 새 메인: 검색 · 내 캐릭터(즐겨찾기·최근 검색) · 랭킹 미리보기 · 랭킹 바로가기 · 소식(넥슨 공지·패치 노트·이벤트) · 인기 검색.
import { useEffect, useRef, useState } from "preact/hooks";
import { Avatar } from "../components/Avatar.jsx";
import { Card } from "../components/Card.jsx";
import { Cloud, Leaf, Sparkle } from "../components/Decor.jsx";
import { Freshness } from "../components/Freshness.jsx";
import { RowMeta, WorldIcon } from "../components/GameIcons.jsx";
import { Icon } from "../components/Icon.jsx";
import { Aurora, CountUp, Particles, Tilt, spotlightHandlers } from "../components/Motion.jsx";
import { RankBadge } from "../components/RankBadge.jsx";
import { RankChange } from "../components/RankChange.jsx";
import { Megaphone } from "../components/Megaphone.jsx";
import { UpgradeNewsCard } from "../components/UpgradeNews.jsx";
import { SearchBox, requestSearchFocus } from "../components/SearchBox.jsx";
import { SkeletonList } from "../components/Skeleton.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { TabPanel, Tabs } from "../components/Tabs.jsx";
import { getJson, loadRanking, peekRanking } from "../lib/api.js";
import { formatComma, formatKoreanUnits, formatRelativeTime, toNumber } from "../lib/format.js";
import { RANKING_TYPES, detailUrl, getRankingType, urls } from "../lib/game.js";
import { addRecent, clearRecent, entryKey, getSaved, removeRecent, toggleFavorite, useSaved } from "../lib/storage.js";

/** @typedef {import("../lib/api.js").RankingResult} RankingResult */
/** @typedef {{ status: "loading" } | { status: "ready", result: RankingResult } | { status: "error", error: any }} LoadState */

/** 검색만 있는 하늘 영역(오로라 · 입자 · 구름 · 단풍잎 장식). */
function Hero() {
  return (
    <section class="hero" aria-label="캐릭터·길드 검색">
      <div class="hero__sky" aria-hidden="true">
        <Aurora tone="sky" />
        <Particles count={22} />
        <Cloud class="hero__cloud hero__cloud--1" width={260} />
        <Cloud class="hero__cloud hero__cloud--2" width={150} />
        <Cloud class="hero__cloud hero__cloud--3" width={120} />
        <Leaf class="hero__leaf hero__leaf--1" size={76} />
        <Leaf class="hero__leaf hero__leaf--2" size={40} />
        <Leaf class="hero__leaf hero__leaf--3" size={28} />
        <Sparkle class="hero__sparkle hero__sparkle--1" size={22} />
        <Sparkle class="hero__sparkle hero__sparkle--2" size={14} />
        <Sparkle class="hero__sparkle hero__sparkle--3" size={12} />
      </div>
      <div class="hero__content">
        <a class="bot-cta" href={urls.bot}>
          <span class="bot-cta__shine" aria-hidden="true" />
          <Sparkle class="bot-cta__spark bot-cta__spark--1" size={14} />
          <Sparkle class="bot-cta__spark bot-cta__spark--2" size={10} />
          <span class="bot-cta__icon" aria-hidden="true">
            <Icon name="chat" size={18} />
          </span>
          <span class="bot-cta__text">
            내 단톡방에 <strong>카톡 봇</strong> 넣기
          </span>
          <span class="bot-cta__free">무료</span>
          <Icon name="arrowRight" size={16} class="bot-cta__go" />
        </a>
        <SearchBox id="hero-search" size="lg" />
        <Megaphone />
      </div>
    </section>
  );
}

/**
 * @param {{ entry: import("../lib/storage.js").SavedEntry, list: "favorites" | "recent", favorite: boolean, onRemoved: () => void, index?: number }} props
 */
function SavedItem({ entry, list, favorite, onRemoved, index = 0 }) {
  const key = entryKey(entry);
  return (
    <li class="saved-item" style={{ "--stagger": index }}>
      <a class="saved-item__link spotlight" href={detailUrl(entry.kind, entry.world, entry.name)} onClick={() => addRecent(entry)} {...spotlightHandlers()}>
        <Avatar kind={entry.kind} world={entry.world} name={entry.name} size={44} />
        <span class="saved-item__text">
          <span class="saved-item__name">{entry.name}</span>
          <span class="saved-item__meta">
            <WorldIcon world={entry.world} />
            {entry.kind === "guild" ? <Icon name="flag" size={14} /> : null}
            {list === "recent" && entry.at ? <span>{formatRelativeTime(entry.at)}</span> : null}
          </span>
        </span>
      </a>
      <button
        type="button"
        class={`icon-btn saved-item__fav${favorite ? " is-on" : ""}`}
        aria-pressed={favorite ? "true" : "false"}
        aria-label={`${entry.name} 즐겨찾기`}
        title={favorite ? "즐겨찾기 해제" : "즐겨찾기에 추가"}
        onClick={() => {
          toggleFavorite(entry);
          if (list === "favorites") onRemoved();
        }}
      >
        <Icon name="heart" size={22} filled={favorite} />
      </button>
      {list === "recent" ? (
        <button
          type="button"
          class="icon-btn saved-item__remove"
          aria-label={`${entry.name} 검색 기록 삭제`}
          title="기록 삭제"
          onClick={() => {
            removeRecent(key);
            onRemoved();
          }}
        >
          <Icon name="x" size={20} />
        </button>
      ) : null}
    </li>
  );
}

function MyCharacters() {
  const { recent, favorites } = useSaved();
  const [tab, setTab] = useState(() => (getSaved().favorites.length ? "favorites" : "recent"));
  const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const list = tab === "favorites" ? favorites : recent;
  const favoriteKeys = new Set(favorites.map(entryKey));
  // 항목을 지워 버튼이 사라지면 포커스를 목록으로 옮긴다.
  const focusPanel = () => requestAnimationFrame(() => panelRef.current?.focus());

  return (
    <Card
      id="my"
      class="mychars"
      title="내 캐릭터"
      icon="heart"
      tone="peach"
      action={
        tab === "recent" && recent.length ? (
          <button type="button" class="btn btn--ghost btn--sm" onClick={() => (clearRecent(), focusPanel())}>
            기록 지우기
          </button>
        ) : null
      }
    >
      <Tabs
        idBase="my"
        label="내 캐릭터 목록"
        variant="segmented"
        value={tab}
        onChange={setTab}
        items={[
          { id: "favorites", label: "즐겨찾기", count: favorites.length },
          { id: "recent", label: "최근 검색", count: recent.length }
        ]}
      />
      <TabPanel idBase="my" value={tab} panelRef={panelRef} class="mychars__panel">
        {list.length ? (
          <ul class="saved-list stagger-in">
            {list.slice(0, 5).map((entry, index) => (
              <SavedItem key={entryKey(entry)} index={index} entry={entry} list={tab} favorite={favoriteKeys.has(entryKey(entry))} onRemoved={focusPanel} />
            ))}
          </ul>
        ) : tab === "favorites" ? (
          <EmptyState
            compact
            title="아직 즐겨찾기가 없어요"
            action={
              recent.length ? (
                <button type="button" class="btn btn--secondary" onClick={() => setTab("recent")}>
                  최근 검색 보기
                </button>
              ) : null
            }
          />
        ) : (
          <EmptyState
            compact
            art="search"
            title="최근 검색한 캐릭터가 없어요"
            action={
              <button type="button" class="btn btn--secondary" onClick={() => requestSearchFocus("character")}>
                <Icon name="search" size={20} />
                캐릭터 검색하기
              </button>
            }
          />
        )}
      </TabPanel>
    </Card>
  );
}

/** 랭킹 바로가기: 7종을 정해진 순서대로(틸트 + 스포트라이트 타일). */
function RankingShortcuts() {
  return (
    <Card class="shortcuts" title="랭킹 바로가기" icon="trophy" tone="gold">
      <ul class="ranking-tiles stagger-in">
        {RANKING_TYPES.map((type, index) => (
          <li key={type.id} style={{ "--stagger": index }}>
            <Tilt maxDeg={12} scale={1.04} class="ranking-tile__tilt">
              <a class={`ranking-tile tone-${type.tone} spotlight`} href={urls.ranking(type.id)} {...spotlightHandlers()}>
                <span class="ranking-tile__icon">
                  <Icon name={type.icon} size={22} />
                </span>
                <strong class="ranking-tile__name">{type.name}</strong>
                <Icon name="arrowRight" size={18} class="ranking-tile__go" />
              </a>
            </Tilt>
          </li>
        ))}
        <li style={{ "--stagger": RANKING_TYPES.length }}>
          <Tilt maxDeg={12} scale={1.04} class="ranking-tile__tilt">
            <a class="ranking-tile tone-peach spotlight" href={urls.game} {...spotlightHandlers()}>
              <span class="ranking-tile__icon">
                <Icon name="swords" size={22} />
              </span>
              <strong class="ranking-tile__name">미니게임</strong>
              <Icon name="arrowRight" size={18} class="ranking-tile__go" />
            </a>
          </Tilt>
        </li>
      </ul>
    </Card>
  );
}

/**
 * @param {{ type: import("../lib/game.js").RankingType, row: Record<string, any>, index: number }} props
 */
export function RankRow({ type, row, index }) {
  const isGuild = type.subject === "guild";
  const name = String((isGuild ? row.guild_name : row.character_name) || "-");
  const world = String(row.world_name || "");
  const value = type.value(row);
  const rank = Number(row.ranking) || 0;
  const number = toNumber(row[type.field]);
  return (
    <li class="rank-list__item" style={{ "--stagger": index }}>
      <a class={`rank-row spotlight${rank === 1 ? " rank-row--first" : ""}`} href={detailUrl(type.subject, world, name)} {...spotlightHandlers()}>
        <span class="rank-row__rank">
          <RankBadge rank={rank} />
          {type.noRankChange ? null : <RankChange row={row} />}
        </span>
        <Avatar kind={type.subject} world={world} name={name} src={isGuild ? row.guild_mark_icon || "" : ""} size={44} />
        <span class="rank-row__who">
          <span class="rank-row__name">{name}</span>
          <RowMeta type={type} row={row} max={2} class="rank-row__meta" />
        </span>
        <span class="rank-row__value num" title={value.full}>
          {value.prefix ? <span class="rank-row__affix">{value.prefix}</span> : null}
          {number !== null ? (
            <CountUp value={number} format={type.big ? (n) => formatKoreanUnits(n, { maxGroups: n >= 1e8 ? 2 : 1 }) : (n) => formatComma(n)} duration={800} />
          ) : (
            value.text
          )}
          {value.unit ? <span class="rank-row__affix">{value.unit}</span> : null}
        </span>
      </a>
    </li>
  );
}

/**
 * @param {string} typeId
 * @returns {[LoadState, () => void]}
 */
export function useRanking(typeId) {
  // 상태에 랭킹 종류를 함께 저장해, 탭을 바꾼 직후 이전 탭의 행이 새 종류로 그려지지 않게 한다.
  const [saved, setSaved] = useState(/** @type {{ typeId: string, state: LoadState }} */ ({ typeId, state: { status: "loading" } }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (peekRanking(typeId)) return undefined;
    let alive = true;
    setSaved({ typeId, state: { status: "loading" } });
    // 탭을 화살표로 빠르게 넘길 때 중간 탭마다 요청하지 않도록 잠깐 기다린다.
    const timer = setTimeout(() => {
      loadRanking(typeId).then(
        (result) => alive && setSaved({ typeId, state: { status: "ready", result } }),
        (error) => alive && setSaved({ typeId, state: { status: "error", error } })
      );
    }, 150);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [typeId, attempt]);

  const cached = peekRanking(typeId);
  /** @type {LoadState} */
  const state = cached ? { status: "ready", result: cached } : saved.typeId === typeId ? saved.state : { status: "loading" };
  return [state, () => setAttempt((count) => count + 1)];
}

function RankingPreview() {
  const [typeId, setTypeId] = useState(RANKING_TYPES[0].id);
  const type = getRankingType(typeId);
  const [state, retry] = useRanking(typeId);
  const result = state.status === "ready" ? state.result : undefined;

  return (
    <Card
      class="ranking-card"
      title="랭킹"
      icon="trophy"
      tone="gold"
      action={
        <a class="text-link" href={urls.ranking(type.id)}>
          전체 보기
          <Icon name="chevronRight" size={18} />
        </a>
      }
    >
      <Tabs
        idBase="rank"
        label="랭킹 종류"
        scrollable
        value={typeId}
        onChange={setTypeId}
        items={RANKING_TYPES.map((item) => ({ id: item.id, label: item.short }))}
      />
      <TabPanel idBase="rank" value={typeId} busy={state.status === "loading"} class="ranking-card__panel">
        {state.status === "loading" ? (
          <>
            <SkeletonList rows={5} />
            <span class="sr-only">{type.label}을 불러오는 중입니다.</span>
          </>
        ) : null}
        {state.status === "error" ? (
          <ErrorState
            compact
            title="랭킹을 불러오지 못했어요"
            description={state.error?.message || "잠시 후 다시 시도해 주세요."}
            detail={state.error?.detail}
            onRetry={retry}
          />
        ) : null}
        {result && result.rows.length ? (
          <ol class="rank-list stagger-in" aria-label={`${type.label} 상위 ${result.rows.length}명`}>
            {result.rows.map((row, index) => (
              <RankRow key={`${row.ranking}-${row.character_name || row.guild_name}`} type={type} row={row} index={index} />
            ))}
          </ol>
        ) : null}
        {result && !result.rows.length ? (
          <EmptyState
            compact
            title="최근 집계된 랭킹이 없어요"
            action={
              <a class="btn btn--secondary" href={urls.ranking(type.id)}>
                다른 날짜 보기
              </a>
            }
          />
        ) : null}
      </TabPanel>
      <footer class="ranking-card__foot">
        <Freshness date={result?.date} />
      </footer>
    </Card>
  );
}

const NEWS_TABS = [
  { id: "patch", label: "패치 노트" },
  { id: "event", label: "이벤트" },
  { id: "notice", label: "공지" }
];

/** "2026-10-28T10:00+09:00" → "10.28" */
const monthDay = (/** @type {string} */ date) => (/^\d{4}-(\d{2})-(\d{2})/.exec(date) || []).slice(1).join(".");

/** 넥슨 공지·패치 노트·이벤트 최신 목록(제목을 누르면 넥슨 공식 페이지). */
function NewsCard() {
  const [tab, setTab] = useState("patch");
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", data?: any }} */ ({ status: "loading" }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    getJson("/api/v2/notices").then(
      ({ response, body }) => alive && setState(response.ok && body?.ok ? { status: "ready", data: body } : { status: "error" }),
      () => alive && setState({ status: "error" })
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const rows = state.status === "ready" ? state.data[tab] || [] : [];

  return (
    <Card class="news-card" title="소식" icon="info" tone="mint">
      <Tabs idBase="news" label="소식 종류" value={tab} onChange={setTab} items={NEWS_TABS} />
      <TabPanel idBase="news" value={tab} busy={state.status === "loading"} class="news-card__panel">
        {state.status === "loading" ? <SkeletonList rows={4} /> : null}
        {state.status === "error" ? <ErrorState compact title="소식을 불러오지 못했어요" onRetry={() => setAttempt((n) => n + 1)} /> : null}
        {state.status === "ready" && !rows.length ? <EmptyState compact title="새 소식이 없어요" /> : null}
        {rows.length ? (
          <ul class="news-list stagger-in">
            {rows.map((row, index) => (
              <li key={row.url} style={{ "--stagger": index }}>
                <a class="news-row" href={row.url} target="_blank" rel="noopener noreferrer">
                  <span class="news-row__date num">{monthDay(row.date)}</span>
                  <span class="news-row__title">{row.title}</span>
                  <Icon name="external" size={16} class="news-row__go" />
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </TabPanel>
    </Card>
  );
}

const POPULAR_TABS = [
  { id: "items", label: "캐릭터" },
  { id: "guilds", label: "길드" }
];

/** 오늘·어제 사이트에서 많이 열어 본 캐릭터·길드 10개. */
function PopularCard() {
  const [tab, setTab] = useState("items");
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", data?: any }} */ ({ status: "loading" }));
  useEffect(() => {
    let alive = true;
    getJson("/api/v2/popular").then(
      ({ response, body }) => alive && setState(response.ok && body?.ok ? { status: "ready", data: body } : { status: "error" }),
      () => alive && setState({ status: "error" })
    );
    return () => {
      alive = false;
    };
  }, []);
  const items = state.status === "ready" ? state.data?.[tab] || [] : [];
  const guild = tab === "guilds";
  return (
    <Card class="popular-card" title="인기 검색" icon="sparkle" tone="peach">
      <Tabs idBase="popular" label="인기 검색 종류" value={tab} onChange={setTab} items={POPULAR_TABS} />
      <TabPanel idBase="popular" value={tab} busy={state.status === "loading"} class="news-card__panel">
        {state.status === "loading" ? <SkeletonList rows={5} /> : null}
        {state.status === "error" ? <EmptyState compact title="인기 검색을 불러오지 못했어요" /> : null}
        {state.status === "ready" && !items.length ? <EmptyState compact title="아직 검색 기록이 없어요" /> : null}
        {items.length ? (
          <ol class="popular-list stagger-in">
            {items.map((item, index) => (
              <li key={`${item.worldName}/${item.characterName}`} style={{ "--stagger": index }}>
                <a class="popular-row" href={guild ? urls.guild(item.worldName, item.characterName) : urls.character(item.worldName, item.characterName)}>
                  <span class={`popular-row__rank num${index < 3 ? " is-top" : ""}`}>{index + 1}</span>
                  <Avatar kind={guild ? "guild" : "character"} world={item.worldName} name={item.characterName} size={32} lazy />
                  <span class="popular-row__name">{item.characterName}</span>
                  <span class="popular-row__meta">
                    <WorldIcon world={item.worldName} size={14} />
                    {item.characterClass || item.worldName}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        ) : null}
      </TabPanel>
    </Card>
  );
}

export function Home() {
  return (
    <div class="home">
      <div class="home-top">
        <Hero />
        <MyCharacters />
      </div>
      <div class="home-data">
        <UpgradeNewsCard />
        <RankingPreview />
        <RankingShortcuts />
        <NewsCard />
        <PopularCard />
      </div>
    </div>
  );
}
