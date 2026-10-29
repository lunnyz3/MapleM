// 확률 계산기 탭: 스타코러스 재설정 · 빛의 성소 기도 · 자석펫 원더베리. 목표 이상이 한 번에 나올 확률과 평균 시도 수.
import rules from "../../../../src/game-data/gacha.json";
import { useMemo, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { Segmented } from "../../components/Tabs.jsx";
import { magnetPetOdds, sanctuaryOdds, sanctuaryValues, starChorusOdds } from "../../lib/gachaCalc.mjs";
import { formatComma, formatDecimal } from "../../lib/format.js";

const pct = (/** @type {number} */ chance) => `${formatDecimal(chance * 100, chance < 0.001 ? 4 : chance < 0.01 ? 3 : 2)}%`;
const times = (/** @type {number} */ value) => (Number.isFinite(value) ? `${formatComma(Math.ceil(value))}` : "-");

/** @param {{ id: string, label: string, value: string | number, options: Array<{ value: string | number, label: string }>, onChange: (value: string) => void }} props */
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

function StarChorus() {
  const [mode, setMode] = useState(/** @type {"maxDamage" | "finalDamage"} */ ("maxDamage"));
  const rows = rules.starChorus[mode];
  const [target, setTarget] = useState(rows[0].value);
  const [price, setPrice] = useState(rules.starChorus.cerionPriceEok);
  const goal = rows.some((row) => row.value === target) ? target : rows[0].value;
  const result = starChorusOdds({ ...rules.starChorus, cerionPriceEok: price }, mode, goal);
  return (
    <div class="calc-grid">
      <section class="card calc-card">
        <h2 class="calc-card__title">스타코러스 재설정</h2>
        <div class="calc-seg">
          <Segmented
            name="sc-mode"
            legend="옵션"
            value={mode}
            onChange={(next) => {
              setMode(/** @type {any} */ (next));
              setTarget(rules.starChorus[next][0].value);
            }}
            options={[
              { value: "maxDamage", label: "최대 대미지" },
              { value: "finalDamage", label: "최종 대미지" }
            ]}
          />
        </div>
        <div class="calc-income">
          <SelectField
            id="sc-target"
            label="목표(이상)"
            value={goal}
            options={rows.map((row) => ({ value: row.value, label: row.label }))}
            onChange={(value) => setTarget(Number(value))}
          />
          <div class="field">
            <label class="field__label" for="sc-price">
              세리온 시세 (억 메소)
            </label>
            <input
              id="sc-price"
              class="input num"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              value={price}
              onInput={(event) => setPrice(Math.max(0, Number(/** @type {HTMLInputElement} */ (event.currentTarget).value) || 0))}
            />
          </div>
        </div>
        <div class="calc-table-wrap">
          <table class="calc-table">
            <thead>
              <tr>
                <th scope="col">값</th>
                <th scope="col">확률</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.value} class={row.value >= goal ? "" : "is-muted"}>
                  <td class="num">{row.label}</td>
                  <td class="num">{pct(row.p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section class="card calc-card calc-result">
        <h2 class="calc-card__title">결과</h2>
        <p class="calc-big display num">
          {times(result.resets)}번<span class="calc-big__note">목표 이상까지 평균 재설정 (한 번에 {pct(result.chance)})</span>
        </p>
        <dl class="calc-sum">
          <div>
            <dt>세리온</dt>
            <dd class="num">{times(result.cerion)}개</dd>
          </div>
          <div>
            <dt>메소</dt>
            <dd class="num">{Number.isFinite(result.costEok) ? `${formatDecimal(result.costEok, 1)}억` : "-"}</dd>
          </div>
        </dl>
        <p class="calc-note">재설정 1번에 세리온 {rules.starChorus.cerionPerReset}개.</p>
      </section>
    </div>
  );
}

function Sanctuary() {
  const levels = Object.keys(rules.sanctuary.levels)
    .map(Number)
    .sort((a, b) => a - b);
  const [level, setLevel] = useState(levels[levels.length - 1]);
  const table = rules.sanctuary.levels[String(level)] || {};
  const options = Object.keys(table);
  const [option, setOption] = useState("물리 공격력");
  const name = options.includes(option) ? option : options[0];
  const values = useMemo(() => sanctuaryValues(table, name), [table, name]);
  const [target, setTarget] = useState(/** @type {number | null} */ (null));
  const goal = target !== null && values.includes(target) ? target : values[values.length - 1];
  const result = sanctuaryOdds(table, name, goal);
  const unit = String(Object.values(table[name] || {})[0]?.[0]?.[0] || "").includes("%") ? "%" : "";
  return (
    <div class="calc-grid">
      <section class="card calc-card">
        <h2 class="calc-card__title">빛의 성소 기도</h2>
        <div class="calc-income">
          <SelectField
            id="sa-level"
            label="성소 레벨"
            value={level}
            options={levels.map((value) => ({ value, label: `Lv.${value}` }))}
            onChange={(value) => setLevel(Number(value))}
          />
          <SelectField id="sa-option" label="옵션" value={name} options={options.map((value) => ({ value, label: value }))} onChange={setOption} />
          <SelectField
            id="sa-target"
            label="목표(이상)"
            value={goal}
            options={values.map((value) => ({ value, label: `${value}${unit}` }))}
            onChange={(value) => setTarget(Number(value))}
          />
        </div>
        <div class="calc-table-wrap">
          <table class="calc-table">
            <thead>
              <tr>
                <th scope="col">등급</th>
                <th scope="col">값</th>
                <th scope="col">확률</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(table[name] || {}).flatMap(([grade, rows]) =>
                rows.map(([value, p]) => (
                  <tr key={`${grade}-${value}`} class={Number(String(value).replace(/[^0-9.]/g, "")) >= goal ? "" : "is-muted"}>
                    <td>
                      {grade === "normal"
                        ? "일반"
                        : grade === "rare"
                          ? "레어"
                          : grade === "epic"
                            ? "에픽"
                            : grade === "unique"
                              ? "유니크"
                              : grade === "legendary"
                                ? "레전더리"
                                : grade}
                    </td>
                    <td class="num">{value}</td>
                    <td class="num">{formatDecimal(p, 3)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section class="card calc-card calc-result">
        <h2 class="calc-card__title">결과</h2>
        <p class="calc-big display num">
          {times(result.tries)}번
          <span class="calc-big__note">
            {name} {goal}
            {unit} 이상까지 평균 기도 (한 번에 {pct(result.chance)})
          </span>
        </p>
        <p class="calc-note">레벨의 모든 옵션·등급·값 중 하나를 확률대로 뽑아요. 확률 합이 100%가 아닌 레벨은 합으로 나눠요.</p>
      </section>
    </div>
  );
}

function MagnetPet() {
  const names = [...new Set(rules.magnetPet.items.map((item) => item.name))];
  const [name, setName] = useState(names[0]);
  const result = magnetPetOdds(rules.magnetPet, name);
  const merged = names.map((itemName) => ({
    name: itemName,
    p: rules.magnetPet.items.filter((item) => item.name === itemName).reduce((sum, item) => sum + item.p, 0)
  }));
  return (
    <div class="calc-grid">
      <section class="card calc-card">
        <h2 class="calc-card__title">자석펫 원더베리</h2>
        <SelectField id="mp-name" label="원하는 것" value={name} options={names.map((value) => ({ value, label: value }))} onChange={setName} />
        <div class="calc-table-wrap">
          <table class="calc-table">
            <thead>
              <tr>
                <th scope="col">항목</th>
                <th scope="col">확률</th>
              </tr>
            </thead>
            <tbody>
              {merged.map((item) => (
                <tr key={item.name} class={item.name === name ? "is-now" : ""}>
                  <td>{item.name}</td>
                  <td class="num">{formatDecimal(item.p, 2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section class="card calc-card calc-result">
        <h2 class="calc-card__title">결과</h2>
        <p class="calc-big display num">
          {times(result.draws)}번<span class="calc-big__note">평균 뽑기 (한 번에 {pct(result.chance)})</span>
        </p>
        <dl class="calc-sum">
          <div>
            <dt>다이아 (11회 묶음 기준)</dt>
            <dd class="num">{times(result.diamonds)}</dd>
          </div>
        </dl>
        <p class="calc-note">
          1회 {formatComma(rules.magnetPet.costs.single)} 다이아, 11회 {formatComma(rules.magnetPet.costs.eleven)} 다이아.
        </p>
      </section>
    </div>
  );
}

export function GachaCalc() {
  const [kind, setKind] = useState("starChorus");
  return (
    <>
      <div class="calc-seg calc-seg--center">
        <Segmented
          name="gacha-kind"
          legend="확률 계산 종류"
          value={kind}
          onChange={setKind}
          options={[
            { value: "starChorus", label: "스타코러스" },
            { value: "sanctuary", label: "빛의 성소" },
            { value: "magnetPet", label: "자석펫" }
          ]}
        />
      </div>
      {kind === "starChorus" ? <StarChorus /> : null}
      {kind === "sanctuary" ? <Sanctuary /> : null}
      {kind === "magnetPet" ? <MagnetPet /> : null}
    </>
  );
}
