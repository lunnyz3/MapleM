// 장비 이름 타자: 모은 장비 이름을 60초 동안 하나씩 그대로 치고 띄어쓰기나 Enter 로 넘긴다(한글 조합 중에 칸을 비우면
// 남은 자모가 다음 칸에 붙으므로, 다 친 뒤 넘기게 한다). 첫 글자를 치면 시간이 가고, 끝나면 분당 타수(한글은 자모 수).
import { useEffect, useRef, useState } from "preact/hooks";
import { ErrorState } from "../../components/States.jsx";
import { Skeleton } from "../../components/Skeleton.jsx";
import { formatComma } from "../../lib/format.js";
import { TYPING_SECONDS, keystrokes, shuffled, typingSpeed } from "../../lib/miniGames.mjs";
import { GameOver, ItemTile, ScoreBar, readBest, saveBest, shareResult, useGameItems, useRunToken } from "./shared.jsx";

const KEY = "mmp.game.typing";

export function Typing() {
  const items = useGameItems();
  const [queue, setQueue] = useState(/** @type {any[]} */ ([]));
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [strokes, setStrokes] = useState(0);
  const [done, setDone] = useState(0);
  const [startAt, setStartAt] = useState(0);
  const [left, setLeft] = useState(TYPING_SECONDS);
  const [finished, setFinished] = useState(false);
  const [best, setBest] = useState(() => readBest(KEY));
  const [newBest, setNewBest] = useState(false);
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const run = useRunToken("typing");

  const deal = () => {
    run.renew();
    setQueue(shuffled(items.items.filter((item) => [...item.name].length <= 16)));
    setIndex(0);
    setValue("");
    setStrokes(0);
    setDone(0);
    setStartAt(0);
    setLeft(TYPING_SECONDS);
    setFinished(false);
    setNewBest(false);
    window.setTimeout(() => input.current?.focus(), 50);
  };

  useEffect(() => {
    if (items.status === "ready") deal();
  }, [items.status]);

  const speed = startAt ? typingSpeed(strokes, Math.min(TYPING_SECONDS, Math.max(1, (Date.now() - startAt) / 1000))) : 0;

  useEffect(() => {
    if (!startAt || finished) return undefined;
    const tick = window.setInterval(() => {
      const remain = Math.max(0, Math.ceil(TYPING_SECONDS - (Date.now() - startAt) / 1000));
      setLeft(remain);
      if (remain <= 0) {
        setFinished(true);
        window.clearInterval(tick);
      }
    }, 200);
    return () => window.clearInterval(tick);
  }, [startAt, finished]);

  // 끝나면 최고 기록
  const finalSpeed = typingSpeed(strokes, TYPING_SECONDS);
  useEffect(() => {
    if (finished && finalSpeed > 0 && saveBest(KEY, finalSpeed)) {
      setBest(finalSpeed);
      setNewBest(true);
    }
  }, [finished]);

  if (items.status === "error") return <ErrorState title="장비를 불러오지 못했어요" description={items.error?.message} onRetry={items.retry} />;
  if (!queue.length) return <Skeleton height={320} radius={20} />;

  const target = queue[index % queue.length];
  const accept = () => {
    setStrokes((n) => n + keystrokes(target.name));
    setDone((n) => n + 1);
    setIndex(index + 1);
    setValue("");
    if (input.current) input.current.value = "";
  };
  const onInput = (/** @type {Event} */ event) => {
    if (finished) return;
    const text = /** @type {HTMLInputElement} */ (event.currentTarget).value;
    if (!startAt && text) setStartAt(Date.now());
    if (text.endsWith(" ") && text.trim() === target.name) return accept();
    setValue(text);
  };
  const onKeyDown = (/** @type {KeyboardEvent} */ event) => {
    if (event.key !== "Enter" || finished) return;
    event.preventDefault();
    // 조합 중인 글자가 들어간 뒤에 비교한다
    window.setTimeout(() => {
      if ((input.current?.value || "").trim() === target.name) accept();
    }, 0);
  };

  // 친 글자 중 맞은 앞부분
  const typed = [...value];
  const want = [...target.name];
  let good = 0;
  while (good < typed.length && typed[good] === want[good]) good += 1;

  return (
    <>
      <ScoreBar
        items={[
          ["시간", `${left}초`],
          ["타수", formatComma(speed)],
          ["완성", done],
          ["최고", best ? `${formatComma(best)}타` : "-"]
        ]}
      />
      {!finished ? (
        <div class="arc-type card">
          <div class="arc-type__target" key={index}>
            <ItemTile item={target} size={56} />
            <strong class="arc-type__name display" aria-live="polite">
              {want.map((char, position) => (
                <span key={position} class={position < good ? "is-ok" : position < typed.length ? "is-bad" : ""}>
                  {char}
                </span>
              ))}
            </strong>
          </div>
          <ul class="arc-type__next" aria-label="다음 장비">
            {[1, 2].map((offset) => (
              <li key={offset}>{queue[(index + offset) % queue.length].name}</li>
            ))}
          </ul>
          <label class="sr-only" for="arc-type-input">
            장비 이름 입력
          </label>
          <input
            id="arc-type-input"
            ref={input}
            class="input arc-type__input"
            type="text"
            autoComplete="off"
            autoCorrect="off"
            spellcheck={false}
            enterKeyHint="next"
            placeholder={startAt ? "" : "여기에 치면 시작 · 다 치고 띄어쓰기나 Enter"}
            value={value}
            onInput={onInput}
            onKeyDown={onKeyDown}
          />
        </div>
      ) : (
        <GameOver
          title={finalSpeed >= 500 ? "타자의 신" : finalSpeed >= 350 ? "손이 빨라요" : finalSpeed >= 200 ? "제법인데요" : "다시 도전!"}
          value={`${formatComma(finalSpeed)}타`}
          lines={[`장비 ${done}개 완성`]}
          isBest={newBest}
          onShare={() => shareResult(`메이플M 플러스 '장비 이름 타자' 분당 ${formatComma(finalSpeed)}타!`)}
          onRetry={deal}
          game="typing"
          score={finalSpeed}
          token={run.token}
        />
      )}
    </>
  );
}
