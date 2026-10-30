import { useState } from "preact/hooks";
import { CALC_VIEWS, GAME_MODES, RANKING_TYPES, urls } from "../lib/game.js";
import { entryKey, useSaved } from "../lib/storage.js";
import { useTheme } from "../lib/theme.js";
import { BrandMark } from "./Decor.jsx";
import { Icon } from "./Icon.jsx";
import { requestSearchFocus } from "./SearchBox.jsx";
import { Sheet } from "./Sheet.jsx";
import { ToastHost } from "./Toast.jsx";

/**
 * @typedef {"home" | "ranking" | "guild" | "compare" | "stats" | "calc" | "game" | "bot" | "my" | ""} NavKey
 */

/** 상단 메뉴. */
// 마우스를 올리거나 키보드로 들어가면 하위 메뉴가 열린다.
const NAV = [
  { key: "home", label: "홈", href: urls.home },
  {
    key: "ranking",
    label: "랭킹",
    icon: "trophy",
    href: urls.ranking("level"),
    children: [
      ...RANKING_TYPES.filter((type) => type.subject !== "guild").map((type) => ({ label: `${type.name} 랭킹`, href: urls.ranking(type.id) })),
      { label: "아이템 랭킹", href: "/ranking?view=item" },
      { label: "스펙 랭킹", href: "/ranking?view=spec" },
      { label: "장비 검색", href: urls.itemSearch },
      { label: "명예의 전당", href: urls.hall },
      { label: "강화 소식", href: urls.news },
      { label: "이벤트 달력", href: urls.events }
    ]
  },
  {
    key: "guild",
    label: "길드",
    icon: "flag",
    href: urls.guildSearch,
    children: [
      { label: "길드 검색", href: urls.guildSearch },
      { label: "길드 비교", href: "/guild/compare" },
      ...RANKING_TYPES.filter((type) => type.subject === "guild").map((type) => ({ label: `${type.name} 랭킹`, href: urls.ranking(type.id) }))
    ]
  },
  {
    key: "compare",
    label: "비교",
    icon: "swords",
    href: urls.compare(),
    children: [
      { label: "캐릭터 비교", href: urls.compare() },
      { label: "길드 비교", href: "/guild/compare" },
      { label: "멀티서치", href: urls.multi }
    ]
  },
  {
    key: "stats",
    label: "통계",
    icon: "chart",
    href: urls.stats,
    children: [
      { label: "직업별 전투력", href: "/stats" },
      { label: "직업 메타", href: "/stats?view=meta" },
      { label: "직업 티어", href: "/stats?view=tier" },
      { label: "월드 대항전", href: "/stats?view=world" },
      { label: "레벨 분포", href: "/stats?view=level" },
      { label: "코디 구경", href: urls.looks }
    ]
  },
  { key: "calc", label: "계산기", icon: "hourglass", href: urls.calc, children: CALC_VIEWS.map((view) => ({ label: view.label, href: `/calc?view=${view.value}` })) },
  {
    key: "game",
    label: "미니게임",
    icon: "swords",
    href: urls.game,
    children: GAME_MODES.map((game) => ({ label: game.label, href: `${urls.game}?mode=${game.value}` }))
  },
  { key: "bot", label: "카톡 봇", icon: "chat", href: urls.bot, highlight: true }
];

/** 모바일 하단 탭바(마지막 "전체"는 모든 메뉴를 담은 시트를 연다) */
const TABS = [
  { key: "home", label: "홈", icon: "home", href: urls.home },
  { key: "ranking", label: "랭킹", icon: "trophy", href: urls.ranking("level") },
  { key: "stats", label: "통계", icon: "chart", href: urls.stats },
  { key: "calc", label: "계산기", icon: "hourglass", href: urls.calc }
];
const TAB_KEYS = new Set(TABS.map((tab) => tab.key));

/** 즐겨찾기·최근 본 캐릭터(길드) 주소 */
const savedHref = (/** @type {{ kind: string, world: string, name: string }} */ entry) =>
  entry.kind === "guild" ? urls.guild(entry.world, entry.name) : urls.character(entry.world, entry.name);

/**
 * 모바일 전체 메뉴: 내 캐릭터(즐겨찾기 먼저, 최근 본 순) + 상단 메뉴 전체(하위 메뉴 포함).
 * @param {{ open: boolean, onClose: () => void }} props
 */
function AllMenu({ open, onClose }) {
  const { recent, favorites } = useSaved();
  const seen = new Set();
  const mine = [...favorites.map((entry) => ({ ...entry, favorite: true })), ...recent]
    .filter((entry) => !seen.has(entryKey(entry)) && seen.add(entryKey(entry)))
    .slice(0, 6);
  const groups = NAV.filter((item) => item.children);
  const singles = NAV.filter((item) => !item.children && item.key !== "home");
  return (
    <Sheet open={open} title="전체 메뉴" onClose={onClose} class="allmenu-sheet">
      <div class="allmenu">
        <section class="allmenu__group">
          <div class="allmenu__head">
            <span class="allmenu__title">
              <Icon name="heart" size={18} />
              내 캐릭터
            </span>
            <a class="allmenu__more" href={`${urls.home}#my`} onClick={onClose}>
              전체 보기
            </a>
          </div>
          {mine.length ? (
            <div class="allmenu__links">
              {mine.map((entry) => (
                <a key={entryKey(entry)} class="allmenu__link allmenu__link--saved" href={savedHref(entry)} onClick={onClose}>
                  {entry.favorite ? <Icon name="heart" size={14} filled /> : null}
                  <span>{entry.name}</span>
                  <small>{entry.world}</small>
                </a>
              ))}
            </div>
          ) : (
            <p class="allmenu__empty">즐겨찾기하거나 검색한 캐릭터가 여기에 나와요.</p>
          )}
        </section>
        {groups.map((item) => (
          <section key={item.key} class="allmenu__group">
            <div class="allmenu__head">
              <a class="allmenu__title" href={item.href} onClick={onClose}>
                <Icon name={item.icon} size={18} />
                {item.label}
              </a>
            </div>
            <div class="allmenu__links">
              {item.children.map((child) => (
                <a key={child.href} class="allmenu__link" href={child.href} onClick={onClose}>
                  {child.label}
                </a>
              ))}
            </div>
          </section>
        ))}
        <div class="allmenu__singles">
          {singles.map((item) => (
            <a key={item.key} class={`allmenu__single${item.highlight ? " is-bot" : ""}`} href={item.href} onClick={onClose}>
              <Icon name={item.icon} size={20} />
              {item.label}
              {item.highlight ? <span class="topnav__free">무료</span> : null}
            </a>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      class="icon-btn theme-toggle"
      aria-pressed={dark ? "true" : "false"}
      aria-label="다크 모드"
      title={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      onClick={toggle}
    >
      <Icon name={dark ? "sun" : "moon"} size={22} />
    </button>
  );
}

function SiteFooter() {
  return (
    <footer class="site-footer">
      <div class="container site-footer__inner">
        <div class="site-footer__brand">
          <BrandMark size={28} />
          <p class="site-footer__name">메이플M 플러스</p>
        </div>
        <p class="site-footer__source" lang="en">
          Data based on NEXON Open API
        </p>
        <nav class="site-footer__links" aria-label="사이트 정보">
          <a href={urls.design}>디자인 시스템</a>
          <a href={urls.licenses}>라이선스</a>
        </nav>
      </div>
    </footer>
  );
}

/**
 * 공통 틀: 상단바(로고·메뉴·테마) · 본문 · 푸터(데이터 출처 한 줄) · 모바일 하단 탭바.
 * @param {{ current?: NavKey, children?: any }} props
 */
export function AppShell({ current = "", children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div class="shell">
      <a class="skip-link" href="#main">
        본문으로 건너뛰기
      </a>

      <header class="topbar">
        <div class="container topbar__inner">
          <a class="brand" href={urls.home}>
            <BrandMark size={34} />
            <span class="brand__name">
              메이플M <span class="brand__plus">플러스</span>
            </span>
          </a>

          <nav class="topnav" aria-label="주요 메뉴">
            {NAV.map((item) => (
              <div key={item.key} class={`topnav__item${item.children ? " has-menu" : ""}`}>
                <a class={`topnav__link${item.highlight ? " topnav__link--bot" : ""}`} href={item.href} aria-current={item.key === current ? "page" : undefined}>
                  {item.label}
                  {item.highlight ? <span class="topnav__free">무료</span> : null}
                </a>
                {item.children ? (
                  <div class="topnav__menu">
                    <ul class={item.children.length > 8 ? "is-wide" : ""}>
                      {item.children.map((child) => (
                        <li key={child.href}>
                          <a class="topnav__menu-link" href={child.href}>
                            {child.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </nav>

          <div class="topbar__actions">
            <button type="button" class="icon-btn topbar__search" aria-label="검색" onClick={() => requestSearchFocus()}>
              <Icon name="search" size={22} />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" class="main" tabIndex={-1}>
        {children}
      </main>

      <SiteFooter />

      <ToastHost />

      <nav class="tabbar" aria-label="하단 메뉴">
        {TABS.map((tab) => (
          <a key={tab.key} class="tabbar__item" href={tab.href} aria-current={tab.key === current ? "page" : undefined}>
            <Icon name={tab.icon} size={22} />
            <span>{tab.label}</span>
          </a>
        ))}
        <button
          type="button"
          class="tabbar__item"
          aria-haspopup="dialog"
          aria-expanded={menuOpen ? "true" : "false"}
          aria-current={menuOpen || (current && !TAB_KEYS.has(current)) ? "page" : undefined}
          onClick={() => setMenuOpen(true)}
        >
          <Icon name="menu" size={22} />
          <span>전체</span>
        </button>
      </nav>
      <AllMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
