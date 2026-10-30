// 보스 파티(계산기): 캐릭터를 최대 6명 넣으면 보스마다 누가 들어갈 수 있는지(레벨·전투력, boss-entry.json)를 한 표로.
// 모은 스펙의 전투력(사냥 프리셋으로 잰 듯하면 모름)을 쓴다. POST /api/v2/records/brief. 즐겨찾기로 채우기.
import bossData from "../../../../src/game-data/boss-entry.json";
import { useState } from "preact/hooks";
import { WorldIcon } from "../../components/GameIcons.jsx";
import { Icon } from "../../components/Icon.jsx";
import { postJson } from "../../lib/api.js";
import { formatKoreanUnits } from "../../lib/format.js";
import { DEFAULT_WORLD, WORLDS, urls } from "../../lib/game.js";
import { getSaved } from "../../lib/storage.js";

const SIZE = 6;
const short = (value) => formatKoreanUnits(value, { maxGroups: value >= 1e8 ? 2 : 1 });
const blank = () => Array.from({ length: SIZE }, () => ({ world: DEFAULT_WORLD, name: "" }));

/** 한 칸: 들어갈 수 있으면 ✓, 아니면 무엇이 모자란지 */
function entryCell(boss, member) {
  if (!member) return { state: "unknown", text: "?" };
  if (member.level < boss.level) return { state: "no", text: `Lv.${boss.level}` };
  if (!member.power) return { state: "unknown", text: "?" };
  if (member.power < boss.power) return { state: "no", text: `-${short(boss.power - member.power)}` };
  return { state: boss.recommend?.power && member.power >= boss.recommend.power ? "easy" : "yes", text: "✓" };
}

export function PartyCalc() {
  const [members, setMembers] = useState(blank);
  const [state, setState] = useState(/** @type {{ status: "idle" | "loading" | "ready" | "error", specs?: Map<string, any> }} */ ({ status: "idle" }));
  const filled = members.filter((member) => member.name.trim());

  const edit = (/** @type {number} */ index, /** @type {Partial<{ world: string, name: string }>} */ patch) =>
    setMembers(members.map((member, i) => (i === index ? { ...member, ...patch } : member)));

  const fromSaved = () => {
    const { favorites, recent } = getSaved();
    const seen = new Set();
    const picks = [...favorites, ...recent]
      .filter((entry) => entry.kind === "character" && !seen.has(`${entry.world}/${entry.name}`) && seen.add(`${entry.world}/${entry.name}`))
      .slice(0, SIZE)
      .map(({ world, name }) => ({ world, name }));
    setMembers([...picks, ...blank()].slice(0, SIZE));
  };

  const check = async (/** @type {Event} */ event) => {
    event.preventDefault();
    if (!filled.length) return;
    setState({ status: "loading" });
    try {
      const { response, body } = await postJson("/api/v2/records/brief", { characters: filled.map((member) => ({ world: member.world, name: member.name.trim() })) });
      if (!response.ok || !body?.ok) return setState({ status: "error" });
      setState({ status: "ready", specs: new Map((body.briefs || []).map((row) => [`${row.world}/${row.name}`, row])) });
    } catch {
      setState({ status: "error" });
    }
  };

  const party = state.status === "ready" ? filled.map((member) => ({ ...member, spec: state.specs?.get(`${member.world}/${member.name.trim()}`) || null })) : [];
  const bosses = [...bossData.bosses].sort((a, b) => a.power - b.power);

  return (
    <div class="party">
      <form class="card party__form" onSubmit={check} aria-label="파티원">
        <ol class="party__members">
          {members.map((member, index) => (
            <li key={index}>
              <span class="party__no num">{index + 1}</span>
              <span class="select">
                <select aria-label={`${index + 1}번 월드`} value={member.world} onChange={(event) => edit(index, { world: /** @type {HTMLSelectElement} */ (event.currentTarget).value })}>
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
                aria-label={`${index + 1}번 캐릭터 이름`}
                placeholder="캐릭터 이름"
                value={member.name}
                onInput={(event) => edit(index, { name: /** @type {HTMLInputElement} */ (event.currentTarget).value })}
              />
            </li>
          ))}
        </ol>
        <div class="party__actions">
          <button type="button" class="btn btn--secondary" onClick={fromSaved}>
            <Icon name="heart" size={18} />내 캐릭터로 채우기
          </button>
          <button type="submit" class="btn btn--primary" disabled={!filled.length || state.status === "loading"}>
            <Icon name="check" size={18} />
            {state.status === "loading" ? "확인하는 중" : "입장 확인"}
          </button>
        </div>
      </form>

      {state.status === "error" ? <p class="party__note">불러오지 못했어요.</p> : null}
      {state.status === "ready" ? (
        <section class="card party__result" aria-label="보스 입장">
          <div class="party__scroll">
            <table class="party__table">
              <thead>
                <tr>
                  <th scope="col">보스</th>
                  {party.map((member) => (
                    <th scope="col" key={`${member.world}/${member.name}`}>
                      <a href={urls.character(member.world, member.name.trim())}>
                        <WorldIcon world={member.world} size={14} />
                        {member.name.trim()}
                      </a>
                      <span class="num">{member.spec ? `Lv.${member.spec.level} · ${member.spec.power ? short(member.spec.power) : "전투력 ?"}` : "기록 없음"}</span>
                    </th>
                  ))}
                  <th scope="col">파티</th>
                </tr>
              </thead>
              <tbody>
                {bosses.map((boss) => {
                  const cells = party.map((member) => entryCell(boss, member.spec));
                  const can = cells.filter((cell) => cell.state === "yes" || cell.state === "easy").length;
                  return (
                    <tr key={`${boss.name}-${boss.difficulty}`} class={can === party.length ? "is-all" : ""}>
                      <th scope="row">
                        <strong>
                          {boss.difficulty} {boss.name}
                        </strong>
                        <span class="num">
                          Lv.{boss.level} · {short(boss.power)}
                        </span>
                      </th>
                      {cells.map((cell, index) => (
                        <td key={index} class={`is-${cell.state}`}>
                          {cell.text}
                        </td>
                      ))}
                      <td class="party__count num">
                        {can}/{party.length}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p class="party__legend">
            <span class="is-easy">✓ 권장 전투력 이상</span>
            <span class="is-yes">✓ 입장 가능</span>
            <span class="is-no">모자란 레벨·전투력</span>
            <span class="is-unknown">? 기록 없음·전투력 모름(캐릭터를 한 번 열어 보세요)</span>
          </p>
        </section>
      ) : null}
    </div>
  );
}
