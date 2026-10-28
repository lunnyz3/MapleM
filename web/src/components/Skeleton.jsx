/**
 * 로딩 자리표시. 화면 읽기 프로그램에는 숨기고, 감싸는 영역에 aria-busy 를 준다.
 * @param {{ width?: number | string, height?: number | string, radius?: number | string, class?: string }} props
 */
export function Skeleton({ width = "100%", height = 14, radius = 6, class: className = "" }) {
  return <span class={`skeleton ${className}`} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

/**
 * 순위 목록 모양 자리표시.
 * @param {{ rows?: number }} props
 */
export function SkeletonList({ rows = 5 }) {
  return (
    <div class="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div class="skeleton-row" key={index}>
          <Skeleton width={36} height={36} radius={12} />
          <Skeleton width={44} height={44} radius={14} />
          <span class="skeleton-row__text">
            <Skeleton width={`${58 - index * 5}%`} height={14} />
            <Skeleton width={`${40 + index * 4}%`} height={11} />
          </span>
          <Skeleton width={72} height={18} />
        </div>
      ))}
    </div>
  );
}
