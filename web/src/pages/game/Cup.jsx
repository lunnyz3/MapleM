// 장비창 월드컵: 모은 캐릭터 16명의 장비창만 보고 더 멋진 쪽을 골라 16강 → 8강 → 4강 → 결승. 이름과 전투력은
// 우승자가 정해진 뒤에 보인다. 문제 캐릭터는 누가 더 셀까?와 같은 무리(GET /api/v2/game/pool), 장비창은 game/gear.jsx.
import { useEffect, useMemo, useState } from "preact/hooks";
import { WorldIcon } from "../../components/GameIcons.jsx";
import { Icon } from "../../components/Icon.jsx";
import { formatKoreanUnits } from "../../lib/format.js";
import { urls } from "../../lib/game.js";
import { shuffled } from "../../lib/miniGames.mjs";
import { GearWindow, loadGear, useGear } from "./gear.jsx";
import { shareResult, useWindowKey } from "./shared.jsx";

const SIZE = 16;
const ROUND_NAMES = { 16: "16강", 8: "8강", 4: "4강", 2: "결승" };

/** @param {{ entry: any, gear: any, failed: boolean, onRetry: () => void, onPick: () => void, hotkey: string }} props */
function Contender({ entry, gear, failed, onRetry, onPick, hotkey }) {
  return (
    <div class="game-card is-pickable arc-cup__card" onClick={onPick}>
      <div class="game-card__who">
        <span class="game-card__world">
          <WorldIcon world={entry.world} size={16} />
          {entry.world}
        </span>
        <strong class="game-card__job display">{entry.className}</strong>
        <span class="game-card__lv num">Lv.{entry.level}</span>
      </div>
      <GearWindow gear={gear} failed={failed} onRetry={onRetry} />
      {/* 누르면 카드의 onClick 으로 올라간다 */}
      <button type="button" class="game-card__cta">
        <span class="game-card__key" aria-hidden="true">
          {hotkey}
        </span>
        이 장비창!
      </button>
    </div>
  );
}

/** @param {{ pool: any[] }} props */
export function Cup({ pool }) {
  const [round, setRound] = useState(/** @type {any[]} */ ([]));
  const [winners, setWinners] = useState(/** @type {any[]} */ ([]));
  const [index, setIndex] = useState(0);
  const [podium, setPodium] = useState(/** @type {any[]} */ ([]));
  const [champion, setChampion] = useState(/** @type {any} */ (null));

  const start = () => {
    const picked = shuffled(pool.filter((entry) => entry.id)).slice(0, SIZE);
    setRound(picked);
    setWinners([]);
    setIndex(0);
    setPodium([]);
    setChampion(null);
  };
  useEffect(start, [pool]);

  const pair = round.length >= 2 ? [round[index * 2], round[index * 2 + 1]] : null;
  const gear = useGear(pair && !champion ? [pair[0].id, pair[1].id] : []);
  // 다음 짝 장비창을 미리 읽어 둔다
  useEffect(() => {
    const next = round[index * 2 + 2] && round[index * 2 + 3] ? [round[index * 2 + 2].id, round[index * 2 + 3].id] : [];
    if (next.length) loadGear(next).catch(() => {});
  }, [round, index]);

  const pick = (/** @type {number} */ side) => {
    if (!pair || champion) return;
    const chosen = pair[side];
    const nextWinners = [...winners, chosen];
    if (index + 1 < round.length / 2) {
      setWinners(nextWinners);
      setIndex(index + 1);
      return;
    }
    if (nextWinners.length === 1) {
      // 결승: 준우승도 남긴다
      setPodium([chosen, pair[1 - side], ...podium]);
      setChampion(chosen);
      return;
    }
    if (round.length === 4) setPodium(round.filter((entry) => !nextWinners.includes(entry)));
    setRound(nextWinners);
    setWinners([]);
    setIndex(0);
    if (nextWinners.length >= 2) loadGear([nextWinners[0].id, nextWinners[1].id]).catch(() => {});
  };

  useWindowKey((event) => {
    if (event.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
    if (event.key === "ArrowLeft" || event.key === "1") pick(0);
    else if (event.key === "ArrowRight" || event.key === "2") pick(1);
  });

  const championGear = useGear(champion ? [champion.id] : []);
  const roundName = ROUND_NAMES[round.length] || "";
  const progress = useMemo(() => {
    const total = SIZE - 1;
    const done = SIZE - round.length + index;
    return Math.round((done / total) * 100);
  }, [round.length, index]);

  if (!round.length) return null;

  if (champion) {
    const second = podium[1];
    return (
      <section class="arc-cup__win card" aria-label="우승">
        <span class="arc-cup__crown" aria-hidden="true">
          <Icon name="crown" size={34} />
        </span>
        <p class="arc-cup__title display">장비창 월드컵 우승</p>
        <a class="arc-cup__champion" href={urls.character(champion.world, champion.name)}>
          <strong class="display">{champion.name}</strong>
          <span>
            <WorldIcon world={champion.world} size={16} />
            {champion.world} · {champion.className} · Lv.{champion.level}
          </span>
          <span class="num">전투력 {formatKoreanUnits(champion.power, { maxGroups: champion.power >= 1e8 ? 2 : 1 })}</span>
        </a>
        <GearWindow gear={championGear.gear?.[0]} failed={championGear.failed} onRetry={championGear.retry} />
        {second ? (
          <p class="arc-cup__second">
            준우승{" "}
            <a href={urls.character(second.world, second.name)}>
              {second.world} {second.name}
            </a>
          </p>
        ) : null}
        <div class="arc-over__actions">
          <button type="button" class="btn btn--secondary" onClick={() => shareResult(`메이플M 플러스 장비창 월드컵 우승: ${champion.world} ${champion.name} (${champion.className})`)}>
            <Icon name="share" size={18} />
            결과 복사
          </button>
          <button type="button" class="btn btn--primary" onClick={start}>
            <Icon name="refresh" size={18} />
            새 월드컵
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <div class="arc-cup__bar card">
        <strong class="display">{roundName}</strong>
        <span class="num">
          {index + 1}/{round.length / 2}
        </span>
        <span class="arc-cup__progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </span>
      </div>
      {pair ? (
        <div class="game-arena arc-cup__arena" key={`${round.length}-${index}`}>
          <Contender entry={pair[0]} gear={gear.gear?.[0]} failed={gear.failed} onRetry={gear.retry} onPick={() => pick(0)} hotkey="1" />
          <span class="game-vs display" aria-hidden="true">
            VS
          </span>
          <Contender entry={pair[1]} gear={gear.gear?.[1]} failed={gear.failed} onRetry={gear.retry} onPick={() => pick(1)} hotkey="2" />
        </div>
      ) : null}
    </>
  );
}
