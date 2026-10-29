// 통계(/stats?view=class|level): 사이트가 모은 캐릭터(랭킹·길드 훑기·조회) 기준.
// 직업별: 전투력 상위 N명의 직업 인원·평균/최고 전투력·평균 템환산·잠재·에디. 레벨: 레벨 분포와 직업 비율.
import "../styles/stats.css";
import { useEffect, useMemo, useState } from "preact/hooks";
import { Icon } from "../components/Icon.jsx";
import { Aurora, Reveal, SplitText } from "../components/Motion.jsx";
import { Skeleton } from "../components/Skeleton.jsx";
import { ErrorState } from "../components/States.jsx";
import { Segmented } from "../components/Tabs.jsx";
import { getJson, toApiError } from "../lib/api.js";
import { formatComma, formatDecimal, formatKoreanUnits } from "../lib/format.js";
import { WORLDS } from "../lib/game.js";
import { CollectedNote } from "../components/CollectedNote.jsx";
import { setScoreText } from "../lib/itemScore.js";

const TOPS = [
  { value: "100", label: "100명" },
  { value: "1000", label: "1,000명" },
  { value: "5000", label: "5,000명" },
  { value: "0", label: "전체" }
];
const MIN_LEVELS = [250, 260, 270, 280, 290];

/** 1억 아래는 "9,612만", 위는 "1억 2,345만" */
const power = (/** @type {number} */ value) => formatKoreanUnits(value, { maxGroups: value >= 1e8 ? 2 : 1 });

const COLUMNS = [
  { key: "count", label: "인원", format: (row) => formatComma(row.count) },
  { key: "avgCombatPower", label: "평균 전투력", format: (row) => power(row.avgCombatPower) },
  { key: "maxCombatPower", label: "최고 전투력", format: (row) => power(row.maxCombatPower) },
  { key: "avgItemScore", label: "평균 템환산", format: (row) => setScoreText(row.avgItemScore || 0) },
  { key: "avgPotential", label: "평균 잠재", format: (row) => `${formatDecimal(row.avgPotential, 0)}%` },
  { key: "avgAdditionalPotential", label: "평균 에디", format: (row) => `${formatDecimal(row.avgAdditionalPotential, 0)}%` }
];

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  const world = String(params.get("world_name") || "");
  const top = String(params.get("top") || "1000");
  const minLevel = Number(params.get("min_level")) || 260;
  return {
    view: params.get("view") === "level" ? "level" : "class",
    world: WORLDS.includes(world) ? world : "",
    top: TOPS.some((item) => item.value === top) ? top : "1000",
    minLevel: MIN_LEVELS.includes(minLevel) ? minLevel : 260
  };
}

/** @param {string} url */
function useStats(url) {
  const [state, setState] = useState(/** @type {{ url: string, status: "loading" | "ready" | "error", data?: any, error?: any }} */ ({ url: "", status: "loading" }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ url, status: "loading" });
    getJson(url).then(
      ({ response, body }) => alive && setState(response.ok && body?.ok ? { url, status: "ready", data: body } : { url, status: "error", error: toApiError(response, body, "통계를 불러오지 못했어요.") }),
      (error) => alive && setState({ url, status: "error", error })
    );
    return () => {
      alive = false;
    };
  }, [url, attempt]);
  return { ...(state.url === url ? state : { status: "loading" }), retry: () => setAttempt((n) => n + 1) };
}

/** @param {{ world: string, onWorld: (world: string) => void }} props */
function WorldSelect({ world, onWorld }) {
  return (
    <span class="select">
      <select aria-label="월드" value={world} onChange={(event) => onWorld(/** @type {HTMLSelectElement} */ (event.currentTarget).value)}>
        <option value="">전체 월드</option>
        {WORLDS.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={18} class="select__icon" />
    </span>
  );
}

/** @param {{ query: ReturnType<typeof readQuery>, onQuery: (patch: any) => void }} props */
function ClassStats({ query, onQuery }) {
  const params = new URLSearchParams({ top: query.top });
  if (query.world) params.set("world_name", query.world);
  const stats = useStats(`/api/v2/stats/classes?${params}`);
  const [sort, setSort] = useState("count");
  const rows = useMemo(() => [...(stats.data?.classes || [])].sort((a, b) => (b[sort] || 0) - (a[sort] || 0)), [stats.data, sort]);
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  const best = rows.reduce((top, row) => (!top || row.maxCombatPower > top.maxCombatPower ? row : top), null);

  return (
    <>
      <div class="stats-filters card">
        <WorldSelect world={query.world} onWorld={(world) => onQuery({ world })} />
        <Segmented name="stats-top" legend="전투력 상위" value={query.top} onChange={(top) => onQuery({ top })} options={TOPS} />
      </div>
      {stats.status === "loading" ? <Skeleton height={420} radius={20} /> : null}
      {stats.status === "error" ? <ErrorState title="통계를 불러오지 못했어요" description={stats.error?.message} onRetry={stats.retry} /> : null}
      {stats.status === "ready" ? (
        <>
          <div class="stats-cards">
            <Reveal class="card stats-card">
              <span class="stats-card__label">대상</span>
              <strong class="display num">{formatComma(stats.data.total)}명</strong>
              <span class="stats-card__note">전투력 {query.top === "0" ? "전체" : `상위 ${formatComma(Number(query.top))}명`}</span>
            </Reveal>
            <Reveal class="card stats-card" delay={60}>
              <span class="stats-card__label">가장 많은 직업</span>
              <strong class="display">{[...rows].sort((a, b) => b.count - a.count)[0]?.className || "-"}</strong>
              <span class="stats-card__note num">{[...rows].sort((a, b) => b.count - a.count)[0]?.share ?? 0}%</span>
            </Reveal>
            <Reveal class="card stats-card" delay={120}>
              <span class="stats-card__label">최고 전투력</span>
              <strong class="display num">{best ? power(best.maxCombatPower) : "-"}</strong>
              <span class="stats-card__note">{best?.className || ""}</span>
            </Reveal>
          </div>
          <div class="card stats-table-wrap">
            <table class="stats-table">
              <thead>
                <tr>
                  <th scope="col">직업</th>
                  {COLUMNS.map((column) => (
                    <th scope="col" key={column.key}>
                      <button type="button" class={`stats-sort${sort === column.key ? " is-on" : ""}`} onClick={() => setSort(column.key)} aria-pressed={sort === column.key}>
                        {column.label}
                        <Icon name="chevronDown" size={14} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.className}>
                    <th scope="row" class="stats-table__class">
                      {row.className}
                      <span class="stats-bar" aria-hidden="true">
                        <span style={{ width: `${Math.max(2, (row.count / maxCount) * 100)}%` }} />
                      </span>
                    </th>
                    {COLUMNS.map((column) => (
                      <td key={column.key} class="num">
                        {column.format(row)}
                        {column.key === "count" ? <span class="stats-share"> {row.share}%</span> : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}

/** @param {{ query: ReturnType<typeof readQuery>, onQuery: (patch: any) => void }} props */
function LevelStats({ query, onQuery }) {
  const params = new URLSearchParams({ min_level: String(query.minLevel) });
  if (query.world) params.set("world_name", query.world);
  const stats = useStats(`/api/v2/stats/levels?${params}`);
  const levels = stats.data?.levels || [];
  const classes = stats.data?.classes || [];
  const maxLevelCount = Math.max(1, ...levels.map((row) => row.count));
  const maxClassCount = Math.max(1, ...classes.map((row) => row.count));

  return (
    <>
      <div class="stats-filters card">
        <WorldSelect world={query.world} onWorld={(world) => onQuery({ world })} />
        <Segmented
          name="stats-level"
          legend="레벨 하한"
          value={String(query.minLevel)}
          onChange={(value) => onQuery({ minLevel: Number(value) })}
          options={MIN_LEVELS.map((level) => ({ value: String(level), label: `${level}+` }))}
        />
      </div>
      {stats.status === "loading" ? <Skeleton height={420} radius={20} /> : null}
      {stats.status === "error" ? <ErrorState title="통계를 불러오지 못했어요" description={stats.error?.message} onRetry={stats.retry} /> : null}
      {stats.status === "ready" ? (
        <div class="stats-split">
          <Reveal class="card stats-panel">
            <h2 class="stats-panel__title">
              레벨별 <span class="num">{formatComma(stats.data.total)}명</span>
            </h2>
            <ol class="stats-bars">
              {levels.map((row) => (
                <li key={row.level}>
                  <span class="stats-bars__label num">Lv.{row.level}</span>
                  <span class="stats-bars__track" aria-hidden="true">
                    <span style={{ width: `${Math.max(1, (row.count / maxLevelCount) * 100)}%` }} />
                  </span>
                  <span class="stats-bars__value num">{formatComma(row.count)}</span>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal class="card stats-panel" delay={80}>
            <h2 class="stats-panel__title">직업 비율</h2>
            <ol class="stats-bars">
              {classes.map((row) => (
                <li key={row.className}>
                  <span class="stats-bars__label">{row.className}</span>
                  <span class="stats-bars__track is-mint" aria-hidden="true">
                    <span style={{ width: `${Math.max(1, (row.count / maxClassCount) * 100)}%` }} />
                  </span>
                  <span class="stats-bars__value num">{row.share}%</span>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      ) : null}
    </>
  );
}

export function Stats() {
  const [query, setQuery] = useState(readQuery);
  useEffect(() => {
    const onPop = () => setQuery(readQuery());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const onQuery = (/** @type {any} */ patch) => {
    const next = { ...query, ...patch };
    setQuery(next);
    const params = new URLSearchParams();
    if (next.view !== "class") params.set("view", next.view);
    if (next.world) params.set("world_name", next.world);
    if (next.view === "class" && next.top !== "1000") params.set("top", next.top);
    if (next.view === "level" && next.minLevel !== 260) params.set("min_level", String(next.minLevel));
    const url = `/stats${params.toString() ? `?${params}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.pushState(null, "", url);
  };

  return (
    <div class="stats">
      <header class="page-head page-head--rank tone-sky">
        <Aurora tone="sky" />
        <span class="page-head__icon" aria-hidden="true">
          <Icon name="union" size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText text="통계" />
        </h1>
      </header>
      <CollectedNote />
      <div class="stats-switch">
        <Segmented
          name="stats-view"
          legend="통계 종류"
          value={query.view}
          onChange={(view) => onQuery({ view })}
          options={[
            { value: "class", label: "직업별 전투력" },
            { value: "level", label: "레벨 분포" }
          ]}
        />
      </div>
      {query.view === "class" ? <ClassStats query={query} onQuery={onQuery} /> : <LevelStats query={query} onQuery={onQuery} />}
    </div>
  );
}
