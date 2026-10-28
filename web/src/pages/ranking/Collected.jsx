// 자체 수집 랭킹: 아이템(부위·계열별 템환산 순위)과 스펙(템환산·잠재·에디·최대 대미지·전투력).
// 사이트에서 조회된 캐릭터 + 매일 모으는 전투력 랭킹 1만 명이 대상이다.
import "../../styles/collected.css";
import { useEffect, useMemo, useState } from "preact/hooks";
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

/** 부위 순서(장비창 순). 서버에 있는 부위만 보여 준다. */
const SLOT_ORDER = ["무기", "보조무기", "엠블렘", "모자", "상의", "하의", "한벌옷", "어깨", "장갑", "신발", "망토", "벨트", "반지", "목걸이", "귀고리", "얼굴장식", "눈장식", "포켓", "뱃지", "훈장", "칭호"];

export const SPEC_METRICS = [
  { id: "itemScore", label: "템환산", format: (row) => formatComma(Math.round(row.itemScore)) },
  { id: "itemScoreWithoutEmblem", label: "템환산 (문장 제외)", format: (row) => formatComma(Math.round(row.itemScoreWithoutEmblem)) },
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
function useJson(url, key) {
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
function ListSkeleton({ count = 8 }) {
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
function WorldSelect({ world, onWorld, id }) {
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
 * @typedef {{ slot: string, family: string, world: string, page: number, noEmblem: boolean }} ItemQuery
 * @param {{ query: ItemQuery, onQuery: (patch: Partial<ItemQuery>) => void }} props
 */
export function ItemRanking({ query, onQuery }) {
  const [opened, setOpened] = useState(/** @type {any} */ (null));
  const groupUrl = `/api/v2/item-ranking/groups?${new URLSearchParams({ slot: query.slot, world_name: query.world })}`;
  const groups = useJson(groupUrl, groupUrl);
  const listParams = new URLSearchParams({ slot: query.slot, page: String(query.page) });
  if (query.family) listParams.set("family", query.family);
  if (query.world) listParams.set("world_name", query.world);
  if (query.noEmblem) listParams.set("sort", "scoreWithoutEmblem");
  const listUrl = `/api/v2/item-ranking?${listParams}`;
  const list = useJson(listUrl, listUrl);

  const slotItems = useMemo(() => {
    const counts = new Map((groups.data?.slots || []).map((entry) => [entry.slot, entry.count]));
    const known = SLOT_ORDER.filter((slot) => counts.has(slot) || slot === query.slot);
    return known.map((slot) => ({ id: slot, label: slot }));
  }, [groups.data, query.slot]);
  const families = groups.data?.families || [];
  const familyItems = [{ id: "", label: "전체" }, ...families.filter((entry) => entry.count > 1 || entry.family === query.family).slice(0, 10).map((entry) => ({ id: entry.family, label: entry.family, count: entry.count }))];
  const rows = list.data?.rows || [];
  const scoreField = query.noEmblem ? "scoreWithoutEmblem" : "score";

  return (
    <>
      <Tabs idBase="crk-slot" label="부위" scrollable value={query.slot} onChange={(slot) => onQuery({ slot, family: "", page: 1 })} items={slotItems.length ? slotItems : [{ id: query.slot, label: query.slot }]} />

      <section class="rk-filters card crk-filters" aria-label="아이템 랭킹 조건">
        <div class="crk-filters__row">
          <WorldSelect id="crk-item-world" world={query.world} onWorld={(world) => onQuery({ world, page: 1 })} />
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
        {families.length > 1 ? (
          <div class="crk-chips" role="group" aria-label="계열">
            {familyItems.map((item) => (
              <button
                type="button"
                key={item.id || "all"}
                class={`crk-chip${item.id === query.family ? " is-active" : ""}`}
                aria-pressed={item.id === query.family}
                onClick={() => onQuery({ family: item.id, page: 1 })}
              >
                {item.label}
                {item.count ? <span class="crk-chip__count num">{formatComma(item.count)}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <div class="rk-panel card crk-panel" aria-busy={list.status === "loading"}>
        {list.status === "loading" ? <ListSkeleton /> : null}
        {list.status === "error" ? <ErrorState title="랭킹을 불러오지 못했어요" description={list.error?.message} onRetry={list.retry} /> : null}
        {list.status === "ready" && !rows.length ? <EmptyState title="아직 모은 장비가 없어요" /> : null}
        {list.status === "ready" && rows.length ? (
          <ol class="crk-list">
            {rows.map((row) => {
              const item = row.item || {};
              const grade = gradeInfo(item.itemGrade);
              const star = starforce(item.starforceUpgrade);
              return (
                <li key={`${row.rank}-${item.fingerprint}`}>
                  <button type="button" class="crk-row" onClick={() => setOpened(row)}>
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
                        <Owner row={row} />
                        <span class="crk-row__time">{formatRelativeTime(Date.parse(row.checkedAt))}</span>
                      </span>
                    </span>
                    <span class="crk-score num">
                      {formatComma(Math.round(row[scoreField]))}
                      <span class="crk-score__unit">점</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
      {list.status === "ready" ? (
        <SimplePager page={list.data.page} total={list.data.total} pageSize={list.data.pageSize} onPage={(page) => onQuery({ page })} />
      ) : null}

      <Sheet open={Boolean(opened)} title={opened?.item?.itemName || "장비"} onClose={() => setOpened(null)}>
        {opened ? (
          <div class="crk-sheet">
            <Owner row={opened} />
            <EquipDetail
              item={opened.item}
              profile={{ attackType: opened.attackType, className: opened.characterClass, jobName: opened.characterClass }}
            />
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

/**
 * @typedef {{ metric: string, world: string, page: number }} SpecQuery
 * @param {{ query: SpecQuery, onQuery: (patch: Partial<SpecQuery>) => void }} props
 */
export function SpecRanking({ query, onQuery }) {
  const metric = SPEC_METRICS.find((entry) => entry.id === query.metric) || SPEC_METRICS[0];
  const params = new URLSearchParams({ metric: metric.id, page: String(query.page) });
  if (query.world) params.set("world_name", query.world);
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
      <section class="rk-filters card crk-filters" aria-label="스펙 랭킹 조건">
        <div class="crk-filters__row">
          <WorldSelect id="crk-spec-world" world={query.world} onWorld={(world) => onQuery({ world, page: 1 })} />
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
