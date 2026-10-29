// 큐브·불꽃 어디에 쓸까: 보스 세팅 장비마다 큐브(또는 지금 불꽃)를 한 번 썼을 때 지금보다 좋아질 확률과 좋아지면 평균
// 전투력 상승을 굴려서 구하고, 한 개당 기대 상승이 큰 순서로 보여 준다(블랙 큐브는 좋아질 때만 바꾼다고 본다).
import { useEffect, useMemo, useState } from "preact/hooks";
import { Segmented } from "../../components/Tabs.jsx";
import { SkeletonList } from "../../components/Skeleton.jsx";
import { CUBES, cubeEfficiency, rollCube, rollFlame } from "../../lib/cubeSim.mjs";
import { combatPower, totalsFromStats } from "../../lib/efficiency.js";
import { formatComma, formatDecimal } from "../../lib/format.js";
import { rollTables } from "../../lib/share.js";
import { applyLineChanges } from "../../lib/whatIf.mjs";

const KINDS = [
  { value: "potential", label: "블랙 큐브", field: "potentialOption" },
  { value: "additionalPotential", label: "에디셔널 큐브", field: "additionalPotentialOption" },
  { value: "additional", label: "불꽃", field: "additionalOption" }
];
const SAMPLES = 2000;
const SHOWN = 8;

/** @param {any[]} options */
const linesOf = (options) =>
  (Array.isArray(options) ? options : []).map((option) => ({
    name: String(option?.optionName ?? option?.name ?? option?.option_name ?? ""),
    value: String(option?.optionValue ?? option?.value ?? option?.option_value ?? "")
  }));

const pct = (/** @type {number} */ ratio) => (ratio * 100 < 0.001 ? "+0.001% 미만" : `+${formatDecimal(ratio * 100, ratio < 0.001 ? 3 : 2)}%`);

/**
 * @param {{ items: any[], majorStats: Record<string, any>, attackType: string }} props
 */
export function CubeAdvice({ items, majorStats, attackType }) {
  const [kind, setKind] = useState("potential");
  const [rows, setRows] = useState(/** @type {any[] | null} */ (null));
  const totals = useMemo(() => totalsFromStats(majorStats, attackType), [majorStats, attackType]);

  useEffect(() => {
    if (!totals || !items.length) return undefined;
    let alive = true;
    setRows(null);
    const meta = KINDS.find((entry) => entry.value === kind) || KINDS[0];
    const power = combatPower(totals);
    (async () => {
      const out = [];
      for (const item of items) {
        if (!alive) return;
        const tables = await rollTables(item);
        const current = linesOf(item?.[meta.field]);
        const ratioOf = (/** @type {any[]} */ lines) => combatPower(applyLineChanges(totals, current, lines, attackType)) / power;
        let roll = null;
        if (kind === "additional" && tables?.flame && current.length) roll = () => rollFlame(tables.flame);
        if (kind !== "additional" && tables?.[kind] && current.length) {
          const table = tables[kind];
          const rule = CUBES[kind === "potential" ? "black" : "additional"];
          roll = () => rollCube(table, table.grade, { lineCount: table.lineCount, gradeUp: rule.gradeUp }).lines;
        }
        if (!roll) continue;
        const result = cubeEfficiency({ roll, ratioOf, current, samples: SAMPLES });
        if (result.gainPerCube > 0) out.push({ item, ...result });
        // 장비 사이에 한 번씩 화면에 양보한다.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (alive) setRows(out.sort((a, b) => b.gainPerCube - a.gainPerCube).slice(0, SHOWN));
    })();
    return () => {
      alive = false;
    };
  }, [items, totals, kind, attackType]);

  if (!totals || !items.length) return null;

  return (
    <section class="sect cube-advice">
      <div class="cube-advice__head">
        <h3 class="sub-title">큐브·불꽃 어디에 쓸까</h3>
        <Segmented name="cube-advice-kind" legend="쓸 아이템" value={kind} onChange={setKind} options={KINDS.map(({ value, label }) => ({ value, label }))} />
      </div>
      {rows === null ? <SkeletonList rows={4} /> : null}
      {rows && !rows.length ? <p class="growth-note">써서 전투력이 오를 만한 장비가 없어요.</p> : null}
      {rows && rows.length ? (
        <ol class="cube-advice__list">
          {rows.map((row, index) => (
            <li key={row.item.fingerprint || `${row.item.slotName}-${index}`}>
              <span class="cube-advice__rank num">{index + 1}</span>
              <span class="cube-advice__who">
                <strong>{row.item.itemName}</strong>
                <span>
                  {row.item.slotName} · 좋아질 확률 {formatDecimal(row.chance * 100, row.chance < 0.01 ? 2 : 1)}% (평균 {formatComma(Math.ceil(row.cubes))}개)
                </span>
              </span>
              <span class="cube-advice__gain num">
                좋아지면 {pct(row.gainWhenBetter)}
                <small>1개당 {pct(row.gainPerCube)}</small>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <p class="growth-note">
        보스 세팅 장비마다 {formatComma(SAMPLES)}번 굴려 본 값이에요(공식 확률표). 좋아진 경우만 바꾼다고 보고, 한 개당 기대 전투력 상승이 큰 순서예요.
      </p>
    </section>
  );
}
