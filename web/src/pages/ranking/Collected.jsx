// 자체 수집 랭킹: 아이템(제네시스·아케인셰이드, 무기 종류·방어구 부위별 템환산 순위)과
// 스펙(템환산·잠재·에디·최대 대미지·전투력).
// 사이트에서 조회된 캐릭터 + 매일 모으는 전투력 랭킹 1만 명이 대상이다.
import "../../styles/collected.css";
import { useEffect, useRef, useState } from "preact/hooks";
import { Avatar } from "../../components/Avatar.jsx";
import { Icon } from "../../components/Icon.jsx";
import { RankBadge } from "../../components/RankBadge.jsx";
import { Sheet } from "../../components/Sheet.jsx";
import { Skeleton } from "../../components/Skeleton.jsx";
import { WorldIcon } from "../../components/GameIcons.jsx";
import { EmptyState, ErrorState } from "../../components/States.jsx";
import { Segmented, Tabs } from "../../components/Tabs.jsx";
import { getJson, toApiError } from "../../lib/api.js";
import { gradeInfo, starforce } from "../../lib/character.js";
import { formatComma, formatDecimal, formatKoreanUnits, formatRelativeTime } from "../../lib/format.js";
import { WORLDS, urls } from "../../lib/game.js";
import { EquipDetail } from "../character/Equipment.jsx";
import { CollectedNote } from "../../components/CollectedNote.jsx";
import { itemScoreText, setScoreText } from "../../lib/itemScore.js";

/** 부위 순서(장비창 순). 서버에 있는 부위만 보여 준다. */
/** 순위를 매기는 계열과 방어구 부위(무기는 무기 종류별). 서버 item-score.json 과 같다. */
const FAMILIES = ["제네시스", "아케인셰이드"];

/** 템환산 항목(서버 parts 키) */
const PART_LABELS = [
  ["basic", "기본"],
  ["additional", "추옵"],
  ["potential", "잠재"],
  ["additionalPotential", "에디"],
  ["soul", "소울"],
  ["emblem", "문장"]
];
const ARMOR_SLOTS = ["모자", "상의", "하의", "한벌옷", "어깨", "장갑", "신발", "망토"];
const WEAPON_TAB = "무기";

export const SPEC_METRICS = [
  { id: "itemScore", label: "템환산", format: (row) => `${setScoreText(row.itemScore)}점` },
  { id: "itemScoreWithoutEmblem", label: "템환산 (문장 제외)", format: (row) => `${setScoreText(row.itemScoreWithoutEmblem, false)}점` },
  { id: "potential", label: "잠재", format: (row) => `${formatDecimal(row.potential, 2)}%` },
  { id: "additionalPotential", label: "에디", format: (row) => `${formatDecimal(row.additionalPotential, 2)}%` },
  { id: "maxDamage", label: "최대 대미지", format: (row) => formatKoreanUnits(row.maxDamage) },
  { id: "combatPower", label: "전투력", format: (row) => formatKoreanUnits(row.combatPower) }
];

/**
 * @template T
 * @param {string} url
 * @param {string} key  바뀌면 다시 불러온다
 * @returns {{ status: "loading" | "ready" | "error", data?: T, error?: any, retry: () => void }}
 */
export function useJson(url, key) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(/** @type {{ key: string, status: "loading" | "ready" | "error", data?: any, error?: any }} */ ({ key: "", status: "loading" }));
  const fullKey = `${key}|${attempt}`;
  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    setState({ key: fullKey, status: "loading" });
    getJson(url).then(
      ({ response, body }) => {
        if (!alive) return;
        if (response.ok && body?.ok) setState({ key: fullKey, status: "ready", data: body });
        else setState({ key: fullKey, status: "error", error: toApiError(response, body, "랭킹을 불러오지 못했어요.") });
      },
      (error) => alive && setState({ key: fullKey, status: "error", error })
    );
    return () => {
      alive = false;
    };
  }, [url, fullKey]);
  const current = state.key === fullKey ? state : { status: /** @type {const} */ ("loading") };
  return { ...current, retry: () => setAttempt((n) => n + 1) };
}

/** @param {{ count?: number }} props */
export function ListSkeleton({ count = 8 }) {
  return (
    <div class="rk-skeleton" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div class="rk-skeleton__row" key={index}>
          <Skeleton width={34} height={34} radius={10} />
          <Skeleton width={44} height={44} radius={12} />
          <span class="rk-skeleton__text">
            <Skeleton width={`${52 - (index % 4) * 6}%`} height={14} />
            <Skeleton width={`${30 + (index % 3) * 6}%`} height={11} />
          </span>
          <Skeleton width={64} height={18} />
        </div>
      ))}
    </div>
  );
}

/**
 * 이전·다음 쪽(전체 개수를 알므로 마지막 쪽도 안다).
 * @param {{ page: number, total: number, pageSize: number, onPage: (page: number) => void }} props
 */
function SimplePager({ page, total, pageSize, onPage }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  return (
    <nav class="pager" aria-label="쪽 이동">
      <button type="button" class="pager__btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="이전 쪽">
        <Icon name="chevronRight" size={20} class="pager__prev-icon" />
      </button>
      <span class="pager__status num">
        {formatComma(page)} / {formatComma(last)}
      </span>
      <button type="button" class="pager__btn" disabled={page >= last} onClick={() => onPage(page + 1)} aria-label="다음 쪽">
        <Icon name="chevronRight" size={20} />
      </button>
    </nav>
  );
}

/**
 * @param {{ world: string, onWorld: (world: string) => void, id: string }} props
 */
export function WorldSelect({ world, onWorld, id }) {
  return (
    <div class="field">
      <label class="field__label" for={id}>
        월드
      </label>
      <span class="select">
        <select id={id} value={world} onChange={(event) => onWorld(/** @type {HTMLSelectElement} */ (event.currentTarget).value)}>
          <option value="">전체 월드</option>
          {WORLDS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={18} class="select__icon" />
      </span>
    </div>
  );
}

/** 목록 줄 안의 주인(글자만: 줄을 누르면 장비 시트가 열리고, 캐릭터로 가는 링크는 시트에 있다). @param {{ row: any }} props */
function OwnerText({ row }) {
  return (
    <span class="crk-owner">
      <WorldIcon world={row.worldName} size={14} />
      <span class="crk-owner__name">{row.characterName}</span>
      {row.characterClass ? <span class="crk-owner__class">{row.characterClass}</span> : null}
    </span>
  );
}

/** @param {{ row: any }} props */
function Owner({ row }) {
  return (
    <a class="crk-owner" href={urls.character(row.worldName, row.characterName)} onClick={(event) => event.stopPropagation()}>
      <WorldIcon world={row.worldName} size={14} />
      <span class="crk-owner__name">{row.characterName}</span>
      {row.characterClass ? <span class="crk-owner__class">{row.characterClass}</span> : null}
    </a>
  );
}

/**
 * 장비 목록(아이템 랭킹·장비 검색): 줄을 누르면 장비 시트.
 * @param {{ rows: any[], noEmblem?: boolean, scoreField?: string, onOpen: (row: any) => void }} props
 */
export function ItemRows({ rows, noEmblem = false, scoreField = "score", onOpen }) {
  return (
    <ol class="crk-list">
      {rows.map((row) => {
        const item = row.item || {};
        const grade = gradeInfo(item.itemGrade);
        const star = starforce(item.starforceUpgrade);
        return (
          <li key={`${row.rank}-${item.fingerprint}`}>
            <button type="button" class="crk-row" onClick={() => onOpen(row)}>
              <RankBadge rank={row.rank} size={34} />
              <span class={`crk-icon${grade ? ` is-${grade.key}` : ""}`}>
                {item.itemIcon ? <img src={item.itemIcon} alt="" width={36} height={36} loading="lazy" /> : <Icon name="medal" size={22} />}
              </span>
              <span class="crk-row__text">
                <span class="crk-row__name">
                  {item.itemName}
                  {star ? <span class="crk-star num">★{star}</span> : null}
                </span>
                <span class="crk-row__meta">
                  <OwnerText row={row} />
                  <span class="crk-row__time">{formatRelativeTime(Date.parse(row.checkedAt))}</span>
                </span>
                {row.parts ? (
                  <span class="crk-parts num">
                    {PART_LABELS.filter(([key]) => row.parts[key] && !(key === "emblem" && noEmblem)).map(([key, label]) => (
                      <span key={key} class={`crk-part is-${key}`}>
                        {label} {itemScoreText(row.slot, row.parts[key], !noEmblem)}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
              <span class="crk-score num">
                {itemScoreText(row.slot, row[scoreField], !noEmblem)}
                <span class="crk-score__unit">점</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** 장비 시트: 주인(캐릭터로 가는 링크)과 장비 상세. @param {{ row: any, onClose: () => void }} props */
export function ItemSheet({ row, onClose }) {
  return (
    <Sheet open={Boolean(row)} title={row?.item?.itemName || "장비"} onClose={onClose}>
      {row ? (
        <div class="crk-sheet">
          <Owner row={row} />
          <EquipDetail item={row.item} profile={{ attackType: row.attackType, className: row.characterClass, jobName: row.characterClass }} />
        </div>
      ) : null}
    </Sheet>
  );
}

export const CONDITION_SECTIONS = [
  { value: "", label: "옵션 조건 없음" },
  { value: "potential", label: "잠재능력" },
  { value: "additionalPotential", label: "에디셔널" },
  { value: "additional", label: "추가 옵션" }
];
export const CONDITION_OPTIONS = [
  "보스 공격력",
  "물리 대미지",
  "마법 대미지",
  "최종 대미지",
  "방어율 무시",
  "치명타 피해",
  "물리 공격력",
  "마법 공격력",
  "최대 대미지"
];

/** @param {{ label: string, value: string | number, options: Array<{ value: string | number, label: string }>, onChange: (value: string) => void, disabled?: boolean }} props */
export function MiniSelect({ label, value, options, onChange, disabled = false }) {
  return (
    <span class="select select--sm">
      <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(/** @type {HTMLSelectElement} */ (event.currentTarget).value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={16} class="select__icon" />
    </span>
  );
}

/**
 * 조건: 스타포스 이상, 잠재·에디·추옵에 그 옵션이 몇 줄 이상.
 * @param {{ query: ItemQuery, onQuery: (patch: Partial<ItemQuery>) => void }} props
 */
function ConditionRow({ query, onQuery }) {
  const on = Boolean(query.section);
  return (
    <div class="crk-filters__row crk-conds" role="group" aria-label="조건">
      <span class="crk-conds__label">조건</span>
      <MiniSelect
        label="스타포스"
        value={query.star || 0}
        options={[0, 25, 30, 35].map((value) => ({ value, label: value ? `★${value} 이상` : "스타포스 전체" }))}
        onChange={(value) => onQuery({ star: Number(value), page: 1 })}
      />
      <MiniSelect
        label="옵션 묶음"
        value={query.section || ""}
        options={CONDITION_SECTIONS}
        onChange={(value) => onQuery({ section: value, option: value ? query.option || CONDITION_OPTIONS[0] : "", page: 1 })}
      />
      {on ? (
        <>
          <MiniSelect label="옵션" value={query.option || CONDITION_OPTIONS[0]} options={CONDITION_OPTIONS.map((value) => ({ value, label: value }))} onChange={(value) => onQuery({ option: value, page: 1 })} />
          <MiniSelect
            label="줄 수"
            value={query.lines || 1}
            options={[1, 2, 3].map((value) => ({ value, label: `${value}줄 이상` }))}
            onChange={(value) => onQuery({ lines: Number(value), page: 1 })}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * @typedef {{ slot: string, family: string, world: string, page: number, noEmblem: boolean, star: number, section: string, option: string, lines: number }} ItemQuery
 * @param {{ query: ItemQuery, onQuery: (patch: Partial<ItemQuery>) => void }} props
 */
export function ItemRanking({ query, onQuery }) {
  const [opened, setOpened] = useState(/** @type {any} */ (null));
  // 부위 목록(무기는 무기 종류별) — 월드별 개수
  const slotsUrl = `/api/v2/item-ranking/groups?${new URLSearchParams({ world_name: query.world })}`;
  const slotsState = useJson(slotsUrl, slotsUrl);
  const allSlots = slotsState.data?.slots || [];
  const weaponTypes = allSlots.filter((entry) => entry.weapon);
  // "무기"만 고른 상태면 가장 많은 무기 종류부터 보여 준다.
  const slot = query.slot === WEAPON_TAB ? weaponTypes[0]?.slot || "" : query.slot;
  const isWeapon = slot ? !ARMOR_SLOTS.includes(slot) : query.slot === WEAPON_TAB;
  const familyUrl = slot ? `/api/v2/item-ranking/groups?${new URLSearchParams({ slot, world_name: query.world })}` : "";
  const familyState = useJson(familyUrl, familyUrl);
  const familyCounts = new Map((familyState.data?.families || []).map((entry) => [entry.family, entry.count]));
  // 제네시스는 무기뿐이다. 고르지 않았거나 이 부위에 없는 계열이면 장비가 있는 첫 계열.
  const familyOptions = FAMILIES.filter((name) => isWeapon || name !== "제네시스");
  const family =
    familyOptions.includes(query.family) && (familyCounts.get(query.family) || !familyState.data)
      ? query.family
      : familyOptions.find((name) => familyCounts.get(name)) || familyOptions.find((name) => name === "아케인셰이드") || familyOptions[0];

  const listParams = new URLSearchParams({ slot, family, page: String(query.page) });
  if (query.world) listParams.set("world_name", query.world);
  if (query.noEmblem) listParams.set("sort", "scoreWithoutEmblem");
  if (query.star) listParams.set("star", String(query.star));
  if (query.section && query.option) {
    listParams.set("section", query.section);
    listParams.set("option", query.option);
    listParams.set("lines", String(query.lines || 1));
  }
  // 계열 개수를 받은 뒤에 목록을 불러온다(없는 계열을 먼저 부르지 않게).
  const listUrl = slot && familyState.status !== "loading" ? `/api/v2/item-ranking?${listParams}` : "";
  const list = useJson(listUrl, listUrl);

  const topItems = [WEAPON_TAB, ...ARMOR_SLOTS.filter((name) => allSlots.some((entry) => entry.slot === name))].map((name) => ({ id: name, label: name }));
  // 좁은 화면에서 무기 종류 칩은 한 줄로 밀리므로 고른 칩이 보이게 그 줄만 민다.
  const chipsRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  useEffect(() => {
    const row = chipsRef.current;
    const chip = /** @type {HTMLElement | null} */ (row?.querySelector(".crk-chip.is-active"));
    if (!row || !chip || row.scrollWidth <= row.clientWidth + 1) return;
    row.scrollTo({ left: Math.max(0, chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2) });
  }, [slot, weaponTypes.length]);
  const rows = list.data?.rows || [];
  const scoreField = query.noEmblem ? "scoreWithoutEmblem" : "score";

  return (
    <>
      <Tabs
        idBase="crk-slot"
        label="부위"
        scrollable
        value={isWeapon ? WEAPON_TAB : slot}
        onChange={(next) => onQuery({ slot: next, page: 1 })}
        items={topItems}
      />

      <CollectedNote />
      <section class="rk-filters card crk-filters" aria-label="아이템 랭킹 조건">
        <div class="crk-filters__row">
          <WorldSelect id="crk-item-world" world={query.world} onWorld={(world) => onQuery({ world, page: 1 })} />
          <Segmented
            name="crk-family"
            legend="계열"
            value={family}
            onChange={(value) => onQuery({ family: value, page: 1 })}
            options={familyOptions.map((name) => ({ value: name, label: familyCounts.has(name) ? `${name} ${formatComma(familyCounts.get(name))}` : name }))}
          />
          <Segmented
            name="crk-emblem"
            legend="점수 기준"
            value={query.noEmblem ? "without" : "with"}
            onChange={(value) => onQuery({ noEmblem: value === "without", page: 1 })}
            options={[
              { value: "with", label: "문장 포함" },
              { value: "without", label: "문장 제외" }
            ]}
          />
        </div>
        <ConditionRow query={query} onQuery={onQuery} />
        {isWeapon && weaponTypes.length ? (
          <div class="crk-chips" role="group" aria-label="무기 종류" ref={chipsRef}>
            {weaponTypes.map((entry) => (
              <button
                type="button"
                key={entry.slot}
                class={`crk-chip${entry.slot === slot ? " is-active" : ""}`}
                aria-pressed={entry.slot === slot}
                onClick={() => onQuery({ slot: entry.slot, page: 1 })}
              >
                {entry.slot}
                <span class="crk-chip__count num">{formatComma(entry.count)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <div class="rk-panel card crk-panel" aria-busy={list.status === "loading"}>
        {!slot && slotsState.status === "ready" ? <EmptyState title="아직 모은 장비가 없어요" /> : null}
        {list.status === "loading" && (slot || slotsState.status === "loading") ? <ListSkeleton /> : null}
        {list.status === "error" ? <ErrorState title="랭킹을 불러오지 못했어요" description={list.error?.message} onRetry={list.retry} /> : null}
        {list.status === "ready" && !rows.length ? (
          query.star || query.section ? (
            <EmptyState
              title="조건에 맞는 장비가 없어요"
              action={
                <button type="button" class="btn btn--secondary" onClick={() => onQuery({ star: 0, section: "", option: "", lines: 1, page: 1 })}>
                  조건 지우기
                </button>
              }
            />
          ) : (
            <EmptyState title="아직 모은 장비가 없어요" />
          )
        ) : null}
        {list.status === "ready" && rows.length ? <ItemRows rows={rows} noEmblem={query.noEmblem} scoreField={scoreField} onOpen={setOpened} /> : null}
      </div>
      {list.status === "ready" ? (
        <SimplePager page={list.data.page} total={list.data.total} pageSize={list.data.pageSize} onPage={(page) => onQuery({ page })} />
      ) : null}

      <ItemSheet row={opened} onClose={() => setOpened(null)} />
    </>
  );
}

/**
 * 직업 고르기(모은 캐릭터에 있는 직업, 가나다순).
 * @param {{ id: string, job: string, onJob: (job: string) => void }} props
 */
function JobSelect({ id, job, onJob }) {
  const classes = useJson("/api/v2/stats/classes?top=0", "classes-all");
  const names = (classes.data?.classes || []).map((entry) => entry.className).sort((a, b) => a.localeCompare(b, "ko"));
  // 목록이 오기 전·목록에 없는 직업(주소로 들어온 값)도 고른 채로 보인다
  if (job && !names.includes(job)) names.unshift(job);
  return (
    <div class="field">
      <label class="field__label" for={id}>
        직업
      </label>
      <span class="select">
        <select id={id} value={job} onChange={(event) => onJob(/** @type {HTMLSelectElement} */ (event.currentTarget).value)}>
          <option value="">전체 직업</option>
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={18} class="select__icon" />
      </span>
    </div>
  );
}

/**
 * @typedef {{ metric: string, world: string, job: string, page: number }} SpecQuery
 * @param {{ query: SpecQuery, onQuery: (patch: Partial<SpecQuery>) => void }} props
 */
export function SpecRanking({ query, onQuery }) {
  const metric = SPEC_METRICS.find((entry) => entry.id === query.metric) || SPEC_METRICS[0];
  const params = new URLSearchParams({ metric: metric.id, page: String(query.page) });
  if (query.world) params.set("world_name", query.world);
  if (query.job) params.set("class", query.job);
  const url = `/api/v2/spec-ranking?${params}`;
  const list = useJson(url, url);
  const rows = list.data?.rows || [];

  return (
    <>
      <Tabs
        idBase="crk-metric"
        label="지표"
        scrollable
        value={metric.id}
        onChange={(id) => onQuery({ metric: id, page: 1 })}
        items={SPEC_METRICS.map((entry) => ({ id: entry.id, label: entry.label }))}
      />
      <CollectedNote />
      <section class="rk-filters card crk-filters" aria-label="스펙 랭킹 조건">
        <div class="crk-filters__row">
          <WorldSelect id="crk-spec-world" world={query.world} onWorld={(world) => onQuery({ world, page: 1 })} />
          <JobSelect id="crk-spec-job" job={query.job} onJob={(job) => onQuery({ job, page: 1 })} />
        </div>
      </section>

      <div class="rk-panel card crk-panel" aria-busy={list.status === "loading"}>
        {list.status === "loading" ? <ListSkeleton /> : null}
        {list.status === "error" ? <ErrorState title="랭킹을 불러오지 못했어요" description={list.error?.message} onRetry={list.retry} /> : null}
        {list.status === "ready" && !rows.length ? <EmptyState title="아직 모은 캐릭터가 없어요" /> : null}
        {list.status === "ready" && rows.length ? (
          <ol class="crk-list">
            {rows.map((row) => (
              <li key={`${row.rank}-${row.worldName}-${row.characterName}`}>
                <a class="crk-row" href={urls.character(row.worldName, row.characterName)}>
                  <RankBadge rank={row.rank} size={34} />
                  <Avatar world={row.worldName} name={row.characterName} size={40} lazy />
                  <span class="crk-row__text">
                    <span class="crk-row__name">{row.characterName}</span>
                    <span class="crk-row__meta">
                      <WorldIcon world={row.worldName} size={14} />
                      <span>{row.characterClass}</span>
                      {row.characterLevel ? <span class="num">Lv.{row.characterLevel}</span> : null}
                    </span>
                  </span>
                  <span class="crk-score num">{metric.format(row)}</span>
                </a>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      {list.status === "ready" ? (
        <SimplePager page={list.data.page} total={list.data.total} pageSize={list.data.pageSize} onPage={(page) => onQuery({ page })} />
      ) : null}
    </>
  );
}
