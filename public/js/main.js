const pageType = document.body?.dataset?.page || "";
const THEME_STORAGE_KEY = "maplem-theme";
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
function applyTheme(theme) {
  const root = document.documentElement;
  const s = ["system", "dark", "light"].includes(theme) ? theme : "system";
  if (s === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", s);
  localStorage.setItem(THEME_STORAGE_KEY, s);
}
function initThemeControls() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY) || "system";
  applyTheme(saved);
  const sel = document.querySelector("[data-theme-select]");
  if (!sel) return;
  sel.value = saved;
  sel.addEventListener("change", () => applyTheme(sel.value));
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
const renderLoadingCard = (m) =>
  `<section class="tab-grid"><article class="data-card data-card--wide"><h3>로딩 중</h3><p class="empty">${escapeHtml(m || "캐릭터 데이터를 불러오는 중입니다...")}</p></article></section>`;
const renderErrorCard = (m) =>
  `<section class="tab-grid"><article class="data-card data-card--wide"><h3>조회 실패</h3><p class="empty">${escapeHtml(m || "캐릭터 정보를 불러오지 못했습니다.")}</p></article></section>`;
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
const resolveJobMode = (p) => {
  const j = normalizeForMatch(p?.jobName || "");
  const c = normalizeForMatch(p?.className || "");
  if (magicalJobNames.has(j) || magicalJobNames.has(c)) return "magical";
  if (physicalJobNames.has(j) || physicalJobNames.has(c)) return "physical";
  return "physical";
};
function classifyEquipmentSlot(item) {
  const n = normalizeForMatch(
    `${item?.slotName || ""} ${item?.pageName || ""}`,
  );
  if (n.includes("보조무기"))
    return { key: "subWeapon", label: equipmentSlotLabels.subWeapon };
  if (n.includes("엠블렘"))
    return { key: "emblem", label: equipmentSlotLabels.emblem };
  if (n.includes("무기"))
    return { key: "weapon", label: equipmentSlotLabels.weapon };
  if (n.includes("모자")) return { key: "hat", label: equipmentSlotLabels.hat };
  if (n.includes("한벌"))
    return { key: "overall", label: equipmentSlotLabels.overall };
  if (n.includes("장갑"))
    return { key: "gloves", label: equipmentSlotLabels.gloves };
  if (n.includes("신발"))
    return { key: "shoes", label: equipmentSlotLabels.shoes };
  if (n.includes("어깨") || n.includes("숄더"))
    return { key: "shoulder", label: equipmentSlotLabels.shoulder };
  if (n.includes("망토"))
    return { key: "cape", label: equipmentSlotLabels.cape };
  if (n.includes("벨트"))
    return { key: "belt", label: equipmentSlotLabels.belt };
  if (n.includes("목걸이") || n.includes("펜던") || n.includes("네클")) {
    if (n.includes("2"))
      return { key: "necklace2", label: equipmentSlotLabels.necklace2 };
    return { key: "necklace1", label: equipmentSlotLabels.necklace1 };
  }
  if (n.includes("반지")) {
    if (n.includes("4"))
      return { key: "ring4", label: equipmentSlotLabels.ring4 };
    if (n.includes("3"))
      return { key: "ring3", label: equipmentSlotLabels.ring3 };
    if (n.includes("2"))
      return { key: "ring2", label: equipmentSlotLabels.ring2 };
    return { key: "ring1", label: equipmentSlotLabels.ring1 };
  }
  if (n.includes("귀고리") || n.includes("귀걸"))
    return { key: "earring", label: equipmentSlotLabels.earring };
  if (n.includes("포켓"))
    return { key: "pocket", label: equipmentSlotLabels.pocket };
  if (n.includes("얼굴장식"))
    return { key: "face", label: equipmentSlotLabels.face };
  if (n.includes("눈장식"))
    return { key: "eye", label: equipmentSlotLabels.eye };
  if (n.includes("하트"))
    return { key: "heart", label: equipmentSlotLabels.heart };
  if (n.includes("뱃지"))
    return { key: "badge", label: equipmentSlotLabels.badge };
  if (n.includes("칭호"))
    return { key: "title", label: equipmentSlotLabels.title };
  if (n.includes("훈장"))
    return { key: "medal", label: equipmentSlotLabels.medal };
  return { key: "unknown", label: item?.slotName || item?.pageName || "-" };
}
function compareEquipmentItems(l, r) {
  const ls = classifyEquipmentSlot(l),
    rs = classifyEquipmentSlot(r);
  const li = equipmentOrderIndex.has(ls.key)
    ? equipmentOrderIndex.get(ls.key)
    : 999;
  const ri = equipmentOrderIndex.has(rs.key)
    ? equipmentOrderIndex.get(rs.key)
    : 999;
  if (li !== ri) return li - ri;
  return String(l?.itemName || "").localeCompare(
    String(r?.itemName || ""),
    "ko-KR",
  );
}
function collectDamageAndBossOptions(list) {
  const t = { physicalDamage: 0, magicalDamage: 0, bossDamage: 0 };
  toArray(list).forEach((o) => {
    const n = normalizeForMatch(o?.name || o?.option_name || "");
    const v = parseNumericValue(o?.value || o?.option_value);
    if (!Number.isFinite(v)) return;
    if (
      n.includes(normalizeForMatch("물리대미지")) ||
      n.includes(normalizeForMatch("물리데미지"))
    ) {
      t.physicalDamage += v;
      return;
    }
    if (
      n.includes(normalizeForMatch("마법대미지")) ||
      n.includes(normalizeForMatch("마법데미지"))
    ) {
      t.magicalDamage += v;
      return;
    }
    if (n.includes(normalizeForMatch("보스공격력"))) t.bossDamage += v;
  });
  return t;
}
function buildPotentialSummary(label, list, mode) {
  const t = collectDamageAndBossOptions(list);
  const p = [];
  if (mode === "magical") {
    if (t.magicalDamage > 0)
      p.push(`마뎀 ${formatPercentValue(t.magicalDamage)}`);
  } else if (t.physicalDamage > 0)
    p.push(`물뎀 ${formatPercentValue(t.physicalDamage)}`);
  if (t.bossDamage > 0) p.push(`보공 ${formatPercentValue(t.bossDamage)}`);
  return p.length ? `${label}: ${p.join(" / ")}` : "";
}
function buildSoulSummary(text, mode) {
  const s = String(text || "").trim();
  if (!s) return "";
  const t = {
    physicalDamage: 0,
    magicalDamage: 0,
    bossDamage: 0,
    finalDamage: 0,
  };
  s.split(",").forEach((seg) => {
    const x = String(seg || "").trim();
    if (!x) return;
    const n = normalizeForMatch(x);
    const v = parseNumericValue(x);
    if (!Number.isFinite(v)) return;
    if (
      n.includes(normalizeForMatch("물리대미지")) ||
      n.includes(normalizeForMatch("물리데미지"))
    ) {
      t.physicalDamage += v;
      return;
    }
    if (
      n.includes(normalizeForMatch("마법대미지")) ||
      n.includes(normalizeForMatch("마법데미지"))
    ) {
      t.magicalDamage += v;
      return;
    }
    if (n.includes(normalizeForMatch("보스공격력"))) {
      t.bossDamage += v;
      return;
    }
    if (
      n.includes(normalizeForMatch("최종대미지")) ||
      n.includes(normalizeForMatch("최종데미지"))
    )
      t.finalDamage += v;
  });
  const p = [];
  if (mode === "magical") {
    if (t.magicalDamage > 0)
      p.push(`마뎀 ${formatPercentValue(t.magicalDamage)}`);
  } else if (t.physicalDamage > 0)
    p.push(`물뎀 ${formatPercentValue(t.physicalDamage)}`);
  if (t.bossDamage > 0) p.push(`보공 ${formatPercentValue(t.bossDamage)}`);
  if (t.finalDamage > 0) p.push(`최종 ${formatPercentValue(t.finalDamage)}`);
  return p.length ? `소울: ${p.join(" / ")}` : `소울: ${s}`;
}
const renderOptionList = (list) => {
  const items = toArray(list);
  if (!items.length) return '<li class="empty">옵션 없음</li>';
  return items
    .map(
      (o) =>
        `<li><span>${escapeHtml(o?.name || o?.option_name || "-")}</span><strong>${escapeHtml(o?.value || o?.option_value || "-")}</strong></li>`,
    )
    .join("");
};
function splitOptionText(text) {
  const source = String(text || "").trim();
  if (!source) {
    return [];
  }

  const segments = [];
  let current = "";

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (ch === "," || ch === "\n" || ch === "|") {
      if (ch === ",") {
        const prev = source[i - 1] || "";
        let nextIndex = i + 1;
        while (source[nextIndex] === " ") {
          nextIndex += 1;
        }
        const next = source[nextIndex] || "";
        const isThousandsSeparator = /\d/.test(prev) && /\d/.test(next);
        if (isThousandsSeparator) {
          current += ch;
          continue;
        }
      }

      if (current.trim()) {
        segments.push(current.trim());
      }
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}
function parseSetCountMeta(setCount) {
  const label = String(setCount ?? "-").trim() || "-";
  const matched = label.match(/(\d+)\s*\/\s*(\d+)/);
  if (!matched) {
    return { label, ratio: 0 };
  }

  const current = Number(matched[1]);
  const total = Number(matched[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return { label, ratio: 0 };
  }

  return {
    label,
    ratio: Math.max(0, Math.min(1, current / total))
  };
}
function renderMajorStats(profile) {
  const majorStats = profile?.majorStats || {};
  const mode = resolveJobMode(profile);
  const modeLabel = mode === "magical" ? "마법" : "물리";
  const order = toArray(profile?.majorStatOrder).length
    ? profile.majorStatOrder
    : [
        "physicalAttack",
        "physicalAttackPercent",
        "physicalDamagePercent",
        "bossDamage",
        "criticalDamage",
        "finalDamage",
        "maxDamage",
        "ignoreDefense",
      ];
  const rows = order
    .map((key) => {
      const stat = majorStats[key];
      if (!stat) return "";
      const list = toArray(stat.breakdown).length
        ? stat.breakdown
            .map(
              (e) =>
                `<li><span>${escapeHtml(e.source || "-")}</span><strong>${escapeHtml(e.displayValue || "-")}</strong></li>`,
            )
            .join("")
        : '<li class="empty">기여 항목이 없습니다.</li>';
      return `<details class="major-row"><summary class="major-row__summary"><span class="major-row__label">${escapeHtml(stat.label || key)}</span><strong class="major-row__value">${escapeHtml(stat.displayValue || "-")}</strong></summary><ul class="major-row__list">${list}</ul></details>`;
    })
    .filter(Boolean)
    .join("");
  if (!rows) return "";
  return `<section class="major-stats major-stats--compact"><h3>주요 스탯 <span>(${escapeHtml(modeLabel)})</span></h3><div class="major-stats__list">${rows}</div></section>`;
}
function renderProfile(profile, query) {
  const image = profile.imageUrl
    ? `<img class="profile-avatar" src="${escapeHtml(profile.imageUrl)}" alt="${escapeHtml(profile.name || "캐릭터")} 이미지" />`
    : '<div class="profile-avatar profile-avatar--empty">NO IMAGE</div>';
  return `<article class="profile-main"><div class="profile-visual">${image}</div><div class="profile-body"><h1>${escapeHtml(profile.name || "-")}</h1><p class="profile-world">서버: ${escapeHtml(query.worldNameCanonical || "-")}</p><div class="profile-stats"><div><span>직업</span><strong>${escapeHtml(profile.className || "-")}</strong></div><div><span>랭킹</span><strong>${escapeHtml(profile.ranking || "-")}</strong></div><div><span>레벨</span><strong>${escapeHtml(profile.level || "-")}</strong></div><div><span>길드</span><strong>${escapeHtml(profile.guildName || "-")}</strong></div><div><span>경험치</span><strong>${escapeHtml(profile.expText || "-")}</strong></div></div></div></article>${renderMajorStats(profile)}`;
}
function resolveSelectedPresetNo(tabKey, tabData, state) {
  const selected = parseNumericValue(state.selectedPresetByTab[tabKey]);
  const nos = toArray(tabData?.presets)
    .map((p) => parseNumericValue(p?.presetNo))
    .filter((n) => n !== null);
  if (selected !== null && nos.includes(selected)) return selected;
  const active = parseNumericValue(tabData?.activePresetNo);
  if (active !== null && nos.includes(active)) return active;
  return nos.length ? nos[0] : null;
}
function resolveSelectedPreset(tabKey, tabData, state) {
  const no = resolveSelectedPresetNo(tabKey, tabData, state);
  if (no === null) return null;
  return (
    toArray(tabData?.presets).find(
      (p) => parseNumericValue(p?.presetNo) === no,
    ) || null
  );
}
function renderPresetSelector(tabKey, tabData, state) {
  const presets = toArray(tabData?.presets);
  if (!presets.length)
    return '<div class="preset-empty">프리셋 데이터가 없습니다.</div>';
  const selectedNo = resolveSelectedPresetNo(tabKey, tabData, state);
  return `<div class="preset-selector">${presets
    .map((p) => {
      const no = parseNumericValue(p?.presetNo);
      const sel = no !== null && no === selectedNo;
      return `<button type="button" class="preset-btn ${sel ? "is-selected" : ""} ${p?.isActive ? "is-active" : ""}" data-preset-tab="${escapeHtml(tabKey)}" data-preset-no="${escapeHtml(no ?? "")}"><span>프리셋 ${escapeHtml(no ?? "-")}</span>${p?.isActive ? '<em class="pill">적용중</em>' : ""}</button>`;
    })
    .join("")}</div>`;
}
function renderEquipmentTab(tabData, profile, state) {
  const selected = resolveSelectedPreset("equipment", tabData, state);
  const data = selected?.data || {};
  const mode = resolveJobMode(profile || {});
  const items = toArray(data.itemEquipment).sort(compareEquipmentItems);
  const rows = items.length
    ? items
        .map((item) => {
          const slot = classifyEquipmentSlot(item);
          const icon = item.itemIcon
            ? `<img src="${escapeHtml(item.itemIcon)}" alt="${escapeHtml(item.itemName || "아이템")}" />`
            : '<div class="item-icon-empty">NO</div>';
          const sf = parseNumericValue(item?.starforceUpgrade);
          const sfTag = Number.isFinite(sf)
            ? `<span class="item-sf">+${escapeHtml(String(Math.round(sf)))}</span>`
            : "";
          const p1 = buildPotentialSummary("잠재", item.potentialOption, mode);
          const p2 = buildPotentialSummary(
            "에디",
            item.additionalPotentialOption,
            mode,
          );
          const p3 = buildSoulSummary(item?.soulInfo?.soulOption, mode);
          const chips = [p1, p2, p3].filter(Boolean);
          return `<details class="equip-row"><summary class="equip-row__summary"><div class="equip-col equip-col--slot">${escapeHtml(slot.label)}</div><div class="equip-col equip-col--item"><div class="equip-item-main"><div class="item-icon-wrap">${icon}${sfTag}</div><div><strong>${escapeHtml(item.itemName || "-")}</strong><p>${escapeHtml(item.itemGrade || "-")} | 스타포스 ${escapeHtml(item.starforceUpgrade ?? "-")}</p></div></div></div><div class="equip-col equip-col--opts"><div class="equip-option-chips">${chips.length ? chips.map((c) => `<span class="equip-option-chip">${escapeHtml(c)}</span>`).join("") : '<span class="equip-option-empty">표시할 주요 옵션이 없습니다.</span>'}</div></div></summary><div class="equip-row__detail"><div class="equip-detail-meta"><span>장비 레벨: <strong>${escapeHtml(item.equipmentLevel ?? "-")}</strong></span><span>전투력: <strong>${escapeHtml(item.combatPower ?? "-")}</strong></span><span>부위: <strong>${escapeHtml(item.slotName || "-")}</strong></span></div><div class="equip-detail-grid"><article><h4>기본 옵션</h4><ul class="equip-option-list">${renderOptionList(item.basicOption)}</ul></article><article><h4>추가 옵션</h4><ul class="equip-option-list">${renderOptionList(item.additionalOption)}</ul></article><article><h4>잠재 옵션</h4><ul class="equip-option-list">${renderOptionList(item.potentialOption)}</ul></article><article><h4>에디셔널 잠재 옵션</h4><ul class="equip-option-list">${renderOptionList(item.additionalPotentialOption)}</ul></article><article class="equip-detail-soul"><h4>소울</h4><p>${escapeHtml(item?.soulInfo?.soulOption || "소울 정보 없음")}</p></article></div></div></details>`;
        })
        .join("")
    : '<p class="empty">장비 데이터가 없습니다.</p>';
  const cashFromSelected = toArray(data.cashItemEquipment);
  const firstPresetWithCash =
    toArray(tabData?.presets)
      .map((preset) => toArray(preset?.data?.cashItemEquipment))
      .find((list) => list.length > 0) || [];
  const cash = cashFromSelected.length ? cashFromSelected : firstPresetWithCash;
  const renderCash = (list, empty) =>
    list.length
      ? list
          .map(
            (it) =>
              `<li><div class="item-main">${it.cashItemIcon ? `<img src="${escapeHtml(it.cashItemIcon)}" alt="${escapeHtml(it.cashItemName || "캐시 장비")}" />` : ""}<div><strong>${escapeHtml(it.cashItemName || "-")}</strong><p>${escapeHtml(it.slotName || "-")}</p></div></div></li>`,
          )
          .join("")
      : `<li class="empty">${escapeHtml(empty)}</li>`;
  const sets = toArray(tabData?.setEffects),
    pets = toArray(tabData?.petSetOptions);
  const renderOptionChips = (text, emptyMessage) => {
    const options = splitOptionText(text);
    if (!options.length) {
      return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
    }

    return `<ul class="option-chip-list">${options.map((option) => `<li>${escapeHtml(option)}</li>`).join("")}</ul>`;
  };
  const renderSetEffectCard = (setInfo) => {
    const setName = setInfo?.setName || "-";
    const countMeta = parseSetCountMeta(setInfo?.setCount);
    const starMatched = String(setInfo?.setOption || "").match(/★\s*\d+/);
    const starLabel = starMatched ? String(starMatched[0]).replace(/\s+/g, "") : "";
    const progressWidth = Math.round(countMeta.ratio * 100);

    return `<details class="set-effect-card"><summary class="set-effect__summary"><strong class="set-effect__name">${escapeHtml(setName)}</strong><span class="set-effect__meta">${escapeHtml(countMeta.label)}${starLabel ? ` <em class="set-effect__star">${escapeHtml(starLabel)}</em>` : ""}</span></summary><div class="set-effect__bar"><span style="width:${escapeHtml(String(progressWidth))}%"></span></div><div class="set-effect__detail">${renderOptionChips(setInfo?.setOption, "세트 옵션 정보가 없습니다.")}</div></details>`;
  };
  const renderPetEffectCard = (petInfo) =>
    `<details class="set-effect-card"><summary class="set-effect__summary"><strong class="set-effect__name">${escapeHtml(petInfo?.setName || "-")}</strong><span class="set-effect__meta">펫 세트</span></summary><div class="set-effect__detail">${renderOptionChips(petInfo?.setOption, "펫 세트 옵션 정보가 없습니다.")}</div></details>`;

  return `<section class="tab-grid"><article class="data-card data-card--wide"><h3>장비 프리셋</h3>${renderPresetSelector("equipment", tabData, state)}<div class="equip-head"><span>부위</span><span>아이템</span><span>주요 옵션</span></div><div class="equip-table">${rows}</div></article><article class="data-card"><h3>캐시 장비</h3><ul class="simple-list">${renderCash(cash, "캐시 장비 데이터가 없습니다.")}</ul></article><article class="data-card"><h3>세트 효과</h3><div class="set-effect-list">${sets.length ? sets.map(renderSetEffectCard).join("") : '<p class="empty">세트 효과 데이터가 없습니다.</p>'}</div></article><article class="data-card"><h3>펫 효과</h3><div class="set-effect-list">${pets.length ? pets.map(renderPetEffectCard).join("") : '<p class="empty">펫 세트 효과 데이터가 없습니다.</p>'}<details class="set-effect-card"><summary class="set-effect__summary"><strong class="set-effect__name">자동 스킬</strong><span class="set-effect__meta">펫 자동 스킬</span></summary><div class="set-effect__detail">${renderOptionChips(tabData?.petAutoSkillOption, "자동 스킬 정보가 없습니다.")}</div></details></div></article></section>`;
}
function renderLineChart(points) {
  const samples = toArray(points)
    .map((p) => ({
      ts: p.ts,
      value: parseNumericValue(p.expRate),
    }))
    .filter((p) => typeof p.value === "number" && Number.isFinite(p.value));
  if (samples.length < 2)
    return '<p class="empty">그래프를 그리려면 경험치 히스토리가 2개 이상 필요합니다.</p>';
  const width = 900,
    height = 300,
    padding = 34,
    values = samples.map((s) => s.value),
    min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || 1;
  const pts = samples
    .map((s, i) => {
      const x = padding + (i / (samples.length - 1)) * (width - padding * 2);
      const y =
        height - padding - ((s.value - min) / range) * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const circles = samples
    .map((s, i) => {
      const x = padding + (i / (samples.length - 1)) * (width - padding * 2);
      const y =
        height - padding - ((s.value - min) / range) * (height - padding * 2);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4" />`;
    })
    .join("");
  return `<div class="chart-wrap"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="경험치 변화 그래프"><line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" class="axis" /><line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="axis" /><polyline points="${pts}" class="line" />${circles}</svg><div class="chart-meta"><span>최소값 ${escapeHtml(formatPercentValue(min))}</span><span>최대값 ${escapeHtml(formatPercentValue(max))}</span></div></div>`;
}
function renderExpTab(expTab, expHistoryState) {
  if (expHistoryState.loading)
    return '<section class="tab-grid"><article class="data-card data-card--wide"><h3>경험치 그래프</h3><p class="empty">히스토리를 불러오는 중입니다...</p></article></section>';
  const points = toArray(expHistoryState?.data?.points);
  const rows = points.length
    ? points
        .slice(-10)
        .reverse()
        .map((p) => {
          return `<tr><td>${escapeHtml(formatTimestamp(p.ts))}</td><td>${escapeHtml(formatPercentValue(parseNumericValue(p.expRate)))}</td></tr>`;
        })
        .join("")
    : '<tr><td colspan="2">저장된 히스토리가 없습니다.</td></tr>';
  return `<section class="tab-grid"><article class="data-card data-card--wide"><h3>경험치 그래프</h3><p class="exp-now">현재 경험치율 <strong>${escapeHtml(formatPercentValue(parseNumericValue(expTab?.currentExpRate)))}</strong></p>${renderLineChart(points)}</article><article class="data-card"><h3>최근 기록</h3><table class="history-table"><thead><tr><th>시각</th><th>경험치율</th></tr></thead><tbody>${rows}</tbody></table></article></section>`;
}
function renderUnionTab(tabData, state) {
  const selected = resolveSelectedPreset("union", tabData, state);
  const data = selected?.data || {};
  const occupied = toArray(data.occupiedOptions),
    raider = toArray(data.raiderOptions);
  const summary = tabData?.summary || {};
  return `<section class="tab-grid"><article class="data-card data-card--wide"><h3>유니온 공격대 프리셋</h3>${renderPresetSelector("union", tabData, state)}<ul class="kv-list compact-kv"><li><span>유니온 레벨</span><strong>${escapeHtml(summary.unionLevel ?? "-")}</strong></li><li><span>유니온 등급</span><strong>${escapeHtml(summary.unionGrade || "-")}</strong></li></ul><p class="union-option">${escapeHtml(summary.unionLevelTotalOption || "-")}</p></article><article class="data-card"><h3>적용 점령 효과</h3><ul class="simple-list">${occupied.length ? occupied.map((i) => `<li>${escapeHtml(i.name)} ${escapeHtml(i.value || "")}</li>`).join("") : '<li class="empty">적용 점령 효과가 없습니다.</li>'}</ul></article><article class="data-card"><h3>적용 공격대 효과</h3><ul class="simple-list">${raider.length ? raider.map((i) => `<li>${escapeHtml(i.name)} ${escapeHtml(i.value || "")}</li>`).join("") : '<li class="empty">적용 공격대 효과가 없습니다.</li>'}</ul></article></section>`;
}
function renderAndroidTab(tabData, state) {
  const selected = resolveSelectedPreset("android", tabData, state);
  const data = selected?.data || {};
  const a = data.androidEquipment || {},
    h = data.heartEquipment || {};
  const aIcon = a.androidIcon
    ? `<img class="android-avatar" src="${escapeHtml(a.androidIcon)}" alt="${escapeHtml(a.androidName || "안드로이드")} 아이콘" />`
    : '<div class="android-avatar android-avatar--empty">NO IMAGE</div>';
  const hIcon = h.heartIcon
    ? `<img class="android-avatar" src="${escapeHtml(h.heartIcon)}" alt="${escapeHtml(h.heartName || "하트")} 아이콘" />`
    : '<div class="android-avatar android-avatar--empty">NO IMAGE</div>';
  return `<section class="tab-grid"><article class="data-card data-card--wide"><h3>안드로이드 프리셋</h3>${renderPresetSelector("android", tabData, state)}</article><article class="data-card"><h3>안드로이드</h3><div class="guild-head">${aIcon}<div><strong>${escapeHtml(a.androidName || "-")}</strong><p>${escapeHtml(a.androidGrade || "-")} | ${escapeHtml(a.androidGender || "-")}</p></div></div><ul class="kv-list"><li><span>닉네임</span><strong>${escapeHtml(a.androidNickname || "-")}</strong></li><li><span>창고 이동</span><strong>${escapeHtml(String(a.warehouseUsableFlag ?? "-"))}</strong></li><li><span>이어센서 클립</span><strong>${escapeHtml(String(a.earSensorClipFlag ?? "-"))}</strong></li></ul><p class="union-option">${escapeHtml(a.androidDescription || "-")}</p></article><article class="data-card"><h3>하트 장비</h3><div class="guild-head">${hIcon}<div><strong>${escapeHtml(h.heartName || "-")}</strong><p>${escapeHtml(h.heartDescription || "-")}</p></div></div><h4 class="sub-title">추가 옵션</h4><ul class="simple-list">${renderOptionList(h.additionalOption)}</ul><h4 class="sub-title">잠재 옵션</h4><ul class="simple-list">${renderOptionList(h.potentialOption)}</ul><h4 class="sub-title">에디셔널 잠재 옵션</h4><ul class="simple-list">${renderOptionList(h.additionalPotentialOption)}</ul></article><article class="data-card"><h3>안드로이드 캐시 장비</h3><ul class="simple-list">${
    toArray(a.cashItemEquipment).length
      ? toArray(a.cashItemEquipment)
          .map(
            (i) =>
              `<li><div class="item-main">${i.icon ? `<img src="${escapeHtml(i.icon)}" alt="${escapeHtml(i.name || "아이템")}" />` : ""}<div><strong>${escapeHtml(i.name || "-")}</strong><p>${escapeHtml(i.slotName || "-")}</p></div></div></li>`,
          )
          .join("")
      : '<li class="empty">안드로이드 캐시 장비가 없습니다.</li>'
  }</ul></article></section>`;
}
function renderJewelSymbolVmatrixTab(tabData, state) {
  const selectedPreset = resolveSelectedPreset(
    "jewelSymbolVmatrix",
    tabData,
    state,
  );
  const data = selectedPreset?.data || {};
  const jewels = toArray(data.jewelInfo),
    arcane = toArray(tabData?.symbol?.arcaneSymbols),
    auth = toArray(tabData?.symbol?.authenticSymbols),
    cores = toArray(tabData?.vmatrix?.vCores);
  return `<section class="tab-grid"><article class="data-card data-card--wide"><h3>쥬얼 페이지 프리셋</h3>${renderPresetSelector("jewelSymbolVmatrix", tabData, state)}<ul class="kv-list compact-kv"><li><span>적용 페이지</span><strong>${escapeHtml(String(tabData?.activePresetNo ?? "-"))}</strong></li><li><span>세트 옵션</span><strong>${escapeHtml(tabData?.activeSetOption || "-")}</strong></li><li><span>쥬얼 수</span><strong>${escapeHtml(String(jewels.length))}</strong></li></ul></article><article class="data-card data-card--wide"><h3>쥬얼 슬롯</h3><div class="card-grid card-grid--3">${jewels.length ? jewels.map((j) => `<article class="mini-card">${j.jewelIcon ? `<img src="${escapeHtml(j.jewelIcon)}" alt="${escapeHtml(j.jewelName || "쥬얼")}" />` : ""}<h4>${escapeHtml(j.jewelName || "-")}</h4><p>슬롯 ${escapeHtml(j.slotNo ?? "-")} | ${escapeHtml(j.jewelGrade || "-")} ${escapeHtml(j.jewelColor || "")}</p><p>${escapeHtml(j.jewelOption || "-")}</p></article>`).join("") : '<p class="empty">쥬얼 정보가 없습니다.</p>'}</div></article><article class="data-card"><h3>아케인 심볼</h3><ul class="simple-list">${arcane.length ? arcane.map((s) => `<li><strong>${escapeHtml(s.symbolName || "-")}</strong><p>Lv.${escapeHtml(s.symbolLevel ?? "-")} | ${escapeHtml(s.symbolOption || "-")}</p></li>`).join("") : '<li class="empty">아케인 심볼이 없습니다.</li>'}</ul></article><article class="data-card"><h3>어센틱 심볼</h3><ul class="simple-list">${auth.length ? auth.map((s) => `<li><strong>${escapeHtml(s.symbolName || "-")}</strong><p>Lv.${escapeHtml(s.symbolLevel ?? "-")} | ${escapeHtml(s.symbolOption || "-")}</p></li>`).join("") : '<li class="empty">어센틱 심볼이 없습니다.</li>'}</ul></article><article class="data-card data-card--wide"><h3>V매트릭스 코어</h3><div class="card-grid card-grid--3">${cores.length ? cores.map((c) => `<article class="mini-card"><h4>${escapeHtml(c.vcoreName || "-")}</h4><p>코어 Lv.${escapeHtml(c.vcoreLevel ?? "-")} / 슬롯 Lv.${escapeHtml(c.slotLevel ?? "-")}</p><p>${escapeHtml(toArray(c.skills).join(" / ") || "스킬 정보 없음")}</p></article>`).join("") : '<p class="empty">V코어 정보가 없습니다.</p>'}</div></article></section>`;
}
function renderHyperStatTab(tabData, state) {
  const selected = resolveSelectedPreset("hyperStat", tabData, state);
  const data = selected?.data || {};
  const info = toArray(data.hyperStatInfo);
  return `<section class="tab-grid"><article class="data-card data-card--wide"><h3>하이퍼스탯 프리셋</h3>${renderPresetSelector("hyperStat", tabData, state)}</article><article class="data-card data-card--wide"><h3>스탯 상세</h3><ul class="simple-list">${info.length ? info.map((i) => `<li><strong>${escapeHtml(i.statType || "-")}</strong><p>Lv.${escapeHtml(i.statLevel ?? "-")} | ${escapeHtml(i.statIncrease || "-")}</p></li>`).join("") : '<li class="empty">스탯 정보가 없습니다.</li>'}</ul></article></section>`;
}
function renderSkillLinkTab(tabData, state) {
  const selectedPreset = resolveSelectedPreset("skillLink", tabData, state);
  const data = selectedPreset?.data || {};
  const links = toArray(data.linkSkillInfo),
    skills = toArray(tabData?.skillSet);
  const rawSkillSet = tabData?.skillSetRaw;
  const rawFallback = rawSkillSet
    ? `<pre>${escapeHtml(JSON.stringify(rawSkillSet, null, 2))}</pre>`
    : '<p class="empty">스킬셋 정보가 없습니다.</p>';
  return `<section class="tab-grid"><article class="data-card data-card--wide"><h3>링크 스킬 프리셋</h3>${renderPresetSelector("skillLink", tabData, state)}<ul class="kv-list compact-kv"><li><span>적용 프리셋</span><strong>${escapeHtml(String(tabData?.activePresetNo ?? "-"))}</strong></li><li><span>링크 스킬 수</span><strong>${escapeHtml(String(links.length))}</strong></li><li><span>스킬셋 수</span><strong>${escapeHtml(String(skills.length))}</strong></li></ul></article><article class="data-card data-card--wide"><h3>링크 스킬</h3><div class="card-grid card-grid--3">${links.length ? links.map((s) => `<article class="mini-card">${s.skillIcon ? `<img src="${escapeHtml(s.skillIcon)}" alt="${escapeHtml(s.skillName || "스킬")}" />` : ""}<h4>${escapeHtml(s.skillName || "-")}</h4><p>Lv.${escapeHtml(s.skillLevel ?? "-")}</p><p>${escapeHtml(s.skillEffect || "-")}</p></article>`).join("") : '<p class="empty">링크 스킬 정보가 없습니다.</p>'}</div></article><article class="data-card data-card--wide"><h3>스킬셋</h3><div class="card-grid card-grid--3">${skills.length ? skills.map((s) => `<article class="mini-card">${s.skillIcon ? `<img src="${escapeHtml(s.skillIcon)}" alt="${escapeHtml(s.skillName || "스킬")}" />` : ""}<h4>${escapeHtml(s.skillName || "-")}</h4><p>Lv.${escapeHtml(s.skillLevel ?? "-")}</p><p>${escapeHtml(s.skillEffect || s.skillDescription || "-")}</p></article>`).join("") : ""}</div>${skills.length ? "" : rawFallback}</article></section>`;
}
function renderGuildTab(tabData, name) {
  const s = tabData?.summary || {};
  const m = tabData?.memberSelf;
  const mark = s.guildMarkIcon
    ? `<img class="guild-mark" src="${escapeHtml(s.guildMarkIcon)}" alt="${escapeHtml(s.guildName || "길드")} 마크" />`
    : '<div class="guild-mark guild-mark--empty">NO MARK</div>';
  return `<section class="tab-grid"><article class="data-card"><h3>길드 기본 정보</h3><div class="guild-head">${mark}<div><strong>${escapeHtml(s.guildName || "-")}</strong><p>${escapeHtml(s.worldName || "-")} | Lv.${escapeHtml(s.guildLevel ?? "-")}</p></div></div><ul class="kv-list"><li><span>길드장</span><strong>${escapeHtml(s.guildMasterName || "-")}</strong></li><li><span>길드원 수</span><strong>${escapeHtml(s.guildMemberCount ?? "-")}</strong></li><li><span>생성일</span><strong>${escapeHtml(s.guildCreateDate || "-")}</strong></li></ul></article><article class="data-card"><h3>내 캐릭터 길드 정보</h3>${
    m
      ? `<ul class="kv-list"><li><span>캐릭터명</span><strong>${escapeHtml(m.characterName || "-")}</strong></li><li><span>레벨</span><strong>${escapeHtml(m.characterLevel ?? "-")}</strong></li><li><span>길드 활동</span><strong>${escapeHtml(m.guildActivity ?? "-")}</strong></li></ul><h4 class="sub-title">개인 길드 스킬</h4><ul class="simple-list">${
          toArray(m.guildPersonalSkill).length
            ? toArray(m.guildPersonalSkill)
                .map(
                  (sk) =>
                    `<li><strong>${escapeHtml(sk.skillName || "-")}</strong><p>Lv.${escapeHtml(sk.skillLevel ?? "-")} | ${escapeHtml(sk.skillOption || "-")}</p></li>`,
                )
                .join("")
            : '<li class="empty">개인 길드 스킬 정보가 없습니다.</li>'
        }</ul>`
      : `<p class="empty">${escapeHtml(name || "현재 캐릭터")}와 일치하는 길드원 정보가 없습니다.</p>`
  }</article><article class="data-card"><h3>길드 스킬</h3><ul class="simple-list">${
    toArray(tabData?.guildSkills).length
      ? toArray(tabData.guildSkills)
          .map(
            (sk) =>
              `<li><strong>${escapeHtml(sk.skillName || "-")}</strong><p>Lv.${escapeHtml(sk.skillLevel ?? "-")} | ${escapeHtml(sk.skillOption || "-")}</p></li>`,
          )
          .join("")
      : '<li class="empty">길드 스킬 정보가 없습니다.</li>'
  }</ul></article><article class="data-card"><h3>길드 어빌리티</h3><ul class="simple-list">${
    toArray(tabData?.guildAbilities).length
      ? toArray(tabData.guildAbilities)
          .map(
            (ab) =>
              `<li><strong>${escapeHtml(ab.abilityName || "-")}</strong><p>Lv.${escapeHtml(ab.abilityLevel ?? "-")} | ${escapeHtml(ab.abilityOption || "-")}</p></li>`,
          )
          .join("")
      : '<li class="empty">길드 어빌리티 정보가 없습니다.</li>'
  }</ul></article><article class="data-card"><h3>길드 건물</h3><ul class="simple-list">${
    toArray(tabData?.guildBuildings).length
      ? toArray(tabData.guildBuildings)
          .map(
            (b) =>
              `<li><strong>${escapeHtml(b.buildingName || "-")}</strong><p>Lv.${escapeHtml(b.buildingLevel ?? "-")}</p></li>`,
          )
          .join("")
      : '<li class="empty">길드 건물 정보가 없습니다.</li>'
  }</ul></article><article class="data-card data-card--wide"><h3>길드원 미리보기</h3><div class="card-grid card-grid--4">${
    toArray(tabData?.memberPreview).length
      ? toArray(tabData.memberPreview)
          .map(
            (u) =>
              `<article class="mini-card"><h4>${escapeHtml(u.characterName || "-")}</h4><p>Lv.${escapeHtml(u.characterLevel ?? "-")}</p><p>활동 ${escapeHtml(u.guildActivity ?? "-")}</p></article>`,
          )
          .join("")
      : '<p class="empty">길드원 정보가 없습니다.</p>'
  }</div></article></section>`;
}
function renderHexamatrixTab(tabData) {
  const skills = toArray(tabData?.hexaSkills),
    cores = toArray(tabData?.hexaStatCoreList);
  return `<section class="tab-grid"><article class="data-card data-card--wide"><h3>헥사 스킬</h3><div class="card-grid card-grid--3">${skills.length ? skills.map((s) => `<article class="mini-card">${s.skillIcon ? `<img src="${escapeHtml(s.skillIcon)}" alt="${escapeHtml(s.skillName || "헥사 스킬")}" />` : ""}<h4>${escapeHtml(s.skillName || "-")}</h4><p>Lv.${escapeHtml(s.skillLevel ?? s.slotLevel ?? "-")} | ${escapeHtml(s.skillType || "-")}</p><p>${escapeHtml(s.skillEffect || "-")}</p></article>`).join("") : '<p class="empty">헥사 스킬 데이터가 없습니다.</p>'}</div></article><article class="data-card data-card--wide"><h3>헥사 스탯</h3><div class="card-grid card-grid--2">${
    cores.length
      ? cores
          .map(
            (c) =>
              `<article class="mini-card"><h4>코어 슬롯 ${escapeHtml(c.statCoreSlot ?? "-")}</h4><ul class="simple-list">${toArray(
                c.statInfo,
              )
                .map(
                  (i) =>
                    `<li><strong>${escapeHtml(i.mainStat || "-")} Lv.${escapeHtml(i.mainStatLevel ?? i.slotLevel ?? "-")}</strong><p>${escapeHtml(i.sub1Stat || "-")} Lv.${escapeHtml(i.sub1StatLevel ?? "-")} / ${escapeHtml(i.sub2Stat || "-")} Lv.${escapeHtml(i.sub2StatLevel ?? "-")}</p></li>`,
                )
                .join("")}</ul></article>`,
          )
          .join("")
      : '<p class="empty">헥사 스탯 데이터가 없습니다.</p>'
  }</div></article></section>`;
}
function renderTabContent(state) {
  const tabs = state.pageData?.tabs || {};
  if (state.activeTab === "equipment")
    return renderEquipmentTab(
      tabs.equipment || {},
      state.pageData?.profile || {},
      state,
    );
  if (state.activeTab === "exp")
    return renderExpTab(tabs.exp || {}, state.expHistory);
  if (state.activeTab === "jewelSymbolVmatrix")
    return renderJewelSymbolVmatrixTab(tabs.jewelSymbolVmatrix || {}, state);
  if (state.activeTab === "hexamatrix")
    return renderHexamatrixTab(tabs.hexamatrix || {});
  if (state.activeTab === "hyperStat")
    return renderHyperStatTab(tabs.hyperStat || {}, state);
  if (state.activeTab === "skillLink")
    return renderSkillLinkTab(tabs.skillLink || {}, state);
  if (state.activeTab === "android")
    return renderAndroidTab(tabs.android || {}, state);
  if (state.activeTab === "guild")
    return renderGuildTab(
      tabs.guild || {},
      state.pageData?.profile?.name || "",
    );
  if (state.activeTab === "union")
    return renderUnionTab(tabs.union || {}, state);
  return '<section class="tab-grid"><article class="data-card data-card--wide"><p class="empty">표시할 탭이 없습니다.</p></article></section>';
}
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
function initIndexPage() {
  bindCharacterSearchForm(document.getElementById("quickSearchForm"));
  bindCharacterSearchForm(document.getElementById("searchForm"));
}
async function initCharacterPage() {
  const messageEl = document.getElementById("pageMessage");
  const profileCardEl = document.getElementById("profileCard");
  const tabNavEl = document.getElementById("tabNav");
  const tabContentEl = document.getElementById("tabContent");
  if (!messageEl || !profileCardEl || !tabNavEl || !tabContentEl) return;
  const routeInfo = getCharacterRouteInfo();
  if (!routeInfo) {
    setMessage(messageEl, "URL 형식이 올바르지 않습니다.", "error");
    return;
  }
  const { worldName, characterName } = routeInfo;
  const quickSearchForm = document.getElementById("quickSearchForm");
  bindCharacterSearchForm(quickSearchForm);
  if (quickSearchForm) {
    const qws = quickSearchForm.querySelector('select[name="world_name"]');
    const qci = quickSearchForm.querySelector('input[name="character_name"]');
    if (qws) qws.value = worldName;
    if (qci) qci.value = characterName;
  }
  const state = {
    activeTab: "equipment",
    pageData: null,
    logStatus: null,
    expHistory: { loading: false, data: { ok: true, points: [] } },
    selectedPresetByTab: {
      equipment: null,
      union: null,
      android: null,
      jewelSymbolVmatrix: null,
      hyperStat: null,
      skillLink: null,
    },
  };
  const render = () => {
    tabContentEl.innerHTML = renderTabContent(state);
  };
  tabContentEl.hidden = false;
  tabContentEl.innerHTML = renderLoadingCard(
    "캐릭터 데이터를 불러오는 중입니다...",
  );
  setupTabNav(tabNavEl, (tabId) => {
    state.activeTab = tabId;
    render();
  });
  tabContentEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-preset-tab][data-preset-no]");
    if (!btn) return;
    const tabKey = btn.dataset.presetTab;
    const presetNo = parseNumericValue(btn.dataset.presetNo);
    if (!tabKey || presetNo === null) return;
    state.selectedPresetByTab[tabKey] = presetNo;
    render();
  });
  const params = new URLSearchParams({
    world_name: worldName,
    character_name: characterName,
  });
  try {
    const pageRes = await fetch(
      `/api/maplestorym/character/page-data?${params.toString()}`,
    );
    const page = await parseResponseSafely(pageRes);
    if (!pageRes.ok || !page.ok) {
      const m =
        page?.message ||
        page?.error?.error?.message ||
        "캐릭터 조회에 실패했습니다.";
      setMessage(messageEl, m, "error");
      tabContentEl.innerHTML = renderErrorCard(m);
      return;
    }
    state.pageData = page;
    profileCardEl.innerHTML = renderProfile(page.profile || {}, page.query || {});
    profileCardEl.hidden = false;
    tabNavEl.hidden = false;
    render();
    setMessage(messageEl, "캐릭터 데이터를 불러왔습니다.", "success");
    if (page.ocid) {
      state.expHistory.loading = true;
      if (state.activeTab === "exp") render();
      const [hRes, lRes] = await Promise.all([
        fetch(
          `/api/maplestorym/character/exp-history?${new URLSearchParams({ ocid: page.ocid, limit: "40" }).toString()}`,
        ),
        fetch(
          `/api/maplestorym/character/log-status?${new URLSearchParams({ ocid: page.ocid }).toString()}`,
        ),
      ]);
      const [hPayload, lPayload] = await Promise.all([
        parseResponseSafely(hRes),
        parseResponseSafely(lRes),
      ]);
      state.expHistory.loading = false;
      state.expHistory.data =
        hRes.ok && hPayload.ok ? hPayload : { ok: true, points: [] };
      state.logStatus = lRes.ok && lPayload.ok ? lPayload : null;
      profileCardEl.innerHTML = renderProfile(
        page.profile || {},
        page.query || {},
      );
      render();
    }
  } catch (error) {
    const m = `네트워크 오류: ${error.message}`;
    setMessage(messageEl, m, "error");
    tabContentEl.innerHTML = renderErrorCard(m);
  }
}
initThemeControls();
if (pageType === "index") {
  const red = redirectIndexCharacterPathIfNeeded();
  if (!red) initIndexPage();
}
if (pageType === "character") initCharacterPage();
