// 순위 컷 추이(공식 랭킹 화면 아래, 전투력·레벨 랭킹만): 전체 월드 1·100·1,000·10,000위 값의 최근 12주(7일 간격).
// 줄마다 작은 선 그래프(줄마다 따로 잰 눈금), 지금 값, 12주 전 대비. GET /api/v2/ranking-cuts?type=
import { useEffect, useState } from "preact/hooks";
import { Skeleton } from "../../components/Skeleton.jsx";
import { getJson } from "../../lib/api.js";
import { formatComma, formatDateDot, formatDecimal, formatKoreanUnits } from "../../lib/format.js";

/** @type {Map<string, Promise<any>>} */
const requests = new Map();

function loadCuts(typeId) {
  if (!requests.has(typeId)) {
    const request = getJson(`/api/v2/ranking-cuts?${new URLSearchParams({ type: typeId })}`).then(({ response, body }) => {
      if (!response.ok || !body?.ok) throw new Error("ranking-cuts");
      return body;
    });
    request.catch(() => requests.delete(typeId));
    requests.set(typeId, request);
  }
  return requests.get(typeId);
}

const W = 120;
const H = 32;

/** 한 줄 선 그래프(값이 없는 날은 건너뛴다) @param {{ points: Array<{ date: string, value: number | null }>, label: string }} props */
function Spark({ points, label }) {
  const known = points.map((point, index) => ({ ...point, index })).filter((point) => point.value > 0);
  if (known.length < 2) return <span class="rk-cuts__spark" aria-hidden="true" />;
  const values = known.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (index) => 3 + (index / Math.max(1, points.length - 1)) * (W - 6);
  const y = (value) => (max === min ? H / 2 : 3 + (1 - (value - min) / (max - min)) * (H - 6));
  const last = known[known.length - 1];
  return (
    <svg class="rk-cuts__spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <polyline points={known.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")} />
      <circle cx={x(last.index)} cy={y(last.value)} r="3" />
    </svg>
  );
}

/** @param {{ typeId: string }} props */
export function RankingCuts({ typeId }) {
  const [state, setState] = useState(/** @type {{ typeId: string, status: "loading" | "ready" | "error", data?: any }} */ ({ typeId, status: "loading" }));
  useEffect(() => {
    let alive = true;
    setState({ typeId, status: "loading" });
    loadCuts(typeId).then(
      (data) => alive && setState({ typeId, status: "ready", data }),
      () => alive && setState({ typeId, status: "error" })
    );
    return () => {
      alive = false;
    };
  }, [typeId]);

  const level = typeId === "level";
  const format = (/** @type {number} */ value) => (level ? `Lv.${value}` : formatKoreanUnits(value, { maxGroups: value >= 1e8 ? 2 : 1 }));
  if (state.status === "error") return null;
  const cuts = state.status === "ready" && state.typeId === typeId ? state.data.cuts || [] : [];
  const first = cuts[0]?.points?.find((point) => point.value > 0)?.date;

  return (
    <section class="card rk-cuts" aria-label="순위 컷 추이">
      <h2 class="rk-cuts__title">
        순위 컷 추이
        <span>{first ? `전체 월드 · ${formatDateDot(first)}부터 7일 간격` : "전체 월드 · 최근 12주"}</span>
      </h2>
      {!cuts.length ? <Skeleton height={168} radius={14} /> : null}
      {cuts.length ? (
        <ol class="rk-cuts__list">
          {cuts.map((cut) => {
            const known = cut.points.filter((point) => point.value > 0);
            const start = known[0];
            const now = known[known.length - 1];
            const change = start && now && start !== now ? (level ? now.value - start.value : now.value / start.value - 1) : null;
            return (
              <li key={cut.rank}>
                <span class="rk-cuts__rank num">{formatComma(cut.rank)}위</span>
                <Spark points={cut.points} label={`${formatComma(cut.rank)}위 ${start ? format(start.value) : "-"}에서 ${now ? format(now.value) : "-"}`} />
                <strong class="rk-cuts__value num">{now ? format(now.value) : "-"}</strong>
                <span class={`rk-cuts__change num${change > 0 ? " is-up" : change < 0 ? " is-down" : ""}`}>
                  {change === null ? "" : level ? `${change >= 0 ? "+" : "−"}${Math.abs(change)}` : `${change >= 0 ? "+" : "−"}${formatDecimal(Math.abs(change) * 100, 1)}%`}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
