// 멀티서치(/multi?q=): 닉네임 목록이나 카톡 대화를 붙여 넣으면 모은 캐릭터 기록을 한 표로(최대 30명) — 레벨·전투력·템환산·
// 잠재·에디·들어갈 수 있는 가장 어려운 보스. 월드를 모르면 7월드 모두에서 찾는다. 엑셀(CSV)·목록 복사.
// POST /api/v2/multi-search. 이름 뽑기·보스는 web/src/lib/multiSearch.mjs.
import "../styles/my.css";
import "../styles/multi.css";
import bossData from "../../../src/game-data/boss-entry.json";
import { useEffect, useState } from "preact/hooks";
import { Avatar } from "../components/Avatar.jsx";
import { WorldIcon } from "../components/GameIcons.jsx";
import { Icon } from "../components/Icon.jsx";
import { Aurora, SplitText } from "../components/Motion.jsx";
import { SkeletonList } from "../components/Skeleton.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { toast } from "../components/Toast.jsx";
import { postJson } from "../lib/api.js";
import { downloadCsv } from "../lib/csv.mjs";
import { formatComma, formatDecimal, formatKoreanUnits, kstToday } from "../lib/format.js";
import { WORLDS, urls } from "../lib/game.js";
import { setScoreText } from "../lib/itemScore.js";
import { hardestBoss, parseNames } from "../lib/multiSearch.mjs";
import { copyText } from "../lib/share.js";

const power = (value) => (value > 0 ? formatKoreanUnits(value, { maxGroups: value >= 1e8 ? 2 : 1 }) : "-");
const bossText = (boss) => (boss ? `${boss.difficulty} ${boss.name}` : "-");

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  const world = params.get("world") || "";
  return { text: String(params.get("q") || "").replace(/,/g, "\n"), world: WORLDS.includes(world) ? world : "" };
}

export function MultiSearch() {
  const [form, setForm] = useState(readQuery);
  const [state, setState] = useState(/** @type {{ status: "idle" | "loading" | "ready" | "error", rows?: any[], entries?: any[] }} */ ({ status: "idle" }));
  const parsed = parseNames(form.text, WORLDS);

  const search = (/** @type {typeof form} */ next) => {
    const { entries } = parseNames(next.text, WORLDS);
    if (!entries.length) return;
    setState({ status: "loading" });
    const params = new URLSearchParams({ q: entries.map((entry) => (entry.world ? `${entry.world}/${entry.name}` : entry.name)).join(",") });
    if (next.world) params.set("world", next.world);
    const url = `/multi?${params}`;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(null, "", url);
    postJson("/api/v2/multi-search", { entries, world_name: next.world }).then(
      ({ response, body }) => setState(response.ok && body?.ok ? { status: "ready", rows: body.rows || [], entries } : { status: "error" }),
      () => setState({ status: "error" })
    );
  };
  useEffect(() => {
    if (form.text.trim()) search(form);
  }, []);

  const rows = [...(state.rows || [])]
    .map((row) => ({ ...row, boss: hardestBoss(row, bossData.bosses) }))
    .sort((a, b) => b.power - a.power || b.itemScore - a.itemScore);
  const found = new Set(rows.map((row) => row.name.toLowerCase()));
  const missing = (state.entries || []).filter((entry) => !found.has(entry.name.toLowerCase()));
  const total = rows.reduce((sum, row) => sum + (row.power || 0), 0);
  const names = rows.map((row) => row.name.toLowerCase());
  const repeated = new Set(names.filter((name, index) => names.indexOf(name) !== index));

  const exportCsv = () =>
    downloadCsv(`멀티서치-${kstToday()}.csv`, [
      ["월드", "이름", "직업", "레벨", "전투력", "템환산", "잠재", "에디", "갈 수 있는 보스"],
      ...rows.map((row) => [row.world, row.name, row.className, row.level, row.power || "", setScoreText(row.itemScore), row.potential, row.additionalPotential, bossText(row.boss)])
    ]);
  const copyList = async () => {
    const lines = rows.map((row) => `${row.name}(${row.world}) ${row.className} Lv.${row.level} · ${power(row.power)} · ${bossText(row.boss)}`);
    toast((await copyText(lines.join("\n"))) ? "목록을 복사했어요" : "복사하지 못했어요", "success");
  };

  return (
    <div class="my multi">
      <header class="page-head page-head--rank tone-sky">
        <Aurora tone="sky" />
        <span class="page-head__icon" aria-hidden="true">
          <Icon name="search" size={28} />
        </span>
        <h1 class="page-head__title display">
          <SplitText text="멀티서치" />
        </h1>
      </header>

      <form
        class="card multi-form"
        onSubmit={(event) => {
          event.preventDefault();
          search(form);
        }}
      >
        <div class="multi-form__row">
          <span class="select">
            <select aria-label="월드" value={form.world} onChange={(event) => setForm({ ...form, world: /** @type {HTMLSelectElement} */ (event.currentTarget).value })}>
              <option value="">전체 월드에서</option>
              {WORLDS.map((world) => (
                <option key={world} value={world}>
                  {world}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={18} class="select__icon" />
          </span>
          <span class="multi-form__count num">
            {parsed.entries.length ? `${formatComma(parsed.entries.length)}명${parsed.fromChat ? " (카톡 대화의 보낸 사람)" : ""}` : "이름을 붙여 넣으세요"}
            {parsed.skipped ? ` · ${formatComma(parsed.skipped)}명은 30명이 넘어 빠져요` : ""}
          </span>
        </div>
        <textarea
          class="input multi-form__text"
          rows={5}
          aria-label="캐릭터 이름 목록"
          placeholder={"닉네임을 줄바꿈·쉼표·띄어쓰기로 붙여 넣으세요\n카톡 대화를 통째로 붙여 넣어도 돼요"}
          value={form.text}
          onInput={(event) => setForm({ ...form, text: /** @type {HTMLTextAreaElement} */ (event.currentTarget).value })}
        />
        <button type="submit" class="btn btn--primary multi-form__go" disabled={!parsed.entries.length || state.status === "loading"}>
          <Icon name="search" size={18} />
          {state.status === "loading" ? "찾는 중" : "한 번에 찾기"}
        </button>
      </form>

      {state.status === "loading" ? <SkeletonList rows={6} /> : null}
      {state.status === "error" ? <ErrorState compact title="찾지 못했어요" onRetry={() => search(form)} /> : null}
      {state.status === "ready" ? (
        <section class="card my-panel">
          <div class="my-panel__head">
            <ul class="my-summary">
              <li>
                찾음 <strong class="num">{formatComma(rows.length)}</strong>명
              </li>
              {missing.length ? (
                <li>
                  기록 없음 <strong class="num">{formatComma(missing.length)}</strong>명
                </li>
              ) : null}
              {total ? (
                <li>
                  전투력 합 <strong class="num">{power(total)}</strong>
                </li>
              ) : null}
            </ul>
            {rows.length ? (
              <span class="multi-actions">
                <button type="button" class="btn btn--secondary btn--sm" onClick={copyList}>
                  <Icon name="chat" size={16} />
                  목록 복사
                </button>
                <button type="button" class="btn btn--secondary btn--sm" onClick={exportCsv}>
                  <Icon name="download" size={16} />
                  엑셀로 받기
                </button>
              </span>
            ) : null}
          </div>
          {repeated.size ? (
            <p class="multi-note">
              <Icon name="info" size={16} />
              같은 이름이 여러 월드에 있어요({[...repeated].slice(0, 3).join(", ")}{repeated.size > 3 ? " …" : ""}). 월드를 고르면 좁혀져요.
            </p>
          ) : null}
          {!rows.length ? <EmptyState compact title="모은 기록이 있는 캐릭터가 없어요" /> : null}
          {rows.length ? (
            <div class="my-table" role="table" aria-label="멀티서치 결과">
              <div class="my-table__row my-table__head" role="row">
                <span role="columnheader">캐릭터</span>
                <span role="columnheader">레벨</span>
                <span role="columnheader">전투력</span>
                <span role="columnheader">템환산</span>
                <span role="columnheader">잠재 · 에디</span>
                <span role="columnheader">갈 수 있는 보스</span>
              </div>
              {rows.map((row) => (
                <a key={`${row.world}/${row.name}`} class="my-table__row" role="row" href={urls.character(row.world, row.name)}>
                  <span class="my-table__who" role="cell">
                    <Avatar world={row.world} name={row.name} size={40} lazy />
                    <span>
                      <strong>{row.name}</strong>
                      <span class="my-table__meta">
                        <WorldIcon world={row.world} size={14} />
                        {row.className}
                      </span>
                    </span>
                  </span>
                  <span class="num" role="cell" data-label="레벨">
                    {row.level || "-"}
                  </span>
                  <span class="num my-table__power" role="cell" data-label="전투력">
                    {power(row.power)}
                  </span>
                  <span class="num" role="cell" data-label="템환산">
                    {setScoreText(row.itemScore)}
                  </span>
                  <span class="num" role="cell" data-label="잠재 · 에디">
                    {formatDecimal(row.potential, 1)}% · {formatDecimal(row.additionalPotential, 1)}%
                  </span>
                  <span class="multi-boss" role="cell" data-label="갈 수 있는 보스">
                    {bossText(row.boss)}
                  </span>
                </a>
              ))}
            </div>
          ) : null}
          {missing.length ? (
            <div class="my-missing">
              <p>모은 기록이 없는 이름(캐릭터를 한 번 열어 보면 생겨요)</p>
              <ul>
                {missing.map((entry) => {
                  const world = entry.world || form.world;
                  return (
                    <li key={`${entry.world}/${entry.name}`}>
                      {world ? (
                        <a href={urls.character(world, entry.name)}>
                          <WorldIcon world={world} size={14} />
                          {entry.name}
                        </a>
                      ) : (
                        <span class="multi-missing">{entry.name}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
