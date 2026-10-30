// 보스 탭: 캐릭터 레벨·전투력(최근 24시간 최고)을 보스 입장 조건과 비교한다.
// 입장 가능 = 레벨 ≥ 입장 레벨 그리고 전투력 ≥ 입장 전투력. 권장 전투력을 넘으면 따로 표시한다.
// 권장 포스(아케인·어센틱)는 심볼 포스 합과 견주고, 권장 포스가 모자란 첫 보스까지 심볼을 가장 적게 쓰는 레벨업을 보여 준다.
// 보스마다 모은 캐릭터 중 입장 가능한 비율(GET /api/v2/stats/boss-reach, 서버가 6시간마다 센다).
import bossData from "../../../../src/game-data/boss-entry.json";
import symbolCosts from "../../../../src/game-data/symbol-costs.json";
import { useEffect, useState } from "preact/hooks";
import { EmptyState } from "../../components/States.jsx";
import { getJson } from "../../lib/api.js";
import { forcePlan, totalForce } from "../../lib/bossForce.mjs";
import { combatPowerOf, shortSymbolName } from "../../lib/character.js";
import { formatComma, formatDecimal, formatKoreanUnits, toNumber } from "../../lib/format.js";

/** 1억 아래는 "455만", 위는 "1억 1,230만" */
const shortPower = (/** @type {number} */ value) => formatKoreanUnits(value, { maxGroups: value >= 1e8 ? 2 : 1 });

const DIFFICULTY_TONE = { 이지: "sky", 노말: "mint", 하드: "peach", 카오스: "lavender" };
const FORCE_KIND = { 아케인: "arcane", 어센틱: "authentic" };
const bossKey = (/** @type {{ name: string, difficulty: string }} */ boss) => `${boss.name}|${boss.difficulty}`;

/** @type {Promise<Map<string, number>> | null} */
let reachRequest = null;

/** 보스마다 모은 캐릭터 중 입장 가능 비율(페이지에서 한 번만 읽는다, 실패하면 다음에 다시). */
function useBossReach() {
  const [reach, setReach] = useState(/** @type {Map<string, number> | null} */ (null));
  useEffect(() => {
    let alive = true;
    reachRequest ||= getJson("/api/v2/stats/boss-reach").then(({ response, body }) => {
      if (!response.ok || !body?.ok || !body.total) throw new Error("boss-reach");
      return new Map((body.bosses || []).map((boss) => [bossKey(boss), boss.share]));
    });
    reachRequest.then(
      (map) => alive && setReach(map),
      () => {
        reachRequest = null;
      }
    );
    return () => {
      alive = false;
    };
  }, []);
  return reach;
}

const sharePercent = (/** @type {number} */ share) => (share > 0 && share < 0.001 ? "0.1% 미만" : `${formatDecimal(share * 100, share >= 0.1 ? 0 : 1)}%`);

/** 권장 포스가 모자란 첫 보스(입장 가능한 보스 먼저)와 그 포스까지 레벨업. @param {{ rows: any[], symbols: Record<string, any[]>, force: Record<string, number> }} props */
function ForcePlan({ rows, symbols, force }) {
  const short = (/** @type {any} */ row) => {
    const need = row.boss.recommend?.force;
    const kind = need && FORCE_KIND[need.type];
    return kind && symbols[kind].length && force[kind] < need.value;
  };
  const target = rows.find((row) => row.open && short(row)) || rows.find((row) => !row.open && short(row));
  if (!target) return null;
  const need = target.boss.recommend.force;
  const kind = FORCE_KIND[need.type];
  const plan = forcePlan(symbols[kind], kind, need.value, symbolCosts[kind]);
  return (
    <div class="boss-force">
      <p class="boss-force__title">
        <strong>
          {target.boss.name} {target.boss.difficulty}
        </strong>{" "}
        권장 {need.type}포스 <span class="num">{formatComma(need.value)}</span>
        <span class="boss-force__have num">
          지금 {formatComma(plan.have)} · {formatComma(plan.need)} 부족
        </span>
      </p>
      {plan.reachable ? (
        <>
          <p class="boss-force__cost num">
            레벨업 {formatComma(plan.need / 10)}번 · 심볼 {formatComma(plan.symbols)}개 · 메소 {formatKoreanUnits(plan.meso, { maxGroups: 2 })}
          </p>
          <ul class="boss-force__steps">
            {plan.steps.map((step) => (
              <li key={step.name} class="num">
                {shortSymbolName(step.name)} {step.from}→{step.to}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p class="boss-force__cost">가진 심볼을 모두 올려도 모자라요. 새 지역 심볼이 필요해요.</p>
      )}
    </div>
  );
}

/** @param {{ data: any }} props */
export function BossTab({ data }) {
  const power = combatPowerOf(data.profile?.combatPower).value;
  const level = toNumber(data.profile?.level);
  const reach = useBossReach();
  if (!power || !level) return <EmptyState compact title="전투력 정보가 없어 비교할 수 없어요" />;
  const symbolTab = data.tabs?.jewelSymbolVmatrix?.symbol;
  const symbols = {
    arcane: Array.isArray(symbolTab?.arcaneSymbols) ? symbolTab.arcaneSymbols : [],
    authentic: Array.isArray(symbolTab?.authenticSymbols) ? symbolTab.authenticSymbols : []
  };
  const force = { arcane: totalForce(symbols.arcane, "arcane"), authentic: totalForce(symbols.authentic, "authentic") };
  const knowForce = symbols.arcane.length > 0 || symbols.authentic.length > 0;

  const rows = bossData.bosses.map((boss) => {
    const levelOk = level >= boss.level;
    const powerOk = power >= boss.power;
    const recommended = Boolean(boss.recommend?.power) && power >= boss.recommend.power;
    return { boss, levelOk, powerOk, open: levelOk && powerOk, recommended };
  });
  const openCount = rows.filter((row) => row.open).length;
  const next = rows.find((row) => !row.open);

  return (
    <div class="boss">
      <div class="boss-summary">
        <p class="boss-summary__count display num">
          {openCount}
          <span class="boss-summary__total"> / {rows.length}</span>
        </p>
        <p class="boss-summary__text">
          입장 가능
          {next ? (
            <span class="boss-summary__next">
              다음 {next.boss.name} {next.boss.difficulty}
              {next.powerOk ? ` · Lv.${next.boss.level} 필요` : ` · 전투력 ${shortPower(next.boss.power - power)} 부족`}
            </span>
          ) : null}
        </p>
        {knowForce ? (
          <p class="boss-summary__force num">
            아케인포스 {formatComma(force.arcane)} · 어센틱포스 {formatComma(force.authentic)}
          </p>
        ) : null}
      </div>
      {knowForce ? <ForcePlan rows={rows} symbols={symbols} force={force} /> : null}
      <ul class="boss-list">
        {rows.map(({ boss, levelOk, powerOk, open, recommended }, index) => {
          const ratio = Math.min(1, power / boss.power);
          const needForce = knowForce ? boss.recommend?.force : null;
          const forceOk = needForce ? force[FORCE_KIND[needForce.type]] >= needForce.value : true;
          return (
            <li key={`${boss.name}-${boss.difficulty}`} class={`boss-row${open ? " is-open" : ""}`} style={{ "--stagger": Math.min(index, 12) }}>
              <span class="boss-row__name">
                {boss.name}
                <span class={`boss-diff tone-${DIFFICULTY_TONE[boss.difficulty] || "sky"}`}>{boss.difficulty}</span>
              </span>
              <span class="boss-row__need num">
                <span class={levelOk ? "" : "is-short"}>Lv.{boss.level}</span>
                <span class={powerOk ? "" : "is-short"}>{shortPower(boss.power)}</span>
                {needForce ? (
                  <span class={forceOk ? "" : "is-short"} title={`권장 ${needForce.type}포스`}>
                    {needForce.type} {formatComma(needForce.value)}
                  </span>
                ) : null}
              </span>
              <span class="boss-row__bar" aria-hidden="true">
                <span style={{ width: `${Math.round(ratio * 100)}%` }} />
              </span>
              {reach?.has(bossKey(boss)) ? <span class="boss-row__reach num">모은 캐릭터 중 {sharePercent(reach.get(bossKey(boss)) || 0)} 입장 가능</span> : null}
              <span class={`boss-state${open ? (recommended ? " is-great" : " is-ok") : ""}`}>
                {open ? (recommended ? "권장 충족" : "입장 가능") : !levelOk ? "레벨 부족" : "전투력 부족"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
