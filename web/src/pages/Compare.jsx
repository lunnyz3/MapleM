// 캐릭터 비교(/compare?a=월드/이름&b=월드/이름): 두 캐릭터의 보스 세팅 주요 스탯·전투력과
// 보스 세팅 장비를 부위별 템환산 점수로 나란히 놓는다. 주소만으로 같은 비교를 다시 볼 수 있다.
import "../styles/compare.css";
import { useEffect, useMemo, useState } from "preact/hooks";
import { Avatar } from "../components/Avatar.jsx";
import { Icon } from "../components/Icon.jsx";
import { Aurora, Reveal, SplitText } from "../components/Motion.jsx";
import { Skeleton } from "../components/Skeleton.jsx";
import { WorldIcon } from "../components/GameIcons.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { SLOT_LAYOUT, combatPowerOf, formatStat, formatStatDelta, gradeInfo, presetByNo, slotKey, starforce } from "../lib/character.js";
import { loadCharacterPage } from "../lib/data.js";
import { formatComma, formatKoreanUnits } from "../lib/format.js";
import { DEFAULT_WORLD, WORLDS, urls } from "../lib/game.js";
import { loadItemRanks } from "../lib/itemRanks.js";
import { itemScoreText, setScoreText } from "../lib/itemScore.js";

/** @typedef {{ world: string, name: string }} Who */

/** "스카니아/디올" → { world, name } · 잘못된 값이면 빈 이름 */
function parseWho(value) {
  const [world = "", ...rest] = String(value || "").split("/");
  const name = rest.join("/").trim().slice(0, 24);
  return { world: WORLDS.includes(world) ? world : DEFAULT_WORLD, name };
}

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  return { a: parseWho(params.get("a")), b: parseWho(params.get("b")) };
}

/** @param {Who} a @param {Who} b */
function compareUrl(a, b) {
  const params = new URLSearchParams();
  if (a.name) params.set("a", `${a.world}/${a.name}`);
  if (b.name) params.set("b", `${b.world}/${b.name}`);
  return `/compare?${params}`;
}

/** 비교할 주요 스탯(공격 타입별로 자기 쪽 값). */
const STAT_ROWS = [
  { id: "attack", label: "공격력", keys: ["physicalAttack", "magicalAttack"] },
  { id: "attackPercent", label: "공격력 %", keys: ["physicalAttackPercent", "magicalAttackPercent"] },
  { id: "damage", label: "대미지", keys: ["physicalDamagePercent", "magicalDamagePercent"] },
  { id: "boss", label: "보스 공격력", keys: ["bossDamage"] },
  { id: "critical", label: "치명타 피해", keys: ["criticalDamage"] },
  { id: "final", label: "최종 대미지", keys: ["finalDamage"] },
  { id: "maxDamage", label: "최대 대미지", keys: ["maxDamage"] },
  { id: "ignore", label: "방어율 무시", keys: ["ignoreDefense"] }
];

/**
 * 캐릭터 하나: page-data + 장비 점수.
 * @param {Who} who
 */
async function loadSide(who) {
  const data = await loadCharacterPage(who.world, who.name);
  const ranks = await loadItemRanks(data.ocid);
  const tab = data.tabs?.equipment;
  const bossNo = data.profile?.statSetting?.dimensions?.find((dim) => dim.key === "equipment")?.boss ?? tab?.activePresetNo ?? null;
  const preset = presetByNo(tab, bossNo);
  const items = Array.isArray(preset?.data?.itemEquipment) ? preset.data.itemEquipment : [];
  /** @type {Record<string, { item: any, score: number | null }>} */
  const slots = {};
  for (const item of items) {
    const key = slotKey(item);
    if (!key || slots[key]) continue;
    const rank = ranks[item.fingerprint];
    slots[key] = { item, score: rank ? rank.score : null };
  }
  const total = Object.values(slots).reduce((sum, entry) => sum + (entry.score || 0), 0);
  return { data, slots, total };
}

/** @param {any} side @param {{ keys: string[] }} row */
function statOf(side, row) {
  const stats = side.data.profile?.majorStats || {};
  const magic = side.data.profile?.attackType === "magical";
  const key = row.keys.length === 2 ? row.keys[magic ? 1 : 0] : row.keys[0];
  const value = Number(stats[key]?.value);
  return { key, value: Number.isFinite(value) ? value : null };
}

/** @param {{ value: number }} props */
function Diff({ value, format }) {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-9) return <span class="cmp-diff is-even">=</span>;
  return <span class={`cmp-diff ${value > 0 ? "is-a" : "is-b"}`}>{value > 0 ? "◀" : "▶"} {format(Math.abs(value))}</span>;
}

/**
 * @param {{ who: Who, onChange: (who: Who) => void, side: "a" | "b" }} props
 */
function WhoInput({ who, onChange, side }) {
  return (
    <div class={`cmp-input cmp-input--${side}`}>
      <span class="select cmp-input__world">
        <select aria-label={`${side === "a" ? "왼쪽" : "오른쪽"} 캐릭터 월드`} value={who.world} onChange={(event) => onChange({ ...who, world: /** @type {HTMLSelectElement} */ (event.currentTarget).value })}>
          {WORLDS.map((world) => (
            <option key={world} value={world}>
              {world}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={18} class="select__icon" />
      </span>
      <input
        class="input"
        type="text"
        maxLength={24}
        autoComplete="off"
        spellcheck={false}
        aria-label={`${side === "a" ? "왼쪽" : "오른쪽"} 캐릭터 이름`}
        placeholder="캐릭터 이름"
        value={who.name}
        onInput={(event) => onChange({ ...who, name: /** @type {HTMLInputElement} */ (event.currentTarget).value })}
      />
    </div>
  );
}

/** @param {{ side: any }} props */
function SideHead({ side, align }) {
  const profile = side.data.profile || {};
  const world = side.data.query?.worldNameCanonical || "";
  const power = combatPowerOf(profile.combatPower).value;
  return (
    <a class={`cmp-head cmp-head--${align}`} href={urls.character(world, profile.name)}>
      <Avatar world={world} name={profile.name} src={profile.imageUrl} size={72} />
      <span class="cmp-head__text">
        <span class="cmp-head__name">
          <WorldIcon world={world} size={16} /> {profile.name}
        </span>
        <span class="cmp-head__meta">
          {profile.className} · Lv.{profile.level}
        </span>
        <span class="cmp-head__power num">{power ? `전투력 ${formatKoreanUnits(power)}` : ""}</span>
      </span>
    </a>
  );
}

export function Compare() {
  const initial = useMemo(readQuery, []);
  const [form, setForm] = useState(initial);
  const [query, setQuery] = useState(initial);
  const [state, setState] = useState(/** @type {{ status: "idle" | "loading" | "ready" | "error", a?: any, b?: any, error?: any }} */ ({ status: "idle" }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const onPop = () => {
      const next = readQuery();
      setForm(next);
      setQuery(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!query.a.name || !query.b.name) {
      setState({ status: "idle" });
      return undefined;
    }
    document.title = `${query.a.name} vs ${query.b.name} · 메이플M 플러스`;
    let alive = true;
    setState({ status: "loading" });
    Promise.all([loadSide(query.a), loadSide(query.b)]).then(
      ([a, b]) => alive && setState({ status: "ready", a, b }),
      (error) => alive && setState({ status: "error", error })
    );
    return () => {
      alive = false;
    };
  }, [query, attempt]);

  const onSubmit = (event) => {
    event.preventDefault();
    const next = { a: { ...form.a, name: form.a.name.replace(/\s+/g, "") }, b: { ...form.b, name: form.b.name.replace(/\s+/g, "") } };
    if (!next.a.name || !next.b.name) return;
    setForm(next);
    setQuery(next);
    const url = compareUrl(next.a, next.b);
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.pushState(null, "", url);
  };

  const { a, b } = state;
  const scoreDiff = a && b ? a.total - b.total : 0;

  return (
    <div class="cmp">
      <header class="page-head page-head--rank tone-lavender">
        <Aurora tone="sky" />
        <span class="page-head__icon" aria-hidden="true">
          <Icon name="swords" size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText text="캐릭터 비교" />
        </h1>
      </header>

      <form class="cmp-form card" onSubmit={onSubmit} aria-label="비교할 캐릭터">
        <WhoInput side="a" who={form.a} onChange={(who) => setForm({ ...form, a: who })} />
        <span class="cmp-form__vs display" aria-hidden="true">
          VS
        </span>
        <WhoInput side="b" who={form.b} onChange={(who) => setForm({ ...form, b: who })} />
        <button type="submit" class="btn btn--primary cmp-form__go" disabled={!form.a.name.trim() || !form.b.name.trim()}>
          <Icon name="swords" size={18} />
          비교하기
        </button>
      </form>

      {state.status === "idle" ? <EmptyState title="두 캐릭터를 넣어 주세요" /> : null}
      {state.status === "loading" ? (
        <div class="card cmp-loading" aria-busy="true">
          <Skeleton height={96} radius={18} />
          <Skeleton height={260} radius={18} />
          <span class="sr-only">두 캐릭터를 불러오는 중입니다.</span>
        </div>
      ) : null}
      {state.status === "error" ? (
        <ErrorState title="캐릭터를 불러오지 못했어요" description={state.error?.message} onRetry={() => setAttempt((n) => n + 1)} />
      ) : null}

      {state.status === "ready" && a && b ? (
        <>
          <Reveal class="cmp-heads card">
            <SideHead side={a} align="a" />
            <div class="cmp-heads__score">
              <span class="cmp-heads__label">템환산</span>
              <span class="cmp-heads__nums num">
                <strong class={scoreDiff > 0 ? "is-win" : ""}>{setScoreText(a.total)}</strong>
                <span class="cmp-heads__sep">:</span>
                <strong class={scoreDiff < 0 ? "is-win" : ""}>{setScoreText(b.total)}</strong>
              </span>
              <Diff value={scoreDiff} format={(n) => setScoreText(n)} />
            </div>
            <SideHead side={b} align="b" />
          </Reveal>

          <Reveal class="card cmp-section" delay={60}>
            <h2 class="cmp-section__title">주요 스탯 · 보스 세팅</h2>
            <table class="cmp-table">
              <tbody>
                {STAT_ROWS.map((row) => {
                  const left = statOf(a, row);
                  const right = statOf(b, row);
                  const diff = left.value !== null && right.value !== null ? left.value - right.value : NaN;
                  return (
                    <tr key={row.id}>
                      <td class={`cmp-cell num${diff > 0 ? " is-win" : ""}`}>{left.value === null ? "-" : formatStat(left.key, left.value)}</td>
                      <th scope="row" class="cmp-label">
                        {row.label}
                        <Diff value={diff} format={(n) => formatStatDelta(left.key, n).replace(/^\+/, "")} />
                      </th>
                      <td class={`cmp-cell cmp-cell--b num${diff < 0 ? " is-win" : ""}`}>{right.value === null ? "-" : formatStat(right.key, right.value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Reveal>

          <Reveal class="card cmp-section" delay={120}>
            <h2 class="cmp-section__title">장비 · 템환산</h2>
            <ul class="cmp-items">
              {SLOT_LAYOUT.map(([key, label]) => {
                const left = a.slots[key];
                const right = b.slots[key];
                if (!left && !right) return null;
                const diff = (left?.score || 0) - (right?.score || 0);
                return (
                  <li key={key} class="cmp-item-row">
                    <ItemCell entry={left} align="a" win={diff > 0} />
                    <span class="cmp-item-row__mid">
                      <span class="cmp-item-row__slot">{label}</span>
                      <Diff value={diff} format={(n) => itemScoreText((left || right).item.slotName, n)} />
                    </span>
                    <ItemCell entry={right} align="b" win={diff < 0} />
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </>
      ) : null}
    </div>
  );
}

/** @param {{ entry?: { item: any, score: number | null }, align: "a" | "b", win: boolean }} props */
function ItemCell({ entry, align, win }) {
  if (!entry) return <span class={`cmp-item cmp-item--${align} is-empty`}>-</span>;
  const { item, score } = entry;
  const grade = gradeInfo(item.itemGrade);
  const star = starforce(item.starforceUpgrade);
  return (
    <span class={`cmp-item cmp-item--${align}${win ? " is-win" : ""}`}>
      <span class={`cmp-icon${grade ? ` is-${grade.key}` : ""}`}>
        {item.itemIcon ? <img src={item.itemIcon} alt="" width={32} height={32} loading="lazy" /> : null}
      </span>
      <span class="cmp-item__text">
        <span class="cmp-item__name">{item.itemName}</span>
        <span class="cmp-item__meta num">
          {star ? <span class="cmp-star">★{star}</span> : null}
          <span class="cmp-item__score">{score === null ? "-" : `${itemScoreText(item.slotName, score)}점`}</span>
        </span>
      </span>
    </span>
  );
}
