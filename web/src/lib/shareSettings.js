// 공유 이미지에 자랑 문구("상위 N%, 블랙큐브 N개 …")를 넣을지: 기본 켜짐, 이 브라우저에 기억한다.
// 장비창 스위치·장비 시트 체크·툴팁 공유 버튼이 같은 값을 쓴다.
import { useEffect, useState } from "preact/hooks";

const KEY = "mmp.share.caption";
/** @type {Set<(on: boolean) => void>} */
const listeners = new Set();

function read() {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

let current = typeof window === "undefined" ? true : read();

/** @param {boolean} on */
export function setShareCaption(on) {
  current = Boolean(on);
  try {
    window.localStorage.setItem(KEY, current ? "on" : "off");
  } catch {
    // 저장할 수 없으면 이번 방문 동안만.
  }
  listeners.forEach((listener) => listener(current));
}

/** @returns {[boolean, (on: boolean) => void]} */
export function useShareCaption() {
  const [on, setOn] = useState(current);
  useEffect(() => {
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return [on, setShareCaption];
}
