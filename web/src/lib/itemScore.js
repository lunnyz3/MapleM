// 템환산 100점 표시(화면용): 기준표를 넣어 scoreScale.mjs 를 부른다.
import table from "../../../src/game-data/item-score-max.json";
import { itemPoints, pointsText, setPoints } from "./scoreScale.mjs";

/** 장비 하나: "74.6" (부위 표가 없으면 원점수 그대로) @param {string} slot @param {number} score @param {boolean} [emblem] */
export function itemScoreText(slot, score, emblem = true) {
  const points = itemPoints(table, slot, score, { emblem });
  return points === null ? String(Math.round(Number(score) || 0)) : pointsText(points);
}

/** 캐릭터 합계: "51.2" @param {number} total @param {boolean} [emblem] */
export function setScoreText(total, emblem = true) {
  const points = setPoints(table, total, { emblem });
  return points === null ? String(Math.round(Number(total) || 0)) : pointsText(points);
}

/** 캐릭터 합계의 100점 값(숫자). @param {number} total @param {boolean} [emblem] */
export function setScorePoints(total, emblem = true) {
  return setPoints(table, total, { emblem }) ?? Number(total) ?? 0;
}

/** 원점수 차이를 그 부위 100점 기준 차이로: 3.2 @param {string} slot @param {number} diff */
export function itemScoreDiff(slot, diff) {
  return itemPoints(table, slot, Math.abs(diff)) ?? Math.abs(diff);
}
