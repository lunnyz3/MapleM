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
          description="새 버전이 배포되었을 수 있어요. 새로고침해 주세요."
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
const Licenses = lazyPage(() => import("./pages/Licenses.jsx"), "Licenses");
const DesignSystem = lazyPage(() => import("./pages/DesignSystem.jsx"), "DesignSystem");

/**
 * /preview/ 아래 경로 → 화면.
 * @returns {{ title: string, nav: any, Page: any, props?: any }}
 */
function resolveRoute() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = window.location.pathname.replace(/\/+$/, "");
  const rest = path.startsWith(base) ? path.slice(base.length) : path;
  if (rest === "") return { title: "메이플M 플러스 · 새 메인 미리보기", nav: "home", Page: Home };
  if (rest === "/design") return { title: "디자인 시스템 · 메이플M 플러스", nav: "", Page: DesignSystem };
  if (rest === "/ranking") return { title: "랭킹 · 메이플M 플러스", nav: "ranking", Page: Ranking };
  if (rest === "/licenses") return { title: "라이선스·출처 · 메이플M 플러스", nav: "", Page: Licenses };
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
        description="새 화면은 하나씩 열리고 있어요. 지금은 메인·랭킹·캐릭터 상세를 미리 볼 수 있어요."
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
