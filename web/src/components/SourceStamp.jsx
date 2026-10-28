import { formatDateDot, formatDateTimeKst } from "../lib/format.js";

/** 출처 종류: 공식 API / 자체 계산 / 추정 모델 / 사용자 입력 (design-system.md 2.3) */
const KINDS = {
  official: { label: "공식", tone: "sky" },
  calc: { label: "계산", tone: "lavender" },
  estimate: { label: "추정", tone: "gold" },
  manual: { label: "직접 입력", tone: "peach" }
};

/**
 * 출처 배지 하나.
 * @param {{ kind?: keyof typeof KINDS }} props
 */
export function SourceBadge({ kind = "official" }) {
  const info = KINDS[kind] || KINDS.official;
  return <span class={`badge tone-${info.tone}`}>{info.label}</span>;
}

/**
 * 데이터 출처·기준 시각 표기(신뢰 장치).
 *   date: 랭킹처럼 집계일만 있을 때 "2026.10.28 집계"
 *   at:   조회 시각이 있을 때 "2026.10.28 18:44 기준"(서울)
 * @param {{
 *   kind?: keyof typeof KINDS,
 *   source?: string,
 *   date?: string | null,
 *   at?: string | null,
 *   note?: any,
 *   class?: string
 * }} props
 */
export function SourceStamp({ kind = "official", source = "넥슨 Open API", date, at, note, class: className = "" }) {
  const atText = formatDateTimeKst(at);
  return (
    <p class={`source-stamp ${className}`}>
      <SourceBadge kind={kind} />
      <span>
        {source}
        {date ? (
          <>
            {" · "}
            <time class="num" dateTime={date}>
              {formatDateDot(date)}
            </time>{" "}
            집계
          </>
        ) : null}
        {!date && atText ? (
          <>
            {" · "}
            <time class="num" dateTime={String(at)}>
              {atText}
            </time>{" "}
            기준
          </>
        ) : null}
      </span>
      {note ? <span class="source-stamp__note">{note}</span> : null}
    </p>
  );
}
