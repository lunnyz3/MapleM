// 캐릭터 궁합(재미용): 두 캐릭터(월드·이름)의 궁합 점수(순서를 바꿔도 같다)와, 모은 스펙이 있으면 실제 비교 몇 줄.
// GET /api/v2/match. 첫 캐릭터는 즐겨찾기·최근 본 캐릭터로 미리 채운다.
import { useState } from "preact/hooks";
import { Avatar } from "../../components/Avatar.jsx";
import { WorldIcon } from "../../components/GameIcons.jsx";
import { Icon } from "../../components/Icon.jsx";
import { CountUp } from "../../components/Motion.jsx";
import { getJson, toApiError } from "../../lib/api.js";
import { WORLDS, urls } from "../../lib/game.js";
import { getSaved } from "../../lib/storage.js";
import { shareResult } from "./shared.jsx";

function firstSaved() {
  try {
    const { favorites, recent } = getSaved();
    const entry = [...favorites, ...recent].find((item) => item.kind === "character");
    return entry ? { world: entry.world, name: entry.name } : null;
  } catch {
    return null;
  }
}

/** @param {{ side: string, who: { world: string, name: string }, onChange: (who: { world: string, name: string }) => void }} props */
function WhoField({ side, who, onChange }) {
  return (
    <div class="arc-match__field">
      <span class="select">
        <select aria-label={`${side} 월드`} value={who.world} onChange={(event) => onChange({ ...who, world: /** @type {HTMLSelectElement} */ (event.currentTarget).value })}>
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
        aria-label={`${side} 캐릭터 이름`}
        placeholder={`${side} 캐릭터 이름`}
        value={who.name}
        onInput={(event) => onChange({ ...who, name: /** @type {HTMLInputElement} */ (event.currentTarget).value })}
      />
    </div>
  );
}

/** @param {{ who: any }} props */
function Side({ who }) {
  return (
    <a class="arc-match__side" href={urls.character(who.world, who.name)}>
      <Avatar world={who.world} name={who.name} size={72} />
      <strong>{who.name}</strong>
      <span class="arc-match__meta">
        <WorldIcon world={who.world} size={14} />
        {who.className || who.world}
      </span>
      {who.level ? <span class="arc-match__meta num">Lv.{who.level}</span> : null}
    </a>
  );
}

export function Match() {
  const saved = firstSaved();
  const [a, setA] = useState(saved || { world: WORLDS[0], name: "" });
  const [b, setB] = useState({ world: saved?.world || WORLDS[0], name: "" });
  const [state, setState] = useState(/** @type {{ status: "idle" | "loading" | "ready" | "error", match?: any, error?: any }} */ ({ status: "idle" }));

  const submit = async (/** @type {Event} */ event) => {
    event.preventDefault();
    if (!a.name.trim() || !b.name.trim() || state.status === "loading") return;
    setState({ status: "loading" });
    try {
      const params = new URLSearchParams({ a_world: a.world, a_name: a.name.trim(), b_world: b.world, b_name: b.name.trim() });
      const { response, body } = await getJson(`/api/v2/match?${params}`);
      setState(response.ok && body?.ok ? { status: "ready", match: body.match } : { status: "error", error: toApiError(response, body, body?.message || "궁합을 보지 못했어요.") });
    } catch (error) {
      setState({ status: "error", error });
    }
  };

  const match = state.match;
  return (
    <>
      <form class="arc-match__form card" onSubmit={submit}>
        <WhoField side="첫째" who={a} onChange={setA} />
        <span class="arc-match__and" aria-hidden="true">
          <Icon name="heart" size={20} filled />
        </span>
        <WhoField side="둘째" who={b} onChange={setB} />
        <button type="submit" class="btn btn--primary arc-match__go" disabled={!a.name.trim() || !b.name.trim() || state.status === "loading"}>
          <Icon name="heart" size={18} />
          궁합 보기
        </button>
      </form>

      {state.status === "loading" ? <p class="arc-fortune__wait">두 사람의 인연을 살피는 중…</p> : null}
      {state.status === "error" ? <p class="arc-fortune__wait">{state.error?.message || "궁합을 보지 못했어요."}</p> : null}
      {state.status === "ready" && match ? (
        <section class="arc-match card" key={`${match.a.name}-${match.b.name}`} aria-label="궁합 결과">
          <div class="arc-match__pair">
            <Side who={match.a} />
            <span class="arc-match__heart" style={{ "--match": `${match.score}%` }}>
              <Icon name="heart" size={64} filled />
              <strong class="display num">
                <CountUp value={match.score} format={(value) => `${Math.round(value)}`} duration={1100} />
                <small>%</small>
              </strong>
            </span>
            <Side who={match.b} />
          </div>
          <p class="arc-match__line display">{match.line}</p>
          {match.points.length ? (
            <ul class="arc-match__points">
              {match.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          ) : null}
          <div class="arc-over__actions">
            <button
              type="button"
              class="btn btn--secondary"
              onClick={() => shareResult(`메이플M 플러스 캐릭터 궁합 · ${match.a.name} ♥ ${match.b.name} ${match.score}%\n${match.line}`)}
            >
              <Icon name="share" size={18} />
              결과 복사
            </button>
          </div>
          <p class="arc-fortune__note">재미로 보는 궁합이에요.</p>
        </section>
      ) : null}
    </>
  );
}
