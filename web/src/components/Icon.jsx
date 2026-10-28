// 직접 그린 아이콘 세트: 24px 격자, 선 굵기 1.75px, 둥근 끝.

export const LEAF_PATH =
  "M12 2Q12.53 4.79 13.22 5.51Q13.97 5.82 15.26 4.33Q14.8 6.96 15.12 8.11Q16.23 8.03 18.49 6.76Q17.73 8.05 18.54 8.15Q19.14 8.98 21.68 8.88Q19.73 10.61 19.88 11.85Q17.87 12.71 17.46 13.66Q17.39 15.55 18.79 18.3Q15.9 16.71 14.07 16.28Q13.16 15.54 12.57 15.65Q12 15.26 11.43 15.65Q10.84 15.54 9.93 16.28Q8.1 16.71 5.21 18.3Q6.61 15.55 6.54 13.66Q6.13 12.71 4.12 11.85Q4.27 10.61 2.32 8.88Q4.86 8.98 5.46 8.15Q6.27 8.05 5.51 6.76Q7.77 8.03 8.88 8.11Q9.2 6.96 8.74 4.33Q10.03 5.82 10.78 5.51Q11.47 4.79 12 2Z";
export const LEAF_STEM_PATH = "M12 16V22.4";
export const SPARKLE_PATH = "M12 3.5c.55 4.3 2.4 6.55 7.5 8.5-5.1 1.95-6.95 4.2-7.5 8.5-.55-4.3-2.4-6.55-7.5-8.5 5.1-1.95 6.95-4.2 7.5-8.5z";

/** @type {Record<string, import("preact").JSX.Element>} */
const ICONS = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.75" />
      <path d="m16.1 16.1 4.15 4.15" />
    </>
  ),
  home: (
    <>
      <path d="M3.75 11 12 4.5l8.25 6.5" />
      <path d="M6.25 9.4V19a1 1 0 0 0 1 1H10v-5h4v5h2.75a1 1 0 0 0 1-1V9.4" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4.5h8v4.75a4 4 0 0 1-8 0z" />
      <path d="M8 6.25H5.75a.75.75 0 0 0-.75.75c0 1.95 1.4 3.55 3.3 3.8" />
      <path d="M16 6.25h2.25a.75.75 0 0 1 .75.75c0 1.95-1.4 3.55-3.3 3.8" />
      <path d="M12 13.25v3.25" />
      <path d="M9.5 16.5h5l.6 3.5H8.9z" />
    </>
  ),
  crown: (
    <>
      <path d="M4.25 8.75 8.4 12.1 12 5.5l3.6 6.6 4.15-3.35-1.6 8.75H5.85z" />
      <path d="M6.5 20h11" />
    </>
  ),
  union: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.75" />
      <rect x="13" y="4" width="7" height="7" rx="1.75" />
      <rect x="4" y="13" width="7" height="7" rx="1.75" />
      <rect x="13" y="13" width="7" height="7" rx="1.75" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="14.75" r="5.25" />
      <path d="M8.9 10.55 6.6 4h3.3l2.1 5.2" />
      <path d="M15.1 10.55 17.4 4h-3.3L12 9.2" />
      <path d="M12 12.6v4.3" />
    </>
  ),
  swords: (
    <>
      <path d="M4.5 4.5h2.25l8 8" />
      <path d="M4.5 4.5v2.25l8 8" />
      <path d="M12.75 16.75l4-4" />
      <path d="M15.6 15.6 19.5 19.5" />
      <path d="M19.5 4.5h-2.25l-4 4" />
      <path d="M19.5 4.5v2.25l-4 4" />
      <path d="M11.25 16.75l-4-4" />
      <path d="M8.4 15.6 4.5 19.5" />
    </>
  ),
  waterway: (
    <>
      <path d="M4.5 20v-7.5a7.5 7.5 0 0 1 15 0V20" />
      <path d="M7.75 15.1c1.4-.95 2.85-.95 4.25 0s2.85.95 4.25 0" />
      <path d="M7.75 18.35c1.4-.95 2.85-.95 4.25 0s2.85.95 4.25 0" />
    </>
  ),
  hourglass: (
    <>
      <path d="M6.75 4h10.5" />
      <path d="M6.75 20h10.5" />
      <path d="M8.25 4v2.25c0 2.3 3.75 3.6 3.75 5.75s-3.75 3.45-3.75 5.75V20" />
      <path d="M15.75 4v2.25c0 2.3-3.75 3.6-3.75 5.75s3.75 3.45 3.75 5.75V20" />
      <path d="M10 17.75h4" />
    </>
  ),
  bolt: <path d="M13.4 3.5 5.75 13.25h5.75L10.6 20.5l7.65-9.75H12.5z" />,
  gate: (
    <>
      <path d="M3.5 6.1c5.6 1.3 11.4 1.3 17 0" />
      <path d="M5.5 10.25h13" />
      <path d="M7 7.2V20" />
      <path d="M17 7.2V20" />
      <path d="M12 7.6v2.65" />
    </>
  ),
  tower: (
    <>
      <path d="M8 20.5V8.25l4-4.25 4 4.25V20.5" />
      <path d="M5.5 20.5h13" />
      <path d="M11 10.75h2" />
      <path d="M11 14h2" />
      <path d="M10.75 20.5v-3h2.5v3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.25" r="3.75" />
      <path d="M4.75 20a7.25 7.25 0 0 1 14.5 0" />
    </>
  ),
  flag: (
    <>
      <path d="M5.75 21V4.25" />
      <path d="M5.75 4.75h11.5l-2.4 4 2.4 4H5.75" />
    </>
  ),
  heart: (
    <path d="M12 19.75s-7.75-4.6-7.75-10.1A4.15 4.15 0 0 1 12 7.4a4.15 4.15 0 0 1 7.75 2.25c0 5.5-7.75 10.1-7.75 10.1z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.75V12l2.75 1.75" />
    </>
  ),
  x: <path d="M6.75 6.75l10.5 10.5M17.25 6.75 6.75 17.25" />,
  chevronDown: <path d="m6.75 9.5 5.25 5.25 5.25-5.25" />,
  chevronRight: <path d="m9.5 6.75 5.25 5.25-5.25 5.25" />,
  arrowRight: (
    <>
      <path d="M5 12h13.5" />
      <path d="m13.25 6.75 5.25 5.25-5.25 5.25" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.75" />
      <path d="M12 3.5v1.75M12 18.75v1.75M3.5 12h1.75M18.75 12h1.75M5.99 5.99l1.24 1.24M16.77 16.77l1.24 1.24M5.99 18.01l1.24-1.24M16.77 7.23l1.24-1.24" />
    </>
  ),
  moon: <path d="M19.5 14.4A7.75 7.75 0 1 1 9.6 4.5a6.25 6.25 0 0 0 9.9 9.9z" />,
  refresh: (
    <>
      <path d="M19.25 12a7.25 7.25 0 1 1-2.12-5.13" />
      <path d="M19.25 4.75v4.5h-4.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 11v5" />
      <path d="M12 7.9v.1" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.9 3.4 17a2 2 0 0 0 1.7 3h13.8a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.75v3.75" />
      <path d="M12 16.6v.1" />
    </>
  ),
  external: (
    <>
      <path d="M13.5 4.5h6v6" />
      <path d="M19.5 4.5 11 13" />
      <path d="M17.5 14v4.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1H10" />
    </>
  ),
  trash: (
    <>
      <path d="M4.75 7h14.5" />
      <path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
      <path d="m6.75 7 .8 12.1a1 1 0 0 0 1 .9h6.9a1 1 0 0 0 1-.9L17.25 7" />
    </>
  ),
  check: <path d="m5.5 12.5 4.25 4.25L18.5 7.5" />,
  share: (
    <>
      <circle cx="17.5" cy="6" r="2.5" />
      <circle cx="6.5" cy="12" r="2.5" />
      <circle cx="17.5" cy="18" r="2.5" />
      <path d="m8.7 10.8 6.6-3.6M8.7 13.2l6.6 3.6" />
    </>
  ),
  download: (
    <>
      <path d="M12 4.5v10.25" />
      <path d="m7.75 10.75 4.25 4.25 4.25-4.25" />
      <path d="M5 16.5v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" />
    </>
  ),
  link: (
    <>
      <path d="M10.25 13.75a3.75 3.75 0 0 0 5.3 0l2.9-2.9a3.75 3.75 0 0 0-5.3-5.3l-1.1 1.1" />
      <path d="M13.75 10.25a3.75 3.75 0 0 0-5.3 0l-2.9 2.9a3.75 3.75 0 0 0 5.3 5.3l1.1-1.1" />
    </>
  ),
  chat: <path d="M12 4.75c-4.55 0-8.25 2.9-8.25 6.5 0 2.3 1.5 4.3 3.8 5.45l-.8 3.05 3.5-2.3c.57.08 1.15.13 1.75.13 4.55 0 8.25-2.9 8.25-6.5S16.55 4.75 12 4.75z" />,
  sparkle: <path d={SPARKLE_PATH} />,
  leaf: (
    <>
      <path d={LEAF_PATH} />
      <path d={LEAF_STEM_PATH} />
    </>
  )
};

/** 디자인 시스템 화면에서 목록을 보여주는 데 쓴다. */
export const ICON_NAMES = Object.keys(ICONS);

/**
 * @param {{ name: keyof typeof ICONS | string, size?: number, class?: string, filled?: boolean, strokeWidth?: number }} props
 */
export function Icon({ name, size = 24, class: className, filled = false, strokeWidth = 1.75 }) {
  return (
    <svg
      class={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name] || null}
    </svg>
  );
}
