// 움직임 도우미: 움직임 줄이기 설정, 화면에 들어왔는지(IntersectionObserver), 정밀 포인터 여부.
// 모든 인터랙션은 transform·opacity 위주로 쓰고, 움직임 줄이기 설정이면 끈다.
import { useEffect, useState } from "preact/hooks";

const REDUCED = "(prefers-reduced-motion: reduce)";
const FINE = "(hover: hover) and (pointer: fine)";

/** @param {string} query */
function matches(query) {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

export const prefersReducedMotion = () => matches(REDUCED);

/** 마우스처럼 정밀한 포인터(틸트·자석·스포트라이트는 여기서만 켠다). */
export const hasFinePointer = () => matches(FINE);

/**
 * 미디어 쿼리 구독.
 * @param {string} query
 */
export function useMedia(query) {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const list = window.matchMedia(query);
    const onChange = () => setValue(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return value;
}

export const useReducedMotion = () => useMedia(REDUCED);

/**
 * 요소가 화면에 처음 들어오면 true(한 번 true가 되면 그대로). 관찰을 못 하면 바로 true.
 * @param {import("preact").RefObject<Element>} ref
 * @param {{ rootMargin?: string, threshold?: number }} [options]
 */
export function useInView(ref, options = {}) {
  const { rootMargin = "0px 0px -8% 0px", threshold = 0.12 } = options;
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || inView) return undefined;
    if (typeof IntersectionObserver !== "function") {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, threshold, inView]);
  return inView;
}
