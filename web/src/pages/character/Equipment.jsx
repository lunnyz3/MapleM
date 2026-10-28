// 장비 탭: 프리셋 전환 · 장비창 배치 그리드 · 툴팁(마우스) · 자세히 보기(하단 시트) · 세트 효과.
import { createPortal } from "preact/compat";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { Reveal, spotlightHandlers } from "../../components/Motion.jsx";
import { Sheet } from "../../components/Sheet.jsx";
import { EmptyState } from "../../components/States.jsx";
import { SLOT_LAYOUT, emblemInfo, gradeInfo, potentialInfo, presetByNo, presetNumbers, slotKey, starRows, starforce } from "../../lib/character.js";
import { formatComma } from "../../lib/format.js";
import { hasFinePointer } from "../../lib/motion.js";

/** 공격력을 보여 주는 부위 */
const ATTACK_SLOTS = new Set(["weapon", "subWeapon", "emblem"]);

/**
 * 스타포스 별: 5개씩 묶음, 한 줄 20개. 10강마다 별이 반짝인다.
 * @param {{ count: number | null }} props
 */
function StarRow({ count }) {
  const rows = starRows(count);
  if (!rows.length) return null;
  return (
    <div class="eq-stars" role="img" aria-label={`스타포스 ${count}성`}>
      {rows.map((row, r) => (
        <div key={r} class="eq-stars__line">
          {row.map((group, g) => (
            <span key={g} class="eq-stars__group">
              {group.map((star) => (
                <span key={star.index} class={`eq-star${star.milestone ? " is-milestone" : ""}`} style={{ "--i": star.index }}>
                  ★
                </span>
              ))}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * 옵션 묶음. grade 가 있으면 잠재 등급 아이콘과 등급 이름을 머리에 단다.
 * @param {{ label: string, options: any[], grade?: any, tone?: string }} props
 */
function OptionBlock({ label, options, grade, tone }) {
  if (!Array.isArray(options) || !options.length) return null;
  return (
    <section class={`eq-opts${grade ? ` is-${grade.key}` : ""}${tone ? ` eq-opts--${tone}` : ""}`}>
      <h4 class="eq-opts__head">
        {grade ? <img class="eq-opts__tier" src={grade.icon} alt="" width={14} height={14} /> : null}
        <span>{label}</span>
        {grade ? <span class="eq-opts__grade">{grade.label}</span> : null}
      </h4>
      <ul>
        {options.map((option, index) => (
          <li key={index}>
            <span>{option.name}</span>
            <strong class="num">{option.value}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 장비 아이콘 상자: 등급 테두리 + (문장이 있으면) 문장 레벨 배경 GIF.
 * @param {{ item: any, size?: number }} props
 */
function ItemIcon({ item, size = 56 }) {
  const grade = gradeInfo(item.itemGrade);
  const emblem = emblemInfo(item.emblemInfo);
  return (
    <span class={`eq-icon${grade ? ` is-${grade.key}` : ""}${emblem?.levelGif ? " has-emblem" : ""}`} style={{ "--icon-box": `${size + 16}px` }}>
      {emblem?.levelGif ? <img class="eq-icon__emblem-bg" src={emblem.levelGif} alt="" decoding="async" /> : null}
      {item.itemIcon ? <img class="eq-icon__img" src={item.itemIcon} alt="" width={size} height={size} loading="lazy" /> : <Icon name="medal" size={28} />}
    </span>
  );
}

/**
 * 장비 한 개의 자세한 정보(툴팁·시트 공용). 게임 툴팁처럼 어두운 판 위에 별·등급·옵션을 보여 준다.
 * @param {{ item: any, compact?: boolean }} props
 */
export function EquipDetail({ item, compact = false }) {
  const grade = gradeInfo(item.itemGrade);
  const star = starforce(item.starforceUpgrade);
  const emblem = emblemInfo(item.emblemInfo);
  const key = slotKey(item);
  const potential = potentialInfo(item.potentialOption, item.potentialGrade);
  const additional = potentialInfo(item.additionalPotentialOption, item.additionalPotentialGrade);
  const attack = ATTACK_SLOTS.has(key) && Number(item.combatPower) > 0 ? formatComma(item.combatPower) : "";
  const karma = Number(item.karmaScissorsRemaining);
  const expand = Number(item.remainingStarforceExpansion);

  return (
    <article class={`eq-detail${compact ? " eq-detail--compact" : ""}${grade ? ` is-${grade.key}` : ""}`}>
      <span class="eq-detail__glow" aria-hidden="true" />
      <StarRow count={star} />
      <header class="eq-detail__head">
        <ItemIcon item={item} size={compact ? 48 : 56} />
        <div class="eq-detail__titles">
          <p class="eq-detail__name">{item.itemName || "-"}</p>
          <p class="eq-detail__grade">
            {grade ? <span class="eq-detail__grade-text">{grade.label}</span> : null}
            {potential ? (
              <span class="eq-detail__tier" title={`잠재 ${potential.label}`}>
                <img src={potential.icon} alt={`잠재 ${potential.label}`} width={14} height={14} />
              </span>
            ) : null}
            {additional ? (
              <span class="eq-detail__tier" title={`에디셔널 ${additional.label}`}>
                <img src={additional.icon} alt={`에디셔널 ${additional.label}`} width={14} height={14} />
              </span>
            ) : null}
          </p>
          <p class="eq-detail__facts num">
            <span>{item.slotName || "-"}</span>
            {item.equipmentLevel ? <span>Lv.{item.equipmentLevel}</span> : null}
            {star ? <span class="eq-detail__star">★ {star}</span> : null}
            {attack ? <span>공격력 {attack}</span> : null}
          </p>
        </div>
      </header>

      <div class="eq-detail__body">
        <OptionBlock label="기본 옵션" options={item.basicOption} />
        <OptionBlock label="추가 옵션" options={item.additionalOption} tone="add" />
        <OptionBlock label="잠재능력" options={item.potentialOption} grade={potential} />
        <OptionBlock label="에디셔널 잠재능력" options={item.additionalPotentialOption} grade={additional} />
        {emblem ? (
          <section class="eq-opts eq-opts--emblem">
            <h4 class="eq-opts__head">
              {emblem.icon ? <img class="eq-opts__emblem" src={emblem.icon} alt="" width={20} height={20} /> : null}
              <span>{emblem.name}</span>
              {emblem.level ? <span class="eq-opts__grade num">Lv.{emblem.level}</span> : null}
            </h4>
            {emblem.options.length ? (
              <ul>
                {emblem.options.map((option, index) => (
                  <li key={index}>
                    <span>{option.name}</span>
                    <strong class="num">{option.value}</strong>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
        {item.soulInfo?.soulName ? (
          <section class="eq-opts eq-opts--soul">
            <h4 class="eq-opts__head">
              <Icon name="sparkle" size={14} />
              <span>{item.soulInfo.soulName}</span>
            </h4>
            {item.soulInfo.soulOption ? <p class="eq-opts__line">{item.soulInfo.soulOption}</p> : null}
          </section>
        ) : null}
        {karma > 0 || expand > 0 ? (
          <p class="eq-detail__foot num">
            {karma > 0 ? <span>카르마의 가위 {karma}회</span> : null}
            {expand > 0 ? <span>스타포스 확장 {expand}회</span> : null}
          </p>
        ) : null}
      </div>
    </article>
  );
}

/**
 * @param {{ data: any, mode: "boss" | "current", presetNo?: number | null }} props
 */
export function Equipment({ data, mode, presetNo }) {
  const tab = data.tabs?.equipment;
  const numbers = presetNumbers(tab);
  const [chosen, setChosen] = useState(/** @type {number | null} */ (null));
  const [sheetItem, setSheetItem] = useState(/** @type {any} */ (null));
  const [tip, setTip] = useState(/** @type {{ item: any, rect: DOMRect } | null} */ (null));
  const tipRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [tipPos, setTipPos] = useState({ x: -9999, y: 0, side: "right" });

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

  // 툴팁 자리: 장비 오른쪽(모자라면 왼쪽), 화면 아래로 넘치지 않게. 이미지·글꼴이 늦게 들어와 높이가 바뀌면 다시 잰다.
  useLayoutEffect(() => {
    const element = tipRef.current;
    if (!tip || !element) return undefined;
    const place = () => {
      const { rect } = tip;
      const width = element.offsetWidth;
      const height = element.scrollHeight;
      const gap = 14;
      let x = rect.right + gap;
      let side = "right";
      if (x + width > window.innerWidth - 8) {
        x = rect.left - gap - width;
        side = "left";
      }
      x = Math.max(8, x);
      const y = Math.max(8, Math.min(rect.top - 12, window.innerHeight - height - 8));
      setTipPos((prev) => (prev.x === x && prev.y === y && prev.side === side ? prev : { x, y, side }));
    };
    place();
    if (typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(place);
    observer.observe(/** @type {Element} */ (element.firstElementChild || element));
    return () => observer.disconnect();
  }, [tip]);

  useEffect(() => {
    if (!tip) return undefined;
    const hide = () => setTip(null);
    window.addEventListener("scroll", hide, { passive: true });
    return () => window.removeEventListener("scroll", hide);
  }, [tip]);

  if (!tab || !numbers.length) {
    return <EmptyState title="장비 정보가 없어요" />;
  }

  /** @param {any} item @param {string} label */
  const slotButton = (item, label) => {
    const grade = gradeInfo(item.itemGrade);
    const pot = potentialInfo(item.potentialOption, item.potentialGrade);
    const star = starforce(item.starforceUpgrade);
    const emblem = emblemInfo(item.emblemInfo);
    const aria = [label, item.itemName, grade?.label, star ? `스타포스 ${star}` : "", pot ? `잠재 ${pot.label}` : ""].filter(Boolean).join(", ");
    const open = tip?.item === item;
    return (
      <button
        type="button"
        class={`eq-slot spotlight${grade ? ` is-${grade.key}` : ""}${open ? " is-open" : ""}${emblem?.levelGif ? " has-emblem" : ""}`}
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
        {...spotlightHandlers()}
      >
        {emblem?.levelGif ? <img class="eq-slot__emblem-bg" src={emblem.levelGif} alt="" decoding="async" /> : null}
        {item.itemIcon ? <img class="eq-slot__img" src={item.itemIcon} alt="" width={40} height={40} loading="lazy" decoding="async" /> : <Icon name="medal" size={24} />}
        {star ? <span class="eq-slot__star num">★{star}</span> : null}
        {pot ? <img class="eq-slot__pot" src={pot.icon} alt="" width={14} height={14} /> : null}
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
      </div>

      <Reveal class="eq-board" key={preset?.presetNo}>
        <div class="eq-grid">
          {SLOT_LAYOUT.map(([key, label, col, row], index) => {
            const item = bySlot.get(key);
            return (
              <div key={key} class="eq-cell" data-slot={key} style={{ gridColumn: col, gridRow: row, "--stagger": index }}>
                {item ? (
                  slotButton(item, label)
                ) : (
                  <span class="eq-slot eq-slot--empty" aria-label={`${label} 비어 있음`} role="img">
                    <span>{label}</span>
                  </span>
                )}
              </div>
            );
          })}
          <div class="eq-figure" aria-hidden="true">
            <span class="eq-figure__ring" />
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

      {/* 툴팁은 body 에 그린다: 위쪽 요소의 transform 애니메이션이 fixed 위치 기준을 바꾸지 않게 */}
      {tip
        ? createPortal(
        <div
          ref={tipRef}
          class={`eq-tip eq-tip--${tipPos.side}`}
          role="tooltip"
          style={{ transform: `translate(${tipPos.x}px, ${tipPos.y}px)` }}
        >
          <div class="eq-tip__inner" key={tip.item.itemName}>
            <EquipDetail item={tip.item} compact />
          </div>
        </div>,
            document.body
          )
        : null}

      <Sheet open={Boolean(sheetItem)} title={sheetItem ? sheetItem.itemName || "장비" : "장비"} onClose={() => setSheetItem(null)}>
        {sheetItem ? <EquipDetail item={sheetItem} /> : null}
      </Sheet>
    </div>
  );
}
