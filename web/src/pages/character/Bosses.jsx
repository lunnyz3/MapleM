// 보스 탭: 캐릭터 레벨·전투력(최근 24시간 최고)을 보스 입장 조건과 비교한다.
// 입장 가능 = 레벨 ≥ 입장 레벨 그리고 전투력 ≥ 입장 전투력. 권장 전투력을 넘으면 따로 표시한다.
import bossData from "../../../../src/game-data/boss-entry.json";
import { EmptyState } from "../../components/States.jsx";
import { combatPowerOf } from "../../lib/character.js";
import { formatKoreanUnits, toNumber } from "../../lib/format.js";

/** 1억 아래는 "455만", 위는 "1억 1,230만" */
const shortPower = (/** @type {number} */ value) => formatKoreanUnits(value, { maxGroups: value >= 1e8 ? 2 : 1 });

const DIFFICULTY_TONE = { 이지: "sky", 노말: "mint", 하드: "peach", 카오스: "lavender" };

/** @param {{ data: any }} props */
export function BossTab({ data }) {
  const power = combatPowerOf(data.profile?.combatPower).value;
  const level = toNumber(data.profile?.level);
  if (!power || !level) return <EmptyState compact title="전투력 정보가 없어 비교할 수 없어요" />;

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
      </div>
      <ul class="boss-list">
        {rows.map(({ boss, levelOk, powerOk, open, recommended }, index) => {
          const ratio = Math.min(1, power / boss.power);
          return (
            <li key={`${boss.name}-${boss.difficulty}`} class={`boss-row${open ? " is-open" : ""}`} style={{ "--stagger": Math.min(index, 12) }}>
              <span class="boss-row__name">
                {boss.name}
                <span class={`boss-diff tone-${DIFFICULTY_TONE[boss.difficulty] || "sky"}`}>{boss.difficulty}</span>
              </span>
              <span class="boss-row__need num">
                <span class={levelOk ? "" : "is-short"}>Lv.{boss.level}</span>
                <span class={powerOk ? "" : "is-short"}>{shortPower(boss.power)}</span>
              </span>
              <span class="boss-row__bar" aria-hidden="true">
                <span style={{ width: `${Math.round(ratio * 100)}%` }} />
              </span>
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
