// 스탯 효율 탭: 기준 스탯을 고르고 수치를 넣으면 오르는 전투력과, 같은 효과를 내는 다른 스탯의 양.
// 아래에는 "1씩 올리면" 전투력이 얼마나 오르는지 효율 순으로 보여 준다.
import { useMemo, useState } from "preact/hooks";
import linkData from "../../../../src/game-data/link-skills.json";
import { Icon } from "../../components/Icon.jsx";
import { EmptyState } from "../../components/States.jsx";
import { Segmented } from "../../components/Tabs.jsx";
import { EFFICIENCY_STATS, amountForRatio, combatPower, gainFor, totalsFromStats } from "../../lib/efficiency.js";
import { recommendLinks } from "../../lib/linkRecommend.mjs";
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

/** 주요 스탯에서 장착 링크(본인 링크 제외)의 기여를 뺀 값. */
export function withoutLinks(majorStats) {
  /** @type {Record<string, any>} */
  const copy = {};
  for (const [key, stat] of Object.entries(majorStats || {})) {
    const linked = (Array.isArray(stat?.breakdown) ? stat.breakdown : [])
      .filter((entry) => entry.group === "linkSkill" && !String(entry.source || "").startsWith("본인 링크"))
      .reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
    copy[key] = { ...stat, value: (Number(stat?.value) || 0) - linked };
  }
  return copy;
}

const LINK_LEVELS = [
  { value: "2", label: "Lv.2" },
  { value: "3", label: "Lv.3" },
  { value: "max", label: "최대" }
];

/**
 * 링크 스킬 추천(전투력 기준): 지금 칸 수만큼, 고른 육성 수준에서 전투력을 가장 많이 올리는 조합.
 * @param {{ majorStats: Record<string, any>, attackType: string, linkSkills: any[], className: string }} props
 */
function LinkAdvice({ majorStats, attackType, linkSkills, className }) {
  const [level, setLevel] = useState("3");
  const own = linkData.selfLinks.find((link) => link.classes.some((name) => String(className).replace(/\s+/g, "") === name.replace(/\s+/g, "")));
  // 여러 직업이 같은 링크를 전수하면 한 칸에 겹쳐 들어간다: 칸 수는 이름 기준, 레벨은 합.
  /** @type {Map<string, number>} */
  const ownedLevels = new Map();
  for (const skill of linkSkills) {
    if (!skill?.skillName || skill.skillName === own?.name) continue;
    ownedLevels.set(skill.skillName, (ownedLevels.get(skill.skillName) || 0) + (Number(skill.skillLevel) || 0));
  }
  const current = [...ownedLevels.entries()].map(([skillName, skillLevel]) => ({ skillName, skillLevel }));
  const slots = Math.max(1, current.length);
  const result = useMemo(() => {
    const base = totalsFromStats(withoutLinks(majorStats), attackType);
    const now = totalsFromStats(majorStats, attackType);
    if (!base || !now) return null;
    const advice = recommendLinks({
      base,
      links: linkData.selfLinks,
      attackType,
      slots,
      level: level === "max" ? "max" : Number(level),
      exclude: own ? [own.name] : [],
      owned: Object.fromEntries(ownedLevels),
      combatPower
    });
    return { ...advice, nowPower: combatPower(now) };
  }, [majorStats, attackType, slots, level, own?.name, linkSkills]);
  if (!result || !current.length) return null;
  const currentNames = new Set(current.map((skill) => skill.skillName));
  const pickedNames = new Set(result.picks.map((pick) => pick.name));
  const remove = current.filter((skill) => !pickedNames.has(skill.skillName));
  const change = result.power / result.nowPower - 1;

  return (
    <section class="sect eff-links">
      <div class="eff-links__head">
        <h3 class="eff-rank__title">링크 스킬 추천</h3>
        <Segmented name="eff-link-level" legend="링크 육성 수준" value={level} onChange={setLevel} options={LINK_LEVELS} />
      </div>
      <p class="eff-links__summary">
        지금 {slots}칸 기준 ·{" "}
        <strong class={change > 1e-9 ? "is-up" : ""}>
          {change > 1e-9 ? `전투력 ${formatRatio(1 + change)}` : "지금 조합이 가장 좋아요"}
        </strong>
      </p>
      <ol class="eff-links__list">
        {result.picks.map((pick) => (
          <li key={pick.name} class={currentNames.has(pick.name) ? "" : "is-new"}>
            <span class="eff-links__name">
              {pick.name} <span class="num">Lv.{pick.level}</span>
            </span>
            {currentNames.has(pick.name) ? null : <span class="eff-links__tag">넣기</span>}
            <span class="eff-links__gain num">{formatRatio(1 + pick.gain)}</span>
          </li>
        ))}
      </ol>
      {remove.length ? (
        <p class="eff-links__remove">
          빼기: {remove.map((skill) => `${skill.skillName} Lv.${skill.skillLevel}`).join(", ")}
        </p>
      ) : null}
    </section>
  );
}

/**
 * @param {{ majorStats: Record<string, any>, attackType: string, modeLabel: string, linkSkills?: any[], className?: string }} props
 */
export function EfficiencyTab({ majorStats, attackType, modeLabel, linkSkills = [], className = "" }) {
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

      <LinkAdvice majorStats={majorStats} attackType={attackType} linkSkills={linkSkills} className={className} />
    </div>
  );
}
