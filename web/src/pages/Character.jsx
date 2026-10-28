// 캐릭터 상세 화면(/preview/character/<월드>/<이름>).
// 데이터: GET /api/maplestorym/character/page-data (+ 직접 입력이 있으면 POST /api/v2/character-stats 로 스탯만 다시 계산).
import "../styles/character.css";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Card } from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import { Aurora, BlurText, CountUp, Reveal, Tilt, spotlightHandlers } from "../components/Motion.jsx";
import { SearchBox } from "../components/SearchBox.jsx";
import { Skeleton } from "../components/Skeleton.jsx";
import { SourceBadge, SourceStamp } from "../components/SourceStamp.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { Segmented, TabPanel, Tabs } from "../components/Tabs.jsx";
import { formatStat, formatStatDelta, groupBreakdown, isFlatStat, statOrder } from "../lib/character.js";
import { loadCharacterPage, loadManualInputs, postCharacterStats } from "../lib/data.js";
import { formatComma, formatDateDot, formatDecimal, formatKoreanUnits, toNumber } from "../lib/format.js";
import { WORLDS, urls } from "../lib/game.js";
import { readManual, writeManual } from "../lib/manual.js";
import { addRecent, entryKey, isFavorite, toggleFavorite, useSaved } from "../lib/storage.js";
import { Equipment } from "./character/Equipment.jsx";
import { ManualPanel } from "./character/ManualPanel.jsx";
import { ExpTab, GuildTab, HexaTab, StatsTab, SymbolTab, UnionTab } from "./character/Sections.jsx";

/** @typedef {"boss" | "current"} StatMode */

/**
 * 프로필 머리: 오로라 배경 · 캐릭터 그림(틸트) · 이름(블러 등장) · 레벨·경험치 · 공식 전투력 칩.
 * @param {{ data: any, world: string }} props
 */
function ProfileHeader({ data, world }) {
  const profile = data.profile || {};
  const name = profile.name || data.query?.characterName || "";
  const saved = useSaved();
  const favKey = entryKey({ kind: "character", world, name });
  const favorite = saved.favorites.some((item) => entryKey(item) === favKey) || isFavorite(favKey);
  const official = profile.combatPower?.official;
  const officialValue = toNumber(official?.value);
  const expRate = Math.max(0, Math.min(100, Number(profile.expRate) || 0));
  const overall = Number(profile.overallRanking) || 0;

  return (
    <section class="ch-hero" aria-labelledby="ch-name">
      <Aurora tone="sky" />
      <Tilt maxDeg={6} class="ch-hero__art">
        <div class="ch-hero__stage">
          {profile.imageUrl ? (
            <img src={profile.imageUrl} alt={`${name} 캐릭터 이미지`} width={160} height={160} decoding="async" />
          ) : (
            <span class="ch-hero__initial" aria-hidden="true">
              {name.slice(0, 1)}
            </span>
          )}
        </div>
      </Tilt>

      <div class="ch-hero__info">
        <p class="ch-hero__eyebrow">
          <span class="badge tone-sky">{world}</span>
          <span>{profile.jobName || profile.className || "직업 정보 없음"}</span>
        </p>
        <h1 id="ch-name" class="ch-hero__name display">
          <BlurText text={name} />
        </h1>
        <div class="ch-hero__level">
          <strong class="display num">Lv.{profile.level ?? "-"}</strong>
          <div class="exp-bar" role="img" aria-label={`경험치 ${formatDecimal(expRate, 2)}%`}>
            <span class="exp-bar__fill" style={{ "--exp": `${expRate}%` }} />
          </div>
          <span class="ch-hero__exp num">{profile.expText || `${formatDecimal(expRate, 2)}%`}</span>
        </div>

        <ul class="ch-hero__chips">
          {officialValue !== null ? (
            <li class="chip chip--power spotlight" {...spotlightHandlers()}>
              <Icon name="bolt" size={18} />
              <span class="chip__label">공식 전투력</span>
              <strong class="chip__value display" title={`${formatComma(officialValue)}${official?.date ? ` · ${formatDateDot(official.date)} 집계` : ""}`}>
                <CountUp value={officialValue} format={(n) => formatKoreanUnits(n)} duration={1100} />
              </strong>
              {official?.ranking ? <span class="chip__sub num">{formatComma(official.ranking)}위</span> : null}
              <SourceBadge kind="official" />
            </li>
          ) : null}
          {overall ? (
            <li>
              <a class="chip" href={urls.ranking("level", { name, world_name: world })}>
                <Icon name="crown" size={18} />
                <span class="chip__label">종합 랭킹</span>
                <strong class="chip__value num">{formatComma(overall)}위</strong>
              </a>
            </li>
          ) : null}
          {profile.guildName && profile.guildName !== "-" ? (
            <li>
              <a class="chip" href={urls.guild(world, profile.guildName)}>
                {profile.guildMarkIcon ? <img class="chip__mark" src={profile.guildMarkIcon} alt="" width={20} height={20} /> : <Icon name="flag" size={18} />}
                <span class="chip__label">길드</span>
                <strong class="chip__value">{profile.guildName}</strong>
              </a>
            </li>
          ) : null}
        </ul>

        <div class="ch-hero__actions">
          <button
            type="button"
            class={`btn btn--secondary btn--sm fav-btn${favorite ? " is-on" : ""}`}
            aria-pressed={favorite ? "true" : "false"}
            onClick={() => toggleFavorite({ kind: "character", world, name })}
          >
            <Icon name="heart" size={18} filled={favorite} />
            {favorite ? "즐겨찾기됨" : "즐겨찾기"}
          </button>
          <a class="btn btn--ghost btn--sm" href={urls.legacyCharacter(world, name)}>
            기존 화면에서 보기
            <Icon name="external" size={16} />
          </a>
        </div>
        <SourceStamp at={data.meta?.dataTimestamp} note={official?.date ? `공식 전투력 ${formatDateDot(official.date)} 집계` : ""} />
      </div>
    </section>
  );
}

/**
 * 한 스탯의 출처별 내역: 분류 막대 + 분류 → 그룹 → 항목.
 * @param {{ statKey: string, stat: any }} props
 */
function Breakdown({ statKey, stat }) {
  const categories = useMemo(() => groupBreakdown(stat?.breakdown), [stat]);
  const positiveTotal = categories.reduce((sum, category) => sum + Math.max(0, category.value), 0);
  if (!categories.length) return <p class="bd-empty">이 스탯에 더해진 항목이 없어요.</p>;
  return (
    <div class="bd">
      <div class="bd-bar" role="img" aria-label={categories.map((c) => `${c.label} ${formatStatDelta(statKey, c.value)}`).join(", ")}>
        {categories.map((category) =>
          category.value > 0 && positiveTotal > 0 ? (
            <span key={category.key} class={`bd-bar__seg tone-${category.tone}`} style={{ flexGrow: category.value / positiveTotal }} />
          ) : null
        )}
      </div>
      <ul class="bd-legend">
        {categories.map((category) => (
          <li key={category.key} class={`tone-${category.tone}`}>
            <span class="bd-legend__dot" aria-hidden="true" />
            {category.label}
            <strong class="num">{formatStatDelta(statKey, category.value)}</strong>
          </li>
        ))}
      </ul>
      {statKey === "ignoreDefense" ? (
        <p class="bd-note">
          <Icon name="info" size={16} />
          방어율 무시는 옵션마다 곱해서 합쳐요. 아래 값을 그대로 더한 값과 달라요.
        </p>
      ) : null}
      <div class="bd-cats">
        {categories.map((category) => (
          <section key={category.key} class={`bd-cat tone-${category.tone}`} aria-label={`${category.label} ${formatStatDelta(statKey, category.value)}`}>
            <header class="bd-cat__head">
              <span class="bd-cat__chip">{category.label}</span>
              <strong class="num">{formatStatDelta(statKey, category.value)}</strong>
            </header>
            {category.groups.map((group) => (
              <details key={group.key} class="bd-group">
                <summary>
                  <span class="bd-group__name">{group.label}</span>
                  <span class="bd-group__count num">{group.items.length}</span>
                  <strong class="num">{formatStatDelta(statKey, group.value)}</strong>
                  <Icon name="chevronDown" size={16} class="bd-group__chev" />
                </summary>
                <ul class="bd-items">
                  {group.items.map((item, index) => (
                    <li key={index} title={item.rawText || ""}>
                      <span>{item.source || "-"}</span>
                      <strong class="num">{item.displayValue || formatStatDelta(statKey, Number(item.value) || 0)}</strong>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * 주요 스탯: 보스 세팅/현재 착용 토글 · 사용 프리셋 · 계산 전투력 · 스탯 타일 · 출처별 내역.
 * @param {{ stats: any, mode: StatMode, onMode: (mode: StatMode) => void, manualActive: boolean, at?: string }} props
 */
function StatsPanel({ stats, mode, onMode, manualActive, at }) {
  const setting = stats.statSetting;
  const hasCurrent = Boolean(stats.majorStatsCurrent);
  const effectiveMode = mode === "current" && hasCurrent ? "current" : "boss";
  const majorStats = (effectiveMode === "current" ? stats.majorStatsCurrent : stats.majorStats) || {};
  const other = effectiveMode === "boss" ? stats.majorStatsCurrent : null;
  const order = statOrder(stats.profile).filter((key) => majorStats[key]);
  const [selected, setSelected] = useState(order[0] || "");
  const selectedKey = order.includes(selected) ? selected : order[0];
  const power = setting?.combatPower?.[effectiveMode === "current" ? "current" : "boss"];
  const dims = Array.isArray(setting?.dimensions) ? setting.dimensions : [];

  return (
    <Card class="stats-card" title="주요 스탯" icon="sparkle" tone="lavender" description="옵션 줄을 출처별로 더한 값이에요">
      {setting && hasCurrent ? (
        <div class="stat-mode">
          <Segmented
            name="stat-mode"
            legend="스탯 기준"
            value={effectiveMode}
            onChange={(value) => onMode(/** @type {StatMode} */ (value))}
            options={[
              { value: "boss", label: "보스 세팅", icon: "trophy" },
              { value: "current", label: "현재 착용", icon: "user" }
            ]}
          />
          <p class="stat-mode__desc">
            {effectiveMode === "boss"
              ? setting.sameAsCurrent
                ? "지금 착용한 조합이 계산 전투력이 가장 높은 조합이에요."
                : `프리셋 조합 ${formatComma(setting.combinationCount || 0)}개 중 계산 전투력이 가장 높은 조합이에요.`
              : "넥슨 API가 알려 준 지금 착용 중인 프리셋이에요."}
          </p>
        </div>
      ) : null}

      {dims.length ? (
        <ul class="preset-chips" aria-label="사용 프리셋">
          {dims.map((dim) => {
            const no = dim[effectiveMode === "current" ? "current" : "boss"];
            const differs = effectiveMode === "boss" && dim.boss !== dim.current;
            return (
              <li key={dim.key} class={`preset-chip${differs ? " is-diff" : ""}`}>
                <span>{dim.label}</span>
                <strong class="num">{no ?? "-"}</strong>
                {differs ? <span class="preset-chip__now num">착용 {dim.current ?? "-"}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {Number.isFinite(Number(power)) ? (
        <div class="calc-power">
          <div class="calc-power__main">
            <span class="calc-power__label">
              계산 전투력 <SourceBadge kind="estimate" />
            </span>
            <strong class="calc-power__value display">
              <CountUp value={Number(power)} format={(n) => formatKoreanUnits(n)} duration={800} title={formatComma(power)} />
            </strong>
          </div>
          {setting?.combatPowerNote ? (
            <details class="calc-power__note">
              <summary>
                <Icon name="info" size={16} />
                계산 방법
              </summary>
              <p>{setting.combatPowerNote}</p>
            </details>
          ) : null}
        </div>
      ) : null}

      <div class="stat-grid" role="list">
        {order.map((key, index) => {
          const stat = majorStats[key];
          const value = Number(stat.value);
          const otherValue = other?.[key] ? Number(other[key].value) : null;
          const diff = otherValue !== null && Number.isFinite(otherValue) ? value - otherValue : 0;
          const isSelected = key === selectedKey;
          const hasManual = Array.isArray(stat.breakdown) && stat.breakdown.some((item) => item?.category === "manual");
          return (
            <div role="listitem" key={key} class="stat-grid__cell">
              <button
                type="button"
                class={`stat-chip spotlight${isSelected ? " is-selected" : ""}`}
                aria-pressed={isSelected ? "true" : "false"}
                aria-controls="stat-breakdown"
                onClick={() => setSelected(key)}
                style={{ "--stagger": index }}
                {...spotlightHandlers()}
              >
                <span class="stat-chip__label">
                  {stat.label || key}
                  {hasManual ? <span class="stat-chip__dot" title="직접 입력 반영" aria-label="직접 입력 반영" /> : null}
                </span>
                <strong class="stat-chip__value display">
                  <CountUp value={value} format={(n) => formatStat(key, n)} duration={700} title={stat.displayValue} />
                </strong>
                <span class="stat-chip__full num">{isFlatStat(key) && Math.abs(value) >= 1e8 ? stat.displayValue : diff ? `착용 대비 ${formatStatDelta(key, diff)}` : " "}</span>
              </button>
            </div>
          );
        })}
      </div>

      {selectedKey ? (
        <section id="stat-breakdown" class="bd-panel" aria-live="polite" aria-label={`${majorStats[selectedKey]?.label} 출처별 내역`}>
          <header class="bd-panel__head">
            <h3 class="bd-panel__title">
              {majorStats[selectedKey]?.label} <span class="bd-panel__total num">{majorStats[selectedKey]?.displayValue}</span>
            </h3>
            <p class="bd-panel__hint">분류 → 그룹을 눌러 항목을 펼쳐 보세요</p>
          </header>
          <Breakdown key={`${selectedKey}-${effectiveMode}`} statKey={selectedKey} stat={majorStats[selectedKey]} />
        </section>
      ) : null}

      <footer class="stats-card__foot">
        <SourceStamp kind={manualActive ? "manual" : "calc"} source={manualActive ? "넥슨 Open API + 직접 입력으로 계산" : "넥슨 Open API 옵션을 합산"} at={at} />
        <SourceStamp kind="estimate" source="계산 전투력은 공개 산식의 추정치" />
      </footer>
    </Card>
  );
}

const TAB_ITEMS = [
  { id: "equipment", label: "장비", icon: "medal" },
  { id: "stats", label: "스탯", icon: "sparkle" },
  { id: "symbol", label: "심볼", icon: "leaf" },
  { id: "hexa", label: "HEXA/V", icon: "bolt" },
  { id: "union", label: "유니온", icon: "union" },
  { id: "guild", label: "길드", icon: "flag" },
  { id: "exp", label: "경험치", icon: "clock" }
];

function CharacterSkeleton() {
  return (
    <div class="ch" aria-busy="true">
      <div class="ch-hero ch-hero--loading">
        <Skeleton width={160} height={160} radius={28} />
        <div class="ch-hero__info">
          <Skeleton width={120} height={20} />
          <Skeleton width={220} height={40} radius={10} />
          <Skeleton width="70%" height={14} />
          <Skeleton width="50%" height={36} radius={999} />
        </div>
      </div>
      <div class="card">
        <Skeleton width={180} height={22} />
        <div class="stat-grid">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} height={92} radius={14} />
          ))}
        </div>
      </div>
      <span class="sr-only">캐릭터 정보를 불러오는 중입니다.</span>
    </div>
  );
}

/**
 * @param {{ world: string, name: string }} props
 */
export function Character({ world, name }) {
  const [state, setState] = useState(/** @type {{ status: "loading" } | { status: "ready", data: any } | { status: "error", error: any }} */ ({ status: "loading" }));
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState(/** @type {StatMode} */ ("boss"));
  const [tab, setTab] = useState(() => {
    const hash = window.location.hash.replace("#", "");
    return TAB_ITEMS.some((item) => item.id === hash) ? hash : "equipment";
  });
  // 직접 입력: 정의 목록 · 저장값 · 다시 계산한 스탯
  const [manualDefs, setManualDefs] = useState(/** @type {{ status: "loading" } | { status: "ready", items: any[] } | { status: "unavailable" }} */ ({ status: "loading" }));
  const [manualValues, setManualValues] = useState(() => readManual(world, name));
  const [manualResult, setManualResult] = useState(/** @type {{ status: "idle" | "applying" | "applied" | "error", data?: any, error?: string, at?: number }} */ ({ status: "idle" }));
  const autoApplied = useRef(false);
  const validWorld = WORLDS.includes(world);

  useEffect(() => {
    if (!validWorld || !name) return undefined;
    let alive = true;
    setState({ status: "loading" });
    loadCharacterPage(world, name).then(
      (data) => {
        if (!alive) return;
        setState({ status: "ready", data });
        addRecent({ kind: "character", world, name: data.profile?.name || name });
        document.title = `${data.profile?.name || name} · ${world} · 메이플M 플러스`;
      },
      (error) => alive && setState({ status: "error", error })
    );
    return () => {
      alive = false;
    };
  }, [world, name, attempt, validWorld]);

  useEffect(() => {
    let alive = true;
    loadManualInputs().then((result) => alive && setManualDefs(result));
    return () => {
      alive = false;
    };
  }, []);

  /** @param {Record<string, number>} values */
  const applyManual = async (values) => {
    writeManual(world, name, values);
    setManualValues(values);
    if (!Object.keys(values).length) {
      setManualResult({ status: "idle" });
      return;
    }
    setManualResult((prev) => ({ ...prev, status: "applying" }));
    try {
      const data = await postCharacterStats({ world, name, manual: values });
      setManualResult({ status: "applied", data, at: Date.now() });
    } catch (error) {
      setManualResult({ status: "error", error: /** @type {any} */ (error)?.message || "반영하지 못했어요." });
    }
  };

  // 저장된 직접 입력값이 있으면 화면을 연 뒤 한 번 다시 계산한다.
  useEffect(() => {
    if (autoApplied.current || state.status !== "ready" || manualDefs.status !== "ready") return;
    autoApplied.current = true;
    if (Object.keys(manualValues).length) applyManual(manualValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, manualDefs.status]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const next = `#${tab}`;
    if (window.location.hash !== next) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${tab === "equipment" ? "" : next}`);
  }, [tab, state.status]);

  if (!validWorld || !name) {
    return (
      <div class="ch ch--empty">
        <EmptyState art="search" title="월드와 캐릭터 이름을 확인해 주세요" description="주소 형식: /preview/character/월드/이름" />
        <div class="ch-search card">
          <SearchBox id="ch-search" size="md" showKindSwitch={false} />
        </div>
      </div>
    );
  }

  if (state.status === "loading") return <CharacterSkeleton />;

  if (state.status === "error") {
    const notFound = state.error?.status === 404;
    return (
      <div class="ch ch--empty">
        {notFound ? (
          <EmptyState
            art="search"
            title={`${world} 월드에서 '${name}' 캐릭터를 찾지 못했어요`}
            description="이름이 바뀌었거나 오래 접속하지 않은 캐릭터일 수 있어요. 이름과 월드를 다시 확인해 주세요."
          />
        ) : (
          <ErrorState title="캐릭터 정보를 불러오지 못했어요" description={state.error?.message} detail={state.error?.detail} onRetry={() => setAttempt((n) => n + 1)} />
        )}
        <div class="ch-search card">
          <SearchBox id="ch-search" size="md" showKindSwitch={false} />
        </div>
      </div>
    );
  }

  const data = state.data;
  const applied = manualResult.status === "applied" || (manualResult.status === "applying" && manualResult.data) ? manualResult.data : null;
  const stats = {
    // 다시 계산한 응답의 profile 은 이름·직업 정도라 page-data 프로필 위에 순서·공격 방식만 덮는다.
    profile: {
      ...data.profile,
      attackType: applied?.profile?.attackType || data.profile?.attackType,
      majorStatOrder: applied?.majorStatOrder || data.profile?.majorStatOrder
    },
    majorStats: applied?.majorStats || data.profile?.majorStats,
    majorStatsCurrent: applied?.majorStatsCurrent || data.profile?.majorStatsCurrent,
    statSetting: applied?.statSetting || data.profile?.statSetting
  };
  const bossPresets = Object.fromEntries((stats.statSetting?.dimensions || []).map((dim) => [dim.key, mode === "current" ? dim.current : dim.boss]));

  return (
    <div class="ch">
      <ProfileHeader data={data} world={world} />

      <div class="ch-stats-row">
        <Reveal class="ch-stats-row__main">
          <StatsPanel stats={stats} mode={mode} onMode={setMode} manualActive={Boolean(applied)} at={data.meta?.dataTimestamp} />
        </Reveal>
        <Reveal class="ch-stats-row__side" delay={80}>
          <ManualPanel
            defs={manualDefs}
            values={manualValues}
            result={manualResult}
            onApply={applyManual}
            powerBefore={toNumber(data.profile?.statSetting?.combatPower?.[mode === "current" ? "current" : "boss"])}
            powerAfter={toNumber(applied?.statSetting?.combatPower?.[mode === "current" ? "current" : "boss"])}
          />
        </Reveal>
      </div>

      <section class="ch-tabs" aria-label="상세 정보">
        <Tabs idBase="ch" label="상세 정보" scrollable value={tab} onChange={setTab} items={TAB_ITEMS} />
        <TabPanel idBase="ch" value={tab} class="ch-tabs__panel">
          {tab === "equipment" ? <Equipment data={data} mode={mode} presetNo={bossPresets.equipment} at={data.meta?.dataTimestamp} /> : null}
          {tab === "stats" ? <StatsTab data={data} presets={bossPresets} at={data.meta?.dataTimestamp} /> : null}
          {tab === "symbol" ? <SymbolTab data={data} presets={bossPresets} at={data.meta?.dataTimestamp} /> : null}
          {tab === "hexa" ? <HexaTab data={data} at={data.meta?.dataTimestamp} /> : null}
          {tab === "union" ? <UnionTab data={data} at={data.meta?.dataTimestamp} /> : null}
          {tab === "guild" ? <GuildTab data={data} world={world} at={data.meta?.dataTimestamp} /> : null}
          {tab === "exp" ? <ExpTab data={data} /> : null}
        </TabPanel>
      </section>
    </div>
  );
}

