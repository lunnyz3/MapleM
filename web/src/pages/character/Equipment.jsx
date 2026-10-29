// 장비 탭: 프리셋 전환 · 장비창 배치 그리드 · 툴팁(마우스, 공유 버튼) · 자세히 보기(하단 시트, 공유).
// 툴팁 스타일은 캐릭터 화면 CSS에 있다(랭킹 화면의 장비 시트도 같이 쓴다).
import "../../styles/character.css";
import { createPortal } from "preact/compat";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { Reveal, spotlightHandlers } from "../../components/Motion.jsx";
import { Sheet } from "../../components/Sheet.jsx";
import { EmptyState } from "../../components/States.jsx";
import { SLOT_LAYOUT, emblemInfo, gradeInfo, potentialInfo, presetByNo, presetNumbers, slotKey, starRows, starforce } from "../../lib/character.js";
import { formatComma } from "../../lib/format.js";
import { hasFinePointer } from "../../lib/motion.js";
import { loadItemRanks, rankText, useItemRank } from "../../lib/itemRanks.js";
import { itemInsight } from "../../lib/share.js";
import { ItemShare } from "./Share.jsx";
import { useShareCaption } from "../../lib/shareSettings.js";
import { WhatIf } from "./WhatIf.jsx";

/** 장비에서 툴팁으로 마우스를 옮기는 동안 툴팁을 유지하는 시간(ms) */
const TIP_HIDE_DELAY = 220;

/** 공격력을 보여 주는 부위 */
const ATTACK_SLOTS = new Set(["weapon", "subWeapon", "emblem"]);

/**
 * 장비 한 개의 계산 결과(줄별 마스터리 상승분 · 잠재·에디·추가 옵션 상위 %). 계산 중이거나 못 하면 null.
 * @param {any} item @param {any} profile
 */
function useItemInsight(item, profile) {
  const [insight, setInsight] = useState(/** @type {any} */ (null));
  useEffect(() => {
    let alive = true;
    setInsight(null);
    itemInsight(item, profile).then((value) => alive && setInsight(value));
    return () => {
      alive = false;
    };
  }, [item]);
  return insight;
}

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
 * 옵션 묶음. grade 가 있으면 잠재 등급 아이콘과 등급 이름을, badge 가 있으면 머리 오른쪽에 단다.
 * bonuses[i] 는 i 번째 줄의 마스터리 상승분("+4%")이다.
 * @param {{ label: string, options: any[], grade?: any, tone?: string, bonuses?: string[], badge?: string }} props
 */
function OptionBlock({ label, options, grade, tone, bonuses = [], badge = "" }) {
  if (!Array.isArray(options) || !options.length) return null;
  return (
    <section class={`eq-opts${grade ? ` is-${grade.key}` : ""}${tone ? ` eq-opts--${tone}` : ""}`}>
      <h4 class="eq-opts__head">
        {grade ? <img class="eq-opts__tier" src={grade.icon} alt="" width={14} height={14} /> : null}
        <span>{label}</span>
        {grade ? <span class="eq-opts__grade">{grade.label}</span> : null}
        {badge ? <span class="eq-opts__grade num">{badge}</span> : null}
      </h4>
      <ul>
        {options.map((option, index) => (
          <li key={index}>
            <span>{option.name}</span>
            <strong class="num">
              {option.value}
              {bonuses[index] ? <small class="eq-opts__bonus">{bonuses[index]}</small> : null}
            </strong>
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
 * @param {{ item: any, profile?: any, compact?: boolean }} props
 */
export function EquipDetail({ item, profile = null, compact = false }) {
  const grade = gradeInfo(item.itemGrade);
  const star = starforce(item.starforceUpgrade);
  const emblem = emblemInfo(item.emblemInfo);
  const key = slotKey(item);
  const potential = potentialInfo(item.potentialOption, item.potentialGrade);
  const additional = potentialInfo(item.additionalPotentialOption, item.additionalPotentialGrade);
  const attack = ATTACK_SLOTS.has(key) && Number(item.combatPower) > 0 ? formatComma(item.combatPower) : "";
  const karma = Number(item.karmaScissorsRemaining);
  const expand = Number(item.remainingStarforceExpansion);
  const insight = useItemInsight(item, profile);
  const bonuses = insight?.bonuses || {};
  const rank = useItemRank(item.fingerprint);

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
      {rank ? (
        <p class="eq-detail__rank num">
          <span class="eq-detail__score">템환산 {formatComma(Math.round(rank.score))}</span>
          {rankText(rank) ? (
            <span class="eq-detail__place">{rankText(rank)}</span>
          ) : null}
        </p>
      ) : null}

      <div class="eq-detail__body">
        <OptionBlock label="기본 옵션" options={item.basicOption} />
        <OptionBlock label="추가 옵션" options={item.additionalOption} tone="add" bonuses={bonuses.additional} badge={insight?.additionalOptionTop ? `상위 ${insight.additionalOptionTop}` : ""} />
        <OptionBlock label="잠재능력" options={item.potentialOption} grade={potential} bonuses={bonuses.potential} badge={insight?.potentialTop ? `상위 ${insight.potentialTop}` : ""} />
        <OptionBlock label="에디셔널 잠재능력" options={item.additionalPotentialOption} grade={additional} bonuses={bonuses.additionalPotential} badge={insight?.additionalPotentialTop ? `상위 ${insight.additionalPotentialTop}` : ""} />
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
 * @param {{ data: any, world: string, mode: "boss" | "current", presetNo?: number | null }} props
 */
export function Equipment({ data, world, mode, presetNo }) {
  const tab = data.tabs?.equipment;
  const numbers = presetNumbers(tab);
  const [chosen, setChosen] = useState(/** @type {number | null} */ (null));
  const [sheetItem, setSheetItem] = useState(/** @type {any} */ (null));
  const [tip, setTip] = useState(/** @type {{ item: any, rect: DOMRect } | null} */ (null));
  const tipRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [tipPos, setTipPos] = useState({ x: -9999, y: 0, side: "right" });
  const hideTimer = useRef(/** @type {number | undefined} */ (undefined));
  // 공유 문구가 장비 순위를 찾을 수 있게 ocid 를 함께 넘긴다.
  const profile = useMemo(() => ({ ...(data.profile || {}), ocid: data.ocid }), [data]);
  const [captionOn, setCaptionOn] = useShareCaption();
  // 장비 시트에서 "옵션 바꿔 보기"를 눌렀는지(다른 장비를 열면 닫는다).
  const [whatIf, setWhatIf] = useState(false);
  useEffect(() => setWhatIf(false), [sheetItem]);
  useEffect(() => {
    loadItemRanks(data.ocid);
  }, [data.ocid]);
  const keepTip = () => window.clearTimeout(hideTimer.current);
  // 툴팁 안의 공유 버튼을 누를 수 있게, 장비에서 벗어나도 잠깐 기다렸다가 닫는다.
  const hideTipSoon = () => {
    keepTip();
    hideTimer.current = window.setTimeout(() => setTip(null), TIP_HIDE_DELAY);
  };
  useEffect(() => keepTip, []);

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
          keepTip();
          setTip(null);
          setSheetItem(item);
        }}
        onPointerEnter={(event) => {
          keepTip();
          if (event.pointerType === "mouse" && hasFinePointer()) setTip({ item, rect: /** @type {HTMLElement} */ (event.currentTarget).getBoundingClientRect() });
        }}
        onPointerLeave={hideTipSoon}
        onFocus={(event) => {
          keepTip();
          if (hasFinePointer()) setTip({ item, rect: /** @type {HTMLElement} */ (event.currentTarget).getBoundingClientRect() });
        }}
        onBlur={hideTipSoon}
        {...spotlightHandlers()}
      >
        {emblem?.levelGif ? <img class="eq-slot__emblem-bg" src={emblem.levelGif} alt="" decoding="async" /> : null}
        {item.itemIcon ? <img class="eq-slot__img" src={item.itemIcon} alt="" width={40} height={40} loading="lazy" decoding="async" /> : <Icon name="medal" size={24} />}
        {star ? <span class="eq-slot__star num">★{star}</span> : null}
        {pot ? <img class="eq-slot__pot" src={pot.icon} alt="" width={14} height={14} /> : null}
      </button>
    );
  };

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
        <label class="eq-caption-switch">
          <input
            type="checkbox"
            role="switch"
            checked={captionOn}
            onChange={(event) => setCaptionOn(/** @type {HTMLInputElement} */ (event.currentTarget).checked)}
          />
          <span class="eq-caption-switch__track" aria-hidden="true">
            <span class="eq-caption-switch__thumb" />
          </span>
          <span class="eq-caption-switch__text">공유 이미지에 자랑 문구</span>
        </label>
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

      {/* 툴팁은 body 에 그린다: 위쪽 요소의 transform 애니메이션이 fixed 위치 기준을 바꾸지 않게 */}
      {tip
        ? createPortal(
            <>
              <div ref={tipRef} class={`eq-tip eq-tip--${tipPos.side}`} role="tooltip" style={{ transform: `translate(${tipPos.x}px, ${tipPos.y}px)` }}>
                <div class="eq-tip__inner" key={tip.item.itemName}>
                  <EquipDetail item={tip.item} profile={profile} compact />
                </div>
              </div>
              {/* 공유 알약: 마우스를 올린 장비 바로 위에 띄워(위가 모자라면 아래) 툴팁이 위로 밀려도 바로 누를 수 있다.
                  툴팁 본문은 마우스가 지나가게 두어 옆 장비를 가리지 않는다. */}
              <div
                key={`share-${tip.item.itemName}`}
                class={`eq-tip-share${tip.rect.top < 76 ? " is-below" : ""}`}
                style={{
                  left: `${Math.max(8, Math.min(window.innerWidth - 8, tip.rect.left + tip.rect.width / 2))}px`,
                  top: `${tip.rect.top < 76 ? tip.rect.bottom + 6 : tip.rect.top - 6}px`
                }}
                onPointerEnter={keepTip}
                onPointerLeave={hideTipSoon}
              >
                <ItemShare item={tip.item} profile={profile} world={world} compact />
              </div>
            </>,
            document.body
          )
        : null}

      <Sheet open={Boolean(sheetItem)} title={sheetItem ? sheetItem.itemName || "장비" : "장비"} onClose={() => setSheetItem(null)}>
        {sheetItem && whatIf ? (
          <WhatIf
            item={sheetItem}
            majorStats={data.profile?.majorStats || {}}
            attackType={data.profile?.attackType || "physical"}
            basePower={Number(data.profile?.statSetting?.combatPower?.boss) || null}
            onClose={() => setWhatIf(false)}
          />
        ) : null}
        {sheetItem && !whatIf ? (
          <ItemShare item={sheetItem} profile={profile} world={world}>
            <button type="button" class="btn btn--secondary btn--sm eq-whatif-open" onClick={() => setWhatIf(true)}>
              <Icon name="sparkle" size={16} />
              옵션 바꿔 보기
            </button>
            <EquipDetail item={sheetItem} profile={profile} />
          </ItemShare>
        ) : null}
      </Sheet>
    </div>
  );
}
