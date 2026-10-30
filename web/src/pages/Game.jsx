// 미니게임(/game): 모은 캐릭터의 장비창만 보고 맞히는 두 가지 놀이. 문제는 장비에 맞는 전투력인 캐릭터만
// (GET /api/v2/game/pool), 장비창은 GET /api/v2/game/gear. 최고 기록은 이 브라우저에 남는다.
//  - 누가 더 셀까?: 둘 중 전투력이 더 높은 쪽. 연속이 길수록 두 전투력이 비슷한 짝(web/src/lib/powerGame.mjs), 템환산 힌트는 한 판에 세 번.
//  - 전투력 맞히기(?mode=guess): 한 명의 전투력을 슬라이더로. 다섯 문제, 가까울수록 점수가 높다.
import "../styles/game.css";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { WorldIcon } from "../components/GameIcons.jsx";
import { Icon } from "../components/Icon.jsx";
import { Aurora, CountUp, SplitText } from "../components/Motion.jsx";
import { Skeleton } from "../components/Skeleton.jsx";
import { ErrorState } from "../components/States.jsx";
import { Segmented } from "../components/Tabs.jsx";
import { toast } from "../components/Toast.jsx";
import { getJson, toApiError } from "../lib/api.js";
import { gradeInfo } from "../lib/character.js";
import { formatComma, formatDecimal, formatKoreanUnits } from "../lib/format.js";
import { urls } from "../lib/game.js";
import { setScoreText } from "../lib/itemScore.js";
import { GUESS_ROUNDS, guessPoints, guessTitle, pickOne, pickPair, roundPower, sliderRange } from "../lib/powerGame.mjs";
import { copyText } from "../lib/share.js";

const VS_KEY = "mmp.game.vs";
const GUESS_KEY = "mmp.game.guess";
const HINTS = 3;
const MODES = [
  { value: "vs", label: "누가 더 셀까?" },
  { value: "guess", label: "전투력 맞히기" }
];

function readBest(key) {
  try {
    return Math.max(0, Math.floor(Number(window.localStorage.getItem(key)) || 0));
  } catch {
    return 0;
  }
}

function writeBest(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // 저장할 수 없으면 이번 판만
  }
}

const readMode = () => (new URLSearchParams(window.location.search).get("mode") === "guess" ? "guess" : "vs");
const keyOf = (/** @type {any} */ entry) => `${entry.world}/${entry.name}`;
const power = (value) => formatKoreanUnits(value, { maxGroups: value >= 1e8 ? 2 : 1 });

// 키보드 조작을 글 입력 칸에서는 받지 않는다(슬라이더는 받는다).
const typingTarget = (/** @type {EventTarget | null} */ target) =>
  target instanceof HTMLElement && (/select|textarea/i.test(target.tagName) || (target.tagName === "INPUT" && /** @type {HTMLInputElement} */ (target).type !== "range"));

// ---------------- 장비창 ----------------

/** @type {Map<string, Promise<any[]>>} */
const gearCache = new Map();

/** 캐릭터들의 장비창(같은 캐릭터는 한 번만 읽는다). */
function loadGear(/** @type {string[]} */ ids) {
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
function useGear(ids) {
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
function GearWindow({ gear, failed = false, onRetry }) {
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

/** 월드·직업·레벨 */
function Who({ entry }) {
  return (
    <div class="game-card__who">
      <span class="game-card__world">
        <WorldIcon world={entry.world} size={16} />
        {entry.world}
      </span>
      <strong class="game-card__job display">{entry.className}</strong>
      <span class="game-card__lv num">Lv.{entry.level}</span>
    </div>
  );
}

/** 템환산(힌트) 또는 템환산·잠재·에디(정답 뒤) */
function SpecLine({ entry, full }) {
  return (
    <p class="game-card__spec num">
      <span>
        템환산 <strong>{setScoreText(entry.itemScore || 0)}점</strong>
      </span>
      {full ? (
        <>
          <span>
            잠재 <strong>{formatDecimal(entry.potential || 0, 1)}%</strong>
          </span>
          <span>
            에디 <strong>{formatDecimal(entry.additionalPotential || 0, 1)}%</strong>
          </span>
        </>
      ) : null}
    </p>
  );
}

function NameLink({ entry }) {
  return (
    <a class="game-card__name" href={urls.character(entry.world, entry.name)}>
      {entry.name}
      <Icon name="chevronRight" size={14} />
    </a>
  );
}

// ---------------- 누가 더 셀까? ----------------

/**
 * 고르기 전에는 카드 어디를 눌러도 고른다(키보드는 아래 버튼). 고른 뒤에는 전투력과 이름(캐릭터로 가는 링크).
 * @param {{ entry: any, gear: any[] | null | undefined, gearFailed: boolean, onRetry: () => void, revealed: boolean, result: "win" | "lose", picked: boolean, hinted: boolean, onPick: () => void, hotkey: string }} props
 */
function Fighter({ entry, gear, gearFailed, onRetry, revealed, result, picked, hinted, onPick, hotkey }) {
  const cls = `game-card${revealed ? ` is-${result}` : " is-pickable"}${picked ? " is-picked" : ""}`;
  return (
    <div class={cls} onClick={revealed ? undefined : onPick}>
      <Who entry={entry} />
      <GearWindow gear={gear} failed={gearFailed} onRetry={onRetry} />
      {hinted || revealed ? <SpecLine entry={entry} full={revealed} /> : null}
      {revealed ? (
        <span class="game-card__reveal">
          <span class="game-card__power display num">
            <CountUp value={entry.power} format={power} duration={900} />
          </span>
          <NameLink entry={entry} />
        </span>
      ) : (
        // 누르면 카드의 onClick 으로 올라간다
        <button type="button" class="game-card__cta">
          <span class="game-card__key" aria-hidden="true">
            {hotkey}
          </span>
          이쪽이 더 세다
        </button>
      )}
    </div>
  );
}

/** @param {{ pool: any[] }} props */
function VsGame({ pool }) {
  const used = useRef(/** @type {Set<string>} */ (new Set()));
  // 고르는 순간 다음 짝을 미리 뽑아 장비창을 읽어 둔다
  const upcoming = useRef(/** @type {{ level: number, pair: any[] } | null} */ (null));
  const [pair, setPair] = useState(/** @type {any[] | null} */ (null));
  const [picked, setPicked] = useState(/** @type {number | null} */ (null));
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => readBest(VS_KEY));
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [over, setOver] = useState(false);
  const [hints, setHints] = useState(HINTS);
  const [hinted, setHinted] = useState(false);
  const gear = useGear(pair ? [pair[0].id, pair[1].id] : []);

  const draw = (/** @type {number} */ level) => {
    let chosen = pickPair(pool, used.current, level);
    if (!chosen) {
      // 다 나왔으면 처음부터 다시 섞는다
      used.current = new Set();
      chosen = pickPair(pool, used.current, level);
    }
    if (chosen) chosen.forEach((entry) => used.current.add(keyOf(entry)));
    return chosen;
  };

  const show = (/** @type {number} */ level) => {
    const chosen = upcoming.current?.level === level ? upcoming.current.pair : draw(level);
    upcoming.current = null;
    setPair(chosen);
    setPicked(null);
    setHinted(false);
  };

  useEffect(() => {
    if (!pair) show(0);
  }, []);

  const choose = (/** @type {number} */ index) => {
    if (!pair || picked !== null) return;
    setPicked(index);
    const win = pair[index].power >= pair[1 - index].power;
    const nextStreak = win ? streak + 1 : 0;
    setScore((prev) => ({ right: prev.right + (win ? 1 : 0), total: prev.total + 1 }));
    if (win) {
      setStreak(nextStreak);
      if (nextStreak > best) {
        setBest(nextStreak);
        writeBest(VS_KEY, nextStreak);
      }
    } else {
      setOver(true);
    }
    const following = draw(nextStreak);
    if (following) {
      upcoming.current = { level: nextStreak, pair: following };
      loadGear(following.map((entry) => entry.id)).catch(() => {});
    }
  };

  const restart = () => {
    setStreak(0);
    setOver(false);
    setHints(HINTS);
    show(0);
  };

  const takeHint = () => {
    if (hints <= 0 || hinted || picked !== null) return;
    setHints(hints - 1);
    setHinted(true);
  };

  // 키보드: ←/1 왼쪽, →/2 오른쪽, Enter·Space 다음
  useEffect(() => {
    const onKey = (/** @type {KeyboardEvent} */ event) => {
      if (typingTarget(event.target)) return;
      if (picked === null && (event.key === "ArrowLeft" || event.key === "1")) choose(0);
      else if (picked === null && (event.key === "ArrowRight" || event.key === "2")) choose(1);
      else if (picked !== null && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        if (over) restart();
        else show(streak);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const share = async () => {
    const ok = await copyText(`메이플M 플러스 '누가 더 셀까?' 장비창만 보고 연속 ${streak}번 맞혔어요! (최고 ${best}번)\nhttps://maplem.co.kr/game`);
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
    <>
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
      {pair ? (
        <>
          <div class={`game-arena${revealed ? " is-revealed" : ""}`} key={`${keyOf(pair[0])}-${keyOf(pair[1])}`}>
            {[0, 1].map((index) => [
              index === 1 ? (
                <span key="vs" class="game-vs display" aria-hidden="true">
                  VS
                </span>
              ) : null,
              <Fighter
                key={index}
                entry={pair[index]}
                gear={gear.gear?.[index]}
                gearFailed={gear.failed}
                onRetry={gear.retry}
                revealed={revealed}
                result={winner === index ? "win" : "lose"}
                picked={picked === index}
                hinted={hinted}
                onPick={() => choose(index)}
                hotkey={String(index + 1)}
              />
            ])}
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
                  <button type="button" class="btn btn--primary" onClick={() => show(streak)}>
                    다음 문제
                    <Icon name="arrowRight" size={18} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div class="game-tools">
              <button type="button" class="btn btn--secondary btn--sm" disabled={!hints || hinted} onClick={takeHint}>
                <Icon name="sparkle" size={16} />
                템환산 힌트
                <span class="num">
                  {hints}/{HINTS}
                </span>
              </button>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}

// ---------------- 전투력 맞히기 ----------------

/**
 * 1천만 ~ 최고 전투력을 한 줄에 놓고(로그 눈금) 내 답과 정답을 찍는다.
 * @param {{ range: { min: number, max: number }, guess: number, actual: number }} props
 */
function GuessLine({ range, guess, actual }) {
  const at = (/** @type {number} */ value) => `${Math.min(100, Math.max(0, ((Math.log10(value) - range.min) / (range.max - range.min)) * 100))}%`;
  const [left, right] = [at(Math.min(guess, actual)), at(Math.max(guess, actual))];
  return (
    <div class="game-line" aria-hidden="true">
      <span class="game-line__track" />
      <span class="game-line__gap" style={{ left, width: `calc(${right} - ${left})` }} />
      <span class="game-line__pin is-guess" style={{ left: at(guess) }}>
        <span>내 답</span>
      </span>
      <span class="game-line__pin is-actual" style={{ left: at(actual) }}>
        <span>정답</span>
      </span>
    </div>
  );
}

/** @param {{ pool: any[] }} props */
function GuessGame({ pool }) {
  const range = useMemo(() => sliderRange(pool), [pool]);
  const used = useRef(/** @type {Set<string>} */ (new Set()));
  const upcoming = useRef(/** @type {any} */ (null));
  const [entry, setEntry] = useState(/** @type {any} */ (null));
  const [value, setValue] = useState(range.start);
  const [rounds, setRounds] = useState(/** @type {Array<{ entry: any, guess: number, points: number }>} */ ([]));
  const [submitted, setSubmitted] = useState(false);
  const [best, setBest] = useState(() => readBest(GUESS_KEY));
  const gear = useGear(entry ? [entry.id] : []);

  const draw = () => {
    let chosen = pickOne(pool, used.current);
    if (!chosen) {
      used.current = new Set();
      chosen = pickOne(pool, used.current);
    }
    if (chosen) used.current.add(keyOf(chosen));
    return chosen;
  };

  const showNext = () => {
    const chosen = upcoming.current || draw();
    upcoming.current = null;
    setEntry(chosen);
    setSubmitted(false);
    setValue(range.start);
  };

  useEffect(() => {
    if (!entry) showNext();
  }, []);

  const guess = roundPower(10 ** value);
  const total = rounds.reduce((sum, round) => sum + round.points, 0);
  const finished = submitted && rounds.length >= GUESS_ROUNDS;
  const last = submitted ? rounds[rounds.length - 1] : null;

  const submit = () => {
    if (!entry || submitted) return;
    const next = [...rounds, { entry, guess, points: guessPoints(guess, entry.power) }];
    setRounds(next);
    setSubmitted(true);
    if (next.length >= GUESS_ROUNDS) {
      const sum = next.reduce((acc, round) => acc + round.points, 0);
      if (sum > best) {
        setBest(sum);
        writeBest(GUESS_KEY, sum);
      }
    } else {
      upcoming.current = draw();
      if (upcoming.current) loadGear([upcoming.current.id]).catch(() => {});
    }
  };

  const restart = () => {
    setRounds([]);
    showNext();
  };

  const nudge = (/** @type {number} */ step) => setValue((prev) => Math.min(range.max, Math.max(range.min, Math.round((prev + step) * 1000) / 1000)));

  // 키보드: Enter 로 확정·다음(슬라이더는 ←/→ 로 움직인다)
  useEffect(() => {
    const onKey = (/** @type {KeyboardEvent} */ event) => {
      if (event.key !== "Enter" || typingTarget(event.target)) return;
      if (event.target instanceof HTMLElement && /^(BUTTON|A)$/.test(event.target.tagName)) return;
      event.preventDefault();
      if (!submitted) submit();
      else if (finished) restart();
      else showNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const share = async () => {
    const ok = await copyText(`메이플M 플러스 '전투력 맞히기' ${formatComma(total)}점 / ${formatComma(GUESS_ROUNDS * 1000)}점 · ${guessTitle(total)}\nhttps://maplem.co.kr/game?mode=guess`);
    toast(ok ? "결과를 복사했어요" : "복사하지 못했어요", ok ? "success" : "error");
  };

  const resultRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  useEffect(() => {
    if (submitted) requestAnimationFrame(() => resultRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, [submitted]);

  if (!entry) return null;
  const off = last ? last.guess / last.entry.power - 1 : 0;

  return (
    <>
      <div class="game-score card" role="status" aria-live="polite">
        <span>
          문제{" "}
          <strong class="num">
            {Math.min(GUESS_ROUNDS, rounds.length + (submitted ? 0 : 1))}/{GUESS_ROUNDS}
          </strong>
        </span>
        <span>
          점수 <strong class="num">{formatComma(total)}</strong>
        </span>
        <span>
          최고 <strong class="num">{formatComma(best)}</strong>
        </span>
      </div>

      <div class={`game-card game-solo${submitted ? " is-revealed" : ""}`} key={keyOf(entry)}>
        <Who entry={entry} />
        <GearWindow gear={gear.gear?.[0]} failed={gear.failed} onRetry={gear.retry} />
        {submitted ? <SpecLine entry={entry} full /> : null}
      </div>

      {!submitted ? (
        <div class="game-guess card">
          <label class="game-guess__label" for="game-guess-range">
            이 캐릭터의 전투력은?
          </label>
          <output class="game-guess__value display num" for="game-guess-range">
            {formatKoreanUnits(guess, { maxGroups: 2 })}
          </output>
          <div class="game-guess__slider">
            <button type="button" class="icon-btn" aria-label="조금 낮게" onClick={() => nudge(-0.01)}>
              <Icon name="minus" size={18} />
            </button>
            <input
              id="game-guess-range"
              class="game-range"
              type="range"
              min={range.min}
              max={range.max}
              step={0.001}
              value={value}
              aria-valuetext={formatKoreanUnits(guess, { maxGroups: 2 })}
              onInput={(event) => setValue(Number(/** @type {HTMLInputElement} */ (event.currentTarget).value))}
            />
            <button type="button" class="icon-btn" aria-label="조금 높게" onClick={() => nudge(0.01)}>
              <Icon name="plus" size={18} />
            </button>
          </div>
          <div class="game-guess__ticks num" aria-hidden="true">
            <span>{power(10 ** range.min)}</span>
            <span>{power(10 ** range.max)}</span>
          </div>
          <button type="button" class="btn btn--primary game-guess__submit" onClick={submit}>
            <Icon name="check" size={18} />이 전투력으로 결정
          </button>
        </div>
      ) : (
        <div class="game-guess card is-revealed" ref={resultRef}>
          <div class="game-guess__answer">
            <span class="game-guess__label">정답</span>
            <strong class="game-guess__value display num">
              <CountUp value={last.entry.power} format={power} duration={900} />
            </strong>
            <NameLink entry={last.entry} />
          </div>
          <GuessLine range={range} guess={last.guess} actual={last.entry.power} />
          <p class="game-guess__mine num">
            내 답 {formatKoreanUnits(last.guess, { maxGroups: 2 })} ·{" "}
            {Math.abs(off) < 0.005 ? "거의 정확!" : `${formatDecimal(Math.abs(off) * 100, Math.abs(off) < 0.1 ? 1 : 0)}% ${off > 0 ? "높게" : "낮게"}`}
            <strong class="game-guess__points">+{formatComma(last.points)}점</strong>
          </p>
          {!finished ? (
            <button type="button" class="btn btn--primary game-guess__submit" onClick={showNext}>
              다음 문제
              <Icon name="arrowRight" size={18} />
            </button>
          ) : null}
        </div>
      )}

      {finished ? (
        <section class="game-summary card" aria-label="결과">
          <div class="game-summary__head">
            <span class="game-summary__title display">{guessTitle(total)}</span>
            <strong class="game-summary__total display num">
              <CountUp value={total} format={formatComma} duration={900} />
              <small>/ {formatComma(GUESS_ROUNDS * 1000)}점</small>
            </strong>
          </div>
          <ol class="game-summary__list">
            {rounds.map((round) => (
              <li key={keyOf(round.entry)}>
                <span class="game-summary__who">
                  {round.entry.className} <span class="num">Lv.{round.entry.level}</span>
                </span>
                <span class="game-summary__nums num">
                  {power(round.entry.power)} <span>내 답 {power(round.guess)}</span>
                </span>
                <strong class="num">+{formatComma(round.points)}</strong>
              </li>
            ))}
          </ol>
          <div class="game-result__actions">
            <button type="button" class="btn btn--secondary" onClick={share}>
              <Icon name="share" size={18} />
              결과 복사
            </button>
            <button type="button" class="btn btn--primary" onClick={restart}>
              <Icon name="refresh" size={18} />
              다시 하기
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}

export function Game() {
  const [mode, setMode] = useState(readMode);
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", pool?: any[], error?: any }} */ ({ status: "loading" }));
  const [attempt, setAttempt] = useState(0);

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

  const changeMode = (/** @type {string} */ next) => {
    setMode(next === "guess" ? "guess" : "vs");
    window.history.replaceState(null, "", next === "guess" ? `${urls.game}?mode=guess` : urls.game);
  };

  return (
    <div class="game">
      <header class="page-head page-head--rank tone-gold">
        <Aurora tone="dusk" />
        <span class="page-head__icon" aria-hidden="true">
          <Icon name="swords" size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText text="미니게임" />
        </h1>
      </header>

      <Segmented name="game-mode" legend="게임 고르기" value={mode} onChange={changeMode} options={MODES} class="game-modes" />

      {state.status === "loading" ? <Skeleton height={420} radius={20} /> : null}
      {state.status === "error" ? <ErrorState title="불러오지 못했어요" description={state.error?.message} onRetry={() => setAttempt((n) => n + 1)} /> : null}
      {state.status === "ready" ? mode === "guess" ? <GuessGame key="guess" pool={state.pool || []} /> : <VsGame key="vs" pool={state.pool || []} /> : null}
    </div>
  );
}
