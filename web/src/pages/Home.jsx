// 새 메인 대시보드: 검색 히어로 · 내 캐릭터(즐겨찾기·최근 검색) · 바로가기 · 랭킹 미리보기 · 오늘의 최고 기록.
import { useEffect, useRef, useState } from "preact/hooks";
import { Avatar } from "../components/Avatar.jsx";
import { Card } from "../components/Card.jsx";
import { Cloud, Leaf, Sparkle } from "../components/Decor.jsx";
import { Icon } from "../components/Icon.jsx";
import { RankBadge } from "../components/RankBadge.jsx";
import { SearchBox, requestSearchFocus } from "../components/SearchBox.jsx";
import { SkeletonList } from "../components/Skeleton.jsx";
import { SourceStamp } from "../components/SourceStamp.jsx";
import { StatTile } from "../components/StatTile.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { TabPanel, Tabs } from "../components/Tabs.jsx";
import { loadRanking, peekRanking } from "../lib/api.js";
import { formatRelativeTime } from "../lib/format.js";
import { RANKING_TYPES, detailUrl, getRankingType, urls } from "../lib/game.js";
import { addRecent, clearRecent, entryKey, getSaved, removeRecent, toggleFavorite, useSaved } from "../lib/storage.js";

/** @typedef {import("../lib/api.js").RankingResult} RankingResult */
/** @typedef {{ status: "loading" } | { status: "ready", result: RankingResult } | { status: "error", error: any }} LoadState */

function Hero() {
  return (
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero__sky" aria-hidden="true">
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
        <p class="hero__eyebrow">
          <Leaf size={16} />
          메이플스토리M 캐릭터·길드 검색
        </p>
        <h1 id="hero-title" class="hero__title">
          모험가의 오늘을 <em>한눈에</em>
        </h1>
        <p class="hero__lead">넥슨 Open API 공식 데이터로 장비·스탯·랭킹을 빠르게 확인하세요.</p>
        <SearchBox id="hero-search" size="lg" />
      </div>
    </section>
  );
}

/**
 * @param {{ entry: import("../lib/storage.js").SavedEntry, list: "favorites" | "recent", favorite: boolean, onRemoved: () => void }} props
 */
function SavedItem({ entry, list, favorite, onRemoved }) {
  const key = entryKey(entry);
  const kindText = entry.kind === "guild" ? "길드" : "캐릭터";
  return (
    <li class="saved-item">
      <a class="saved-item__link" href={detailUrl(entry.kind, entry.world, entry.name)} onClick={() => addRecent(entry)}>
        <Avatar kind={entry.kind} world={entry.world} name={entry.name} size={44} />
        <span class="saved-item__text">
          <span class="saved-item__name">{entry.name}</span>
          <span class="saved-item__meta">
            {entry.world} · {kindText}
            {list === "recent" && entry.at ? ` · ${formatRelativeTime(entry.at)}` : ""}
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
      description="로그인 없이 이 브라우저에만 저장돼요"
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
          <ul class="saved-list">
            {list.slice(0, 5).map((entry) => (
              <SavedItem key={entryKey(entry)} entry={entry} list={tab} favorite={favoriteKeys.has(entryKey(entry))} onRemoved={focusPanel} />
            ))}
            {list.length < 4 ? (
              <li class="saved-list__hint">
                <Icon name={tab === "favorites" ? "heart" : "clock"} size={18} />
                {tab === "favorites" ? "최근 검색에서 하트를 누르면 여기에 추가돼요" : "검색한 캐릭터·길드는 10개까지 저장돼요"}
              </li>
            ) : null}
          </ul>
        ) : tab === "favorites" ? (
          <EmptyState
            compact
            title="아직 즐겨찾기가 없어요"
            description="최근 검색 목록의 하트를 누르면 여기에 모여요."
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
            description="캐릭터를 검색하면 여기서 바로 다시 볼 수 있어요."
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

function Shortcuts() {
  return (
    <section class="shortcuts" aria-labelledby="shortcuts-title">
      <h2 id="shortcuts-title" class="sr-only">
        바로가기
      </h2>
      <Card class="shortcuts__lookup" title="빠른 조회" icon="search" tone="sky" headingLevel={3} description="이름으로 바로 찾기">
        <div class="lookup-tiles">
          <button type="button" class="lookup-tile tone-sky" onClick={() => requestSearchFocus("character")}>
            <span class="lookup-tile__icon">
              <Icon name="user" size={26} />
            </span>
            <span class="lookup-tile__text">
              <strong>캐릭터 조회</strong>
              <span>장비 · 스탯 · 성장 기록</span>
            </span>
            <Icon name="arrowRight" size={20} class="lookup-tile__go" />
          </button>
          <button type="button" class="lookup-tile tone-mint" onClick={() => requestSearchFocus("guild")}>
            <span class="lookup-tile__icon">
              <Icon name="flag" size={26} />
            </span>
            <span class="lookup-tile__text">
              <strong>길드 조회</strong>
              <span>길드 정보 · 길드원</span>
            </span>
            <Icon name="arrowRight" size={20} class="lookup-tile__go" />
          </button>
        </div>
      </Card>

      <Card class="shortcuts__rankings" title="랭킹 바로가기" icon="trophy" tone="gold" headingLevel={3} description="넥슨 공식 랭킹 9종">
        <ul class="ranking-tiles">
          {RANKING_TYPES.map((type) => (
            <li key={type.id}>
              <a class={`ranking-tile tone-${type.tone}`} href={urls.ranking(type.id)}>
                <span class="ranking-tile__icon">
                  <Icon name={type.icon} size={22} />
                </span>
                <span class="ranking-tile__text">
                  <strong>{type.name}</strong>
                  <span>{type.desc}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/**
 * @param {{ type: import("../lib/game.js").RankingType, row: Record<string, any> }} props
 */
function RankRow({ type, row }) {
  const isGuild = type.subject === "guild";
  const name = String((isGuild ? row.guild_name : row.character_name) || "-");
  const world = String(row.world_name || "");
  const value = type.value(row);
  const rank = Number(row.ranking) || 0;
  return (
    <li>
      <a class={`rank-row${rank === 1 ? " rank-row--first" : ""}`} href={detailUrl(type.subject, world, name)}>
        <RankBadge rank={rank} />
        <Avatar kind={type.subject} world={world} name={name} src={isGuild ? row.guild_mark_icon || "" : ""} size={44} />
        <span class="rank-row__who">
          <span class="rank-row__name">{name}</span>
          <span class="rank-row__meta">{type.meta(row).join(" · ")}</span>
        </span>
        <span class="rank-row__value num" title={value.full}>
          {value.prefix ? <span class="rank-row__affix">{value.prefix}</span> : null}
          {value.text}
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
function useRanking(typeId) {
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

/** @param {RankingResult | undefined} result */
function stampNote(result) {
  if (!result?.date || result.date === result.requestedDate) return "";
  return "최근 집계일 기준";
}

function RankingPreview() {
  const [typeId, setTypeId] = useState("level");
  const type = getRankingType(typeId);
  const [state, retry] = useRanking(typeId);
  const result = state.status === "ready" ? state.result : undefined;

  return (
    <Card
      class="ranking-card"
      title="랭킹 미리보기"
      icon="trophy"
      tone="gold"
      description={`${type.label} · ${type.metric} 상위 5`}
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
          <ol class="rank-list" aria-label={`${type.label} 상위 ${result.rows.length}명`}>
            {result.rows.map((row) => (
              <RankRow key={`${row.ranking}-${row.character_name || row.guild_name}`} type={type} row={row} />
            ))}
          </ol>
        ) : null}
        {result && !result.rows.length ? (
          <EmptyState
            compact
            title="최근 집계된 랭킹이 없어요"
            description="넥슨 랭킹은 하루 한 번 집계돼요. 다른 날짜를 골라 보세요."
            action={
              <a class="btn btn--secondary" href={urls.ranking(type.id)}>
                다른 날짜 보기
              </a>
            }
          />
        ) : null}
      </TabPanel>
      <footer class="ranking-card__foot">
        <SourceStamp date={result?.date} note={stampNote(result)} />
        <span class="ranking-card__hint">이름을 누르면 상세 정보로 이동해요</span>
      </footer>
    </Card>
  );
}

const RECORDS = [
  { type: "level", label: "레벨", icon: "crown", tone: "gold" },
  { type: "combat-power", label: "전투력", icon: "bolt", tone: "peach" },
  { type: "dojang", label: "무릉도장", icon: "gate", tone: "mint" },
  { type: "root-of-time", label: "시간의 근원", icon: "hourglass", tone: "lavender" }
];

function TodayRecords() {
  /** @type {[Record<string, LoadState>, any]} */
  const [states, setStates] = useState({});

  useEffect(() => {
    let alive = true;
    for (const record of RECORDS) {
      loadRanking(record.type).then(
        (result) => alive && setStates((prev) => ({ ...prev, [record.type]: { status: "ready", result } })),
        (error) => alive && setStates((prev) => ({ ...prev, [record.type]: { status: "error", error } }))
      );
    }
    return () => {
      alive = false;
    };
  }, []);

  const levelState = states.level;
  const stampDate = levelState?.status === "ready" ? levelState.result.date : null;

  return (
    <section class="records" aria-labelledby="records-title">
      <header class="records__head">
        <h2 id="records-title" class="section-title">
          <Sparkle size={18} class="section-title__mark" />
          오늘의 최고 기록
        </h2>
        <p class="records__desc">공식 랭킹 1위</p>
      </header>
      <div class="records__grid">
        {RECORDS.map((record) => {
          const state = states[record.type];
          const type = getRankingType(record.type);
          const row = state?.status === "ready" ? state.result.rows[0] : undefined;
          const value = row ? type.value(row) : null;
          return (
            <StatTile
              key={record.type}
              label={record.label}
              icon={record.icon}
              tone={/** @type {any} */ (record.tone)}
              href={urls.ranking(record.type)}
              loading={!state}
              value={value?.text ?? "-"}
              prefix={value?.prefix}
              unit={value?.unit}
              full={value?.full}
              sub={row ? `${row.character_name} · ${row.world_name}` : state?.status === "error" ? "불러오지 못했어요" : "기록 없음"}
            />
          );
        })}
      </div>
      <SourceStamp date={stampDate} class="records__stamp" />
    </section>
  );
}

export function Home() {
  return (
    <div class="home">
      <div class="home-top">
        <Hero />
        <MyCharacters />
      </div>
      <Shortcuts />
      <div class="home-data">
        <RankingPreview />
        <TodayRecords />
      </div>
    </div>
  );
}
