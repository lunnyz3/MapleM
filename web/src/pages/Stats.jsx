// 통계(/stats?view=class|level|meta): 사이트가 모은 캐릭터(랭킹·길드 훑기·조회) 기준.
// 직업별: 전투력 상위 N명의 직업 인원·평균/최고 전투력·평균 템환산·잠재·에디. 레벨: 레벨 분포와 직업 비율.
// 직업 메타: 한 직업 전투력 상위 100명이 실제로 쓰는 무기 옵션·문장·소울·세트·장신구·스타포스.
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
  const view = String(params.get("view") || "");
  return {
    view: view === "level" || view === "meta" ? view : "class",
    cls: String(params.get("class") || "").slice(0, 20),
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
                      <button type="button" class="stats-class-link" onClick={() => onQuery({ view: "meta", cls: row.className })}>
                        {row.className}
                      </button>
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

const percent = (/** @type {number} */ share) => `${formatDecimal(share * 100, share < 0.1 ? 1 : 0)}%`;

/** 비율 막대 목록(이름 위, 막대 아래). @param {{ rows: Array<{ label: string, share: number }>, tone?: string }} props */
function ShareList({ rows, tone = "" }) {
  if (!rows?.length) return <p class="stats-meta__empty">-</p>;
  return (
    <ol class="stats-meta__list">
      {rows.map((row) => (
        <li key={row.label}>
          <span class="stats-meta__label">{row.label}</span>
          <span class="stats-meta__value num">{percent(row.share)}</span>
          <span class={`stats-bars__track${tone ? ` ${tone}` : ""}`} aria-hidden="true">
            <span style={{ width: `${Math.max(1, row.share * 100)}%` }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/** @param {{ query: ReturnType<typeof readQuery>, onQuery: (patch: any) => void }} props */
function JobMeta({ query, onQuery }) {
  const params = new URLSearchParams();
  if (query.cls) params.set("class", query.cls);
  if (query.world) params.set("world_name", query.world);
  const stats = useStats(`/api/v2/stats/job-meta?${params}`);
  const data = stats.data;
  const maxStar = Math.max(1, ...(data?.starforce || []).map((row) => row.avg || 0));

  return (
    <>
      <div class="stats-filters stats-filters--pair card">
        <WorldSelect world={query.world} onWorld={(world) => onQuery({ world })} />
        <span class="select">
          <select
            aria-label="직업"
            value={data?.className || query.cls}
            onChange={(event) => onQuery({ cls: /** @type {HTMLSelectElement} */ (event.currentTarget).value })}
          >
            {(data?.classes || (query.cls ? [{ className: query.cls }] : [])).map((row) => (
              <option key={row.className} value={row.className}>
                {row.className}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={18} class="select__icon" />
        </span>
      </div>
      {stats.status === "loading" ? <Skeleton height={520} radius={20} /> : null}
      {stats.status === "error" ? <ErrorState title="통계를 불러오지 못했어요" description={stats.error?.message} onRetry={stats.retry} /> : null}
      {stats.status === "ready" && !data.count ? <ErrorState title="모은 캐릭터가 없어요" /> : null}
      {stats.status === "ready" && data.count ? (
        <>
          <div class="stats-cards">
            <Reveal class="card stats-card">
              <span class="stats-card__label">{data.className} 전투력 상위</span>
              <strong class="display num">{formatComma(data.count)}명</strong>
              <span class="stats-card__note num">{power(data.summary.minCombatPower)} 이상</span>
            </Reveal>
            <Reveal class="card stats-card" delay={60}>
              <span class="stats-card__label">평균 전투력</span>
              <strong class="display num">{power(data.summary.avgCombatPower)}</strong>
              <span class="stats-card__note num">Lv.{formatDecimal(data.summary.avgLevel, 1)}</span>
            </Reveal>
            <Reveal class="card stats-card" delay={120}>
              <span class="stats-card__label">평균 템환산</span>
              <strong class="display num">{setScoreText(data.summary.avgItemScore || 0)}</strong>
              <span class="stats-card__note">&nbsp;</span>
            </Reveal>
          </div>
          <div class="stats-split stats-meta">
            <Reveal class="card stats-panel">
              <h2 class="stats-panel__title">무기</h2>
              <div class="stats-meta__group">
                <h3 class="stats-meta__sub">종류</h3>
                <ShareList rows={data.weapon.items} />
              </div>
              <div class="stats-meta__group">
                <h3 class="stats-meta__sub">잠재능력</h3>
                <ShareList rows={data.weapon.potential} />
              </div>
              <div class="stats-meta__group">
                <h3 class="stats-meta__sub">에디셔널</h3>
                <ShareList rows={data.weapon.additional} />
              </div>
              <div class="stats-meta__group">
                <h3 class="stats-meta__sub">추가옵션</h3>
                <ShareList rows={data.weapon.flame} />
              </div>
            </Reveal>
            <div class="stats-meta__col">
              <Reveal class="card stats-panel" delay={60}>
                <h2 class="stats-panel__title">문장 · 소울</h2>
                <div class="stats-meta__group">
                  <h3 class="stats-meta__sub">문장</h3>
                  <ShareList rows={data.weapon.emblem} tone="is-mint" />
                </div>
                <div class="stats-meta__group">
                  <h3 class="stats-meta__sub">소울</h3>
                  <ShareList rows={data.weapon.soul} tone="is-mint" />
                </div>
              </Reveal>
              <Reveal class="card stats-panel" delay={120}>
                <h2 class="stats-panel__title">세트</h2>
                <ShareList rows={data.sets} tone="is-mint" />
              </Reveal>
              <Reveal class="card stats-panel" delay={180}>
                <h2 class="stats-panel__title">평균 스타포스</h2>
                <ol class="stats-bars">
                  {data.starforce.map((row) => (
                    <li key={row.slot}>
                      <span class="stats-bars__label">{row.slot}</span>
                      <span class="stats-bars__track is-mint" aria-hidden="true">
                        <span style={{ width: `${Math.max(1, (row.avg / maxStar) * 100)}%` }} />
                      </span>
                      <span class="stats-bars__value num">★{formatDecimal(row.avg, 1)}</span>
                    </li>
                  ))}
                </ol>
              </Reveal>
            </div>
            <Reveal class="card stats-panel stats-meta__wide">
              <h2 class="stats-panel__title">장신구</h2>
              <div class="stats-meta__grid">
                {data.accessories.map((entry) => (
                  <div key={entry.group} class="stats-meta__group">
                    <h3 class="stats-meta__sub">{entry.group}</h3>
                    <ShareList rows={entry.rows} />
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </>
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
    if (next.view === "meta" && next.cls) params.set("class", next.cls);
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
            { value: "meta", label: "직업 메타" },
            { value: "level", label: "레벨 분포" }
          ]}
        />
      </div>
      {query.view === "class" ? <ClassStats query={query} onQuery={onQuery} /> : null}
      {query.view === "meta" ? <JobMeta query={query} onQuery={onQuery} /> : null}
      {query.view === "level" ? <LevelStats query={query} onQuery={onQuery} /> : null}
    </div>
  );
}
