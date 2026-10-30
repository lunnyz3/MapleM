// 장비 합성(2048): 같은 단계 둘을 밀어 붙이면 한 단계 위(노말 → 레어 → … → 레전더리 → ★5 → … → ★35).
// 방향키·밀기(터치)로 움직이고, 더 밀 수 없으면 끝. 점수는 합칠 때마다 2^(새 단계).
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { formatComma } from "../../lib/format.js";
import { MERGE_GOAL, MERGE_LEVELS, canMove, emptyBoard, moveBoard, spawnTile } from "../../lib/miniGames.mjs";
import { GameOver, ScoreBar, readBest, saveBest, shareResult, useRunToken, useWindowKey } from "./shared.jsx";

const KEY = "mmp.game.merge";
const GRADE_ICON = {
  rare: "/assets/ico-potential-rare.png",
  epic: "/assets/ico-potential-epic.png",
  unique: "/assets/ico-potential-unique.png",
  legendary: "/assets/ico-potential-legendary.png"
};
const KEYS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", a: "left", d: "right", w: "up", s: "down" };

/** @param {{ level: number }} props */
function Tile({ level }) {
  const info = MERGE_LEVELS[level];
  if (!info) return <span class="arc-merge__cell" />;
  return (
    <span class={`arc-merge__cell arc-merge__tile is-l${level}${info.grade ? ` is-${info.grade}` : ""}`} key={level}>
      {GRADE_ICON[info.grade] ? <img src={GRADE_ICON[info.grade]} alt="" width={28} height={28} draggable={false} /> : null}
      {info.star ? <span class="arc-merge__star display num">★{info.star}</span> : null}
      <span class="arc-merge__label">{info.star ? "" : info.label}</span>
    </span>
  );
}

export function Merge() {
  const [board, setBoard] = useState(() => emptyBoard());
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [best, setBest] = useState(() => readBest(KEY));
  const [newBest, setNewBest] = useState(false);
  const run = useRunToken("merge");
  const swipe = useRef(/** @type {{ x: number, y: number } | null} */ (null));
  useEffect(() => {
    run.renew();
  }, []);

  const top = Math.max(...board.flat());

  const go = (/** @type {"left" | "right" | "up" | "down"} */ dir) => {
    if (over) return;
    const result = moveBoard(board, dir);
    if (!result.moved) return;
    const next = spawnTile(result.board);
    const total = score + result.gained;
    setBoard(next);
    setScore(total);
    if (!canMove(next)) {
      setOver(true);
      if (saveBest(KEY, total)) {
        setBest(total);
        setNewBest(true);
      }
    }
  };

  const restart = () => {
    run.renew();
    setBoard(emptyBoard());
    setScore(0);
    setOver(false);
    setNewBest(false);
  };

  useWindowKey((event) => {
    const dir = KEYS[event.key];
    if (!dir || (event.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName))) return;
    event.preventDefault();
    go(/** @type {any} */ (dir));
  });

  return (
    <>
      <ScoreBar
        items={[
          ["점수", formatComma(score)],
          ["최고 단계", MERGE_LEVELS[top]?.label || "-"],
          ["최고", best ? formatComma(best) : "-"]
        ]}
      />
      <div
        class={`arc-merge card${over ? " is-over" : ""}`}
        onPointerDown={(event) => {
          swipe.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
          go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
        }}
      >
        <div class="arc-merge__grid" role="group" aria-label={`합성 판, 최고 ${MERGE_LEVELS[top]?.label || ""}`}>
          {board.flat().map((level, index) => (
            <Tile key={`${index}-${level}`} level={level} />
          ))}
        </div>
        <div class="arc-merge__pad" aria-label="밀기 단추">
          {[
            ["up", "위로"],
            ["left", "왼쪽으로"],
            ["down", "아래로"],
            ["right", "오른쪽으로"]
          ].map(([dir, label]) => (
            <button key={dir} type="button" class={`icon-btn arc-merge__dir is-${dir}`} aria-label={label} onClick={() => go(/** @type {any} */ (dir))}>
              <Icon name="chevronRight" size={20} />
            </button>
          ))}
        </div>
      </div>
      {over ? (
        <GameOver
          title={top >= MERGE_GOAL ? "★35 완성!" : top >= 9 ? "합성 장인" : top >= 6 ? "스타포스 입문" : "다시 도전!"}
          value={`${formatComma(score)}점`}
          lines={[`최고 단계 ${MERGE_LEVELS[top]?.label || "-"}`]}
          isBest={newBest}
          onShare={() => shareResult(`메이플M 플러스 '장비 합성' ${formatComma(score)}점 · 최고 ${MERGE_LEVELS[top]?.label || ""}`)}
          onRetry={restart}
          game="merge"
          score={score}
          token={run.token}
        />
      ) : null}
    </>
  );
}
