// 레전더리 반응속도: 잠재 등급이 레어·에픽·유니크로 바뀌다가 레전더리가 뜨는 순간 누른다. 먼저 누르면 실수.
// 다섯 번의 평균(실수는 빼고), 세 번 이상 잰 판만 최고 기록(낮을수록 좋다).
import { useEffect, useRef, useState } from "preact/hooks";
import { formatComma } from "../../lib/format.js";
import { REACTION_TRIES, averageMs, decoyGrade, reactionDelay, reactionTitle } from "../../lib/miniGames.mjs";
import { GameOver, ScoreBar, readBest, saveBest, shareResult, useRunToken } from "./shared.jsx";

const KEY = "mmp.game.reaction";
const GRADES = {
  rare: { label: "레어", icon: "/assets/ico-potential-rare.png" },
  epic: { label: "에픽", icon: "/assets/ico-potential-epic.png" },
  unique: { label: "유니크", icon: "/assets/ico-potential-unique.png" },
  legendary: { label: "레전더리", icon: "/assets/ico-potential-legendary.png" }
};
const FLIP_MS = 420;

export function Reaction() {
  // idle: 시작 전 · waiting: 등급이 바뀌는 중 · go: 레전더리 · shown: 한 번 잰 뒤 · early: 먼저 누름 · done: 다섯 번 끝
  const [phase, setPhase] = useState(/** @type {"idle" | "waiting" | "go" | "shown" | "early" | "done"} */ ("idle"));
  const [grade, setGrade] = useState("rare");
  const [times, setTimes] = useState(/** @type {Array<number | null>} */ ([]));
  const [best, setBest] = useState(() => readBest(KEY));
  const [newBest, setNewBest] = useState(false);
  const goAt = useRef(0);
  const run = useRunToken("reaction");
  const stops = useRef(/** @type {Array<() => void>} */ ([]));

  const clearTimers = () => {
    stops.current.forEach((stop) => stop());
    stops.current = [];
  };
  useEffect(() => clearTimers, []);

  const startTry = () => {
    clearTimers();
    let current = "rare";
    setGrade(current);
    setPhase("waiting");
    const flip = window.setInterval(() => {
      current = decoyGrade(current);
      setGrade(current);
    }, FLIP_MS);
    const go = window.setTimeout(() => {
      window.clearInterval(flip);
      setGrade("legendary");
      goAt.current = performance.now();
      setPhase("go");
    }, reactionDelay());
    stops.current = [() => window.clearInterval(flip), () => window.clearTimeout(go)];
  };

  const record = (/** @type {number | null} */ value) => {
    const next = [...times, value];
    setTimes(next);
    if (next.length < REACTION_TRIES) return setPhase(value === null ? "early" : "shown");
    setPhase("done");
    const valid = next.filter((time) => time !== null);
    const average = averageMs(valid);
    if (valid.length >= 3 && saveBest(KEY, average, true)) {
      setBest(average);
      setNewBest(true);
    }
  };

  const tap = () => {
    if (phase === "waiting") {
      clearTimers();
      record(null);
    } else if (phase === "go") {
      record(Math.round(performance.now() - goAt.current));
    } else if (phase !== "done") {
      if (!times.length) run.renew();
      startTry();
    }
  };

  const restart = () => {
    clearTimers();
    setTimes([]);
    setNewBest(false);
    setPhase("idle");
  };

  const valid = times.filter((time) => time !== null);
  const average = averageMs(/** @type {number[]} */ (valid));
  const misses = times.length - valid.length;
  const last = times[times.length - 1];
  const shownGrade = phase === "idle" || phase === "done" ? "legendary" : grade;

  const message =
    phase === "idle"
      ? "눌러서 시작"
      : phase === "waiting"
        ? "레전더리를 기다려요…"
        : phase === "go"
          ? "지금!"
          : phase === "early"
            ? "너무 빨라요! 눌러서 다음"
            : phase === "shown"
              ? "눌러서 다음"
              : "끝!";

  return (
    <>
      <ScoreBar
        items={[
          ["시도", `${Math.min(times.length + (phase === "waiting" || phase === "go" ? 1 : 0), REACTION_TRIES)}/${REACTION_TRIES}`],
          ["평균", average ? `${formatComma(average)}ms` : "-"],
          ["최고", best ? `${formatComma(best)}ms` : "-"]
        ]}
      />
      <button
        type="button"
        class={`arc-react is-${phase}`}
        onPointerDown={(event) => {
          if (event.button === 0) tap();
        }}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            if (!event.repeat) tap();
          }
        }}
        disabled={phase === "done"}
        aria-label={`${message}. ${GRADES[shownGrade].label}`}
      >
        <span class={`arc-react__cube is-${shownGrade}`} key={phase === "waiting" ? grade : phase}>
          <img src={GRADES[shownGrade].icon} alt="" width={96} height={96} draggable={false} />
        </span>
        <span class="arc-react__grade">{GRADES[shownGrade].label}</span>
        <strong class="arc-react__message display">
          {phase === "shown" && last ? `${formatComma(last)}ms` : message}
        </strong>
        {phase === "shown" ? <span class="arc-react__hint">눌러서 다음</span> : null}
      </button>
      <ol class="arc-react__tries" aria-label="잰 기록">
        {Array.from({ length: REACTION_TRIES }, (_, index) => {
          const time = times[index];
          return (
            <li key={index} class={time === null ? "is-miss" : time ? "is-done" : ""}>
              {time === null ? "실수" : time ? `${formatComma(time)}` : index + 1}
            </li>
          );
        })}
      </ol>
      {phase === "done" ? (
        <GameOver
          title={valid.length >= 3 ? reactionTitle(average) : "다시 해 볼까요?"}
          value={average ? `${formatComma(average)}ms` : "기록 없음"}
          lines={[valid.length ? `가장 빠름 ${formatComma(Math.min(.../** @type {number[]} */ (valid)))}ms` : "", misses ? `먼저 누름 ${misses}번` : ""].filter(Boolean)}
          isBest={newBest}
          onShare={() => shareResult(`메이플M 플러스 '레전더리 반응속도' 평균 ${formatComma(average)}ms · ${reactionTitle(average)}`)}
          onRetry={restart}
          game="reaction"
          score={valid.length >= 3 ? average : null}
          token={run.token}
        />
      ) : null}
    </>
  );
}
