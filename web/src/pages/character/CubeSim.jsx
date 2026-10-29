// 큐브 돌려 보기: 이 장비의 공식 확률표로 잠재(블랙·레드 큐브)·에디셔널(에디셔널 큐브)·추가 옵션(지금 불꽃)을 굴려 본다.
// 사용한 개수, 보스 세팅 전투력 증감, 지금 옵션의 상위 %를 보여 준다. 블랙 큐브는 새 옵션과 이전 옵션 중 고른다.
import { useEffect, useMemo, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { Segmented } from "../../components/Tabs.jsx";
import { CUBES, rollCube, rollFlame } from "../../lib/cubeSim.mjs";
import { combatPower, totalsFromStats } from "../../lib/efficiency.js";
import { formatComma, formatDecimal, formatKoreanUnits } from "../../lib/format.js";
import { rollTables, simulatedTop } from "../../lib/share.js";
import { applyLineChanges } from "../../lib/whatIf.mjs";

const SECTIONS = [
  { key: "potential", field: "potentialOption", gradeField: "potentialGrade", label: "잠재능력" },
  { key: "additionalPotential", field: "additionalPotentialOption", gradeField: "additionalPotentialGrade", label: "에디셔널" },
  { key: "additional", field: "additionalOption", gradeField: "", label: "추가 옵션" }
];
const UNTIL_LIMIT = 10000;

/** @param {any[]} options */
const linesOf = (options) =>
  (Array.isArray(options) ? options : []).map((option) => ({
    name: String(option?.optionName ?? option?.name ?? option?.option_name ?? ""),
    value: String(option?.optionValue ?? option?.value ?? option?.option_value ?? "")
  }));

/**
 * @param {{ item: any, profile: any, majorStats: Record<string, any>, attackType: string, basePower?: number | null, onClose: () => void }} props
 */
export function CubeSim({ item, profile, majorStats, attackType, basePower = null, onClose }) {
  const [tables, setTables] = useState(/** @type {any} */ (undefined));
  const [section, setSection] = useState("potential");
  const [cube, setCube] = useState("black");
  const [states, setStates] = useState(/** @type {Record<string, { grade: string, lines: any[], pending: any, used: number, upgrades: number }>} */ ({}));
  const [top, setTop] = useState("");

  useEffect(() => {
    let alive = true;
    rollTables(item).then((value) => {
      if (!alive) return;
      setTables(value || null);
      const available = SECTIONS.filter((entry) => (entry.key === "additional" ? value?.flame : value?.[entry.key]));
      if (available.length) setSection(available[0].key);
    });
    return () => {
      alive = false;
    };
  }, [item]);

  const available = SECTIONS.filter((entry) => (entry.key === "additional" ? tables?.flame : tables?.[entry.key]));
  const meta = SECTIONS.find((entry) => entry.key === section) || SECTIONS[0];
  const original = useMemo(() => linesOf(item?.[meta.field]), [item, meta.field]);
  const table = section === "additional" ? null : tables?.[section];
  const state = states[section] || { grade: table?.grade || "", lines: original, pending: null, used: 0, upgrades: 0 };
  const cubeKey = section === "potential" ? cube : "additional";
  const cubeRule = CUBES[cubeKey];

  const totals = useMemo(() => totalsFromStats(majorStats, attackType), [majorStats, attackType]);
  const ratioOf = (/** @type {any[]} */ lines) => {
    if (!totals) return 1;
    const before = combatPower(totals);
    return before > 0 ? combatPower(applyLineChanges(totals, original, lines, attackType)) / before : 1;
  };
  const percent = (ratioOf(state.lines) - 1) * 100;
  const gain = basePower ? basePower * (ratioOf(state.lines) - 1) : null;

  // 지금 옵션의 상위 %(마스터리 정보 없이: 새로 굴린 값은 표 그대로)
  useEffect(() => {
    let alive = true;
    const simulated = { ...item, masteryInfo: null, [meta.field]: state.lines.map((line) => ({ name: line.name, value: line.value })) };
    if (meta.gradeField && state.grade) simulated[meta.gradeField] = state.grade;
    simulatedTop(simulated, profile, /** @type {any} */ (section)).then((value) => alive && setTop(value));
    return () => {
      alive = false;
    };
  }, [state.lines, state.grade, section]);

  const save = (/** @type {any} */ next) => setStates({ ...states, [section]: next });

  /** 한 번 굴린 결과. */
  const rollOnce = (/** @type {{ grade: string, lines: any[] }} */ current) => {
    if (section === "additional") return { grade: "", lines: rollFlame(tables.flame), gradeUp: false };
    return rollCube(table, current.grade, { lineCount: table.lineCount, gradeUp: cubeRule.gradeUp });
  };

  /** @param {number} times @param {boolean} untilBetter */
  const run = (times, untilBetter = false) => {
    let current = { ...state, pending: null };
    const target = ratioOf(original);
    for (let i = 0; i < times; i += 1) {
      const result = rollOnce(current);
      current.used += 1;
      if (result.gradeUp) current.upgrades += 1;
      if (cubeRule && cubeRule.choose && section !== "additional") {
        // 블랙 큐브: 한 번이면 고르게 두고, 여러 번이면 전투력이 높은 쪽을 남긴다(등급은 오르면 유지).
        if (times === 1 && !untilBetter) {
          current = { ...current, pending: result };
          break;
        }
        const keepNew = ratioOf(result.lines) > ratioOf(current.lines) || result.grade !== current.grade;
        current = keepNew ? { ...current, grade: result.grade, lines: result.lines } : current;
      } else {
        current = { ...current, grade: result.grade || current.grade, lines: result.lines };
      }
      if (untilBetter && ratioOf(current.lines) > target + 1e-12) break;
    }
    save(current);
  };

  const choose = (/** @type {boolean} */ takeNew) => {
    if (!state.pending) return;
    save(takeNew ? { ...state, grade: state.pending.grade, lines: state.pending.lines, pending: null } : { ...state, pending: null });
  };

  if (tables === undefined) return <p class="whatif__loading">확률표를 불러오는 중…</p>;
  if (!available.length)
    return (
      <div class="whatif">
        <p class="whatif__loading">이 장비는 공식 확률표가 없어 돌려 볼 수 없어요.</p>
        <button type="button" class="btn btn--secondary btn--sm" onClick={onClose}>
          돌아가기
        </button>
      </div>
    );

  const unit = section === "additional" ? `${tables.flame.flameName}` : cubeRule.label;

  return (
    <div class="whatif cubesim">
      <div class={`whatif__bar${percent > 1e-9 ? " is-up" : percent < -1e-9 ? " is-down" : ""}`} role="status" aria-live="polite">
        <span class="whatif__label">체험 전투력</span>
        <strong class="display num">
          {percent >= 0 ? "+" : ""}
          {formatDecimal(percent, Math.abs(percent) < 1 ? 3 : 2)}%
        </strong>
        {gain !== null && Math.abs(gain) >= 1 ? (
          <span class="whatif__abs num">
            {gain >= 0 ? "+" : "-"}
            {formatKoreanUnits(Math.abs(Math.round(gain)), { maxGroups: Math.abs(gain) >= 1e8 ? 2 : 1 })}
          </span>
        ) : null}
        <span class="whatif__actions">
          <button type="button" class="btn btn--ghost btn--sm" disabled={!states[section]} onClick={() => setStates({ ...states, [section]: undefined })}>
            <Icon name="refresh" size={16} />
            처음으로
          </button>
          <button type="button" class="btn btn--secondary btn--sm" onClick={onClose}>
            끝내기
          </button>
        </span>
      </div>

      {available.length > 1 ? (
        <Segmented
          name="cubesim-section"
          legend="돌릴 옵션"
          value={section}
          onChange={setSection}
          options={available.map((entry) => ({ value: entry.key, label: entry.label }))}
        />
      ) : null}
      {section === "potential" ? (
        <Segmented
          name="cubesim-cube"
          legend="큐브"
          value={cube}
          onChange={setCube}
          options={[
            { value: "black", label: "블랙 큐브" },
            { value: "red", label: "레드 큐브" }
          ]}
        />
      ) : null}

      <section class="cubesim__now">
        <header class="cubesim__head">
          <h4 class="whatif__title">
            지금 {meta.label} {state.grade ? <span class="badge">{state.grade}</span> : null}
          </h4>
          <span class="cubesim__stat num">
            {unit} {formatComma(state.used)}개{state.upgrades ? ` · 등급 상승 ${formatComma(state.upgrades)}번` : ""}
            {top ? ` · 상위 ${top}` : ""}
          </span>
        </header>
        <ul class="cubesim__lines">
          {state.lines.map((line, index) => (
            <li key={index}>
              <span>{line.name}</span>
              <strong class="num">{line.value}</strong>
            </li>
          ))}
        </ul>
      </section>

      {state.pending ? (
        <section class="cubesim__pending" aria-label="새 옵션">
          <h4 class="whatif__title">
            새 옵션 {state.pending.grade ? <span class="badge">{state.pending.grade}</span> : null}
            {state.pending.gradeUp ? <span class="cubesim__up">등급 상승!</span> : null}
          </h4>
          <ul class="cubesim__lines">
            {state.pending.lines.map((line, index) => (
              <li key={index}>
                <span>{line.name}</span>
                <strong class="num">{line.value}</strong>
              </li>
            ))}
          </ul>
          <div class="cubesim__choose">
            <button type="button" class="btn btn--primary btn--sm" onClick={() => choose(true)}>
              새 옵션 적용
            </button>
            <button type="button" class="btn btn--secondary btn--sm" onClick={() => choose(false)}>
              이전 옵션 유지
            </button>
          </div>
        </section>
      ) : null}

      <div class="cubesim__rolls">
        <button type="button" class="btn btn--primary btn--sm" onClick={() => run(1)}>
          <Icon name="sparkle" size={16} />
          1번
        </button>
        <button type="button" class="btn btn--secondary btn--sm" onClick={() => run(10)}>
          10번
        </button>
        <button type="button" class="btn btn--secondary btn--sm" onClick={() => run(UNTIL_LIMIT, true)}>
          처음보다 좋아질 때까지
        </button>
      </div>
      <p class="cubesim__note">
        줄마다 넥슨 공식 확률표대로 뽑아요. 등급 상승은 블랙 큐브 2%, 레드·에디셔널 큐브 1%로 계산해요. 여러 번 돌릴 때 블랙 큐브는 전투력이 더 높은 쪽을
        남겨요(최대 {formatComma(UNTIL_LIMIT)}번).
      </p>
    </div>
  );
}
