// 직접 입력 패널: 넥슨 API에 없는 값(스타코러스·성흔·축복·유니온 챔피언·명예 배지·몬스터 컬렉션·펫 공격력)을
// 채워 스탯과 계산 전투력을 다시 계산한다.
// 항목 정의: GET /api/v2/manual-inputs, 계산: POST /api/v2/character-stats. 서버에 없으면(404 등) "준비 중".
import { useEffect, useMemo, useState } from "preact/hooks";
import { Card } from "../../components/Card.jsx";
import { Icon } from "../../components/Icon.jsx";
import { Magnetic } from "../../components/Motion.jsx";
import { Skeleton } from "../../components/Skeleton.jsx";
import { SourceBadge } from "../../components/SourceStamp.jsx";
import { formatComma, formatDecimal, formatKoreanUnits, formatRelativeTime } from "../../lib/format.js";

/** @typedef {import("../../lib/data.js").ManualInputDef} ManualInputDef */

const UNIT_TEXT = { flat: "", percent: "%", level: "" };

/** @param {number} value @param {ManualInputDef} def */
function clamp(value, def) {
  const min = Number.isFinite(Number(def.min)) ? Number(def.min) : -Infinity;
  const max = Number.isFinite(Number(def.max)) ? Number(def.max) : Infinity;
  return Math.max(min, Math.min(max, value));
}

/** 단계 목록(레벨·등급 고르기). { value, label } 로 맞춘다. @param {ManualInputDef} def */
function levelOptions(def) {
  if (!Array.isArray(def.levels) || !def.levels.length) return null;
  return def.levels
    .map((level) => {
      const value = Number(level?.value ?? level?.level);
      return Number.isFinite(value) ? { value, label: String(level?.label || `${value}단계`) } : null;
    })
    .filter(Boolean);
}

/** 값 표기(단위·단계 이름 포함). @param {ManualInputDef | undefined} def @param {number} value */
function valueText(def, value) {
  if (!def) return formatDecimal(value);
  const options = levelOptions(def);
  if (options) return options.find((option) => option.value === value)?.label || `${value}`;
  if (def.unit === "percent") return `${formatDecimal(value, 2)}%`;
  return Math.abs(value) >= 1e8 ? formatKoreanUnits(value) : formatComma(value);
}

/**
 * @param {{
 *   defs: { status: "loading" } | { status: "ready", items: ManualInputDef[], groups?: Array<{ id: string, label: string }> } | { status: "unavailable" },
 *   values: Record<string, number>,
 *   result: { status: "idle" | "applying" | "applied" | "error", data?: any, error?: string, at?: number },
 *   onApply: (values: Record<string, number>) => void,
 *   powerBefore?: number | null,
 *   powerAfter?: number | null
 * }} props
 */
export function ManualPanel({ defs, values, result, onApply, powerBefore = null, powerAfter = null }) {
  const [draft, setDraft] = useState(/** @type {Record<string, string>} */ ({}));
  const items = defs.status === "ready" ? defs.items : [];
  const byId = useMemo(() => new Map(items.map((def) => [def.id, def])), [items]);

  // 저장값 → 입력칸
  useEffect(() => {
    /** @type {Record<string, string>} */
    const next = {};
    for (const def of items) next[def.id] = values[def.id] !== undefined ? String(values[def.id]) : "";
    setDraft(next);
  }, [defs, values]);

  // 서버가 준 그룹 순서를 따르고, 목록에 없는 그룹은 뒤에 붙인다.
  const groups = useMemo(() => {
    /** @type {Map<string, { id: string, label: string, list: ManualInputDef[] }>} */
    const map = new Map();
    const known = defs.status === "ready" && Array.isArray(defs.groups) ? defs.groups : [];
    for (const group of known) map.set(group.id, { id: group.id, label: group.label || group.id, list: [] });
    for (const def of items) {
      const id = def.group || "etc";
      if (!map.has(id)) map.set(id, { id, label: def.groupLabel || id, list: [] });
      map.get(id)?.list.push(def);
    }
    return [...map.values()].filter((group) => group.list.length);
  }, [defs, items]);

  /** 기본값과 같은 칸은 보내지 않는다(입력 안 한 것과 같다). */
  const collect = () => {
    /** @type {Record<string, number>} */
    const out = {};
    for (const def of items) {
      const raw = String(draft[def.id] ?? "").trim();
      if (raw === "") continue;
      const number = Number(raw);
      if (!Number.isFinite(number)) continue;
      const value = clamp(number, def);
      if (value !== Number(def.default ?? 0)) out[def.id] = value;
    }
    return out;
  };

  const filled = Object.keys(values).length;
  const applying = result.status === "applying";
  const applied = result.status === "applied" && result.data ? result.data : null;
  const appliedRows = applied && applied.manualApplied && typeof applied.manualApplied === "object" ? Object.entries(applied.manualApplied) : [];
  const warnings = Array.isArray(applied?.manualWarnings) ? applied.manualWarnings : [];
  const firstOpen = groups.find((group) => group.list.some((def) => values[def.id] !== undefined))?.id || groups[0]?.id;

  return (
    <Card
      class="manual-card"
      title="직접 입력"
      icon="user"
      tone="peach"
      description="넥슨 API에 없는 값을 채워 스탯을 다시 계산해요"
      action={<SourceBadge kind="manual" />}
    >
      {defs.status === "loading" ? (
        <div class="manual-loading" aria-busy="true">
          <Skeleton height={44} radius={10} />
          <Skeleton height={44} radius={10} />
          <Skeleton width="60%" height={14} />
          <span class="sr-only">직접 입력 항목을 불러오는 중입니다.</span>
        </div>
      ) : null}

      {defs.status === "unavailable" ? (
        <div class="manual-soon">
          <span class="manual-soon__icon" aria-hidden="true">
            <Icon name="clock" size={26} />
          </span>
          <p class="manual-soon__title">준비 중이에요</p>
          <p class="manual-soon__desc">
            스타코러스·몬스터 컬렉션처럼 넥슨 API에 없는 값을 직접 넣어 스탯과 계산 전투력에 더하는 기능을 만들고 있어요. 지금 보이는 스탯은 공식 API 값만으로 계산했어요.
          </p>
        </div>
      ) : null}

      {defs.status === "ready" ? (
        <form
          class="manual-form"
          onSubmit={(event) => {
            event.preventDefault();
            onApply(collect());
          }}
          noValidate
        >
          <div class="manual-groups">
            {groups.map((group) => {
              const count = group.list.filter((def) => values[def.id] !== undefined).length;
              return (
                <details key={group.id} class="manual-group" open={group.id === firstOpen}>
                  <summary class="manual-group__summary">
                    <span class="manual-group__title">{group.label}</span>
                    <span class="manual-group__meta num">{count ? `${count}개 입력` : `${group.list.length}칸`}</span>
                    <Icon name="chevronDown" size={18} class="manual-group__chev" />
                  </summary>
                  <div class="manual-group__body">
                    {group.list.map((def) => {
                      const unit = UNIT_TEXT[/** @type {keyof typeof UNIT_TEXT} */ (def.unit)] ?? "";
                      const id = `manual-${def.id}`;
                      const options = levelOptions(def);
                      const step = Number(def.step) || 1;
                      const bump = (dir) => {
                        const current = Number(draft[def.id] || def.default || 0) || 0;
                        const next = clamp(Math.round((current + dir * step) / step) * step, def);
                        setDraft({ ...draft, [def.id]: String(Number(next.toFixed(4))) });
                      };
                      return (
                        <div key={def.id} class="manual-field">
                          <label class="manual-field__label" for={id}>
                            {def.label}
                            {values[def.id] !== undefined ? <span class="manual-field__saved">저장됨</span> : null}
                          </label>
                          {options ? (
                            <span class="select">
                              <select
                                id={id}
                                value={draft[def.id] === "" || draft[def.id] === undefined ? String(def.default ?? 0) : draft[def.id]}
                                aria-describedby={def.description ? `${id}-desc` : undefined}
                                onChange={(event) => setDraft({ ...draft, [def.id]: /** @type {HTMLSelectElement} */ (event.currentTarget).value })}
                              >
                                {options.some((option) => option.value === Number(def.default ?? 0)) ? null : <option value={String(def.default ?? 0)}>입력 안 함</option>}
                                {options.map((option) => (
                                  <option key={option.value} value={String(option.value)}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <Icon name="chevronDown" size={18} class="select__icon" />
                            </span>
                          ) : (
                            <div class="stepper">
                              <button type="button" class="stepper__btn" aria-label={`${def.label} 줄이기`} onClick={() => bump(-1)}>
                                −
                              </button>
                              <input
                                id={id}
                                class="stepper__input num"
                                type="number"
                                inputMode="decimal"
                                min={def.min}
                                max={def.max}
                                step={step}
                                placeholder={String(def.default ?? 0)}
                                value={draft[def.id] ?? ""}
                                aria-describedby={def.description ? `${id}-desc` : undefined}
                                onInput={(event) => setDraft({ ...draft, [def.id]: /** @type {HTMLInputElement} */ (event.currentTarget).value })}
                              />
                              {unit ? <span class="stepper__unit">{unit}</span> : null}
                              <button type="button" class="stepper__btn" aria-label={`${def.label} 늘리기`} onClick={() => bump(1)}>
                                +
                              </button>
                            </div>
                          )}
                          {def.description ? (
                            <p class="manual-field__desc" id={`${id}-desc`}>
                              {def.description}
                              {options ? "" : ` (${valueText(def, Number(def.min))}~${valueText(def, Number(def.max))})`}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>

          <div class="manual-actions">
            <Magnetic>
              <button type="submit" class="btn btn--primary" disabled={applying}>
                <Icon name="refresh" size={18} />
                {applying ? "계산하는 중" : "반영하기"}
              </button>
            </Magnetic>
            <button
              type="button"
              class="btn btn--ghost"
              disabled={applying || (!filled && !Object.values(draft).some(Boolean))}
              onClick={() => {
                setDraft({});
                onApply({});
              }}
            >
              모두 지우기
            </button>
          </div>

          <div class="manual-status" role="status" aria-live="polite">
            {result.status === "error" ? (
              <p class="manual-status__error">
                <Icon name="alert" size={16} />
                {result.error} 공식 API 값으로 계산한 스탯을 보여주고 있어요.
              </p>
            ) : null}
            {applied ? (
              <>
                <p class="manual-status__ok">
                  <Icon name="sparkle" size={16} />
                  직접 입력 {appliedRows.length || filled}개를 반영했어요{result.at ? ` · ${formatRelativeTime(result.at)}` : ""}
                </p>
                {Number.isFinite(powerBefore) && Number.isFinite(powerAfter) && powerBefore !== powerAfter ? (
                  <p class="manual-power num">
                    계산 전투력 {formatKoreanUnits(powerBefore)} <Icon name="arrowRight" size={16} /> <strong>{formatKoreanUnits(powerAfter)}</strong>
                    <span class="manual-power__delta">
                      {/** @type {number} */ (powerAfter) > /** @type {number} */ (powerBefore) ? "▲" : "▼"} {formatKoreanUnits(Math.abs(/** @type {number} */ (powerAfter) - /** @type {number} */ (powerBefore)))}
                    </span>
                  </p>
                ) : null}
                {appliedRows.length ? (
                  <ul class="manual-applied">
                    {appliedRows.map(([id, value]) => (
                      <li key={id}>
                        <span>{byId.get(id)?.label || id}</span>
                        <strong class="num">{valueText(byId.get(id), Number(value))}</strong>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {warnings.length ? (
                  <p class="manual-status__warn">
                    <Icon name="info" size={16} />
                    {warnings.length}개 값은 반영하지 않았거나 범위에 맞춰 고쳤어요.
                  </p>
                ) : null}
              </>
            ) : null}
            {result.status === "idle" && !filled ? <p class="manual-status__hint">입력한 값은 이 브라우저에만 저장돼요.</p> : null}
          </div>
        </form>
      ) : null}
    </Card>
  );
}
