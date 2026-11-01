// 보스 파티 모집(/party?world=&boss=): 열린 모집 글(최근 순), 글 쓰기(내 캐릭터·보스·조건 전투력·인원·시간·한마디), 지원·지원 취소,
// 글쓴이는 마감·내보내기·지우기. 글쓴이·지원자는 모은 기록(없으면 넥슨)으로 입장 가능을 보여 준다.
// 관리 키는 이 브라우저(localStorage)에만 둔다. GET/POST /api/v2/party.
import "../styles/party.css";
import bossData from "../../../src/game-data/boss-entry.json";
import { useEffect, useState } from "preact/hooks";
import { Avatar } from "../components/Avatar.jsx";
import { WorldIcon } from "../components/GameIcons.jsx";
import { Icon } from "../components/Icon.jsx";
import { Aurora, SplitText } from "../components/Motion.jsx";
import { Sheet } from "../components/Sheet.jsx";
import { SkeletonList } from "../components/Skeleton.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { toast } from "../components/Toast.jsx";
import { getJson, postJson } from "../lib/api.js";
import { formatComma, formatKoreanUnits } from "../lib/format.js";
import { DEFAULT_WORLD, WORLDS, urls } from "../lib/game.js";

const BOSSES = [...bossData.bosses].sort((a, b) => a.power - b.power);
const bossKey = (boss) => `${boss.name}|${boss.difficulty}`;
const bossLabel = (boss) => `${boss.difficulty} ${boss.name}`;
const power = (value) => (value > 0 ? formatKoreanUnits(value, { maxGroups: value >= 1e8 ? 2 : 1 }) : "-");
const STATUS = { ok: "입장 가능", level: "레벨 부족", power: "전투력 부족", unknown: "기록 없음" };
const KEYS = "mmp.party";
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function readKeys() {
  try {
    return JSON.parse(localStorage.getItem(KEYS) || "{}") || {};
  } catch {
    return {};
  }
}
function writeKey(id, patch) {
  const keys = readKeys();
  keys[id] = { ...(keys[id] || {}), ...patch };
  for (const key of Object.keys(keys)) if (!keys[key]?.host && !keys[key]?.applicant) delete keys[key];
  try {
    localStorage.setItem(KEYS, JSON.stringify(keys));
  } catch {
    // 저장하지 못하면 이 화면을 닫기 전까지만 관리할 수 있다
  }
  return keys;
}

/** "11/1(토) 21:00 · 3시간 뒤" 또는 "시간 협의" */
function timeText(iso) {
  if (!iso) return "시간 협의";
  const date = new Date(Date.parse(iso) + 9 * 3600000);
  const hours = Math.round((Date.parse(iso) - Date.now()) / 3600000);
  const when = `${date.getUTCMonth() + 1}/${date.getUTCDate()}(${DAYS[date.getUTCDay()]}) ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
  return hours > 0 ? `${when} · ${hours}시간 뒤` : hours === 0 ? `${when} · 곧` : `${when} · 진행 중`;
}

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  const world = params.get("world") || "";
  const boss = params.get("boss") || "";
  return { world: WORLDS.includes(world) ? world : "", boss: BOSSES.some((entry) => bossKey(entry) === boss) ? boss : "" };
}

/** 지금부터 3일 안(서울 시각)을 datetime-local 값으로 */
const localValue = (time) => new Date(time + 9 * 3600000).toISOString().slice(0, 16);

/** 글쓰기 시트 @param {{ open: boolean, onClose: () => void, onCreated: (post: any) => void, defaultWorld: string }} props */
function PostForm({ open, onClose, onCreated, defaultWorld }) {
  const [form, setForm] = useState({ world: defaultWorld || DEFAULT_WORLD, host: "", boss: bossKey(BOSSES[BOSSES.length - 6] || BOSSES[0]), level: "entry", slots: "6", startsAt: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const boss = BOSSES.find((entry) => bossKey(entry) === form.boss) || BOSSES[0];
  const levels = [
    { value: "entry", label: `입장 전투력 ${power(boss.power)}`, power: boss.power },
    ...(boss.recommend?.power ? [{ value: "recommend", label: `권장 전투력 ${power(boss.recommend.power)}`, power: boss.recommend.power }] : []),
    { value: "x1.2", label: `${power(Math.round(boss.power * 1.2))} 이상`, power: Math.round(boss.power * 1.2) },
    { value: "x1.5", label: `${power(Math.round(boss.power * 1.5))} 이상`, power: Math.round(boss.power * 1.5) }
  ];
  const minPower = (levels.find((entry) => entry.value === form.level) || levels[0]).power;
  const set = (patch) => setForm({ ...form, ...patch });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const startsAt = form.startsAt ? new Date(`${form.startsAt}:00+09:00`).toISOString() : "";
      const { response, body } = await postJson("/api/v2/party", {
        world_name: form.world,
        host: form.host.trim(),
        boss: { name: boss.name, difficulty: boss.difficulty },
        minPower,
        slots: Number(form.slots),
        startsAt,
        note: form.note
      });
      if (!response.ok || !body?.ok) return setMessage(body?.message || "글을 쓰지 못했어요.");
      writeKey(body.post.id, { host: body.key });
      onCreated(body.post);
    } catch {
      setMessage("글을 쓰지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} title="파티 모집 글 쓰기" onClose={onClose} class="party-sheet">
      <form class="party-form" onSubmit={submit}>
        <div class="party-form__row">
          <label class="field">
            <span class="field__label">월드</span>
            <span class="select">
              <select value={form.world} onChange={(event) => set({ world: event.currentTarget.value })}>
                {WORLDS.map((world) => (
                  <option key={world} value={world}>
                    {world}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={18} class="select__icon" />
            </span>
          </label>
          <label class="field">
            <span class="field__label">내 캐릭터</span>
            <input class="input" type="text" maxLength={12} autoComplete="off" placeholder="캐릭터 이름" value={form.host} onInput={(event) => set({ host: event.currentTarget.value })} />
          </label>
        </div>
        <label class="field">
          <span class="field__label">보스</span>
          <span class="select">
            <select value={form.boss} onChange={(event) => set({ boss: event.currentTarget.value, level: "entry" })}>
              {BOSSES.map((entry) => (
                <option key={bossKey(entry)} value={bossKey(entry)}>
                  {bossLabel(entry)} · Lv.{entry.level} · {power(entry.power)}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={18} class="select__icon" />
          </span>
        </label>
        <div class="party-form__row">
          <label class="field">
            <span class="field__label">조건</span>
            <span class="select">
              <select value={form.level} onChange={(event) => set({ level: event.currentTarget.value })}>
                {levels.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={18} class="select__icon" />
            </span>
          </label>
          <label class="field">
            <span class="field__label">인원</span>
            <span class="select">
              <select value={form.slots} onChange={(event) => set({ slots: event.currentTarget.value })}>
                {[2, 3, 4, 5, 6].map((count) => (
                  <option key={count} value={String(count)}>
                    {count}명
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={18} class="select__icon" />
            </span>
          </label>
        </div>
        <label class="field">
          <span class="field__label">시간(비우면 협의)</span>
          <input
            class="input"
            type="datetime-local"
            min={localValue(Date.now())}
            max={localValue(Date.now() + 3 * 86400000)}
            value={form.startsAt}
            onInput={(event) => set({ startsAt: event.currentTarget.value })}
          />
        </label>
        <label class="field">
          <span class="field__label">한마디</span>
          <input class="input" type="text" maxLength={60} autoComplete="off" placeholder="예: 숙련자 환영, 디코 가능" value={form.note} onInput={(event) => set({ note: event.currentTarget.value })} />
        </label>
        {message ? <p class="party-form__error">{message}</p> : null}
        <button type="submit" class="btn btn--primary" disabled={busy || !form.host.trim()}>
          <Icon name="check" size={18} />
          {busy ? "올리는 중" : "모집 글 올리기"}
        </button>
      </form>
    </Sheet>
  );
}

/** 글 하나 @param {{ post: any, keys: any, onChange: (post: any | null, id: string) => void, onKeys: (keys: any) => void }} props */
function PostCard({ post, keys, onChange, onKeys }) {
  const mine = keys[post.id] || {};
  const [applyName, setApplyName] = useState("");
  const [applying, setApplying] = useState(false);
  const [busy, setBusy] = useState(false);
  const filled = post.applicants.filter((row) => row.status === "ok").length + 1;

  const call = async (path, payload, done) => {
    setBusy(true);
    try {
      const { response, body } = await postJson(`/api/v2/party/${post.id}/${path}`, payload);
      if (!response.ok || !body?.ok) return toast(body?.message || "하지 못했어요", "error");
      done(body);
    } catch {
      toast("하지 못했어요", "error");
    } finally {
      setBusy(false);
    }
  };
  const apply = (event) => {
    event.preventDefault();
    call("apply", { name: applyName.trim() }, (body) => {
      onKeys(writeKey(post.id, { applicant: { name: body.name, key: body.key } }));
      onChange(body.post, post.id);
      setApplying(false);
      setApplyName("");
      toast("지원했어요", "success");
    });
  };
  const cancel = () =>
    call("cancel", { name: mine.applicant.name, key: mine.applicant.key }, (body) => {
      onKeys(writeKey(post.id, { applicant: null }));
      onChange(body.post, post.id);
    });
  const host = (action, name = "") =>
    call("host", { key: mine.host, action, name }, (body) => {
      if (body.deleted) {
        onKeys(writeKey(post.id, { host: null, applicant: null }));
        return onChange(null, post.id);
      }
      onChange(body.post, post.id);
    });

  const member = (row, isHost) => (
    <li key={row.name} class={`party-member is-${row.status}`}>
      <a class="party-member__who" href={urls.character(post.world, row.name)}>
        <Avatar world={post.world} name={row.name} size={32} lazy />
        <span>
          <strong>
            {row.name}
            {isHost ? <small class="party-member__host">모집</small> : null}
          </strong>
          <span class="num">
            {row.className ? `${row.className} · ` : ""}Lv.{row.level || "-"} · {power(row.power)}
          </span>
        </span>
      </a>
      <span class="party-member__status">{STATUS[row.status] || STATUS.unknown}</span>
      {!isHost && mine.host ? (
        <button type="button" class="icon-btn party-member__kick" aria-label={`${row.name} 내보내기`} onClick={() => host("kick", row.name)} disabled={busy}>
          <Icon name="x" size={16} />
        </button>
      ) : null}
    </li>
  );

  return (
    <li class={`card party-post${post.closed ? " is-closed" : ""}`}>
      <div class="party-post__head">
        <span class="party-post__boss">
          <strong>{bossLabel(post.boss)}</strong>
          <span class="num">
            Lv.{post.boss.level} · {power(post.minPower)} 이상
          </span>
        </span>
        <span class="party-post__count num">
          {filled}/{post.slots}명{post.closed ? " · 마감" : ""}
        </span>
      </div>
      <p class="party-post__meta num">
        <WorldIcon world={post.world} size={14} /> {post.world} · {timeText(post.startsAt)}
      </p>
      {post.note ? <p class="party-post__note">{post.note}</p> : null}
      <ul class="party-post__members">
        {member(post.host, true)}
        {post.applicants.map((row) => member(row, false))}
      </ul>
      <div class="party-post__actions">
        {mine.applicant ? (
          <button type="button" class="btn btn--secondary btn--sm" onClick={cancel} disabled={busy}>
            지원 취소({mine.applicant.name})
          </button>
        ) : !mine.host && !post.closed ? (
          applying ? (
            <form class="party-apply" onSubmit={apply}>
              <input class="input" type="text" maxLength={12} autoComplete="off" placeholder={`${post.world} 캐릭터 이름`} value={applyName} onInput={(event) => setApplyName(event.currentTarget.value)} />
              <button type="submit" class="btn btn--primary btn--sm" disabled={busy || !applyName.trim()}>
                지원
              </button>
            </form>
          ) : (
            <button type="button" class="btn btn--primary btn--sm" onClick={() => setApplying(true)}>
              <Icon name="plus" size={16} />
              지원하기
            </button>
          )
        ) : null}
        {mine.host ? (
          <>
            <button type="button" class="btn btn--secondary btn--sm" onClick={() => host(post.closed ? "reopen" : "close")} disabled={busy}>
              {post.closed ? "다시 열기" : "마감"}
            </button>
            <button type="button" class="btn btn--ghost btn--sm" onClick={() => host("delete")} disabled={busy}>
              <Icon name="trash" size={16} />
              지우기
            </button>
          </>
        ) : null}
      </div>
    </li>
  );
}

export function PartyBoard() {
  const [query, setQuery] = useState(readQuery);
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", posts: any[] }} */ ({ status: "loading", posts: [] }));
  const [mineClosed, setMineClosed] = useState(/** @type {any[]} */ ([]));
  const [keys, setKeys] = useState(readKeys);
  const [writing, setWriting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const update = (patch) => {
    const next = { ...query, ...patch };
    setQuery(next);
    const params = new URLSearchParams();
    if (next.world) params.set("world", next.world);
    if (next.boss) params.set("boss", next.boss);
    const url = `/party${params.toString() ? `?${params}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(null, "", url);
  };

  useEffect(() => {
    let alive = true;
    setState((prev) => ({ ...prev, status: "loading" }));
    const params = new URLSearchParams();
    if (query.world) params.set("world_name", query.world);
    if (query.boss) params.set("boss", query.boss);
    getJson(`/api/v2/party?${params}`).then(
      ({ response, body }) => alive && setState(response.ok && body?.ok ? { status: "ready", posts: body.posts || [] } : { status: "error", posts: [] }),
      () => alive && setState({ status: "error", posts: [] })
    );
    return () => {
      alive = false;
    };
  }, [query.world, query.boss, attempt]);

  // 내가 쓴 글 중 마감한 글도 이 브라우저에서는 보이게
  useEffect(() => {
    const ids = Object.keys(keys).filter((id) => keys[id]?.host && !state.posts.some((post) => post.id === id));
    if (!ids.length) return setMineClosed([]);
    Promise.all(ids.map((id) => getJson(`/api/v2/party/${id}`).then(({ response, body }) => (response.ok && body?.ok ? body.post : null), () => null))).then((posts) =>
      setMineClosed(posts.filter(Boolean))
    );
  }, [state.posts, keys]);

  const onChange = (post, id) => {
    setState((prev) => ({ ...prev, posts: post && !post.closed ? prev.posts.map((row) => (row.id === id ? post : row)) : prev.posts.filter((row) => row.id !== id) }));
    setMineClosed((prev) => (post && post.closed ? [post, ...prev.filter((row) => row.id !== id)] : prev.filter((row) => row.id !== id)));
  };
  const posts = [...mineClosed, ...state.posts];

  return (
    <div class="party-board">
      <header class="page-head page-head--rank tone-peach">
        <Aurora tone="dusk" />
        <span class="page-head__icon" aria-hidden="true">
          <Icon name="swords" size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText text="보스 파티 모집" />
        </h1>
      </header>

      <div class="card party-board__bar">
        <span class="select">
          <select aria-label="월드" value={query.world} onChange={(event) => update({ world: event.currentTarget.value })}>
            <option value="">전체 월드</option>
            {WORLDS.map((world) => (
              <option key={world} value={world}>
                {world}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={18} class="select__icon" />
        </span>
        <span class="select">
          <select aria-label="보스" value={query.boss} onChange={(event) => update({ boss: event.currentTarget.value })}>
            <option value="">전체 보스</option>
            {BOSSES.map((boss) => (
              <option key={bossKey(boss)} value={bossKey(boss)}>
                {bossLabel(boss)}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={18} class="select__icon" />
        </span>
        <button type="button" class="btn btn--primary party-board__write" onClick={() => setWriting(true)}>
          <Icon name="plus" size={18} />
          모집 글 쓰기
        </button>
      </div>

      {state.status === "loading" && !posts.length ? <SkeletonList rows={4} /> : null}
      {state.status === "error" ? <ErrorState compact title="모집 글을 불러오지 못했어요" onRetry={() => setAttempt((n) => n + 1)} /> : null}
      {state.status === "ready" && !posts.length ? <EmptyState title="열린 모집 글이 없어요" description="첫 모집 글을 올려 보세요." /> : null}
      {posts.length ? (
        <ol class="party-board__list">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} keys={keys} onChange={onChange} onKeys={setKeys} />
          ))}
        </ol>
      ) : null}
      <p class="party-board__count num">{state.status === "ready" ? `열린 글 ${formatComma(state.posts.length)}개 · 3일 지나면 지워져요` : ""}</p>

      <PostForm
        open={writing}
        defaultWorld={query.world}
        onClose={() => setWriting(false)}
        onCreated={(post) => {
          setWriting(false);
          setKeys(readKeys());
          setState((prev) => ({ ...prev, posts: [post, ...prev.posts] }));
          toast("모집 글을 올렸어요", "success");
        }}
      />
    </div>
  );
}
