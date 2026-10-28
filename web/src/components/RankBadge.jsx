import { useId } from "preact/hooks";
import { LEAF_PATH, LEAF_STEM_PATH } from "./Icon.jsx";

const MEDALS = /** @type {const} */ ({ 1: "gold", 2: "silver", 3: "bronze" });

/**
 * 순위 배지: 1·2·3위는 금·은·동 단풍잎(숫자 포함), 그 외는 숫자.
 * 색만으로 순위를 전하지 않도록 숫자를 항상 보여주고, 읽기 프로그램에는 "N위"로 읽힌다.
 * @param {{ rank: number, size?: number }} props
 */
export function RankBadge({ rank, size = 36 }) {
  const gradientId = `medal-${useId()}`;
  const medal = MEDALS[/** @type {1 | 2 | 3} */ (rank)];
  const label = `${rank}위`;

  if (!medal) {
    return (
      <span class="rank-badge rank-badge--plain num" style={{ width: size, height: size }} role="img" aria-label={label}>
        <span aria-hidden="true">{rank}</span>
      </span>
    );
  }

  return (
    <span class={`rank-badge rank-badge--${medal}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" style={{ stopColor: `var(--medal-${medal}-1)` }} />
            <stop offset="1" style={{ stopColor: `var(--medal-${medal}-2)` }} />
          </linearGradient>
        </defs>
        <path class="rank-badge__stem" d={LEAF_STEM_PATH} />
        <path class="rank-badge__leaf" d={LEAF_PATH} fill={`url(#${gradientId})`} />
        <text class="rank-badge__num" x="12" y="11.4" text-anchor="middle" dominant-baseline="central">
          {rank}
        </text>
      </svg>
    </span>
  );
}
