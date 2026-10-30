// 짝 맞추기: 장비 아이콘 카드 16장(8짝)을 두 장씩 뒤집어 같은 장비를 찾는다. 뒤집은 횟수가 적을수록 좋은 기록.
import { useEffect, useState } from "preact/hooks";
import { BrandMark } from "../../components/Decor.jsx";
import { ErrorState } from "../../components/States.jsx";
import { Skeleton } from "../../components/Skeleton.jsx";
import { makeDeck } from "../../lib/miniGames.mjs";
import { GameOver, ItemTile, ScoreBar, readBest, saveBest, shareResult, useGameItems, useRunToken } from "./shared.jsx";

const KEY = "mmp.game.memory";
const PAIRS = 8;

export function Memory() {
  const items = useGameItems();
  const [deck, setDeck] = useState(/** @type {Array<{ id: number, pair: number, item: any }>} */ ([]));
  const [open, setOpen] = useState(/** @type {number[]} */ ([]));
  const [matched, setMatched] = useState(/** @type {Set<number>} */ (new Set()));
  const [moves, setMoves] = useState(0);
  const [startAt, setStartAt] = useState(0);
  const [doneAt, setDoneAt] = useState(0);
  const [locked, setLocked] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [best, setBest] = useState(() => readBest(KEY));
  const [newBest, setNewBest] = useState(false);
  const run = useRunToken("memory");

  const deal = () => {
    run.renew();
    setDeck(makeDeck(items.items, PAIRS));
    setOpen([]);
    setMatched(new Set());
    setMoves(0);
    setStartAt(0);
    setDoneAt(0);
    setLocked(false);
    setNewBest(false);
  };

  useEffect(() => {
    if (items.status === "ready") deal();
  }, [items.status]);

  // 걸린 시간 표시
  useEffect(() => {
    if (!startAt || doneAt) return undefined;
    const tick = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(tick);
  }, [startAt, doneAt]);

  const flip = (/** @type {{ id: number, pair: number }} */ card) => {
    if (locked || doneAt || matched.has(card.pair) || open.includes(card.id)) return;
    if (!startAt) {
      setStartAt(Date.now());
      setNow(Date.now());
    }
    const next = [...open, card.id];
    if (next.length < 2) return setOpen(next);
    const total = moves + 1;
    setMoves(total);
    const first = deck.find((entry) => entry.id === next[0]);
    if (first && first.pair === card.pair) {
      const done = new Set(matched);
      done.add(card.pair);
      setMatched(done);
      setOpen([]);
      if (done.size === Math.min(PAIRS, deck.length / 2)) {
        setDoneAt(Date.now());
        if (saveBest(KEY, total, true)) {
          setBest(total);
          setNewBest(true);
        }
      }
      return undefined;
    }
    setOpen(next);
    setLocked(true);
    window.setTimeout(() => {
      setOpen([]);
      setLocked(false);
    }, 760);
    return undefined;
  };

  if (items.status === "error") return <ErrorState title="장비를 불러오지 못했어요" description={items.error?.message} onRetry={items.retry} />;
  if (!deck.length) return <Skeleton height={360} radius={20} />;

  const seconds = startAt ? Math.round(((doneAt || now) - startAt) / 1000) : 0;

  return (
    <>
      <ScoreBar
        items={[
          ["찾은 짝", `${matched.size}/${deck.length / 2}`],
          ["뒤집기", moves],
          ["시간", `${seconds}초`],
          ["최고", best ? `${best}번` : "-"]
        ]}
      />
      <div class="arc-memory" role="group" aria-label="카드">
        {deck.map((card) => {
          const up = open.includes(card.id) || matched.has(card.pair);
          return (
            <button
              key={card.id}
              type="button"
              class={`arc-card${up ? " is-up" : ""}${matched.has(card.pair) ? " is-matched" : ""}`}
              aria-label={up ? card.item.name : "뒤집힌 카드"}
              onClick={() => flip(card)}
            >
              <span class="arc-card__inner">
                <span class="arc-card__back" aria-hidden="true">
                  <BrandMark size={28} />
                </span>
                <span class="arc-card__front" aria-hidden="true">
                  <ItemTile item={card.item} size={44} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {doneAt ? (
        <GameOver
          title={moves <= 12 ? "기억력 천재" : moves <= 16 ? "눈썰미 좋음" : "다 찾았어요!"}
          value={`${moves}번`}
          lines={[`${seconds}초`]}
          isBest={newBest}
          onShare={() => shareResult(`메이플M 플러스 '짝 맞추기' ${moves}번 만에 ${seconds}초로 다 찾았어요!`)}
          onRetry={deal}
          game="memory"
          score={moves}
          token={run.token}
        />
      ) : null}
    </>
  );
}
