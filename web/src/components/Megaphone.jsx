// 첫 화면 전광판: 방문자가 쓴 짧은 글(40자)이 검색창 아래 판에서 흘러간다. 최근 24시간 글 20개, 1분마다 새로 읽는다.
// GET·POST /api/v2/megaphone(서버가 욕설·링크·전화번호·도배를 막고 2분에 한 번만 받는다).
import "../styles/megaphone.css";
import { useEffect, useState } from "preact/hooks";
import { getJson, postJson } from "../lib/api.js";
import { Icon } from "./Icon.jsx";
import { toast } from "./Toast.jsx";

const MAX = 40;
const POLL_MS = 60 * 1000;

export function Megaphone() {
  const [messages, setMessages] = useState(/** @type {Array<{ id: string, text: string }>} */ ([]));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      getJson("/api/v2/megaphone").then(
        ({ response, body }) => {
          if (alive && response.ok && body?.ok) setMessages(body.messages || []);
        },
        () => {}
      );
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const submit = async (/** @type {Event} */ event) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const { response, body } = await postJson("/api/v2/megaphone", { text: value });
      if (!response.ok || !body?.ok) {
        toast(body?.message || "올리지 못했어요.", "error");
        return;
      }
      setMessages((list) => [body.message, ...list.filter((entry) => entry.id !== body.message.id)]);
      setText("");
      toast("전광판에 올렸어요", "success");
    } catch (error) {
      toast(error?.message || "올리지 못했어요.", "error");
    } finally {
      setBusy(false);
    }
  };

  const chars = messages.reduce((sum, entry) => sum + [...entry.text].length + 4, 0);
  // 글이 짧으면 판을 채울 만큼 되풀이한다(한 줄이 판보다 짧으면 끊겨 보인다)
  const repeat = chars ? Math.max(1, Math.ceil(70 / chars)) : 1;
  // 글자가 많을수록 천천히(한 바퀴 최소 14초)
  const duration = Math.max(14, Math.round(chars * repeat * 0.32));
  const shown = Array.from({ length: repeat }, (_, round) => messages.map((entry) => ({ ...entry, key: `${round}-${entry.id}` }))).flat();

  return (
    <div class="mega">
      <div class="mega__board">
        <span class="mega__badge">
          <Icon name="chat" size={16} />
          전광판
        </span>
        <div class="mega__window" tabIndex={messages.length ? 0 : -1} aria-label="전광판 글">
          {messages.length ? (
            <>
              <ul class="sr-only">
                {messages.map((entry) => (
                  <li key={entry.id}>{entry.text}</li>
                ))}
              </ul>
              <div class="mega__track" style={{ "--mega-duration": `${duration}s` }} aria-hidden="true">
                {[0, 1].map((copy) => (
                  <span key={copy} class="mega__run">
                    {shown.map((entry) => (
                      <span key={entry.key} class="mega__item">
                        {entry.text}
                      </span>
                    ))}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <span class="mega__empty">첫 전광판 글을 띄워 보세요!</span>
          )}
        </div>
      </div>
      <form class="mega__form" onSubmit={submit}>
        <label class="sr-only" for="mega-text">
          전광판에 띄울 말
        </label>
        <span class="mega__field">
          <input
            id="mega-text"
            class="input"
            type="text"
            maxLength={MAX}
            autoComplete="off"
            enterKeyHint="send"
            placeholder="전광판에 띄울 한마디"
            value={text}
            onInput={(event) => setText(/** @type {HTMLInputElement} */ (event.currentTarget).value)}
          />
          <span class="mega__count num" aria-hidden="true">
            {[...text].length}/{MAX}
          </span>
        </span>
        <button type="submit" class="btn btn--secondary mega__send" disabled={!text.trim() || busy}>
          <Icon name="arrowRight" size={18} />
          띄우기
        </button>
      </form>
    </div>
  );
}
