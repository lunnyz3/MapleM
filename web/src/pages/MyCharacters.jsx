// 내 캐릭터 한눈에(/my): 즐겨찾기한 캐릭터(없으면 최근 검색)를 한 표로 — 레벨·전투력·템환산·잠재·에디와 최근 7일 변화,
// 전투력 합. 모은 적 없는 캐릭터는 아래에 따로. 엑셀(CSV)로 받기. POST /api/v2/records/brief(최대 12명).
// 즐겨찾기 알림(웹 푸시) 켜고 끄기: web/src/lib/push.js.
import "../styles/my.css";
import { useEffect, useState } from "preact/hooks";
import { Avatar } from "../components/Avatar.jsx";
import { WorldIcon } from "../components/GameIcons.jsx";
import { Icon } from "../components/Icon.jsx";
import { Aurora, SplitText } from "../components/Motion.jsx";
import { SkeletonList } from "../components/Skeleton.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { postJson } from "../lib/api.js";
import { downloadCsv } from "../lib/csv.mjs";
import { formatComma, formatDecimal, formatKoreanUnits, kstToday } from "../lib/format.js";
import { urls } from "../lib/game.js";
import { setScoreText } from "../lib/itemScore.js";
import { useSaved } from "../lib/storage.js";
import { disablePush, enablePush, currentSubscription, eventsWanted, pushSupported, setEventsWanted, syncPush } from "../lib/push.js";
import { toast } from "../components/Toast.jsx";

const LIMIT = 12;
const power = (value) => (value > 0 ? formatKoreanUnits(value, { maxGroups: value >= 1e8 ? 2 : 1 }) : "-");

/** 최근 7일 변화 한 줄 */
function Change({ brief }) {
  if (!brief) return <span class="my-change">-</span>;
  const parts = [];
  const cp = brief.combatPower;
  if (cp && cp.from !== cp.to) {
    const up = cp.to > cp.from;
    parts.push(
      <span key="cp" class={up ? "is-up" : "is-down"}>
        {up ? "▲" : "▼"}
        {formatDecimal(Math.abs(cp.to / cp.from - 1) * 100, 1)}%
      </span>
    );
  }
  if (brief.level && brief.level.to > brief.level.from) parts.push(<span key="lv">Lv +{brief.level.to - brief.level.from}</span>);
  if (brief.highlights?.[0]) parts.push(<span key="news" class="is-news">{brief.highlights[0]}</span>);
  return <span class="my-change num">{parts.length ? parts : "변화 없음"}</span>;
}

const PUSH_TOPICS = ["전투력 상승", "★ 달성·새 장비", "길드 들고 남", "이벤트 종료"];

/** 즐겨찾기 알림 켜고 끄기 @param {{ favorites: any[] }} props */
function PushCard({ favorites }) {
  const [state, setState] = useState(/** @type {"checking" | "unsupported" | "denied" | "off" | "on" | "busy"} */ ("checking"));
  const [events, setEvents] = useState(eventsWanted);
  const characters = favorites.filter((entry) => entry.kind === "character").length;
  const guilds = favorites.filter((entry) => entry.kind === "guild").length;
  useEffect(() => {
    if (!pushSupported()) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    currentSubscription().then(
      (subscription) => setState(subscription && Notification.permission === "granted" ? "on" : "off"),
      () => setState("off")
    );
  }, []);

  const turnOn = async () => {
    setState("busy");
    try {
      await enablePush(favorites);
      setState("on");
      toast("알림을 켰어요", "success");
    } catch (error) {
      setState(error?.message === "denied" ? "denied" : "off");
      if (error?.message !== "denied") toast("알림을 켜지 못했어요", "error");
    }
  };
  const turnOff = async () => {
    setState("busy");
    await disablePush();
    setState("off");
  };
  const toggleEvents = async () => {
    setEvents(!events);
    setEventsWanted(!events);
    await syncPush(favorites).catch(() => {});
  };

  return (
    <section class="card my-push" aria-label="즐겨찾기 알림">
      <div class="my-push__head">
        <span class="my-push__icon" aria-hidden="true">
          <Icon name="chat" size={20} />
        </span>
        <div class="my-push__text">
          <strong>즐겨찾기 알림</strong>
          <span>
            {state === "on" ? `켜짐 · 캐릭터 ${characters}명 · 길드 ${guilds}개` : null}
            {state === "off" || state === "busy" || state === "checking" ? PUSH_TOPICS.join(" · ") : null}
            {state === "denied" ? "브라우저 설정에서 이 사이트 알림을 허용해 주세요" : null}
            {state === "unsupported" ? "이 브라우저는 알림을 받을 수 없어요(아이폰은 사파리에서 홈 화면에 추가)" : null}
          </span>
        </div>
        {state === "on" ? (
          <button type="button" class="btn btn--secondary btn--sm" onClick={turnOff}>
            끄기
          </button>
        ) : state === "off" || state === "busy" ? (
          <button type="button" class="btn btn--primary btn--sm" onClick={turnOn} disabled={state === "busy"}>
            {state === "busy" ? "켜는 중" : "알림 켜기"}
          </button>
        ) : null}
      </div>
      {state === "on" ? (
        <label class="my-push__option">
          <input type="checkbox" checked={events} onChange={toggleEvents} />
          내일 끝나는 이벤트도 알려 주기
        </label>
      ) : null}
    </section>
  );
}

export function MyCharacters() {
  const { favorites, recent } = useSaved();
  const fromFavorites = favorites.some((entry) => entry.kind === "character");
  const list = (fromFavorites ? favorites : recent).filter((entry) => entry.kind === "character").slice(0, LIMIT);
  const key = list.map((entry) => `${entry.world}/${entry.name}`).join("|");
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", rows: any[] }} */ ({ status: "loading", rows: [] }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!list.length) return undefined;
    let alive = true;
    setState({ status: "loading", rows: [] });
    postJson("/api/v2/records/brief", { characters: list.map(({ world, name }) => ({ world, name })) }).then(
      ({ response, body }) => alive && setState(response.ok && body?.ok ? { status: "ready", rows: body.briefs || [] } : { status: "error", rows: [] }),
      () => alive && setState({ status: "error", rows: [] })
    );
    return () => {
      alive = false;
    };
  }, [key, attempt]);

  const rows = [...state.rows].sort((a, b) => b.power - a.power || b.itemScore - a.itemScore);
  const found = new Set(rows.map((row) => `${row.world}/${row.name}`));
  const missing = list.filter((entry) => !found.has(`${entry.world}/${entry.name}`));
  const total = rows.reduce((sum, row) => sum + (row.power || 0), 0);

  const exportCsv = () =>
    downloadCsv(`내캐릭터-${kstToday()}.csv`, [
      ["월드", "이름", "직업", "레벨", "전투력", "템환산", "잠재", "에디"],
      ...rows.map((row) => [row.world, row.name, row.className, row.level, row.power || "", setScoreText(row.itemScore), row.potential, row.additionalPotential])
    ]);

  return (
    <div class="my">
      <header class="page-head page-head--rank tone-peach">
        <Aurora tone="dusk" />
        <span class="page-head__icon" aria-hidden="true">
          <Icon name="heart" size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText text="내 캐릭터 한눈에" />
        </h1>
      </header>

      <PushCard favorites={favorites} />

      {!list.length ? (
        <EmptyState
          title="즐겨찾기한 캐릭터가 없어요"
          description="캐릭터 화면에서 ♥를 누르면 여기에 모여요."
          action={
            <a class="btn btn--primary" href="/#search">
              <Icon name="search" size={18} />
              캐릭터 검색하기
            </a>
          }
        />
      ) : (
        <section class="card my-panel" aria-busy={state.status === "loading"}>
          <div class="my-panel__head">
            <ul class="my-summary">
              <li>
                {fromFavorites ? "즐겨찾기" : "최근 검색"} <strong class="num">{formatComma(list.length)}</strong>명
              </li>
              {total ? (
                <li>
                  전투력 합 <strong class="num">{power(total)}</strong>
                </li>
              ) : null}
              {rows[0]?.power ? (
                <li>
                  가장 강한 캐릭터 <strong>{rows[0].name}</strong>
                </li>
              ) : null}
            </ul>
            {rows.length ? (
              <button type="button" class="btn btn--secondary btn--sm" onClick={exportCsv}>
                <Icon name="download" size={16} />
                엑셀로 받기
              </button>
            ) : null}
          </div>
          {state.status === "loading" ? <SkeletonList rows={Math.min(5, list.length)} /> : null}
          {state.status === "error" ? <ErrorState compact title="불러오지 못했어요" onRetry={() => setAttempt((n) => n + 1)} /> : null}
          {rows.length ? (
            <div class="my-table" role="table" aria-label="내 캐릭터">
              <div class="my-table__row my-table__head" role="row">
                <span role="columnheader">캐릭터</span>
                <span role="columnheader">레벨</span>
                <span role="columnheader">전투력</span>
                <span role="columnheader">템환산</span>
                <span role="columnheader">잠재 · 에디</span>
                <span role="columnheader">최근 7일</span>
              </div>
              {rows.map((row) => (
                <a key={`${row.world}/${row.name}`} class="my-table__row" role="row" href={urls.character(row.world, row.name)}>
                  <span class="my-table__who" role="cell">
                    <Avatar world={row.world} name={row.name} size={40} lazy />
                    <span>
                      <strong>{row.name}</strong>
                      <span class="my-table__meta">
                        <WorldIcon world={row.world} size={14} />
                        {row.className}
                      </span>
                    </span>
                  </span>
                  <span class="num" role="cell" data-label="레벨">
                    {row.level || "-"}
                  </span>
                  <span class="num my-table__power" role="cell" data-label="전투력">
                    {power(row.power)}
                  </span>
                  <span class="num" role="cell" data-label="템환산">
                    {setScoreText(row.itemScore)}
                  </span>
                  <span class="num" role="cell" data-label="잠재 · 에디">
                    {formatDecimal(row.potential, 1)}% · {formatDecimal(row.additionalPotential, 1)}%
                  </span>
                  <span role="cell" data-label="최근 7일">
                    <Change brief={row.brief} />
                  </span>
                </a>
              ))}
            </div>
          ) : null}
          {state.status === "ready" && missing.length ? (
            <div class="my-missing">
              <p>아직 모은 기록이 없는 캐릭터(한 번 열어 보면 생겨요)</p>
              <ul>
                {missing.map((entry) => (
                  <li key={`${entry.world}/${entry.name}`}>
                    <a href={urls.character(entry.world, entry.name)}>
                      <WorldIcon world={entry.world} size={14} />
                      {entry.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
