// 스펙 쌍둥이: 같은 직업에서 템환산(±8%)·잠재·에디·레벨이 나와 가장 비슷한 캐릭터 6명과 전투력 차이.
// 비슷한 장비보다 한참 낮은 전투력(사냥 프리셋으로 잰 값)은 서버가 0 으로 보내 "-". GET /api/v2/stats/twins.
import { useEffect, useState } from "preact/hooks";
import { Avatar } from "../../components/Avatar.jsx";
import { WorldIcon } from "../../components/GameIcons.jsx";
import { Icon } from "../../components/Icon.jsx";
import { Sheet } from "../../components/Sheet.jsx";
import { getJson } from "../../lib/api.js";
import { formatDecimal, formatKoreanUnits } from "../../lib/format.js";
import { urls } from "../../lib/game.js";
import { setScoreText } from "../../lib/itemScore.js";

const power = (value) => (value > 0 ? formatKoreanUnits(value, { maxGroups: value >= 1e8 ? 2 : 1 }) : "-");

/** @param {{ ocid: string, world: string, name: string }} props */
export function Twins({ ocid, world, name }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(/** @type {{ status: "idle" | "loading" | "ready" | "error", data?: any }} */ ({ status: "idle" }));

  useEffect(() => {
    if (!open || state.status !== "idle") return undefined;
    let alive = true;
    setState({ status: "loading" });
    getJson(`/api/v2/stats/twins?${new URLSearchParams({ ocid })}`).then(
      ({ response, body }) => alive && setState(response.ok && body?.ok ? { status: "ready", data: body } : { status: "error" }),
      () => alive && setState({ status: "error" })
    );
    return () => {
      alive = false;
    };
  }, [open]);

  const me = state.data?.me;
  const twins = state.data?.twins || [];
  const stronger = me?.power ? twins.filter((twin) => twin.power > me.power).length : 0;

  return (
    <>
      <button type="button" class="eq-luck" onClick={() => setOpen(true)}>
        <Icon name="user" size={16} />
        스펙 쌍둥이
      </button>
      <Sheet open={open} title="스펙 쌍둥이" class="twins-sheet" onClose={() => setOpen(false)}>
        {state.status === "loading" ? <p class="twins__note">비슷한 캐릭터를 찾는 중…</p> : null}
        {state.status === "error" ? <p class="twins__note">불러오지 못했어요.</p> : null}
        {state.status === "ready" && !me ? <p class="twins__note">아직 모은 장비 기록이 없어 찾을 수 없어요.</p> : null}
        {state.status === "ready" && me ? (
          <div class="twins">
            <p class="twins__lead">
              {twins.length
                ? `${me.className} 중 장비가 가장 비슷한 ${twins.length}명${me.power ? ` · 나보다 전투력이 높은 쌍둥이 ${stronger}명` : ""}`
                : `아직 ${me.className} 중 장비가 비슷한 캐릭터를 찾지 못했어요.`}
            </p>
            <ol class="twins__list">
              {[{ ...me, isMe: true }, ...twins].map((row) => {
                const diff = me.power > 0 && row.power > 0 && !row.isMe ? row.power / me.power - 1 : null;
                return (
                  <li key={`${row.world}/${row.name}`} class={row.isMe ? "is-me" : ""}>
                    <a class="twins__who" href={urls.character(row.world, row.name)}>
                      <Avatar world={row.world} name={row.name} size={40} lazy />
                      <span class="twins__name">
                        <strong>{row.isMe ? `${row.name} (나)` : row.name}</strong>
                        <span>
                          <WorldIcon world={row.world} size={14} /> Lv.{row.level}
                        </span>
                      </span>
                    </a>
                    <span class="twins__spec num">
                      템환산 {setScoreText(row.itemScore)} · 잠재 {formatDecimal(row.potential || 0, 1)}% · 에디 {formatDecimal(row.additionalPotential || 0, 1)}%
                    </span>
                    <span class="twins__power num">
                      <strong>{power(row.power)}</strong>
                      {diff !== null ? <span class={diff >= 0 ? "is-up" : "is-down"}>{`${diff >= 0 ? "+" : "-"}${formatDecimal(Math.abs(diff) * 100, 0)}%`}</span> : null}
                    </span>
                    {!row.isMe ? (
                      <a class="twins__compare" href={`/compare?${new URLSearchParams({ a: `${world}/${name}`, b: `${row.world}/${row.name}` })}`}>
                        비교
                        <Icon name="chevronRight" size={14} />
                      </a>
                    ) : (
                      <span />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
