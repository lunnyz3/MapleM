// 캐릭터 상세 탭: 스탯(하이퍼·링크) · 심볼(+쥬얼) · HEXA/V · 유니온 · 길드 · 경험치 그래프.
import { useEffect, useMemo, useState } from "preact/hooks";
import { Avatar } from "../../components/Avatar.jsx";
import { Icon } from "../../components/Icon.jsx";
import { CountUp, Reveal, spotlightHandlers } from "../../components/Motion.jsx";
import { Skeleton } from "../../components/Skeleton.jsx";
import { SourceStamp } from "../../components/SourceStamp.jsx";
import { EmptyState, ErrorState } from "../../components/States.jsx";
import { presetByNo, shortSymbolName } from "../../lib/character.js";
import { loadExpHistory } from "../../lib/data.js";
import { formatComma, formatDateDot, formatDecimal, formatKoreanUnits, formatMonthDay } from "../../lib/format.js";
import { urls } from "../../lib/game.js";

/** @param {{ children?: any, count?: number, note?: any }} props */
function SubTitle({ children, count, note }) {
  return (
    <h3 class="sub-title">
      {children}
      {typeof count === "number" ? <span class="sub-title__count num">{count}</span> : null}
      {note ? <span class="sub-title__note">{note}</span> : null}
    </h3>
  );
}

/** @param {{ src?: string, size?: number }} props */
function GameIcon({ src, size = 36 }) {
  return (
    <span class="game-icon" style={{ "--icon-size": `${size}px` }} aria-hidden="true">
      {src ? <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" /> : <Icon name="sparkle" size={Math.round(size * 0.55)} />}
    </span>
  );
}

/**
 * 프리셋 번호 표시(보스 세팅/착용 중 기준).
 * @param {{ no?: number | null, active?: number | null }} props
 */
function PresetNote({ no, active }) {
  if (!no) return null;
  return (
    <span class="preset-note num">
      프리셋 {no}
      {active && active !== no ? ` · 착용 ${active}` : ""}
    </span>
  );
}

// ======================= 스탯 탭 =======================

/**
 * @param {{ data: any, presets: Record<string, number>, at?: string }} props
 */
export function StatsTab({ data, presets, at }) {
  const hyperTab = data.tabs?.hyperStat;
  const hyper = presetByNo(hyperTab, presets.hyper);
  const hyperRows = Array.isArray(hyper?.data?.hyperStatInfo) ? hyper.data.hyperStatInfo : [];
  const linkTab = data.tabs?.skillLink;
  const link = presetByNo(linkTab, presets.link);
  const links = Array.isArray(link?.data?.linkSkillInfo) ? link.data.linkSkillInfo : [];

  return (
    <div class="sect-grid">
      <section class="sect">
        <SubTitle note={<PresetNote no={hyper?.presetNo} active={hyperTab?.activePresetNo} />}>하이퍼 스탯</SubTitle>
        {hyperRows.length ? (
          <ul class="kv-list">
            {hyperRows.map((row, index) => (
              <li key={index}>
                <span class="kv-list__key">{row.statType}</span>
                <span class="badge num">Lv.{row.statLevel}</span>
                <strong class="kv-list__val">{String(row.statIncrease || "").replace(/^.*?:\s*/, "") || "-"}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="하이퍼 스탯 정보가 없어요" />
        )}
        {Number(hyper?.data?.remainHyperStat) > 0 ? <p class="sect-note num">남은 포인트 {hyper.data.remainHyperStat}</p> : null}
      </section>

      <section class="sect">
        <SubTitle count={links.length} note={<PresetNote no={link?.presetNo} active={linkTab?.activePresetNo} />}>
          링크 스킬
        </SubTitle>
        {links.length ? (
          <ul class="skill-list">
            {links.map((skill, index) => (
              <li key={index}>
                <GameIcon src={skill.skillIcon} size={36} />
                <span class="skill-list__text">
                  <span class="skill-list__name">
                    {skill.skillName} <span class="num skill-list__lv">Lv.{skill.skillLevel}</span>
                  </span>
                  <span class="skill-list__desc">{skill.skillEffect || skill.skillDescription || "-"}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="링크 스킬 정보가 없어요" />
        )}
      </section>
      <SourceStamp at={at} class="sect-grid__stamp" />
    </div>
  );
}

// ======================= 심볼 탭 =======================

/** @param {{ title: string, list: any[], tone: string }} props */
function SymbolGroup({ title, list, tone }) {
  if (!list.length) return null;
  return (
    <section class="sect">
      <SubTitle count={list.length}>{title}</SubTitle>
      <ul class={`symbol-grid tone-${tone}`}>
        {list.map((symbol, index) => (
          <Reveal as="li" key={index} delay={index * 40} class="symbol spotlight" {...spotlightHandlers()}>
            <GameIcon src={symbol.symbolIcon} size={44} />
            <span class="symbol__name">{shortSymbolName(symbol.symbolName)}</span>
            <strong class="symbol__level display num">Lv.{symbol.symbolLevel}</strong>
            <span class="symbol__opt">{symbol.symbolOption || "-"}</span>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

/**
 * @param {{ data: any, presets: Record<string, number>, at?: string }} props
 */
export function SymbolTab({ data, presets, at }) {
  const tab = data.tabs?.jewelSymbolVmatrix;
  const arcane = Array.isArray(tab?.symbol?.arcaneSymbols) ? tab.symbol.arcaneSymbols : [];
  const authentic = Array.isArray(tab?.symbol?.authenticSymbols) ? tab.symbol.authenticSymbols : [];
  const jewelPreset = presetByNo(tab, presets.jewel);
  const jewels = Array.isArray(jewelPreset?.data?.jewelInfo) ? jewelPreset.data.jewelInfo : [];

  if (!arcane.length && !authentic.length && !jewels.length) {
    return <EmptyState title="심볼·쥬얼 정보가 없어요" description="넥슨 API에서 받은 심볼 정보가 없어요." />;
  }

  return (
    <div class="sect-stack">
      <SymbolGroup title="아케인 심볼" list={arcane} tone="lavender" />
      <SymbolGroup title="어센틱 심볼" list={authentic} tone="sky" />
      {jewels.length ? (
        <section class="sect">
          <SubTitle count={jewels.length} note={<PresetNote no={jewelPreset?.presetNo} active={tab?.activePresetNo} />}>
            쥬얼
          </SubTitle>
          <ul class="skill-list skill-list--cols">
            {jewels.map((jewel, index) => (
              <li key={index}>
                <GameIcon src={jewel.jewelIcon} size={36} />
                <span class="skill-list__text">
                  <span class="skill-list__name">
                    {jewel.jewelName} <span class="badge">{jewel.jewelColor}</span>
                  </span>
                  <span class="skill-list__desc">{jewel.jewelOption || "-"}</span>
                </span>
              </li>
            ))}
          </ul>
          {tab?.activeSetOption ? (
            <p class="sect-note">
              <strong>세트 효과</strong> {tab.activeSetOption}
            </p>
          ) : null}
        </section>
      ) : null}
      <SourceStamp at={at} />
    </div>
  );
}

// ======================= HEXA / V =======================

const VCORE_TYPES = { Skill: "스킬 코어", Enhancement: "강화 코어", Common: "공용 코어", JobList: "직업 공용 코어", Special: "특수 코어" };

/**
 * @param {{ data: any, at?: string }} props
 */
export function HexaTab({ data, at }) {
  const hexa = data.tabs?.hexamatrix || {};
  const skills = Array.isArray(hexa.hexaSkills) ? hexa.hexaSkills : [];
  const cores = Array.isArray(hexa.hexaStatCoreList) ? hexa.hexaStatCoreList : [];
  const vcores = Array.isArray(data.tabs?.jewelSymbolVmatrix?.vmatrix?.vCores) ? data.tabs.jewelSymbolVmatrix.vmatrix.vCores : [];
  const vGroups = useMemo(() => {
    /** @type {Map<string, any[]>} */
    const map = new Map();
    for (const core of vcores) {
      const key = String(core.vcoreType || "기타");
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(core);
    }
    return [...map.entries()];
  }, [vcores]);

  if (!skills.length && !cores.length && !vcores.length) {
    return <EmptyState title="HEXA·V 매트릭스 정보가 없어요" />;
  }

  return (
    <div class="sect-stack">
      {skills.length ? (
        <section class="sect">
          <SubTitle count={skills.length}>HEXA 스킬</SubTitle>
          <ul class="hexa-grid">
            {skills.map((skill, index) => (
              <Reveal as="li" key={index} delay={index * 40} class="hexa-node">
                <GameIcon src={skill.skillIcon} size={44} />
                <span class="hexa-node__type">{skill.skillType}</span>
                <span class="hexa-node__name">{skill.skillName}</span>
                <strong class="hexa-node__lv display num">Lv.{skill.skillLevel}</strong>
              </Reveal>
            ))}
          </ul>
        </section>
      ) : null}

      {cores.length ? (
        <section class="sect">
          <SubTitle>HEXA 스탯</SubTitle>
          {cores.map((core, coreIndex) => (
            <div key={coreIndex} class="hexa-stat">
              {(Array.isArray(core.statInfo) ? core.statInfo : []).map((page) => (
                <div key={page.pageNo} class={`hexa-stat__page${page.activateFlag === "1" ? " is-active" : ""}`}>
                  <p class="hexa-stat__head">
                    <span class="num">
                      {core.statCoreSlot}번 코어 · {page.pageNo}쪽
                    </span>
                    {page.activateFlag === "1" ? <span class="badge tone-mint">사용 중</span> : null}
                  </p>
                  <ul class="kv-list kv-list--tight">
                    <li>
                      <span class="kv-list__key">메인</span>
                      <span class="badge num">Lv.{page.mainStatLevel}</span>
                      <strong class="kv-list__val">{page.mainStat}</strong>
                    </li>
                    <li>
                      <span class="kv-list__key">추가 1</span>
                      <span class="badge num">Lv.{page.sub1StatLevel}</span>
                      <strong class="kv-list__val">{page.sub1Stat}</strong>
                    </li>
                    <li>
                      <span class="kv-list__key">추가 2</span>
                      <span class="badge num">Lv.{page.sub2StatLevel}</span>
                      <strong class="kv-list__val">{page.sub2Stat}</strong>
                    </li>
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </section>
      ) : null}

      {vGroups.length ? (
        <section class="sect">
          <SubTitle count={vcores.length}>V 매트릭스</SubTitle>
          {vGroups.map(([type, list]) => (
            <div key={type} class="vgroup">
              <p class="vgroup__title">{VCORE_TYPES[/** @type {keyof typeof VCORE_TYPES} */ (type)] || type}</p>
              <ul class="vcore-list">
                {list.map((core, index) => (
                  <li key={index} class="vcore">
                    <span class="vcore__name">{core.vcoreName}</span>
                    <strong class="vcore__lv num">Lv.{core.vcoreLevel}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
      <SourceStamp at={at} />
    </div>
  );
}

// ======================= 유니온 =======================

/**
 * @param {{ data: any, at?: string }} props
 */
export function UnionTab({ data, at }) {
  const union = data.tabs?.union || {};
  const summary = union.summary || {};
  const segments = Array.isArray(summary.unionLevelTotalOptionSegments) ? summary.unionLevelTotalOptionSegments : [];
  const stats = Array.isArray(union.activeUnionStatOptions) ? union.activeUnionStatOptions : [];
  const raiders = Array.isArray(union.activeRaiderOptions) ? union.activeRaiderOptions : [];
  if (!summary.unionLevel && !stats.length && !raiders.length) return <EmptyState title="유니온 정보가 없어요" />;

  return (
    <div class="sect-stack">
      <div class="union-hero spotlight" {...spotlightHandlers()}>
        {summary.unionGradeIcon ? <img class="union-hero__icon" src={summary.unionGradeIcon} alt="" width={64} height={64} /> : null}
        <div>
          <p class="union-hero__grade">{summary.unionGrade || "유니온"}</p>
          <p class="union-hero__level display">
            Lv. <CountUp value={Number(summary.unionLevel) || 0} format={(n) => formatComma(n)} />
          </p>
        </div>
      </div>
      {segments.length ? (
        <section class="sect">
          <SubTitle count={segments.length}>유니온 레벨 효과</SubTitle>
          <ul class="chip-list">
            {segments.map((text, index) => (
              <li key={index} class="soft-chip">
                {text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div class="sect-grid">
        <section class="sect">
          <SubTitle count={stats.length}>유니온 스탯</SubTitle>
          <ul class="kv-list">
            {stats.map((row, index) => (
              <li key={index}>
                <span class="kv-list__key">{row.name}</span>
                <strong class="kv-list__val num">{row.value}</strong>
              </li>
            ))}
          </ul>
        </section>
        <section class="sect">
          <SubTitle count={raiders.length}>공격대원 효과</SubTitle>
          <ul class="kv-list">
            {raiders.map((row, index) => (
              <li key={index}>
                <span class="kv-list__key">{row.name}</span>
                <strong class="kv-list__val num">{row.value}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <SourceStamp at={at} />
    </div>
  );
}

// ======================= 길드 =======================

/**
 * @param {{ data: any, world: string, at?: string }} props
 */
export function GuildTab({ data, world, at }) {
  const guild = data.tabs?.guild || {};
  const summary = guild.summary;
  if (!summary?.guildName) {
    return <EmptyState title="가입한 길드가 없어요" description="길드에 가입하면 길드 정보와 길드원 기여도를 볼 수 있어요." />;
  }
  const members = Array.isArray(guild.memberPreview) ? guild.memberPreview : [];
  const skills = Array.isArray(guild.guildSkills) ? guild.guildSkills : [];
  const buildings = Array.isArray(guild.guildBuildings) ? guild.guildBuildings : [];
  const self = guild.memberSelf;
  const created = String(summary.guildCreateDate || "").slice(0, 10);

  return (
    <div class="sect-stack">
      <div class="guild-hero">
        <Avatar kind="guild" world={world} name={summary.guildName} src={summary.guildMarkIcon || ""} size={64} />
        <div class="guild-hero__text">
          <p class="guild-hero__name display">{summary.guildName}</p>
          <p class="guild-hero__meta">
            Lv.{summary.guildLevel} · 길드원 {summary.guildMemberCount}명 · 마스터 {summary.guildMasterName}
            {created ? ` · ${formatDateDot(created)} 창설` : ""}
          </p>
        </div>
        <a class="btn btn--secondary btn--sm" href={urls.guild(world, summary.guildName)}>
          길드 정보
          <Icon name="chevronRight" size={18} />
        </a>
      </div>

      {self ? (
        <p class="sect-note">
          <strong>{self.characterName}</strong>의 길드 활동 기여도 <strong class="num">{formatComma(self.guildActivity)}</strong>
        </p>
      ) : null}

      <div class="sect-grid">
        {members.length ? (
          <section class="sect">
            <SubTitle count={members.length}>길드원</SubTitle>
            <ol class="member-list">
              {members.map((member, index) => (
                <li key={index}>
                  <a href={urls.character(world, member.characterName)}>
                    <span class="member-list__rank num">{index + 1}</span>
                    <span class="member-list__name">{member.characterName}</span>
                    <span class="member-list__lv num">Lv.{member.characterLevel}</span>
                    <span class="member-list__act num" title="길드 활동 기여도">
                      {formatKoreanUnits(member.guildActivity)}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <section class="sect">
          <SubTitle count={skills.length}>길드 스킬</SubTitle>
          <ul class="skill-list">
            {skills.map((skill, index) => (
              <li key={index}>
                <GameIcon src={skill.skillIcon} size={32} />
                <span class="skill-list__text">
                  <span class="skill-list__name">
                    {skill.skillName} <span class="num skill-list__lv">Lv.{skill.skillLevel}</span>
                  </span>
                  <span class="skill-list__desc">{skill.skillOption}</span>
                </span>
              </li>
            ))}
          </ul>
          {buildings.length ? (
            <>
              <SubTitle count={buildings.length}>길드 건물</SubTitle>
              <ul class="chip-list">
                {buildings.map((building, index) => (
                  <li key={index} class="soft-chip">
                    {building.buildingName} <span class="num">Lv.{building.buildingLevel}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </div>
      <SourceStamp at={at} />
    </div>
  );
}

// ======================= 경험치 그래프 =======================

/**
 * 성장 그래프(SVG). 하루 넘게 비는 구간은 선을 잇지 않고 "기록 없음"으로 표시한다.
 * @param {{ points: Array<{ dateKst: string, level: number | null, expRate: number | null }> }} props
 */
function TrendChart({ points }) {
  const width = 640;
  const height = 240;
  const pad = { l: 48, r: 16, t: 16, b: 32 };
  const series = points
    .map((p) => ({ date: p.dateKst, y: (Number(p.level) || 0) + (Number(p.expRate) || 0) / 100, level: p.level, rate: p.expRate }))
    .filter((p) => p.date && Number.isFinite(p.y));
  if (series.length < 2) return null;
  const dayIndex = (date) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${series[0].date}T00:00:00Z`)) / 86400000);
  const span = Math.max(1, dayIndex(series[series.length - 1].date));
  const ys = series.map((p) => p.y);
  const yMin = Math.floor(Math.min(...ys));
  const yMax = Math.max(yMin + 1, Math.ceil(Math.max(...ys)));
  const xOf = (date) => pad.l + (dayIndex(date) / span) * (width - pad.l - pad.r);
  const yOf = (y) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * (height - pad.t - pad.b);

  /** @type {Array<typeof series>} */
  const segments = [[series[0]]];
  /** @type {Array<{ x1: number, x2: number }>} */
  const gaps = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1];
    const cur = series[i];
    if (dayIndex(cur.date) - dayIndex(prev.date) > 1) {
      gaps.push({ x1: xOf(prev.date), x2: xOf(cur.date) });
      segments.push([cur]);
    } else segments[segments.length - 1].push(cur);
  }

  return (
    <figure class="trend">
      <svg viewBox={`0 0 ${width} ${height}`} class="trend__svg" role="img" aria-label={`레벨 변화: ${series[0].date} Lv.${series[0].level}에서 ${series[series.length - 1].date} Lv.${series[series.length - 1].level}`}>
        {[yMin, (yMin + yMax) / 2, yMax].map((y) => (
          <g key={y}>
            <line x1={pad.l} x2={width - pad.r} y1={yOf(y)} y2={yOf(y)} class="trend__grid" />
            <text x={pad.l - 8} y={yOf(y)} class="trend__axis" text-anchor="end" dominant-baseline="middle">
              {formatDecimal(y, 1)}
            </text>
          </g>
        ))}
        {gaps.map((gap, index) => (
          <g key={index}>
            <rect x={gap.x1} y={pad.t} width={Math.max(0, gap.x2 - gap.x1)} height={height - pad.t - pad.b} class="trend__gap" />
            {gap.x2 - gap.x1 > 56 ? (
              <text x={(gap.x1 + gap.x2) / 2} y={pad.t + 14} class="trend__gap-text" text-anchor="middle">
                기록 없음
              </text>
            ) : null}
          </g>
        ))}
        {segments.map((segment, index) => (
          <path key={index} class="trend__line" d={segment.map((p, i) => `${i ? "L" : "M"}${xOf(p.date).toFixed(1)} ${yOf(p.y).toFixed(1)}`).join(" ")} />
        ))}
        {series.map((p) => (
          <circle key={p.date} cx={xOf(p.date)} cy={yOf(p.y)} r="3.5" class="trend__dot">
            <title>
              {formatDateDot(p.date)} · Lv.{p.level} {formatDecimal(p.rate, 2)}%
            </title>
          </circle>
        ))}
        <text x={pad.l} y={height - 8} class="trend__axis">
          {formatMonthDay(series[0].date)}
        </text>
        <text x={width - pad.r} y={height - 8} class="trend__axis" text-anchor="end">
          {formatMonthDay(series[series.length - 1].date)}
        </text>
      </svg>
      <figcaption class="sr-only">
        <table>
          <caption>날짜별 레벨과 경험치</caption>
          <thead>
            <tr>
              <th scope="col">날짜</th>
              <th scope="col">레벨</th>
              <th scope="col">경험치</th>
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.date}>
                <td>{p.date}</td>
                <td>{p.level}</td>
                <td>{formatDecimal(p.rate, 2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

/**
 * @param {{ data: any }} props
 */
export function ExpTab({ data }) {
  const ocid = data.ocid;
  const [state, setState] = useState(/** @type {{ status: "loading" } | { status: "ready", daily: any[] } | { status: "error", error: any }} */ ({ status: "loading" }));
  const [attempt, setAttempt] = useState(0);
  const exp = data.tabs?.exp || {};

  useEffect(() => {
    if (!ocid) {
      setState({ status: "ready", daily: [] });
      return undefined;
    }
    let alive = true;
    setState({ status: "loading" });
    loadExpHistory(ocid).then(
      (result) => alive && setState({ status: "ready", daily: result.daily }),
      (error) => alive && setState({ status: "error", error })
    );
    return () => {
      alive = false;
    };
  }, [ocid, attempt]);

  const daily = state.status === "ready" ? state.daily.slice(-30) : [];
  const first = daily[0];
  const last = daily[daily.length - 1];
  const gained = first && last ? (Number(last.level) || 0) + (Number(last.expRate) || 0) / 100 - ((Number(first.level) || 0) + (Number(first.expRate) || 0) / 100) : 0;

  return (
    <div class="sect-stack">
      <div class="exp-summary">
        <div class="exp-summary__item">
          <span class="exp-summary__label">현재 레벨</span>
          <strong class="display num">Lv.{exp.currentLevel ?? data.profile?.level ?? "-"}</strong>
        </div>
        <div class="exp-summary__item">
          <span class="exp-summary__label">경험치</span>
          <strong class="display num">{exp.expText || "-"}</strong>
        </div>
        {daily.length >= 2 ? (
          <div class="exp-summary__item">
            <span class="exp-summary__label">
              {formatMonthDay(first.dateKst)} 이후
            </span>
            <strong class="display num">+{formatDecimal(gained * 100, 1)}%</strong>
          </div>
        ) : null}
      </div>

      {state.status === "loading" ? <Skeleton height={240} radius={16} /> : null}
      {state.status === "error" ? <ErrorState compact title="성장 기록을 불러오지 못했어요" description={state.error?.message} onRetry={() => setAttempt((n) => n + 1)} /> : null}
      {state.status === "ready" && daily.length >= 2 ? <TrendChart points={daily} /> : null}
      {state.status === "ready" && daily.length < 2 ? (
        <EmptyState
          title="아직 쌓인 성장 기록이 없어요"
          description="이 사이트에서 캐릭터를 조회할 때마다 경험치를 기록해요. 이틀 넘게 기록이 쌓이면 그래프로 보여드려요."
        />
      ) : null}
      <SourceStamp kind="calc" source="메이플M 플러스 조회 기록(자체 수집)" note={last ? `최근 기록 ${formatDateDot(last.dateKst)}` : ""} />
    </div>
  );
}
