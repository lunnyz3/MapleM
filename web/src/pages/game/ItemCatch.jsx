// 아이템 줍기: 30초 동안 위에서 떨어지는 장비를 눌러 줍는다. 등급마다 점수가 다르고(레전더리 50 …),
// 놓치지 않고 이어 주우면 점수가 1.5배·2배. 시간이 갈수록 더 자주, 더 빨리 떨어진다.
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { ErrorState } from "../../components/States.jsx";
import { Skeleton } from "../../components/Skeleton.jsx";
import { formatComma } from "../../lib/format.js";
import { CATCH_SECONDS, catchPoints, comboRate, fallSpeed, shuffled, spawnGap } from "../../lib/miniGames.mjs";
import { GameOver, ItemTile, ScoreBar, readBest, saveBest, shareResult, useGameItems, useRunToken } from "./shared.jsx";

const KEY = "mmp.game.catch";
const DROP_SIZE = 56;

export function ItemCatch() {
  const items = useGameItems();
  const [phase, setPhase] = useState(/** @type {"ready" | "playing" | "done"} */ ("ready"));
  const [drops, setDrops] = useState(/** @type {Array<{ id: number, item: any, x: number }>} */ ([]));
  const [pops, setPops] = useState(/** @type {Array<{ id: number, x: number, y: number, text: string }>} */ ([]));
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [stats, setStats] = useState({ caught: 0, missed: 0, bestCombo: 0 });
  const [left, setLeft] = useState(CATCH_SECONDS);
  const [best, setBest] = useState(() => readBest(KEY));
  const [newBest, setNewBest] = useState(false);
  const field = useRef(/** @type {HTMLDivElement | null} */ (null));
  const runToken = useRunToken("catch");
  // 떨어지는 장비의 자리: 그릴 때마다 상태를 바꾸지 않고 요소를 직접 옮긴다
  const live = useRef(/** @type {Map<number, { born: number, speed: number, el: HTMLElement | null }>} */ (new Map()));
  const run = useRef({ startAt: 0, nextId: 1, frame: 0, spawn: 0, deck: /** @type {any[]} */ ([]), combo: 0, score: 0, left: CATCH_SECONDS });

  const stopLoops = () => {
    cancelAnimationFrame(run.current.frame);
    window.clearTimeout(run.current.spawn);
  };
  useEffect(() => stopLoops, []);

  const nextItem = () => {
    const state = run.current;
    if (!state.deck.length) state.deck = shuffled(items.items);
    return state.deck.pop();
  };

  const finish = () => {
    stopLoops();
    live.current.clear();
    setDrops([]);
    setPhase("done");
    if (saveBest(KEY, run.current.score)) {
      setBest(run.current.score);
      setNewBest(true);
    }
  };

  const spawn = () => {
    const state = run.current;
    const elapsed = (performance.now() - state.startAt) / 1000;
    if (elapsed >= CATCH_SECONDS) return;
    const item = nextItem();
    if (item) {
      const id = state.nextId++;
      live.current.set(id, { born: performance.now(), speed: fallSpeed(elapsed), el: null });
      setDrops((list) => [...list, { id, item, x: 4 + Math.random() * 82 }]);
    }
    state.spawn = window.setTimeout(spawn, spawnGap(elapsed));
  };

  const miss = (/** @type {number} */ id) => {
    live.current.delete(id);
    setDrops((list) => list.filter((drop) => drop.id !== id));
    run.current.combo = 0;
    setCombo(0);
    setStats((prev) => ({ ...prev, missed: prev.missed + 1 }));
  };

  const loop = (/** @type {number} */ now) => {
    const state = run.current;
    const elapsed = (now - state.startAt) / 1000;
    const height = field.current?.clientHeight || 400;
    for (const [id, drop] of live.current) {
      const y = ((now - drop.born) / 1000) * drop.speed;
      if (y >= 1) {
        miss(id);
        continue;
      }
      if (drop.el) drop.el.style.transform = `translate3d(0, ${Math.round(y * (height + DROP_SIZE))}px, 0)`;
    }
    // 남은 초가 바뀔 때만 다시 그린다
    const seconds = Math.max(0, Math.ceil(CATCH_SECONDS - elapsed));
    if (seconds !== state.left) {
      state.left = seconds;
      setLeft(seconds);
    }
    if (elapsed >= CATCH_SECONDS) return finish();
    state.frame = requestAnimationFrame(loop);
  };

  const start = () => {
    runToken.renew();
    stopLoops();
    live.current.clear();
    run.current = { startAt: performance.now(), nextId: 1, frame: 0, spawn: 0, deck: shuffled(items.items), combo: 0, score: 0, left: CATCH_SECONDS };
    setDrops([]);
    setPops([]);
    setScore(0);
    setCombo(0);
    setStats({ caught: 0, missed: 0, bestCombo: 0 });
    setLeft(CATCH_SECONDS);
    setNewBest(false);
    setPhase("playing");
    spawn();
    run.current.frame = requestAnimationFrame(loop);
  };

  const grab = (/** @type {{ id: number, item: any, x: number }} */ drop, /** @type {PointerEvent} */ event) => {
    const state = run.current;
    if (!live.current.has(drop.id)) return;
    live.current.delete(drop.id);
    state.combo += 1;
    const gained = Math.round(catchPoints(drop.item.grade) * comboRate(state.combo));
    state.score += gained;
    setScore(state.score);
    setCombo(state.combo);
    setStats((prev) => ({ caught: prev.caught + 1, missed: prev.missed, bestCombo: Math.max(prev.bestCombo, state.combo) }));
    setDrops((list) => list.filter((entry) => entry.id !== drop.id));
    const box = field.current?.getBoundingClientRect();
    if (box) {
      const pop = { id: drop.id, x: event.clientX - box.left, y: event.clientY - box.top, text: `+${gained}` };
      setPops((list) => [...list.slice(-6), pop]);
      window.setTimeout(() => setPops((list) => list.filter((entry) => entry.id !== pop.id)), 700);
    }
  };

  if (items.status === "error") return <ErrorState title="장비를 불러오지 못했어요" description={items.error?.message} onRetry={items.retry} />;
  if (items.status !== "ready") return <Skeleton height={420} radius={20} />;

  return (
    <>
      <ScoreBar
        items={[
          ["시간", `${left}초`],
          ["점수", formatComma(score)],
          ["연속", combo >= 8 ? `${combo} ×${comboRate(combo)}` : combo],
          ["최고", best ? formatComma(best) : "-"]
        ]}
      />
      <div ref={field} class={`arc-catch card is-${phase}`}>
        {drops.map((drop) => (
          <button
            key={drop.id}
            type="button"
            class="arc-catch__drop"
            style={{ left: `${drop.x}%` }}
            ref={(el) => {
              const entry = live.current.get(drop.id);
              if (entry) entry.el = el;
            }}
            aria-label={`${drop.item.name} 줍기`}
            onPointerDown={(event) => grab(drop, event)}
          >
            <ItemTile item={drop.item} size={40} />
          </button>
        ))}
        {pops.map((pop) => (
          <span key={pop.id} class="arc-catch__pop num" style={{ left: `${pop.x}px`, top: `${pop.y}px` }} aria-hidden="true">
            {pop.text}
          </span>
        ))}
        {phase === "ready" ? (
          <div class="arc-catch__start">
            <div class="arc-catch__legend" aria-label="등급별 점수">
              <span class="is-legendary">레전더리 50</span>
              <span class="is-unique">유니크 30</span>
              <span class="is-epic">에픽 20</span>
              <span class="is-rare">레어 10</span>
            </div>
            <button type="button" class="btn btn--primary" onClick={start}>
              <Icon name="download" size={18} />
              시작
            </button>
          </div>
        ) : null}
      </div>
      {phase === "done" ? (
        <GameOver
          title={score >= 3000 ? "줍기의 달인" : score >= 1800 ? "손이 빨라요" : score >= 800 ? "제법인데요" : "다시 도전!"}
          value={`${formatComma(score)}점`}
          lines={[`주운 장비 ${stats.caught}개`, `놓친 장비 ${stats.missed}개`, `최대 연속 ${stats.bestCombo}`]}
          isBest={newBest}
          onShare={() => shareResult(`메이플M 플러스 '아이템 줍기' 30초 동안 ${formatComma(score)}점!`)}
          onRetry={start}
          game="catch"
          score={score}
          token={runToken.token}
        />
      ) : null}
    </>
  );
}
