// 계산기(/calc?view=…&a=월드/이름): HEXA 강화 기간 · HEXA 스탯 기댓값 · 심볼 비용 · 해방 날짜 ·
// 스타포스 · 문장 · 장신구 연마 · 장비 전수 · 길드 어빌리티(강화 계산기는 calc/Enhance.jsx) ·
// 확률(스타코러스·빛의 성소·자석펫, calc/Gacha.jsx).
// 캐릭터를 불러오면 지금 레벨을 채운다(HEXA 코어·심볼, 제네시스 무기면 해방 완료).
import "../styles/calc.css";
import hexa from "../../../src/game-data/hexa.json";
import symbolCosts from "../../../src/game-data/symbol-costs.json";
import liberationRules from "../../../src/game-data/liberation.json";
import { useMemo, useState } from "preact/hooks";
import { Icon } from "../components/Icon.jsx";
import { Aurora, SplitText } from "../components/Motion.jsx";
import { Segmented } from "../components/Tabs.jsx";
import { loadCharacterPage } from "../lib/data.js";
import { formatComma, formatDecimal, formatKoreanUnits, kstToday, shiftDate } from "../lib/format.js";
import { CALC_VIEWS, DEFAULT_WORLD, WORLDS } from "../lib/game.js";
import { daysFor, hexaCoreType, hexaStatExpectation, sumRange, symbolCost } from "../lib/hexaCalc.mjs";
import { liberationPlan } from "../lib/liberation.mjs";
import { EmblemCalc, GuildAbilityCalc, PolishCalc, StarforceCalc, TransferCalc } from "./calc/Enhance.jsx";
import { GachaCalc } from "./calc/Gacha.jsx";
import { ItemDbCalc } from "./calc/ItemDb.jsx";

const CORE_TYPES = ["오리진 코어", "어센트 코어", "마스터리 코어", "강화 코어", "공용 코어"];
const ARCANE = ["소멸의 여로", "츄츄 아일랜드", "레헬른", "아르카나", "모라스", "에스페라"];
const AUTHENTIC = ["에세테라", "세르니움", "아르크스", "아에르", "오디움", "도원경", "아르테리아"];

/** @typedef {{ id: number, name: string, type: string, level: number, target: number }} CoreRow */
/** @typedef {{ id: number, name: string, kind: "arcane" | "authentic", level: number, growth: number, target: number }} SymbolRow */

let nextId = 1;
const newId = () => nextId++;

/** @returns {CoreRow[]} */
function defaultCores() {
  return [
    ["오리진 코어", 1],
    ["어센트 코어", 1],
    ["마스터리 코어", 2],
    ["강화 코어", 4],
    ["공용 코어", 1]
  ].flatMap(([type, count]) =>
    Array.from({ length: /** @type {number} */ (count) }, (_, index) => ({ id: newId(), name: `${type}${Number(count) > 1 ? ` ${index + 1}` : ""}`, type: /** @type {string} */ (type), level: 0, target: 30 }))
  );
}

/** @returns {SymbolRow[]} */
function defaultSymbols() {
  return [
    ...ARCANE.map((name) => ({ id: newId(), name, kind: /** @type {const} */ ("arcane"), level: 1, growth: 0, target: 20 })),
    ...AUTHENTIC.map((name) => ({ id: newId(), name, kind: /** @type {const} */ ("authentic"), level: 1, growth: 0, target: 11 }))
  ];
}

const coreTypeOf = (/** @type {any} */ skill) => hexaCoreType(skill, hexa.coreTypes);

const clampLevel = (/** @type {unknown} */ value, /** @type {number} */ min, /** @type {number} */ max) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
};

/** @param {{ value: number, min: number, max: number, label: string, onChange: (value: number) => void }} props */
function LevelInput({ value, min, max, label, onChange }) {
  return (
    <input
      class="input input--sm num calc-level"
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      aria-label={label}
      value={value}
      onInput={(event) => onChange(clampLevel(/** @type {HTMLInputElement} */ (event.currentTarget).value, min, max))}
    />
  );
}

/** @param {{ label: string, value: number, onChange: (value: number) => void }} props */
function NumberField({ label, value, onChange, id }) {
  return (
    <div class="field">
      <label class="field__label" for={id}>
        {label}
      </label>
      <input
        id={id}
        class="input num"
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onInput={(event) => onChange(Math.max(0, Number(/** @type {HTMLInputElement} */ (event.currentTarget).value) || 0))}
      />
    </div>
  );
}

/** "D+20 · 11.17" */
function daysText(days) {
  if (!Number.isFinite(days)) return "수급 없음";
  if (days <= 0) return "완료";
  const date = shiftDate(kstToday(), days).slice(5).replace("-", ".");
  return `${formatComma(days)}일 · ${date}`;
}

/** @param {{ rows: CoreRow[], setRows: (rows: CoreRow[]) => void }} props */
function HexaCores({ rows, setRows }) {
  const [income, setIncome] = useState({ energyDaily: 10, energyWeekly: 50, fragmentDaily: 200, fragmentWeekly: 1000 });
  const need = useMemo(() => {
    let energy = 0;
    let fragments = 0;
    const perRow = rows.map((row) => {
      const table = hexa.cores[row.type];
      const e = table ? sumRange(table.energy, row.level, row.target) : 0;
      const f = table ? sumRange(table.fragments, row.level, row.target) : 0;
      energy += e;
      fragments += f;
      return { e, f };
    });
    return { energy, fragments, perRow };
  }, [rows]);
  const energyDays = daysFor(need.energy, income.energyDaily, income.energyWeekly);
  const fragmentDays = daysFor(need.fragments, income.fragmentDaily, income.fragmentWeekly);
  const days = Math.max(energyDays, fragmentDays);
  const bottleneck = energyDays === fragmentDays ? "" : energyDays > fragmentDays ? "기운" : "조각";
  const update = (/** @type {number} */ id, /** @type {Partial<CoreRow>} */ patch) => setRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <div class="calc-grid">
      <section class="card calc-card">
        <h2 class="calc-card__title">코어</h2>
        <div class="calc-rows">
          <div class="calc-row calc-row--head" aria-hidden="true">
            <span>코어</span>
            <span>현재</span>
            <span>목표</span>
            <span>기운 · 조각</span>
          </div>
          {rows.map((row, index) => (
            <div key={row.id} class="calc-row">
              <span class="calc-row__name">
                <span class="select select--sm">
                  <select aria-label={`${row.name} 종류`} value={row.type} onChange={(event) => update(row.id, { type: /** @type {HTMLSelectElement} */ (event.currentTarget).value })}>
                    {CORE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type.replace(" 코어", "")}
                      </option>
                    ))}
                  </select>
                  <Icon name="chevronDown" size={16} class="select__icon" />
                </span>
                <span class="calc-row__label" title={row.name}>
                  {row.name}
                </span>
              </span>
              <LevelInput value={row.level} min={0} max={hexa.maxLevel} label={`${row.name} 현재 레벨`} onChange={(level) => update(row.id, { level })} />
              <LevelInput value={row.target} min={0} max={hexa.maxLevel} label={`${row.name} 목표 레벨`} onChange={(target) => update(row.id, { target })} />
              <span class="calc-row__cost num">
                {need.perRow[index].e || need.perRow[index].f ? `${formatComma(need.perRow[index].e)} · ${formatComma(need.perRow[index].f)}` : "-"}
                <button type="button" class="icon-btn calc-row__remove" aria-label={`${row.name} 빼기`} onClick={() => setRows(rows.filter((item) => item.id !== row.id))}>
                  <Icon name="x" size={16} />
                </button>
              </span>
            </div>
          ))}
        </div>
        <button type="button" class="btn btn--secondary btn--sm" onClick={() => setRows([...rows, { id: newId(), name: `코어 ${rows.length + 1}`, type: "강화 코어", level: 0, target: 30 }])}>
          코어 추가
        </button>
      </section>

      <section class="card calc-card calc-result">
        <h2 class="calc-card__title">수급</h2>
        <div class="calc-income">
          <NumberField id="hx-ed" label="기운 일일" value={income.energyDaily} onChange={(energyDaily) => setIncome({ ...income, energyDaily })} />
          <NumberField id="hx-ew" label="기운 주간" value={income.energyWeekly} onChange={(energyWeekly) => setIncome({ ...income, energyWeekly })} />
          <NumberField id="hx-fd" label="조각 일일" value={income.fragmentDaily} onChange={(fragmentDaily) => setIncome({ ...income, fragmentDaily })} />
          <NumberField id="hx-fw" label="조각 주간" value={income.fragmentWeekly} onChange={(fragmentWeekly) => setIncome({ ...income, fragmentWeekly })} />
        </div>
        <dl class="calc-sum">
          <div>
            <dt>솔 에르다</dt>
            <dd class="num">
              {formatComma(need.energy)} <span>{daysText(energyDays)}</span>
            </dd>
          </div>
          <div>
            <dt>솔 에르다 조각</dt>
            <dd class="num">
              {formatComma(need.fragments)} <span>{daysText(fragmentDays)}</span>
            </dd>
          </div>
        </dl>
        <p class="calc-big display num">
          {Number.isFinite(days) ? (days > 0 ? `${formatComma(days)}일` : "완료") : "-"}
          {bottleneck && days > 0 ? <span class="calc-big__note">{bottleneck}이 더 오래 걸려요</span> : null}
        </p>
      </section>
    </div>
  );
}

function HexaStat() {
  const [target, setTarget] = useState(8);
  const [start, setStart] = useState(/** @type {[number, number, number]} */ ([0, 0, 0]));
  const [event, setEvent] = useState(false);
  const used = start[0] + start[1] + start[2];
  const valid = used <= hexa.stat.totalMax;
  const result = useMemo(() => (valid ? hexaStatExpectation(hexa.stat, { target, start, event }) : null), [target, start, event, valid]);
  const percent = (/** @type {number} */ value) => `${formatDecimal(value * 100, value < 0.01 ? 3 : 2)}%`;
  const setLevel = (/** @type {number} */ index, /** @type {number} */ value) => setStart(/** @type {[number, number, number]} */ (start.map((level, i) => (i === index ? value : level))));

  return (
    <div class="calc-grid">
      <section class="card calc-card">
        <h2 class="calc-card__title">HEXA 스탯</h2>
        <div class="calc-income">
          <div class="field">
            <label class="field__label" for="hs-target">
              목표 메인 레벨
            </label>
            <span class="select">
              <select id="hs-target" value={target} onChange={(event) => setTarget(Number(/** @type {HTMLSelectElement} */ (event.currentTarget).value))}>
                {Array.from({ length: hexa.stat.perStatMax }, (_, index) => index + 1).map((level) => (
                  <option key={level} value={level}>
                    Lv.{level}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={18} class="select__icon" />
            </span>
          </div>
          {["메인", "부가 1", "부가 2"].map((label, index) => (
            <div class="field" key={label}>
              <label class="field__label">지금 {label}</label>
              <LevelInput value={start[index]} min={0} max={hexa.stat.perStatMax} label={`지금 ${label} 레벨`} onChange={(value) => setLevel(index, value)} />
            </div>
          ))}
        </div>
        <label class="calc-check">
          <input type="checkbox" checked={event} onChange={(e) => setEvent(/** @type {HTMLInputElement} */ (e.currentTarget).checked)} />
          <span>HEXA 스탯 이벤트 (메인 {hexa.stat.eventMainBoost.fromLevel}~{hexa.stat.eventMainBoost.toLevel}레벨 확률 ×{hexa.stat.eventMainBoost.multiplier})</span>
        </label>
        <table class="calc-table">
          <thead>
            <tr>
              <th scope="col">메인</th>
              <th scope="col">조각</th>
              <th scope="col">메인 확률</th>
            </tr>
          </thead>
          <tbody>
            {hexa.stat.enhance
              .filter((row) => row.mainLevel < hexa.stat.perStatMax)
              .map((row) => (
                <tr key={row.mainLevel} class={row.mainLevel === start[0] ? "is-now" : ""}>
                  <td class="num">Lv.{row.mainLevel}</td>
                  <td class="num">{row.fragments}</td>
                  <td class="num">{row.mainChance}%</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      <section class="card calc-card calc-result">
        <h2 class="calc-card__title">결과</h2>
        {!valid ? <p class="calc-warn">합계가 {hexa.stat.totalMax}을 넘어요.</p> : null}
        {result ? (
          <>
            <dl class="calc-sum">
              <div>
                <dt>이번 판 성공</dt>
                <dd class="num">{percent(result.runChance)}</dd>
              </div>
              <div>
                <dt>처음부터 한 판 성공</dt>
                <dd class="num">{percent(result.freshChance)}</dd>
              </div>
              <div>
                <dt>기대 초기화</dt>
                <dd class="num">
                  {Number.isFinite(result.expectedResets) ? `${formatDecimal(result.expectedResets, 1)}회` : "-"}
                  <span>{Number.isFinite(result.expectedResets) ? `메소 ${formatKoreanUnits(Math.round(result.expectedResets) * hexa.stat.resetMeso, { maxGroups: 2 })}` : ""}</span>
                </dd>
              </div>
            </dl>
            <p class="calc-big display num">
              {Number.isFinite(result.expectedFragments) ? `조각 ${formatComma(Math.round(result.expectedFragments))}개` : "-"}
              <span class="calc-big__note">Lv.{target}까지 기대값</span>
            </p>
          </>
        ) : null}
      </section>
    </div>
  );
}

/** @param {{ rows: SymbolRow[], setRows: (rows: SymbolRow[]) => void }} props */
function Symbols({ rows, setRows }) {
  const costs = rows.map((row) => symbolCost(symbolCosts[row.kind], row.level, row.target, row.growth));
  const totalMeso = costs.reduce((sum, cost) => sum + cost.meso, 0);
  const byKind = (/** @type {string} */ kind) => rows.reduce((sum, row, index) => (row.kind === kind ? sum + costs[index].symbols : sum), 0);
  const update = (/** @type {number} */ id, /** @type {Partial<SymbolRow>} */ patch) => setRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <div class="calc-grid">
      <section class="card calc-card">
        <h2 class="calc-card__title">심볼</h2>
        <div class="calc-rows">
          <div class="calc-row calc-row--head" aria-hidden="true">
            <span>지역</span>
            <span>현재</span>
            <span>목표</span>
            <span>심볼 · 메소</span>
          </div>
          {rows.map((row, index) => {
            const max = symbolCosts[row.kind].maxLevel;
            return (
              <div key={row.id} class={`calc-row is-${row.kind}`}>
                <span class="calc-row__name">
                  <span class={`calc-kind is-${row.kind}`}>{row.kind === "arcane" ? "아케인" : "어센틱"}</span>
                  <span class="calc-row__label">{row.name}</span>
                </span>
                <LevelInput value={row.level} min={1} max={max} label={`${row.name} 현재 레벨`} onChange={(level) => update(row.id, { level })} />
                <LevelInput value={row.target} min={1} max={max} label={`${row.name} 목표 레벨`} onChange={(target) => update(row.id, { target })} />
                <span class="calc-row__cost num">
                  {costs[index].symbols || costs[index].meso ? `${formatComma(costs[index].symbols)} · ${formatKoreanUnits(costs[index].meso, { maxGroups: 1 })}` : "-"}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <section class="card calc-card calc-result">
        <h2 class="calc-card__title">합계</h2>
        <dl class="calc-sum">
          <div>
            <dt>아케인 심볼</dt>
            <dd class="num">{formatComma(byKind("arcane"))}개</dd>
          </div>
          <div>
            <dt>어센틱 심볼</dt>
            <dd class="num">{formatComma(byKind("authentic"))}개</dd>
          </div>
        </dl>
        <p class="calc-big display num">
          {formatKoreanUnits(totalMeso, { maxGroups: 2 })}
          <span class="calc-big__note">메소</span>
        </p>
      </section>
    </div>
  );
}

/** "2027-09-02" → "27.9.2" */
const shortDate = (/** @type {string | null} */ date) => (date ? date.slice(2).replace(/-0?/g, ".") : "-");

/** 보스별 기본: 가장 높은 난이도 */
function defaultBossPicks() {
  const pick = (/** @type {{ boss: string, points: Record<string, number> }} */ entry) => [entry.boss, Object.keys(entry.points).at(-1) || ""];
  return Object.fromEntries([...liberationRules.weekly, ...liberationRules.monthly].map(pick));
}

/** @param {{ liberated: boolean }} props */
function Liberation({ liberated }) {
  const [chapter, setChapter] = useState(0);
  const [points, setPoints] = useState(0);
  const [picks, setPicks] = useState(defaultBossPicks);
  const [weeklyDone, setWeeklyDone] = useState(false);
  const [monthlyDone, setMonthlyDone] = useState(false);
  const sumOf = (/** @type {Array<{ boss: string, points: Record<string, number> }>} */ list) => list.reduce((sum, entry) => sum + (entry.points[picks[entry.boss]] || 0), 0);
  const weekly = sumOf(liberationRules.weekly);
  const monthly = sumOf(liberationRules.monthly);
  const today = kstToday();
  const plan = liberationPlan(liberationRules, { today, chapter, points, weekly, monthly, weeklyDone, monthlyDone });
  const chapterMax = liberationRules.chapters[chapter]?.points || 0;

  if (liberated) {
    return (
      <section class="card calc-card">
        <p class="calc-big display">
          해방 완료
          <span class="calc-big__note">제네시스 무기를 끼고 있어요</span>
        </p>
      </section>
    );
  }

  const bossRow = (/** @type {{ boss: string, points: Record<string, number> }} */ entry) => (
    <div class="calc-row calc-row--boss" key={entry.boss}>
      <span class="calc-row__label">{entry.boss}</span>
      <span class="select select--sm">
        <select aria-label={`${entry.boss} 난이도`} value={picks[entry.boss] || ""} onChange={(event) => setPicks({ ...picks, [entry.boss]: /** @type {HTMLSelectElement} */ (event.currentTarget).value })}>
          <option value="">안 함</option>
          {Object.keys(entry.points).map((difficulty) => (
            <option key={difficulty} value={difficulty}>
              {difficulty} · {entry.points[difficulty]}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={16} class="select__icon" />
      </span>
    </div>
  );

  return (
    <div class="calc-grid">
      <section class="card calc-card">
        <h2 class="calc-card__title">지금 진행</h2>
        <div class="calc-income">
          <div class="field">
            <label class="field__label" for="lib-chapter">
              지금 장
            </label>
            <span class="select">
              <select id="lib-chapter" value={chapter} onChange={(event) => setChapter(Number(/** @type {HTMLSelectElement} */ (event.currentTarget).value))}>
                {liberationRules.chapters.map((entry, index) => (
                  <option key={entry.name} value={index}>
                    {index + 1}장 {entry.name}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={18} class="select__icon" />
            </span>
          </div>
          <NumberField id="lib-points" label={`모은 포인트 (/${formatComma(chapterMax)})`} value={points} onChange={(value) => setPoints(Math.min(chapterMax, value))} />
        </div>
        <h2 class="calc-card__title">
          매주 잡는 보스 <span class="calc-card__sub num">{formatComma(weekly)}</span>
        </h2>
        <div class="calc-rows calc-rows--boss">{liberationRules.weekly.map(bossRow)}</div>
        <h2 class="calc-card__title">
          매달 <span class="calc-card__sub num">{formatComma(monthly)}</span>
        </h2>
        <div class="calc-rows calc-rows--boss">{liberationRules.monthly.map(bossRow)}</div>
        <label class="calc-check">
          <input type="checkbox" checked={weeklyDone} onChange={(e) => setWeeklyDone(/** @type {HTMLInputElement} */ (e.currentTarget).checked)} />
          <span>이번 주 보스는 이미 잡음</span>
        </label>
        <label class="calc-check">
          <input type="checkbox" checked={monthlyDone} onChange={(e) => setMonthlyDone(/** @type {HTMLInputElement} */ (e.currentTarget).checked)} />
          <span>이번 달 검은 마법사는 이미 잡음</span>
        </label>
      </section>

      <section class="card calc-card calc-result">
        <h2 class="calc-card__title">해방 예정</h2>
        <p class="calc-big display num">
          {plan.finishDate ? shortDate(plan.finishDate) : "-"}
          <span class="calc-big__note">{plan.days !== null ? `${formatComma(plan.days)}일 뒤 · ${formatComma(plan.current)} / ${formatComma(plan.total)}` : "포인트를 얻는 보스를 골라 주세요"}</span>
        </p>
        <ol class="calc-timeline">
          {plan.chapters.map((entry, index) => {
            const milestone = plan.milestones.find((item) => item.at === entry.start && item.at > 0);
            return (
              <li key={entry.name} class={index < chapter || (index === chapter && points >= (liberationRules.chapters[index]?.points || 0)) ? "is-done" : index === chapter ? "is-now" : ""}>
                <span class="calc-timeline__name">
                  {index + 1}장 {entry.name}
                  {milestone ? <span class="calc-timeline__tag">{milestone.name}</span> : null}
                </span>
                <span class="calc-timeline__date num">{index <= chapter ? "" : shortDate(entry.startDate)}</span>
              </li>
            );
          })}
          <li class="is-goal">
            <span class="calc-timeline__name">
              해방 완료 <span class="calc-timeline__tag">2차 해방</span>
            </span>
            <span class="calc-timeline__date num">{shortDate(plan.finishDate)}</span>
          </li>
        </ol>
      </section>
    </div>
  );
}

const VIEWS = CALC_VIEWS;
// 캐릭터를 불러와 채우는 계산기(나머지는 캐릭터와 상관없다).
const CHARACTER_VIEWS = ["hexa", "stat", "symbol", "liberation"];

function readView() {
  const view = new URLSearchParams(window.location.search).get("view");
  return VIEWS.some((item) => item.value === view) ? /** @type {string} */ (view) : "liberation";
}

function readWho() {
  const [world = "", ...rest] = String(new URLSearchParams(window.location.search).get("a") || "").split("/");
  return { world: WORLDS.includes(world) ? world : DEFAULT_WORLD, name: rest.join("/").trim().slice(0, 24) };
}

export function Calc() {
  const [view, setView] = useState(readView);
  const [who, setWho] = useState(readWho);
  const [cores, setCores] = useState(defaultCores);
  const [symbols, setSymbols] = useState(defaultSymbols);
  const [liberated, setLiberated] = useState(false);
  const [load, setLoad] = useState(/** @type {{ status: "idle" | "loading" | "done" | "error", text?: string }} */ ({ status: "idle" }));

  const onView = (/** @type {string} */ next) => {
    setView(next);
    const params = new URLSearchParams(window.location.search);
    params.set("view", next);
    window.history.replaceState(null, "", `/calc?${params}`);
  };

  const onLoad = async (event) => {
    event.preventDefault();
    const name = who.name.replace(/\s+/g, "");
    if (!name) return;
    setLoad({ status: "loading" });
    try {
      const data = await loadCharacterPage(who.world, name);
      const skills = Array.isArray(data.tabs?.hexamatrix?.hexaSkills) ? data.tabs.hexamatrix.hexaSkills : [];
      const nextCores = skills
        .map((skill) => ({ id: newId(), name: skill.skillName, type: coreTypeOf(skill), level: clampLevel(skill.slotLevel ?? skill.skillLevel, 0, 30), target: 30 }))
        .filter((row) => row.type);
      const symbolTab = data.tabs?.jewelSymbolVmatrix?.symbol || {};
      const toRow = (/** @type {any} */ symbol, /** @type {"arcane" | "authentic"} */ kind) => ({
        id: newId(),
        name: String(symbol.symbolName || "").replace(/^.*?:\s*/, ""),
        kind,
        level: clampLevel(symbol.symbolLevel, 1, symbolCosts[kind].maxLevel),
        growth: Math.max(0, Number(symbol.symbolGrowthValue) || 0),
        target: symbolCosts[kind].maxLevel
      });
      const nextSymbols = [
        ...(symbolTab.arcaneSymbols || []).map((symbol) => toRow(symbol, "arcane")),
        ...(symbolTab.authenticSymbols || []).map((symbol) => toRow(symbol, "authentic"))
      ];
      const presets = Array.isArray(data.tabs?.equipment?.presets) ? data.tabs.equipment.presets : [];
      setLiberated(presets.some((preset) => (preset?.data?.itemEquipment || []).some((item) => /제네시스/.test(String(item?.itemName || "")))));
      if (nextCores.length) setCores(nextCores);
      if (nextSymbols.length) setSymbols(nextSymbols);
      setLoad({ status: "done", text: `${data.profile?.name || name}의 HEXA 코어 ${nextCores.length}개 · 심볼 ${nextSymbols.length}개를 채웠어요.` });
      const params = new URLSearchParams(window.location.search);
      params.set("a", `${who.world}/${name}`);
      window.history.replaceState(null, "", `/calc?${params}`);
    } catch (error) {
      setLoad({ status: "error", text: /** @type {any} */ (error)?.message || "캐릭터를 불러오지 못했어요." });
    }
  };

  return (
    <div class="calc">
      <header class="page-head page-head--rank tone-mint">
        <Aurora tone="mint" />
        <span class="page-head__icon" aria-hidden="true">
          <Icon name="hourglass" size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText text="계산기" />
        </h1>
      </header>

      {CHARACTER_VIEWS.includes(view) ? (
        <form class="card calc-who" onSubmit={onLoad} aria-label="캐릭터 불러오기">
          <span class="select">
            <select aria-label="월드" value={who.world} onChange={(event) => setWho({ ...who, world: /** @type {HTMLSelectElement} */ (event.currentTarget).value })}>
              {WORLDS.map((world) => (
                <option key={world} value={world}>
                  {world}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={18} class="select__icon" />
          </span>
          <input
            class="input"
            type="text"
            maxLength={24}
            autoComplete="off"
            spellcheck={false}
            aria-label="캐릭터 이름"
            placeholder="캐릭터 이름 (지금 레벨 채우기)"
            value={who.name}
            onInput={(event) => setWho({ ...who, name: /** @type {HTMLInputElement} */ (event.currentTarget).value })}
          />
          <button type="submit" class="btn btn--primary" disabled={load.status === "loading" || !who.name.trim()}>
            <Icon name="download" size={18} />
            {load.status === "loading" ? "불러오는 중" : "불러오기"}
          </button>
          {load.text ? <p class={`calc-who__msg is-${load.status}`}>{load.text}</p> : null}
        </form>
      ) : null}

      <div class="calc-switch">
        <Segmented name="calc-view" legend="계산기 종류" value={view} onChange={onView} options={VIEWS} />
      </div>

      {view === "hexa" ? <HexaCores rows={cores} setRows={setCores} /> : null}
      {view === "stat" ? <HexaStat /> : null}
      {view === "symbol" ? <Symbols rows={symbols} setRows={setSymbols} /> : null}
      {view === "liberation" ? <Liberation liberated={liberated} /> : null}
      {view === "starforce" ? <StarforceCalc /> : null}
      {view === "emblem" ? <EmblemCalc /> : null}
      {view === "polish" ? <PolishCalc /> : null}
      {view === "transfer" ? <TransferCalc /> : null}
      {view === "guild" ? <GuildAbilityCalc /> : null}
      {view === "gacha" ? <GachaCalc /> : null}
      {view === "itemdb" ? <ItemDbCalc /> : null}
    </div>
  );
}
