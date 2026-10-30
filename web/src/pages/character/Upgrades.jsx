// 스펙업 추천: 지금 장비마다 ★+1 과 "바로 위 장비로 교체"의 보스 세팅 전투력 변화를 재서 많이 오르는 순으로
// 종류마다 10개(전체 · 강화 · 교체로 나눠 본다).
// 강화는 아이템 DB(단계별 기본 옵션)에 있는 장비만, 다음 단계가 표에 없으면 표에 있는 가장 가까운 위 단계(최대 3성 위)까지. 교체 후보는 같은 부위·계열에서 내 점수 바로 위 장비 8개 중 가장 많이
// 오르는 것(GET /api/v2/item-search above·order=near). 계산은 옵션 넣어 보기·더 좋은 장비와 같다(web/src/lib/upgradePlan.mjs).
// 강화에는 강화 계산기와 같은 확률표로 평균 강화 횟수·도중 파괴 확률·1회당 상승을 붙이고, ★ 강화는 1회당 순으로도 본다.
import starforceSets from "../../../../src/game-data/starforce-sets.json";
import { useEffect, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { Sheet } from "../../components/Sheet.jsx";
import { Segmented } from "../../components/Tabs.jsx";
import { getJson } from "../../lib/api.js";
import { gradeInfo } from "../../lib/character.js";
import { combatPower, totalsFromStats } from "../../lib/efficiency.js";
import { formatComma, formatDecimal, formatKoreanUnits } from "../../lib/format.js";
import { urls } from "../../lib/game.js";
import { loadItemRanks } from "../../lib/itemRanks.js";
import { currentSetTotals } from "../../lib/starforceWhatIf.mjs";
import { rankPlans, starUpTotals, swapUpTotals, withStarCost } from "../../lib/upgradePlan.mjs";

const CANDIDATES = 8;
const WORKERS = 4;

/**
 * @param {{ items: any[], ocid: string, majorStats: Record<string, any>, attackType: string }} input
 */
async function computePlans({ items, ocid, majorStats, attackType }) {
  const totals = totalsFromStats(majorStats, attackType);
  if (!totals) return [];
  const before = combatPower(totals);
  const ratio = (/** @type {any} */ next) => (before > 0 && next ? combatPower(next) / before - 1 : Number.NaN);
  const setTotals = currentSetTotals(majorStats);
  const [db, rules, ranks] = await Promise.all([
    import("../../../../src/game-data/item-db.json").then((module) => module.default || module),
    import("../../../../src/game-data/enhance.json").then((module) => module.default || module),
    loadItemRanks(ocid)
  ]);
  /** @type {any[]} */
  const plans = [];
  for (const item of items) {
    const up = starUpTotals({ totals, item, dbEntry: db.items?.[item.itemName], sets: starforceSets, setTotals, attackType });
    if (up) plans.push(withStarCost({ kind: "star", item, toStar: up.toStar, gain: ratio(up.totals) }, rules));
  }
  const queue = items.filter((item) => ranks[item.fingerprint]?.slot);
  const worker = async () => {
    while (queue.length) {
      const item = queue.shift();
      const rank = ranks[item.fingerprint];
      const params = new URLSearchParams({ slot: rank.slot, above: String(rank.score), order: "near" });
      if (rank.family) params.set("family", rank.family);
      if (ocid) params.set("not", ocid);
      const { response, body } = await getJson(`/api/v2/item-search?${params}`).catch(() => ({ response: { ok: false }, body: null }));
      if (!response.ok || !body?.ok) continue;
      let best = null;
      for (const row of (body.rows || []).slice(0, CANDIDATES)) {
        const other = row.item || {};
        const gain = ratio(swapUpTotals({ totals, item, other, sets: starforceSets, setTotals, attackType }));
        if (!best || gain > best.gain) best = { kind: "swap", item, other, owner: { world: row.worldName, name: row.characterName }, gain };
      }
      if (best) plans.push(best);
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  return { star: rankPlans(plans.filter((plan) => plan.kind === "star"), 40), swap: rankPlans(plans.filter((plan) => plan.kind === "swap"), 10) };
}

const KINDS = [
  { value: "all", label: "전체" },
  { value: "star", label: "★ 강화" },
  { value: "swap", label: "교체" }
];
const SORTS = [
  { value: "gain", label: "많이 오르는 순" },
  { value: "per", label: "1회당 많이 오르는 순" }
];
const percent = (/** @type {number} */ value) => `${formatDecimal(value * 100, value < 0.0001 ? 3 : value < 0.01 ? 2 : 1)}%`;

/** 평균 n회 · 파괴 x% · 1회당 +y% @param {{ plan: any }} props */
function StarCost({ plan }) {
  if (!Number.isFinite(plan.tries)) return null;
  return (
    <span class="upgrades__cost num">
      <span>평균 {plan.tries < 10 ? formatDecimal(plan.tries, 1) : formatComma(Math.round(plan.tries))}회</span>
      {plan.destroyChance > 0 ? <span class="is-risk">파괴 {percent(plan.destroyChance)}</span> : null}
      <span>1회당 +{percent(plan.perTry)}</span>
    </span>
  );
}

/** @param {{ item: any }} props */
function ItemIcon({ item }) {
  const grade = gradeInfo(item?.itemGrade);
  return (
    <span class={`upgrades__icon${grade ? ` is-${grade.key}` : ""}`}>
      {item?.itemIcon ? <img src={item.itemIcon} alt="" width={36} height={36} loading="lazy" /> : <Icon name="medal" size={20} />}
    </span>
  );
}

/**
 * @param {{ items: any[], ocid: string, majorStats: Record<string, any>, attackType: string, basePower: number | null, onOpen: (item: any) => void }} props
 */
export function Upgrades({ items, ocid, majorStats, attackType, basePower, onOpen }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", items?: any[], plans?: { star: any[], swap: any[] } }} */ ({ status: "loading" }));
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("gain");

  // 시트를 열 때 재고, 다른 프리셋을 고르면 다시 잰다(같은 장비면 앞서 잰 것을 쓴다)
  useEffect(() => {
    if (!open || (state.status === "ready" && state.items === items)) return undefined;
    let alive = true;
    setState({ status: "loading" });
    computePlans({ items, ocid, majorStats, attackType }).then(
      (plans) => alive && setState({ status: "ready", items, plans }),
      () => alive && setState({ status: "error" })
    );
    return () => {
      alive = false;
    };
  }, [open, items]);

  const lists = state.plans || { star: [], swap: [] };
  const plans =
    kind === "all"
      ? rankPlans([...lists.star, ...lists.swap], 10)
      : kind === "star"
        ? rankPlans(lists.star, 10, sort === "per" ? "perTry" : "gain")
        : lists.swap;
  return (
    <>
      <button type="button" class="eq-luck" onClick={() => setOpen(true)}>
        <Icon name="bolt" size={16} />
        스펙업 추천
      </button>
      <Sheet open={open} title="스펙업 추천" class="upgrades-sheet" onClose={() => setOpen(false)}>
        {state.status === "ready" && (lists.star.length || lists.swap.length) ? (
          <Segmented name="upgrade-kind" legend="추천 종류" value={kind} onChange={setKind} options={KINDS} class="upgrades__kinds" />
        ) : null}
        {state.status === "ready" && kind === "star" && lists.star.length > 1 ? (
          <Segmented name="upgrade-sort" legend="강화 순서" value={sort} onChange={setSort} options={SORTS} class="upgrades__kinds upgrades__sorts" />
        ) : null}
        {state.status === "loading" ? <p class="upgrades__note">장비마다 재는 중…</p> : null}
        {state.status === "error" ? <p class="upgrades__note">재지 못했어요.</p> : null}
        {state.status === "ready" && !plans.length ? (
          <p class="upgrades__note">{kind === "star" ? "★ 강화로 오를 장비를 찾지 못했어요(아이템 표에 있는 장비만 잴 수 있어요)." : "지금 장비에서 더 오를 곳을 찾지 못했어요."}</p>
        ) : null}
        {plans.length ? (
          <ol class="upgrades__list">
            {plans.map((plan, index) => {
              const star = Number(plan.item.starforceUpgrade) || 0;
              const abs = basePower ? basePower * plan.gain : 0;
              return (
                <li key={`${plan.kind}-${plan.item.fingerprint || plan.item.itemName}-${index}`}>
                  <span class="upgrades__rank num">{index + 1}</span>
                  <ItemIcon item={plan.kind === "swap" ? plan.other : plan.item} />
                  <span class="upgrades__text">
                    <span class="upgrades__slot">
                      {plan.item.slotName} · {plan.item.itemName}
                      {star ? ` ★${star}` : ""}
                    </span>
                    {plan.kind === "star" ? (
                      <>
                        <strong>
                          스타포스 ★{star} → ★{plan.toStar}
                        </strong>
                        <StarCost plan={plan} />
                      </>
                    ) : (
                      <strong>
                        {plan.other.itemName}
                        {Number(plan.other.starforceUpgrade) ? ` ★${plan.other.starforceUpgrade}` : ""}로 바꾸기
                      </strong>
                    )}
                    {plan.kind === "swap" ? (
                      <a class="upgrades__owner" href={urls.character(plan.owner.world, plan.owner.name)}>
                        {plan.owner.world} {plan.owner.name}님 장비
                        <Icon name="chevronRight" size={12} />
                      </a>
                    ) : null}
                  </span>
                  <span class="upgrades__gain num">
                    <strong>+{formatDecimal(plan.gain * 100, plan.gain < 0.01 ? 2 : 1)}%</strong>
                    {abs >= 1 ? <span>+{formatKoreanUnits(Math.round(abs), { maxGroups: abs >= 1e8 ? 2 : 1 })}</span> : null}
                  </span>
                  <button
                    type="button"
                    class="upgrades__open"
                    aria-label={`${plan.item.itemName} 자세히`}
                    onClick={() => {
                      setOpen(false);
                      onOpen(plan.item);
                    }}
                  >
                    <Icon name="chevronRight" size={18} />
                  </button>
                </li>
              );
            })}
          </ol>
        ) : null}
      </Sheet>
    </>
  );
}
