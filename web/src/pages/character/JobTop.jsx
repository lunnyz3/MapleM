// 직업 1위와 비교: 같은 직업 전투력 1위·상위 10명 평균과 칸별 템환산(메인 세팅 = 칸마다 점수가 가장 높은 장비).
// 반지·목걸이는 점수 순으로 맞춘다. 서버 GET /api/v2/stats/job-top, 계산 src/domain/stats/job-meta.js.
import { useEffect, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { Sheet } from "../../components/Sheet.jsx";
import { getJson } from "../../lib/api.js";
import { formatDecimal } from "../../lib/format.js";
import { urls } from "../../lib/game.js";
import { itemScoreText, setScorePoints, setScoreText } from "../../lib/itemScore.js";

/** "반지 2" → "반지"(100점 기준표 부위) */
const baseSlot = (/** @type {string} */ slot) => slot.replace(/ \d+$/, "");
/** @param {string} slot @param {number | undefined} score */
const points = (slot, score) => (score ? Number(itemScoreText(baseSlot(slot), score)) : 0);
const signed = (/** @type {number} */ value) => `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatDecimal(Math.abs(value), 1)}`;

/** @param {{ ocid: string, className: string }} props */
export function JobTop({ ocid, className }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(/** @type {{ status: "idle" | "loading" | "ready" | "error", data?: any }} */ ({ status: "idle" }));

  useEffect(() => {
    if (!open || state.status !== "idle") return undefined;
    let alive = true;
    setState({ status: "loading" });
    getJson(`/api/v2/stats/job-top?${new URLSearchParams({ class: className, ocid })}`).then(
      ({ response, body }) => alive && setState(response.ok && body?.ok ? { status: "ready", data: body } : { status: "error" }),
      () => alive && setState({ status: "error" })
    );
    return () => {
      alive = false;
    };
  }, [open]);

  const data = state.data;
  const leader = data?.leader;
  const average = data?.average;
  const me = data?.me;
  const rows =
    leader && me
      ? [...new Set([...Object.keys(leader.slots), ...Object.keys(me.slots)])]
          .map((slot) => ({
            slot,
            me: points(slot, me.slots[slot]?.score),
            leader: points(slot, leader.slots[slot]?.score),
            average: points(slot, average?.slots?.[slot]),
            leaderItem: leader.slots[slot]?.itemName || "",
            raw: Math.max(leader.slots[slot]?.score || 0, me.slots[slot]?.score || 0)
          }))
          .filter((row) => row.me || row.leader || row.average)
          .sort((a, b) => b.raw - a.raw)
      : [];
  const gap = leader && me ? setScorePoints(leader.total) - setScorePoints(me.total) : 0;

  return (
    <>
      <button type="button" class="eq-luck" onClick={() => setOpen(true)}>
        <Icon name="crown" size={16} />
        직업 1위와 비교
      </button>
      <Sheet open={open} title={`${className} 1위와 비교`} onClose={() => setOpen(false)}>
        {state.status === "loading" ? <p class="jobtop__note">불러오는 중…</p> : null}
        {state.status === "error" ? <p class="jobtop__note">불러오지 못했어요.</p> : null}
        {state.status === "ready" && !leader ? <p class="jobtop__note">이 직업은 모은 캐릭터가 없어요.</p> : null}
        {state.status === "ready" && leader ? (
          <div class="jobtop">
            <div class="jobtop__head">
              <p class="luck__big">
                <span>나</span>
                <strong class="display num">{setScoreText(me.total)}</strong>
              </p>
              <a class="luck__big jobtop__leader" href={urls.character(leader.world, leader.name)}>
                <span>
                  1위 {leader.name} · {leader.world}
                </span>
                <strong class="display num">{setScoreText(leader.total)}</strong>
              </a>
              <p class="luck__big is-sub">
                <span>상위 {average.count}명 평균</span>
                <strong class="display num">{setScoreText(average.total)}</strong>
              </p>
            </div>
            {leader.ocid === ocid ? (
              <p class="jobtop__gap is-top">
                <Icon name="crown" size={16} />이 직업 전투력 1위예요
              </p>
            ) : gap > 0.05 ? (
              <p class="jobtop__gap">
                1위까지 템환산 <strong class="num">{formatDecimal(gap, 1)}점</strong>
              </p>
            ) : null}
            <div class="jobtop__table-wrap">
              <table class="jobtop__table">
                <thead>
                  <tr>
                    <th scope="col">칸</th>
                    <th scope="col">나</th>
                    <th scope="col">1위</th>
                    <th scope="col">평균</th>
                    <th scope="col">1위와 차이</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const diff = row.me - row.leader;
                    return (
                      <tr key={row.slot}>
                        <th scope="row">{row.slot}</th>
                        <td class="num">{row.me ? formatDecimal(row.me, 1) : "-"}</td>
                        <td class="num" title={row.leaderItem}>
                          {row.leader ? formatDecimal(row.leader, 1) : "-"}
                        </td>
                        <td class="num">{row.average ? formatDecimal(row.average, 1) : "-"}</td>
                        <td class={`num ${diff < -0.05 ? "is-down" : diff > 0.05 ? "is-up" : ""}`}>{Math.abs(diff) > 0.05 ? signed(diff) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
