// 오늘의 운세(재미용): 월드·캐릭터 이름으로 오늘(서울 날짜) 운세. 같은 날에는 몇 번을 봐도 같다.
// 행운의 장비는 모은 장신구 중 하나(주인 캐릭터로 가는 링크). GET /api/v2/fortune.
import { useEffect, useState } from "preact/hooks";
import { WorldIcon } from "../../components/GameIcons.jsx";
import { Icon } from "../../components/Icon.jsx";
import { CountUp } from "../../components/Motion.jsx";
import { getJson, toApiError } from "../../lib/api.js";
import { WORLDS, urls } from "../../lib/game.js";
import { getSaved } from "../../lib/storage.js";
import { ItemTile, shareResult } from "./shared.jsx";

const GRADE_ICON = {
  레어: "/assets/ico-potential-rare.png",
  에픽: "/assets/ico-potential-epic.png",
  유니크: "/assets/ico-potential-unique.png",
  레전더리: "/assets/ico-potential-legendary.png"
};

/** 즐겨찾기·최근 본 캐릭터 중 첫 번째 */
function firstSaved() {
  try {
    const { favorites, recent } = getSaved();
    const entry = [...favorites, ...recent].find((item) => item.kind === "character");
    return entry ? { world: entry.world, name: entry.name } : null;
  } catch {
    return null;
  }
}

/** @param {{ count: number }} props */
function Stars({ count }) {
  return (
    <span class="arc-fortune__stars" role="img" aria-label={`별 5개 중 ${count}개`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} class={index < count ? "is-on" : ""}>
          ★
        </span>
      ))}
    </span>
  );
}

export function Fortune() {
  const saved = firstSaved();
  const [world, setWorld] = useState(saved?.world || WORLDS[0]);
  const [name, setName] = useState(saved?.name || "");
  const [query, setQuery] = useState(/** @type {{ world: string, name: string } | null} */ (saved));
  const [state, setState] = useState(/** @type {{ status: "idle" | "loading" | "ready" | "error", fortune?: any, error?: any }} */ ({ status: "idle" }));

  useEffect(() => {
    if (!query) return undefined;
    let alive = true;
    setState({ status: "loading" });
    getJson(`/api/v2/fortune?${new URLSearchParams({ world_name: query.world, name: query.name })}`).then(
      ({ response, body }) =>
        alive && setState(response.ok && body?.ok ? { status: "ready", fortune: body.fortune } : { status: "error", error: toApiError(response, body, body?.message || "운세를 보지 못했어요.") }),
      (error) => alive && setState({ status: "error", error })
    );
    return () => {
      alive = false;
    };
  }, [query?.world, query?.name]);

  const fortune = state.fortune;
  const share = () =>
    shareResult(
      `메이플M 플러스 오늘의 운세 · ${fortune.world} ${fortune.name}\n총운 ${fortune.total}점 · ${fortune.line}\n` +
        fortune.areas.map((area) => `${area.label} ${"★".repeat(area.stars)}${"☆".repeat(5 - area.stars)}`).join(" · ") +
        (fortune.item ? `\n행운의 장비: ${fortune.item.name}` : "")
    );

  return (
    <>
      <form
        class="arc-fortune__form card"
        onSubmit={(event) => {
          event.preventDefault();
          const clean = name.trim();
          if (clean) setQuery({ world, name: clean });
        }}
      >
        <span class="select">
          <select aria-label="월드" value={world} onChange={(event) => setWorld(/** @type {HTMLSelectElement} */ (event.currentTarget).value)}>
            {WORLDS.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={18} class="select__icon" />
        </span>
        <input
          class="input"
          type="text"
          maxLength={24}
          aria-label="캐릭터 이름"
          placeholder="캐릭터 이름"
          value={name}
          onInput={(event) => setName(/** @type {HTMLInputElement} */ (event.currentTarget).value)}
        />
        <button type="submit" class="btn btn--primary" disabled={!name.trim()}>
          <Icon name="sun" size={18} />
          운세 보기
        </button>
      </form>

      {state.status === "loading" ? <p class="arc-fortune__wait">별자리를 읽는 중…</p> : null}
      {state.status === "error" ? <p class="arc-fortune__wait">{state.error?.message || "운세를 보지 못했어요."}</p> : null}
      {state.status === "ready" && fortune ? (
        <section class="arc-fortune card" key={`${fortune.world}-${fortune.name}-${fortune.date}`} aria-label="오늘의 운세">
          <header class="arc-fortune__head">
            <span class="arc-fortune__who">
              <WorldIcon world={fortune.world} size={18} />
              {fortune.world} · <strong>{fortune.name}</strong>
            </span>
            <span class="arc-fortune__date num">{fortune.date.replace(/-/g, ".")}</span>
          </header>
          <div class="arc-fortune__total">
            <span class="arc-fortune__ring" style={{ "--fortune": `${fortune.total * 3.6}deg` }}>
              <strong class="display num">
                <CountUp value={fortune.total} format={(value) => String(Math.round(value))} duration={1000} />
              </strong>
              <span>총운</span>
            </span>
            <p class="arc-fortune__line display">{fortune.line}</p>
          </div>
          <ul class="arc-fortune__areas">
            {fortune.areas.map((area) => (
              <li key={area.key}>
                <span class="arc-fortune__label">{area.label}</span>
                <Stars count={area.stars} />
                <span class="arc-fortune__text">{area.line}</span>
              </li>
            ))}
          </ul>
          <div class="arc-fortune__lucky">
            {fortune.item ? (
              <div class="arc-fortune__item">
                <span class="arc-fortune__label">행운의 장비</span>
                <span class="arc-fortune__item-row">
                  <ItemTile item={fortune.item} size={44} />
                  <span>
                    <strong>
                      {fortune.item.name}
                      {fortune.item.star ? <span class="num"> ★{fortune.item.star}</span> : null}
                    </strong>
                    <a href={urls.character(fortune.item.owner.world, fortune.item.owner.name)}>
                      주인 {fortune.item.owner.name}
                      <Icon name="chevronRight" size={14} />
                    </a>
                  </span>
                </span>
              </div>
            ) : null}
            <dl class="arc-fortune__facts">
              <div>
                <dt>행운의 보스</dt>
                <dd>{fortune.luckyBoss}</dd>
              </div>
              <div>
                <dt>행운의 월드</dt>
                <dd>
                  <WorldIcon world={fortune.luckyWorld} size={16} />
                  {fortune.luckyWorld}
                </dd>
              </div>
              <div>
                <dt>행운의 등급</dt>
                <dd>
                  {GRADE_ICON[fortune.luckyGrade] ? <img src={GRADE_ICON[fortune.luckyGrade]} alt="" width={16} height={16} /> : null}
                  {fortune.luckyGrade}
                </dd>
              </div>
              <div>
                <dt>행운의 숫자</dt>
                <dd class="num">{fortune.luckyNumber}</dd>
              </div>
            </dl>
          </div>
          <div class="arc-over__actions">
            <button type="button" class="btn btn--secondary" onClick={share}>
              <Icon name="share" size={18} />
              운세 복사
            </button>
          </div>
          <p class="arc-fortune__note">재미로 보는 운세예요. 내일 또 바뀌어요.</p>
        </section>
      ) : null}
    </>
  );
}
