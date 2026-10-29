import { useEffect, useState } from "preact/hooks";
import { AppShell } from "./components/AppShell.jsx";
import { Skeleton } from "./components/Skeleton.jsx";
import { EmptyState } from "./components/States.jsx";
import { urls } from "./lib/game.js";
import { Home } from "./pages/Home.jsx";

/**
 * 무거운 화면은 처음 열 때 따로 내려받는다(경로 단위 코드 분할).
 * @param {() => Promise<any>} loader @param {string} exportName
 */
function lazyPage(loader, exportName) {
  /** @type {any} */
  let loaded = null;
  return function LazyPage(props) {
    const [Page, setPage] = useState(() => loaded);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      if (Page) return;
      loader().then(
        (module) => {
          loaded = module[exportName];
          setPage(() => loaded);
        },
        () => setFailed(true)
      );
    }, []);
    if (failed) {
      return (
        <EmptyState
          title="화면을 불러오지 못했어요"
          action={
            <button type="button" class="btn btn--primary" onClick={() => window.location.reload()}>
              새로고침
            </button>
          }
        />
      );
    }
    if (!Page) {
      return (
        <div class="page-loading" aria-busy="true">
          <Skeleton width="40%" height={36} radius={10} />
          <Skeleton height={180} radius={20} />
          <span class="sr-only">화면을 불러오는 중입니다.</span>
        </div>
      );
    }
    return <Page {...props} />;
  };
}

const Ranking = lazyPage(() => import("./pages/Ranking.jsx"), "Ranking");
const Character = lazyPage(() => import("./pages/Character.jsx"), "Character");
const Guild = lazyPage(() => import("./pages/Guild.jsx"), "Guild");
const Bot = lazyPage(() => import("./pages/Bot.jsx"), "Bot");
const Stats = lazyPage(() => import("./pages/Stats.jsx"), "Stats");
const HallOfFame = lazyPage(() => import("./pages/HallOfFame.jsx"), "HallOfFame");
const Calc = lazyPage(() => import("./pages/Calc.jsx"), "Calc");
const Compare = lazyPage(() => import("./pages/Compare.jsx"), "Compare");
const Licenses = lazyPage(() => import("./pages/Licenses.jsx"), "Licenses");
const DesignSystem = lazyPage(() => import("./pages/DesignSystem.jsx"), "DesignSystem");

/**
 * 사이트 경로 → 화면.
 * @returns {{ title: string, nav: any, Page: any, props?: any }}
 */
function resolveRoute() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = window.location.pathname.replace(/\/+$/, "");
  const rest = path.startsWith(base) ? path.slice(base.length) : path;
  if (rest === "") return { title: "메이플M 플러스", nav: "home", Page: Home };
  if (rest === "/design") return { title: "디자인 시스템 · 메이플M 플러스", nav: "", Page: DesignSystem };
  if (rest === "/ranking") return { title: "랭킹 · 메이플M 플러스", nav: "ranking", Page: Ranking };
  if (rest === "/bot") return { title: "카카오톡 봇 · 메이플M 플러스", nav: "bot", Page: Bot };
  if (rest === "/stats") return { title: "통계 · 메이플M 플러스", nav: "stats", Page: Stats };
  if (rest === "/hall") return { title: "명예의 전당 · 메이플M 플러스", nav: "ranking", Page: HallOfFame };
  if (rest === "/calc") return { title: "계산기 · 메이플M 플러스", nav: "calc", Page: Calc };
  if (rest === "/compare") return { title: "캐릭터 비교 · 메이플M 플러스", nav: "compare", Page: Compare };
  if (rest === "/guild") return { title: "길드 · 메이플M 플러스", nav: "guild", Page: Guild };
  const guild = rest.match(/^\/guild\/([^/]+)\/([^/]+)$/);
  if (guild) {
    let world = "";
    let name = "";
    try {
      world = decodeURIComponent(guild[1]);
      name = decodeURIComponent(guild[2]).trim();
    } catch {
      // 잘못된 주소: 아래 화면이 안내한다.
    }
    return { title: `${name || "길드"} · 메이플M 플러스`, nav: "guild", Page: Guild, props: { world, name } };
  }
  if (rest === "/licenses") return { title: "라이선스 · 메이플M 플러스", nav: "", Page: Licenses };
  const character = rest.match(/^\/character\/([^/]+)\/([^/]+)$/);
  if (character) {
    let world = "";
    let name = "";
    try {
      world = decodeURIComponent(character[1]);
      name = decodeURIComponent(character[2]).trim();
    } catch {
      // 잘못된 주소: 아래 화면이 안내한다.
    }
    return { title: `${name || "캐릭터"} · 메이플M 플러스`, nav: "", Page: Character, props: { world, name } };
  }
  return { title: "준비 중인 화면 · 메이플M 플러스", nav: "", Page: NotFound };
}

function NotFound() {
  return (
    <div class="not-found">
      <EmptyState
        title="아직 준비 중인 화면이에요"
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
  const [route] = useState(resolveRoute);

  useEffect(() => {
    document.title = route.title;
  }, [route]);

  const { Page } = route;
  return (
    <AppShell current={route.nav}>
      <Page {...(route.props || {})} />
    </AppShell>
  );
}
