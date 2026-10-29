// 장비 교체 체험: 잠재·에디·추가 옵션 줄을 바꿔 보며 보스 세팅 전투력이 얼마나 바뀌는지 본다.
// 후보는 이 장비의 공식 확률표(잠재·에디는 줄마다, 추가 옵션은 불꽃 범위), 전투력은 서버와 같은 공식(efficiency.js).
import { useEffect, useMemo, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { combatPower, totalsFromStats } from "../../lib/efficiency.js";
import { formatComma, formatDecimal, formatKoreanUnits } from "../../lib/format.js";
import { optionCandidates } from "../../lib/share.js";
import { applyLineChanges } from "../../lib/whatIf.mjs";
import { deltaToTotals, addTotals } from "../../lib/growthReport.mjs";
import { basicChange, currentSetTotals, setChange, setOfItem } from "../../lib/starforceWhatIf.mjs";
import starforceSets from "../../../../src/game-data/starforce-sets.json";
import soulEmblem from "../../../../src/game-data/soul-emblem.json";
import { emblemKinds, emblemLines, soulChoices, splitLine } from "../../lib/soulEmblem.mjs";
import { emblemInfo } from "../../lib/character.js";

const SECTIONS = [
  { key: "additional", field: "additionalOption", label: "추가 옵션" },
  { key: "potential", field: "potentialOption", label: "잠재능력" },
  { key: "additionalPotential", field: "additionalPotentialOption", label: "에디셔널 잠재능력" }
];

/** @param {any[]} options */
function linesOf(options) {
  return (Array.isArray(options) ? options : []).map((option) => ({
    name: String(option?.optionName ?? option?.name ?? option?.option_name ?? ""),
    value: String(option?.optionValue ?? option?.value ?? option?.option_value ?? "")
  }));
}

/** "1,907" · "6.20%" → 숫자 */
const numberOf = (text) => Number(String(text).replace(/[^0-9.\-]/g, ""));

/**
 * @param {{ item: any, majorStats: Record<string, any>, attackType: string, basePower?: number | null, onClose: () => void }} props
 */
export function WhatIf({ item, majorStats, attackType, basePower = null, onClose }) {
  const original = useMemo(() => Object.fromEntries(SECTIONS.map((section) => [section.key, linesOf(item?.[section.field])])), [item]);
  const [edited, setEdited] = useState(original);
  const [candidates, setCandidates] = useState(/** @type {any} */ (null));
  // 스타포스: 아이템 DB(단계별 기본 옵션)에 이 아이템이 있을 때만
  const currentStar = Number(item?.starforceUpgrade) || 0;
  const [star, setStar] = useState(currentStar);
  const [itemDb, setItemDb] = useState(/** @type {any} */ (null));
  useEffect(() => {
    let alive = true;
    import("../../../../src/game-data/item-db.json").then((module) => alive && setItemDb(module.default || module), () => {});
    return () => {
      alive = false;
    };
  }, []);
  const dbEntry = itemDb?.items?.[item?.itemName];
  const starOptions = dbEntry?.stars?.[String(currentStar)] ? Object.keys(dbEntry.stars).map(Number).sort((a, b) => a - b) : [];
  const starSet = useMemo(() => setOfItem(starforceSets, item), [item]);
  // 문장(있는 장비만): 종류·레벨, 소울(있는 장비만): 보스·옵션
  const emblem = useMemo(() => emblemInfo(item?.emblemInfo), [item]);
  const [emblemKind, setEmblemKind] = useState(emblem?.name || "");
  const [emblemLevel, setEmblemLevel] = useState(emblem?.level || 1);
  const soulLine = useMemo(() => splitLine(item?.soulInfo?.soulOption), [item]);
  const souls = useMemo(() => soulChoices(soulEmblem, item?.slotName === "무기", attackType), [item, attackType]);
  const [soulPick, setSoulPick] = useState("");
  const emblemChanged = Boolean(emblem) && (emblemKind !== emblem.name || emblemLevel !== emblem.level);
  const emblemBefore = emblem ? emblem.options.filter((line) => line.value) : [];
  const emblemAfter = emblemChanged ? emblemLines(soulEmblem, emblemKind, emblemLevel) : emblemBefore;
  const soulAfter = (() => {
    const [boss, index] = soulPick.split("|");
    const line = souls.find((choice) => choice.boss === boss)?.lines[Number(index)];
    return line ? [line] : soulLine ? [soulLine] : [];
  })();

  useEffect(() => {
    let alive = true;
    setStar(currentStar);
    setEmblemKind(emblem?.name || "");
    setEmblemLevel(emblem?.level || 1);
    setSoulPick("");
    setEdited(original);
    optionCandidates(item).then((value) => alive && setCandidates(value || { potential: [], additionalPotential: [], additional: [] }));
    return () => {
      alive = false;
    };
  }, [item]);

  const totals = useMemo(() => totalsFromStats(majorStats, attackType), [majorStats, attackType]);
  const result = useMemo(() => {
    if (!totals) return null;
    let next = totals;
    for (const section of SECTIONS) next = applyLineChanges(next, original[section.key], edited[section.key], attackType);
    if (emblemChanged) next = applyLineChanges(next, emblemBefore, emblemAfter, attackType);
    if (soulPick && soulLine) next = applyLineChanges(next, [soulLine], soulAfter, attackType);
    if (star !== currentStar && dbEntry) {
      const basic = basicChange(dbEntry, currentStar, star);
      if (basic) next = applyLineChanges(next, basic.before, basic.after, attackType);
      const setTotal = starSet ? currentSetTotals(majorStats)[starSet.label] : undefined;
      if (starSet && Number.isFinite(setTotal)) {
        const delta = (star - currentStar) * (item?.slotName === "한벌옷" ? 2 : 1);
        next = addTotals(next, deltaToTotals(setChange(starSet, setTotal, delta, starforceSets.cap), attackType));
      }
    }
    const before = combatPower(totals);
    const after = combatPower(next);
    return { ratio: before > 0 ? after / before : 1 };
  }, [totals, original, edited, attackType, star, dbEntry, emblemKind, emblemLevel, soulPick]);

  const setLine = (/** @type {string} */ section, /** @type {number} */ index, /** @type {{ name: string, value: string }} */ line) => {
    setEdited({ ...edited, [section]: edited[section].map((current, i) => (i === index ? line : current)) });
  };
  const changed = star !== currentStar || emblemChanged || Boolean(soulPick) || SECTIONS.some((section) => JSON.stringify(edited[section.key]) !== JSON.stringify(original[section.key]));
  const setTotal = starSet ? currentSetTotals(majorStats)[starSet.label] : undefined;
  const basicPreview = star !== currentStar && dbEntry ? basicChange(dbEntry, currentStar, star) : null;
  const percent = result ? (result.ratio - 1) * 100 : 0;
  const gain = basePower && result ? basePower * (result.ratio - 1) : null;

  return (
    <div class="whatif">
      <div class={`whatif__bar${percent > 1e-9 ? " is-up" : percent < -1e-9 ? " is-down" : ""}`} role="status" aria-live="polite">
        <span class="whatif__label">체험 전투력</span>
        <strong class="display num">
          {percent >= 0 ? "+" : ""}
          {formatDecimal(percent, Math.abs(percent) < 1 ? 3 : 2)}%
        </strong>
        {gain !== null && Math.abs(gain) >= 1 ? <span class="whatif__abs num">{gain >= 0 ? "+" : "-"}{formatKoreanUnits(Math.abs(Math.round(gain)), { maxGroups: Math.abs(gain) >= 1e8 ? 2 : 1 })}</span> : null}
        <span class="whatif__actions">
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            disabled={!changed}
            onClick={() => {
              setEdited(original);
              setStar(currentStar);
              setEmblemKind(emblem?.name || "");
              setEmblemLevel(emblem?.level || 1);
              setSoulPick("");
            }}
          >
            <Icon name="refresh" size={16} />
            되돌리기
          </button>
          <button type="button" class="btn btn--secondary btn--sm" onClick={onClose}>
            체험 끝내기
          </button>
        </span>
      </div>

      {starOptions.length > 1 ? (
        <section class="whatif__section">
          <h4 class="whatif__title">스타포스</h4>
          <div class="whatif__line">
            <span class="select select--sm">
              <select aria-label="스타포스" value={star} onChange={(event) => setStar(Number(/** @type {HTMLSelectElement} */ (event.currentTarget).value))}>
                {starOptions.map((value) => (
                  <option key={value} value={value}>
                    ★{value}
                    {value === currentStar ? " (지금)" : ""}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={16} class="select__icon" />
            </span>
            <span class="whatif__range num">
              {basicPreview
                ? basicPreview.after
                    .map((line, index) => `${line.name} ${formatComma(Number(basicPreview.before[index].value))} → ${formatComma(Number(line.value))}`)
                    .join(" · ")
                : "기본 옵션 그대로"}
              {starSet && Number.isFinite(setTotal) && star !== currentStar
                ? ` · ${starSet.label} 세트 ${formatComma(setTotal)}성 → ${formatComma(setTotal + (star - currentStar) * (item?.slotName === "한벌옷" ? 2 : 1))}성`
                : ""}
            </span>
          </div>
        </section>
      ) : null}

      {emblem ? (
        <section class="whatif__section">
          <h4 class="whatif__title">문장</h4>
          <div class="whatif__line">
            <span class="select select--sm">
              <select aria-label="문장 종류" value={emblemKind} onChange={(event) => setEmblemKind(/** @type {HTMLSelectElement} */ (event.currentTarget).value)}>
                {emblemKinds(soulEmblem).map((kind) => (
                  <option key={kind.name} value={kind.name}>
                    {kind.name}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={16} class="select__icon" />
            </span>
            <span class="select select--sm whatif__value">
              <select aria-label="문장 레벨" value={emblemLevel} onChange={(event) => setEmblemLevel(Number(/** @type {HTMLSelectElement} */ (event.currentTarget).value))}>
                {soulEmblem.emblem.maxDamageByLevel.map((_, index) => (
                  <option key={index} value={index + 1}>
                    Lv.{index + 1}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={16} class="select__icon" />
            </span>
            <span class="whatif__range num">{emblemAfter.map((line) => `${line.name} ${line.value.endsWith("%") ? line.value : formatComma(Number(String(line.value).replace(/,/g, "")))}`).join(" · ")}</span>
          </div>
        </section>
      ) : null}

      {soulLine ? (
        <section class="whatif__section">
          <h4 class="whatif__title">소울</h4>
          <div class="whatif__line">
            <span class="select select--sm whatif__soul">
              <select aria-label="소울" value={soulPick} onChange={(event) => setSoulPick(/** @type {HTMLSelectElement} */ (event.currentTarget).value)}>
                <option value="">
                  지금: {soulLine.name} {soulLine.value}
                </option>
                {souls.map((choice) => (
                  <optgroup key={choice.boss} label={choice.boss}>
                    {choice.lines.map((line, index) => (
                      <option key={index} value={`${choice.boss}|${index}`}>
                        {choice.boss} · {line.name} {line.value.endsWith("%") ? line.value : formatComma(Number(line.value))}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <Icon name="chevronDown" size={16} class="select__icon" />
            </span>
          </div>
        </section>
      ) : null}

      {!candidates ? <p class="whatif__loading">옵션 표를 불러오는 중…</p> : null}
      {candidates
        ? SECTIONS.map((section) => {
            const lines = edited[section.key];
            if (!lines.length) return null;
            return (
              <section key={section.key} class="whatif__section">
                <h4 class="whatif__title">{section.label}</h4>
                {lines.map((line, index) =>
                  section.key === "additional" ? (
                    <FlameLine key={index} line={line} options={candidates.additional} onChange={(next) => setLine(section.key, index, next)} />
                  ) : (
                    <CubeLine key={index} line={line} rows={candidates[section.key]?.[index] || []} onChange={(next) => setLine(section.key, index, next)} />
                  )
                )}
              </section>
            );
          })
        : null}
    </div>
  );
}

/**
 * 잠재·에디 한 줄: 옵션 → 그 옵션의 수치(공식 표의 값만).
 * @param {{ line: { name: string, value: string }, rows: Array<{ option: string, value: string }>, onChange: (line: { name: string, value: string }) => void }} props
 */
function CubeLine({ line, rows, onChange }) {
  const names = [...new Set(rows.map((row) => row.option))];
  const squash = (text) => String(text).replace(/\s+/g, "");
  const currentName = names.find((name) => squash(name) === squash(line.name)) || line.name;
  const values = rows.filter((row) => squash(row.option) === squash(currentName)).map((row) => row.value);
  const valueOptions = values.includes(line.value) || !line.value ? values : [line.value, ...values];
  return (
    <div class="whatif__line">
      <span class="select select--sm">
        <select
          aria-label="옵션"
          value={currentName}
          onChange={(event) => {
            const name = /** @type {HTMLSelectElement} */ (event.currentTarget).value;
            const first = rows.find((row) => row.option === name);
            onChange({ name, value: first?.value || "" });
          }}
        >
          {names.includes(currentName) ? null : <option value={currentName}>{currentName}</option>}
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={16} class="select__icon" />
      </span>
      <span class="select select--sm whatif__value">
        <select aria-label="수치" value={line.value} onChange={(event) => onChange({ ...line, value: /** @type {HTMLSelectElement} */ (event.currentTarget).value })}>
          {valueOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={16} class="select__icon" />
      </span>
    </div>
  );
}

/**
 * 추가 옵션 한 줄: 옵션 → 범위 안 수치(직접 입력).
 * @param {{ line: { name: string, value: string }, options: Array<{ option: string, min: number, max: number, step: number, percent: boolean }>, onChange: (line: { name: string, value: string }) => void }} props
 */
function FlameLine({ line, options, onChange }) {
  const key = (text) => String(text).replace(/\s+/g, "").replace(/데미지/g, "대미지").replace(/증가$/, "");
  const current = options.find((option) => key(option.option) === key(line.name));
  const format = (/** @type {number} */ value, /** @type {boolean} */ percent) => (percent ? `${formatDecimal(value, 3)}%` : formatComma(value));
  return (
    <div class="whatif__line">
      <span class="select select--sm">
        <select
          aria-label="옵션"
          value={current ? current.option : line.name}
          onChange={(event) => {
            const next = options.find((option) => option.option === /** @type {HTMLSelectElement} */ (event.currentTarget).value);
            if (next) onChange({ name: next.option, value: format(next.max, next.percent) });
          }}
        >
          {current ? null : <option value={line.name}>{line.name}</option>}
          {options.map((option) => (
            <option key={option.option} value={option.option}>
              {option.option}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={16} class="select__icon" />
      </span>
      <input
        class="input input--sm num whatif__value"
        type="number"
        inputMode="decimal"
        aria-label="수치"
        min={current?.min}
        max={current?.max}
        step={current?.step}
        value={numberOf(line.value)}
        onInput={(event) => {
          const value = Number(/** @type {HTMLInputElement} */ (event.currentTarget).value);
          onChange({ ...line, value: current?.percent || String(line.value).includes("%") ? `${value}%` : String(value) });
        }}
      />
      {current ? (
        <span class="whatif__range num">
          {format(current.min, current.percent)} ~ {format(current.max, current.percent)}
        </span>
      ) : null}
    </div>
  );
}
