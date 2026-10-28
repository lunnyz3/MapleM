// 인터랙션 컴포넌트(직접 구현, 외부 의존성 없음).
// 숫자 카운트업 · 스크롤 등장 · 블러 텍스트 등장 · 스포트라이트 · 틸트 · 자석 버튼 · 오로라 배경.
// 동작 아이디어는 React Bits(reactbits.dev)의 Count Up · Blur Text · Spotlight Card · Tilted Card · Magnet · Aurora 를 참고했다.
// React Bits 는 "MIT + Commons Clause" 라이선스라 코드를 가져오지 않고 새로 썼다(출처: /preview/licenses).
// 원칙: transform·opacity 위주, prefers-reduced-motion 이면 끈다, 정밀 포인터(마우스)에서만 따라 움직인다.
import { useEffect, useRef, useState } from "preact/hooks";
import { hasFinePointer, prefersReducedMotion, useInView } from "../lib/motion.js";

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/**
 * 숫자 카운트업. 처음 화면에 들어올 때 0→값, 값이 바뀌면 이전 값→새 값으로 움직인다.
 * 읽기 프로그램에는 최종 값만 읽힌다.
 * @param {{ value: number | null | undefined, format: (n: number) => string, duration?: number, title?: string, class?: string }} props
 */
export function CountUp({ value, format, duration = 900, title, class: className = "" }) {
  const ref = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const inView = useInView(ref, { threshold: 0.2, rootMargin: "0px" });
  const target = Number.isFinite(Number(value)) ? Number(value) : null;
  const [shown, setShown] = useState(() => (target === null ? null : prefersReducedMotion() ? target : 0));
  const fromRef = useRef(0);

  useEffect(() => {
    if (target === null) {
      setShown(null);
      return undefined;
    }
    if (!inView) return undefined;
    if (prefersReducedMotion()) {
      setShown(target);
      fromRef.current = target;
      return undefined;
    }
    const from = fromRef.current;
    if (from === target) {
      setShown(target);
      return undefined;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const current = from + (target - from) * easeOutCubic(t);
      setShown(t >= 1 ? target : current);
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      fromRef.current = target;
    };
  }, [target, inView, duration]);

  const finalText = target === null ? "-" : format(target);
  const shownText = shown === null ? "-" : shown === target ? finalText : format(shown);
  return (
    <span ref={ref} class={`count-up num ${className}`} title={title}>
      <span aria-hidden="true">{shownText}</span>
      <span class="sr-only">{finalText}</span>
    </span>
  );
}

/**
 * 스크롤 등장: 화면에 들어오면 아래에서 살짝 떠오른다(움직임 줄이기면 바로 보인다).
 * @param {{ as?: any, delay?: number, class?: string, children?: any, [key: string]: any }} props
 */
export function Reveal({ as: Tag = "div", delay = 0, class: className = "", children, ...rest }) {
  const ref = useRef(/** @type {HTMLElement | null} */ (null));
  const inView = useInView(ref);
  return (
    <Tag ref={ref} class={`reveal${inView ? " is-in" : ""} ${className}`} style={delay ? { "--reveal-delay": `${delay}ms` } : undefined} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * 블러 텍스트 등장: 낱말마다 흐림→선명으로 차례로 나타난다(제목용).
 * @param {{ text: string, as?: any, class?: string, id?: string, stagger?: number }} props
 */
export function BlurText({ text, as: Tag = "span", class: className = "", id, stagger = 70 }) {
  const words = String(text || "").split(/(\s+)/);
  let index = 0;
  return (
    <Tag id={id} class={`blur-text ${className}`}>
      {words.map((word, i) => {
        if (/^\s+$/.test(word) || !word) return word;
        const order = index++;
        return (
          <span key={i} class="blur-text__word" style={{ "--word-index": order, "--word-stagger": `${stagger}ms` }}>
            {word}
          </span>
        );
      })}
    </Tag>
  );
}

/**
 * 스포트라이트: 마우스를 따라 카드 위에 은은한 빛. 반환값을 요소에 펼쳐 넣는다.
 * CSS 는 .spotlight(--spot-x, --spot-y)를 읽는다.
 */
export function spotlightHandlers() {
  return {
    /** @param {PointerEvent} event */
    onPointerMove(event) {
      if (event.pointerType !== "mouse") return;
      const element = /** @type {HTMLElement} */ (event.currentTarget);
      const rect = element.getBoundingClientRect();
      element.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
      element.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
    }
  };
}

/**
 * 틸트 카드: 마우스 위치에 따라 최대 maxDeg 만큼 기울어진다(정밀 포인터·움직임 허용일 때만).
 * @param {{ maxDeg?: number, class?: string, children?: any }} props
 */
export function Tilt({ maxDeg = 5, class: className = "", children }) {
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
  const frame = useRef(0);

  /** @param {PointerEvent} event */
  const onMove = (event) => {
    const element = ref.current;
    if (!element || event.pointerType !== "mouse" || prefersReducedMotion()) return;
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      element.style.setProperty("--tilt-x", `${(-y * maxDeg).toFixed(2)}deg`);
      element.style.setProperty("--tilt-y", `${(x * maxDeg).toFixed(2)}deg`);
      element.classList.add("is-tilting");
    });
  };
  const onLeave = () => {
    const element = ref.current;
    if (!element) return;
    cancelAnimationFrame(frame.current);
    element.style.setProperty("--tilt-x", "0deg");
    element.style.setProperty("--tilt-y", "0deg");
    element.classList.remove("is-tilting");
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <div ref={ref} class={`tilt ${className}`} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </div>
  );
}

/**
 * 자석 버튼: 마우스가 가까이 오면 버튼이 살짝(최대 6px) 끌려온다.
 * @param {{ strength?: number, class?: string, children?: any }} props
 */
export function Magnetic({ strength = 0.28, class: className = "", children }) {
  const ref = useRef(/** @type {HTMLSpanElement | null} */ (null));

  /** @param {PointerEvent} event */
  const onMove = (event) => {
    const element = ref.current;
    if (!element || event.pointerType !== "mouse" || prefersReducedMotion() || !hasFinePointer()) return;
    const rect = element.getBoundingClientRect();
    const clamp = (n) => Math.max(-6, Math.min(6, n));
    const dx = clamp((event.clientX - (rect.left + rect.width / 2)) * strength);
    const dy = clamp((event.clientY - (rect.top + rect.height / 2)) * strength);
    element.style.setProperty("--mag-x", `${dx.toFixed(1)}px`);
    element.style.setProperty("--mag-y", `${dy.toFixed(1)}px`);
  };
  const onLeave = () => {
    ref.current?.style.setProperty("--mag-x", "0px");
    ref.current?.style.setProperty("--mag-y", "0px");
  };

  return (
    <span ref={ref} class={`magnetic ${className}`} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </span>
  );
}

/**
 * 오로라 배경: 흐릿한 색 덩어리 셋이 아주 천천히 떠다닌다(장식, 화면 읽기에서 숨김).
 * @param {{ tone?: "sky" | "dusk" | "mint", class?: string }} props
 */
export function Aurora({ tone = "sky", class: className = "" }) {
  return (
    <div class={`aurora aurora--${tone} ${className}`} aria-hidden="true">
      <span class="aurora__blob aurora__blob--1" />
      <span class="aurora__blob aurora__blob--2" />
      <span class="aurora__blob aurora__blob--3" />
    </div>
  );
}

/**
 * 선택 표시가 미끄러지는 인디케이터의 위치를 잰다. 처음 재기 전에는 null(그동안은 CSS 기본 표시).
 * @param {import("preact").RefObject<HTMLElement>} containerRef
 * @param {string} selector  선택된 항목을 찾는 선택자(container 안)
 * @param {any[]} deps
 */
export function useIndicator(containerRef, selector, deps) {
  const [box, setBox] = useState(/** @type {{ x: number, y: number, w: number, h: number } | null} */ (null));
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const measure = () => {
      const target = /** @type {HTMLElement | null} */ (container.querySelector(selector));
      if (!target) {
        setBox(null);
        return;
      }
      setBox({ x: target.offsetLeft, y: target.offsetTop, w: target.offsetWidth, h: target.offsetHeight });
    };
    measure();
    if (typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    // 글꼴이 늦게 들어와 탭 너비가 바뀌는 경우
    document.fonts?.ready?.then(measure).catch(() => {});
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return box;
}

/**
 * @param {{ box: { x: number, y: number, w: number, h: number } | null, class?: string }} props
 */
export function Indicator({ box, class: className = "" }) {
  if (!box) return null;
  return (
    <span
      class={`indicator ${className}`}
      aria-hidden="true"
      style={{ width: `${box.w}px`, height: `${box.h}px`, transform: `translate(${box.x}px, ${box.y}px)` }}
    />
  );
}
