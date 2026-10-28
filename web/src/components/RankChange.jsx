/**
 * 전날(이전 집계일) 대비 순위 변동: ▲3(상승) · ▼2(하락) · —(그대로) · NEW(새로 진입).
 * 색만으로 전하지 않도록 기호와 숫자를 함께 보이고, 읽기 프로그램에는 "3계단 상승"처럼 읽힌다.
 * 순위 변동 API가 없거나 비교할 이전 날짜가 없으면(rankChange·isNew 없음) 아무것도 그리지 않는다.
 * @param {{ row: Record<string, any>, class?: string }} props
 */
export function RankChange({ row, class: className = "" }) {
  if (!row) return null;
  const extra = className ? ` ${className}` : "";
  if (row.isNew === true) {
    return (
      <span class={`rank-change is-new${extra}`} title="새로 진입">
        <span aria-hidden="true">NEW</span>
        <span class="sr-only">새로 진입</span>
      </span>
    );
  }
  if (row.rankChange === null || row.rankChange === undefined || row.rankChange === "") return null;
  const change = Number(row.rankChange);
  if (!Number.isFinite(change)) return null;
  if (change === 0) {
    return (
      <span class={`rank-change is-same${extra}`} title="변동 없음">
        <span aria-hidden="true">—</span>
        <span class="sr-only">순위 변동 없음</span>
      </span>
    );
  }
  const up = change > 0;
  const amount = Math.abs(change).toLocaleString("ko-KR");
  return (
    <span class={`rank-change ${up ? "is-up" : "is-down"}${extra}`} title={`${amount}계단 ${up ? "상승" : "하락"}`}>
      <span aria-hidden="true">
        {up ? "▲" : "▼"}
        {amount}
      </span>
      <span class="sr-only">
        {amount}계단 {up ? "상승" : "하락"}
      </span>
    </span>
  );
}
