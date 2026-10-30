// 이벤트 달력(/events): 넥슨 이벤트 공지의 기간을 날짜 축 위 막대로(오늘 선), 곧 끝나요 · 진행 중 · 곧 시작 · 끝난 이벤트.
// 줄을 누르면 넥슨 공식 공지. GET /api/v2/events.
import "../styles/events.css";
import { useEffect, useState } from "preact/hooks";
import { Icon } from "../components/Icon.jsx";
import { Aurora, SplitText } from "../components/Motion.jsx";
import { SkeletonList } from "../components/Skeleton.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { getJson } from "../lib/api.js";
import { dayLabel, timeline } from "../lib/eventCalendar.mjs";
import { formatComma } from "../lib/format.js";

const URGENT_DAYS = 3;
/** "2026-11-11" → "11.11" */
const monthDay = (date) => date.slice(5).replace("-", ".");

/** @param {{ event: any, axis: ReturnType<typeof timeline> }} props */
function EventRow({ event, axis }) {
  const urgent = event.status === "ongoing" && event.daysLeft <= URGENT_DAYS;
  const bar = axis.bar(event);
  return (
    <li class={`ev-row is-${event.status}${urgent ? " is-urgent" : ""}`}>
      <a class="ev-row__name" href={event.url} target="_blank" rel="noopener noreferrer">
        <span>{event.name}</span>
        <Icon name="external" size={14} />
      </a>
      <span class="ev-row__period num">
        {monthDay(event.start)}
        {event.end !== event.start ? ` ~ ${monthDay(event.end)}` : ""}
      </span>
      <span class="ev-row__day num">{dayLabel(event)}</span>
      <span class="ev-row__track" aria-hidden="true">
        <span class="ev-row__bar" style={{ left: `${bar.left}%`, width: `${bar.width}%` }} />
        <span class="ev-row__today" style={{ left: `${axis.todayAt}%` }} />
      </span>
    </li>
  );
}

/** @param {{ title: string, events: any[], axis: ReturnType<typeof timeline> }} props */
function EventGroup({ title, events, axis }) {
  if (!events.length) return null;
  return (
    <section class="ev-group">
      <h2 class="ev-group__title">
        {title} <span class="num">{formatComma(events.length)}</span>
      </h2>
      <ol class="ev-list">
        {events.map((event) => (
          <EventRow key={event.url} event={event} axis={axis} />
        ))}
      </ol>
    </section>
  );
}

export function Events() {
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", data?: any }} */ ({ status: "loading" }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    getJson("/api/v2/events").then(
      ({ response, body }) => alive && setState(response.ok && body?.ok ? { status: "ready", data: body } : { status: "error" }),
      () => alive && setState({ status: "error" })
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const events = state.data?.events || [];
  const today = state.data?.today || "";
  const axis = today ? timeline(events, today) : null;
  const ongoing = events.filter((event) => event.status === "ongoing");
  const urgent = ongoing.filter((event) => event.daysLeft <= URGENT_DAYS);
  const upcoming = events.filter((event) => event.status === "upcoming");
  const ended = events.filter((event) => event.status === "ended");

  return (
    <div class="ev-page">
      <header class="page-head page-head--rank tone-peach">
        <Aurora tone="dusk" />
        <span class="page-head__icon" aria-hidden="true">
          <Icon name="clock" size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText text="이벤트 달력" />
        </h1>
      </header>

      {state.status === "loading" ? <SkeletonList rows={8} /> : null}
      {state.status === "error" ? <ErrorState title="이벤트를 불러오지 못했어요" onRetry={() => setAttempt((n) => n + 1)} /> : null}
      {state.status === "ready" && !events.length ? <EmptyState title="기간을 알 수 있는 이벤트가 없어요" /> : null}
      {state.status === "ready" && axis && events.length ? (
        <>
          <ul class="ev-summary">
            <li>
              진행 중 <strong class="num">{formatComma(ongoing.length)}</strong>
            </li>
            {urgent.length ? (
              <li class="is-urgent">
                {URGENT_DAYS}일 안에 끝 <strong class="num">{formatComma(urgent.length)}</strong>
              </li>
            ) : null}
            {upcoming.length ? (
              <li>
                곧 시작 <strong class="num">{formatComma(upcoming.length)}</strong>
              </li>
            ) : null}
          </ul>
          <section class="card ev-card">
            <div class="ev-axis" aria-hidden="true">
              {axis.ticks
                .map((tick, index) => ({ ...tick, minor: index % 2 === 1 }))
                .filter((tick) => Math.abs(tick.at - axis.todayAt) > 8)
                .map((tick) => (
                  <span key={tick.date} class={`ev-axis__tick num${tick.minor ? " is-minor" : ""}`} style={{ left: `${tick.at}%` }}>
                    {monthDay(tick.date)}
                  </span>
                ))}
              <span class="ev-axis__today" style={{ left: `${axis.todayAt}%` }}>
                오늘
              </span>
            </div>
            <EventGroup title="진행 중" events={ongoing} axis={axis} />
            <EventGroup title="곧 시작" events={upcoming} axis={axis} />
            {ended.length ? (
              <details class="ev-ended">
                <summary>
                  끝난 이벤트 <span class="num">{formatComma(ended.length)}</span>
                </summary>
                <EventGroup title="끝남" events={ended} axis={axis} />
              </details>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
