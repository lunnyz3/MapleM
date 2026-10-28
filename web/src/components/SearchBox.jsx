import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { DEFAULT_WORLD, WORLDS, detailUrl } from "../lib/game.js";
import { addRecent, entryKey, getSaved, useSaved } from "../lib/storage.js";
import { Icon } from "./Icon.jsx";
import { Magnetic } from "./Motion.jsx";
import { Segmented } from "./Tabs.jsx";

/** @typedef {import("../lib/game.js").SearchKind} SearchKind */

const FOCUS_EVENT = "mmp:focus-search";
const NAME_MAX = 24;
const SUGGESTION_MAX = 8;

const KIND_OPTIONS = [
  { value: "character", label: "캐릭터", icon: "user" },
  { value: "guild", label: "길드", icon: "flag" }
];

/**
 * 다른 곳(상단 검색 버튼, 바로가기 타일)에서 검색창으로 이동·포커스한다.
 * @param {SearchKind} [kind]
 */
export function requestSearchFocus(kind) {
  window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { kind } }));
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 좁은 화면 여부(자리표시 문구를 줄이는 데 쓴다).
 * @param {string} query
 */
function useMedia(query) {
  const [matches, setMatches] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/**
 * 통합 검색: 캐릭터/길드 + 월드 + 이름. 입력창에 포커스하면 즐겨찾기·최근 검색을 펼친다(콤보박스).
 * 검색하면 최근 검색에 저장하고 기존 상세 화면(/character/<월드>/<이름>, /guild/<월드>/<이름>)으로 간다.
 * @param {{ id?: string, size?: "lg" | "md", showKindSwitch?: boolean }} props
 */
export function SearchBox({ id = "search", size = "lg", showKindSwitch = true }) {
  const saved = useSaved();
  const [kind, setKind] = useState(/** @type {SearchKind} */ ("character"));
  const [world, setWorld] = useState(() => getSaved().recent[0]?.world || DEFAULT_WORLD);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [hint, setHint] = useState("");
  const rootRef = useRef(/** @type {HTMLFormElement | null} */ (null));
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const narrow = useMedia("(max-width: 719px)");

  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const kindLabel = kind === "guild" ? "길드" : "캐릭터";

  // 즐겨찾기 먼저, 그다음 최근 검색. 입력한 글자가 들어간 이름만.
  const suggestions = useMemo(() => {
    const query = name.trim().toLowerCase();
    const seen = new Set();
    /** @type {Array<import("../lib/storage.js").SavedEntry & { key: string, group: "favorite" | "recent" }>} */
    const result = [];
    for (const [group, list] of /** @type {const} */ ([
      ["favorite", saved.favorites],
      ["recent", saved.recent]
    ])) {
      for (const entry of list) {
        const key = entryKey(entry);
        if (seen.has(key) || (query && !entry.name.toLowerCase().includes(query))) continue;
        seen.add(key);
        result.push({ ...entry, key, group });
      }
    }
    return result.slice(0, SUGGESTION_MAX);
  }, [saved, name]);

  const panelOpen = open && suggestions.length > 0;

  useEffect(() => setActive(-1), [name, panelOpen]);

  useEffect(() => {
    /** @param {Event} event */
    const onRequest = (event) => {
      const nextKind = /** @type {CustomEvent} */ (event).detail?.kind;
      if (nextKind === "character" || nextKind === "guild") setKind(nextKind);
      const input = inputRef.current;
      if (!input) return;
      input.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      input.focus({ preventScroll: true });
      setOpen(true);
    };
    window.addEventListener(FOCUS_EVENT, onRequest);
    return () => window.removeEventListener(FOCUS_EVENT, onRequest);
  }, []);

  /** @param {{ kind: SearchKind, world: string, name: string }} entry */
  const go = (entry) => {
    addRecent(entry);
    setOpen(false);
    window.location.assign(detailUrl(entry.kind, entry.world, entry.name));
  };

  /** @param {Event} event */
  const onSubmit = (event) => {
    event.preventDefault();
    if (panelOpen && active >= 0 && suggestions[active]) {
      go(suggestions[active]);
      return;
    }
    // 게임 이름에는 띄어쓰기가 없으므로 빼고 찾는다.
    const clean = name.replace(/\s+/g, "");
    if (!clean) {
      setHint(`${kindLabel} 이름을 입력해 주세요.`);
      inputRef.current?.focus();
      return;
    }
    go({ kind, world, name: clean });
  };

  /** @param {KeyboardEvent} event */
  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActive((index) => Math.min(suggestions.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(-1, index - 1));
    } else if (event.key === "Escape" && panelOpen) {
      event.preventDefault();
      setOpen(false);
    }
  };

  /** @param {FocusEvent} event */
  const onFocusOut = (event) => {
    const next = /** @type {Node | null} */ (event.relatedTarget);
    if (!next || !rootRef.current?.contains(next)) setOpen(false);
  };

  let lastGroup = "";

  return (
    <form
      ref={rootRef}
      class={`search search--${size}`}
      role="search"
      aria-label={`${kindLabel} 검색`}
      onSubmit={onSubmit}
      onFocusOut={onFocusOut}
      noValidate
    >
      {showKindSwitch ? (
        <Segmented
          class="search__kinds"
          name={`${id}-kind`}
          legend="검색 대상"
          options={KIND_OPTIONS}
          value={kind}
          onChange={(value) => {
            setKind(/** @type {SearchKind} */ (value));
            setHint("");
          }}
        />
      ) : null}

      <div class="search__bar">
        <span class="search__world">
          <label class="sr-only" for={`${id}-world`}>
            월드
          </label>
          <select id={`${id}-world`} value={world} onChange={(event) => setWorld(/** @type {HTMLSelectElement} */ (event.currentTarget).value)}>
            {WORLDS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={18} class="search__world-icon" />
        </span>

        <label class="sr-only" for={`${id}-name`}>
          {kindLabel} 이름
        </label>
        <input
          ref={inputRef}
          id={`${id}-name`}
          class="search__input"
          type="text"
          value={name}
          placeholder={narrow ? `${kindLabel} 이름` : `${kindLabel} 이름을 입력하세요`}
          maxLength={NAME_MAX}
          autoComplete="off"
          autoCapitalize="off"
          spellcheck={false}
          enterKeyHint="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={panelOpen ? "true" : "false"}
          aria-controls={listId}
          aria-activedescendant={panelOpen && active >= 0 ? `${listId}-${active}` : undefined}
          aria-describedby={hint ? hintId : undefined}
          aria-invalid={hint ? "true" : undefined}
          onInput={(event) => {
            setName(/** @type {HTMLInputElement} */ (event.currentTarget).value);
            setHint("");
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />

        <Magnetic class="search__magnet">
          <button type="submit" class="btn btn--primary search__submit">
            <Icon name="search" size={20} />
            <span class="search__submit-text">검색</span>
          </button>
        </Magnetic>
      </div>

      <p id={hintId} class="search__hint" role="status" aria-live="polite">
        {hint ? (
          <>
            <Icon name="info" size={16} />
            {hint}
          </>
        ) : null}
      </p>

      <ul id={listId} class="search__panel" role="listbox" aria-label="즐겨찾기와 최근 검색" hidden={!panelOpen}>
        {suggestions.map((entry, index) => {
          const header =
            entry.group !== lastGroup ? (
              <li role="presentation" class="search__group" key={`group-${entry.group}`}>
                {entry.group === "favorite" ? "즐겨찾기" : "최근 검색"}
              </li>
            ) : null;
          lastGroup = entry.group;
          return [
            header,
            <li
              key={entry.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active ? "true" : "false"}
              class={`search__option${index === active ? " is-active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => go(entry)}
            >
              <span class={`search__option-icon ${entry.group === "favorite" ? "is-favorite" : ""}`}>
                <Icon name={entry.group === "favorite" ? "heart" : "clock"} size={18} filled={entry.group === "favorite"} />
              </span>
              <span class="search__option-name">{entry.name}</span>
              <span class="search__option-meta">
                {entry.world} · {entry.kind === "guild" ? "길드" : "캐릭터"}
              </span>
            </li>
          ];
        })}
      </ul>
    </form>
  );
}
