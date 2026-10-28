import { urls } from "../lib/game.js";
import { useTheme } from "../lib/theme.js";
import { BrandMark } from "./Decor.jsx";
import { Icon } from "./Icon.jsx";
import { requestSearchFocus } from "./SearchBox.jsx";
import { ToastHost } from "./Toast.jsx";

/**
 * @typedef {"home" | "ranking" | "guild" | "my" | ""} NavKey
 */

/** 상단 메뉴. 새 화면이 없는 메뉴는 기존 화면으로 연결한다. */
const NAV = [
  { key: "home", label: "홈", href: urls.home },
  { key: "ranking", label: "랭킹", href: urls.ranking("level") },
  { key: "guild", label: "길드", href: urls.guildSearch },
  { key: "compare", label: "비교", href: urls.compare() },
  { key: "calc", label: "계산기", href: urls.calc },
  { key: "bot", label: "카톡 봇", href: urls.bot, highlight: true }
];

/** 모바일 하단 탭바 */
const TABS = [
  { key: "home", label: "홈", icon: "home", href: urls.home },
  { key: "ranking", label: "랭킹", icon: "trophy", href: urls.ranking("level") },
  { key: "guild", label: "길드", icon: "flag", href: urls.guildSearch },
  { key: "calc", label: "계산기", icon: "hourglass", href: urls.calc },
  { key: "my", label: "내 캐릭터", icon: "heart", href: `${urls.home}#my` }
];

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
          <a href={urls.legacyHome}>기존 화면</a>
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
              <a key={item.key} class={`topnav__link${item.highlight ? " topnav__link--bot" : ""}`} href={item.href} aria-current={item.key === current ? "page" : undefined}>
                {item.label}
                {item.highlight ? <span class="topnav__free">무료</span> : null}
              </a>
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
            <Icon name={tab.icon} size={22} filled={tab.key === current && tab.icon === "heart"} />
            <span>{tab.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
