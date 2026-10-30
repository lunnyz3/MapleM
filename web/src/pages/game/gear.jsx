// 장비창(누가 더 셀까? · 전투력 맞히기 · 장비창 월드컵 공용): GET /api/v2/game/gear 로 칸마다 템환산이 가장 높은 장비를
// 읽어(같은 캐릭터는 한 번만) 아이콘·등급 테두리·스타포스·잠재 등급으로 그린다.
import { useEffect, useState } from "preact/hooks";
import { getJson, toApiError } from "../../lib/api.js";
import { gradeInfo } from "../../lib/character.js";

/** @type {Map<string, Promise<any[]>>} */
const gearCache = new Map();

/** 캐릭터들의 장비창(같은 캐릭터는 한 번만 읽는다). */
export function loadGear(/** @type {string[]} */ ids) {
  const missing = ids.filter((id) => id && !gearCache.has(id));
  if (missing.length) {
    const request = getJson(`/api/v2/game/gear?${new URLSearchParams({ ids: missing.join(",") })}`).then(({ response, body }) => {
      if (!response.ok || !body?.ok) throw toApiError(response, body, "장비를 불러오지 못했어요.");
      return body.gear || {};
    });
    missing.forEach((id) => {
      const one = request.then((gear) => gear[id] || []);
      one.catch(() => gearCache.delete(id));
      gearCache.set(id, one);
    });
  }
  return Promise.all(ids.map((id) => gearCache.get(id)));
}

/** @param {string[]} ids */
export function useGear(ids) {
  const key = ids.filter(Boolean).join(",");
  const [state, setState] = useState(/** @type {{ key: string, gear: any[][] | null, failed: boolean }} */ ({ key: "", gear: null, failed: false }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    loadGear(key.split(",")).then(
      (gear) => alive && setState({ key, gear, failed: false }),
      () => alive && setState({ key, gear: null, failed: true })
    );
    return () => {
      alive = false;
    };
  }, [key, attempt]);
  const current = state.key === key ? state : { key, gear: null, failed: false };
  return { ...current, retry: () => setAttempt((n) => n + 1) };
}

/**
 * 장비창: 아이콘·등급 테두리·스타포스·잠재 등급(마우스를 올리면 이름).
 * @param {{ gear: any[] | null | undefined, failed?: boolean, onRetry?: () => void }} props
 */
export function GearWindow({ gear, failed = false, onRetry }) {
  if (failed) {
    return (
      <div class="game-gear__note">
        장비를 불러오지 못했어요.
        {onRetry ? (
          <button
            type="button"
            class="btn btn--secondary btn--sm"
            onClick={(event) => {
              event.stopPropagation();
              onRetry();
            }}
          >
            다시 시도
          </button>
        ) : null}
      </div>
    );
  }
  if (!gear) {
    return (
      <div class="game-gear" aria-hidden="true">
        {Array.from({ length: 23 }, (_, index) => (
          <span key={index} class="game-gear__slot is-loading" />
        ))}
      </div>
    );
  }
  if (!gear.length) return <p class="game-gear__note">장비 정보가 없어요.</p>;
  return (
    <ul class="game-gear" aria-label="장비창">
      {gear.map((item, index) => {
        const grade = gradeInfo(item.grade);
        const pot = gradeInfo(item.potential);
        const label = [item.slot, item.name, item.star ? `${item.star}성` : "", pot ? `잠재 ${pot.label}` : ""].filter(Boolean).join(" · ");
        return (
          <li key={item.slot} class={`game-gear__slot${grade ? ` is-${grade.key}` : ""}`} title={label} style={{ "--stagger": index }}>
            {item.icon ? <img class="game-gear__img" src={item.icon} alt={label} width={40} height={40} loading="lazy" decoding="async" /> : <span class="sr-only">{label}</span>}
            {item.star ? (
              <span class="game-gear__star num" aria-hidden="true">
                ★{item.star}
              </span>
            ) : null}
            {pot ? <img class="game-gear__pot" src={pot.icon} alt="" width={13} height={13} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

