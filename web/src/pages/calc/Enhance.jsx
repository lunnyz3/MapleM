// 강화 계산기 탭: 스타포스(기댓값·한 번 돌려 보기) · 문장 강화 · 장신구 연마 · 장비 전수 · 길드 어빌리티 정산.
// 계산은 web/src/lib/enhanceCalc.mjs, 표는 src/game-data/enhance.json.
import rules from "../../../../src/game-data/enhance.json";
import { useMemo, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { Segmented } from "../../components/Tabs.jsx";
import { toast } from "../../components/Toast.jsx";
import { emblemCost, guildAbilityCost, polishTable, simulateStarforce, starforceExpectation, starforceOdds, transferCost } from "../../lib/enhanceCalc.mjs";
import { formatComma, formatDecimal, formatKoreanUnits } from "../../lib/format.js";
import { copyText } from "../../lib/share.js";

/** 437억 2,000만 */
const meso = (/** @type {number} */ value) => (Number.isFinite(value) ? formatKoreanUnits(Math.round(value), { maxGroups: 2 }) : "-");
const pct = (/** @type {number} */ value, digits = 1) => `${formatDecimal(value, digits)}%`;
const range = (/** @type {number} */ from, /** @type {number} */ to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

/** @param {{ id: string, label: string, value: number | string, options: Array<{ value: number | string, label: string }>, onChange: (value: string) => void }} props */
function SelectField({ id, label, value, options, onChange }) {
  return (
    <div class="field">
      <label class="field__label" for={id}>
        {label}
      </label>
      <span class="select">
        <select id={id} value={value} onChange={(event) => onChange(/** @type {HTMLSelectElement} */ (event.currentTarget).value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={18} class="select__icon" />
      </span>
    </div>
  );
}

/** @param {{ id: string, label: string, value: number, onChange: (value: number) => void, step?: number, min?: number, max?: number }} props */
function NumberInput({ id, label, value, onChange, step = 1, min = 0, max }) {
  return (
    <div class="field">
      <label class="field__label" for={id}>
        {label}
      </label>
      <input
        id={id}
        class="input num"
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(event) => {
          const next = Number(/** @type {HTMLInputElement} */ (event.currentTarget).value);
          onChange(Number.isFinite(next) ? Math.max(min, max === undefined ? next : Math.min(max, next)) : min);
        }}
      />
    </div>
  );
}

/** @param {{ label: string, checked: boolean, onChange: (checked: boolean) => void }} props */
function Check({ label, checked, onChange }) {
  return (
    <label class="calc-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(/** @type {HTMLInputElement} */ (event.currentTarget).checked)} />
      <span>{label}</span>
    </label>
  );
}

// ---------------- 스타포스 ----------------

export function StarforceCalc() {
  const [kind, setKind] = useState("equip");
  const [from, setFrom] = useState(30);
  const [to, setTo] = useState(35);
  const [lucky, setLucky] = useState(0);
  const [protectDrop, setProtectDrop] = useState(true);
  const [protectDestroy, setProtectDestroy] = useState(true);
  const [runs, setRuns] = useState(/** @type {any[]} */ ([]));
  const accessory = kind === "accessory";
  const maxStar = accessory ? 10 : Math.max(...Object.keys(rules.starforce.rates).map(Number));
  const start = Math.min(from, maxStar - 1);
  const goal = Math.min(maxStar, Math.max(start + 1, to));
  const options = {
    lucky: accessory ? 0 : lucky,
    protectDrop: !accessory && protectDrop,
    protectDestroy: !accessory && protectDestroy,
    accessory
  };
  const result = useMemo(() => starforceExpectation(rules, start, goal, options), [start, goal, lucky, protectDrop, protectDestroy, accessory]);

  const roll = () => {
    const run = simulateStarforce(rules, start, goal, options);
    setRuns([{ ...run, id: Date.now() + Math.random() }, ...runs].slice(0, 6));
  };

  return (
    <div class="calc-grid">
      <section class="card calc-card">
        <h2 class="calc-card__title">스타포스</h2>
        <div class="calc-seg">
          <Segmented
            name="sf-kind"
            legend="장비 종류"
            value={kind}
            onChange={(next) => {
              setKind(next);
              setRuns([]);
              if (next === "accessory") {
                setFrom(0);
                setTo(10);
              }
            }}
            options={[
              { value: "equip", label: "일반 장비" },
              { value: "accessory", label: "장신구 (10성까지)" }
            ]}
          />
        </div>
        <div class="calc-income">
          <SelectField
            id="sf-from"
            label="지금 성"
            value={start}
            options={range(0, maxStar - 1).map((star) => ({
              value: star,
              label: `${star}성`
            }))}
            onChange={(value) => setFrom(Number(value))}
          />
          <SelectField
            id="sf-to"
            label="목표 성"
            value={goal}
            options={range(start + 1, maxStar).map((star) => ({
              value: star,
              label: `${star}성`
            }))}
            onChange={(value) => setTo(Number(value))}
          />
          {accessory ? null : (
            <SelectField
              id="sf-lucky"
              label="럭키데이 주문서"
              value={lucky}
              options={rules.starforce.luckyDay.map((value) => ({
                value,
                label: value ? `+${value}%p` : "안 씀"
              }))}
              onChange={(value) => setLucky(Number(value))}
            />
          )}
        </div>
        {accessory ? (
          <p class="calc-note">장신구는 연마 표 확률을 쓰고, 실패하면 단계가 그대로예요.</p>
        ) : (
          <div class="calc-checks">
            <Check label="하락 방지" checked={protectDrop} onChange={setProtectDrop} />
            <Check label="파괴 방지" checked={protectDestroy} onChange={setProtectDestroy} />
          </div>
        )}
        <div class="calc-table-wrap">
          <table class="calc-table">
            <thead>
              <tr>
                <th scope="col">강화</th>
                <th scope="col">성공</th>
                <th scope="col">유지</th>
                <th scope="col">하락</th>
                <th scope="col">파괴</th>
              </tr>
            </thead>
            <tbody>
              {range(start, goal - 1).map((star) => {
                const odds = starforceOdds(rules, star, options);
                return (
                  <tr key={star}>
                    <td class="num">
                      {star}→{star + 1}
                    </td>
                    <td class="num">{pct(odds.success)}</td>
                    <td class="num">{pct(odds.stay)}</td>
                    <td class="num">{odds.drop ? pct(odds.drop) : "-"}</td>
                    <td class="num">{odds.destroy ? pct(odds.destroy) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card calc-card calc-result">
        <h2 class="calc-card__title">결과</h2>
        <p class="calc-big display num">
          {Number.isFinite(result.tries) ? `${formatComma(Math.round(result.tries))}회` : "-"}
          <span class="calc-big__note">
            {start}성 → {goal}성 평균 강화 횟수
          </span>
        </p>
        <dl class="calc-sum">
          <div>
            <dt>도중에 파괴될 확률</dt>
            <dd class="num">{result.destroyChance > 0 ? pct(result.destroyChance * 100, result.destroyChance < 0.01 ? 3 : 1) : "없음"}</dd>
          </div>
          {options.protectDrop || options.protectDestroy ? (
            <div>
              <dt>방지권 (평균)</dt>
              <dd class="num">
                {[options.protectDrop ? "하락" : "", options.protectDestroy ? "파괴" : ""].filter(Boolean).join("·")} 각 {formatComma(Math.round(result.tries))}
                장
              </dd>
            </div>
          ) : null}
          {options.lucky ? (
            <div>
              <dt>럭키데이 주문서 (평균)</dt>
              <dd class="num">{formatComma(Math.round(result.tries))}장</dd>
            </div>
          ) : null}
        </dl>
        <button type="button" class="btn btn--primary" onClick={roll}>
          <Icon name="sparkle" size={18} />한 번 돌려 보기
        </button>
        {runs.length ? (
          <ol class="calc-runs">
            {runs.map((run) => (
              <li key={run.id} class={run.destroyed ? "is-bad" : "is-good"}>
                <strong class="num">{run.destroyed ? `${run.star}성에서 파괴` : `${run.star}성 달성`}</strong>
                <span class="num">
                  {formatComma(run.tries)}회{run.drops ? ` · 하락 ${formatComma(run.drops)}번` : ""}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </div>
  );
}

// ---------------- 문장 ----------------

export function EmblemCalc() {
  const defaults = rules.emblem.defaults;
  const [markPriceMan, setMarkPrice] = useState(defaults.markPriceMan);
  const [krwPerEok, setKrw] = useState(defaults.krwPerEok);
  const [lv1PriceEok, setLv1] = useState(defaults.lv1PriceEok);
  const [targetLevel, setTarget] = useState(defaults.targetLevel);
  const result = useMemo(() => emblemCost(rules, { markPriceMan, krwPerEok, lv1PriceEok, targetLevel }), [markPriceMan, krwPerEok, lv1PriceEok, targetLevel]);

  return (
    <div class="calc-grid">
      <section class="card calc-card">
        <h2 class="calc-card__title">문장 강화</h2>
        <div class="calc-income">
          <NumberInput id="em-mark" label="마력의 증표 시세 (만 메소)" value={markPriceMan} onChange={setMarkPrice} />
          <NumberInput id="em-krw" label="메소 시세 (원 / 1억)" value={krwPerEok} onChange={setKrw} />
          <NumberInput id="em-lv1" label="Lv.1 문장 가격 (억)" value={lv1PriceEok} onChange={setLv1} step={0.1} />
          <SelectField
            id="em-target"
            label="목표 레벨"
            value={targetLevel}
            options={range(2, rules.emblem.steps.length + 1).map((level) => ({
              value: level,
              label: `Lv.${level}`
            }))}
            onChange={(value) => setTarget(Number(value))}
          />
        </div>
        <div class="calc-table-wrap">
          <table class="calc-table">
            <thead>
              <tr>
                <th scope="col">강화</th>
                <th scope="col">성공</th>
                <th scope="col">증표 (평균)</th>
                <th scope="col">비용 (평균)</th>
              </tr>
            </thead>
            <tbody>
              {result.steps.map((step) => (
                <tr key={step.level} class={step.counted ? "" : "is-muted"}>
                  <td class="num">
                    Lv.{step.level}→{step.level + 1}
                  </td>
                  <td class="num">{pct(step.probability * 100, 0)}</td>
                  <td class="num">{formatDecimal(step.marks, 1)}개</td>
                  <td class="num">{meso(step.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="calc-note">실패해도 레벨은 그대로이고, 시도마다 메소와 증표가 들어요.</p>
      </section>

      <section class="card calc-card calc-result">
        <h2 class="calc-card__title">결과</h2>
        <p class="calc-big display num">
          {meso(result.total)}
          <span class="calc-big__note">Lv.{targetLevel}까지 총 비용 (Lv.1 구매 포함)</span>
        </p>
        <dl class="calc-sum">
          <div>
            <dt>강화 비용만</dt>
            <dd class="num">{meso(result.enhance)}</dd>
          </div>
          <div>
            <dt>현금으로</dt>
            <dd class="num">약 {formatComma(result.cash)}원</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

// ---------------- 장신구 연마 ----------------

const MVP_LABELS = {
  일반: "일반",
  골드: "골드 (3%)",
  다이아: "다이아 (5%)",
  레드: "레드 (7%)"
};

export function PolishCalc() {
  const [track, setTrack] = useState(/** @type {"other" | "belt"} */ ("other"));
  const [mvp, setMvp] = useState("일반");
  const rows = useMemo(() => polishTable(rules, track, rules.polish.mvpDiscount[mvp] || 0), [track, mvp]);
  const last = rows[rows.length - 1];

  return (
    <div class="calc-grid">
      <section class="card calc-card">
        <h2 class="calc-card__title">장신구 연마</h2>
        <div class="calc-seg">
          <Segmented
            name="polish-track"
            legend="장비"
            value={track}
            onChange={(next) => setTrack(/** @type {"other" | "belt"} */ (next))}
            options={[
              { value: "other", label: "루컨마·마깃안·마도서·미트라" },
              { value: "belt", label: "몽환의 벨트" }
            ]}
          />
        </div>
        <SelectField
          id="polish-mvp"
          label="MVP 할인"
          value={mvp}
          options={Object.entries(MVP_LABELS).map(([value, label]) => ({
            value,
            label
          }))}
          onChange={setMvp}
        />
        <div class="calc-table-wrap">
          <table class="calc-table">
            <thead>
              <tr>
                <th scope="col">단계</th>
                <th scope="col">성공</th>
                <th scope="col">1회 메소</th>
                <th scope="col">평균 메소</th>
                <th scope="col">누적 메소</th>
                <th scope="col">평균 재료</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.level}>
                  <td class="num">Lv.{row.level}</td>
                  <td class="num">{pct(row.probability * 100)}</td>
                  <td class="num">{meso(row.cost)}</td>
                  <td class="num">{meso(row.meso)}</td>
                  <td class="num">{meso(row.mesoSum)}</td>
                  <td class="num">{formatDecimal(row.material, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="calc-note">실패해도 단계는 그대로예요(하락·파괴 없음). 재료는 개수만 셉니다.</p>
      </section>

      <section class="card calc-card calc-result">
        <h2 class="calc-card__title">결과</h2>
        <p class="calc-big display num">
          {meso(last.mesoSum)}
          <span class="calc-big__note">Lv.{last.level}까지 평균 메소</span>
        </p>
        <dl class="calc-sum">
          <div>
            <dt>평균 재료</dt>
            <dd class="num">{formatDecimal(last.materialSum, 1)}개</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

// ---------------- 장비 전수 ----------------

const TRANSFER_PRESETS = {
  full: {
    label: "풀 전수",
    starforce: 35,
    potential: ["레전드리", 3],
    additionalPotential: ["레전드리", 3],
    additional: ["유니크", 2],
    greatSoul: true
  },
  main: {
    label: "주력",
    starforce: 35,
    potential: ["레전드리", 3],
    additionalPotential: ["에픽", 2],
    additional: ["에픽", 2],
    greatSoul: false
  },
  value: {
    label: "가성비",
    starforce: 20,
    potential: ["에픽", 3],
    additionalPotential: ["에픽", 2],
    additional: ["에픽", 2],
    greatSoul: false
  },
  star: {
    label: "스타포스만",
    starforce: 35,
    potential: null,
    additionalPotential: null,
    additional: null,
    greatSoul: false
  }
};
const ADDITIONAL_LABELS = { 레어: "환불", 에픽: "강환불", 유니크: "영환불" };

/** 등급·줄 수 고르기(끄면 null). */
function GradeLines({ id, label, value, last, grades, lines, onChange }) {
  const on = Boolean(value);
  const current = value || last;
  return (
    <div class="calc-transfer-row">
      <Check label={label} checked={on} onChange={(checked) => onChange(checked ? current : null)} />
      <span class={`select select--sm${on ? "" : " is-off"}`}>
        <select
          id={`${id}-grade`}
          aria-label={`${label} 등급`}
          disabled={!on}
          value={current[0]}
          onChange={(event) => onChange([/** @type {HTMLSelectElement} */ (event.currentTarget).value, current[1]])}
        >
          {grades.map(([grade, text]) => (
            <option key={grade} value={grade}>
              {text}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={16} class="select__icon" />
      </span>
      <span class={`select select--sm${on ? "" : " is-off"}`}>
        <select
          id={`${id}-lines`}
          aria-label={`${label} 줄 수`}
          disabled={!on}
          value={current[1]}
          onChange={(event) => onChange([current[0], Number(/** @type {HTMLSelectElement} */ (event.currentTarget).value)])}
        >
          {lines.map((count) => (
            <option key={count} value={count}>
              {count}줄
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={16} class="select__icon" />
      </span>
    </div>
  );
}

export function TransferCalc() {
  const [receiver, setReceiver] = useState("200");
  const [preset, setPreset] = useState("full");
  const [state, setState] = useState(/** @type {any} */ ({ ...TRANSFER_PRESETS.full, starOn: true }));
  const [last, setLast] = useState(
    /** @type {any} */ ({
      potential: ["레전드리", 3],
      additionalPotential: ["레전드리", 3],
      additional: ["유니크", 2]
    })
  );
  const update = (/** @type {any} */ patch) => {
    setPreset("");
    setState({ ...state, ...patch });
    for (const key of ["potential", "additionalPotential", "additional"]) if (patch[key]) setLast({ ...last, [key]: patch[key] });
  };
  const result = transferCost(rules, {
    receiver,
    starforce: state.starOn ? state.starforce : null,
    potential: state.potential,
    additionalPotential: state.additionalPotential,
    additional: state.additional,
    greatSoul: state.greatSoul
  });
  const cubeGrades = [
    ["에픽", "에픽"],
    ["유니크", "유니크"],
    ["레전드리", "레전드리"]
  ];

  return (
    <div class="calc-grid">
      <section class="card calc-card">
        <h2 class="calc-card__title">장비 전수</h2>
        <SelectField
          id="tr-receiver"
          label="받는 장비"
          value={receiver}
          options={Object.entries(rules.transfer.receivers).map(([value, item]) => ({ value, label: item.label }))}
          onChange={setReceiver}
        />
        <div class="calc-presets" role="group" aria-label="자주 쓰는 구성">
          {Object.entries(TRANSFER_PRESETS).map(([key, item]) => (
            <button
              key={key}
              type="button"
              class={`btn btn--sm ${preset === key ? "btn--primary" : "btn--secondary"}`}
              aria-pressed={preset === key ? "true" : "false"}
              onClick={() => {
                setPreset(key);
                setState({ ...item, starOn: true });
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div class="calc-transfer">
          <div class="calc-transfer-row">
            <Check label="스타포스" checked={state.starOn} onChange={(checked) => update({ starOn: checked })} />
            <input
              class="input input--sm num"
              type="number"
              inputMode="numeric"
              min={0}
              max={40}
              aria-label="스타포스 성"
              disabled={!state.starOn}
              value={state.starforce}
              onInput={(event) =>
                update({
                  starforce: Math.max(0, Math.min(40, Math.floor(Number(/** @type {HTMLInputElement} */ (event.currentTarget).value) || 0)))
                })
              }
            />
            <span class="calc-transfer-unit">성</span>
          </div>
          <GradeLines
            id="tr-pot"
            label="잠재능력"
            value={state.potential}
            last={last.potential}
            grades={cubeGrades}
            lines={[2, 3]}
            onChange={(value) => update({ potential: value })}
          />
          <GradeLines
            id="tr-add-pot"
            label="에디셔널"
            value={state.additionalPotential}
            last={last.additionalPotential}
            grades={cubeGrades}
            lines={[2, 3]}
            onChange={(value) => update({ additionalPotential: value })}
          />
          <GradeLines
            id="tr-add"
            label="추가 옵션"
            value={state.additional}
            last={last.additional}
            grades={Object.entries(ADDITIONAL_LABELS)}
            lines={[1, 2]}
            onChange={(value) => update({ additional: value })}
          />
          <div class="calc-transfer-row">
            <Check label="위대한 소울" checked={state.greatSoul} onChange={(checked) => update({ greatSoul: checked })} />
          </div>
        </div>
      </section>

      <section class="card calc-card calc-result">
        <h2 class="calc-card__title">결과</h2>
        <p class="calc-big display num">
          주문서 {formatComma(result.scrolls)}장<span class="calc-big__note">메소 {meso(result.meso)}</span>
        </p>
        <dl class="calc-sum">
          {result.rows.map((row) => (
            <div key={row.key}>
              <dt>{row.label}</dt>
              <dd class="num">
                {formatComma(row.scrolls)}장<span>{meso(row.meso)}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p class="calc-note">항목마다 주문서를 올림해서 더해요. 비용은 받는 장비 등급으로만 정해져요.</p>
      </section>
    </div>
  );
}

// ---------------- 길드 어빌리티 ----------------

const skillKey = (/** @type {string} */ tier, /** @type {string} */ name) => `${tier}|${name}`;

/** @param {"min" | "max"} mode @param {Record<string, { current: number, target: number }>} [levels] */
function allLevels(mode, levels = {}) {
  /** @type {Record<string, { current: number, target: number }>} */
  const next = {};
  for (const tier of rules.guildAbility.tiers) {
    for (const skill of tier.skills) {
      const key = skillKey(tier.tier, skill.name);
      const current = levels[key]?.current ?? 1;
      next[key] = {
        current,
        target: mode === "max" ? skill.exp.length + 1 : current
      };
    }
  }
  return next;
}

export function GuildAbilityCalc() {
  const [members, setMembers] = useState(30);
  const [levels, setLevels] = useState(() => allLevels("max"));
  const result = useMemo(() => guildAbilityCost(rules, levels, members), [levels, members]);
  const setLevel = (/** @type {string} */ key, /** @type {"current" | "target"} */ field, /** @type {number} */ value, /** @type {number} */ max) => {
    const now = levels[key] || { current: 1, target: 1 };
    const next = { ...now, [field]: value };
    if (field === "current" && next.target < value) next.target = value;
    if (field === "target") next.target = Math.max(next.current, Math.min(max, value));
    setLevels({ ...levels, [key]: next });
  };
  const summary = () =>
    [
      `[길드 어빌리티 정산 (${members}명 기준)]`,
      `1인당 활성석: 골드 ${result.goldPer}개 / 블랙 ${result.blackPer}개`,
      `1인당 GP: ${formatComma(result.gpPer)}`,
      `길드 총 GP: ${formatComma(result.gpTotal)} (골드 ${formatComma(result.goldPer * members)} / 블랙 ${formatComma(result.blackPer * members)})`
    ].join("\n");

  return (
    <div class="calc-grid">
      <section class="card calc-card">
        <h2 class="calc-card__title">길드 어빌리티</h2>
        <div class="calc-income">
          <NumberInput
            id="ga-members"
            label="길드원 수"
            value={members}
            min={1}
            max={rules.guildAbility.membersMax}
            onChange={(value) => setMembers(Math.floor(value) || 1)}
          />
          <div class="calc-presets calc-presets--end" role="group" aria-label="목표 레벨 한 번에 바꾸기">
            <button type="button" class="btn btn--secondary btn--sm" onClick={() => setLevels(allLevels("max", levels))}>
              전체 최대
            </button>
            <button type="button" class="btn btn--secondary btn--sm" onClick={() => setLevels(allLevels("min", levels))}>
              목표 초기화
            </button>
          </div>
        </div>
        <div class="calc-guild">
          {rules.guildAbility.tiers.map((tier) => (
            <section key={tier.tier} class="calc-guild__tier">
              <h3 class="calc-guild__title">
                {tier.tier} <span class="badge">{tier.grade}</span>
              </h3>
              {tier.skills.map((skill) => {
                const key = skillKey(tier.tier, skill.name);
                const max = skill.exp.length + 1;
                const level = levels[key] || { current: 1, target: 1 };
                const levelOptions = (/** @type {number} */ from) =>
                  range(from, max).map((value) => ({
                    value,
                    label: `Lv.${value}`
                  }));
                return (
                  <div key={key} class="calc-guild__row">
                    <span class="calc-guild__name">
                      {skill.name}
                      <small>
                        {skill.stat} {skill.values[level.target - 1]}
                      </small>
                    </span>
                    <span class="select select--sm">
                      <select
                        aria-label={`${tier.tier} ${skill.name} 지금 레벨`}
                        value={level.current}
                        onChange={(event) => setLevel(key, "current", Number(/** @type {HTMLSelectElement} */ (event.currentTarget).value), max)}
                      >
                        {levelOptions(1).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <Icon name="chevronDown" size={16} class="select__icon" />
                    </span>
                    <Icon name="arrowRight" size={14} />
                    <span class="select select--sm">
                      <select
                        aria-label={`${tier.tier} ${skill.name} 목표 레벨`}
                        value={level.target}
                        onChange={(event) => setLevel(key, "target", Number(/** @type {HTMLSelectElement} */ (event.currentTarget).value), max)}
                      >
                        {levelOptions(level.current).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <Icon name="chevronDown" size={16} class="select__icon" />
                    </span>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </section>

      <section class="card calc-card calc-result">
        <h2 class="calc-card__title">결과</h2>
        <p class="calc-big display num">
          {formatComma(result.gpPer)} GP
          <span class="calc-big__note">
            1인당 (골드 {result.goldPer}개 · 블랙 {result.blackPer}개)
          </span>
        </p>
        <dl class="calc-sum">
          <div>
            <dt>필요 길드 EXP</dt>
            <dd class="num">{formatComma(result.exp)}</dd>
          </div>
          <div>
            <dt>길드 총 GP</dt>
            <dd class="num">{formatComma(result.gpTotal)}</dd>
          </div>
        </dl>
        {result.buffs.length ? (
          <ul class="calc-buffs">
            {result.buffs.map((buff) => (
              <li key={buff.stat}>
                <span>{buff.stat}</span>
                <strong class="num">
                  +{formatDecimal(buff.value, 1)}
                  {buff.unit}
                </strong>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          class="btn btn--secondary"
          onClick={async () => toast((await copyText(summary())) ? "정산 문구를 복사했어요" : "복사하지 못했어요", "success")}
        >
          <Icon name="link" size={18} />
          단톡방용 정산 문구 복사
        </button>
        <p class="calc-note">활성석은 스킬마다 올림(8차 골드 40 EXP, 나머지 블랙 30 EXP), 1인당은 다시 올림해요. GP = 골드 500 · 블랙 150.</p>
      </section>
    </div>
  );
}
