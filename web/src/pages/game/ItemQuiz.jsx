// 아이템 이름 맞히기: 장비 아이콘을 보고 이름 넷 중 하나를 고른다(오답은 같은 부위 먼저). 열 문제.
import { useEffect, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { ErrorState } from "../../components/States.jsx";
import { Skeleton } from "../../components/Skeleton.jsx";
import { QUIZ_ROUNDS, makeQuiz } from "../../lib/miniGames.mjs";
import { GameOver, ItemTile, ScoreBar, readBest, saveBest, shareResult, useGameItems, useRunToken, useWindowKey } from "./shared.jsx";

const KEY = "mmp.game.quiz";

export function ItemQuiz() {
  const items = useGameItems();
  const [quiz, setQuiz] = useState(/** @type {Array<{ answer: any, options: any[] }>} */ ([]));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(/** @type {number | null} */ (null));
  const [right, setRight] = useState(0);
  const [done, setDone] = useState(false);
  const [best, setBest] = useState(() => readBest(KEY));
  const [newBest, setNewBest] = useState(false);
  const run = useRunToken("quiz");

  const deal = () => {
    run.renew();
    setQuiz(makeQuiz(items.items, QUIZ_ROUNDS));
    setIndex(0);
    setPicked(null);
    setRight(0);
    setDone(false);
    setNewBest(false);
  };

  useEffect(() => {
    if (items.status === "ready") deal();
  }, [items.status]);

  const question = quiz[index];

  const choose = (/** @type {number} */ option) => {
    if (!question || picked !== null || done) return;
    setPicked(option);
    if (question.options[option] === question.answer) setRight((n) => n + 1);
  };

  const next = () => {
    if (picked === null) return;
    if (index + 1 < quiz.length) {
      setIndex(index + 1);
      setPicked(null);
      return;
    }
    setDone(true);
    if (saveBest(KEY, right)) {
      setBest(right);
      setNewBest(true);
    }
  };

  // 키보드: 1~4 고르기, Enter 다음
  useWindowKey((event) => {
    if (event.target instanceof HTMLElement && /input|select|textarea/i.test(event.target.tagName)) return;
    if (/^[1-4]$/.test(event.key)) choose(Number(event.key) - 1);
    else if (event.key === "Enter" && picked !== null && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      next();
    }
  });

  if (items.status === "error") return <ErrorState title="장비를 불러오지 못했어요" description={items.error?.message} onRetry={items.retry} />;
  if (!question) return <Skeleton height={360} radius={20} />;

  const total = quiz.length;
  return (
    <>
      <ScoreBar
        items={[
          ["문제", `${Math.min(index + 1, total)}/${total}`],
          ["맞힘", right],
          ["최고", best ? `${best}/${QUIZ_ROUNDS}` : "-"]
        ]}
      />
      {!done ? (
        <div class="arc-quiz card" key={index}>
          <div class="arc-quiz__icon">
            <ItemTile item={question.answer} size={80} />
            <span class="chip">{question.answer.slot || "장비"}</span>
          </div>
          <p class="arc-quiz__ask">이 장비의 이름은?</p>
          <div class="arc-quiz__options">
            {question.options.map((option, optionIndex) => {
              const state =
                picked === null ? "" : option === question.answer ? " is-right" : optionIndex === picked ? " is-wrong" : " is-dim";
              return (
                <button key={option.name} type="button" class={`arc-quiz__option${state}`} onClick={() => choose(optionIndex)} disabled={picked !== null}>
                  <span class="arc-quiz__key num" aria-hidden="true">
                    {optionIndex + 1}
                  </span>
                  {option.name}
                </button>
              );
            })}
          </div>
          {picked !== null ? (
            <div class="arc-quiz__after">
              <strong class={question.options[picked] === question.answer ? "is-right" : "is-wrong"}>
                {question.options[picked] === question.answer ? "정답!" : "아쉬워요"}
              </strong>
              <button type="button" class="btn btn--primary" onClick={next}>
                {index + 1 < total ? "다음 문제" : "결과 보기"}
                <Icon name="arrowRight" size={18} />
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <GameOver
          title={right >= 9 ? "장비 박사" : right >= 7 ? "아이템 고수" : right >= 4 ? "꽤 아는데요" : "다시 도전!"}
          value={`${right}/${total}`}
          isBest={newBest}
          onShare={() => shareResult(`메이플M 플러스 '아이템 이름 맞히기' ${total}문제 중 ${right}개 맞혔어요!`)}
          onRetry={deal}
          game="quiz"
          score={right}
          token={run.token}
        />
      )}
    </>
  );
}
