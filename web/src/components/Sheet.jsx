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
      <div class="sheet__panel">
        <div class="sheet__grip" aria-hidden="true" />
        <header class="sheet__head">
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
