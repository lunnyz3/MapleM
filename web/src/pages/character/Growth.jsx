// 내실 탭: 영역마다 완성도와 "최대로 키우면 전투력 +얼마". 영역 표·스탯 차이는 서버(tabs.growth), 전투력 계산과
// 링크 영역(전투력 기준 링크 추천, 최대 레벨)은 화면에서 한다. 맨 위 합계는 모든 영역을 한꺼번에 넣은 값.
import { useMemo } from "preact/hooks";
import linkData from "../../../../src/game-data/link-skills.json";
import { Icon } from "../../components/Icon.jsx";
import { EmptyState } from "../../components/States.jsx";
import { combatPower, totalsFromStats } from "../../lib/efficiency.js";
import { formatComma, formatDecimal, formatKoreanUnits } from "../../lib/format.js";
import { growthSummary } from "../../lib/growthReport.mjs";
import { linkStats, recommendLinks } from "../../lib/linkRecommend.mjs";
import { withoutLinks } from "./Efficiency.jsx";
import { CubeAdvice } from "./CubeAdvice.jsx";

const squash = (/** @type {string} */ text) => String(text || "").replace(/\s+/g, "");

/**
 * 링크 영역: 지금 칸 수로 고른 추천 묶음(최대 레벨)과 지금 링크의 차이. 목표 레벨 = min(최대, 그 링크를 주는 다른 직업 수 × 3).
 * @returns {any | null}
 */
function linkArea(majorStats, attackType, linkSkills, className) {
  const own = linkData.selfLinks.find((link) => link.classes.some((name) => squash(name) === squash(className)));
  /** @type {Map<string, number>} */
  const owned = new Map();
  for (const skill of linkSkills) {
    if (!skill?.skillName || skill.skillName === own?.name) continue;
    owned.set(skill.skillName, (owned.get(skill.skillName) || 0) + (Number(skill.skillLevel) || 0));
  }
  if (!owned.size) return null;
  const base = totalsFromStats(withoutLinks(majorStats), attackType);
  const now = totalsFromStats(majorStats, attackType);
  if (!base || !now) return null;
  const advice = recommendLinks({
    base,
    links: linkData.selfLinks,
    attackType,
    slots: owned.size,
    level: "max",
    exclude: own ? [own.name] : [],
    owned: Object.fromEntries(owned),
    combatPower
  });
  /** @type {Record<string, number>} */
  const picked = { ...base };
  let current = 0;
  let target = 0;
  for (const pick of advice.picks) {
    const link = linkData.selfLinks.find((item) => item.name === pick.name);
    if (!link) continue;
    for (const [key, value] of Object.entries(linkStats(link, pick.level, attackType))) picked[key] = (picked[key] || 0) + value;
    const givers = link.classes.filter((name) => squash(name) !== squash(className)).length;
    const goal = Math.min(link.maxLevel, Math.max(1, givers) * 3);
    target += goal;
    current += Math.min(goal, owned.get(pick.name) || 0);
  }
  /** @type {Record<string, number>} */
  const totalsDelta = {};
  for (const key of Object.keys(now)) totalsDelta[key] = (picked[key] || 0) - (now[key] || 0);
  return {
    id: "link",
    label: "링크",
    current,
    max: target,
    unit: "레벨",
    completion: target ? current / target : 1,
    totalsDelta,
    detail: "추천 묶음을 최대 레벨로"
  };
}

/** "+1,793만 (+5.3%)" */
function gainText(gain, ratio) {
  if (!(gain > 0.5)) return "변화 없음";
  return `+${formatKoreanUnits(Math.round(gain), { maxGroups: gain >= 1e8 ? 2 : 1 })} (+${formatDecimal(ratio * 100, ratio < 0.01 ? 2 : 1)}%)`;
}

/** 지금/최대 글자 */
function amountText(row) {
  if (row.unit === "Lv") return `Lv.${formatComma(row.current)} / ${formatComma(row.max)}`;
  if (row.unit === "%") return `${formatDecimal(row.current, 0)}%`;
  return `${formatComma(row.current)} / ${formatComma(row.max)}${row.unit ? ` ${row.unit}` : ""}`;
}

/**
 * @param {{ data: any, majorStats: Record<string, any>, attackType: string, linkSkills: any[], className: string, items?: any[] }} props
 *   items: 보스 세팅 장비 프리셋 장비(큐브·불꽃 추천)
 */
export function GrowthTab({ data, majorStats, attackType, linkSkills, className, items = [] }) {
  const report = data.tabs?.growth;
  const summary = useMemo(() => {
    const totals = totalsFromStats(majorStats, attackType);
    if (!report?.areas?.length || !totals) return null;
    const link = linkArea(majorStats, attackType, linkSkills, className);
    return growthSummary({ areas: report.areas, totals, attackType, combatPower, extra: link ? [link] : [] });
  }, [report, majorStats, attackType, linkSkills, className]);

  if (!summary) return <EmptyState compact title="내실 정보를 계산할 수 없어요" description="캐릭터 정보를 다시 불러오면 나올 수 있어요." />;

  return (
    <div class="growth">
      <section class="growth-head">
        <p class="growth-head__count">
          <strong class="num">{summary.doneCount}</strong> / {summary.count} 항목 최대
        </p>
        <p class="growth-head__gain display num">{summary.gain > 0.5 ? `최대로 키우면 전투력 ${gainText(summary.gain, summary.ratio)}` : "모든 항목이 최대예요"}</p>
      </section>

      {summary.rows.length ? (
        <ol class="growth-list">
          {summary.rows.map((row, index) => (
            <li key={row.id} class="growth-row" style={{ "--stagger": index }}>
              <div class="growth-row__top">
                <strong class="growth-row__label">{row.label}</strong>
                <span class={`growth-row__gain num${row.gain > 0.5 ? " is-up" : ""}`}>{row.id === "pitched" ? "완성도만 봐요" : gainText(row.gain, row.ratio)}</span>
              </div>
              <div class="growth-row__bar" role="img" aria-label={`${row.label} 완성도 ${Math.floor(row.completion * 100)}%`}>
                <span style={{ "--w": `${Math.max(2, Math.min(100, row.completion * 100))}%` }} />
              </div>
              <div class="growth-row__bottom">
                <span class="num">{Math.floor(row.completion * 100)}%</span>
                <span class="growth-row__amount num">{amountText(row)}</span>
                {row.detail ? <span class="growth-row__detail">{row.detail}</span> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {summary.done.length ? (
        <section class="growth-done" aria-label="최대 달성">
          <h3 class="sub-title">최대 달성</h3>
          <ul class="growth-done__list">
            {summary.done.map((row) => (
              <li key={row.id} class="badge">
                <Icon name="check" size={14} />
                {row.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <CubeAdvice items={items} majorStats={majorStats} attackType={attackType} />
    </div>
  );
}
