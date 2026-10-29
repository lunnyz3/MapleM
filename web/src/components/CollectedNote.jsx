// 자체 수집 랭킹·통계 안내: 메이플M 전체가 아니라 이 사이트가 모은 캐릭터 기준이라는 것(넥슨 API는 전체 목록을 주지 않는다).
import { useEffect, useState } from "preact/hooks";
import { getJson } from "../lib/api.js";
import { formatComma } from "../lib/format.js";
import { Icon } from "./Icon.jsx";

/** @type {Promise<number> | null} */
let pending = null;
function loadCount() {
  if (!pending) {
    pending = getJson("/api/v2/collection-summary").then(
      ({ response, body }) => (response.ok && body?.ok ? Number(body.characters) || 0 : 0),
      () => 0
    );
  }
  return pending;
}

/** @param {{ class?: string }} props */
export function CollectedNote({ class: className = "" }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    loadCount().then((value) => alive && setCount(value));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <p class={`collected-note ${className}`}>
      <Icon name="info" size={16} />
      <span>현재 DB에 저장된 캐릭터{count ? ` ${formatComma(count)}명` : ""} 기준이에요.</span>
    </p>
  );
}
