// 오늘의 강화 소식: 날짜별 기록에서 고른 장비 변화(GET /api/v2/news — 스타포스 상승·최대 별 달성, 같은 장비의 옵션 대박,
// 새 장비). 첫 화면 카드와 /news 화면이 같이 쓴다.
import "../styles/news.css";
import { useEffect, useState } from "preact/hooks";
import { getJson, toApiError } from "../lib/api.js";
import { gradeInfo } from "../lib/character.js";
import { formatComma, formatDecimal } from "../lib/format.js";
import { urls } from "../lib/game.js";
import { Card } from "./Card.jsx";
import { WorldIcon } from "./GameIcons.jsx";
import { Icon } from "./Icon.jsx";
import { SkeletonList } from "./Skeleton.jsx";
import { EmptyState, ErrorState } from "./States.jsx";

export const NEWS_TYPES = [
  { id: "all", label: "전체" },
  { id: "star", label: "스타포스" },
  { id: "option", label: "옵션 대박" },
  { id: "new", label: "새 장비" }
];

/**
 * @param {"" | "yesterday"} day
 */
export function useNews(day = "") {
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", data?: any, error?: any }} */ ({ status: "loading" }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    getJson(`/api/v2/news${day ? `?day=${day}` : ""}`).then(
      ({ response, body }) =>
        alive && setState(response.ok && body?.ok ? { status: "ready", data: body } : { status: "error", error: toApiError(response, body, "소식을 불러오지 못했어요.") }),
      (error) => alive && setState({ status: "error", error })
    );
    return () => {
      alive = false;
    };
  }, [day, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

/** 꼬리표: ★35 달성 · ★9 → ★10 · 템환산 +27.3 · 새 장비 ★35 */
function tagOf(event) {
  if (event.type === "star") return event.reached ? `★${event.toStar} 달성` : `★${event.fromStar} → ★${event.toStar}`;
  if (event.type === "option") return `템환산 +${formatDecimal(event.gain, 1)}`;
  return event.toStar ? `새 장비 ★${event.toStar}` : "새 장비";
}

/** @param {{ event: any, index?: number }} props */
export function NewsRow({ event, index = 0 }) {
  const grade = gradeInfo(event.grade);
  return (
    <a class={`unews-row is-${event.type}${event.reached ? " is-reached" : ""}`} href={urls.character(event.world, event.name)} style={{ "--stagger": index }}>
      <span class={`unews-row__icon${grade ? ` is-${grade.key}` : ""}`}>
        {event.icon ? <img src={event.icon} alt="" width={40} height={40} loading="lazy" decoding="async" /> : <Icon name="medal" size={22} />}
      </span>
      <span class="unews-row__text">
        <strong class="unews-row__item">{event.item}</strong>
        <span class="unews-row__who">
          <WorldIcon world={event.world} size={14} />
          <span class="unews-row__name">{event.name}</span>
          {event.className ? <span class="unews-row__class">{event.className}</span> : null}
        </span>
      </span>
      <span class={`unews-row__tag is-${event.type}${event.reached ? " is-reached" : ""}`}>{tagOf(event)}</span>
    </a>
  );
}

/** 오늘 몇 명이 무엇을 했는지 한 줄 */
export function NewsCounts({ counts }) {
  return (
    <ul class="unews-counts" aria-label="오늘의 강화 수">
      <li>
        <strong class="num">{formatComma(counts.characters)}</strong>명
      </li>
      <li>
        최대 별 <strong class="num">{formatComma(counts.reached)}</strong>
      </li>
      <li>
        스타포스 <strong class="num">{formatComma(counts.star)}</strong>
      </li>
      <li>
        옵션 대박 <strong class="num">{formatComma(counts.option)}</strong>
      </li>
      <li>
        새 장비 <strong class="num">{formatComma(counts.new)}</strong>
      </li>
    </ul>
  );
}

/** 큰 소식 여섯: 종류마다 위에서 둘씩(모자라면 다른 종류로 채운다) */
export function highlights(events, count = 6) {
  const picks = [];
  for (const type of ["star", "option", "new"]) picks.push(...events.filter((event) => event.type === type).slice(0, 2));
  for (const event of events) {
    if (picks.length >= count) break;
    if (!picks.includes(event)) picks.push(event);
  }
  return picks.slice(0, count);
}

/** 첫 화면 카드 */
export function UpgradeNewsCard() {
  const news = useNews();
  const data = news.data;
  const events = data ? highlights(data.events || []) : [];
  return (
    <Card
      class="unews-card"
      title={data?.date && data.date !== todayKst() ? "어제의 강화 소식" : "오늘의 강화 소식"}
      icon="sparkle"
      tone="gold"
      action={
        <a class="text-link" href={urls.news}>
          전체 보기
          <Icon name="chevronRight" size={16} />
        </a>
      }
    >
      {news.status === "loading" ? <SkeletonList rows={3} /> : null}
      {news.status === "error" ? <ErrorState compact title="소식을 불러오지 못했어요" onRetry={news.retry} /> : null}
      {news.status === "ready" && !events.length ? <EmptyState compact title="아직 모인 소식이 없어요" /> : null}
      {events.length ? (
        <>
          <NewsCounts counts={data.counts} />
          <div class="unews-grid stagger-in">
            {events.map((event, index) => (
              <NewsRow key={`${event.world}-${event.name}-${event.item}-${event.type}`} event={event} index={index} />
            ))}
          </div>
        </>
      ) : null}
    </Card>
  );
}

/** 서울 날짜 "YYYY-MM-DD" */
export function todayKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
