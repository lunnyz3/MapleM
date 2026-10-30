// 등급 순서 기억: 레어·에픽·유니크·레전더리 판이 차례로 빛나면 같은 순서로 누른다. 맞히면 한 칸 더 길게, 틀리면 끝.
// 단계가 오를수록 빨리 보여 준다. 키보드 1~4.
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { extendSequence, simonStep } from "../../lib/miniGames.mjs";
import { GameOver, ScoreBar, readBest, saveBest, shareResult, useRunToken, useWindowKey } from "./shared.jsx";

const KEY = "mmp.game.simon";
const PADS = [
  { key: "rare", label: "레어", icon: "/assets/ico-potential-rare.png" },
  { key: "epic", label: "에픽", icon: "/assets/ico-potential-epic.png" },
  { key: "unique", label: "유니크", icon: "/assets/ico-potential-unique.png" },
  { key: "legendary", label: "레전더리", icon: "/assets/ico-potential-legendary.png" }
];

export function Simon() {
  // ready: 시작 전 · show: 보여 주는 중 · input: 따라 누르기 · over: 틀림
  const [phase, setPhase] = useState(/** @type {"ready" | "show" | "input" | "over"} */ ("ready"));
  const [sequence, setSequence] = useState(/** @type {number[]} */ ([]));
  const [lit, setLit] = useState(-1);
  const [step, setStep] = useState(0);
  const [wrong, setWrong] = useState(-1);
  const [best, setBest] = useState(() => readBest(KEY));
  const [newBest, setNewBest] = useState(false);
  const timers = useRef(/** @type {number[]} */ ([]));
  const run = useRunToken("simon");

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const play = (/** @type {number[]} */ list) => {
    clearTimers();
    setPhase("show");
    setStep(0);
    const gap = simonStep(list.length);
    list.forEach((pad, index) => {
      timers.current.push(window.setTimeout(() => setLit(pad), 500 + index * gap));
      timers.current.push(window.setTimeout(() => setLit(-1), 500 + index * gap + gap * 0.62));
    });
    timers.current.push(window.setTimeout(() => setPhase("input"), 500 + list.length * gap));
  };

  const start = () => {
    run.renew();
    setWrong(-1);
    setNewBest(false);
    const first = extendSequence([]);
    setSequence(first);
    play(first);
  };

  // 다 맞힌 단계 수
  const level = phase === "over" ? Math.max(0, sequence.length - 1) : sequence.length;

  const press = (/** @type {number} */ pad) => {
    if (phase !== "input") return;
    setLit(pad);
    timers.current.push(window.setTimeout(() => setLit((current) => (current === pad ? -1 : current)), 180));
    if (sequence[step] !== pad) {
      clearTimers();
      setWrong(pad);
      setPhase("over");
      const reached = sequence.length - 1;
      if (reached > 0 && saveBest(KEY, reached)) {
        setBest(reached);
        setNewBest(true);
      }
      return;
    }
    if (step + 1 < sequence.length) return setStep(step + 1);
    const next = extendSequence(sequence);
    setSequence(next);
    setPhase("show");
    timers.current.push(window.setTimeout(() => play(next), 450));
  };

  useWindowKey((event) => {
    if (!/^[1-4]$/.test(event.key) || (event.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName))) return;
    press(Number(event.key) - 1);
  });

  return (
    <>
      <ScoreBar
        items={[
          ["단계", level],
          ["최고", best ? `${best}단계` : "-"]
        ]}
      />
      <div class={`arc-simon card is-${phase}`}>
        <p class="arc-simon__state" aria-live="polite">
          {phase === "ready" ? "빛나는 순서를 기억했다가 그대로 누르기" : phase === "show" ? "잘 보세요…" : phase === "input" ? `따라 누르기 ${step + 1}/${sequence.length}` : "틀렸어요!"}
        </p>
        <div class="arc-simon__pads">
          {PADS.map((pad, index) => (
            <button
              key={pad.key}
              type="button"
              class={`arc-simon__pad is-${pad.key}${lit === index ? " is-lit" : ""}${wrong === index ? " is-wrong" : ""}`}
              aria-label={`${index + 1} ${pad.label}`}
              disabled={phase !== "input"}
              onPointerDown={(event) => {
                if (event.button === 0) press(index);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  press(index);
                }
              }}
            >
              <img src={pad.icon} alt="" width={56} height={56} draggable={false} />
              <span>{pad.label}</span>
            </button>
          ))}
        </div>
        {phase === "ready" ? (
          <button type="button" class="btn btn--primary arc-simon__start" onClick={start}>
            <Icon name="sparkle" size={18} />
            시작
          </button>
        ) : null}
      </div>
      {phase === "over" ? (
        <GameOver
          title={level >= 15 ? "기억의 신" : level >= 9 ? "기억력 좋음" : "다시 도전!"}
          value={`${level}단계`}
          isBest={newBest}
          onShare={() => shareResult(`메이플M 플러스 '등급 순서 기억' ${level}단계까지 기억했어요!`)}
          onRetry={start}
          game="simon"
          score={level}
          token={run.token}
        />
      ) : null}
    </>
  );
}
