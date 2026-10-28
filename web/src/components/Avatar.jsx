import { useEffect, useState } from "preact/hooks";
import { loadCharacterImage } from "../lib/api.js";
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
 * @param {{ kind?: import("../lib/game.js").SearchKind, world: string, name: string, src?: string, size?: number }} props
 */
export function Avatar({ kind = "character", world, name, src = "", size = 44 }) {
  const [url, setUrl] = useState(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (src || kind !== "character" || !world || !name || name === "-") {
      setUrl(src);
      return undefined;
    }
    setUrl("");
    let alive = true;
    loadCharacterImage(world, name).then((imageUrl) => {
      if (alive && imageUrl) setUrl(imageUrl);
    });
    return () => {
      alive = false;
    };
  }, [src, kind, world, name]);

  const showImage = Boolean(url) && !failed;
  const alt = kind === "guild" ? `${name} 길드 마크` : `${name} 캐릭터 이미지`;

  return (
    <span class={`avatar avatar--${kind} tone-${toneFor(name)}`} style={{ "--avatar-size": `${size}px` }}>
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
