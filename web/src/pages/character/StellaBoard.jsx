// 스타코러스 별자리판: 별을 눌러 열고(이어진 별만), 범위 별은 값을 고른다. 열린 별의 합을 직접 입력 값으로 넘긴다.
// 표는 src/game-data/stella.json, 계산은 web/src/lib/stella.mjs. 판 상태는 캐릭터마다 브라우저에 기억한다.
import board from "../../../../src/game-data/stella.json";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Icon, SPARKLE_PATH } from "../../components/Icon.jsx";
import { formatComma, formatDecimal, formatKoreanUnits } from "../../lib/format.js";
import { boardTotals, canOpen, nextStars, nodeValue, toManualValues, toggle } from "../../lib/stella.mjs";
import { combatPower, totalsFromStats } from "../../lib/efficiency.js";

const COLS = 9;
const ROWS = 5;
const STATE_KEY = (key) => `mmp.stella.${key}`;

/** @param {string} key */
export function readStella(key) {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STATE_KEY(key)) || "null");
    if (raw && Array.isArray(raw.open)) return { open: new Set(raw.open.map(String)), picks: raw.picks && typeof raw.picks === "object" ? raw.picks : {} };
  } catch {
    // 저장소를 쓸 수 없으면 빈 판
  }
  return { open: new Set(), picks: {} };
}

function writeStella(key, state) {
  try {
    window.localStorage.setItem(STATE_KEY(key), JSON.stringify({ open: [...state.open], picks: state.picks }));
  } catch {
    // 무시
  }
}

/** 스탯 이름(직업 계열) + 값 글자 */
function statLabel(stat, attackType) {
  return attackType === "magical" ? stat.replace(/^물리/, "마법") : stat;
}
const valueLabel = (stat, value) => (stat === "최대 대미지" ? `+${formatKoreanUnits(value, { maxGroups: 1 })}` : `+${value}%`);

/**
 * @param {{ storageKey: string, attackType: string, majorStats?: Record<string, any>, onApply: (values: Record<string, number>) => void, onClose: () => void }} props
 */
export function StellaBoard({ storageKey, attackType, majorStats = {}, onApply, onClose }) {
  const [state, setState] = useState(() => readStella(storageKey));
  const { totals, cost } = useMemo(() => boardTotals(board.nodes, state.open, state.picks, board.ranges), [state]);
  // 다음에 열면 좋은 별(세리온 1개당 전투력 상승 순, 위 3개)
  const statTotals = useMemo(() => totalsFromStats(majorStats, attackType), [majorStats, attackType]);
  const picks = useMemo(
    () => (statTotals ? nextStars(board.nodes, state.open, state.picks, board.ranges, statTotals, combatPower).slice(0, 3) : []),
    [state, statTotals]
  );
  const pickRank = new Map(picks.map((item, index) => [item.id, index + 1]));
  const byId = useMemo(() => new Map(board.nodes.map((node) => [node.id, node])), []);
  // 가장자리 여백(좌우 3%, 위 7%·아래 12%: 범위 별 값 고르기가 아래에 붙는다)
  const pos = (node) => ({ x: 3 + ((node.col + 0.5) / COLS) * 94, y: 7 + ((node.row + 0.5) / ROWS) * 81 });
  const edges = board.nodes.flatMap((node) => node.needs.map((need) => [byId.get(need), node]).filter(([from]) => from));

  const update = (next) => setState(next);
  const press = (id) => update({ ...state, open: toggle(board.nodes, state.open, id) });
  const pick = (id, value) => update({ ...state, picks: { ...state.picks, [id]: Number(value) } });

  // 판이 화면보다 넓으면(좁은 화면) 양 끝에 더 있음을 흐림으로 알린다.
  const scroller = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [more, setMore] = useState({ left: false, right: false });
  useEffect(() => {
    const element = scroller.current;
    if (!element) return undefined;
    const measure = () => {
      const max = element.scrollWidth - element.clientWidth;
      setMore({ left: element.scrollLeft > 4, right: element.scrollLeft < max - 4 });
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    // 시트가 열리며 처음 그려질 때(크기가 생길 때)도 다시 잰다.
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    return () => {
      element.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, []);

  return (
    <div class="stella">
      <div class={`stella__scroll${more.left ? " has-left" : ""}${more.right ? " has-right" : ""}`} ref={scroller}>
        <div class="stella__board" role="group" aria-label="스타코러스 별자리판">
          <svg class="stella__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {edges.map(([from, to]) => {
              const a = pos(from);
              const b = pos(to);
              const lit = state.open.has(from.id) && state.open.has(to.id);
              return <line key={`${from.id}-${to.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} class={lit ? "is-lit" : ""} vector-effect="non-scaling-stroke" />;
            })}
          </svg>
          {board.nodes.map((node) => {
            const open = state.open.has(node.id);
            const ready = !open && canOpen(board.nodes, state.open, node.id);
            const { x, y } = pos(node);
            const label = statLabel(node.stat, attackType);
            return (
              <div
                key={node.id}
                class={`stella__node${open ? " is-open" : ready ? " is-ready" : ""}${node.range ? " is-range" : ""}${pickRank.has(node.id) ? " is-pick" : ""}`}
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <button
                  type="button"
                  class="stella__star"
                  aria-pressed={open ? "true" : "false"}
                  aria-label={`${label} ${node.range ? "" : valueLabel(node.stat, node.value)} ${open ? "닫기" : "열기"}`}
                  disabled={!open && !ready}
                  onClick={() => press(node.id)}
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <path d={SPARKLE_PATH} />
                  </svg>
                  {pickRank.has(node.id) ? <span class="stella__rank num">{pickRank.get(node.id)}</span> : null}
                </button>
                <span class="stella__label">
                  {label}
                  {node.range ? null : <b class="num">{valueLabel(node.stat, node.value)}</b>}
                </span>
                {node.range ? (
                  <span class="select select--sm stella__pick">
                    <select
                      aria-label={`${label} 값`}
                      value={nodeValue(node, state.picks, board.ranges)}
                      onChange={(event) => pick(node.id, /** @type {HTMLSelectElement} */ (event.currentTarget).value)}
                    >
                      {board.ranges[node.stat].map((value) => (
                        <option key={value} value={value}>
                          {valueLabel(node.stat, value)}
                        </option>
                      ))}
                    </select>
                    <Icon name="chevronDown" size={14} class="select__icon" />
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div class="stella__sum">
        <ul class="stella__totals">
          {Object.keys(board.manualIds).map((stat) => (
            <li key={stat}>
              <span>{statLabel(stat, attackType)}</span>
              <strong class="num">{totals[stat] ? valueLabel(stat, totals[stat]) : "-"}</strong>
            </li>
          ))}
        </ul>
        {picks.length ? (
          <ol class="stella__next">
            {picks.map((item, index) => {
              const node = byId.get(item.id);
              return (
                <li key={item.id}>
                  <span class="stella__rank num">{index + 1}</span>
                  <span>
                    {statLabel(node.stat, attackType)}{" "}
                    {node.range ? valueLabel(node.stat, nodeValue(node, state.picks, board.ranges)) : valueLabel(node.stat, node.value)}
                  </span>
                  <strong class="num">
                    전투력 +{formatDecimal(item.gain * 100, item.gain < 0.001 ? 3 : 2)}% · 세리온 {node.cost}개
                  </strong>
                </li>
              );
            })}
          </ol>
        ) : null}
        <p class="stella__meta num">
          열린 별 {state.open.size}/{board.nodes.length} · 세리온 {formatComma(cost)}개
        </p>
        <div class="stella__actions">
          <button type="button" class="btn btn--ghost btn--sm" onClick={() => update({ open: new Set(), picks: {} })}>
            <Icon name="refresh" size={16} />
            비우기
          </button>
          <button type="button" class="btn btn--secondary btn--sm" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            class="btn btn--primary btn--sm"
            onClick={() => {
              writeStella(storageKey, state);
              onApply(toManualValues(totals, board.manualIds));
            }}
          >
            <Icon name="check" size={16} />
            입력칸에 넣기
          </button>
        </div>
      </div>
    </div>
  );
}
