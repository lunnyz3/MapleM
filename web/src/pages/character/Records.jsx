// 기록 탭: 캐릭터 정보(생성일·최근 접속) · 최고 기록 · 성장 일지(날짜별 전투력·템환산과 바뀐 장비).
// 최고 기록과 일지는 사이트 조회·매일 수집 때마다 서버가 남긴 값(/api/v2/character-record).
import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { Segmented } from "../../components/Tabs.jsx";
import { getJson } from "../../lib/api.js";
import { formatComma, formatDateDot, formatDateTimeKst, formatDecimal, formatKoreanUnits, formatRelativeTime } from "../../lib/format.js";
import { dayNumber, shortDate, smoothPath, useWidth } from "./Sections.jsx";
import { itemScoreDiff, setScoreText, setScorePoints } from "../../lib/itemScore.js";

/** @param {number} value */
const power = (value) => formatKoreanUnits(value, { maxGroups: value >= 1e8 ? 2 : 1 });
// 템환산 합계는 한 벌 최대치 기준 100점(web/src/lib/itemScore.js)
const score = (value) => setScoreText(value);
const percent = (value) => `${formatDecimal(value, 1)}%`;

const BEST = [
  { key: "combatPower", label: "최고 전투력", format: power },
  { key: "itemScore", label: "최고 템환산", format: score },
  { key: "itemScoreWithoutEmblem", label: "템환산 (문장 제외)", format: (value) => setScoreText(value, false) },
  { key: "maxDamage", label: "최대 대미지", format: power },
  { key: "potential", label: "잠재 합", format: percent },
  { key: "additionalPotential", label: "에디 합", format: percent }
];

const METRICS = [
  { value: "combatPower", label: "전투력", format: power, read: (value) => value },
  { value: "itemScore", label: "템환산", format: (value) => formatDecimal(value, 1), read: (value) => setScorePoints(value) }
];

/** 눈금 글자: 1.85억 · 3,200만 · 1,226 */
function axisLabel(value) {
  if (value >= 1e8) return `${formatDecimal(value / 1e8, 2)}억`;
  if (value >= 1e4) return `${formatComma(Math.round(value / 1e4))}만`;
  return value >= 1000 ? formatComma(Math.round(value)) : formatDecimal(value, 1);
}

const PERIODS = [
  { value: "30", label: "30일" },
  { value: "90", label: "90일" },
  { value: "all", label: "전체" }
];

/** @param {string} ocid */
function useRecord(ocid) {
  const [record, setRecord] = useState(/** @type {any} */ (undefined));
  useEffect(() => {
    if (!ocid) return undefined;
    let alive = true;
    getJson(`/api/v2/character-record?${new URLSearchParams({ ocid })}`).then(
      ({ response, body }) => alive && setRecord(response.ok && body?.ok ? body.record : null),
      () => alive && setRecord(null)
    );
    return () => {
      alive = false;
    };
  }, [ocid]);
  return record;
}

/** ISO → "2026-10-29"(서울 날짜) */
const kstDay = (iso) => formatDateTimeKst(iso).slice(0, 10).replace(/\./g, "-");

/** 생성일·함께한 날·최근 접속. 넥슨이 주는 값이 없으면 그리지 않는다. */
function CharacterFacts({ profile }) {
  const created = profile?.createdAt ? new Date(profile.createdAt) : null;
  const login = profile?.lastLoginAt ? Date.parse(profile.lastLoginAt) : Number.NaN;
  const logout = profile?.lastLogoutAt ? Date.parse(profile.lastLogoutAt) : Number.NaN;
  const online = Number.isFinite(login) && (!Number.isFinite(logout) || login > logout);
  const lastSeen = Number.isFinite(logout) ? logout : login;
  if (!created && !Number.isFinite(lastSeen)) return null;
  const days = created ? Math.floor((Date.now() - created.getTime()) / 86400000) + 1 : 0;
  return (
    <ul class="rec-facts">
      {created ? (
        <li>
          <span class="rec-facts__label">생성일</span>
          <strong class="num">{formatDateDot(kstDay(profile.createdAt))}</strong>
          <span class="rec-facts__sub num">D+{formatComma(days)}</span>
        </li>
      ) : null}
      {Number.isFinite(lastSeen) ? (
        <li>
          <span class="rec-facts__label">최근 접속</span>
          {online ? (
            <strong class="rec-facts__online">
              <span class="rec-facts__dot" aria-hidden="true" />
              접속 중
            </strong>
          ) : (
            <strong title={formatDateTimeKst(lastSeen)}>{formatRelativeTime(lastSeen)}</strong>
          )}
        </li>
      ) : null}
    </ul>
  );
}

/** @param {{ best: Record<string, { value: number, at: string }> }} props */
function BestRecords({ best }) {
  const tiles = BEST.filter((item) => Number(best?.[item.key]?.value) > 0);
  if (!tiles.length) return null;
  return (
    <section class="sect">
      <h3 class="sub-title">최고 기록</h3>
      <ul class="rec-best">
        {tiles.map((item) => (
          <li key={item.key}>
            <span class="rec-best__label">{item.label}</span>
            <strong class="rec-best__value display num" title={formatComma(best[item.key].value)}>
              {item.format(best[item.key].value)}
            </strong>
            <span class="rec-best__date num">{formatDateDot(kstDay(best[item.key].at))}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 한 지표의 날짜별 선 그래프(한 계열이라 범례 없음, 제목이 이름). 점을 누르거나 올리면 날짜·값.
 * @param {{ rows: any[], metric: { value: string, label: string, format: (n: number) => string } }} props
 */
function JournalChart({ rows, metric }) {
  const boxRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const width = Math.max(280, useWidth(boxRef));
  const [active, setActive] = useState(/** @type {number | null} */ (null));
  const narrow = width < 520;
  const height = narrow ? 200 : 240;
  const pad = { l: narrow ? 50 : 60, r: narrow ? 12 : 20, t: 16, b: 28 };
  const points = rows
    .filter((row) => Number(row[metric.value]) > 0)
    .map((row) => ({
      date: row.date,
      day: dayNumber(row.date),
      y: metric.read(Number(row[metric.value]))
    }));
  const gradientId = `journal-${useId()}`;

  if (points.length < 2) {
    return <p class="rec-journal__empty">그래프는 이틀 이상 기록이 쌓이면 보여요.</p>;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const span = Math.max(1, last.day - first.day);
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const padY = Math.max((max - min) * 0.15, max * 0.002, 1);
  const yMin = min - padY;
  const yMax = max + padY;
  const xOf = (day) => pad.l + ((day - first.day) / span) * (width - pad.l - pad.r);
  const yOf = (y) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * (height - pad.t - pad.b);
  const ticks = [yMin + (yMax - yMin) * 0.15, (yMin + yMax) / 2, yMax - (yMax - yMin) * 0.15];
  const line = smoothPath(points.map((p) => ({ x: xOf(p.day), y: yOf(p.y) })));

  /** @param {PointerEvent} event */
  const pick = (event) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = event.clientX - box.left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(xOf(p.day) - x) < Math.abs(xOf(points[best].day) - x)) best = i;
    });
    setActive(best);
  };
  const cur = active !== null ? points[active] : null;
  const prev = active ? points[active - 1] : null;
  const tipX = cur ? xOf(cur.day) : 0;
  const tipLeft = cur ? (tipX + 16 + 170 <= width ? tipX + 16 : Math.max(0, tipX - 186)) : 0;
  const tipTop = cur ? Math.max(0, Math.min(height - 80, yOf(cur.y) - 40)) : 0;

  return (
    <figure class="trend rec-journal__chart">
      <div
        ref={boxRef}
        class="trend__box"
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={(event) => event.pointerType === "mouse" && setActive(null)}
      >
        <svg
          class="trend__svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${metric.label} 변화: ${first.date} ${metric.format(first.y)}에서 ${last.date} ${metric.format(last.y)}`}
        >
          <defs>
            <linearGradient id={`${gradientId}-line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" class="trend__stop-l1" />
              <stop offset="1" class="trend__stop-l2" />
            </linearGradient>
          </defs>
          {ticks.map((y) => (
            <g key={y} class="trend__tick">
              <line x1={pad.l} x2={width - pad.r} y1={yOf(y)} y2={yOf(y)} class="trend__grid" />
              <text x={pad.l - 8} y={yOf(y)} class="trend__axis" text-anchor="end" dominant-baseline="middle">
                {axisLabel(y)}
              </text>
            </g>
          ))}
          <line x1={pad.l} x2={width - pad.r} y1={height - pad.b} y2={height - pad.b} class="trend__base" />
          <path class="trend__line rec-journal__line" d={line} pathLength={1} stroke={`url(#${gradientId}-line)`} />
          {cur ? <line class="trend__guide" x1={tipX} x2={tipX} y1={pad.t} y2={height - pad.b} /> : null}
          {points.map((p, i) => (
            <circle
              key={p.date}
              cx={xOf(p.day)}
              cy={yOf(p.y)}
              r={active === i ? 6.5 : i === points.length - 1 ? 4.5 : 3}
              class={`trend__dot${active === i ? " is-active" : ""}${i === points.length - 1 ? " is-last" : ""}`}
              style={{ "--i": i }}
            />
          ))}
          <text x={xOf(first.day)} y={height - 8} class="trend__axis" text-anchor="start">
            {shortDate(first.date)}
          </text>
          <text x={xOf(last.day)} y={height - 8} class="trend__axis" text-anchor="end">
            {shortDate(last.date)}
          </text>
        </svg>
        {cur ? (
          <div class="trend__tip" style={{ transform: `translate(${tipLeft}px, ${tipTop}px)` }} aria-hidden="true">
            <p class="trend__tip-date">{formatDateDot(cur.date)}</p>
            <p class="trend__tip-level num">
              <strong>{metric.format(cur.y)}</strong>
            </p>
            {prev ? (
              <p class={`trend__tip-gain num${cur.y > prev.y ? " is-up" : ""}`}>
                이전 기록 대비 {cur.y >= prev.y ? "+" : "-"}
                {metric.format(Math.abs(cur.y - prev.y))}
              </p>
            ) : (
              <p class="trend__tip-gain">첫 기록</p>
            )}
          </div>
        ) : null}
      </div>
      <figcaption class="sr-only">
        <table>
          <caption>날짜별 {metric.label}</caption>
          <thead>
            <tr>
              <th scope="col">날짜</th>
              <th scope="col">{metric.label}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <td>{p.date}</td>
                <td>{metric.format(p.y)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

/** 바뀐 장비 한 칸: "무기 아케인셰이드 완드 ★35 → ★36 (+30.0)" */
function GearChange({ change }) {
  const { from, to } = change;
  const star = (piece) => (piece?.starforce ? ` ★${piece.starforce}` : "");
  const diff = (Number(to?.score) || 0) - (Number(from?.score) || 0);
  let text;
  if (!from) text = `${to.name}${star(to)} 장착`;
  else if (!to) text = `${from.name}${star(from)} 해제`;
  else if (from.name !== to.name) text = `${from.name}${star(from)} → ${to.name}${star(to)}`;
  else if (from.starforce !== to.starforce) text = `${to.name}${star(from)} → ★${to.starforce}`;
  else text = `${to.name} 옵션 변경`;
  return (
    <li>
      <span class="badge">{change.slot}</span>
      <span class="rec-change__text">{text}</span>
      {Math.abs(diff) >= 0.05 ? (
        <strong class={`num rec-change__diff${diff > 0 ? " is-up" : " is-down"}`}>
          {diff > 0 ? "+" : "-"}
          {formatDecimal(itemScoreDiff(change.slot, diff), 1)}
        </strong>
      ) : null}
    </li>
  );
}

/** @param {{ journal: any[], since: string | null }} props */
function GrowthJournal({ journal, since }) {
  const [metricKey, setMetricKey] = useState("combatPower");
  const [period, setPeriod] = useState("90");
  const [expanded, setExpanded] = useState(false);
  const metric = METRICS.find((item) => item.value === metricKey) || METRICS[0];
  const rows = useMemo(() => {
    if (period === "all" || !journal.length) return journal;
    const lastDay = dayNumber(journal[journal.length - 1].date);
    return journal.filter((row) => dayNumber(row.date) > lastDay - Number(period));
  }, [journal, period]);
  // 최근 날짜부터, 바로 앞 기록과의 차이를 붙여서.
  const days = useMemo(() => journal.map((row, index) => ({ row, prev: journal[index - 1] || null })).reverse(), [journal]);
  const shown = expanded ? days : days.slice(0, 7);
  if (!journal.length) return null;

  return (
    <section class="sect rec-journal">
      <div class="rec-journal__head">
        <h3 class="sub-title">
          성장 일지
          {since ? <span class="sub-title__note">{formatDateDot(since)}부터</span> : null}
        </h3>
        <div class="rec-journal__controls">
          <Segmented name="journal-metric" legend="그래프 지표" value={metricKey} onChange={setMetricKey} options={METRICS} />
          <Segmented name="journal-period" legend="기간" value={period} onChange={setPeriod} options={PERIODS} />
        </div>
      </div>
      <JournalChart rows={rows} metric={metric} />
      <ol class="rec-days">
        {shown.map(({ row, prev }) => {
          const cpDiff = row.combatPower && prev?.combatPower ? row.combatPower - prev.combatPower : 0;
          const scoreDiff = row.itemScore && prev?.itemScore ? row.itemScore - prev.itemScore : 0;
          return (
            <li key={row.date} class="rec-day">
              <div class="rec-day__head">
                <span class="rec-day__date num">{formatDateDot(row.date)}</span>
                {row.level ? <span class="rec-day__level num">Lv.{row.level}</span> : null}
                <span class="rec-day__metrics">
                  {row.combatPower ? (
                    <span class="rec-day__metric num">
                      전투력 {power(row.combatPower)}
                      {Math.abs(cpDiff) >= 1 ? (
                        <em class={cpDiff > 0 ? "is-up" : "is-down"}>
                          {cpDiff > 0 ? "+" : "-"}
                          {power(Math.abs(cpDiff))}
                        </em>
                      ) : null}
                    </span>
                  ) : null}
                  {row.itemScore ? (
                    <span class="rec-day__metric num">
                      템환산 {score(row.itemScore)}
                      {Math.abs(scoreDiff) >= 0.05 ? (
                        <em class={scoreDiff > 0 ? "is-up" : "is-down"}>
                          {scoreDiff > 0 ? "+" : "-"}
                          {score(Math.abs(scoreDiff))}
                        </em>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </div>
              {row.changes?.length ? (
                <ul class="rec-change">
                  {row.changes.map((change) => (
                    <GearChange key={change.slot} change={change} />
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
      {days.length > 7 ? (
        <button type="button" class="btn btn--ghost btn--sm rec-days__more" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          {expanded ? "접기" : `${formatComma(days.length - 7)}일 더 보기`}
          <Icon name="chevronDown" size={16} class={expanded ? "is-flipped" : ""} />
        </button>
      ) : null}
      <p class="rec-journal__note">
        사이트에서 조회하거나 매일 새벽 전투력 랭킹을 모을 때마다 그날 값이 남아요. 바뀐 장비는 템환산이 가장 높은 프리셋 기준이에요.
      </p>
    </section>
  );
}

/** @param {{ ocid: string, profile: any }} props */
export function RecordsSection({ ocid, profile }) {
  const record = useRecord(ocid);
  return (
    <>
      <CharacterFacts profile={profile} />
      {record ? <BestRecords best={record.best} /> : null}
      {record ? <GrowthJournal journal={Array.isArray(record.journal) ? record.journal : []} since={record.since} /> : null}
    </>
  );
}
