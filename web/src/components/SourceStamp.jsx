import { formatDateDot } from "../lib/format.js";

/**
 * 데이터 출처·기준 시각 표기(신뢰 장치). 공식 API 데이터는 "공식" 배지.
 * @param {{ date?: string | null, note?: string, class?: string }} props
 */
export function SourceStamp({ date, note, class: className = "" }) {
  return (
    <p class={`source-stamp ${className}`}>
      <span class="badge tone-sky">공식</span>
      <span>
        넥슨 Open API
        {date ? (
          <>
            {" · "}
            <time class="num" dateTime={date}>
              {formatDateDot(date)}
            </time>{" "}
            집계
          </>
        ) : null}
      </span>
      {note ? <span class="source-stamp__note">{note}</span> : null}
    </p>
  );
}
