// 닉네임 생성기: 모은 캐릭터 이름 약 14만 개의 글자 이어짐을 따라 지은 새 이름 12개(모은 이름에는 없는 것만).
// 한글·영문, 첫 글자 정하기. 누르면 복사. GET /api/v2/fun/nicknames.
import { useEffect, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { Segmented } from "../../components/Tabs.jsx";
import { toast } from "../../components/Toast.jsx";
import { getJson } from "../../lib/api.js";
import { copyText } from "../../lib/share.js";

const KINDS = [
  { value: "ko", label: "한글" },
  { value: "en", label: "영문" }
];

export function Nickname() {
  const [kind, setKind] = useState("ko");
  const [prefix, setPrefix] = useState("");
  const [round, setRound] = useState(0);
  const [state, setState] = useState(/** @type {{ status: "loading" | "ready" | "error", names: string[] }} */ ({ status: "loading", names: [] }));
  const [query, setQuery] = useState({ kind: "ko", prefix: "" });

  useEffect(() => {
    let alive = true;
    setState((prev) => ({ status: "loading", names: prev.names }));
    getJson(`/api/v2/fun/nicknames?${new URLSearchParams(query)}`).then(
      ({ response, body }) => alive && setState(response.ok && body?.ok ? { status: "ready", names: body.names || [] } : { status: "error", names: [] }),
      () => alive && setState({ status: "error", names: [] })
    );
    return () => {
      alive = false;
    };
  }, [query, round]);

  const make = (/** @type {Event} */ event) => {
    event?.preventDefault();
    const next = { kind, prefix: prefix.trim() };
    if (next.kind === query.kind && next.prefix === query.prefix) setRound((n) => n + 1);
    else setQuery(next);
  };

  const copy = async (/** @type {string} */ name) => {
    toast((await copyText(name)) ? `${name} 복사했어요` : "복사하지 못했어요", "success");
  };

  return (
    <>
      <form class="arc-nick__form card" onSubmit={make}>
        <Segmented
          name="nick-kind"
          legend="글자"
          value={kind}
          onChange={(value) => {
            setKind(value);
            setPrefix("");
            setQuery({ kind: value, prefix: "" });
          }}
          options={KINDS}
        />
        <input
          class="input"
          type="text"
          maxLength={2}
          autoComplete="off"
          aria-label="첫 글자(선택)"
          placeholder={kind === "en" ? "첫 글자 (예: mo)" : "첫 글자 (예: 햄)"}
          value={prefix}
          onInput={(event) => setPrefix(/** @type {HTMLInputElement} */ (event.currentTarget).value)}
        />
        <button type="submit" class="btn btn--primary">
          <Icon name="refresh" size={18} />
          새로 짓기
        </button>
      </form>

      <section class={`arc-nick card${state.status === "loading" ? " is-loading" : ""}`} aria-busy={state.status === "loading"} aria-label="지은 닉네임">
        {state.status === "error" ? <p class="arc-fortune__wait">짓지 못했어요. 다시 눌러 주세요.</p> : null}
        {state.status === "ready" && !state.names.length ? <p class="arc-fortune__wait">그 글자로 시작하는 이름은 못 지었어요. 다른 글자로 해 보세요.</p> : null}
        {state.names.length ? (
          <ul class="arc-nick__list" key={`${query.kind}-${query.prefix}-${round}`}>
            {state.names.map((name, index) => (
              <li key={name} style={{ "--stagger": index }}>
                <button type="button" class="arc-nick__name display" onClick={() => copy(name)} title="복사">
                  {name}
                  <Icon name="link" size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p class="arc-fortune__note">모은 캐릭터 이름에 없는 것만 보여요. 게임에서 쓸 수 있는지는 따로 확인해 주세요.</p>
      </section>
    </>
  );
}
