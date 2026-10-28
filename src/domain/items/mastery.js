"use strict";

// Equipment mastery bonuses per option line, so item scores use the rolled (pre-mastery) values.
// Nexon only reports the number of mastery points per option section, not which line got them;
// public/js/features/item-share.js already works that out against the official probability
// tables (same split the page shows as "+4%"), so it is reused here instead of copied.
//
// item-share.js is a browser ES module: its import of common.js reads `document.body` once, and it
// loads tables with fetch("/probability/<file>"). The document stub exists only while importing,
// and fetch is wrapped for "/probability/" paths only (a relative URL fails in Node anyway).

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..", "..", "..");
const ITEM_SHARE_FILE = path.join(ROOT, "public", "js", "features", "item-share.js");
const PROBABILITY_DIR = path.join(ROOT, "public", "probability");

let modulePromise = null;

function installProbabilityFetch() {
  const original = globalThis.fetch;
  if (original && original.probabilityShim) return;
  const shim = async (url, ...rest) => {
    if (typeof url === "string" && url.startsWith("/probability/")) {
      const name = decodeURIComponent(url.slice("/probability/".length).split("?")[0]);
      const file = path.join(PROBABILITY_DIR, name);
      const ok = path.dirname(file) === PROBABILITY_DIR && fs.existsSync(file);
      return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(await fs.promises.readFile(file, "utf8")) };
    }
    return original(url, ...rest);
  };
  shim.probabilityShim = true;
  globalThis.fetch = shim;
}

function loadItemShare() {
  if (!modulePromise) {
    modulePromise = (async () => {
      installProbabilityFetch();
      const hadDocument = "document" in globalThis;
      if (!hadDocument) globalThis.document = { body: { dataset: {} }, querySelector: () => null };
      // package.json has no "type", so Node re-parses the file as ESM and warns once.
      const listeners = process.listeners("warning");
      process.removeAllListeners("warning");
      try {
        const loaded = await import(pathToFileURL(ITEM_SHARE_FILE).href);
        // The warning is emitted on the next tick.
        await new Promise((resolve) => setImmediate(resolve));
        return loaded;
      } finally {
        listeners.forEach((listener) => process.on("warning", listener));
        if (!hadDocument) delete globalThis.document;
      }
    })();
    modulePromise.catch(() => {
      modulePromise = null;
    });
  }
  return modulePromise;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasPoints(info) {
  if (!info || typeof info !== "object") return false;
  return ["potential_option_point", "additional_option_point", "additional_potential_option_point"].some((key) => Number(info[key]) > 0);
}

// The view shape item-share.js reads (same fields as the page's equipment view).
function toShareView(item) {
  const options = (list) => toArray(list);
  return {
    itemName: item?.item_name || "",
    slotName: item?.item_equipment_slot_name || "",
    pageName: item?.item_equipment_page_name || "",
    equipmentLevel: item?.equipment_level ?? null,
    potentialOption: options(item?.item_potential_option),
    additionalPotentialOption: options(item?.item_additional_potential_option),
    additionalOption: options(item?.item_additional_option),
    potentialGrade: String(item?.item_potential_option_grade ?? ""),
    additionalPotentialGrade: String(item?.item_additional_potential_option_grade ?? ""),
    additionalOptionGrade: String(item?.item_additional_option_grade ?? ""),
    masteryInfo: item?.mastery_info || null
  };
}

const SECTIONS = Object.freeze([
  ["potential", "item_potential_option"],
  ["additionalPotential", "item_additional_potential_option"],
  ["additional", "item_additional_option"]
]);

/**
 * Bonus amount per line: { item_potential_option: [0, 2, 2], ... } (numbers in the line's own unit).
 * Items without mastery points return null without loading anything.
 */
async function masteryBonusLines(item, { attackType, className } = {}) {
  if (!hasPoints(item?.mastery_info)) return null;
  const module = await loadItemShare();
  const breakdown = await module.resolveTopPercentBreakdown(toShareView(item), { attackType, className, jobName: className });
  const mastery = breakdown?.mastery;
  if (!mastery) return null;
  const result = {};
  SECTIONS.forEach(([section, field]) => {
    const lines = toArray(mastery[section]?.lines);
    result[field] = toArray(item?.[field]).map((_, index) => Number(lines[index]?.bonus) || 0);
  });
  return result;
}

/** Copy of the item with mastery bonuses taken off its option values. */
function withoutMastery(item, bonusLines) {
  if (!bonusLines) return item;
  const copy = { ...item };
  SECTIONS.forEach(([, field]) => {
    const bonuses = bonusLines[field] || [];
    copy[field] = toArray(item?.[field]).map((option, index) => {
      const bonus = bonuses[index] || 0;
      if (!bonus) return option;
      const text = String(option?.option_value ?? "");
      const number = Number(text.replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(number)) return option;
      const rolled = Math.max(0, Math.round((number - bonus) * 100) / 100);
      return { ...option, option_value: text.includes("%") ? `${rolled}%` : String(rolled) };
    });
  });
  return copy;
}

module.exports = { masteryBonusLines, withoutMastery };
