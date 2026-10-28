// 스탯 효율 탭: 기준 스탯을 고르고 수치를 넣으면 오르는 전투력과, 같은 효과를 내는 다른 스탯의 양.
// 아래에는 "1씩 올리면" 전투력이 얼마나 오르는지 효율 순으로 보여 준다.
import { useMemo, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { EmptyState } from "../../components/States.jsx";
import { EFFICIENCY_STATS, amountForRatio, gainFor, totalsFromStats } from "../../lib/efficiency.js";
import { formatComma, formatDecimal, formatKoreanUnits } from "../../lib/format.js";

/** @param {{ id: string, unit: string }} stat @param {number} value */
function formatAmount(stat, value) {
  if (!Number.isFinite(value)) return "-";
  if (stat.unit === "%") return `${formatDecimal(value, value < 10 ? 2 : 1)}%`;
  return Math.abs(value) >= 1e6 ? formatKoreanUnits(value) : formatComma(Math.round(value));
}

/** @param {number} ratio */
function formatRatio(ratio) {
  const percent = (ratio - 1) * 100;
  return `${percent >= 0 ? "+" : ""}${formatDecimal(percent, Math.abs(percent) < 1 ? 3 : 2)}%`;
}

/**
 * @param {{ majorStats: Record<string, any>, attackType: string, modeLabel: string }} props
 */
export function EfficiencyTab({ majorStats, attackType, modeLabel }) {
  const totals = useMemo(() => totalsFromStats(majorStats, attackType), [majorStats, attackType]);
  const [baseId, setBaseId] = useState("finalDamage");
  const base = EFFICIENCY_STATS.find((stat) => stat.id === baseId) || EFFICIENCY_STATS[0];
  const [amountText, setAmountText] = useState(String(base.step));
  const amount = Number(amountText);

  const perStep = useMemo(() => {
    if (!totals) return [];
    return EFFICIENCY_STATS.map((stat) => ({ stat, ...gainFor(totals, stat.id, stat.step) })).sort((a, b) => b.ratio - a.ratio);
  }, [totals]);

  if (!totals) return <EmptyState compact title="스탯 정보가 없어 계산할 수 없어요" />;

  const result = Number.isFinite(amount) && amount > 0 ? gainFor(totals, base.id, amount) : null;
  const equivalents = result
    ? EFFICIENCY_STATS.filter((stat) => stat.id !== base.id).map((stat) => ({ stat, amount: amountForRatio(totals, stat.id, result.ratio) }))
    : [];
  const bestRatio = perStep[0]?.ratio || 1;

  return (
    <div class="eff">
      <section class="eff-calc sect">
        <div class="eff-calc__inputs">
          <div class="field">
            <label class="field__label" for="eff-base">
              기준 스탯
            </label>
            <span class="select">
              <select
                id="eff-base"
                value={base.id}
                onChange={(event) => {
                  const next = EFFICIENCY_STATS.find((stat) => stat.id === /** @type {HTMLSelectElement} */ (event.currentTarget).value);
                  if (!next) return;
                  setBaseId(next.id);
                  setAmountText(String(next.step));
                }}
              >
                {EFFICIENCY_STATS.map((stat) => (
                  <option key={stat.id} value={stat.id}>
                    {stat.label}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={18} class="select__icon" />
            </span>
          </div>
          <div class="field">
            <label class="field__label" for="eff-amount">
              올릴 양{base.unit ? ` (${base.unit})` : ""}
            </label>
            <input
              id="eff-amount"
              class="input num"
              type="number"
              inputMode="decimal"
              min={0}
              step={base.unit === "%" ? 0.1 : base.step}
              value={amountText}
              onInput={(event) => setAmountText(/** @type {HTMLInputElement} */ (event.currentTarget).value)}
            />
          </div>
        </div>

        {result ? (
          <div class="eff-result">
            <p class="eff-result__head">
              <span class="eff-result__mode">{modeLabel}</span>
              {base.label} +{formatAmount(base, amount).replace(/^\+/, "")}
            </p>
            <p class="eff-result__gain display num">
              전투력 +{formatKoreanUnits(Math.round(result.gain))}
              <span class="eff-result__ratio">{formatRatio(result.ratio)}</span>
            </p>
          </div>
        ) : null}

        {equivalents.length ? (
          <ul class="eff-equiv" aria-label="같은 효과를 내는 다른 스탯">
            {equivalents.map(({ stat, amount: value }) => (
              <li key={stat.id}>
                <span class="eff-equiv__label">{stat.label}</span>
                <strong class="eff-equiv__value num">+{formatAmount(stat, value)}</strong>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section class="sect eff-rank" aria-label="1씩 올릴 때 전투력 증가">
        <h3 class="eff-rank__title">하나씩 올리면</h3>
        <ol class="eff-bars">
          {perStep.map(({ stat, ratio, gain }, index) => (
            <li key={stat.id} class="eff-bar" style={{ "--w": `${Math.max(4, ((ratio - 1) / Math.max(bestRatio - 1, 1e-12)) * 100)}%`, "--stagger": index }}>
              <span class="eff-bar__label">
                {stat.label} <span class="num">+{formatAmount(stat, stat.step)}</span>
              </span>
              <span class="eff-bar__track" aria-hidden="true">
                <span class="eff-bar__fill" />
              </span>
              <span class="eff-bar__value num" title={`+${formatComma(Math.round(gain))}`}>
                {formatRatio(ratio)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
