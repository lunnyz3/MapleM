// 누가 더 셀까?(/game): 모은 캐릭터 둘의 직업·레벨·템환산·잠재·에디·최대 대미지만 보고 전투력이 더 높은 쪽을 고른다.
// 맞히면 연속 기록이 오르고, 연속이 길수록 두 전투력이 비슷한 짝이 나온다(web/src/lib/powerGame.mjs). 최고 기록은 이 브라우저에 남는다.
import "../styles/game.css";
import { useEffect, useRef, useState } from "preact/hooks";
import { WorldIcon } from "../components/GameIcons.jsx";
import { Icon } from "../components/Icon.jsx";
import { Aurora, CountUp, SplitText } from "../components/Motion.jsx";
import { Skeleton } from "../components/Skeleton.jsx";
import { ErrorState } from "../components/States.jsx";
import { toast } from "../components/Toast.jsx";
import { getJson, toApiError } from "../lib/api.js";
import { formatDecimal, formatKoreanUnits } from "../lib/format.js";
import { urls } from "../lib/game.js";
import { setScoreText } from "../lib/itemScore.js";
import { pickPair } from "../lib/powerGame.mjs";
import { copyText } from "../lib/share.js";

const BEST_KEY = "mmp.game.best";

function readBest() {
  try {
    return Math.max(0, Math.floor(Number(window.localStorage.getItem(BEST_KEY)) || 0));
  } catch {
    return 0;
  }
}

function writeBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // 저장할 수 없으면 이번 판만
  }
}

const power = (value) => formatKoreanUnits(value, { maxGroups: value >= 1e8 ? 2 : 1 });

/**
 * 캐릭터 카드: 고르기 전에는 카드 전체가 버튼, 고른 뒤에는 전투력과 이름(캐릭터로 가는 링크).
 * @param {{ entry: any, revealed: boolean, result: "" | "win" | "lose", picked: boolean, onPick: () => void, hotkey: string }} props
 */
function Fighter({ entry, revealed, result, picked, onPick, hotkey }) {
  const body = (
    <>
      <span class="game-card__world">
        <WorldIcon world={entry.world} size={16} />
        {entry.world}
      </span>
      <strong class="game-card__job display">{entry.className}</strong>
      <span class="game-card__lv num">Lv.{entry.level}</span>
      <dl class="game-card__stats">
        <div>
          <dt>템환산</dt>
          <dd class="num">{setScoreText(entry.itemScore || 0)}점</dd>
        </div>
        <div>
          <dt>잠재</dt>
          <dd class="num">{formatDecimal(entry.potential || 0, 1)}%</dd>
        </div>
        <div>
          <dt>에디</dt>
          <dd class="num">{formatDecimal(entry.additionalPotential || 0, 1)}%</dd>
        </div>
        <div>
          <dt>최대 대미지</dt>
          <dd class="num">{entry.maxDamage ? formatKoreanUnits(entry.maxDamage, { maxGroups: 1 }) : "-"}</dd>
        </div>
      </dl>
      {revealed ? (
        <span class="game-card__reveal">
          <span class="game-card__power display num">
            <CountUp value={entry.power} format={power} duration={900} />
          </span>
          <a class="game-card__name" href={urls.character(entry.world, entry.name)}>
            {entry.name}
            <Icon name="chevronRight" size={14} />
          </a>
        </span>
      ) : (
        <span class="game-card__cta">
          <span class="game-card__key" aria-hidden="true">
            {hotkey}
          </span>
          이쪽이 더 세다
        </span>
      )}
    </>
  );
  const cls = `game-card${revealed ? ` is-${result || "lose"}` : ""}${picked ? " is-picked" : ""}`;
  return revealed ? (
    <div class={cls}>{body}</div>
  ) : (
    <button type="button" class={cls} onClick={onPick}>
      {body}
    </button>
  );
}

export function Game() {
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", pool?: any[], error?: any }} */ ({ status: "loading" }));
  const [attempt, setAttempt] = useState(0);
  const used = useRef(/** @type {Set<string>} */ (new Set()));
  const [pair, setPair] = useState(/** @type {any[] | null} */ (null));
  const [picked, setPicked] = useState(/** @type {number | null} */ (null));
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(readBest);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [over, setOver] = useState(false);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    getJson("/api/v2/game/pool").then(
      ({ response, body }) =>
        alive &&
        setState(
          response.ok && body?.ok
            ? { status: "ready", pool: body.pool || [] }
            : { status: "error", error: toApiError(response, body, "캐릭터를 불러오지 못했어요.") }
        ),
      (error) => alive && setState({ status: "error", error })
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const next = (/** @type {number} */ level) => {
    const pool = state.pool || [];
    let chosen = pickPair(pool, used.current, level);
    if (!chosen) {
      // 다 나왔으면 처음부터 다시 섞는다
      used.current = new Set();
      chosen = pickPair(pool, used.current, level);
    }
    if (chosen) chosen.forEach((entry) => used.current.add(`${entry.world}/${entry.name}`));
    setPair(chosen);
    setPicked(null);
  };

  useEffect(() => {
    if (state.status === "ready" && !pair) next(0);
  }, [state.status]);

  const choose = (/** @type {number} */ index) => {
    if (!pair || picked !== null) return;
    setPicked(index);
    const win = pair[index].power >= pair[1 - index].power;
    setScore((prev) => ({ right: prev.right + (win ? 1 : 0), total: prev.total + 1 }));
    if (win) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak > best) {
        setBest(nextStreak);
        writeBest(nextStreak);
      }
    } else {
      setOver(true);
    }
  };

  const restart = () => {
    setStreak(0);
    setOver(false);
    next(0);
  };

  // 키보드: ←/1 왼쪽, →/2 오른쪽, Enter·Space 다음
  useEffect(() => {
    const onKey = (/** @type {KeyboardEvent} */ event) => {
      if (event.target instanceof HTMLElement && /input|select|textarea/i.test(event.target.tagName)) return;
      if (picked === null && (event.key === "ArrowLeft" || event.key === "1")) choose(0);
      else if (picked === null && (event.key === "ArrowRight" || event.key === "2")) choose(1);
      else if (picked !== null && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        if (over) restart();
        else next(streak);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const share = async () => {
    const ok = await copyText(`메이플M 플러스 '누가 더 셀까?' 연속 ${streak}번 맞혔어요! (최고 ${best}번)\nhttps://maplem.co.kr/game`);
    toast(ok ? "결과를 복사했어요" : "복사하지 못했어요", ok ? "success" : "error");
  };

  // 고르고 나면 결과·다음 버튼이 보이게(좁은 화면에서는 카드 아래에 있다)
  const resultRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  useEffect(() => {
    if (picked !== null) requestAnimationFrame(() => resultRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, [picked]);

  const revealed = picked !== null;
  const winner = pair ? (pair[0].power >= pair[1].power ? 0 : 1) : 0;

  return (
    <div class="game">
      <header class="page-head page-head--rank tone-gold">
        <Aurora tone="dusk" />
        <span class="page-head__icon" aria-hidden="true">
          <Icon name="swords" size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText text="누가 더 셀까?" />
        </h1>
      </header>

      <div class="game-score card" role="status" aria-live="polite">
        <span>
          연속 <strong class="num">{streak}</strong>
        </span>
        <span>
          최고 <strong class="num">{best}</strong>
        </span>
        <span>
          맞힌 수{" "}
          <strong class="num">
            {score.right}/{score.total}
          </strong>
        </span>
      </div>

      {state.status === "loading" ? <Skeleton height={420} radius={20} /> : null}
      {state.status === "error" ? <ErrorState title="불러오지 못했어요" description={state.error?.message} onRetry={() => setAttempt((n) => n + 1)} /> : null}
      {state.status === "ready" && pair ? (
        <>
          <div class={`game-arena${revealed ? " is-revealed" : ""}`} key={`${pair[0].name}-${pair[1].name}`}>
            <Fighter entry={pair[0]} revealed={revealed} result={winner === 0 ? "win" : "lose"} picked={picked === 0} onPick={() => choose(0)} hotkey="1" />
            <span class="game-vs display" aria-hidden="true">
              VS
            </span>
            <Fighter entry={pair[1]} revealed={revealed} result={winner === 1 ? "win" : "lose"} picked={picked === 1} onPick={() => choose(1)} hotkey="2" />
          </div>
          {revealed ? (
            <div class={`game-result card${over ? " is-over" : " is-right"}`} ref={resultRef}>
              <strong class="display">{over ? (streak ? `아쉬워요! ${streak}번 연속에서 끝` : "아쉬워요!") : `정답! 연속 ${streak}번`}</strong>
              <div class="game-result__actions">
                {over ? (
                  <>
                    <button type="button" class="btn btn--secondary" onClick={share}>
                      <Icon name="share" size={18} />
                      결과 복사
                    </button>
                    <button type="button" class="btn btn--primary" onClick={restart}>
                      <Icon name="refresh" size={18} />
                      다시 하기
                    </button>
                  </>
                ) : (
                  <button type="button" class="btn btn--primary" onClick={() => next(streak)}>
                    다음 문제
                    <Icon name="arrowRight" size={18} />
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
