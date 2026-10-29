// 명예의 전당(/hall): 사이트가 모은 캐릭터·장비 중 기록 — 전투력, 템환산, 무기 잠재·에디 대미지, 무기·장신구 추옵,
// 최종 대미지 추옵 한 줄, 무기 템환산. 기록마다 위 10명(캐릭터마다 한 줄, 같은 값은 같은 순위).
import "../styles/hall.css";
import { useEffect, useState } from "preact/hooks";
import { CollectedNote } from "../components/CollectedNote.jsx";
import { Icon } from "../components/Icon.jsx";
import { Aurora, Reveal, SplitText } from "../components/Motion.jsx";
import { Skeleton } from "../components/Skeleton.jsx";
import { ErrorState } from "../components/States.jsx";
import { getJson, toApiError } from "../lib/api.js";
import { formatDecimal, formatKoreanUnits } from "../lib/format.js";
import { urls } from "../lib/game.js";

/** @param {number} value @param {string} unit */
function valueText(value, unit) {
  if (!unit) return formatKoreanUnits(value, { maxGroups: 2 });
  return `${formatDecimal(value, value % 1 ? (unit === "%" ? 2 : 1) : 0)}${unit}`;
}

/** @param {any} row */
const detailText = (row) => [row.itemName ? `${row.itemName}${row.starforce ? ` ★${row.starforce}` : ""}` : "", row.text || ""].filter(Boolean).join(" · ");

/** @param {{ record: { key: string, title: string, unit: string, rows: any[], leaders: number }, delay: number }} props */
function RecordCard({ record, delay }) {
  const [first, ...rest] = record.rows;
  if (!first) return null;
  const ties = record.leaders || 1;
  return (
    <Reveal class="card hall-card" delay={delay}>
      <h2 class="hall-card__title">{record.title}</h2>
      <a class="hall-champ" href={urls.character(first.world, first.name)}>
        <span class="hall-champ__crown" aria-hidden="true">
          <Icon name="crown" size={22} />
        </span>
        <span class="hall-champ__who">
          <strong>{first.name}</strong>
          <span>
            {first.world}
            {first.className ? ` · ${first.className}` : ""}
            {ties > 1 ? ` · 공동 1위 ${ties}명` : ""}
          </span>
        </span>
        <strong class="hall-champ__value display num">{valueText(first.value, record.unit)}</strong>
        {detailText(first) ? <span class="hall-champ__detail">{detailText(first)}</span> : null}
      </a>
      <ol class="hall-list">
        {rest.map((row, index) => (
          <li key={`${row.world}-${row.name}-${index}`}>
            <span class="hall-list__rank num">{row.rank}</span>
            <a class="hall-list__name" href={urls.character(row.world, row.name)}>
              {row.name}
              <span>
                {row.world}
                {row.className ? ` · ${row.className}` : ""}
              </span>
            </a>
            <strong class="hall-list__value num">{valueText(row.value, record.unit)}</strong>
            {detailText(row) ? <span class="hall-list__detail">{detailText(row)}</span> : null}
          </li>
        ))}
      </ol>
    </Reveal>
  );
}

export function HallOfFame() {
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", data?: any, error?: any }} */ ({ status: "loading" }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    getJson("/api/v2/stats/hall-of-fame").then(
      ({ response, body }) =>
        alive &&
        setState(
          response.ok && body?.ok ? { status: "ready", data: body } : { status: "error", error: toApiError(response, body, "기록을 불러오지 못했어요.") }
        ),
      (error) => alive && setState({ status: "error", error })
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const records = (state.data?.records || []).filter((record) => record.rows.length);

  return (
    <div class="hall">
      <header class="page-head page-head--rank tone-sky">
        <Aurora tone="dusk" />
        <span class="page-head__icon" aria-hidden="true">
          <Icon name="crown" size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText text="명예의 전당" />
        </h1>
      </header>
      <CollectedNote />
      {state.status === "loading" ? <Skeleton height={640} radius={20} /> : null}
      {state.status === "error" ? (
        <ErrorState title="기록을 불러오지 못했어요" description={state.error?.message} onRetry={() => setAttempt((n) => n + 1)} />
      ) : null}
      {state.status === "ready" ? (
        <div class="hall-grid">
          {records.map((record, index) => (
            <RecordCard key={record.key} record={record} delay={(index % 2) * 60} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
