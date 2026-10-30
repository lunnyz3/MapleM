// 스타포스 도전: 주문서 150장으로 ★0 무기를 강화해 몇 성까지 가는지. 확률은 강화 계산기와 같은 표
// (src/game-data/enhance.json, web/src/lib/enhanceCalc.mjs starforceOdds — 성공·유지·하락·파괴). 파괴되면 끝.
// 파괴 방지를 켜면 파괴가 유지가 되는 대신 파괴 확률이 있는 성에서는 한 번에 2장. 기록은 가장 높이 간 별.
import enhanceRules from "../../../../src/game-data/enhance.json";
import { useMemo, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { formatDecimal } from "../../lib/format.js";
import { starforceOdds } from "../../lib/enhanceCalc.mjs";
import { STAR_MAX } from "../../lib/miniGames.mjs";
import { StarRow } from "./StarCatch.jsx";
import { GameOver, ItemTile, ScoreBar, readBest, saveBest, shareResult, useGameItems, useRunToken, useWindowKey } from "./shared.jsx";

const KEY = "mmp.game.sf";
const TICKETS = 150;
const RESULT_TEXT = { success: "성공!", stay: "유지", drop: "하락…", destroy: "파괴!" };

export function StarForce() {
  const items = useGameItems();
  const weapon = useMemo(() => {
    const weapons = items.items.filter((item) => item.slot === "무기");
    const list = weapons.length ? weapons : items.items;
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }, [items.items]);
  const [star, setStar] = useState(0);
  const [top, setTop] = useState(0);
  const [tickets, setTickets] = useState(TICKETS);
  const [guard, setGuard] = useState(false);
  const [last, setLast] = useState(/** @type {{ kind: string, at: number } | null} */ (null));
  const [log, setLog] = useState(/** @type {string[]} */ ([]));
  const [over, setOver] = useState(/** @type {"" | "tickets" | "destroyed" | "max"} */ (""));
  const [best, setBest] = useState(() => readBest(KEY));
  const [newBest, setNewBest] = useState(false);
  const run = useRunToken("sf");

  const odds = starforceOdds(enhanceRules, star, { protectDestroy: guard });
  const raw = starforceOdds(enhanceRules, star, {});
  const cost = guard && raw.destroy > 0 ? 2 : 1;

  const finish = (/** @type {"tickets" | "destroyed" | "max"} */ reason, reached) => {
    setOver(reason);
    if (reached > 0 && saveBest(KEY, reached)) {
      setBest(reached);
      setNewBest(true);
    }
  };

  const tryOnce = () => {
    if (over || tickets < cost) return;
    if (tickets === TICKETS && !log.length) run.renew();
    const roll = Math.random() * 100;
    let kind = "destroy";
    if (roll < odds.success) kind = "success";
    else if (roll < odds.success + odds.stay) kind = "stay";
    else if (roll < odds.success + odds.stay + odds.drop) kind = "drop";
    const nextStar = kind === "success" ? star + 1 : kind === "drop" ? Math.max(0, star - 1) : star;
    const nextTop = Math.max(top, nextStar);
    const left = tickets - cost;
    setStar(nextStar);
    setTop(nextTop);
    setTickets(left);
    setLast({ kind, at: Date.now() });
    setLog((list) => [kind, ...list].slice(0, 12));
    if (kind === "destroy") finish("destroyed", nextTop);
    else if (nextStar >= STAR_MAX) finish("max", nextTop);
    else if (left < 1 || (left < 2 && guard && starforceOdds(enhanceRules, nextStar, {}).destroy > 0)) finish("tickets", nextTop);
  };

  const restart = () => {
    setStar(0);
    setTop(0);
    setTickets(TICKETS);
    setLast(null);
    setLog([]);
    setOver("");
    setNewBest(false);
  };

  useWindowKey((event) => {
    if ((event.key !== " " && event.key !== "Enter") || event.repeat) return;
    if (event.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(event.target.tagName) && !event.target.classList.contains("arc-sf__go")) return;
    event.preventDefault();
    tryOnce();
  });

  return (
    <>
      <ScoreBar
        items={[
          ["지금", `★${star}`],
          ["최고", `★${top}`],
          ["주문서", `${tickets}장`],
          ["내 기록", best ? `★${best}` : "-"]
        ]}
      />
      <div class={`arc-sf card${last ? ` is-${last.kind}` : ""}${over === "destroyed" ? " is-broken" : ""}`}>
        <div class="arc-star__item">
          {weapon ? <ItemTile item={weapon} size={72} class="arc-sf__item" key={last?.at || 0} /> : <span class="arc-item" />}
          <span class="arc-star__name">{weapon?.name || "무기"}</span>
        </div>
        <StarRow star={star} />
        <p class="arc-sf__result display" aria-live="polite">
          {last ? RESULT_TEXT[last.kind] : "강화해 볼까요?"}
        </p>
        {!over ? (
          <>
            <ul class="arc-sf__odds num" aria-label="다음 강화 확률">
              <li class="is-success">성공 {formatDecimal(odds.success, 1)}%</li>
              <li>유지 {formatDecimal(odds.stay, 1)}%</li>
              {odds.drop > 0 ? <li class="is-drop">하락 {formatDecimal(odds.drop, 1)}%</li> : null}
              {raw.destroy > 0 ? <li class={guard ? "is-guarded" : "is-destroy"}>파괴 {guard ? "방지" : `${formatDecimal(odds.destroy, 1)}%`}</li> : null}
            </ul>
            <label class="arc-sf__guard">
              <input type="checkbox" checked={guard} onChange={(event) => setGuard(/** @type {HTMLInputElement} */ (event.currentTarget).checked)} />
              <span>파괴 방지(파괴될 수 있는 성에서 주문서 2장)</span>
            </label>
            <button type="button" class="btn btn--primary arc-sf__go" onClick={tryOnce} disabled={tickets < cost}>
              <Icon name="sparkle" size={18} />
              강화하기 <span class="num">(주문서 {cost}장)</span>
            </button>
          </>
        ) : null}
        {log.length ? (
          <ol class="arc-sf__log" aria-label="최근 결과">
            {log.map((kind, position) => (
              <li key={`${log.length}-${position}`} class={`is-${kind}`}>
                {RESULT_TEXT[kind].replace(/[!…]/g, "")}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      {over ? (
        <GameOver
          title={over === "max" ? "★35 달성!" : over === "destroyed" ? "장비가 파괴됐어요" : top >= 22 ? "강화의 신" : top >= 17 ? "운이 좋네요" : "주문서를 다 썼어요"}
          value={`최고 ★${top}`}
          lines={[`쓴 주문서 ${TICKETS - tickets}장`, over === "destroyed" ? `★${star}에서 파괴` : `마지막 ★${star}`]}
          isBest={newBest}
          onShare={() => shareResult(`메이플M 플러스 '스타포스 도전' 주문서 ${TICKETS}장으로 최고 ★${top}${over === "destroyed" ? " (파괴…)" : ""}`)}
          onRetry={restart}
          game="sf"
          score={top}
          token={run.token}
        />
      ) : null}
    </>
  );
}
