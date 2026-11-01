// 레벨 300 레이스(/race): 공식 레벨 랭킹 상위 20명의 Lv.300 레이스 중계 — 1위는 크게, 2~20위는 줄로(지금 레벨·경험치 %, 오늘 증가,
// 24시간 전 대비 순위 변화, 다음 레벨 도달 예상), 처음 Lv.299·300을 확인한 기록. 서버가 15분마다 확인하고 화면은 1분마다 다시 읽는다.
// 아래는 이번 주 가장 많이 오른 사람(레벨 순위 계단·유니온·업적, 월드·직업 거르기). GET /api/v2/level-race, /api/v2/climbers.
import "../styles/race.css";
import { useEffect, useState } from "preact/hooks";
import { Avatar } from "../components/Avatar.jsx";
import { WorldIcon } from "../components/GameIcons.jsx";
import { Icon } from "../components/Icon.jsx";
import { Aurora, SplitText } from "../components/Motion.jsx";
import { SkeletonList } from "../components/Skeleton.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { Segmented } from "../components/Tabs.jsx";
import { getJson } from "../lib/api.js";
import { formatComma, formatDecimal } from "../lib/format.js";
import { WORLDS, urls } from "../lib/game.js";

const REFRESH_MS = 60 * 1000;
const DAYS = "일월화수목금토";
const CLIMB_TYPES = [
  { value: "level", label: "레벨" },
  { value: "union", label: "유니온" },
  { value: "achievement", label: "업적" }
];

/** 11/2(월) 18시 (서울) */
function kstText(at) {
  const d = new Date(at + 9 * 60 * 60 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${DAYS[d.getUTCDay()]}) ${d.getUTCHours()}시`;
}

/** 11/2(월) 18:05 (서울) */
function kstClock(at) {
  const d = new Date(at + 9 * 60 * 60 * 1000);
  const pad = (value) => String(value).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${DAYS[d.getUTCDay()]}) ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 약 9시간 뒤 · 11/2(월) 18시 */
function etaText(at, now) {
  if (!at) return "";
  const hours = (at - now) / (60 * 60 * 1000);
  const relative = hours < 1 ? "1시간 안" : hours < 48 ? `약 ${Math.round(hours)}시간 뒤` : `약 ${Math.round(hours / 24)}일 뒤`;
  return `${relative} · ${kstText(at)}`;
}

const percent = (units) => `${formatDecimal(units * 100, 2)}%`;

function useRace() {
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", race?: any }} */ ({ status: "loading" }));
  useEffect(() => {
    let alive = true;
    const load = () =>
      getJson("/api/v2/level-race").then(
        ({ response, body }) => {
          if (!alive) return;
          if (response.ok && body?.ok) setState({ status: "ready", race: body.race });
          else setState((current) => (current.status === "ready" ? current : { status: "error" }));
        },
        () => alive && setState((current) => (current.status === "ready" ? current : { status: "error" }))
      );
    load();
    const timer = window.setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  return state;
}

/** 레벨 단위 막대: base 레벨부터 300까지, 사이 레벨마다 눈금 */
function Track({ level, expRate, base, target }) {
  const units = level + expRate / 100;
  const fill = Math.max(0, Math.min(100, ((units - base) / (target - base)) * 100));
  const ticks = Array.from({ length: target - base - 1 }, (_, index) => base + index + 1);
  return (
    <span class="race-track" role="img" aria-label={`Lv.${target}까지 ${formatDecimal(target - units, 2)}레벨 남음`}>
      <span class="race-track__fill" style={{ "--fill": `${fill}%` }} />
      {ticks.map((tick) => (
        <span key={tick} class="race-track__tick" style={{ "--at": `${((tick - base) / (target - base)) * 100}%` }} />
      ))}
    </span>
  );
}

function RankChange({ change }) {
  if (change === null || change === undefined) return <span class="race-change">-</span>;
  if (change === 0) return <span class="race-change">–</span>;
  return (
    <span class={`race-change ${change > 0 ? "is-up" : "is-down"}`} aria-label={`24시간 전보다 ${Math.abs(change)}계단 ${change > 0 ? "올라감" : "내려감"}`}>
      {change > 0 ? "▲" : "▼"}
      {Math.abs(change)}
    </span>
  );
}

function Leader({ row, base, target, now }) {
  return (
    <article class="race-lead">
      <div class="race-lead__who">
        <Avatar world={row.world} name={row.name} size={96} />
        <div>
          <p class="race-lead__eyebrow">
            <span class="race-lead__crown">
              <Icon name="crown" size={16} />
              선두
            </span>
            {row.fastest ? <span class="race-badge">오늘 가장 빠름</span> : null}
          </p>
          <a class="race-lead__name display" href={urls.character(row.world, row.name)}>
            {row.name}
          </a>
          <p class="race-lead__meta">
            <WorldIcon world={row.world} size={16} />
            {row.world} · {row.className}
            {row.guild ? ` · ${row.guild}` : ""}
          </p>
        </div>
      </div>
      <div class="race-lead__level">
        <strong class="display num">Lv.{row.level}</strong>
        <span class="num">{formatDecimal(row.expRate, 2)}%</span>
      </div>
      <Track level={row.level} expRate={row.expRate} base={base} target={target} />
      <dl class="race-lead__facts">
        <div>
          <dt>Lv.{row.nextLevel}까지</dt>
          <dd class="num">{formatDecimal(100 - row.expRate, 2)}%</dd>
        </div>
        <div>
          <dt>오늘</dt>
          <dd class="num">{row.today > 0 ? `+${percent(row.today)}` : "-"}</dd>
        </div>
        <div>
          <dt>Lv.{row.nextLevel} 예상</dt>
          <dd>{row.nextAt ? etaText(row.nextAt, now) : "속도 재는 중"}</dd>
        </div>
        <div>
          <dt>Lv.{target} 예상</dt>
          <dd>{row.targetAt ? etaText(row.targetAt, now) : "속도 재는 중"}</dd>
        </div>
      </dl>
    </article>
  );
}

function RacerRow({ row, base, target, now }) {
  return (
    <li class={`race-row${row.fastest ? " is-fastest" : ""}`}>
      <span class="race-row__rank num">{row.rank}</span>
      <RankChange change={row.rankChange} />
      <a class="race-row__who" href={urls.character(row.world, row.name)}>
        <Avatar world={row.world} name={row.name} size={40} lazy />
        <span>
          <strong>{row.name}</strong>
          <span class="race-row__meta">
            <WorldIcon world={row.world} size={14} />
            <span class="race-ellipsis">{row.className}</span>
          </span>
        </span>
      </a>
      <span class="race-row__level num">
        Lv.{row.level} <small>{formatDecimal(row.expRate, 2)}%</small>
      </span>
      <Track level={row.level} expRate={row.expRate} base={base} target={target} />
      <span class="race-row__today num">{row.today > 0 ? `+${percent(row.today)}` : "-"}</span>
      <span class="race-row__eta">{row.nextAt ? `Lv.${row.nextLevel} ${etaText(row.nextAt, now).split(" · ")[0]}` : row.fastest ? "오늘 가장 빠름" : ""}</span>
    </li>
  );
}

function RaceBoard() {
  const state = useRace();
  const now = Date.now();
  if (state.status === "loading") return <SkeletonList rows={6} />;
  if (state.status === "error") return <ErrorState compact title="레이스 기록을 불러오지 못했어요" />;
  const race = state.race;
  if (!race?.rows?.length) return <EmptyState compact title="첫 확인을 기다리는 중이에요" />;
  const target = race.target;
  const base = Math.min(target - 1, ...race.rows.map((row) => row.level));
  const [leader, ...rest] = race.rows;
  return (
    <>
      {race.firsts?.length ? (
        <ul class="race-firsts">
          {race.firsts.map((first) => (
            <li key={first.level}>
              <Icon name="medal" size={18} />
              <strong>Lv.{first.level} 첫 도달</strong>
              <a href={urls.character(first.world, first.name)}>{first.name}</a>
              <span>
                {first.world} · {kstClock(new Date(first.at).getTime())}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <Leader row={leader} base={base} target={target} now={now} />
      <ol class="race-rows" start={2}>
        {rest.map((row) => (
          <RacerRow key={`${row.world}/${row.name}`} row={row} base={base} target={target} now={now} />
        ))}
      </ol>
      <p class="race-note">
        {race.checkedAt ? `${kstClock(race.checkedAt)} 확인 · ` : ""}15분마다 확인, 넥슨 반영은 약 10분 늦어요
      </p>
    </>
  );
}

function useClassNames() {
  const [names, setNames] = useState(/** @type {string[]} */ ([]));
  useEffect(() => {
    getJson("/api/v2/stats/classes?top=0").then(
      ({ response, body }) =>
        response.ok && body?.ok && setNames((body.classes || []).map((entry) => entry.className).sort((a, b) => a.localeCompare(b, "ko"))),
      () => {}
    );
  }, []);
  return names;
}

function climbValue(type, row) {
  if (type === "level") return `Lv.${row.was} → ${row.value}`;
  return `${formatComma(row.was)} → ${formatComma(row.value)}`;
}

function Climbers() {
  const [type, setType] = useState("level");
  const [world, setWorld] = useState("");
  const [className, setClassName] = useState("");
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", data?: any }} */ ({ status: "loading" }));
  const classNames = useClassNames();
  const classless = type === "achievement";
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    const params = new URLSearchParams({ type });
    if (world) params.set("world_name", world);
    if (className && !classless) params.set("class", className);
    getJson(`/api/v2/climbers?${params}`).then(
      ({ response, body }) => alive && setState(response.ok && body?.ok ? { status: "ready", data: body.climbers } : { status: "error" }),
      () => alive && setState({ status: "error" })
    );
    return () => {
      alive = false;
    };
  }, [type, world, className, classless]);
  const data = state.data;
  return (
    <section class="card race-climb" aria-labelledby="race-climb-title">
      <header class="race-climb__head">
        <h2 id="race-climb-title" class="race-section-title">
          <Icon name="chart" size={20} />
          이번 주 가장 많이 오른 사람
        </h2>
        {data ? (
          <p class="race-climb__dates num">
            {data.before.slice(5).replace("-", "/")} → {data.date.slice(5).replace("-", "/")} · 공식 랭킹 상위 {formatComma(data.total)}명
          </p>
        ) : null}
      </header>
      <div class="race-climb__controls">
        <Segmented name="climb-type" legend="종류" options={CLIMB_TYPES} value={type} onChange={setType} />
        <span class="select">
          <select aria-label="월드" value={world} onChange={(event) => setWorld(/** @type {HTMLSelectElement} */ (event.currentTarget).value)}>
            <option value="">전체 월드</option>
            {WORLDS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={18} class="select__icon" />
        </span>
        <span class="select">
          <select
            aria-label="직업"
            value={classless ? "" : className}
            disabled={classless}
            onChange={(event) => setClassName(/** @type {HTMLSelectElement} */ (event.currentTarget).value)}
          >
            <option value="">전체 직업</option>
            {classNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={18} class="select__icon" />
        </span>
      </div>
      {state.status === "loading" ? <SkeletonList rows={6} /> : null}
      {state.status === "error" ? <ErrorState compact title="랭킹을 불러오지 못했어요" /> : null}
      {state.status === "ready" ? (
        <>
          <ul class="race-climb__chips">
            <li>
              새로 1만 위 안 <strong class="num">{formatComma(data.fresh.count)}</strong>명
            </li>
            {data.topClass ? (
              <li>
                오른 사람 많은 직업 <strong>{data.topClass.className}</strong>
              </li>
            ) : null}
          </ul>
          {data.rows.length ? (
            <ol class="race-climb__list">
              {data.rows.map((row) => (
                <li key={`${row.world}/${row.name}`}>
                  <span class="race-climb__gain num">{type === "level" ? `▲${formatComma(row.climb)}` : `+${formatComma(row.gain)}`}</span>
                  <a class="race-climb__who" href={urls.character(row.world, row.name)}>
                    <strong>{row.name}</strong>
                    <span class="race-row__meta">
                      <WorldIcon world={row.world} size={14} />
                      <span class="race-ellipsis">{row.className || row.world}</span>
                    </span>
                  </a>
                  <span class="race-climb__value num">{climbValue(type, row)}</span>
                  <span class="race-climb__rank num">
                    {formatComma(row.rankWas)}위 → {formatComma(row.rank)}위
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState compact title="이 조건에서 오른 사람이 없어요" />
          )}
        </>
      ) : null}
    </section>
  );
}

export function Race() {
  return (
    <div class="race">
      <header class="page-head page-head--rank tone-peach">
        <Aurora tone="peach" />
        <span class="page-head__icon" aria-hidden="true">
          <Icon name="trophy" size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText text="레벨 300 레이스" />
        </h1>
        <span class="race-live">
          <span class="live-dot" aria-hidden="true" />
          실시간 중계
        </span>
      </header>
      <section class="card race-board" aria-label="레벨 300 레이스 중계">
        <RaceBoard />
      </section>
      <Climbers />
    </div>
  );
}
