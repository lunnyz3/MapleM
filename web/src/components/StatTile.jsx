import { Icon } from "./Icon.jsx";
import { Skeleton } from "./Skeleton.jsx";

/**
 * 수치 타일: 이름 + 값(단위) + 보조 설명 + 변화량(▲▼, 선택).
 * 큰 수는 한국식 단위로 넘기고 full 에 전체 값을 넣으면 마우스 오버로 보여준다.
 * @param {{
 *   label: string,
 *   icon?: string,
 *   tone?: import("../lib/game.js").Tone,
 *   value?: string,
 *   prefix?: string,
 *   unit?: string,
 *   full?: string,
 *   sub?: any,
 *   delta?: number | null,
 *   href?: string,
 *   loading?: boolean
 * }} props
 */
export function StatTile({ label, icon, tone = "sky", value = "-", prefix, unit, full, sub, delta = null, href, loading = false }) {
  const Tag = href ? "a" : "div";
  return (
    <Tag class={`stat-tile tone-${tone}`} href={href} aria-busy={loading ? "true" : undefined}>
      <span class="stat-tile__label">
        {icon ? (
          <span class="stat-tile__icon">
            <Icon name={icon} size={18} />
          </span>
        ) : null}
        <span>{label}</span>
      </span>
      {loading ? (
        <span class="stat-tile__loading">
          <Skeleton width="70%" height={26} radius={8} />
          <Skeleton width="45%" height={12} />
          <span class="sr-only">불러오는 중</span>
        </span>
      ) : (
        <>
          <span class="stat-tile__value num" title={full}>
            {prefix ? <span class="stat-tile__affix">{prefix}</span> : null}
            <strong>{value}</strong>
            {unit ? <span class="stat-tile__affix">{unit}</span> : null}
          </span>
          {delta !== null && delta !== 0 ? (
            <span class={`stat-tile__delta ${delta > 0 ? "is-up" : "is-down"}`}>
              <span aria-hidden="true">{delta > 0 ? "▲" : "▼"}</span>
              <span class="sr-only">{delta > 0 ? "상승" : "하락"}</span> {Math.abs(delta).toLocaleString("ko-KR")}
            </span>
          ) : null}
          {sub ? <span class="stat-tile__sub">{sub}</span> : null}
        </>
      )}
      {href ? <Icon name="chevronRight" size={18} class="stat-tile__go" /> : null}
    </Tag>
  );
}
