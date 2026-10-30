// 강화 소식(/news): 오늘(또는 어제) 날짜별 기록에서 고른 장비 변화 전체. 종류(스타포스·옵션 대박·새 장비)로 거르고,
// 줄을 누르면 그 캐릭터로 간다. 주소 ?day=yesterday&type=star.
import { useEffect, useState } from "preact/hooks";
import { Icon } from "../components/Icon.jsx";
import { Aurora, SplitText } from "../components/Motion.jsx";
import { SkeletonList } from "../components/Skeleton.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { Segmented, Tabs } from "../components/Tabs.jsx";
import { NEWS_TYPES, NewsCounts, NewsRow, useNews } from "../components/UpgradeNews.jsx";
import { formatDateDot } from "../lib/format.js";

const DAYS = [
  { value: "", label: "오늘" },
  { value: "yesterday", label: "어제" }
];

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type") || "all";
  return { day: params.get("day") === "yesterday" ? "yesterday" : "", type: NEWS_TYPES.some((entry) => entry.id === type) ? type : "all" };
}

export function News() {
  const [query, setQuery] = useState(readQuery);
  const news = useNews(/** @type {"" | "yesterday"} */ (query.day));
  useEffect(() => {
    const onPop = () => setQuery(readQuery());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const change = (/** @type {Partial<typeof query>} */ patch) => {
    const next = { ...query, ...patch };
    setQuery(next);
    const params = new URLSearchParams();
    if (next.day) params.set("day", next.day);
    if (next.type !== "all") params.set("type", next.type);
    const qs = params.toString();
    const url = `/news${qs ? `?${qs}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(null, "", url);
  };

  const data = news.data;
  const events = (data?.events || []).filter((event) => query.type === "all" || event.type === query.type);

  return (
    <div class="unews-page">
      <header class="page-head page-head--rank tone-gold">
        <Aurora tone="sky" />
        <span class="page-head__icon" aria-hidden="true">
          <Icon name="sparkle" size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText text="강화 소식" />
        </h1>
      </header>

      <div class="unews-page__bar">
        <Segmented name="news-day" legend="날짜" value={query.day} onChange={(day) => change({ day })} options={DAYS} />
        <Tabs idBase="news-type" label="소식 종류" value={query.type} onChange={(type) => change({ type })} items={NEWS_TYPES} scrollable />
      </div>

      <section class="card unews-page__panel" aria-busy={news.status === "loading"}>
        {news.status === "loading" ? <SkeletonList rows={8} /> : null}
        {news.status === "error" ? <ErrorState title="소식을 불러오지 못했어요" description={news.error?.message} onRetry={news.retry} /> : null}
        {news.status === "ready" && data.date ? <p class="unews-page__date num">{formatDateDot(data.date)} 모은 캐릭터 기준</p> : null}
        {news.status === "ready" ? <NewsCounts counts={data.counts} /> : null}
        {news.status === "ready" && !events.length ? <EmptyState title="소식이 없어요" /> : null}
        {events.length ? (
          <div class="unews-list stagger-in" key={`${query.day}-${query.type}`}>
            {events.map((event, index) => (
              <NewsRow key={`${event.world}-${event.name}-${event.item}-${event.type}-${index}`} event={event} index={Math.min(index, 20)} />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
