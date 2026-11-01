// 동급 비교(캐릭터 화면, 프로필 아래): 같은 직업·레벨대·월드·길드·생성 연도 안에서 전투력(14일 최고)·템환산이 위에서 몇 %인지 칩으로,
// 누르면 그 무리의 분포와 다음 구간까지 남은 값. 내실 지수(같은 직업·레벨대·비슷한 템환산 무리 안의 전투력 자리)는 하위 30%면 내실 탭으로.
// GET /api/v2/stats/peers(계산은 src/domain/stats/peer-lens.js). 처음 조회한 캐릭터는 스펙이 저장된 뒤 한 번 더 읽는다.
import "../../styles/peers.css";
import { useEffect, useState } from "preact/hooks";
import { Card } from "../../components/Card.jsx";
import { Icon } from "../../components/Icon.jsx";
import { getJson } from "../../lib/api.js";
import { formatComma, formatDecimal, formatKoreanUnits } from "../../lib/format.js";
import { setScoreText } from "../../lib/itemScore.js";
import { urls } from "../../lib/game.js";

const KIND = { class: "직업", level: "레벨대", world: "월드", guild: "길드", year: "동기" };
const RETRY_MS = 5000;

const topText = (top) => `상위 ${top < 1 ? formatDecimal(top, 2) : formatDecimal(top, 1)}%`;
const powerText = (value) => formatKoreanUnits(Math.round(value), { maxGroups: Math.abs(value) >= 1e8 ? 2 : 1 });
const signed = (value, format) => `${value >= 0 ? "+" : "−"}${format(Math.abs(value))}`;

/** @param {string} ocid @param {string} guildName */
function usePeers(ocid, guildName) {
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "empty", data?: any }} */ ({ status: "loading" }));
  useEffect(() => {
    if (!ocid) return undefined;
    let alive = true;
    let timer = 0;
    setState({ status: "loading" });
    const load = (retry) => {
      const params = new URLSearchParams({ ocid });
      if (guildName) params.set("guild_name", guildName);
      if (retry) params.set("retry", "1");
      getJson(`/api/v2/stats/peers?${params}`).then(
        ({ response, body }) => {
          if (!alive) return;
          if (response.ok && body?.ok && body.peers) setState({ status: "ready", data: body.peers });
          else if (response.ok && !retry) timer = window.setTimeout(() => load(true), RETRY_MS);
          else setState({ status: "empty" });
        },
        () => alive && setState({ status: "empty" })
      );
    };
    load(false);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [ocid, guildName]);
  return state;
}

/** 칩 하나: 무리 이름, 큰 글씨(전투력 상위 %, 길드는 등수), 작은 글씨(템환산 상위 %). 전투력을 모르면 템환산이 큰 글씨. */
function LensChip({ lens, open, onToggle, panelId }) {
  const main = lens.power || lens.item;
  const mainText = lens.key === "guild" && lens.power ? `${formatComma(lens.power.rank)}위` : topText(main.top);
  let sub = "";
  if (lens.thin) sub = `표본 ${formatComma(lens.sample)}명`;
  else if (lens.key === "guild" && lens.power) sub = `${lens.members > lens.power.total ? "기록 있는 " : ""}${formatComma(lens.power.total)}명 중`;
  else if (lens.power && lens.item) sub = `템환산 ${topText(lens.item.top)}`;
  else if (!lens.power) sub = "템환산 기준";
  return (
    <button
      type="button"
      class={`peer-chip is-${main.grade}${lens.thin ? " is-thin" : ""}`}
      aria-expanded={open ? "true" : "false"}
      aria-controls={panelId}
      onClick={onToggle}
    >
      <span class="peer-chip__kind">{KIND[lens.key]}</span>
      <span class="peer-chip__label">{lens.label}</span>
      <strong class="peer-chip__main num">{mainText}</strong>
      <span class="peer-chip__sub num">{sub}</span>
    </button>
  );
}

function InnerChip({ inner, open, onToggle, panelId }) {
  return (
    <button
      type="button"
      class={`peer-chip${inner.enough ? ` is-${inner.grade}` : " is-thin"}`}
      aria-expanded={open ? "true" : "false"}
      aria-controls={panelId}
      onClick={onToggle}
    >
      <span class="peer-chip__kind">내실 지수</span>
      <span class="peer-chip__label">비슷한 장비</span>
      <strong class="peer-chip__main num">{inner.enough ? topText(inner.top) : "-"}</strong>
      <span class="peer-chip__sub num">{inner.enough ? `중앙값보다 ${signed(inner.diff, powerText)}` : `표본 ${formatComma(inner.sample)}명`}</span>
    </button>
  );
}

/** 무리의 분포 막대 + 내 칸 + 다음 구간까지 남은 값 + 그 무리 랭킹 */
function LensPanel({ lens, me, world }) {
  const dist = lens.dist;
  if (!dist) return null;
  const isItem = dist.metric === "item";
  const format = isItem ? (value) => `${setScoreText(value)}점` : powerText;
  const most = Math.max(...dist.counts, 1);
  const edge = (index) => dist.edges[index];
  const middle = Math.floor(dist.counts.length / 2);
  let link = null;
  const metric = isItem ? "itemScore" : "combatPower";
  if (lens.key === "class") link = { href: `/ranking?${new URLSearchParams({ view: "spec", metric, class: lens.label })}`, label: `${lens.label} 스펙 랭킹` };
  if (lens.key === "world") link = { href: `/ranking?${new URLSearchParams({ view: "spec", metric, world_name: lens.label })}`, label: `${lens.label} 스펙 랭킹` };
  if (lens.key === "guild") link = { href: urls.guild(world, lens.label), label: "길드 보기" };
  return (
    <>
      <p class="peer-panel__title">
        <strong>{lens.label}</strong> {formatComma(lens.sample)}명 · {isItem ? "템환산" : "전투력"}
      </p>
      <div class="peer-bars" role="img" aria-label={`${lens.label} 분포에서 ${isItem ? "템환산" : "전투력"} ${format(isItem ? me.itemScore : me.power)}의 자리`}>
        {dist.counts.map((count, index) => (
          <span
            key={index}
            class={`peer-bars__bar${index === dist.mine ? " is-mine" : ""}`}
            style={{ "--h": `${Math.max(3, (count / most) * 100)}%` }}
            title={`${format(edge(index))} ~ ${format(edge(index + 1))}: ${formatComma(count)}명`}
          >
            {index === dist.mine ? <em>나</em> : null}
          </span>
        ))}
      </div>
      <div class="peer-bars__axis num" aria-hidden="true">
        <span>{format(edge(0))}</span>
        <span>{format(edge(middle))}</span>
        <span>{format(edge(dist.counts.length))}</span>
      </div>
      <div class="peer-panel__foot">
        <p class="peer-panel__next">
          {dist.next !== null ? (
            <>
              <strong class="num">{format(edge(dist.mine + 1))}</strong> 구간까지 <strong class="num">{format(dist.next)}</strong>
            </>
          ) : (
            "가장 높은 구간"
          )}
        </p>
        {link ? (
          <a class="btn btn--secondary btn--sm" href={link.href}>
            {link.label}
          </a>
        ) : null}
      </div>
    </>
  );
}

function InnerPanel({ inner, me, onOpenGrowth }) {
  const range = `${me.className} · Lv.${inner.level.from}~${inner.level.to} · 템환산 ${setScoreText(inner.score.from)}~${setScoreText(inner.score.to)}점`;
  if (!inner.enough) {
    return (
      <p class="peer-panel__title">
        <strong>{range}</strong> {formatComma(inner.sample)}명 — 비슷한 장비의 캐릭터가 더 모이면 보여요
      </p>
    );
  }
  return (
    <>
      <p class="peer-panel__title">
        <strong>{range}</strong> {formatComma(inner.sample)}명 · 전투력
      </p>
      <dl class="peer-inner">
        <div>
          <dt>나</dt>
          <dd class="num">{powerText(me.power)}</dd>
        </div>
        <div>
          <dt>중앙값</dt>
          <dd class="num">{powerText(inner.median)}</dd>
        </div>
        <div>
          <dt>차이</dt>
          <dd class={`num ${inner.diff >= 0 ? "is-up" : "is-down"}`}>{signed(inner.diff, powerText)}</dd>
        </div>
        <div>
          <dt>순위</dt>
          <dd class="num">
            {formatComma(inner.rank)} / {formatComma(inner.total)}
          </dd>
        </div>
      </dl>
      {inner.top > 70 ? (
        <div class="peer-panel__foot">
          <p class="peer-panel__next">장비에 비해 전투력이 낮은 편이에요</p>
          <button type="button" class="btn btn--primary btn--sm" onClick={onOpenGrowth}>
            <Icon name="trophy" size={16} />
            내실 탭 보기
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * @param {{ ocid: string, world: string, guildName?: string, onOpenTab: (tab: string) => void }} props
 */
export function Peers({ ocid, world, guildName = "", onOpenTab }) {
  const state = usePeers(ocid, guildName && guildName !== "-" ? guildName : "");
  const [open, setOpen] = useState("");
  const panelId = `peer-panel-${ocid.slice(0, 8)}`;
  if (state.status === "empty") return null;
  if (state.status === "loading") {
    return (
      <Card title="동급 비교" icon="user" tone="lavender" class="peer-card">
        <div class="peer-chips" aria-busy="true">
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} class="peer-chip is-skeleton" />
          ))}
        </div>
      </Card>
    );
  }
  const { me, lenses, inner, collected } = state.data;
  if (!lenses.length && !inner) return null;
  const toggle = (key) => setOpen((current) => (current === key ? "" : key));
  const openLens = lenses.find((lens) => lens.key === open);
  return (
    <Card title="동급 비교" description={`모은 ${formatComma(collected)}명 기준`} icon="user" tone="lavender" class="peer-card">
      <div class="peer-chips">
        {lenses.map((lens) => (
          <LensChip key={lens.key} lens={lens} open={open === lens.key} onToggle={() => toggle(lens.key)} panelId={panelId} />
        ))}
        {inner ? <InnerChip inner={inner} open={open === "inner"} onToggle={() => toggle("inner")} panelId={panelId} /> : null}
      </div>
      {open ? (
        <div class="peer-panel" id={panelId}>
          {open === "inner" && inner ? <InnerPanel inner={inner} me={me} onOpenGrowth={() => onOpenTab("growth")} /> : null}
          {openLens ? <LensPanel lens={openLens} me={me} world={world} /> : null}
        </div>
      ) : null}
    </Card>
  );
}
