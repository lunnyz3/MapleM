// 장식 그래픽(직접 그린 SVG): 로고 심볼, 단풍잎, 구름, 반짝임, 빈 상태 일러스트.
import { useId } from "preact/hooks";
import { LEAF_PATH, LEAF_STEM_PATH, SPARKLE_PATH } from "./Icon.jsx";

/**
 * 로고 심볼: 하늘색 둥근 사각형 + 흰 단풍잎.
 * @param {{ size?: number }} props
 */
export function BrandMark({ size = 32 }) {
  // 같은 화면에 여러 개 그려도 그라데이션 id가 겹치지 않게 한다.
  const gradientId = `brand-fill-${useId()}`;
  return (
    <svg class="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#5b9bff" />
          <stop offset="1" stop-color="#2563c9" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <path d="M4 9.5c4-5 14-6.5 24-2" stroke="#ffffff" stroke-opacity=".22" stroke-width="2" fill="none" stroke-linecap="round" />
      <g transform="translate(5.2 4.6) scale(0.9)" fill="#ffffff" stroke="#ffffff" stroke-linejoin="round" stroke-linecap="round">
        <path d={LEAF_PATH} stroke-width="1.4" />
        <path d={LEAF_STEM_PATH} fill="none" stroke-width="2" />
      </g>
    </svg>
  );
}

/**
 * 채워진 단풍잎(장식). 색은 currentColor.
 * @param {{ size?: number, class?: string, style?: any }} props
 */
export function Leaf({ size = 24, class: className = "", style }) {
  return (
    <svg class={`leaf ${className}`} style={style} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill="currentColor" stroke="currentColor" stroke-linejoin="round" stroke-linecap="round">
        <path d={LEAF_PATH} stroke-width="1.2" />
        <path d={LEAF_STEM_PATH} fill="none" stroke-width="1.6" />
      </g>
    </svg>
  );
}

/**
 * 몽실한 구름(원 세 개 + 바닥). 겹침이 진해지지 않게 그룹 단위로 투명도를 준다.
 * @param {{ width?: number, class?: string, style?: any }} props
 */
export function Cloud({ width = 120, class: className = "", style }) {
  return (
    <svg
      class={`cloud ${className}`}
      style={style}
      width={width}
      height={width / 2}
      viewBox="0 0 64 32"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="currentColor">
        <circle cx="20" cy="20" r="9" />
        <circle cx="32.5" cy="14" r="12" />
        <circle cx="45" cy="19.5" r="8.5" />
        <rect x="11" y="18" width="43" height="11" rx="5.5" />
      </g>
    </svg>
  );
}

/**
 * 네 갈래 반짝임.
 * @param {{ size?: number, class?: string, style?: any }} props
 */
export function Sparkle({ size = 16, class: className = "", style }) {
  return (
    <svg class={`sparkle ${className}`} style={style} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={SPARKLE_PATH} fill="currentColor" />
    </svg>
  );
}

/**
 * 빈 상태·오류 상태 일러스트(구름 + 단풍잎).
 * @param {{ kind?: "empty" | "error" | "search" }} props
 */
export function StateArt({ kind = "empty" }) {
  const isError = kind === "error";
  return (
    <svg class={`state-art state-art--${kind}`} width="132" height="88" viewBox="0 0 132 88" aria-hidden="true" focusable="false">
      <circle cx="66" cy="46" r="38" class="state-art__halo" />
      <g class="state-art__cloud">
        <circle cx="50" cy="52" r="13" />
        <circle cx="67" cy="43" r="17" />
        <circle cx="85" cy="51" r="12" />
        <rect x="37" y="49" width="61" height="16" rx="8" />
      </g>
      {isError ? (
        <g class="state-art__drops" stroke-linecap="round">
          <path d="M54 72v6" />
          <path d="M67 72v9" />
          <path d="M80 72v6" />
        </g>
      ) : (
        <g transform="translate(86 14) rotate(18) scale(1.15)" class="state-art__leaf">
          <path d={LEAF_PATH} stroke-width="1.2" stroke-linejoin="round" />
          <path d={LEAF_STEM_PATH} fill="none" stroke-width="1.6" stroke-linecap="round" />
        </g>
      )}
      <path d={SPARKLE_PATH} transform="translate(24 16) scale(0.62)" class="state-art__sparkle" />
      <path d={SPARKLE_PATH} transform="translate(100 60) scale(0.42)" class="state-art__sparkle state-art__sparkle--b" />
      {kind === "search" ? (
        <g class="state-art__lens" fill="none" stroke-width="4" stroke-linecap="round">
          <circle cx="66" cy="50" r="8" />
          <path d="m72 56 6 6" />
        </g>
      ) : null}
    </svg>
  );
}
