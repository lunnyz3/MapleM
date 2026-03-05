function resolveTopPercent(item) {
  void item;
  // TODO: Replace this placeholder with real top-percent logic.
  return null;
}

function normalizeTopPercentValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const rounded = Math.max(0, Number(numeric.toFixed(2)));
  return Math.abs(rounded - Math.round(rounded)) < 1e-9 ? Math.round(rounded) : rounded;
}

function buildTopPercentCaption(item) {
  const topPercent = normalizeTopPercentValue(resolveTopPercent(item));
  if (topPercent === null) {
    return "상위 n% 옵션의 아이템 입니다!";
  }
  return `상위 ${topPercent}% 옵션의 아이템 입니다!`;
}

function buildItemShareFileName(itemName, mode = "share") {
  const normalizedMode = String(mode || "share").trim().toLowerCase() || "share";
  const safeMode = normalizedMode.replace(/[^a-z0-9_-]+/g, "");
  const safeItemName = String(itemName || "item")
    .trim()
    .replace(/[^\w\uAC00-\uD7AF-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = safeItemName || "item";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `maplem-${safeMode}-${suffix}-${stamp}.png`;
}

export {
  buildItemShareFileName,
  buildTopPercentCaption,
  resolveTopPercent,
};
