const pageType = document.body?.dataset?.page || "";
const THEME_STORAGE_KEY = "maplem-theme";
const SITE_DOMAIN_LABEL = "maplem.co.kr";
const BRAND_BASE_LABEL = "메이플M 플러스";
const toArray = (v) => (Array.isArray(v) ? v : []);
const escapeHtml = (v) =>
  String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const normalizeForMatch = (v) =>
  String(v || "")
    .replace(/[:),]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
function parseNumericValue(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = String(v).replace(/[^0-9.-]/g, "");
  if (!n) return null;
  const p = Number(n);
  return Number.isFinite(p) ? p : null;
}
const formatNumber = (v) =>
  Number.isFinite(Number(v)) ? Number(v).toLocaleString("ko-KR") : "-";
const formatPercentValue = (v) =>
  Number.isFinite(Number(v))
    ? `${Number(v).toLocaleString("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`
    : "-";
const formatTimestamp = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("ko-KR", { hour12: false });
};
const formatKstTooltipDateTime = (ts) => {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value || "-";
  const day = parts.find((part) => part.type === "day")?.value || "-";
  const hour = parts.find((part) => part.type === "hour")?.value || "-";
  return `${month}월 ${day}일 ${hour}시`;
};
const formatKstDateKey = (ts) => {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};
const formatKstDateLabel = (ts) => {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value || "-";
  const day = parts.find((part) => part.type === "day")?.value || "-";
  return `${month}월 ${day}일`;
};
const formatExpRateText = (value) => {
  const parsed = parseNumericValue(value);
  if (parsed === null) return "-";
  return `${Number(parsed).toLocaleString("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
};
const sanitizeEquipmentText = (value) =>
  String(value ?? "")
    .replace(/\b\d+\s*급\b/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\|/g, " |")
    .replace(/\|\s+\|/g, "|")
    .trim();
function abbreviateEquipmentOptionName(name) {
  const rawName = sanitizeEquipmentText(name || "").trim();
  if (!rawName) return "";
  const normalized = normalizeForMatch(rawName);

  if (
    normalized.includes(normalizeForMatch("보스공격력")) ||
    normalized.includes(normalizeForMatch("보스대미지")) ||
    normalized.includes(normalizeForMatch("보스데미지"))
  ) {
    return "보공";
  }
  if (
    normalized.includes(normalizeForMatch("물리대미지")) ||
    normalized.includes(normalizeForMatch("물리데미지"))
  ) {
    return "물뎀";
  }
  if (
    normalized.includes(normalizeForMatch("마법대미지")) ||
    normalized.includes(normalizeForMatch("마법데미지"))
  ) {
    return "마뎀";
  }
  if (
    normalized.includes(normalizeForMatch("파티")) &&
    normalized.includes(normalizeForMatch("경험치"))
  ) {
    return "파경";
  }
  if (normalized.includes(normalizeForMatch("경험치획득량"))) {
    return "경획";
  }
  if (
    normalized.includes(normalizeForMatch("최대hp")) ||
    normalized.includes(normalizeForMatch("최대체력"))
  ) {
    return "HP";
  }
  if (normalized.includes(normalizeForMatch("최대mp"))) {
    return "MP";
  }
  if (normalized.includes(normalizeForMatch("회피율"))) {
    return "회피율";
  }
  if (normalized.includes(normalizeForMatch("명중률"))) {
    return "명중률";
  }
  if (
    normalized.includes(normalizeForMatch("치명타확률")) ||
    normalized.includes(normalizeForMatch("크리티컬확률"))
  ) {
    return "치확";
  }
  if (normalized.includes(normalizeForMatch("메소획득량"))) {
    return "메획";
  }
  if (
    normalized.includes(normalizeForMatch("아이템드롭률")) ||
    normalized.includes(normalizeForMatch("드롭률"))
  ) {
    return "아드";
  }
  if (normalized.includes(normalizeForMatch("저항"))) {
    return "저항";
  }

  return rawName;
}
async function parseResponseSafely(r) {
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) return r.json();
  const t = await r.text();
  return {
    ok: false,
    message: "JSON 응답이 아닙니다.",
    contentType: ct,
    bodyPreview: t.slice(0, 300),
  };
}
function setMessage(el, text, type = "info") {
  if (!el) return;
  el.classList.remove("is-error", "is-success");
  if (type === "error") el.classList.add("is-error");
  if (type === "success") el.classList.add("is-success");
  el.textContent = text;
}
function buildScopedIdentityLabel(name, worldName) {
  const scopedName = String(name || "").trim();
  const scopedWorld = String(worldName || "").trim();
  if (!scopedName || !scopedWorld) {
    return "";
  }
  return `${scopedName}@${scopedWorld}`;
}
function applyPageIdentity(scopeLabel = "") {
  const scoped = String(scopeLabel || "").trim();
  const titleLabel = scoped
    ? `${scoped} || ${BRAND_BASE_LABEL} - ${SITE_DOMAIN_LABEL}`
    : `${BRAND_BASE_LABEL} - ${SITE_DOMAIN_LABEL}`;

  document.title = titleLabel;
}
function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", "light");
  localStorage.setItem(THEME_STORAGE_KEY, "light");
}
function initThemeControls() {
  applyTheme("light");
}
function removeDisabledRankingMenuLinks() {
  disabledRankingTypes.forEach((type) => {
    document
      .querySelectorAll(`a[href*="type=${type}"]`)
      .forEach((linkEl) => linkEl.remove());
  });
}
function navigateToCharacterPage(worldName, characterName) {
  const p = new URLSearchParams({
    world_name: worldName,
    character_name: characterName,
  });
  window.location.assign(
    `/character/${encodeURIComponent(worldName)}/${encodeURIComponent(characterName)}?${p.toString()}`,
  );
}
function navigateToGuildPage(worldName, guildName) {
  const p = new URLSearchParams({
    world_name: worldName,
    guild_name: guildName,
  });
  window.location.assign(
    `/guild/${encodeURIComponent(worldName)}/${encodeURIComponent(guildName)}?${p.toString()}`,
  );
}
function bindCharacterSearchForm(form) {
  if (!form) return;
  const w = form.querySelector('select[name="world_name"]');
  const c = form.querySelector('input[name="character_name"]');
  if (!w || !c) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const worldName = String(w.value || "").trim();
    const characterName = String(c.value || "").trim();
    if (!worldName || !characterName) {
      c.focus();
      return;
    }
    navigateToCharacterPage(worldName, characterName);
  });
}
function bindGuildSearchForm(form) {
  if (!form) return;
  const w = form.querySelector('select[name="world_name"]');
  const g = form.querySelector('input[name="guild_name"]');
  if (!w || !g) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const worldName = String(w.value || "").trim();
    const guildName = String(g.value || "").trim();
    if (!worldName || !guildName) {
      g.focus();
      return;
    }
    navigateToGuildPage(worldName, guildName);
  });
}
function redirectIndexCharacterPathIfNeeded() {
  if (pageType !== "index") return false;
  const seg = window.location.pathname.split("/").filter(Boolean);
  if (seg.length < 3 || seg[0] !== "character") return false;
  const worldName = decodeURIComponent(seg[1] || "");
  const characterName = decodeURIComponent(seg.slice(2).join("/") || "");
  if (!worldName || !characterName) return false;
  const p = new URLSearchParams(window.location.search);
  if (!p.get("world_name")) p.set("world_name", worldName);
  if (!p.get("character_name")) p.set("character_name", characterName);
  window.location.replace(`/character.html?${p.toString()}`);
  return true;
}
function redirectIndexGuildPathIfNeeded() {
  if (pageType !== "index") return false;
  const seg = window.location.pathname.split("/").filter(Boolean);
  if (seg.length < 3 || seg[0] !== "guild") return false;
  const worldName = decodeURIComponent(seg[1] || "");
  const guildName = decodeURIComponent(seg.slice(2).join("/") || "");
  if (!worldName || !guildName) return false;
  const p = new URLSearchParams(window.location.search);
  if (!p.get("world_name")) p.set("world_name", worldName);
  if (!p.get("guild_name")) p.set("guild_name", guildName);
  window.location.replace(`/guild.html?${p.toString()}`);
  return true;
}
function getCharacterRouteInfo() {
  const seg = window.location.pathname.split("/").filter(Boolean);
  const p = new URLSearchParams(window.location.search);
  let worldName = "",
    characterName = "";
  if (seg.length >= 3 && seg[0] === "character") {
    worldName = decodeURIComponent(seg[1] || "");
    characterName = decodeURIComponent(seg.slice(2).join("/") || "");
  }
  if (!worldName || !characterName) {
    worldName = String(p.get("world_name") || "").trim();
    characterName = String(p.get("character_name") || "").trim();
  }
  return worldName && characterName ? { worldName, characterName } : null;
}
function getGuildRouteInfo() {
  const seg = window.location.pathname.split("/").filter(Boolean);
  const p = new URLSearchParams(window.location.search);
  let worldName = "",
    guildName = "";
  if (seg.length >= 3 && seg[0] === "guild") {
    worldName = decodeURIComponent(seg[1] || "");
    guildName = decodeURIComponent(seg.slice(2).join("/") || "");
  }
  if (!worldName || !guildName) {
    worldName = String(p.get("world_name") || "").trim();
    guildName = String(p.get("guild_name") || "").trim();
  }
  return worldName && guildName ? { worldName, guildName } : null;
}
const renderLoadingCard = (m) =>
  `<section class="tab-grid"><article class="data-card data-card--wide"><h3>로딩 중</h3><p class="empty">${escapeHtml(m || "캐릭터 데이터를 불러오는 중입니다...")}</p></article></section>`;
const renderErrorCard = (m) =>
  `<section class="tab-grid"><article class="data-card data-card--wide"><h3>조회 실패</h3><p class="empty">${escapeHtml(m || "캐릭터 정보를 불러오지 못했습니다.")}</p></article></section>`;
const renderNotFoundCard = (m) =>
  `<section class="tab-grid"><article class="data-card data-card--wide"><p class="empty">${escapeHtml(m || "검색 결과가 없습니다.")}</p></article></section>`;
function normalizeCharacterLookupErrorMessage(message) {
  const raw = String(message || "").trim();
  const normalized = raw.toLowerCase();
  if (!raw) return "검색 결과가 없습니다.";
  if (
    normalized.includes("please input valid parameter") ||
    normalized.includes("invalid parameter") ||
    normalized.includes("invalid character") ||
    normalized.includes("character not found") ||
    normalized.includes("not found")
  ) {
    return "검색 결과가 없습니다.";
  }
  return raw;
}
function normalizeGuildLookupErrorMessage(message) {
  const raw = String(message || "").trim();
  const normalized = raw.toLowerCase();
  if (!raw) return "검색 결과가 없습니다.";
  if (
    normalized.includes("please input valid parameter") ||
    normalized.includes("invalid parameter") ||
    normalized.includes("not found")
  ) {
    return "검색 결과가 없습니다.";
  }
  return raw;
}
function normalizeRankingLookupErrorMessage(message) {
  const raw = String(message || "").trim();
  const normalized = raw.toLowerCase();
  if (!raw) return "랭킹 조회에 실패했습니다.";
  if (normalized.includes("please input valid parameter")) {
    return "조회 조건이 올바르지 않습니다. 월드/조회일을 확인해 주세요.";
  }
  return raw;
}
const rankingDateFloor = "2025-12-01";
const rankingPageSize = 50;
const rankingApiPageSize = 200;
const rankingTypes = Object.freeze({
  level: { label: "종합 랭킹", endpoint: "level" },
  union: { label: "유니온 랭킹", endpoint: "union" },
  achievement: { label: "업적 랭킹", endpoint: "achievement" },
  "sharenian-battlefield": {
    label: "샤레니안의 전장 랭킹",
    endpoint: "sharenian-battlefield",
  },
  "root-of-time": { label: "시간의근원 랭킹", endpoint: "root-of-time" },
});
const rankingNicknameSearchTypes = Object.freeze(
  new Set(["level", "union", "achievement", "root-of-time"]),
);
const disabledRankingTypes = Object.freeze(new Set(["sharenian-waterway"]));
const worldIconByName = Object.freeze({
  스카니아: "/assets/scania.png",
  Scania: "/assets/scania.png",
  크로아: "/assets/croa.png",
  Croa: "/assets/croa.png",
  루나: "/assets/luna.png",
  Luna: "/assets/luna.png",
  엘리시움: "/assets/elysium.png",
  Elysium: "/assets/elysium.png",
  유니온: "/assets/union.png",
  Union: "/assets/union.png",
  제니스: "/assets/zenith.png",
  Zenith: "/assets/zenith.png",
  아케인: "/assets/arcane.png",
  Arcane: "/assets/arcane.png",
});
const guildBuildingSlots = Object.freeze([
  {
    key: "library",
    label: "길드 도서관",
    asset: "/assets/guild-library.png",
    keywords: ["도서관", "library"],
  },
  {
    key: "mapletree",
    label: "길드 메이플나무",
    asset: "/assets/guild-mapletree.png",
    keywords: ["메이플", "나무", "maple", "tree"],
  },
  {
    key: "accountant",
    label: "길드 회계사",
    asset: "/assets/guild-accountant.png",
    keywords: ["회계", "account"],
  },
  {
    key: "campfire",
    label: "길드 캠프파이어",
    asset: "/assets/guild-campfire.png",
    keywords: ["캠프", "camp", "모닥불", "불"],
  },
  {
    key: "chef",
    label: "길드 요리사",
    asset: "/assets/guild-chef.png",
    keywords: ["요리", "chef", "쿠킹", "cook"],
  },
]);
const potentialTierAssets = Object.freeze({
  legendary: { icon: "/assets/ico-potential-legendary.png", letter: "L" },
  unique: { icon: "/assets/ico-potential-unique.png", letter: "U" },
  epic: { icon: "/assets/ico-potential-epic.png", letter: "E" },
  rare: { icon: "/assets/ico-potential-rare.png", letter: "R" },
});
const physicalJobNames = new Set(
  [
    "히어로",
    "팔라딘",
    "다크나이트",
    "보우마스터",
    "신궁",
    "패스파인더",
    "나이트로드",
    "섀도어",
    "듀얼블레이드",
    "바이퍼",
    "캡틴",
    "캐논슈터",
    "소울마스터",
    "윈드브레이커",
    "나이트워커",
    "스트라이커",
    "미하일",
    "아란",
    "메르세데스",
    "팬텀",
    "은월",
    "블래스터",
    "와일드헌터",
    "메카닉",
    "제논",
    "데몬슬레이어",
    "데몬어벤져",
    "카이저",
    "카데나",
    "카인",
    "아크",
    "아델",
    "호영",
    "아이엘",
    "에릴",
    "칼리",
    "렌",
  ].map(normalizeForMatch),
);
const magicalJobNames = new Set(
  [
    "아크메이지(불,독)",
    "아크메이지(썬,콜)",
    "비숍",
    "플레임위자드",
    "에반",
    "루미너스",
    "배틀메이지",
    "엔젤릭버스터",
    "키네시스",
    "라라",
    "시아",
    "일리움",
  ].map(normalizeForMatch),
);
const equipmentOrder = [
  "weapon",
  "subWeapon",
  "emblem",
  "hat",
  "overall",
  "gloves",
  "shoes",
  "shoulder",
  "cape",
  "belt",
  "necklace1",
  "necklace2",
  "ring1",
  "ring2",
  "ring3",
  "ring4",
  "earring",
  "pocket",
  "face",
  "eye",
  "heart",
  "badge",
  "title",
  "medal",
];
const equipmentOrderIndex = new Map(equipmentOrder.map((k, i) => [k, i]));
const equipmentSlotLabels = {
  weapon: "무기",
  subWeapon: "보조무기",
  emblem: "엠블렘",
  hat: "모자",
  overall: "한벌옷",
  gloves: "장갑",
  shoes: "신발",
  shoulder: "어깨",
  cape: "망토",
  belt: "벨트",
  necklace1: "목걸이",
  necklace2: "목걸이 2번째",
  ring1: "반지",
  ring2: "반지 2번째",
  ring3: "반지 3번째",
  ring4: "반지 4번째",
  earring: "귀고리",
  pocket: "포켓",
  face: "얼굴장식",
  eye: "눈장식",
  heart: "하트",
  badge: "뱃지",
  title: "칭호",
  medal: "훈장",
};

const rankingThumbDefaultSrc = "/assets/maple-hero.svg";

function setupTabNav(tabNav, onChange) {
  const btns = [...tabNav.querySelectorAll(".tab-btn")];
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.tab;
      if (!id) return;
      btns.forEach((b) => b.classList.toggle("is-active", b === btn));
      onChange(id);
    });
  });
}

function buildCharacterProfileHref(worldName, characterName) {
  const world = String(worldName || "").trim();
  const name = String(characterName || "").trim();
  if (!world || !name || name === "-") {
    return "";
  }
  const query = new URLSearchParams({
    world_name: world,
    character_name: name,
  });
  return `/character/${encodeURIComponent(world)}/${encodeURIComponent(name)}?${query.toString()}`;
}
function buildGuildProfileHref(worldName, guildName) {
  const world = String(worldName || "").trim();
  const name = String(guildName || "").trim();
  if (!world || !name || name === "-") {
    return "";
  }
  const query = new URLSearchParams({
    world_name: world,
    guild_name: name,
  });
  return `/guild/${encodeURIComponent(world)}/${encodeURIComponent(name)}?${query.toString()}`;
}

function renderRankingCharacterNameLink(characterName, worldName) {
  const name = String(characterName || "-");
  const href = buildCharacterProfileHref(worldName, name);
  if (!href) {
    return `<span>${escapeHtml(name)}</span>`;
  }
  return `<a class="ranking-char-link" href="${escapeHtml(href)}">${escapeHtml(name)}</a>`;
}

function resolveWorldIcon(worldName) {
  return worldIconByName[String(worldName || "").trim()] || "";
}


export {
  BRAND_BASE_LABEL,
  SITE_DOMAIN_LABEL,
  THEME_STORAGE_KEY,
  abbreviateEquipmentOptionName,
  applyPageIdentity,
  applyTheme,
  bindCharacterSearchForm,
  bindGuildSearchForm,
  buildCharacterProfileHref,
  buildGuildProfileHref,
  buildScopedIdentityLabel,
  disabledRankingTypes,
  equipmentOrder,
  equipmentOrderIndex,
  equipmentSlotLabels,
  escapeHtml,
  formatExpRateText,
  formatKstDateKey,
  formatKstDateLabel,
  formatKstTooltipDateTime,
  formatNumber,
  formatPercentValue,
  formatTimestamp,
  getCharacterRouteInfo,
  getGuildRouteInfo,
  guildBuildingSlots,
  initThemeControls,
  magicalJobNames,
  navigateToCharacterPage,
  navigateToGuildPage,
  normalizeCharacterLookupErrorMessage,
  normalizeForMatch,
  normalizeGuildLookupErrorMessage,
  normalizeRankingLookupErrorMessage,
  pageType,
  parseNumericValue,
  parseResponseSafely,
  physicalJobNames,
  potentialTierAssets,
  rankingApiPageSize,
  rankingDateFloor,
  rankingNicknameSearchTypes,
  rankingPageSize,
  rankingThumbDefaultSrc,
  rankingTypes,
  redirectIndexCharacterPathIfNeeded,
  redirectIndexGuildPathIfNeeded,
  removeDisabledRankingMenuLinks,
  renderErrorCard,
  renderLoadingCard,
  renderNotFoundCard,
  renderRankingCharacterNameLink,
  resolveWorldIcon,
  sanitizeEquipmentText,
  setMessage,
  setupTabNav,
  toArray,
  worldIconByName,
};
