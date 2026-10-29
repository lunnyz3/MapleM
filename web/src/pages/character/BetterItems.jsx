// 나보다 좋은 장비: 같은 아이템(또는 같은 부위·계열)에서 템환산이 더 높은 장비와 주인, 그리고 그 장비를 내 캐릭터에
// 끼면 보스 세팅 전투력이 얼마나 바뀌는지(web/src/lib/swapItem.mjs). 목록은 GET /api/v2/item-search(above·order=near).
import starforceSets from "../../../../src/game-data/starforce-sets.json";
import { useEffect, useMemo, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { Segmented } from "../../components/Tabs.jsx";
import { getJson } from "../../lib/api.js";
import { combatPower, totalsFromStats } from "../../lib/efficiency.js";
import { formatDecimal } from "../../lib/format.js";
import { urls } from "../../lib/game.js";
import { deltaToTotals } from "../../lib/growthReport.mjs";
import { itemScoreDiff } from "../../lib/itemScore.js";
import { currentSetTotals, setChange, setOfItem } from "../../lib/starforceWhatIf.mjs";
import { swapTotals } from "../../lib/swapItem.mjs";
import { EquipDetail } from "./Equipment.jsx";

/** 같은 사람의 같은 장비(프리셋마다 따로 저장된 것)는 한 줄만. */
const uniqueRows = (rows) => {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.worldName}/${row.characterName}/${row.item?.itemName}/${row.score}`;
    return !seen.has(key) && seen.add(key);
  });
};

const SCOPES = [
  { value: "item", label: "같은 아이템" },
  { value: "slot", label: "같은 부위" }
];
const ORDERS = [
  { value: "near", label: "바로 위부터" },
  { value: "best", label: "가장 좋은 순" }
];

/**
 * @param {{ item: any, rank: { slot?: string, family?: string, score: number } | null, ocid: string, majorStats: Record<string, any>, attackType: string, onClose: () => void }} props
 */
export function BetterItems({ item, rank, ocid, majorStats, attackType, onClose }) {
  const [scope, setScope] = useState(rank?.family ? "slot" : "item");
  const [order, setOrder] = useState("near");
  const [pages, setPages] = useState(1);
  const [state, setState] = useState(
    /** @type {{ status: "loading" | "ready" | "error", rows: any[], hasMore: boolean }} */ ({ status: "loading", rows: [], hasMore: false })
  );
  const [openKey, setOpenKey] = useState("");

  useEffect(() => setPages(1), [scope, order]);
  useEffect(() => {
    if (!rank?.slot) return undefined;
    let alive = true;
    const params = new URLSearchParams({ slot: rank.slot, above: String(rank.score), page: String(pages) });
    if (scope === "item") {
      params.set("name", item.itemName);
      params.set("exact", "1");
    } else if (rank.family) params.set("family", rank.family);
    if (order === "near") params.set("order", "near");
    if (ocid) params.set("not", ocid);
    if (pages === 1) setState({ status: "loading", rows: [], hasMore: false });
    getJson(`/api/v2/item-search?${params}`).then(
      ({ response, body }) => {
        if (!alive) return;
        if (!response.ok || !body?.ok) return setState((prev) => ({ ...prev, status: "error" }));
        setState((prev) => ({ status: "ready", rows: uniqueRows(pages === 1 ? body.rows : [...prev.rows, ...body.rows]), hasMore: Boolean(body.hasMore) }));
      },
      () => alive && setState((prev) => ({ ...prev, status: "error" }))
    );
    return () => {
      alive = false;
    };
  }, [scope, order, pages, rank?.slot, rank?.score]);

  // 바꿔 끼면 전투력: 같은 스타포스 세트끼리는 세트 합 차이도 더한다.
  const totals = useMemo(() => totalsFromStats(majorStats, attackType), [majorStats, attackType]);
  const mySet = useMemo(() => setOfItem(starforceSets, item), [item]);
  const setTotal = mySet ? currentSetTotals(majorStats)[mySet.label] : undefined;
  const gainOf = (/** @type {any} */ other) => {
    if (!totals) return null;
    const theirSet = setOfItem(starforceSets, other);
    let setDelta = {};
    if (mySet && theirSet && theirSet.id === mySet.id && Number.isFinite(setTotal)) {
      const stars = (Number(other.starforceUpgrade) || 0) - (Number(item.starforceUpgrade) || 0);
      setDelta = deltaToTotals(setChange(mySet, setTotal, stars * (item.slotName === "한벌옷" ? 2 : 1), starforceSets.cap), attackType);
    }
    const before = combatPower(totals);
    return before > 0 ? combatPower(swapTotals(totals, item, other, attackType, setDelta)) / before - 1 : null;
  };

  if (!rank?.slot) {
    return (
      <div class="better">
        <p class="better__note">이 장비는 아직 점수가 없어요.</p>
        <button type="button" class="btn btn--secondary btn--sm" onClick={onClose}>
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div class="better">
      <div class="better__head">
        <Segmented name="better-scope" legend="찾을 범위" value={scope} onChange={setScope} options={SCOPES} />
        <Segmented name="better-order" legend="순서" value={order} onChange={setOrder} options={ORDERS} />
        <button type="button" class="btn btn--ghost btn--sm" onClick={onClose}>
          <Icon name="x" size={16} />
          닫기
        </button>
      </div>
      {state.status === "loading" ? <p class="better__note">찾는 중…</p> : null}
      {state.status === "error" ? <p class="better__note">불러오지 못했어요.</p> : null}
      {state.status === "ready" && !state.rows.length ? <p class="better__note">이보다 좋은 장비가 없어요.</p> : null}
      {state.rows.length ? (
        <ol class="better__list">
          {state.rows.map((row) => {
            const other = row.item || {};
            const key = `${row.worldName}-${row.characterName}-${other.fingerprint || other.itemName}`;
            const gain = gainOf(other);
            const star = Number(other.starforceUpgrade) || 0;
            const open = openKey === key;
            return (
              <li key={key} class={`better__row${open ? " is-open" : ""}`}>
                <button type="button" class="better__main" aria-expanded={open ? "true" : "false"} onClick={() => setOpenKey(open ? "" : key)}>
                  {other.itemIcon ? <img src={other.itemIcon} alt="" width={36} height={36} loading="lazy" /> : <Icon name="medal" size={24} />}
                  <span class="better__text">
                    <strong>
                      {other.itemName}
                      {star ? <span class="num"> ★{star}</span> : null}
                    </strong>
                    <span>
                      {row.worldName} · {row.characterName}
                    </span>
                  </span>
                  <span class="better__nums num">
                    {gain !== null ? (
                      <strong class={gain > 1e-9 ? "is-up" : gain < -1e-9 ? "is-down" : ""}>
                        {gain >= 0 ? "+" : "-"}
                        {formatDecimal(Math.abs(gain) * 100, Math.abs(gain) < 0.01 ? 2 : 1)}%
                      </strong>
                    ) : null}
                    <span>템환산 +{formatDecimal(itemScoreDiff(rank.slot, row.score - rank.score), 1)}</span>
                  </span>
                </button>
                {open ? (
                  <div class="better__detail">
                    <a class="btn btn--secondary btn--sm" href={urls.character(row.worldName, row.characterName)}>
                      {row.characterName} 보러 가기
                      <Icon name="chevronRight" size={16} />
                    </a>
                    <EquipDetail item={other} profile={{ attackType: row.attackType, className: row.characterClass, jobName: row.characterClass }} compact />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
      {state.status === "ready" && state.hasMore ? (
        <button type="button" class="btn btn--secondary better__more" onClick={() => setPages(pages + 1)}>
          더 보기
        </button>
      ) : null}
    </div>
  );
}
