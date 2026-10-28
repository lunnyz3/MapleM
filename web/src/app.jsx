import { useEffect } from "preact/hooks";
import { AppShell } from "./components/AppShell.jsx";
import { EmptyState } from "./components/States.jsx";
import { urls } from "./lib/game.js";
import { DesignSystem } from "./pages/DesignSystem.jsx";
import { Home } from "./pages/Home.jsx";

/** /preview/ 아래 경로 → 화면. 새 화면은 여기에 하나씩 추가한다. */
const ROUTES = {
  home: { title: "메이플M 플러스 · 새 메인 미리보기", nav: "home", Page: Home },
  design: { title: "디자인 시스템 · 메이플M 플러스", nav: "", Page: DesignSystem },
  "not-found": { title: "준비 중인 화면 · 메이플M 플러스", nav: "", Page: NotFound }
};

/** @returns {keyof typeof ROUTES} */
function resolveRoute() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === base || path === "") return "home";
  if (path === `${base}/design`) return "design";
  return "not-found";
}

function NotFound() {
  return (
    <div class="not-found">
      <EmptyState
        title="아직 준비 중인 화면이에요"
        description="새 화면은 하나씩 열리고 있어요. 지금은 새 메인 화면만 미리 볼 수 있어요."
        action={
          <a class="btn btn--primary" href={urls.home}>
            새 메인으로
          </a>
        }
      />
    </div>
  );
}

export function App() {
  const route = ROUTES[resolveRoute()];

  useEffect(() => {
    document.title = route.title;
  }, [route]);

  const { Page } = route;
  return (
    <AppShell current={/** @type {any} */ (route.nav)}>
      <Page />
    </AppShell>
  );
}
