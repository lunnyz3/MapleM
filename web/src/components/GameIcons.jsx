// 게임 아이콘: 월드 아이콘 · 등급 아이콘 · 행 보조 정보(월드 아이콘 + 등급 아이콘 + 짧은 글자).
import { gradeFallbackIcon, worldIconSrc } from "../lib/game.js";

/**
 * 월드 아이콘(글자 없이). 읽기 프로그램·마우스 오버에는 월드 이름.
 * @param {{ world: string, size?: number, class?: string }} props
 */
export function WorldIcon({ world, size = 16, class: className = "" }) {
  const src = worldIconSrc(world);
  if (!src) return null;
  return (
    <img
      class={`world-icon ${className}`}
      src={src}
      alt={world}
      title={world}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
    />
  );
}

/**
 * 등급 아이콘(API 아이콘 우선, 없으면 기본 등급 아이콘). 둘 다 없으면 그리지 않는다.
 * @param {{ src?: string, label?: string, size?: number, class?: string }} props
 */
export function GradeIcon({ src = "", label = "", size = 20, class: className = "" }) {
  const url = src || gradeFallbackIcon(label);
  if (!url) return null;
  return (
    <img
      class={`grade-icon ${className}`}
      src={url}
      alt={label}
      title={label || undefined}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
    />
  );
}

/**
 * 순위 행 이름 아래 줄: [월드 아이콘] [등급 아이콘] 직업 · 길드 …
 * @param {{ type: import("../lib/game.js").RankingType, row: Record<string, any>, max?: number, class?: string }} props
 */
export function RowMeta({ type, row, max = 3, class: className = "" }) {
  const world = String(row.world_name || "");
  const grade = type.grade ? type.grade(row) : null;
  const parts = type.meta(row).slice(0, max);
  return (
    <span class={`row-meta ${className}`}>
      <WorldIcon world={world} />
      {grade ? <GradeIcon src={grade.src} label={grade.label} size={18} /> : null}
      {parts.length ? <span class="row-meta__text">{parts.join(" · ")}</span> : null}
    </span>
  );
}
