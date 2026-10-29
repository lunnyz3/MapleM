// 세트 효과 비교 탭: 세트마다 지금·바꾸면 개수와 스타포스 합을 고르면 스탯 차이, 캐릭터를 불러오면 전투력 차이도.
// 계산은 web/src/lib/setCompare.mjs, 표는 src/game-data/item-sets.json·starforce-sets.json.
import itemRules from "../../../../src/game-data/item-sets.json";
import starforceRules from "../../../../src/game-data/starforce-sets.json";
import { useEffect, useMemo, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { Segmented } from "../../components/Tabs.jsx";
import { combatPower, totalsFromStats } from "../../lib/efficiency.js";
import { formatDecimal, formatKoreanUnits } from "../../lib/format.js";
import { addTotals, deltaToTotals } from "../../lib/growthReport.mjs";
import { compareStats, setChoices, sideFromStats, sideStats } from "../../lib/setCompare.mjs";

const CHOICES = setChoices(itemRules, starforceRules);
const CAP = starforceRules.cap;
const STARS_PER_PIECE = 30;

const STAT_LABELS = {
  maxDamage: "최대 대미지",
  finalDamage: "최종 대미지",
  bossDamage: "보스 공격력",
  criticalDamage: "치명타 피해",
  physicalDamagePercent: "물리 대미지",
  magicalDamagePercent: "마법 대미지",
  physicalAttackPercent: "물리 공격력%",
  magicalAttackPercent: "마법 공격력%",
  ignoreDefense: "방어율 무시"
};

const PRESETS = [
  { label: "아케인 5·앱솔 2 → 아케인 7", before: { arcane: [5, 150], absolab: [2, 60] }, after: { arcane: [7, 210] } },
  { label: "앱솔 7 → 아케인 7", before: { absolab: [7, 210] }, after: { arcane: [7, 210] } },
  { label: "아케인 210성 → 280성", before: { arcane: [7, 210] }, after: { arcane: [7, 280] } },
  { label: "칠흑 5 → 칠흑 7", before: { chaos: [5, 0] }, after: { chaos: [7, 0] } }
];

/** @param {Record<string, [number, number]>} short */
const expand = (short) => Object.fromEntries(Object.entries(short).map(([id, [count, stars]]) => [id, { count, stars }]));

/** @param {string} key @param {number} value @param {boolean} [signed] */
function statText(key, value, signed = false) {
  const sign = signed && value > 0 ? "+" : value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (key === "maxDamage") return `${sign}${formatKoreanUnits(abs, { maxGroups: 2 })}`;
  return `${sign}${formatDecimal(abs, abs % 1 ? 1 : 0)}%`;
}

/**
 * @param {{ id: string, value: { count: number, stars: number } | undefined, choice: any, label: string, onChange: (next: { count: number, stars: number }) => void }} props
 */
function SetPick({ id, value, choice, label, onChange }) {
  const count = value?.count || 0;
  const stars = value?.stars || 0;
  const counts = Array.from({ length: choice.maxCount + 1 }, (_, index) => index);
  return (
    <div class="calc-set__pick">
      <span class="select calc-set__count">
        <select
          id={`${id}-count`}
          aria-label={`${choice.label} ${label} 개수`}
          value={count}
          onChange={(event) => {
            const next = Number(/** @type {HTMLSelectElement} */ (event.currentTarget).value);
            // 개수를 바꾸면 스타포스 합은 장비당 평균을 그대로 둔다.
            const perPiece = count > 0 && stars > 0 ? stars / count : STARS_PER_PIECE;
            onChange({ count: next, stars: choice.starforce ? Math.round(perPiece * next) : 0 });
          }}
        >
          {counts.map((item) => (
            <option key={item} value={item}>
              {item ? `${item}세트` : "없음"}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={16} class="select__icon" />
      </span>
      {choice.starforce ? (
        <input
          class="input num calc-set__stars"
          type="number"
          inputMode="numeric"
          min={0}
          max={CAP + 40}
          aria-label={`${choice.label} ${label} 스타포스 합`}
          value={stars}
          disabled={!count}
          onInput={(event) => {
            const next = Number(/** @type {HTMLInputElement} */ (event.currentTarget).value);
            onChange({ count, stars: Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0 });
          }}
        />
      ) : null}
    </div>
  );
}

/** @param {{ character: { name: string, attackType: string, majorStats: Record<string, any> } | null }} props */
export function SetCompareCalc({ character }) {
  const [preset, setPreset] = useState(0);
  const [before, setBefore] = useState(() => expand(PRESETS[0].before));
  const [after, setAfter] = useState(() => expand(PRESETS[0].after));
  const [extra, setExtra] = useState(/** @type {string[]} */ ([]));
  const [type, setType] = useState(character?.attackType === "magical" ? "magical" : "physical");

  const fromCharacter = useMemo(() => (character ? sideFromStats(character.majorStats, CHOICES) : null), [character]);
  useEffect(() => {
    if (!fromCharacter) return;
    setBefore(fromCharacter);
    setAfter(fromCharacter);
    setPreset(-1);
    setExtra([]);
    setType(character?.attackType === "magical" ? "magical" : "physical");
  }, [fromCharacter]);

  const applyPreset = (index) => {
    setPreset(index);
    setBefore(expand(PRESETS[index].before));
    setAfter(expand(PRESETS[index].after));
    setExtra([]);
  };

  // 손댄 세트는 양쪽 다 없음이 돼도 줄을 남긴다.
  const keep = (/** @type {string} */ id) => !extra.includes(id) && setExtra([...extra, id]);
  // 화면에 보이는 세트: 어느 쪽이든 개수가 있거나 직접 더한 세트
  const shown = CHOICES.filter((choice) => before[choice.id]?.count || after[choice.id]?.count || extra.includes(choice.id));
  const addable = CHOICES.filter((choice) => !shown.includes(choice));

  const statsBefore = useMemo(() => sideStats(CHOICES, before, CAP), [before]);
  const statsAfter = useMemo(() => sideStats(CHOICES, after, CAP), [after]);
  const other = type === "magical" ? "physical" : "magical";
  const rows = compareStats(statsBefore, statsAfter).filter((row) => !row.key.startsWith(other));

  const power = useMemo(() => {
    const totals = character ? totalsFromStats(character.majorStats, character.attackType) : null;
    if (!totals) return null;
    // 지금 세트 효과를 빼고 바꾼 세트 효과를 더한다.
    const removed = Object.fromEntries(Object.entries(deltaToTotals(statsBefore, character.attackType)).map(([key, value]) => [key, -value]));
    const next = addTotals(totals, removed, deltaToTotals(statsAfter, character.attackType));
    return combatPower(next) / combatPower(totals) - 1;
  }, [character, statsBefore, statsAfter]);

  return (
    <div class="calc-grid">
      <section class="card calc-card">
        <h2 class="calc-card__title">세트 효과 비교</h2>
        <div class="calc-presets" role="group" aria-label="자주 바꾸는 구성">
          {PRESETS.map((item, index) => (
            <button
              key={item.label}
              type="button"
              class={`btn btn--sm ${preset === index ? "btn--primary" : "btn--secondary"}`}
              aria-pressed={preset === index ? "true" : "false"}
              onClick={() => applyPreset(index)}
            >
              {item.label}
            </button>
          ))}
          {fromCharacter ? (
            <button
              type="button"
              class={`btn btn--sm ${preset === -1 ? "btn--primary" : "btn--secondary"}`}
              aria-pressed={preset === -1 ? "true" : "false"}
              onClick={() => {
                setBefore(fromCharacter);
                setAfter(fromCharacter);
                setPreset(-1);
                setExtra([]);
              }}
            >
              {character?.name} 지금 세트
            </button>
          ) : null}
        </div>
        {character ? null : (
          <div class="calc-seg">
            <Segmented
              name="set-type"
              legend="공격 타입"
              value={type}
              onChange={setType}
              options={[
                { value: "physical", label: "물리" },
                { value: "magical", label: "마법" }
              ]}
            />
          </div>
        )}

        <div class="calc-set" role="table" aria-label="세트 구성">
          <div class="calc-set__row calc-set__head" role="row">
            <span role="columnheader">세트</span>
            <span role="columnheader">지금 · 스타포스 합</span>
            <span role="columnheader">바꾸면 · 스타포스 합</span>
          </div>
          {shown.map((choice) => (
            <div key={choice.id} class="calc-set__row" role="row">
              <span class="calc-set__name" role="rowheader">
                {choice.label}
              </span>
              <SetPick
                id={`set-before-${choice.id}`}
                label="지금"
                choice={choice}
                value={before[choice.id]}
                onChange={(next) => {
                  setPreset(-2);
                  keep(choice.id);
                  setBefore({ ...before, [choice.id]: next });
                }}
              />
              <SetPick
                id={`set-after-${choice.id}`}
                label="바꾸면"
                choice={choice}
                value={after[choice.id]}
                onChange={(next) => {
                  setPreset(-2);
                  keep(choice.id);
                  setAfter({ ...after, [choice.id]: next });
                }}
              />
            </div>
          ))}
        </div>
        {addable.length ? (
          <span class="select calc-set__add">
            <select
              aria-label="세트 더하기"
              value=""
              onChange={(event) => {
                const id = /** @type {HTMLSelectElement} */ (event.currentTarget).value;
                if (id) setExtra([...extra, id]);
              }}
            >
              <option value="">세트 더하기</option>
              {addable.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={18} class="select__icon" />
          </span>
        ) : null}
      </section>

      <section class="card calc-card calc-result">
        <h2 class="calc-card__title">결과</h2>
        {power !== null ? (
          <p class="calc-big display num">
            {power >= 0 ? "+" : "-"}
            {formatDecimal(Math.abs(power) * 100, 2)}%<span class="calc-big__note">{character?.name} 전투력</span>
          </p>
        ) : null}
        {rows.length ? (
          <div class="calc-table-wrap">
            <table class="calc-table calc-set__result">
              <thead>
                <tr>
                  <th scope="col">스탯</th>
                  <th scope="col">지금</th>
                  <th scope="col">바꾸면</th>
                  <th scope="col">차이</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{STAT_LABELS[row.key]}</th>
                    <td class="num">{row.before ? statText(row.key, row.before) : "-"}</td>
                    <td class="num">{row.after ? statText(row.key, row.after) : "-"}</td>
                    <td class={`num ${row.diff > 0 ? "is-up" : row.diff < 0 ? "is-down" : ""}`}>{row.diff ? statText(row.key, row.diff, true) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p class="calc-note">세트를 골라 주세요.</p>
        )}
      </section>
    </div>
  );
}
