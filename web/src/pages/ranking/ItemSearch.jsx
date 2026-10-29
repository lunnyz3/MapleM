// 장비 검색(랭킹 › 장비 검색, /ranking?view=search): 부위(필수)·계열·월드·스타포스 이상·이름·옵션 값 합 조건(최대 3개)으로
// 모은 장비를 템환산 순으로 찾고, 누르면 장비 시트(주인 캐릭터로 가는 링크). 서버 GET /api/v2/item-search.
import { useEffect, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { EmptyState, ErrorState } from "../../components/States.jsx";
import { CollectedNote } from "../../components/CollectedNote.jsx";
import { WORLDS } from "../../lib/game.js";
import { CONDITION_OPTIONS, CONDITION_SECTIONS, ItemRows, ItemSheet, ListSkeleton, MiniSelect, WorldSelect, useJson } from "./Collected.jsx";

const ARMOR = ["모자", "상의", "하의", "한벌옷", "어깨", "장갑", "신발", "망토"];
const ACCESSORY = ["반지", "목걸이", "귀고리", "눈장식", "얼굴장식", "포켓", "벨트", "뱃지", "엠블렘", "보조무기", "훈장", "칭호", "기계 심장"];
const SECTIONS = CONDITION_SECTIONS.filter((entry) => entry.value);
const OPTIONS = [...CONDITION_OPTIONS, "치명타 확률"];
const MAX_CONDITIONS = 3;
const DEFAULT_SLOT = "반지";

/** "potential:물리 대미지:50|additional:최종 대미지:6" ↔ [{ section, option, min }] */
const encodeConditions = (list) =>
  list
    .filter((entry) => Number(entry.min) > 0)
    .map((entry) => `${entry.section}:${entry.option}:${Number(entry.min)}`)
    .join("|");
const decodeConditions = (text) =>
  String(text || "")
    .split("|")
    .map((part) => part.split(":"))
    .filter(([section, option, min]) => SECTIONS.some((entry) => entry.value === section) && OPTIONS.includes(option) && Number(min) > 0)
    .slice(0, MAX_CONDITIONS)
    .map(([section, option, min]) => ({ section, option, min: String(Number(min)) }));

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  const world = String(params.get("world_name") || "");
  return {
    slot: String(params.get("slot") || DEFAULT_SLOT).slice(0, 20),
    family: String(params.get("family") || "").slice(0, 40),
    world: WORLDS.includes(world) ? world : "",
    star: Math.max(0, Math.min(40, Math.floor(Number(params.get("star")) || 0))),
    name: String(params.get("name") || "").slice(0, 30),
    conditions: decodeConditions(params.get("c")),
    page: Math.max(1, Math.min(25, Math.floor(Number(params.get("page")) || 1)))
  };
}

function queryUrl(query) {
  const params = new URLSearchParams({ view: "search", slot: query.slot });
  if (query.family) params.set("family", query.family);
  if (query.world) params.set("world_name", query.world);
  if (query.star) params.set("star", String(query.star));
  if (query.name) params.set("name", query.name);
  const c = encodeConditions(query.conditions);
  if (c) params.set("c", c);
  if (query.page > 1) params.set("page", String(query.page));
  return `/ranking?${params}`;
}

export function ItemSearch() {
  const [query, setQuery] = useState(readQuery);
  const [draft, setDraft] = useState(query);
  const [opened, setOpened] = useState(/** @type {any} */ (null));
  useEffect(() => {
    const onPop = () => {
      const next = readQuery();
      setQuery(next);
      setDraft(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const slotsState = useJson(`/api/v2/item-search/slots?${new URLSearchParams({ slot: draft.slot })}`, draft.slot);
  const slots = slotsState.data?.slots || [];
  const families = slotsState.data?.families || [];
  const weapons = slots.filter((entry) => entry.weapon).map((entry) => entry.slot);
  const has = (name) => slots.some((entry) => entry.slot === name);

  const apiParams = new URLSearchParams({ slot: query.slot, page: String(query.page) });
  if (query.family) apiParams.set("family", query.family);
  if (query.world) apiParams.set("world_name", query.world);
  if (query.star) apiParams.set("star", String(query.star));
  if (query.name) apiParams.set("name", query.name);
  const c = encodeConditions(query.conditions);
  if (c) apiParams.set("c", c);
  const url = `/api/v2/item-search?${apiParams}`;
  const result = useJson(url, url);
  const rows = result.data?.rows || [];

  const apply = (/** @type {any} */ next) => {
    const clean = { ...next, conditions: next.conditions.filter((entry) => Number(entry.min) > 0) };
    setQuery(clean);
    setDraft(clean);
    const target = queryUrl(clean);
    if (`${window.location.pathname}${window.location.search}` !== target) window.history.pushState(null, "", target);
  };
  const edit = (/** @type {any} */ patch) => setDraft({ ...draft, ...patch });
  const editCondition = (index, patch) => edit({ conditions: draft.conditions.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) });

  return (
    <>
      <CollectedNote />
      <form
        class="rk-filters card crk-filters crk-search"
        aria-label="장비 검색 조건"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ ...draft, page: 1 });
        }}
      >
        <div class="crk-search__grid">
          <div class="field">
            <label class="field__label" for="crk-search-slot">
              부위
            </label>
            <span class="select">
              <select
                id="crk-search-slot"
                value={draft.slot}
                onChange={(event) => edit({ slot: /** @type {HTMLSelectElement} */ (event.currentTarget).value, family: "" })}
              >
                <optgroup label="무기">
                  {(weapons.length ? weapons : [draft.slot]).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="방어구">
                  {ARMOR.filter(has).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="장신구 · 그 밖">
                  {ACCESSORY.filter(has).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <Icon name="chevronDown" size={18} class="select__icon" />
            </span>
          </div>
          <div class="field">
            <label class="field__label" for="crk-search-family">
              계열
            </label>
            <span class="select">
              <select
                id="crk-search-family"
                value={draft.family}
                onChange={(event) => edit({ family: /** @type {HTMLSelectElement} */ (event.currentTarget).value })}
              >
                <option value="">전체</option>
                {families.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={18} class="select__icon" />
            </span>
          </div>
          <WorldSelect id="crk-search-world" world={draft.world} onWorld={(world) => edit({ world })} />
          <div class="field">
            <label class="field__label" for="crk-search-star">
              스타포스
            </label>
            <span class="select">
              <select
                id="crk-search-star"
                value={draft.star}
                onChange={(event) => edit({ star: Number(/** @type {HTMLSelectElement} */ (event.currentTarget).value) })}
              >
                {[0, 10, 15, 20, 25, 30, 35, 36, 37, 38, 39, 40].map((value) => (
                  <option key={value} value={value}>
                    {value ? `★${value} 이상` : "전체"}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={18} class="select__icon" />
            </span>
          </div>
          <div class="field crk-search__name">
            <label class="field__label" for="crk-search-name">
              아이템 이름
            </label>
            <input
              id="crk-search-name"
              class="input"
              type="text"
              maxLength={30}
              autoComplete="off"
              placeholder="이름 일부"
              value={draft.name}
              onInput={(event) => edit({ name: /** @type {HTMLInputElement} */ (event.currentTarget).value })}
            />
          </div>
        </div>

        <div class="crk-search__conds" role="group" aria-label="옵션 조건">
          {draft.conditions.map((entry, index) => (
            <div key={index} class="crk-search__cond">
              <MiniSelect label="옵션 묶음" value={entry.section} options={SECTIONS} onChange={(value) => editCondition(index, { section: value })} />
              <MiniSelect
                label="옵션"
                value={entry.option}
                options={OPTIONS.map((value) => ({ value, label: value }))}
                onChange={(value) => editCondition(index, { option: value })}
              />
              <span class="crk-search__min">
                <input
                  class="input input--sm num"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  aria-label={`${entry.option} 합 이상`}
                  value={entry.min}
                  onInput={(event) => editCondition(index, { min: /** @type {HTMLInputElement} */ (event.currentTarget).value })}
                />
                <span>이상</span>
              </span>
              <button
                type="button"
                class="icon-btn"
                aria-label="조건 빼기"
                onClick={() => edit({ conditions: draft.conditions.filter((_, i) => i !== index) })}
              >
                <Icon name="x" size={18} />
              </button>
            </div>
          ))}
          <div class="crk-search__actions">
            {draft.conditions.length < MAX_CONDITIONS ? (
              <button
                type="button"
                class="btn btn--secondary btn--sm"
                onClick={() => edit({ conditions: [...draft.conditions, { section: "potential", option: OPTIONS[0], min: "" }] })}
              >
                옵션 조건 더하기
              </button>
            ) : null}
            <button type="submit" class="btn btn--primary">
              <Icon name="search" size={18} />
              검색
            </button>
          </div>
        </div>
      </form>

      <div class="rk-panel card crk-panel" aria-busy={result.status === "loading"}>
        {result.status === "loading" ? <ListSkeleton /> : null}
        {result.status === "error" ? <ErrorState title="검색하지 못했어요" description={result.error?.message} onRetry={result.retry} /> : null}
        {result.status === "ready" && !rows.length ? (
          result.data.partial ? (
            <EmptyState title="시간 안에 찾지 못했어요" description="이름·월드·스타포스로 범위를 좁혀 보세요." />
          ) : (
            <EmptyState title="조건에 맞는 장비가 없어요" />
          )
        ) : null}
        {result.status === "ready" && rows.length ? (
          <>
            {result.data.partial ? <p class="crk-search__partial">시간 안에 찾은 장비만 보여요.</p> : null}
            <ItemRows rows={rows} onOpen={setOpened} />
          </>
        ) : null}
      </div>
      {result.status === "ready" && (query.page > 1 || result.data.hasMore) ? (
        <nav class="pager" aria-label="쪽 이동">
          <button type="button" class="pager__btn" disabled={query.page <= 1} onClick={() => apply({ ...query, page: query.page - 1 })} aria-label="이전 쪽">
            <Icon name="chevronRight" size={20} class="pager__prev-icon" />
          </button>
          <span class="pager__status num">{query.page}쪽</span>
          <button
            type="button"
            class="pager__btn"
            disabled={!result.data.hasMore}
            onClick={() => apply({ ...query, page: query.page + 1 })}
            aria-label="다음 쪽"
          >
            <Icon name="chevronRight" size={20} />
          </button>
        </nav>
      ) : null}

      <ItemSheet row={opened} onClose={() => setOpened(null)} />
    </>
  );
}
