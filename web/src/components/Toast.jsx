// 짧은 알림(토스트). 어디서든 toast("이미지를 저장했어요", "success") 로 띄우고, AppShell 의 ToastHost 가 그린다.
import { useEffect, useState } from "preact/hooks";
import { Icon } from "./Icon.jsx";

const EVENT = "mmp:toast";
const DURATION = 3200;
let seq = 0;

/**
 * @param {string} message
 * @param {"info" | "success" | "error"} [tone]
 */
export function toast(message, tone = "info") {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: ++seq, message: String(message || ""), tone } }));
}

export function ToastHost() {
  const [items, setItems] = useState(/** @type {Array<{ id: number, message: string, tone: string }>} */ ([]));

  useEffect(() => {
    /** @type {number[]} */
    const timers = [];
    /** @param {Event} event */
    const onToast = (event) => {
      const item = /** @type {CustomEvent} */ (event).detail;
      if (!item?.message) return;
      setItems((list) => [...list.slice(-2), item]);
      timers.push(window.setTimeout(() => setItems((list) => list.filter((entry) => entry.id !== item.id)), DURATION));
    };
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return (
    <div class="toast-host" role="status" aria-live="polite">
      {items.map((item) => (
        <p key={item.id} class={`toast is-${item.tone}`}>
          <Icon name={item.tone === "error" ? "alert" : item.tone === "success" ? "check" : "info"} size={18} />
          <span>{item.message}</span>
        </p>
      ))}
    </div>
  );
}
