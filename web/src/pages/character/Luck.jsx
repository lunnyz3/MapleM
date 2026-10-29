// 장비 운빨 지수: 보이는 프리셋 장비의 잠재·에디·추옵이 그만큼 좋게 나올 확률로 점수를 매기고,
// 비슷한 전투력·전체 캐릭터 중 상위 %(src/game-data/luck.json, scripts/data/build-luck.js). 계산은 web/src/lib/luck.mjs.
import luckTable from "../../../../src/game-data/luck.json";
import { useEffect, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { Sheet } from "../../components/Sheet.jsx";
import { formatComma, formatDecimal } from "../../lib/format.js";
import { bandOf, itemLuck, topShare } from "../../lib/luck.mjs";
import { itemChances } from "../../lib/share.js";

const MIN_SECTIONS = 6;
const SECTION_LABELS = { potential: "잠재", additional: "에디", flame: "추옵" };

/** 상위 비율(0~1) → "12%", "0.35%", 아주 작으면 "1/52,000" */
function shareText(share) {
  const percent = share * 100;
  if (percent >= 10) return `${formatDecimal(percent, 0)}%`;
  if (percent >= 1) return `${formatDecimal(percent, 1)}%`;
  if (percent >= 0.01) return `${formatDecimal(percent, 2)}%`;
  return `1/${formatComma(Math.round(1 / Math.max(share, 1e-12)))}`;
}

/** @param {{ items: any[], profile: any, power: number | null }} props */
export function Luck({ items, profile, power }) {
  const [rows, setRows] = useState(/** @type {Array<{ item: any, luck: ReturnType<typeof itemLuck> }> | null} */ (null));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setRows(null);
    Promise.all(items.map((item) => itemChances(item, profile).then((chances) => ({ item, luck: itemLuck(chances) })))).then(
      (list) => alive && setRows(list.filter((row) => row.luck.sections > 0).sort((a, b) => b.luck.points - a.luck.points)),
      () => alive && setRows([])
    );
    return () => {
      alive = false;
    };
    // 빈 목록은 렌더마다 새 배열이라 null 로 묶는다.
  }, [items.length ? items : null, profile]);

  if (!rows) return null;
  const sections = rows.reduce((sum, row) => sum + row.luck.sections, 0);
  if (sections < MIN_SECTIONS) return null;
  const total = rows.reduce((sum, row) => sum + row.luck.points, 0);
  const band = power ? bandOf(luckTable.bands, power) : null;
  const peerTop = band ? topShare(total, band.quantiles) : null;
  const overallTop = topShare(total, luckTable.overall);
  const headline = peerTop ?? overallTop;
  const maxPoints = Math.max(1, ...rows.map((row) => row.luck.points));

  return (
    <>
      <button type="button" class={`eq-luck${headline !== null && headline <= 0.1 ? " is-lucky" : ""}`} onClick={() => setOpen(true)}>
        <Icon name="sparkle" size={16} />
        운빨 {headline !== null ? <strong class="num">상위 {shareText(Math.max(headline, 0.001))}</strong> : null}
      </button>
      <Sheet open={open} title="장비 운빨" onClose={() => setOpen(false)}>
        <div class="luck">
          <div class="luck__head">
            {peerTop !== null ? (
              <p class="luck__big">
                <span>비슷한 전투력 중</span>
                <strong class="display num">상위 {shareText(Math.max(peerTop, 0.001))}</strong>
              </p>
            ) : null}
            {overallTop !== null ? (
              <p class="luck__big is-sub">
                <span>전체</span>
                <strong class="display num">상위 {shareText(Math.max(overallTop, 0.001))}</strong>
              </p>
            ) : null}
            <p class="luck__big is-sub">
              <span>운 점수</span>
              <strong class="display num">{formatDecimal(total, 1)}</strong>
            </p>
          </div>
          <ol class="luck__list">
            {rows.map(({ item, luck }) => (
              <li key={`${item.slotName}-${item.itemName}`}>
                {item.itemIcon ? <img src={item.itemIcon} alt="" width={32} height={32} loading="lazy" decoding="async" /> : <span class="luck__icon" />}
                <span class="luck__name">
                  <strong>{item.itemName}</strong>
                  <span class="luck__parts">
                    {Object.entries(luck.parts).map(([key, value]) => (
                      <span key={key} class={value >= 2 ? "is-rare" : ""}>
                        {SECTION_LABELS[key]} {shareText(10 ** -value)}
                      </span>
                    ))}
                  </span>
                </span>
                <span class="luck__points num">{formatDecimal(luck.points, 1)}</span>
                <span class="luck__bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(2, (luck.points / maxPoints) * 100)}%` }} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </Sheet>
    </>
  );
}
