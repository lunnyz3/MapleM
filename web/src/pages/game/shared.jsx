// 미니게임 공용: 최고 기록(이 브라우저), 장비 놀이용 장비 목록(GET /api/v2/game/items), 장비 아이콘, 끝난 판.
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { toast } from "../../components/Toast.jsx";
import { getJson, toApiError } from "../../lib/api.js";
import { gradeInfo } from "../../lib/character.js";
import { copyText } from "../../lib/share.js";

export function readBest(key) {
  try {
    return Math.max(0, Math.floor(Number(window.localStorage.getItem(key)) || 0));
  } catch {
    return 0;
  }
}

export function writeBest(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // 저장할 수 없으면 이번 판만
  }
}

/** 더 좋은 기록이면 저장하고 true. lower: 낮을수록 좋은 기록(반응 시간·뒤집은 횟수). */
export function saveBest(key, value, lower = false) {
  const best = readBest(key);
  const better = lower ? value > 0 && (!best || value < best) : value > best;
  if (better) writeBest(key, value);
  return better;
}

/**
 * 창 전체 키보드 처리. 처리 함수는 그릴 때마다 바꿔 끼워, 새 화면이 그려지자마자 새 상태로 판단한다.
 * @param {(event: KeyboardEvent) => void} handler
 */
export function useWindowKey(handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onKey = (/** @type {KeyboardEvent} */ event) => ref.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export async function shareResult(text) {
  const ok = await copyText(`${text}\nhttps://maplem.co.kr/game`);
  toast(ok ? "결과를 복사했어요" : "복사하지 못했어요", ok ? "success" : "error");
}

/** @type {Promise<any[]> | null} */
let itemsRequest = null;

/** 장비 놀이용 장비(한 번만 읽고, 실패하면 다음에 다시). */
export function useGameItems() {
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", items: any[], error?: any }} */ ({ status: "loading", items: [] }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!itemsRequest) {
      itemsRequest = getJson("/api/v2/game/items").then(({ response, body }) => {
        if (!response.ok || !body?.ok) throw toApiError(response, body, "장비를 불러오지 못했어요.");
        return body.items || [];
      });
      itemsRequest.catch(() => {
        itemsRequest = null;
      });
    }
    itemsRequest.then(
      (items) => alive && setState({ status: "ready", items }),
      (error) => alive && setState({ status: "error", items: [], error })
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

/**
 * 장비 아이콘(등급 테두리).
 * @param {{ item: any, size?: number, class?: string }} props
 */
export function ItemTile({ item, size = 48, class: className = "" }) {
  const grade = gradeInfo(item?.grade);
  return (
    <span class={`arc-item${grade ? ` is-${grade.key}` : ""} ${className}`}>
      {item?.icon ? <img src={item.icon} alt="" width={size} height={size} decoding="async" draggable={false} /> : null}
    </span>
  );
}

/**
 * 끝난 판: 칭호·큰 기록·줄들 + 결과 복사·다시 하기.
 * @param {{ title: string, value: string, lines?: string[], isBest?: boolean, onShare: () => void, onRetry: () => void }} props
 */
export function GameOver({ title, value, lines = [], isBest = false, onShare, onRetry }) {
  return (
    <section class="arc-over card" aria-live="polite">
      <span class="arc-over__title display">{title}</span>
      <strong class="arc-over__value display num">{value}</strong>
      {isBest ? <span class="arc-over__best">최고 기록!</span> : null}
      {lines.length ? (
        <ul class="arc-over__lines">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <div class="arc-over__actions">
        <button type="button" class="btn btn--secondary" onClick={onShare}>
          <Icon name="share" size={18} />
          결과 복사
        </button>
        <button type="button" class="btn btn--primary" onClick={onRetry}>
          <Icon name="refresh" size={18} />
          다시 하기
        </button>
      </div>
    </section>
  );
}

/**
 * 게임 위 점수 줄.
 * @param {{ items: Array<[string, any]> }} props [이름, 값]
 */
export function ScoreBar({ items }) {
  return (
    <div class="game-score card" role="status" aria-live="polite">
      {items.map(([label, value]) => (
        <span key={label}>
          {label} <strong class="num">{value}</strong>
        </span>
      ))}
    </div>
  );
}
