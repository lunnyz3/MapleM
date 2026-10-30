// 스타캐치: 막대 위를 왕복하는 별을 초록 구간 안에서 멈추면 ★ 하나. 별이 오를수록 구간이 좁아지고 빨라진다.
// 놓치면 목숨 하나(세 개), ★35 가 끝. 강화하는 무기는 모은 장비에서 무작위.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { STAR_LIVES, STAR_MAX, inZone, pingPong, starStage, zoneStart } from "../../lib/miniGames.mjs";
import { GameOver, ItemTile, ScoreBar, readBest, saveBest, shareResult, useGameItems, useWindowKey } from "./shared.jsx";

const KEY = "mmp.game.star";

/** ★ 35개를 다섯 개씩 묶어 그린다. */
function StarRow({ star }) {
  return (
    <div class="arc-stars" role="img" aria-label={`${star}성`}>
      {Array.from({ length: STAR_MAX / 5 }, (_, group) => (
        <span key={group} class="arc-stars__group">
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} class={group * 5 + index < star ? "is-on" : ""}>
              ★
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

export function StarCatch() {
  const items = useGameItems();
  const weapon = useMemo(() => {
    const weapons = items.items.filter((item) => item.slot === "무기");
    const list = weapons.length ? weapons : items.items;
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }, [items.items]);
  // ready: 시작 전 · moving: 별이 움직임 · hit/miss: 판정 보여 주는 중 · over: 목숨 다 씀 · clear: ★35
  const [phase, setPhase] = useState(/** @type {"ready" | "moving" | "hit" | "miss" | "over" | "clear"} */ ("ready"));
  const [star, setStar] = useState(0);
  const [lives, setLives] = useState(STAR_LIVES);
  const [zone, setZone] = useState(() => ({ start: 0.4, width: starStage(0).width }));
  const [stopAt, setStopAt] = useState(0.5);
  const [best, setBest] = useState(() => readBest(KEY));
  const [newBest, setNewBest] = useState(false);
  const startAt = useRef(0);
  const speed = useRef(starStage(0).speed);
  const marker = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const nextRound = (/** @type {number} */ level) => {
    const stage = starStage(level);
    speed.current = stage.speed;
    setZone({ start: zoneStart(stage.width), width: stage.width });
    // 막대 위 아무 자리에서나 출발
    startAt.current = performance.now() - Math.random() * (2000 / stage.speed);
    setPhase("moving");
  };

  useEffect(() => {
    if (phase !== "moving") return undefined;
    let frame = 0;
    const loop = (/** @type {number} */ now) => {
      if (marker.current) marker.current.style.left = `${pingPong((now - startAt.current) / 1000, speed.current) * 100}%`;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, zone]);

  const finish = (/** @type {number} */ reached, /** @type {"over" | "clear"} */ result) => {
    setPhase(result);
    if (saveBest(KEY, reached)) {
      setBest(reached);
      setNewBest(true);
    }
  };

  const stop = () => {
    if (phase === "ready") return nextRound(star);
    if (phase !== "moving") return;
    const position = pingPong((performance.now() - startAt.current) / 1000, speed.current);
    setStopAt(position);
    if (marker.current) marker.current.style.left = `${position * 100}%`;
    if (inZone(position, zone.start, zone.width)) {
      const next = star + 1;
      setStar(next);
      setPhase("hit");
      if (next >= STAR_MAX) {
        timer.current = window.setTimeout(() => finish(next, "clear"), 500);
        return;
      }
      timer.current = window.setTimeout(() => nextRound(next), 520);
    } else {
      const left = lives - 1;
      setLives(left);
      setPhase("miss");
      timer.current = window.setTimeout(() => (left > 0 ? nextRound(star) : finish(star, "over")), 650);
    }
  };

  const restart = () => {
    window.clearTimeout(timer.current);
    setStar(0);
    setLives(STAR_LIVES);
    setNewBest(false);
    setZone({ start: 0.4, width: starStage(0).width });
    setPhase("ready");
  };

  // 키보드: Space·Enter 로 멈추기(글 입력 칸·다른 버튼 밖에서)
  useWindowKey((event) => {
    if (event.key !== " " && event.key !== "Enter") return;
    if (event.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(event.target.tagName) && !event.target.classList.contains("arc-star__stop")) return;
    if (phase === "over" || phase === "clear") return;
    event.preventDefault();
    if (!event.repeat) stop();
  });

  const ended = phase === "over" || phase === "clear";

  return (
    <>
      <ScoreBar
        items={[
          ["별", `★${star}`],
          ["목숨", "♥".repeat(lives) || "-"],
          ["최고", best ? `★${best}` : "-"]
        ]}
      />
      <div class={`arc-star card is-${phase}`}>
        <div class="arc-star__item">
          {weapon ? <ItemTile item={weapon} size={64} /> : <span class="arc-item" />}
          <span class="arc-star__name">{weapon?.name || "무기"}</span>
        </div>
        <StarRow star={star} />
        <div
          class="arc-star__bar"
          onPointerDown={(event) => {
            if (event.button === 0) stop();
          }}
        >
          <span class="arc-star__zone" style={{ left: `${zone.start * 100}%`, width: `${zone.width * 100}%` }} />
          <span ref={marker} class="arc-star__marker" style={phase === "moving" ? undefined : { left: `${stopAt * 100}%` }} aria-hidden="true">
            ★
          </span>
        </div>
        <p class="arc-star__result" aria-live="polite">
          {phase === "hit" ? `성공! ★${star}` : phase === "miss" ? "실패…" : phase === "ready" ? "별이 초록 칸에 왔을 때 멈추기" : " "}
        </p>
        {!ended ? (
          <button
            type="button"
            class="btn btn--primary arc-star__stop"
            onPointerDown={(event) => {
              if (event.button === 0) stop();
            }}
          >
            <Icon name="sparkle" size={18} />
            {phase === "ready" ? "시작" : "멈추기"}
          </button>
        ) : null}
      </div>
      {ended ? (
        <GameOver
          title={phase === "clear" ? "★35 달성!" : star >= 25 ? "강화의 신" : star >= 15 ? "손이 빠르네요" : "다시 도전!"}
          value={`★${star}`}
          isBest={newBest}
          onShare={() => shareResult(`메이플M 플러스 '스타캐치' ★${star}까지 올렸어요!`)}
          onRetry={restart}
        />
      ) : null}
    </>
  );
}
