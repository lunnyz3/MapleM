// 코디 구경(/looks?tab=hair|face|item|random&gender=): 모은 캐릭터의 인기 헤어·성형(피부)·부위별 캐시템 순위와 무작위 코디 구경.
// 순위 줄을 누르면 그 코디를 한 캐릭터(무작위 24명). GET /api/v2/looks/stats · /looks/wearers · /looks/random.
import "../styles/looks.css";
import { useEffect, useState } from "preact/hooks";
import { Avatar } from "../components/Avatar.jsx";
import { WorldIcon } from "../components/GameIcons.jsx";
import { Icon } from "../components/Icon.jsx";
import { Aurora, SplitText } from "../components/Motion.jsx";
import { Sheet } from "../components/Sheet.jsx";
import { SkeletonList } from "../components/Skeleton.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { Segmented, Tabs } from "../components/Tabs.jsx";
import { getJson } from "../lib/api.js";
import { formatComma, formatDecimal } from "../lib/format.js";
import { urls } from "../lib/game.js";

const TABS = [
  { id: "hair", label: "인기 헤어" },
  { id: "face", label: "인기 성형" },
  { id: "item", label: "인기 캐시템" },
  { id: "random", label: "코디 구경" }
];
const GENDERS = [
  { value: "", label: "전체" },
  { value: "Female", label: "여자" },
  { value: "Male", label: "남자" }
];
const SLOT_ORDER = ["모자", "한벌옷", "상의", "하의", "망토", "무기", "신발", "장갑", "얼굴장식", "눈장식", "귀고리", "탈것", "의자"];
const percent = (share) => `${formatDecimal(share * 100, share < 0.01 ? 2 : 1)}%`;

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab") || "hair";
  const gender = params.get("gender") || "";
  return { tab: TABS.some((item) => item.id === tab) ? tab : "hair", gender: gender === "Female" || gender === "Male" ? gender : "" };
}

/** @param {string} url */
function useJson(url) {
  const [state, setState] = useState(/** @type {{ url: string, status: "loading" | "ready" | "error", data?: any }} */ ({ url: "", status: "loading" }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    setState({ url, status: "loading" });
    getJson(url).then(
      ({ response, body }) => alive && setState(response.ok && body?.ok ? { url, status: "ready", data: body } : { url, status: "error" }),
      () => alive && setState({ url, status: "error" })
    );
    return () => {
      alive = false;
    };
  }, [url, attempt]);
  return { ...(state.url === url ? state : { status: "loading" }), retry: () => setAttempt((n) => n + 1) };
}

/** 캐릭터 그림 칸들 @param {{ people: any[] }} props */
function PeopleGrid({ people }) {
  if (!people.length) return <EmptyState compact title="아직 모은 캐릭터가 없어요" />;
  return (
    <ul class="looks-people">
      {people.map((person) => (
        <li key={`${person.world}/${person.name}`}>
          <a href={urls.character(person.world, person.name)}>
            <Avatar world={person.world} name={person.name} size={96} lazy />
            <strong>{person.name}</strong>
            <span>
              <WorldIcon world={person.world} size={12} /> {person.className}
            </span>
            {person.hair ? <small>{person.hair}</small> : null}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** 그 코디를 한 캐릭터 시트 @param {{ pick: { kind: string, name: string } | null, gender: string, onClose: () => void }} props */
function WearersSheet({ pick, gender, onClose }) {
  const url = pick ? `/api/v2/looks/wearers?${new URLSearchParams({ kind: pick.kind, name: pick.name, gender })}` : "";
  const state = useJson(url);
  return (
    <Sheet open={Boolean(pick)} title={pick ? `${pick.name} 코디 캐릭터` : ""} onClose={onClose} class="looks-sheet">
      {state.status === "loading" ? <SkeletonList rows={4} /> : null}
      {state.status === "error" ? <ErrorState compact title="불러오지 못했어요" onRetry={state.retry} /> : null}
      {state.status === "ready" ? <PeopleGrid people={state.data.people || []} /> : null}
    </Sheet>
  );
}

/** 순위 목록 @param {{ rows: any[], kind: string, onPick: (pick: { kind: string, name: string }) => void }} props */
function RankList({ rows, kind, onPick }) {
  if (!rows.length) return <EmptyState compact title="아직 모은 코디가 없어요" />;
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ol class="looks-rank">
      {rows.map((row, index) => (
        <li key={row.name}>
          <button type="button" class="looks-rank__row" onClick={() => onPick({ kind, name: row.name })}>
            <span class={`looks-rank__no num${index < 3 ? " is-top" : ""}`}>{index + 1}</span>
            {row.icon ? <img class="looks-rank__icon" src={row.icon} alt="" width={36} height={36} loading="lazy" /> : null}
            <span class="looks-rank__name">{row.name}</span>
            <span class="looks-rank__bar" aria-hidden="true">
              <span style={{ width: `${Math.max(2, (row.count / max) * 100)}%` }} />
            </span>
            <span class="looks-rank__count num">
              {formatComma(row.count)}명 <small>{percent(row.share)}</small>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function Looks() {
  const [query, setQuery] = useState(readQuery);
  const [slot, setSlot] = useState("한벌옷");
  const [pick, setPick] = useState(/** @type {{ kind: string, name: string } | null} */ (null));
  const [shuffle, setShuffle] = useState(0);
  const update = (patch) => {
    const next = { ...query, ...patch };
    setQuery(next);
    const params = new URLSearchParams();
    if (next.tab !== "hair") params.set("tab", next.tab);
    if (next.gender) params.set("gender", next.gender);
    const url = `/looks${params.toString() ? `?${params}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(null, "", url);
  };
  const genderParam = query.gender ? `?${new URLSearchParams({ gender: query.gender })}` : "";
  const stats = useJson(query.tab === "random" ? "" : `/api/v2/looks/stats${genderParam}`);
  const random = useJson(query.tab === "random" ? `/api/v2/looks/random?${new URLSearchParams({ gender: query.gender, t: String(shuffle) })}` : "");
  const data = stats.data;
  const slots = data ? SLOT_ORDER.filter((name) => data.items?.[name]?.length) : [];
  const currentSlot = slots.includes(slot) ? slot : slots[0] || "";

  return (
    <div class="looks">
      <header class="page-head page-head--rank tone-lavender">
        <Aurora tone="dusk" />
        <span class="page-head__icon" aria-hidden="true">
          <Icon name="sparkle" size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText text="코디 구경" />
        </h1>
      </header>

      <div class="looks-bar">
        <Tabs idBase="looks" label="코디 종류" value={query.tab} onChange={(tab) => update({ tab })} items={TABS} scrollable />
        <Segmented name="looks-gender" legend="성별" value={query.gender} onChange={(gender) => update({ gender })} options={GENDERS} />
      </div>

      <section class="card looks-panel">
        {query.tab !== "random" ? (
          <>
            {stats.status === "loading" ? <SkeletonList rows={8} /> : null}
            {stats.status === "error" ? <ErrorState compact title="코디를 불러오지 못했어요" onRetry={stats.retry} /> : null}
            {stats.status === "ready" ? (
              <>
                <p class="looks-note num">모은 캐릭터 {formatComma(data.total)}명 기준 · 누르면 그 코디를 한 캐릭터</p>
                {query.tab === "hair" ? <RankList rows={data.hair} kind="hair" onPick={setPick} /> : null}
                {query.tab === "face" ? (
                  <>
                    <RankList rows={data.face} kind="face" onPick={setPick} />
                    <h2 class="looks-sub">인기 피부</h2>
                    <RankList rows={data.skin} kind="skin" onPick={setPick} />
                  </>
                ) : null}
                {query.tab === "item" ? (
                  <>
                    <div class="looks-slots" role="group" aria-label="부위">
                      {slots.map((name) => (
                        <button key={name} type="button" class={`looks-slot${name === currentSlot ? " is-on" : ""}`} aria-pressed={name === currentSlot} onClick={() => setSlot(name)}>
                          {name}
                        </button>
                      ))}
                    </div>
                    <RankList rows={data.items?.[currentSlot] || []} kind="item" onPick={setPick} />
                  </>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <>
            <div class="looks-random__head">
              <p class="looks-note">모은 캐릭터 중 무작위 24명</p>
              <button type="button" class="btn btn--secondary btn--sm" onClick={() => setShuffle((n) => n + 1)}>
                <Icon name="refresh" size={16} />
                다시 섞기
              </button>
            </div>
            {random.status === "loading" ? <SkeletonList rows={4} /> : null}
            {random.status === "error" ? <ErrorState compact title="불러오지 못했어요" onRetry={random.retry} /> : null}
            {random.status === "ready" ? <PeopleGrid people={random.data.people || []} /> : null}
          </>
        )}
      </section>
      <WearersSheet pick={pick} gender={query.gender} onClose={() => setPick(null)} />
    </div>
  );
}
