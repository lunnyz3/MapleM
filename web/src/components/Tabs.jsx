import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./Icon.jsx";
import { Indicator, useIndicator } from "./Motion.jsx";

/**
 * @typedef {{ id: string, label: string, icon?: string, count?: number }} TabItem
 */

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * ARIA 탭 목록. ←/→ 로 이동(선택이 포커스를 따라감), Home/End 로 처음·끝.
 * scrollable 이면 한 줄로 두고 가로로 밀어 본다(페이지는 넘치지 않는다).
 * @param {{
 *   items: TabItem[],
 *   value: string,
 *   onChange: (id: string) => void,
 *   label: string,
 *   idBase: string,
 *   variant?: "pill" | "segmented",
 *   scrollable?: boolean,
 *   class?: string
 * }} props
 */
export function Tabs({ items, value, onChange, label, idBase, variant = "pill", scrollable = false, class: className = "" }) {
  const listRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  /** @type {import("preact").RefObject<Array<HTMLButtonElement | null>>} */
  const tabRefs = useRef([]);
  const [edges, setEdges] = useState({ start: true, end: true });
  const selectedIndex = Math.max(0, items.findIndex((item) => item.id === value));
  // 선택 표시가 탭 사이를 미끄러져 옮겨 간다(재기 전에는 선택된 탭이 스스로 칠한다).
  const box = useIndicator(listRef, '[aria-selected="true"]', [selectedIndex, items.length]);

  // 가로로 밀리는 탭 목록: 양 끝에 더 있음을 흐림으로 알린다.
  useEffect(() => {
    const list = listRef.current;
    if (!scrollable || !list) return undefined;
    const update = () => {
      const max = list.scrollWidth - list.clientWidth;
      setEdges({ start: list.scrollLeft <= 2, end: list.scrollLeft >= max - 2 });
    };
    update();
    list.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      list.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [scrollable]);

  // 선택된 탭이 보이도록 목록만 가로로 민다(페이지 세로 스크롤은 건드리지 않는다).
  useEffect(() => {
    const list = listRef.current;
    const tab = tabRefs.current[selectedIndex];
    if (!scrollable || !list || !tab) return;
    const start = tab.offsetLeft;
    const end = start + tab.offsetWidth;
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    if (start < list.scrollLeft + 24) list.scrollTo({ left: Math.max(0, start - 24), behavior });
    else if (end > list.scrollLeft + list.clientWidth - 24) list.scrollTo({ left: end - list.clientWidth + 24, behavior });
  }, [selectedIndex, scrollable]);

  /** @param {KeyboardEvent} event */
  const onKeyDown = (event) => {
    let next = -1;
    if (event.key === "ArrowRight") next = (selectedIndex + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (selectedIndex - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onChange(items[next].id);
    tabRefs.current[next]?.focus();
  };

  const classes = [
    "tabs",
    `tabs--${variant}`,
    scrollable ? "tabs--scroll" : "",
    scrollable && !edges.start ? "has-more-start" : "",
    scrollable && !edges.end ? "has-more-end" : "",
    box ? "has-indicator" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div class={scrollable ? "tabs-frame" : undefined}>
      <div ref={listRef} class={classes} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        <Indicator box={box} class="tabs__indicator" />
        {items.map((item, index) => {
          const selected = index === selectedIndex;
          return (
            <button
              key={item.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${idBase}-tab-${item.id}`}
              class="tabs__tab"
              aria-selected={selected ? "true" : "false"}
              aria-controls={`${idBase}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.id)}
            >
              {item.icon ? <Icon name={item.icon} size={18} /> : null}
              <span>{item.label}</span>
              {typeof item.count === "number" ? <span class="tabs__count num">{item.count}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 탭 패널. 내용이 바뀌는 동안 aria-busy 로 알린다.
 * @param {{ idBase: string, value: string, busy?: boolean, class?: string, children?: any, panelRef?: any }} props
 */
export function TabPanel({ idBase, value, busy = false, class: className = "", children, panelRef }) {
  return (
    <div
      ref={panelRef}
      id={`${idBase}-panel`}
      class={`tab-panel ${className}`}
      role="tabpanel"
      aria-labelledby={`${idBase}-tab-${value}`}
      aria-busy={busy ? "true" : "false"}
      tabIndex={0}
    >
      {/* 탭을 바꾸면 내용이 새로 들어오며 떠오른다(움직임 줄이기면 바로 보인다). */}
      <div key={value} class="tab-panel__enter">
        {children}
      </div>
    </div>
  );
}

/**
 * 둘 중 하나 고르기(라디오 그룹). 화살표 키 이동은 브라우저 기본 동작을 쓴다.
 * @param {{
 *   name: string,
 *   legend: string,
 *   options: Array<{ value: string, label: string, icon?: string }>,
 *   value: string,
 *   onChange: (value: string) => void,
 *   class?: string
 * }} props
 */
export function Segmented({ name, legend, options, value, onChange, class: className = "" }) {
  const ref = useRef(/** @type {HTMLFieldSetElement | null} */ (null));
  const box = useIndicator(ref, ".segmented__option.is-checked", [value, options.length]);
  return (
    <fieldset ref={ref} class={`segmented${box ? " has-indicator" : ""} ${className}`}>
      <legend class="sr-only">{legend}</legend>
      <Indicator box={box} class="segmented__indicator" />
      {options.map((option) => (
        <label key={option.value} class={`segmented__option${option.value === value ? " is-checked" : ""}`}>
          <input
            class="segmented__input"
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          {option.icon ? <Icon name={option.icon} size={18} /> : null}
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
