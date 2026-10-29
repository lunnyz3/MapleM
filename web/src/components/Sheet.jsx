import { useEffect, useRef } from "preact/hooks";
import { Icon } from "./Icon.jsx";

/**
 * 하단 시트(모바일) / 가운데 대화상자(넓은 화면). 브라우저 기본 <dialog>(showModal)로
 * 포커스 가둠·Esc 닫기·배경 비활성을 처리하고, 바깥(어두운 막)을 누르면 닫힌다.
 * @param {{ open: boolean, title: string, onClose: () => void, children?: any, class?: string }} props
 */
export function Sheet({ open, title, onClose, children, class: className = "" }) {
  const ref = useRef(/** @type {HTMLDialogElement | null} */ (null));
  const opener = useRef(/** @type {HTMLElement | null} */ (null));

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = /** @type {HTMLElement | null} */ (document.activeElement);
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // 손잡이·머리를 아래로 끌면 따라 내려가고, 충분히 끌면 닫는다(터치).
  const panel = useRef(/** @type {HTMLDivElement | null} */ (null));
  const drag = useRef(/** @type {{ y: number, dy: number } | null} */ (null));
  const dragHandlers = {
    onPointerDown: (/** @type {PointerEvent} */ event) => {
      if (event.pointerType === "mouse" || /** @type {HTMLElement} */ (event.target).closest("button")) return;
      drag.current = { y: event.clientY, dy: 0 };
      panel.current?.classList.add("is-dragging");
      try {
        /** @type {HTMLElement} */ (event.currentTarget).setPointerCapture?.(event.pointerId);
      } catch {
        // 포인터를 잡지 못해도 끌기는 된다.
      }
    },
    onPointerMove: (/** @type {PointerEvent} */ event) => {
      if (!drag.current || !panel.current) return;
      drag.current.dy = Math.max(0, event.clientY - drag.current.y);
      panel.current.style.transform = `translate3d(0, ${drag.current.dy}px, 0)`;
    },
    onPointerUp: () => {
      const moved = drag.current?.dy || 0;
      drag.current = null;
      if (!panel.current) return;
      panel.current.classList.remove("is-dragging");
      panel.current.style.transform = "";
      if (moved > 90) handleClose();
    }
  };
  dragHandlers.onPointerCancel = dragHandlers.onPointerUp;

  // 닫히면 연 버튼으로 포커스를 돌려준다.
  const handleClose = () => {
    onClose();
    const target = opener.current;
    if (target && typeof target.focus === "function") requestAnimationFrame(() => target.focus());
  };

  return (
    <dialog
      ref={ref}
      class={`sheet ${className}`}
      aria-label={title}
      onClose={handleClose}
      onCancel={(event) => {
        event.preventDefault();
        handleClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) handleClose();
      }}
    >
      <div class="sheet__panel" ref={panel}>
        <div class="sheet__grip" aria-hidden="true" {...dragHandlers} />
        <header class="sheet__head" {...dragHandlers}>
          <h2 class="sheet__title">{title}</h2>
          <button type="button" class="icon-btn" aria-label="닫기" onClick={handleClose}>
            <Icon name="x" size={22} />
          </button>
        </header>
        <div class="sheet__body">{open ? children : null}</div>
      </div>
    </dialog>
  );
}
