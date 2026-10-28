// 장비 탭: 프리셋 전환 · 장비창 배치 그리드 · 툴팁(마우스) · 자세히 보기(하단 시트) · 세트 효과.
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { Reveal } from "../../components/Motion.jsx";
import { Sheet } from "../../components/Sheet.jsx";
import { SourceStamp } from "../../components/SourceStamp.jsx";
import { EmptyState } from "../../components/States.jsx";
import { SLOT_LAYOUT, gradeInfo, potentialInfo, presetByNo, presetNumbers, slotKey, starforce } from "../../lib/character.js";
import { hasFinePointer } from "../../lib/motion.js";

/**
 * @param {{ label: string, options: any[], grade?: any }} props
 */
function OptionBlock({ label, options, grade }) {
  if (!Array.isArray(options) || !options.length) return null;
  return (
    <div class="eq-opts">
      <p class="eq-opts__head">
        {label}
        {grade ? <span class={`grade-badge tone-${grade.tone}`}>{grade.letter} · {grade.label}</span> : null}
      </p>
      <ul>
        {options.map((option, index) => (
          <li key={index}>
            <span>{option.name}</span>
            <strong class="num">{option.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 장비 한 개의 자세한 정보(툴팁·시트 공용).
 * @param {{ item: any, compact?: boolean }} props
 */
export function EquipDetail({ item, compact = false }) {
  const grade = gradeInfo(item.itemGrade);
  const star = starforce(item.starforceUpgrade);
  const emblem = item.emblemInfo;
  return (
    <div class={`eq-detail${compact ? " eq-detail--compact" : ""}`}>
      <div class="eq-detail__head">
        <span class={`eq-detail__icon${grade ? ` tone-${grade.tone}` : ""}`}>
          {item.itemIcon ? <img src={item.itemIcon} alt="" width={48} height={48} loading="lazy" /> : <Icon name="medal" size={28} />}
        </span>
        <div>
          <p class="eq-detail__slot">{item.slotName || "-"}</p>
          <p class="eq-detail__name">{item.itemName || "-"}</p>
          <p class="eq-detail__tags">
            {grade ? <span class={`grade-badge tone-${grade.tone}`}>{grade.letter} · {grade.label}</span> : null}
            {star ? <span class="star-badge num">★ {star}</span> : null}
            {item.equipmentLevel ? <span class="badge">Lv.{item.equipmentLevel}</span> : null}
          </p>
        </div>
      </div>
      {item.itemOptionText ? <p class="eq-detail__main num">{item.itemOptionText}</p> : null}
      <OptionBlock label="기본 옵션" options={item.basicOption} />
      <OptionBlock label="추가 옵션" options={item.additionalOption} />
      <OptionBlock label="잠재 옵션" options={item.potentialOption} grade={potentialInfo(item.potentialOption, item.potentialGrade)} />
      <OptionBlock label="에디셔널 잠재" options={item.additionalPotentialOption} grade={potentialInfo(item.additionalPotentialOption, item.additionalPotentialGrade)} />
      {item.soulInfo?.soulName ? (
        <div class="eq-opts">
          <p class="eq-opts__head">소울</p>
          <ul>
            <li>
              <span>{item.soulInfo.soulName}</span>
              <strong>{item.soulInfo.soulOption || "-"}</strong>
            </li>
          </ul>
        </div>
      ) : null}
      {emblem?.emblem_name ? (
        <div class="eq-opts">
          <p class="eq-opts__head">문장</p>
          <ul>
            <li>
              <span>
                {emblem.emblem_name} Lv.{emblem.emblem_level}
              </span>
              <strong>{emblem.emblem_option || "-"}</strong>
            </li>
          </ul>
        </div>
      ) : null}
      {!compact && Number.isFinite(Number(item.karmaScissorsRemaining)) ? (
        <p class="eq-detail__foot num">카르마의 가위 남은 횟수 {item.karmaScissorsRemaining}회</p>
      ) : null}
    </div>
  );
}

/**
 * @param {{ data: any, mode: "boss" | "current", presetNo?: number | null, at?: string }} props
 */
export function Equipment({ data, mode, presetNo, at }) {
  const tab = data.tabs?.equipment;
  const numbers = presetNumbers(tab);
  const [chosen, setChosen] = useState(/** @type {number | null} */ (null));
  const [sheetItem, setSheetItem] = useState(/** @type {any} */ (null));
  const [tip, setTip] = useState(/** @type {{ item: any, rect: DOMRect } | null} */ (null));
  const tipRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [tipPos, setTipPos] = useState({ x: -9999, y: 0 });

  // 보스 세팅/현재 착용을 바꾸면 그 기준의 프리셋으로 돌아간다.
  useEffect(() => setChosen(null), [mode]);

  const bossNo = data.profile?.statSetting?.dimensions?.find((dim) => dim.key === "equipment")?.boss ?? null;
  const activeNo = tab?.activePresetNo ?? null;
  const currentNo = chosen ?? presetNo ?? activeNo;
  const preset = presetByNo(tab, currentNo);
  const items = Array.isArray(preset?.data?.itemEquipment) ? preset.data.itemEquipment : [];

  /** @type {Map<string, any>} */
  const bySlot = new Map();
  const extras = [];
  for (const item of items) {
    const key = slotKey(item);
    if (key && !bySlot.has(key)) bySlot.set(key, item);
    else extras.push(item);
  }

  useLayoutEffect(() => {
    if (!tip || !tipRef.current) return;
    const { rect } = tip;
    const width = tipRef.current.offsetWidth;
    const height = tipRef.current.offsetHeight;
    const gap = 12;
    let x = rect.right + gap;
    if (x + width > window.innerWidth - 8) x = rect.left - gap - width;
    x = Math.max(8, x);
    const y = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8));
    setTipPos({ x, y });
  }, [tip]);

  useEffect(() => {
    if (!tip) return undefined;
    const hide = () => setTip(null);
    window.addEventListener("scroll", hide, { passive: true });
    return () => window.removeEventListener("scroll", hide);
  }, [tip]);

  if (!tab || !numbers.length) {
    return <EmptyState title="장비 정보가 없어요" description="넥슨 API에서 장비 정보를 받지 못했어요." />;
  }

  /** @param {any} item @param {string} label */
  const slotButton = (item, label) => {
    const grade = gradeInfo(item.itemGrade);
    const pot = potentialInfo(item.potentialOption, item.potentialGrade);
    const star = starforce(item.starforceUpgrade);
    const aria = [label, item.itemName, grade?.label, star ? `스타포스 ${star}` : "", pot ? `잠재 ${pot.label}` : ""].filter(Boolean).join(", ");
    return (
      <button
        type="button"
        class={`eq-slot${grade ? ` tone-${grade.tone}` : ""}`}
        aria-label={`${aria}. 자세히 보기`}
        onClick={() => {
          setTip(null);
          setSheetItem(item);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse" && hasFinePointer()) setTip({ item, rect: /** @type {HTMLElement} */ (event.currentTarget).getBoundingClientRect() });
        }}
        onPointerLeave={() => setTip(null)}
        onFocus={(event) => {
          if (hasFinePointer()) setTip({ item, rect: /** @type {HTMLElement} */ (event.currentTarget).getBoundingClientRect() });
        }}
        onBlur={() => setTip(null)}
      >
        {item.itemIcon ? <img src={item.itemIcon} alt="" width={40} height={40} loading="lazy" decoding="async" /> : <Icon name="medal" size={24} />}
        {star ? <span class="eq-slot__star num">★{star}</span> : null}
        {pot ? <span class={`eq-slot__pot tone-${pot.tone}`}>{pot.letter}</span> : null}
      </button>
    );
  };

  const setEffects = Array.isArray(tab.setEffects) ? tab.setEffects : [];
  const figure = data.profile?.imageUrl;

  return (
    <div class="eq">
      <div class="eq-toolbar">
        <div class="eq-presets" role="radiogroup" aria-label="장비 프리셋">
          {numbers.map((no) => {
            const checked = no === preset?.presetNo;
            return (
              <button
                key={no}
                type="button"
                role="radio"
                aria-checked={checked ? "true" : "false"}
                class={`eq-preset${checked ? " is-checked" : ""}`}
                onClick={() => setChosen(no)}
              >
                <span class="num">프리셋 {no}</span>
                {no === bossNo ? <span class="eq-preset__tag tone-gold">보스</span> : null}
                {no === activeNo ? <span class="eq-preset__tag tone-mint">착용</span> : null}
              </button>
            );
          })}
        </div>
        <p class="eq-legend">
          <span class="eq-legend__item">
            <span class="eq-slot__pot tone-mint">L</span> 잠재 등급
          </span>
          <span class="eq-legend__item">
            <span class="num">★</span> 스타포스
          </span>
        </p>
      </div>

      <Reveal class="eq-board" key={preset?.presetNo}>
        <div class="eq-grid">
          {SLOT_LAYOUT.map(([key, label, col, row]) => {
            const item = bySlot.get(key);
            return (
              <div key={key} class="eq-cell" style={{ gridColumn: col, gridRow: row }}>
                {item ? slotButton(item, label) : <span class="eq-slot eq-slot--empty" aria-label={`${label} 비어 있음`} role="img"><span>{label}</span></span>}
              </div>
            );
          })}
          <div class="eq-figure" aria-hidden="true">
            {figure ? <img src={figure} alt="" width={128} height={128} /> : null}
          </div>
        </div>
        {extras.length ? (
          <div class="eq-extras">
            {extras.map((item, index) => (
              <div key={index} class="eq-cell">
                {slotButton(item, item.slotName || "기타")}
              </div>
            ))}
          </div>
        ) : null}
      </Reveal>
      <p class="eq-hint">
        <Icon name="info" size={16} />
        장비를 누르면 옵션을 자세히 볼 수 있어요{hasFinePointer() ? ". 마우스를 올리면 바로 보여요" : ""}.
      </p>

      {setEffects.length || preset?.data?.soulSetOption ? (
        <div class="eq-sets">
          <h3 class="sub-title">세트 효과</h3>
          <ul class="eq-sets__list">
            {setEffects.map((set, index) => (
              <li key={index}>
                <strong>{set.setName}</strong>
                <span class="badge num">{set.setCount}세트</span>
                <span class="eq-sets__opt">{set.setOption}</span>
              </li>
            ))}
            {preset?.data?.soulSetOption ? (
              <li>
                <strong>소울 세트</strong>
                <span class="eq-sets__opt">{preset.data.soulSetOption}</span>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <SourceStamp at={preset?.sourceTimestamp || at} note={preset?.source && preset.source !== "api" ? "저장된 프리셋 기록" : ""} />

      {tip ? (
        <div ref={tipRef} class="eq-tip" role="tooltip" style={{ transform: `translate(${tipPos.x}px, ${tipPos.y}px)` }}>
          <EquipDetail item={tip.item} compact />
        </div>
      ) : null}

      <Sheet open={Boolean(sheetItem)} title={sheetItem ? sheetItem.itemName || "장비" : "장비"} onClose={() => setSheetItem(null)}>
        {sheetItem ? <EquipDetail item={sheetItem} /> : null}
      </Sheet>
    </div>
  );
}
