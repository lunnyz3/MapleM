// 장비 갈아타기 손익: 앱솔랩스 → 아케인셰이드(같은 부위), 아케인셰이드 무기 → 제네시스 무기로 바꿀 때 새 장비가 몇 성·어느
// 잠재부터 지금보다 나은지(보스 세팅 전투력). 앱솔랩스는 칸을 더 골라 두세 칸을 같이 바꿔 볼 수 있다(아케인 2세트).
// 계산은 web/src/lib/gearSwitch.mjs, 잠재 수준은 GET /api/v2/item-levels(모은 장비 잠재+에디 점수 하위 25%·중간·상위 25%).
import starforceSets from "../../../../src/game-data/starforce-sets.json";
import characterBase from "../../../../src/game-data/character-base.json";
import { useEffect, useMemo, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { getJson } from "../../lib/api.js";
import { gradeInfo } from "../../lib/character.js";
import { combatPower, totalsFromStats } from "../../lib/efficiency.js";
import { formatComma, formatDecimal, formatKoreanUnits } from "../../lib/format.js";
import { ARCANE, NO_POTENTIAL, breakEven, headlineRow, levelSlot, starCost, switchRatio, switchTargets, upgradeFamily } from "../../lib/gearSwitch.mjs";
import { withRo } from "../../lib/upgradePlan.mjs";

/** 처음 고른 칸 말고 같이 바꿀 수 있는 칸 수(모두 세 칸까지) */
const MAX_EXTRA = 2;
const COUNT_WORD = ["", "", "두", "세"];

/** @type {Map<string, Promise<any[]>>} 잠재 수준(계열·부위·공격 타입마다 한 번) */
const levelCache = new Map();

/** @param {string} family @param {string} slot @param {string} attackType @returns {Promise<any[]>} 하위 25%·중간·상위 25%, 모르면 [] */
function loadLevels(family, slot, attackType) {
  const key = `${family}|${slot}|${attackType}`;
  if (!levelCache.has(key)) {
    const params = new URLSearchParams({ family, slot, attack: attackType });
    levelCache.set(
      key,
      getJson(`/api/v2/item-levels?${params}`).then(
        ({ response, body }) => (response.ok && body?.ok && Array.isArray(body.levels) && body.levels.length === 3 ? body.levels : []),
        () => []
      )
    );
  }
  return /** @type {Promise<any[]>} */ (levelCache.get(key));
}

/** @type {Promise<any> | null} */
let tablesPromise = null;
/** 아이템 DB·세트·강화 표(시트를 처음 열 때 한 번 내려받는다) */
function loadTables() {
  if (!tablesPromise) {
    tablesPromise = Promise.all([
      import("../../../../src/game-data/item-db.json"),
      import("../../../../src/game-data/item-sets.json"),
      import("../../../../src/game-data/enhance.json")
    ]).then(
      ([db, itemSets, enhance]) => ({
        db: db.default || db,
        itemSets: itemSets.default || itemSets,
        enhance: enhance.default || enhance,
        starforceSets,
        characterBase
      }),
      (error) => {
        tablesPromise = null;
        throw error;
      }
    );
  }
  return tablesPromise;
}

/** +1.6% · -2.1% · ±0% */
function signed(ratio) {
  const value = ratio * 100;
  if (Math.abs(value) < 0.005) return "±0%";
  return `${value > 0 ? "+" : "-"}${formatDecimal(Math.abs(value), Math.abs(value) < 1 ? 2 : 1)}%`;
}

const tone = (ratio) => (ratio > 0.00005 ? "is-up" : ratio < -0.00005 ? "is-down" : "");
/** ★0부터 평균 4.3회, 여러 칸이면 "(두 칸 합)"(강화가 없으면 "") */
const costText = (start, tries, count = 1) =>
  tries > 0
    ? `★${start}부터 평균 ${tries < 10 ? formatDecimal(tries, 1) : formatComma(Math.round(tries))}회${count >= 2 ? `(${COUNT_WORD[count]} 칸 합)` : ""}`
    : "";
const levelName = (key, label) => (key === "none" ? "잠재 없음" : `잠재 ${label}`);
const starOf = (item) => Math.max(0, Number(item?.starforceUpgrade) || 0);

/** 대표 장비의 잠재·에디 등급 아이콘 */
function Grades({ level }) {
  if (!level || level.key === "none") return null;
  return [level.potentialGrade, level.additionalPotentialGrade].map((grade, index) => {
    const info = gradeInfo(grade);
    return info ? (
      <img
        key={index}
        src={info.icon}
        alt={`${index ? "에디" : "잠재"} ${info.label}`}
        title={`${index ? "에디" : "잠재"} ${info.label}`}
        width={14}
        height={14}
      />
    ) : null;
  });
}

/**
 * 그 별 아래도 재 봤는지(아케인셰이드는 ★0부터 잰다). 무기는 아이템 DB 표에 있는 별만 재므로 표의 첫 별에서 넘으면 그보다 낮은
 * 별에서도 넘는지 모른다 → '부터'를 쓰지 않는다. 제네시스는 받은 별 그대로라 '부터'가 없다.
 * @param {NonNullable<ReturnType<typeof breakEven>>} result @param {number} star @param {number} start
 */
const fromStar = (result, star, start) => star > result.stars[0] || (result.stars[0] === start && !result.genesis);

/**
 * 한 줄 결론과 덧붙임(세트 보정·아케인 세트·해방).
 * @param {NonNullable<ReturnType<typeof breakEven>>} result @param {number} count @param {boolean} hasLevels @param {number} start
 */
function verdictOf(result, count, hasLevels, start) {
  const row = headlineRow(result);
  const all = count >= 2 ? `${COUNT_WORD[count]} 칸 모두 ` : "";
  const notes = [];
  if (result.genesis) notes.push("해방 최종 대미지 +10% 포함");
  else if (result.sets.arcaneOn) notes.push(`아케인 2세트가 켜지고 앱솔 ${result.sets.before.absolab || 0}→${result.sets.after.absolab || 0}세트`);
  else if (result.sets.borrowed && result.sets.replaced === 1) notes.push("1칸만 바꾸면 보정으로 세트 손해 없음");
  if (!row) {
    const top = result.stars[result.stars.length - 1];
    return { text: `${all}★${top}${hasLevels ? " · 잠재 상위 25%" : ""}로도 손해`, tone: "is-down", notes };
  }
  const { star } = row.found;
  const none = row.key === "none";
  let text;
  if (result.genesis && star === result.stars[0]) text = none ? "잠재 없이 바로 껴도 이득" : `잠재 ${row.label}부터 바로 이득`;
  else if (fromStar(result, star, start)) text = none ? `${all}잠재 없어도 ★${star}부터 이득` : `${all}★${star} + 잠재 ${row.label}부터 이득`;
  // 표의 첫 별에서 넘었으면 더 낮은 별은 모른다(숫자 뒤 조사를 피해 '에서'·'이면')
  else text = none ? `${all}잠재 없이 ★${star}에서 이득` : `${all}★${star} + 잠재 ${row.label}이면 이득`;
  // 그 조합까지의 강화 기대 횟수를 결론 바로 아래에
  const cost = costText(start, row.found.tries, count);
  return { text, tone: "is-up", notes: cost ? [cost, ...notes] : notes };
}

/**
 * @param {{ item: any, items: any[], majorStats: Record<string, any>, attackType: string, basePower?: number | null, onClose: () => void }} props
 *   items: 보스 세팅 장비 프리셋(세트 효과를 다시 셀 때 쓴다)
 */
export function GearSwitch({ item, items, majorStats, attackType, basePower = null, onClose }) {
  const family = upgradeFamily(item);
  // 같이 바꿀 수 있는 칸: 같은 프리셋의 다른 앱솔랩스 장비(제네시스는 무기 한 칸뿐)
  const others = useMemo(() => (family === ARCANE ? items.filter((other) => other !== item && upgradeFamily(other) === ARCANE) : []), [items, item, family]);
  const [extra, setExtra] = useState(/** @type {any[]} */ ([]));
  const picked = useMemo(() => [item, ...others.filter((other) => extra.includes(other))], [item, others, extra]);
  const [tables, setTables] = useState(/** @type {any} */ (null));
  const [tableError, setTableError] = useState(false);
  const [levelMap, setLevelMap] = useState(/** @type {Record<string, any[]>} */ ({}));
  const [probe, setProbe] = useState(/** @type {{ star: number, rank: number } | null} */ (null));

  useEffect(() => {
    let alive = true;
    loadTables().then(
      (value) => alive && setTables(value),
      () => alive && setTableError(true)
    );
    return () => {
      alive = false;
    };
  }, []);

  const keys = picked.map((entry) => `${upgradeFamily(entry)}|${levelSlot(entry)}|${attackType}`);
  useEffect(() => {
    let alive = true;
    Promise.all(picked.map((entry) => loadLevels(upgradeFamily(entry), levelSlot(entry), attackType))).then((lists) => {
      if (!alive) return;
      setLevelMap((prev) => ({ ...prev, ...Object.fromEntries(keys.map((key, index) => [key, lists[index]])) }));
    });
    return () => {
      alive = false;
    };
  }, [keys.join(",")]);

  const totals = useMemo(() => totalsFromStats(majorStats, attackType), [majorStats, attackType]);
  const ready = Boolean(tables) && keys.every((key) => key in levelMap);
  const targets = useMemo(() => (tables ? switchTargets(tables.db, picked) : []), [tables, picked]);
  const levels = keys.map((key) => levelMap[key] || []);
  const hasLevels = levels.every((list) => list.length === 3);
  const result = useMemo(
    () =>
      ready && totals && targets.length && targets.every((target) => target.stars.length)
        ? breakEven({ totals, items, targets, levels, attackType, tables, combatPower })
        : null,
    [ready, totals, targets, levelMap, attackType, items, tables]
  );

  // 직접 보기: 고른 별·잠재 수준(처음엔 결론 행, 못 넘으면 가장 높은 별·가장 높은 수준)
  useEffect(() => setProbe(null), [picked]);
  const headline = result ? headlineRow(result) : null;
  const ladder = result ? [NO_POTENTIAL, ...(hasLevels ? levels[0] : [])] : [];
  const pick =
    probe ||
    (result
      ? { star: headline ? headline.found.star : result.stars[result.stars.length - 1], rank: headline ? result.rows.indexOf(headline) : ladder.length - 1 }
      : null);
  const probed = useMemo(() => {
    if (!result || !pick || !result.stars.includes(pick.star)) return null;
    const levelOf = (index) => (pick.rank === 0 ? NO_POTENTIAL : levels[index][pick.rank - 1]);
    const ratio = switchRatio({
      totals,
      items,
      swaps: targets.map((target, index) => ({ target, star: pick.star, level: levelOf(index) })),
      attackType,
      tables,
      combatPower
    });
    return ratio === null ? null : { ratio, ...starCost(targets, pick.star, tables.enhance) };
  }, [result, pick?.star, pick?.rank]);

  const start = targets[0]?.start ?? 0;
  const verdict = result ? verdictOf(result, targets.length, hasLevels, start) : null;
  const toggle = (other) => setExtra(extra.includes(other) ? extra.filter((entry) => entry !== other) : [...extra, other]);
  const targetName = targets[0]?.name || `${family} ${levelSlot(item)}`;

  return (
    <div class="gswitch">
      <div class="gswitch__head">
        <p class="gswitch__route">
          <Icon name="arrowRight" size={14} />
          <span>
            <strong>{targetName}</strong>
            {withRo(targetName).slice(targetName.length)} 바꾸면
          </span>
        </p>
        <button type="button" class="btn btn--ghost btn--sm" onClick={onClose}>
          <Icon name="x" size={16} />
          닫기
        </button>
      </div>

      {others.length ? (
        <div class="gswitch__with" role="group" aria-label="같이 바꿀 칸">
          <span class="gswitch__with-label">같이 바꾸기</span>
          {others.map((other) => {
            const on = extra.includes(other);
            return (
              <button
                key={`${other.slotName}-${other.itemName}`}
                type="button"
                class={`btn btn--sm ${on ? "btn--primary" : "btn--secondary"}`}
                aria-pressed={on ? "true" : "false"}
                disabled={!on && extra.length >= MAX_EXTRA}
                onClick={() => toggle(other)}
              >
                {other.slotName}
                {starOf(other) ? <span class="num"> ★{starOf(other)}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {tableError ? <p class="gswitch__note">표를 불러오지 못했어요.</p> : null}
      {!tableError && !ready ? <p class="gswitch__note">재는 중…</p> : null}
      {ready && !totals ? <p class="gswitch__note">스탯이 없어 잴 수 없어요.</p> : null}
      {ready && totals && !result ? <p class="gswitch__note">새 무기 공격력 표가 없어 잴 수 없어요.</p> : null}

      {result && verdict ? (
        <>
          <div class={`gswitch__verdict ${verdict.tone}`} role="status" aria-live="polite">
            <strong>{verdict.text}</strong>
            {verdict.notes.length ? <span>{verdict.notes.join(" · ")}</span> : null}
          </div>

          <div class="gswitch__quick">
            {result.lowest ? (
              <div class="gswitch__tile">
                <span>
                  {result.lowest.star === start ? "바로 끼면 " : ""}
                  <b class="num">★{result.lowest.star}</b> · 잠재 없음
                </span>
                <strong class={`num ${tone(result.lowest.ratio)}`}>{signed(result.lowest.ratio)}</strong>
              </div>
            ) : null}
            {result.transfer ? (
              <div class="gswitch__tile">
                <span>
                  전수하면 <b class="num">★{result.transfer.stars.join("·")}</b> 그대로
                </span>
                <strong class={`num ${tone(result.transfer.ratio)}`}>{signed(result.transfer.ratio)}</strong>
              </div>
            ) : result.genesis ? (
              <div class="gswitch__tile">
                <span>제네시스 무기</span>
                <strong>전수 불가</strong>
              </div>
            ) : null}
          </div>

          <ol class="gswitch__rows" aria-label="잠재 수준별 이득 시작">
            {result.rows.map((row, rank) => {
              const chosen = pick?.rank === rank && (row.found ? pick.star === row.found.star : false);
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    class={`gswitch__row${chosen ? " is-pick" : ""}`}
                    aria-pressed={chosen ? "true" : "false"}
                    onClick={() => setProbe({ star: row.found ? row.found.star : result.stars[result.stars.length - 1], rank })}
                  >
                    <span
                      class="gswitch__level"
                      title={row.key === "none" ? undefined : `모은 ${targetName.split(" ")[0]} ${levelSlot(item)} 장비의 잠재+에디 점수 ${row.label}`}
                    >
                      {levelName(row.key, row.label)}
                      <Grades level={row.grades[0]} />
                    </span>
                    {row.found ? (
                      <>
                        <strong class="gswitch__star num">
                          ★{row.found.star}
                          {fromStar(result, row.found.star, start) ? "부터" : ""}
                        </strong>
                        <strong class={`gswitch__gain num ${tone(row.found.ratio)}`}>{signed(row.found.ratio)}</strong>
                        <span class="gswitch__cost num">{costText(start, row.found.tries, targets.length)}</span>
                      </>
                    ) : (
                      <>
                        <strong class="gswitch__star">손해</strong>
                        <strong class={`gswitch__gain num ${tone(row.top?.ratio ?? 0)}`}>{row.top ? signed(row.top.ratio) : "-"}</strong>
                        <span class="gswitch__cost num">{row.top ? `★${row.top.star}여도` : ""}</span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>

          {pick ? (
            <div class="gswitch__probe">
              <span class="select select--sm">
                <select
                  aria-label="새 장비 스타포스"
                  value={pick.star}
                  onChange={(event) => setProbe({ ...pick, star: Number(/** @type {HTMLSelectElement} */ (event.currentTarget).value) })}
                >
                  {result.stars.map((star) => (
                    <option key={star} value={star}>
                      ★{star}
                    </option>
                  ))}
                </select>
                <Icon name="chevronDown" size={16} class="select__icon" />
              </span>
              <span class="select select--sm">
                <select
                  aria-label="새 장비 잠재 수준"
                  value={pick.rank}
                  onChange={(event) => setProbe({ ...pick, rank: Number(/** @type {HTMLSelectElement} */ (event.currentTarget).value) })}
                >
                  {ladder.map((level, rank) => (
                    <option key={level.key} value={rank}>
                      {levelName(level.key, level.label)}
                    </option>
                  ))}
                </select>
                <Icon name="chevronDown" size={16} class="select__icon" />
              </span>
              {probed ? (
                <span class="gswitch__probe-result">
                  <strong class={`num ${tone(probed.ratio)}`}>{signed(probed.ratio)}</strong>
                  {basePower && Math.abs(basePower * probed.ratio) >= 1 ? (
                    <span class="num">
                      {probed.ratio >= 0 ? "+" : "-"}
                      {formatKoreanUnits(Math.abs(Math.round(basePower * probed.ratio)), { maxGroups: Math.abs(basePower * probed.ratio) >= 1e8 ? 2 : 1 })}
                    </span>
                  ) : null}
                  {probed.tries > 0 ? <span class="num">{costText(start, probed.tries, targets.length)}</span> : null}
                </span>
              ) : null}
            </div>
          ) : null}

          <p class="gswitch__note">
            {[
              hasLevels ? "" : "잠재 분포를 불러오지 못해 잠재 없음만 쟀어요",
              result.rows.some((row) => row.found?.tries > 0) ? "강화 횟수는 하락·파괴 방지권 사용" : "",
              "추가 옵션·소울·문장은 지금 그대로"
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </>
      ) : null}
    </div>
  );
}
