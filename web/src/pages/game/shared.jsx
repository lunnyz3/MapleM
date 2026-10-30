// 미니게임 공용: 최고 기록(이 브라우저), 장비 놀이용 장비 목록(GET /api/v2/game/items), 장비 아이콘, 끝난 판,
// 이번 주 랭킹(시작 표 POST /api/v2/game/start → 기록 POST /api/v2/game/score, 목록 GET /api/v2/game/leaderboard).
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { toast } from "../../components/Toast.jsx";
import { getJson, postJson, toApiError } from "../../lib/api.js";
import { formatComma } from "../../lib/format.js";
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

/** 게임마다 기록 글자(랭킹·게임 목록 최고 기록) */
export const SCORE_TEXT = {
  vs: (value) => `연속 ${value}`,
  guess: (value) => `${formatComma(value)}점`,
  reaction: (value) => `${formatComma(value)}ms`,
  star: (value) => `★${value}`,
  memory: (value) => `${value}번`,
  quiz: (value) => `${value}/10`,
  catch: (value) => `${formatComma(value)}점`,
  merge: (value) => `${formatComma(value)}점`,
  simon: (value) => `${value}단계`,
  typing: (value) => `${formatComma(value)}타`,
  sf: (value) => `★${value}`
};

const NICK_KEY = "mmp.game.nick";

function readNick() {
  try {
    return window.localStorage.getItem(NICK_KEY) || "";
  } catch {
    return "";
  }
}

/**
 * 한 판의 시작 표. 판을 시작할 때 renew() 를 부르면 서버에서 새 표를 받아 둔다(기록 올릴 때 쓴다).
 * @param {string} game
 */
export function useRunToken(game) {
  const token = useRef("");
  const renew = () => {
    token.current = "";
    postJson("/api/v2/game/start", { game }).then(
      ({ response, body }) => {
        if (response.ok && body?.ok) token.current = body.token;
      },
      () => {}
    );
  };
  return { token, renew };
}

/**
 * 닉네임을 쓰고 이번 주 랭킹에 올리기.
 * @param {{ game: string, value: number, token: { current: string } }} props
 */
export function SubmitScore({ game, value, token }) {
  const [nick, setNick] = useState(readNick);
  const [state, setState] = useState(/** @type {{ status: "idle" | "sending" | "done" | "error", rank?: number, improved?: boolean, message?: string }} */ ({ status: "idle" }));
  const submit = async (/** @type {Event} */ event) => {
    event.preventDefault();
    if (state.status === "sending" || !nick.trim()) return;
    setState({ status: "sending" });
    try {
      const { response, body } = await postJson("/api/v2/game/score", { game, nickname: nick.trim(), value, token: token.current });
      if (!response.ok || !body?.ok) {
        setState({ status: "error", message: body?.message || "올리지 못했어요." });
        return;
      }
      token.current = "";
      try {
        window.localStorage.setItem(NICK_KEY, nick.trim());
      } catch {
        // 닉네임 기억은 못 해도 된다
      }
      setState({ status: "done", rank: body.rank, improved: body.improved });
      window.dispatchEvent(new CustomEvent("arcade:scored", { detail: game }));
    } catch (error) {
      setState({ status: "error", message: error?.message || "올리지 못했어요." });
    }
  };
  if (state.status === "done") {
    return (
      <p class="arc-submit__done">
        {state.improved ? `이번 주 랭킹 ${formatComma(state.rank || 0)}위에 올렸어요!` : `이번 주 기록이 더 좋아서 그대로 ${formatComma(state.rank || 0)}위예요.`}
      </p>
    );
  }
  return (
    <form class="arc-submit" onSubmit={submit}>
      <label class="sr-only" for={`arc-nick-${game}`}>
        닉네임
      </label>
      <input
        id={`arc-nick-${game}`}
        class="input"
        type="text"
        maxLength={12}
        autoComplete="nickname"
        placeholder="닉네임(12자)"
        value={nick}
        onInput={(event) => setNick(/** @type {HTMLInputElement} */ (event.currentTarget).value)}
      />
      <button type="submit" class="btn btn--primary" disabled={!nick.trim() || state.status === "sending"}>
        <Icon name="trophy" size={18} />
        랭킹 등록
      </button>
      {state.status === "error" ? (
        <p class="arc-submit__error" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/**
 * 이번 주 랭킹(위 20명). 기록을 올리면 다시 읽는다.
 * @param {{ game: string }} props
 */
export function RankPanel({ game }) {
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", rows: any[] }} */ ({ status: "loading", rows: [] }));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onScored = (/** @type {Event} */ event) => {
      if (/** @type {CustomEvent} */ (event).detail === game) setTick((n) => n + 1);
    };
    window.addEventListener("arcade:scored", onScored);
    return () => window.removeEventListener("arcade:scored", onScored);
  }, [game]);
  useEffect(() => {
    let alive = true;
    getJson(`/api/v2/game/leaderboard?${new URLSearchParams({ game, t: String(tick) })}`).then(
      ({ response, body }) => alive && setState(response.ok && body?.ok ? { status: "ready", rows: body.rows || [] } : { status: "error", rows: [] }),
      () => alive && setState({ status: "error", rows: [] })
    );
    return () => {
      alive = false;
    };
  }, [game, tick]);
  const format = SCORE_TEXT[game] || String;
  return (
    <section class="arc-board card" aria-label="이번 주 랭킹">
      <h2 class="arc-board__title">
        <Icon name="trophy" size={18} />
        이번 주 랭킹
      </h2>
      {state.status === "ready" && state.rows.length ? (
        <ol class="arc-board__list">
          {state.rows.map((row) => (
            <li key={row.nickname} class={row.rank <= 3 ? `is-top is-top-${row.rank}` : ""}>
              <span class="arc-board__rank num">{row.rank}</span>
              <span class="arc-board__name">{row.nickname}</span>
              <strong class="num">{format(row.value)}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p class="arc-board__empty">{state.status === "loading" ? "불러오는 중…" : state.status === "error" ? "랭킹을 불러오지 못했어요." : "아직 기록이 없어요. 첫 1위가 되어 보세요!"}</p>
      )}
    </section>
  );
}

/**
 * 끝난 판: 칭호·큰 기록·줄들 + (기록이 있으면) 랭킹 등록 + 결과 복사·다시 하기.
 * @param {{ title: string, value: string, lines?: string[], isBest?: boolean, onShare: () => void, onRetry: () => void, game?: string, score?: number | null, token?: { current: string } }} props
 */
export function GameOver({ title, value, lines = [], isBest = false, onShare, onRetry, game = "", score = null, token }) {
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
      {game && token && score !== null && Number.isFinite(score) && score > 0 ? <SubmitScore game={game} value={score} token={token} /> : null}
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
