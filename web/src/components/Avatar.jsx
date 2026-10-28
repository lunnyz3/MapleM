import { useEffect, useRef, useState } from "preact/hooks";
import { loadCharacterImage } from "../lib/api.js";
import { useInView } from "../lib/motion.js";
import { Icon } from "./Icon.jsx";

const TONES = ["sky", "mint", "lavender", "peach", "gold"];

/** @param {string} text */
function toneFor(text) {
  let sum = 0;
  for (const char of text) sum += char.codePointAt(0) || 0;
  return TONES[sum % TONES.length];
}

/**
 * 캐릭터 이미지(넥슨 API) 또는 길드 마크. 불러오기 전·실패 시 이름 첫 글자.
 * 캐릭터는 src 가 없으면 /api/maplestorym/character/image 로 찾는다(동시 3개 제한).
 * lazy 면 화면에 보일 때 이미지를 찾는다(긴 랭킹 목록에서 넥슨 호출을 아낀다).
 * @param {{ kind?: import("../lib/game.js").SearchKind, world: string, name: string, src?: string, size?: number, lazy?: boolean }} props
 */
export function Avatar({ kind = "character", world, name, src = "", size = 44, lazy = false }) {
  const [url, setUrl] = useState(src);
  const [failed, setFailed] = useState(false);
  const ref = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const inView = useInView(ref, { rootMargin: "200px 0px", threshold: 0 });

  useEffect(() => {
    setFailed(false);
    if (src || kind !== "character" || !world || !name || name === "-") {
      setUrl(src);
      return undefined;
    }
    if (lazy && !inView) return undefined;
    setUrl("");
    let alive = true;
    loadCharacterImage(world, name).then((imageUrl) => {
      if (alive && imageUrl) setUrl(imageUrl);
    });
    return () => {
      alive = false;
    };
  }, [src, kind, world, name, lazy && inView]);

  const showImage = Boolean(url) && !failed;
  const alt = kind === "guild" ? `${name} 길드 마크` : `${name} 캐릭터 이미지`;

  return (
    <span ref={ref} class={`avatar avatar--${kind} tone-${toneFor(name)}`} style={{ "--avatar-size": `${size}px` }}>
      {showImage ? (
        <img src={url} alt={alt} width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : kind === "guild" ? (
        <Icon name="flag" size={Math.round(size * 0.5)} />
      ) : (
        <span class="avatar__initial" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
      )}
    </span>
  );
}
