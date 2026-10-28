// 랭킹 화면(/preview/ranking): 랭킹 7종 · 월드 · 날짜 · 쪽 · 이름 찾기.
// 주소의 ?type=&date=&world_name=&page=&name= 과 화면 상태를 맞춘다(뒤로 가기 지원).
import "../styles/ranking.css";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Avatar } from "../components/Avatar.jsx";
import { Icon } from "../components/Icon.jsx";
import { Aurora, CountUp, Particles, Reveal, SplitText, Tilt, spotlightHandlers } from "../components/Motion.jsx";
import { RankBadge } from "../components/RankBadge.jsx";
import { Skeleton } from "../components/Skeleton.jsx";
import { Freshness } from "../components/Freshness.jsx";
import { RowMeta, WorldIcon } from "../components/GameIcons.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { TabPanel, Tabs } from "../components/Tabs.jsx";
import { RANKING_PAGE_SIZE, findCharacterRank, loadRankingPage } from "../lib/data.js";
import { formatComma, formatDateDot, formatKoreanUnits, kstToday, shiftDate, toNumber } from "../lib/format.js";
import { DEFAULT_WORLD, RANKING_DATE_FLOOR, RANKING_TYPES, WORLDS, getRankingType, urls } from "../lib/game.js";
import { prefersReducedMotion } from "../lib/motion.js";

/** @typedef {import("../lib/data.js").RankingPage} RankingPage */
/** @typedef {{ type: string, date: string, world: string, page: number, name: string }} Query */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @returns {Query} */
function readQuery() {
  const params = new URLSearchParams(window.location.search);
  const type = getRankingType(params.get("type") || "level").id;
  const today = kstToday();
  let date = String(params.get("date") || "");
  if (!DATE_RE.test(date) || date > today) date = today;
  if (date < RANKING_DATE_FLOOR) date = RANKING_DATE_FLOOR;
  const worldParam = String(params.get("world_name") || params.get("world") || "");
  const world = WORLDS.includes(worldParam) ? worldParam : "";
  const page = Math.max(1, Math.min(500, Math.floor(Number(params.get("page")) || 1)));
  const name = String(params.get("name") || params.get("character_name") || "").trim().slice(0, 24);
  return { type, date, world, page, name };
}

/** @param {Query} query @param {"push" | "replace"} mode */
function writeQuery(query, mode) {
  const today = kstToday();
  const next = urls.ranking(query.type, {
    date: query.date === today ? "" : query.date,
    world_name: query.world,
    page: query.page > 1 ? query.page : "",
    name: query.name
  });
  if (`${window.location.pathname}${window.location.search}` === next) return;
  window.history[mode === "push" ? "pushState" : "replaceState"](null, "", next);
}

/** @param {any} row @param {boolean} guild */
const rowName = (row, guild) => String((guild ? row.guild_name : row.character_name) || "-");

/**
 * 한 행의 핵심 값(큰 수는 한국식 단위).
 * @param {import("../lib/game.js").RankingType} type @param {any} row
 */
function MetricValue({ type, row }) {
  const value = type.value(row);
  return (
    <span class="rk-metric num" title={value.full}>
      {value.prefix ? <span class="rk-metric__affix">{value.prefix}</span> : null}
      {value.text}
      {value.unit ? <span class="rk-metric__affix">{value.unit}</span> : null}
    </span>
  );
}

/**
 * 종류별 추가 열. 월드·등급은 이름 아래 아이콘으로 보여주므로 열을 따로 두지 않는다.
 * @param {string} typeId
 * @returns {Array<{ key: string, label: string, render: (row: any) => any }>}
 */
function extraColumns(typeId) {
  const guildCell = (row) => (row.guild_name ? <span class="rk-guild">{row.guild_name}</span> : <span class="rk-muted">-</span>);
  switch (typeId) {
    case "level":
    case "union":
      return [{ key: "guild", label: "길드", render: guildCell }];
    case "achievement":
    case "sharenian-battlefield":
    case "sharenian-waterway":
      return [];
    default:
      return [
        { key: "level", label: "레벨", render: (row) => (row.character_level ? `Lv.${row.character_level}` : "-") },
        { key: "guild", label: "길드", render: guildCell }
      ];
  }
}

/**
 * @param {{ row: any, world: string }} props
 */
function RankCell({ row, world }) {
  const overall = Number(row.ranking) || 0;
  const worldRank = Number(row.world_ranking) || 0;
  const main = world && worldRank ? worldRank : overall;
  return (
    <span class="rk-rank">
      <RankBadge rank={main} size={34} />
      {world && worldRank ? <span class="rk-rank__sub num">전체 {formatComma(overall)}위</span> : null}
    </span>
  );
}

/**
 * 캐릭터/길드 이름 칸(아바타 + 이름 + 월드·등급 아이콘과 짧은 보조 글자).
 * @param {{ type: import("../lib/game.js").RankingType, row: any }} props
 */
function WhoCell({ type, row }) {
  const guild = type.subject === "guild";
  const name = rowName(row, guild);
  const world = String(row.world_name || "");
  const href = guild ? urls.guild(world, name) : urls.character(world, name);
  return (
    <a class="rk-who" href={href}>
      <Avatar kind={type.subject} world={world} name={name} src={guild ? row.guild_mark_icon || "" : ""} size={40} lazy />
      <span class="rk-who__text">
        <span class="rk-who__name">{name}</span>
        <RowMeta type={type} row={row} max={1} class="rk-who__meta" />
      </span>
    </a>
  );
}

/**
 * 데스크톱 표.
 * @param {{ type: import("../lib/game.js").RankingType, rows: any[], world: string, highlight: string }} props
 */
function RankingTable({ type, rows, world, highlight }) {
  const columns = extraColumns(type.id);
  return (
    <div class="rk-table-wrap">
      <table class="rk-table">
        <caption class="sr-only">
          {type.label} {world ? `${world} 월드 ` : ""}순위표
        </caption>
        <thead>
          <tr>
            <th scope="col" class="rk-col-rank">
              {world ? "월드 순위" : "순위"}
            </th>
            <th scope="col">{type.subject === "guild" ? "길드" : "캐릭터"}</th>
            {columns.map((column) => (
              <th scope="col" key={column.key}>
                {column.label}
              </th>
            ))}
            <th scope="col" class="rk-col-metric">
              {type.metric}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const name = rowName(row, type.subject === "guild");
            const hit = highlight && name === highlight;
            return (
              <tr key={`${row.ranking}-${name}`} class={hit ? "is-hit" : undefined} data-rank-name={name}>
                <td class="rk-col-rank">
                  <RankCell row={row} world={world} />
                </td>
                <th scope="row" class="rk-col-who">
                  <WhoCell type={type} row={row} />
                </th>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
                <td class="rk-col-metric">
                  <MetricValue type={type} row={row} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 모바일 카드 목록(순위·이름·핵심 수치 + 펼치기).
 * @param {{ type: import("../lib/game.js").RankingType, rows: any[], world: string, highlight: string }} props
 */
function RankingCards({ type, rows, world, highlight }) {
  const columns = extraColumns(type.id);
  return (
    <ol class="rk-cards" aria-label={`${type.label} 순위`}>
      {rows.map((row) => {
        const name = rowName(row, type.subject === "guild");
        const hit = highlight && name === highlight;
        return (
          <li key={`${row.ranking}-${name}`} class={`rk-card${hit ? " is-hit" : ""}`} data-rank-name={name}>
            <div class="rk-card__main">
              <RankCell row={row} world={world} />
              <WhoCell type={type} row={row} />
              <MetricValue type={type} row={row} />
            </div>
            <details class="rk-card__more">
              <summary>
                <span>자세히</span>
                <Icon name="chevronDown" size={18} />
              </summary>
              <dl class="rk-card__facts">
                <div>
                  <dt>월드</dt>
                  <dd>
                    <WorldIcon world={row.world_name} size={18} />
                  </dd>
                </div>
                <div>
                  <dt>전체 순위</dt>
                  <dd class="num">{formatComma(row.ranking)}위</dd>
                </div>
                <div>
                  <dt>월드 순위</dt>
                  <dd class="num">{row.world_ranking ? `${formatComma(row.world_ranking)}위` : "-"}</dd>
                </div>
                {columns.map((column) => (
                  <div key={column.key}>
                    <dt>{column.label}</dt>
                    <dd>{column.render(row)}</dd>
                  </div>
                ))}
                <div>
                  <dt>{type.metric}</dt>
                  <dd class="num">{type.value(row).full}</dd>
                </div>
              </dl>
            </details>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 1쪽 상위 3위(넓은 화면): 스포트라이트·틸트 카드 + 숫자 카운트업.
 * @param {{ type: import("../lib/game.js").RankingType, rows: any[], world: string }} props
 */
function Podium({ type, rows, world }) {
  const top = rows.slice(0, 3);
  if (top.length < 3) return null;
  const guild = type.subject === "guild";
  return (
    <ol class="rk-podium" aria-label={`${type.label} 상위 3`}>
      {top.map((row, index) => {
        const name = rowName(row, guild);
        const rowWorld = String(row.world_name || "");
        const value = type.value(row);
        const rank = world ? Number(row.world_ranking) || index + 1 : Number(row.ranking) || index + 1;
        return (
          <Reveal as="li" key={`${rank}-${name}`} delay={index * 90} class={`rk-podium__item rk-podium__item--${index + 1}`}>
            <Tilt maxDeg={14} scale={1.04} class="rk-podium__tilt">
              <a class="rk-podium__card spotlight" href={guild ? urls.guild(rowWorld, name) : urls.character(rowWorld, name)} {...spotlightHandlers()}>
                <span class="rk-podium__badge">
                  <RankBadge rank={rank} size={44} />
                </span>
                <Avatar kind={type.subject} world={rowWorld} name={name} src={guild ? row.guild_mark_icon || "" : ""} size={72} />
                <span class="rk-podium__name">{name}</span>
                <RowMeta type={type} row={row} max={1} class="rk-podium__meta" />
                <span class="rk-podium__value display" title={value.full}>
                  {value.prefix ? <span class="rk-metric__affix">{value.prefix}</span> : null}
                  <CountUp value={toNumber(row[type.field])} format={type.big ? (n) => formatKoreanUnits(n) : (n) => formatComma(n)} duration={1200} />
                  {value.unit ? <span class="rk-metric__affix">{value.unit}</span> : null}
                </span>
              </a>
            </Tilt>
          </Reveal>
        );
      })}
    </ol>
  );
}

/**
 * 쪽 이동: 이전 · 번호 · 다음 · 쪽 번호 입력.
 * @param {{ page: number, hasMore: boolean, onPage: (page: number) => void, disabled?: boolean }} props
 */
function Pager({ page, hasMore, onPage, disabled = false }) {
  const [jump, setJump] = useState("");
  const numbers = [];
  for (let n = Math.max(1, page - 2); n <= page + (hasMore ? 1 : 0); n += 1) numbers.push(n);
  return (
    <nav class="pager" aria-label="쪽 이동">
      <button type="button" class="pager__btn" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} aria-label="이전 쪽">
        <Icon name="chevronRight" size={20} class="pager__prev-icon" />
      </button>
      {numbers[0] > 1 ? (
        <>
          <button type="button" class="pager__btn num" disabled={disabled} onClick={() => onPage(1)}>
            1
          </button>
          {numbers[0] > 2 ? <span class="pager__gap" aria-hidden="true">…</span> : null}
        </>
      ) : null}
      {numbers.map((n) => (
        <button
          type="button"
          key={n}
          class={`pager__btn num${n === page ? " is-current" : ""}`}
          aria-current={n === page ? "page" : undefined}
          disabled={disabled}
          onClick={() => n !== page && onPage(n)}
        >
          {n}
        </button>
      ))}
      <button type="button" class="pager__btn" disabled={disabled || !hasMore} onClick={() => onPage(page + 1)} aria-label="다음 쪽">
        <Icon name="chevronRight" size={20} />
      </button>
      <form
        class="pager__jump"
        onSubmit={(event) => {
          event.preventDefault();
          const n = Math.floor(Number(jump));
          if (Number.isFinite(n) && n >= 1) onPage(Math.min(500, n));
          setJump("");
        }}
      >
        <label class="sr-only" for="pager-jump">
          쪽 번호
        </label>
        <input
          id="pager-jump"
          class="pager__input num"
          type="number"
          inputMode="numeric"
          min={1}
          max={500}
          placeholder={`${page}쪽`}
          value={jump}
          onInput={(event) => setJump(/** @type {HTMLInputElement} */ (event.currentTarget).value)}
        />
        <button type="submit" class="btn btn--secondary btn--sm" disabled={disabled}>
          이동
        </button>
      </form>
    </nav>
  );
}

/** @param {{ count?: number }} props */
function RankingSkeleton({ count = 8 }) {
  return (
    <div class="rk-skeleton" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div class="rk-skeleton__row" key={index}>
          <Skeleton width={34} height={34} radius={10} />
          <Skeleton width={40} height={40} radius={12} />
          <span class="rk-skeleton__text">
            <Skeleton width={`${50 - (index % 4) * 6}%`} height={14} />
            <Skeleton width={`${34 + (index % 3) * 6}%`} height={11} />
          </span>
          <Skeleton width={84} height={18} />
        </div>
      ))}
    </div>
  );
}

export function Ranking() {
  const [query, setQuery] = useState(readQuery);
  const [state, setState] = useState(/** @type {{ key: string, status: "loading" | "ready" | "error", result?: RankingPage, error?: any }} */ ({ key: "", status: "loading" }));
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState({ name: query.name, world: query.world || DEFAULT_WORLD });
  const [searchMsg, setSearchMsg] = useState(/** @type {{ tone: "info" | "error", text: string } | null} */ (null));
  const [searching, setSearching] = useState(false);
  const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const scrollOnLoad = useRef(false);

  const type = getRankingType(query.type);
  const isGuild = type.subject === "guild";
  const today = kstToday();
  const key = `${query.type}|${query.date}|${query.world}|${query.page}|${attempt}`;

  // 뒤로/앞으로 가기
  useEffect(() => {
    const onPop = () => setQuery(readQuery());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.title = `${type.label} · 메이플M 플러스`;
  }, [type]);

  useEffect(() => {
    let alive = true;
    setState({ key, status: "loading" });
    loadRankingPage({ typeId: query.type, date: query.date, page: query.page, world: query.world }).then(
      (result) => alive && setState({ key, status: "ready", result }),
      (error) => alive && setState({ key, status: "error", error })
    );
    return () => {
      alive = false;
    };
  }, [key]);

  // 쪽을 옮기거나 이름을 찾으면 표 머리로(찾은 행이 있으면 그 행으로) 이동한다.
  useEffect(() => {
    if (state.status !== "ready" || !scrollOnLoad.current) return;
    scrollOnLoad.current = false;
    const panel = panelRef.current;
    if (!panel) return;
    // 표와 카드 목록 중 지금 보이는 쪽의 강조 행
    const hit = [...panel.querySelectorAll(".is-hit")].find((element) => element.getClientRects().length > 0);
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    (hit || panel).scrollIntoView({ block: hit ? "center" : "start", behavior });
  }, [state, query.name]);

  /** @param {Partial<Query>} patch @param {"push" | "replace"} [mode] */
  const update = (patch, mode = "push") => {
    const next = { ...query, ...patch };
    if (patch.type || patch.date || patch.world !== undefined) {
      if (!("page" in patch)) next.page = 1;
    }
    if (!("name" in patch) && (patch.type || patch.world !== undefined)) next.name = "";
    if (patch.page && patch.page !== query.page) scrollOnLoad.current = true;
    setQuery(next);
    writeQuery(next, mode);
  };

  const result = state.key === key && state.status === "ready" ? state.result : undefined;
  const moved = result && result.date && result.date !== result.requestedDate;

  const onSearch = async (event) => {
    event.preventDefault();
    const name = search.name.replace(/\s+/g, "");
    if (!name) {
      setSearchMsg({ tone: "error", text: `${isGuild ? "길드" : "캐릭터"} 이름을 입력해 주세요.` });
      return;
    }
    setSearching(true);
    setSearchMsg(null);
    try {
      if (isGuild) {
        // 길드 랭킹은 이름으로 바로 찾는 API가 없어 그날 상위 200위 안에서 찾는다.
        const date = result?.date || query.date;
        for (let page = 1; page <= 4; page += 1) {
          const pageResult = await loadRankingPage({ typeId: type.id, date, page, world: query.world });
          if (pageResult.rows.some((row) => row.guild_name === name)) {
            scrollOnLoad.current = true;
            update({ page, name, date });
            setSearchMsg({ tone: "info", text: `${name} 길드는 ${page}쪽에 있어요.` });
            return;
          }
          if (!pageResult.hasMore) break;
        }
        setSearchMsg({ tone: "error", text: `${formatDateDot(date)} 상위 200위 안에서 '${name}' 길드를 찾지 못했어요.` });
        return;
      }
      const world = query.world || search.world;
      const found = await findCharacterRank({ typeId: type.id, date: result?.date || query.date, name, world });
      if (!found) {
        setSearchMsg({ tone: "error", text: `${world} 월드의 '${name}' 캐릭터를 이 랭킹에서 찾지 못했어요. 이름과 월드를 확인해 주세요.` });
        return;
      }
      const rankForPage = query.world && found.worldRanking ? found.worldRanking : found.ranking;
      const page = Math.floor((rankForPage - 1) / RANKING_PAGE_SIZE) + 1;
      scrollOnLoad.current = true;
      update({ page, name, date: found.date });
      setSearchMsg({ tone: "info", text: `${name} · ${query.world ? `${query.world} ` : "전체 "}${formatComma(rankForPage)}위 (${page}쪽)` });
    } catch (error) {
      setSearchMsg({ tone: "error", text: /** @type {any} */ (error)?.message || "찾지 못했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setSearching(false);
    }
  };

  const tabItems = useMemo(() => RANKING_TYPES.map((item) => ({ id: item.id, label: item.short, icon: item.icon })), []);

  return (
    <div class="rk">
      <header class={`page-head page-head--rank tone-${type.tone}`}>
        <Aurora tone={isGuild ? "mint" : "sky"} />
        <Particles count={14} />
        <span class="page-head__icon" key={`icon-${type.id}`} aria-hidden="true">
          <Icon name={type.icon} size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText key={type.id} text={type.label} />
        </h1>
      </header>

      <Tabs idBase="rk" label="랭킹 종류" scrollable value={query.type} onChange={(id) => update({ type: id })} items={tabItems} />

      <section class="rk-filters card" aria-label="랭킹 조건">
        <div class="rk-filters__row">
          <div class="field">
            <label class="field__label" for="rk-world">
              월드
            </label>
            <span class="select">
              <select id="rk-world" value={query.world} onChange={(event) => update({ world: /** @type {HTMLSelectElement} */ (event.currentTarget).value })}>
                <option value="">전체 월드</option>
                {WORLDS.map((world) => (
                  <option key={world} value={world}>
                    {world}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={18} class="select__icon" />
            </span>
          </div>

          <div class="field">
            <label class="field__label" for="rk-date">
              날짜
            </label>
            <div class="date-stepper">
              <button
                type="button"
                class="icon-btn date-stepper__btn"
                aria-label="하루 전"
                disabled={query.date <= RANKING_DATE_FLOOR}
                onClick={() => update({ date: shiftDate(query.date, -1) })}
              >
                <Icon name="chevronRight" size={20} class="pager__prev-icon" />
              </button>
              <input
                id="rk-date"
                class="date-stepper__input num"
                type="date"
                min={RANKING_DATE_FLOOR}
                max={today}
                value={query.date}
                onChange={(event) => {
                  const value = /** @type {HTMLInputElement} */ (event.currentTarget).value;
                  if (DATE_RE.test(value) && value >= RANKING_DATE_FLOOR && value <= today) update({ date: value });
                }}
              />
              <button
                type="button"
                class="icon-btn date-stepper__btn"
                aria-label="하루 뒤"
                disabled={query.date >= today}
                onClick={() => update({ date: shiftDate(query.date, 1) })}
              >
                <Icon name="chevronRight" size={20} />
              </button>
            </div>
          </div>

          <form class="rk-find" role="search" aria-label={`${isGuild ? "길드" : "캐릭터"} 이름으로 순위 찾기`} onSubmit={onSearch}>
            {!isGuild && !query.world ? (
              <div class="field rk-find__world">
                <label class="field__label" for="rk-find-world">
                  찾을 월드
                </label>
                <span class="select">
                  <select id="rk-find-world" value={search.world} onChange={(event) => setSearch({ ...search, world: /** @type {HTMLSelectElement} */ (event.currentTarget).value })}>
                    {WORLDS.map((world) => (
                      <option key={world} value={world}>
                        {world}
                      </option>
                    ))}
                  </select>
                  <Icon name="chevronDown" size={18} class="select__icon" />
                </span>
              </div>
            ) : null}
            <div class="field rk-find__name">
              <label class="field__label" for="rk-find-name">
                {isGuild ? "길드 이름 찾기" : "캐릭터 이름 찾기"}
              </label>
              <div class="input-group">
                <input
                  id="rk-find-name"
                  class="input"
                  type="text"
                  maxLength={24}
                  autoComplete="off"
                  spellcheck={false}
                  enterKeyHint="search"
                  placeholder={isGuild ? "길드 이름" : "캐릭터 이름"}
                  value={search.name}
                  aria-describedby="rk-find-msg"
                  onInput={(event) => setSearch({ ...search, name: /** @type {HTMLInputElement} */ (event.currentTarget).value })}
                />
                <button type="submit" class="btn btn--primary" disabled={searching}>
                  <Icon name="search" size={20} />
                  <span class="input-group__text">{searching ? "찾는 중" : "찾기"}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
        <p id="rk-find-msg" class={`rk-find__msg${searchMsg ? ` is-${searchMsg.tone}` : ""}`} role="status" aria-live="polite">
          {searchMsg ? (
            <>
              <Icon name={searchMsg.tone === "error" ? "alert" : "info"} size={16} />
              {searchMsg.text}
              {query.name ? (
                <button type="button" class="link-btn" onClick={() => (update({ name: "" }, "replace"), setSearchMsg(null))}>
                  강조 지우기
                </button>
              ) : null}
            </>
          ) : null}
        </p>
      </section>

      <div class="rk-basis">
        {result?.date ? <Freshness date={result.date} /> : <span class="rk-basis__wait">집계일 확인 중</span>}
        {moved ? <span class="rk-basis__date num">{formatDateDot(result.date)}</span> : null}
      </div>

      {result && result.page === 1 && result.rows.length >= 3 ? <Podium type={type} rows={result.rows} world={query.world} /> : null}

      <TabPanel idBase="rk" value={query.type} busy={state.status === "loading"} class="rk-panel card" panelRef={panelRef}>
        {state.status === "loading" || state.key !== key ? (
          <>
            <RankingSkeleton />
            <span class="sr-only">{type.label}을 불러오는 중입니다.</span>
          </>
        ) : null}
        {state.key === key && state.status === "error" ? (
          <ErrorState
            title="랭킹을 불러오지 못했어요"
            description={state.error?.message || "잠시 후 다시 시도해 주세요."}
            detail={state.error?.detail}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        ) : null}
        {result && result.rows.length ? (
          <>
            <RankingTable type={type} rows={result.rows} world={query.world} highlight={query.name} />
            <RankingCards type={type} rows={result.rows} world={query.world} highlight={query.name} />
          </>
        ) : null}
        {result && !result.rows.length ? (
          query.page > 1 ? (
            <EmptyState
              title={`${query.page}쪽에는 순위가 없어요`}
              action={
                <button type="button" class="btn btn--secondary" onClick={() => update({ page: 1 })}>
                  1쪽으로
                </button>
              }
            />
          ) : (
            <EmptyState
              title="최근 집계된 랭킹이 없어요"
              action={
                <button type="button" class="btn btn--secondary" onClick={() => update({ date: shiftDate(query.date, -7) })}>
                  일주일 전 보기
                </button>
              }
            />
          )
        ) : null}
      </TabPanel>

      {result && (result.rows.length || query.page > 1) ? (
        <Pager page={query.page} hasMore={Boolean(result.hasMore)} onPage={(page) => update({ page })} disabled={state.status === "loading"} />
      ) : null}

    </div>
  );
}
