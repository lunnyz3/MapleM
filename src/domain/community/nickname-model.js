"use strict";

// 닉네임 생성기(순수 함수): 모은 캐릭터 이름에서 "앞 글자 order 개 → 다음 글자" 빈도표를 만들고, 그 표를 따라
// 글자를 뽑아 새 이름을 짓는다(이미 있는 이름·욕설·같은 글자 셋 이상 반복은 버린다).
const { checkNickname } = require("./text-filter");

const START = "^";
const END = "$";

/** names → Map(앞 글자들 → Map(다음 글자 → 수)) */
function buildModel(names, order) {
  const model = new Map();
  for (const name of names) {
    const chars = [...Array(order).fill(START), ...name, END];
    for (let i = order; i < chars.length; i += 1) {
      const key = chars.slice(i - order, i).join("");
      if (!model.has(key)) model.set(key, new Map());
      const next = model.get(key);
      next.set(chars[i], (next.get(chars[i]) || 0) + 1);
    }
  }
  return model;
}

function pick(counts, random) {
  let total = 0;
  for (const count of counts.values()) total += count;
  let roll = random() * total;
  for (const [char, count] of counts) {
    roll -= count;
    if (roll < 0) return char;
  }
  return END;
}

/**
 * 새 이름 하나(못 지으면 null).
 * @param {{ order: number, min: number, max: number, prefix?: string, existing?: Set<string>, random?: () => number, tries?: number }} options
 */
function generateName(model, { order, min, max, prefix = "", existing = new Set(), random = Math.random, tries = 200 }) {
  const head = [...prefix].slice(0, order);
  for (let attempt = 0; attempt < tries; attempt += 1) {
    let context = [...Array(order).fill(START), ...head].slice(-order);
    let out = head.join("");
    for (let i = head.length; i <= max; i += 1) {
      const next = model.get(context.join(""));
      if (!next) break;
      const char = pick(next, random);
      if (char === END) break;
      out += char;
      context = [...context.slice(1), char];
    }
    const length = [...out].length;
    if (length < min || length > max || existing.has(out.toLowerCase())) continue;
    if (/(.)\1\1/u.test(out) || !checkNickname(out, 12).ok) continue;
    return out;
  }
  return null;
}

/** 서로 다른 이름 count 개 */
function generateNames(model, options, count) {
  const names = new Set();
  for (let guard = 0; names.size < count && guard < count * 6; guard += 1) {
    const name = generateName(model, options);
    if (name) names.add(name);
  }
  return [...names];
}

module.exports = { buildModel, generateName, generateNames };
