// 캐릭터 상세 탭: 스탯(하이퍼·링크) · 심볼(+쥬얼) · HEXA/V · 유니온 · 길드 · 기록(경험치 그래프·변경 이력).
import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { Avatar } from "../../components/Avatar.jsx";
import { Icon, LEAF_PATH, LEAF_STEM_PATH, SPARKLE_PATH } from "../../components/Icon.jsx";
import { CountUp, Reveal, spotlightHandlers } from "../../components/Motion.jsx";
import { Skeleton } from "../../components/Skeleton.jsx";
import { GradeIcon } from "../../components/GameIcons.jsx";
import { EmptyState, ErrorState } from "../../components/States.jsx";
import { presetByNo, shortSymbolName } from "../../lib/character.js";
import { loadExpHistory } from "../../lib/data.js";
import { getJson } from "../../lib/api.js";
import { formatComma, formatDateDot, formatDecimal, formatKoreanUnits, formatMonthDay } from "../../lib/format.js";
import { urls } from "../../lib/game.js";
import { hexaCoreType, hexaSpend, symbolCost } from "../../lib/hexaCalc.mjs";
import hexaRules from "../../../../src/game-data/hexa.json";
import symbolCosts from "../../../../src/game-data/symbol-costs.json";

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
 * @param {{ data: any, presets: Record<string, number> }} props
 */
export function StatsTab({ data, presets}) {
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
    </div>
  );
}

// ======================= 심볼 탭 =======================

/** 심볼 아이콘이 없을 때 쓰는 기본 그림 */
const SYMBOL_FALLBACK = ["/assets/simbol-1.png", "/assets/simbol-2.png", "/assets/simbol-3.png", "/assets/simbol-4.png", "/assets/simbol-5.png", "/assets/simbol-6.png"];

/** @param {{ title: string, list: any[], tone: string }} props */
/**
 * 남은 재화 한 줄: "남은 심볼 1,322개 · 메소 21억".
 * @param {{ items: Array<{ label: string, value: string }>, progress?: number }} props
 */
function LeftSummary({ items, progress }) {
  return (
    <div class="left-sum">
      {Number.isFinite(progress) ? (
        <span class="left-sum__bar" aria-hidden="true">
          <span style={{ width: `${Math.round(/** @type {number} */ (progress) * 100)}%` }} />
        </span>
      ) : null}
      <dl class="left-sum__list">
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd class="num">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** @param {{ title: string, list: any[], tone: string, kind: "arcane" | "authentic" }} props */
function SymbolGroup({ title, list, tone, kind }) {
  if (!list.length) return null;
  const table = symbolCosts[kind];
  const costs = list.map((symbol) => symbolCost(table, Number(symbol.symbolLevel) || 1, table.maxLevel, symbol.symbolGrowthValue));
  const leftSymbols = costs.reduce((sum, cost) => sum + cost.symbols, 0);
  const leftMeso = costs.reduce((sum, cost) => sum + cost.meso, 0);
  const levels = list.reduce((sum, symbol) => sum + (Number(symbol.symbolLevel) || 0), 0);
  return (
    <section class="sect">
      <SubTitle count={list.length}>{title}</SubTitle>
      {leftSymbols || leftMeso ? (
        <LeftSummary
          progress={levels / (list.length * table.maxLevel)}
          items={[
            { label: "남은 심볼", value: `${formatComma(leftSymbols)}개` },
            { label: "남은 메소", value: formatKoreanUnits(leftMeso, { maxGroups: 2 }) }
          ]}
        />
      ) : null}
      <ul class={`symbol-grid tone-${tone}`}>
        {list.map((symbol, index) => (
          <Reveal as="li" key={index} delay={index * 40} class="symbol spotlight" {...spotlightHandlers()}>
            <span class="symbol__orb">
              <GameIcon src={symbol.symbolIcon || SYMBOL_FALLBACK[index % SYMBOL_FALLBACK.length]} size={44} />
              {Number(symbol.symbolLevel) >= table.maxLevel ? <span class="symbol__max">MAX</span> : null}
            </span>
            <span class="symbol__name">{shortSymbolName(symbol.symbolName)}</span>
            <strong class="symbol__level display num">Lv.{symbol.symbolLevel}</strong>
            <span class="symbol__opt">{symbol.symbolOption || "-"}</span>
            {costs[index].symbols ? <span class="symbol__left num">남은 {formatComma(costs[index].symbols)}개</span> : null}
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

/**
 * @param {{ data: any, presets: Record<string, number> }} props
 */
export function SymbolTab({ data, presets}) {
  const tab = data.tabs?.jewelSymbolVmatrix;
  const arcane = Array.isArray(tab?.symbol?.arcaneSymbols) ? tab.symbol.arcaneSymbols : [];
  const authentic = Array.isArray(tab?.symbol?.authenticSymbols) ? tab.symbol.authenticSymbols : [];
  const jewelPreset = presetByNo(tab, presets.jewel);
  const jewels = Array.isArray(jewelPreset?.data?.jewelInfo) ? jewelPreset.data.jewelInfo : [];

  if (!arcane.length && !authentic.length && !jewels.length) {
    return <EmptyState title="심볼·쥬얼 정보가 없어요" />;
  }

  return (
    <div class="sect-stack">
      <SymbolGroup title="아케인 심볼" list={arcane} tone="lavender" kind="arcane" />
      <SymbolGroup title="어센틱 심볼" list={authentic} tone="sky" kind="authentic" />
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
    </div>
  );
}

// ======================= HEXA / V =======================

const VCORE_TYPES = { Skill: "스킬 코어", Enhancement: "강화 코어", Common: "공용 코어", JobList: "직업 공용 코어", Special: "특수 코어" };

/**
 * @param {{ data: any }} props
 */
export function HexaTab({ data}) {
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

  const spend = useMemo(
    () =>
      hexaSpend(
        skills.map((skill) => ({ type: hexaCoreType(skill, hexaRules.coreTypes), level: Number(skill.slotLevel ?? skill.skillLevel) || 0 })),
        hexaRules.cores,
        hexaRules.maxLevel
      ),
    [skills]
  );

  if (!skills.length && !cores.length && !vcores.length) {
    return <EmptyState title="HEXA·V 매트릭스 정보가 없어요" />;
  }

  return (
    <div class="sect-stack">
      {skills.length ? (
        <section class="sect">
          <SubTitle count={skills.length}>
            <img class="sub-title__art" src="/assets/sole_erda.png" alt="" width={22} height={22} />
            HEXA 스킬
          </SubTitle>
          <LeftSummary
            progress={spend.usedFragments / Math.max(1, spend.usedFragments + spend.leftFragments)}
            items={[
              { label: "쓴 솔 에르다", value: formatComma(spend.usedEnergy) },
              { label: "쓴 조각", value: formatComma(spend.usedFragments) },
              { label: "남은 솔 에르다", value: formatComma(spend.leftEnergy) },
              { label: "남은 조각", value: formatComma(spend.leftFragments) }
            ]}
          />
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
    </div>
  );
}

// ======================= 유니온 =======================

/**
 * @param {{ data: any }} props
 */
export function UnionTab({ data}) {
  const union = data.tabs?.union || {};
  const summary = union.summary || {};
  const segments = Array.isArray(summary.unionLevelTotalOptionSegments) ? summary.unionLevelTotalOptionSegments : [];
  const stats = Array.isArray(union.activeUnionStatOptions) ? union.activeUnionStatOptions : [];
  const raiders = Array.isArray(union.activeRaiderOptions) ? union.activeRaiderOptions : [];
  if (!summary.unionLevel && !stats.length && !raiders.length) return <EmptyState title="유니온 정보가 없어요" />;

  return (
    <div class="sect-stack">
      <div class="union-hero spotlight" {...spotlightHandlers()}>
        <GradeIcon src={summary.unionGradeIcon || ""} label={summary.unionGrade || ""} size={72} class="union-hero__icon" />
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
    </div>
  );
}

// ======================= 길드 =======================

/** 길드 건물 이름 → 그림 */
const BUILDING_ART = [
  [["도서관", "library"], "/assets/guild-library.png"],
  [["나무", "메이플", "tree"], "/assets/guild-mapletree.png"],
  [["회계", "account"], "/assets/guild-accountant.png"],
  [["캠프", "모닥불", "camp"], "/assets/guild-campfire.png"],
  [["요리", "chef", "cook"], "/assets/guild-chef.png"]
];

/** @param {string} name */
const buildingArt = (name) => BUILDING_ART.find(([words]) => words.some((word) => String(name || "").toLowerCase().includes(word)))?.[1] || "";

/**
 * @param {{ data: any, world: string }} props
 */
export function GuildTab({ data, world}) {
  const guild = data.tabs?.guild || {};
  const summary = guild.summary;
  if (!summary?.guildName) {
    return <EmptyState title="가입한 길드가 없어요" />;
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
              <ul class="building-list">
                {buildings.map((building, index) => {
                  const art = buildingArt(building.buildingName);
                  return (
                    <li key={index} class="building spotlight" {...spotlightHandlers()}>
                      {art ? <img class="building__art" src={art} alt="" loading="lazy" decoding="async" /> : <Icon name="flag" size={28} />}
                      <span class="building__name">{building.buildingName}</span>
                      <strong class="building__lv num">Lv.{building.buildingLevel}</strong>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

// ======================= 경험치 그래프 =======================

/**
 * 요소의 실제 너비(px). 글자가 늘어나지 않게 SVG 를 실제 크기로 그린다.
 * @param {import("preact").RefObject<HTMLElement>} ref
 */
export function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setWidth(Math.round(element.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * 단조 3차 보간(Fritsch–Carlson) 경로: 값이 튀어 오르지 않는 부드러운 선.
 * @param {Array<{ x: number, y: number }>} pts
 */
export function smoothPath(pts) {
  if (!pts.length) return "";
  if (pts.length === 1) return `M${pts[0].x} ${pts[0].y}`;
  const n = pts.length;
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push((pts[i + 1].y - pts[i].y) / (dx[i] || 1));
  }
  const m = [slope[0]];
  for (let i = 1; i < n - 1; i += 1) m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  m.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      m[i] = (3 / h) * a * slope[i];
      m[i + 1] = (3 / h) * b * slope[i];
    }
  }
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const c1x = pts[i].x + dx[i] / 3;
    const c1y = pts[i].y + (m[i] * dx[i]) / 3;
    const c2x = pts[i + 1].x - dx[i] / 3;
    const c2y = pts[i + 1].y - (m[i + 1] * dx[i]) / 3;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${pts[i + 1].x.toFixed(1)} ${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

/** 눈금 간격(레벨 단위)을 고른다. @param {number} span */
function tickStep(span) {
  const steps = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10];
  return steps.find((step) => span / step <= 4) || 10;
}

/** 레벨+경험치 → 눈금 글자. @param {number} y */
function tickLabel(y) {
  const level = Math.floor(y + 1e-9);
  const pct = Math.round((y - level) * 100);
  return pct === 0 ? `Lv.${level}` : `${pct}%`;
}

/** @param {string} date */
export const dayNumber = (date) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86400000);

/** @param {string} date "2026-10-03" → "10.03" */
export const shortDate = (date) => date.slice(5).replace("-", ".");

/**
 * 성장 그래프: 레벨 진행(부드러운 선 + 그라데이션 영역) 위, 하루 증가량 막대 아래.
 * 점·막대에 마우스를 올리거나 눌러 보면 날짜·레벨·경험치·전날 대비 증가량을 보여준다.
 * 하루 넘게 비는 구간은 선을 잇지 않고 "기록 없음"으로 표시한다.
 * @param {{ points: Array<{ dateKst: string, level: number | null, expRate: number | null }> }} props
 */
function TrendChart({ points }) {
  const boxRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const width = Math.max(280, useWidth(boxRef));
  const [active, setActive] = useState(/** @type {number | null} */ (null));
  const gradientId = `trend-${useId()}`;
  const narrow = width < 520;
  const height = narrow ? 260 : 320;
  const pad = { l: narrow ? 46 : 58, r: narrow ? 12 : 20, t: 18, b: 30 };
  const barBand = narrow ? 52 : 64; // 아래 막대 영역 높이
  const lineBottom = height - pad.b - barBand - 26;

  const series = useMemo(() => {
    const list = points
      .map((p) => ({ date: p.dateKst, level: Number(p.level) || 0, rate: Number(p.expRate) || 0 }))
      .filter((p) => p.date && p.level > 0)
      .map((p) => ({ ...p, y: p.level + p.rate / 100, day: dayNumber(p.date) }));
    return list.map((p, i) => {
      const prev = list[i - 1];
      return { ...p, gain: prev ? (p.y - prev.y) * 100 : null, gapDays: prev ? p.day - prev.day : 0 };
    });
  }, [points]);

  if (series.length < 2) return null;

  const first = series[0];
  const last = series[series.length - 1];
  const span = Math.max(1, last.day - first.day);
  const ys = series.map((p) => p.y);
  const rawMin = Math.min(...ys);
  const rawMax = Math.max(...ys);
  const padY = Math.max(0.04, (rawMax - rawMin) * 0.12);
  const step = tickStep(rawMax - rawMin + padY * 2);
  const yMin = Math.floor((rawMin - padY) / step) * step;
  const yMax = Math.ceil((rawMax + padY) / step) * step;
  const xOf = (day) => pad.l + ((day - first.day) / span) * (width - pad.l - pad.r);
  const yOf = (y) => pad.t + (1 - (y - yMin) / (yMax - yMin || 1)) * (lineBottom - pad.t);
  const ticks = [];
  for (let y = yMin; y <= yMax + 1e-9; y += step) ticks.push(Number(y.toFixed(4)));

  const gains = series.map((p) => (p.gain !== null && p.gain > 0 ? p.gain : 0));
  const maxGain = Math.max(1, ...gains);
  const barTop = height - pad.b - barBand;
  const barW = Math.max(4, Math.min(18, ((width - pad.l - pad.r) / (span + 1)) * 0.56));

  /** @type {Array<typeof series>} */
  const segments = [[series[0]]];
  /** @type {Array<{ x1: number, x2: number }>} */
  const gaps = [];
  for (let i = 1; i < series.length; i += 1) {
    if (series[i].gapDays > 1) {
      gaps.push({ x1: xOf(series[i - 1].day), x2: xOf(series[i].day) });
      segments.push([series[i]]);
    } else segments[segments.length - 1].push(series[i]);
  }

  /** @param {PointerEvent} event */
  const pick = (event) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = event.clientX - box.left;
    let best = 0;
    let bestDist = Infinity;
    series.forEach((p, i) => {
      const dist = Math.abs(xOf(p.day) - x);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setActive(best);
  };

  const cur = active !== null ? series[active] : null;
  const tipX = cur ? xOf(cur.day) : 0;
  // 툴팁은 점 옆(오른쪽, 모자라면 왼쪽)에 띄워 점을 가리지 않는다.
  const tipLeft = cur ? (tipX + 16 + 180 <= width ? tipX + 16 : Math.max(0, tipX - 196)) : 0;
  const tipTop = cur ? Math.max(0, Math.min(height - 96, yOf(cur.y) - 44)) : 0;

  return (
    <figure class="trend">
      <div
        ref={boxRef}
        class="trend__box"
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={(event) => event.pointerType === "mouse" && setActive(null)}
      >
        <svg
          class="trend__svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`레벨 변화: ${first.date} Lv.${first.level} ${formatDecimal(first.rate, 2)}%에서 ${last.date} Lv.${last.level} ${formatDecimal(last.rate, 2)}%`}
        >
          <defs>
            <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" class="trend__stop-a" />
              <stop offset="1" class="trend__stop-b" />
            </linearGradient>
            <linearGradient id={`${gradientId}-line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" class="trend__stop-l1" />
              <stop offset="1" class="trend__stop-l2" />
            </linearGradient>
            <linearGradient id={`${gradientId}-bar`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" class="trend__stop-bar1" />
              <stop offset="1" class="trend__stop-bar2" />
            </linearGradient>
          </defs>

          {ticks.map((y) => (
            <g key={y} class="trend__tick">
              <line x1={pad.l} x2={width - pad.r} y1={yOf(y)} y2={yOf(y)} class="trend__grid" />
              <text x={pad.l - 10} y={yOf(y)} class="trend__axis" text-anchor="end" dominant-baseline="middle">
                {tickLabel(y)}
              </text>
            </g>
          ))}
          <line x1={pad.l} x2={width - pad.r} y1={height - pad.b} y2={height - pad.b} class="trend__base" />

          {gaps.map((gap, index) => (
            <g key={index} class="trend__gap-g">
              <rect x={gap.x1 + 4} y={pad.t} width={Math.max(0, gap.x2 - gap.x1 - 8)} height={height - pad.t - pad.b} rx="10" class="trend__gap" />
              {gap.x2 - gap.x1 > 60 ? (
                <text x={(gap.x1 + gap.x2) / 2} y={pad.t + 16} class="trend__gap-text" text-anchor="middle">
                  기록 없음
                </text>
              ) : null}
            </g>
          ))}

          {/* 하루 증가량 막대 */}
          {series.map((p, i) => {
            const h = gains[i] > 0 ? Math.max(3, (gains[i] / maxGain) * (barBand - 8)) : 0;
            if (!h) return null;
            return (
              <rect
                key={`bar-${p.date}`}
                class={`trend__bar${active === i ? " is-active" : ""}`}
                x={xOf(p.day) - barW / 2}
                y={height - pad.b - h}
                width={barW}
                height={h}
                rx={Math.min(5, barW / 2)}
                fill={`url(#${gradientId}-bar)`}
                style={{ "--i": i }}
              />
            );
          })}
          <text x={pad.l - 10} y={barTop + 14} class="trend__axis trend__axis--bar" text-anchor="end">
            하루
          </text>

          {/* 레벨 진행 영역 + 선 */}
          {segments.map((segment, index) => {
            const pts = segment.map((p) => ({ x: xOf(p.day), y: yOf(p.y) }));
            const line = smoothPath(pts);
            const area = pts.length > 1 ? `${line} L${pts[pts.length - 1].x.toFixed(1)} ${lineBottom} L${pts[0].x.toFixed(1)} ${lineBottom} Z` : "";
            return (
              <g key={index}>
                {area ? <path class="trend__area" d={area} fill={`url(#${gradientId}-area)`} /> : null}
                <path class="trend__line" d={line} pathLength={1} stroke={`url(#${gradientId}-line)`} />
              </g>
            );
          })}

          {cur ? <line class="trend__guide" x1={tipX} x2={tipX} y1={pad.t} y2={height - pad.b} /> : null}

          {series.map((p, i) => (
            <circle
              key={p.date}
              cx={xOf(p.day)}
              cy={yOf(p.y)}
              r={active === i ? 6.5 : i === series.length - 1 ? 4.5 : 3}
              class={`trend__dot${active === i ? " is-active" : ""}${i === series.length - 1 ? " is-last" : ""}`}
              style={{ "--i": i }}
            />
          ))}

          <text x={xOf(first.day)} y={height - 8} class="trend__axis" text-anchor="start">
            {shortDate(first.date)}
          </text>
          {!narrow && span > 6 ? (
            <text x={xOf(first.day + Math.round(span / 2))} y={height - 8} class="trend__axis" text-anchor="middle">
              {shortDate(new Date((first.day + Math.round(span / 2)) * 86400000).toISOString().slice(0, 10))}
            </text>
          ) : null}
          <text x={xOf(last.day)} y={height - 8} class="trend__axis" text-anchor="end">
            {shortDate(last.date)}
          </text>
        </svg>

        {cur ? (
          <div class="trend__tip" style={{ transform: `translate(${tipLeft}px, ${tipTop}px)` }} aria-hidden="true">
            <p class="trend__tip-date">{formatDateDot(cur.date)}</p>
            <p class="trend__tip-level num">
              Lv.{cur.level} <strong>{formatDecimal(cur.rate, 2)}%</strong>
            </p>
            <p class={`trend__tip-gain num${cur.gain !== null && cur.gain > 0 ? " is-up" : ""}`}>
              {cur.gain === null
                ? "첫 기록"
                : `${cur.gapDays > 1 ? `${cur.gapDays}일 전 대비` : "전날 대비"} ${cur.gain >= 0 ? "+" : ""}${formatDecimal(cur.gain, 2)}%`}
            </p>
          </div>
        ) : null}
      </div>
      <figcaption class="sr-only">
        <table>
          <caption>날짜별 레벨과 경험치</caption>
          <thead>
            <tr>
              <th scope="col">날짜</th>
              <th scope="col">레벨</th>
              <th scope="col">경험치</th>
              <th scope="col">이전 기록 대비</th>
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.date}>
                <td>{p.date}</td>
                <td>{p.level}</td>
                <td>{formatDecimal(p.rate, 2)}%</td>
                <td>{p.gain === null ? "-" : `${formatDecimal(p.gain, 2)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

/** 성장 기록이 없을 때: 점선 그래프가 그려지는 일러스트. */
function ExpEmpty() {
  return (
    <div class="exp-empty">
      <svg class="exp-empty__art" width="220" height="128" viewBox="0 0 220 128" aria-hidden="true" focusable="false">
        <rect x="8" y="10" width="204" height="104" rx="18" class="exp-empty__card" />
        <g class="exp-empty__grid">
          <line x1="28" x2="192" y1="40" y2="40" />
          <line x1="28" x2="192" y1="66" y2="66" />
          <line x1="28" x2="192" y1="92" y2="92" />
        </g>
        <g class="exp-empty__bars">
          <rect x="44" y="84" width="10" height="8" rx="3" />
          <rect x="76" y="78" width="10" height="14" rx="3" />
          <rect x="108" y="82" width="10" height="10" rx="3" />
          <rect x="140" y="72" width="10" height="20" rx="3" />
        </g>
        <path class="exp-empty__line" d="M30 86 C 60 82, 74 70, 98 68 S 140 52, 168 34" pathLength="1" />
        <circle cx="168" cy="34" r="5" class="exp-empty__dot" />
        <g transform="translate(176 8) rotate(16) scale(1.05)" class="exp-empty__leaf">
          <path d={LEAF_PATH} stroke-width="1.2" stroke-linejoin="round" />
          <path d={LEAF_STEM_PATH} fill="none" stroke-width="1.6" stroke-linecap="round" />
        </g>
        <path d={SPARKLE_PATH} transform="translate(14 0) scale(0.6)" class="exp-empty__sparkle" />
      </svg>
      <p class="exp-empty__title">아직 쌓인 성장 기록이 없어요</p>
    </div>
  );
}

/**
 * @param {{ data: any }} props
 */
/**
 * 다음 레벨 예상일: 최근 7일 안, 지금 레벨에서 오른 경험치 %의 하루 평균으로 남은 %를 나눈다.
 * 하루 기록이 2개 미만이거나 오르지 않았으면 null.
 * @param {any[]} daily @param {number} level @param {number} rate
 * @returns {{ days: number, date: string, perDay: number } | null}
 */
function levelUpForecast(daily, level, rate) {
  if (!Number.isFinite(rate) || !level) return null;
  const today = daily[daily.length - 1]?.dateKst;
  if (!today) return null;
  const since = new Date(`${today}T00:00:00Z`).getTime() - 7 * 86400000;
  const base = daily.find((row) => Number(row.level) === level && new Date(`${row.dateKst}T00:00:00Z`).getTime() >= since);
  if (!base) return null;
  const span = (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${base.dateKst}T00:00:00Z`).getTime()) / 86400000;
  const perDay = span > 0 ? (rate - Number(base.expRate)) / span : 0;
  if (!(perDay > 0)) return null;
  const days = Math.max(1, Math.ceil((100 - rate) / perDay));
  const date = new Date(Date.now() + 9 * 3600000 + days * 86400000).toISOString().slice(0, 10);
  return { days, date, perDay };
}

const HISTORY_LABELS = { name: "닉네임", guild: "길드", class: "직업", world: "월드" };

/** 닉네임·길드·직업이 바뀐 기록(사이트 조회·수집 때 본 값). 없으면 아무것도 그리지 않는다. */
function ChangeHistory({ ocid }) {
  const [events, setEvents] = useState(/** @type {any[]} */ ([]));
  useEffect(() => {
    if (!ocid) return undefined;
    let alive = true;
    getJson(`/api/v2/character-history?${new URLSearchParams({ ocid })}`).then(
      ({ response, body }) => alive && response.ok && body?.ok && setEvents(Array.isArray(body.events) ? body.events : []),
      () => {}
    );
    return () => {
      alive = false;
    };
  }, [ocid]);
  if (!events.length) return null;
  return (
    <section class="sect">
      <SubTitle count={events.length}>변경 이력</SubTitle>
      <ol class="history-list">
        {events.map((event, index) => (
          <li key={index}>
            <span class="history-list__date num">{formatDateDot(String(event.at).slice(0, 10))}</span>
            <span class="badge">{HISTORY_LABELS[event.field] || event.field}</span>
            <span class="history-list__change">
              <span class="history-list__from">{event.from}</span>
              <Icon name="arrowRight" size={14} />
              <strong>{event.to}</strong>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** @param {{ data: any, children?: any }} props children: 변경 이력 앞에 넣을 기록(최고 기록·성장 일지) */
export function ExpTab({ data, children }) {
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
  const rate = Number(exp.currentExpRate ?? data.profile?.expRate);
  const forecast = levelUpForecast(daily, Number(exp.currentLevel ?? data.profile?.level) || 0, rate);

  return (
    <div class="sect-stack">
      <div class="exp-summary">
        <div class="exp-summary__item spotlight" {...spotlightHandlers()}>
          <span class="exp-summary__label">현재 레벨</span>
          <strong class="display num">
            Lv.
            <CountUp value={Number(exp.currentLevel ?? data.profile?.level) || 0} format={(n) => formatComma(Math.round(n))} />
          </strong>
        </div>
        <div class="exp-summary__item spotlight" {...spotlightHandlers()}>
          <span class="exp-summary__label">경험치</span>
          <strong class="display num">{Number.isFinite(rate) ? <CountUp value={rate} format={(n) => `${formatDecimal(n, 2)}%`} /> : exp.expText || "-"}</strong>
          {Number.isFinite(rate) ? (
            <span class="exp-summary__bar" aria-hidden="true">
              <span style={{ "--exp": `${Math.max(0, Math.min(100, rate))}%` }} />
            </span>
          ) : null}
        </div>
        {daily.length >= 2 ? (
          <div class="exp-summary__item spotlight" {...spotlightHandlers()}>
            <span class="exp-summary__label">{formatMonthDay(first.dateKst)} 이후</span>
            <strong class="display num exp-summary__gain">
              +<CountUp value={gained * 100} format={(n) => `${formatDecimal(n, 1)}%`} />
            </strong>
          </div>
        ) : null}
        {forecast ? (
          <div class="exp-summary__item spotlight" {...spotlightHandlers()}>
            <span class="exp-summary__label">다음 레벨 예상</span>
            <strong class="display num">{formatMonthDay(forecast.date)}</strong>
            <span class="exp-summary__note num">
              {formatComma(forecast.days)}일 · 하루 {formatDecimal(forecast.perDay, 2)}%
            </span>
          </div>
        ) : null}
      </div>

      {state.status === "loading" ? <Skeleton height={300} radius={16} /> : null}
      {state.status === "error" ? <ErrorState compact title="성장 기록을 불러오지 못했어요" description={state.error?.message} onRetry={() => setAttempt((n) => n + 1)} /> : null}
      {state.status === "ready" && daily.length >= 2 ? <TrendChart points={daily} /> : null}
      {state.status === "ready" && daily.length < 2 ? <ExpEmpty /> : null}
      {children}
      <ChangeHistory ocid={ocid} />
    </div>
  );
}
