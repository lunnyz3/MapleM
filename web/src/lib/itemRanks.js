// 장비 순위: 같은 계열·부위 장비 중 몇 등인지(사이트에서 조회된 캐릭터 + 매일 모으는 전투력 랭킹 1만 명 기준).
// 캐릭터마다 한 번 불러와 장비 fingerprint(서버가 장비마다 붙여 줌)로 찾는다. 툴팁과 공유 문구가 함께 쓴다.
import { useEffect, useState } from "preact/hooks";
import { getJson } from "./api.js";

/**
 * @typedef {Object} ItemRank
 * @property {number} rank
 * @property {number} total
 * @property {string} label  "아케인셰이드 무기" · 계열이 없으면 아이템 이름
 * @property {number} score  템환산 점수(문장 포함)
 * @property {number} scoreWithoutEmblem
 */

/** @type {Map<string, Promise<Record<string, ItemRank>>>} */
const byOcid = new Map();
/** @type {Map<string, ItemRank>} */
const byFingerprint = new Map();
/** @type {Set<() => void>} */
const listeners = new Set();

/**
 * 캐릭터 장비 순위를 불러온다(같은 캐릭터는 한 번만). 실패하면 빈 객체.
 * @param {string} ocid
 */
export function loadItemRanks(ocid) {
  const key = String(ocid || "").trim();
  if (!key) return Promise.resolve({});
  let pending = byOcid.get(key);
  if (!pending) {
    pending = getJson(`/api/v2/item-ranks?${new URLSearchParams({ ocid: key })}`)
      .then(({ response, body }) => (response.ok && body?.ok && body.ranks && typeof body.ranks === "object" ? body.ranks : {}))
      .catch(() => ({}))
      .then((ranks) => {
        Object.entries(ranks).forEach(([fingerprint, rank]) => byFingerprint.set(fingerprint, rank));
        listeners.forEach((listener) => listener());
        return ranks;
      });
    byOcid.set(key, pending);
  }
  return pending;
}

/**
 * 장비 한 개의 순위. 아직 없으면 null(불러오면 다시 그린다).
 * @param {string | undefined} fingerprint
 * @returns {ItemRank | null}
 */
export function useItemRank(fingerprint) {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((value) => value + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return (fingerprint && byFingerprint.get(fingerprint)) || null;
}

/**
 * 공유 문구용: 불러오는 중이면 기다린다.
 * @param {string} ocid @param {string | undefined} fingerprint
 * @returns {Promise<ItemRank | null>}
 */
export async function itemRankFor(ocid, fingerprint) {
  if (!fingerprint) return null;
  if (!byFingerprint.has(fingerprint) && ocid) await loadItemRanks(ocid);
  return byFingerprint.get(fingerprint) || null;
}

/**
 * "상위 31%" · 1% 아래는 소수 한 자리("상위 0.4%"), 1등은 그대로 1등.
 * @param {ItemRank} rank
 */
export function topPercentText(rank) {
  const percent = (rank.rank / Math.max(1, rank.total)) * 100;
  const text = percent < 1 ? percent.toFixed(1) : String(Math.round(percent));
  return `상위 ${text}%`;
}

/**
 * "아케인셰이드 무기 234개 중 73등" · 비교할 장비가 자기 하나뿐이면 "".
 * @param {ItemRank | null} rank
 */
export function rankText(rank) {
  if (!rank || !(rank.total > 1)) return "";
  return `${rank.label} ${rank.total.toLocaleString("ko-KR")}개 중 ${rank.rank.toLocaleString("ko-KR")}등`;
}
