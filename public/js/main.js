const pageType = document.body?.dataset?.page || "";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeJson(value) {
  return escapeHtml(JSON.stringify(value ?? {}, null, 2));
}

async function parseResponseSafely(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return {
    ok: false,
    message: "JSON 응답이 아닙니다.",
    contentType,
    bodyPreview: text.slice(0, 300)
  };
}

function initIndexPage() {
  const searchForm = document.getElementById("searchForm");
  const worldSelect = document.getElementById("worldName");
  const characterInput = document.getElementById("characterName");
  const routePreview = document.getElementById("routePreview");

  if (!searchForm || !worldSelect || !characterInput || !routePreview) {
    return;
  }

  const updatePreview = () => {
    const worldName = String(worldSelect.value || "").trim() || "유니온";
    const characterName = String(characterInput.value || "").trim() || "캐릭터명";
    routePreview.textContent = `/character/${worldName}/${characterName}`;
  };

  worldSelect.addEventListener("change", updatePreview);
  characterInput.addEventListener("input", updatePreview);

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const worldName = String(worldSelect.value || "").trim();
    const characterName = String(characterInput.value || "").trim();

    if (!worldName || !characterName) {
      routePreview.textContent = "서버명과 캐릭터명을 모두 입력해주세요.";
      return;
    }

    const params = new URLSearchParams({
      world_name: worldName,
      character_name: characterName
    });
    const targetPath = `/character/${encodeURIComponent(worldName)}/${encodeURIComponent(characterName)}?${params.toString()}`;
    window.location.assign(targetPath);
  });

  updatePreview();
}

function redirectIndexCharacterPathIfNeeded() {
  if (pageType !== "index") {
    return false;
  }

  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments.length < 3 || segments[0] !== "character") {
    return false;
  }

  const worldName = decodeURIComponent(segments[1] || "");
  const characterName = decodeURIComponent(segments.slice(2).join("/") || "");
  if (!worldName || !characterName) {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  if (!params.get("world_name")) {
    params.set("world_name", worldName);
  }
  if (!params.get("character_name")) {
    params.set("character_name", characterName);
  }

  window.location.replace(`/character.html?${params.toString()}`);
  return true;
}

function getCharacterRouteInfo() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const searchParams = new URLSearchParams(window.location.search);

  let worldName = "";
  let characterName = "";

  if (segments.length >= 3 && segments[0] === "character") {
    worldName = decodeURIComponent(segments[1] || "");
    characterName = decodeURIComponent(segments.slice(2).join("/") || "");
  }

  if (!worldName || !characterName) {
    worldName = String(searchParams.get("world_name") || "").trim();
    characterName = String(searchParams.get("character_name") || "").trim();
  }

  if (!worldName || !characterName) {
    return null;
  }

  return {
    worldName,
    characterName
  };
}

function setMessage(messageEl, text, type = "info") {
  if (!messageEl) {
    return;
  }

  messageEl.classList.remove("is-error", "is-success");
  if (type === "error") {
    messageEl.classList.add("is-error");
  }
  if (type === "success") {
    messageEl.classList.add("is-success");
  }

  messageEl.textContent = text;
}

function renderPageErrorCard(message, details) {
  return `
    <section class="tab-grid">
      <article class="data-card data-card--wide">
        <h3>조회 실패</h3>
        <p class="empty">${escapeHtml(message || "캐릭터 조회에 실패했습니다.")}</p>
        ${details ? `<pre>${safeJson(details)}</pre>` : ""}
      </article>
    </section>
  `;
}

function renderMajorStats(profile) {
  const majorStats = profile?.majorStats || {};
  const majorOrder = Array.isArray(profile?.majorStatOrder) && profile.majorStatOrder.length
    ? profile.majorStatOrder
    : [
        "physicalAttack",
        "physicalAttackPercent",
        "physicalDamagePercent",
        "bossDamage",
        "criticalDamage",
        "finalDamage",
        "maxDamage",
        "ignoreDefense"
      ];

  const cards = majorOrder
    .map((key) => {
      const stat = majorStats[key];
      if (!stat) {
        return "";
      }

      const breakdown = Array.isArray(stat.breakdown) ? stat.breakdown : [];
      const list = breakdown.length
        ? breakdown
            .map(
              (entry) => `
                <li>
                  <span>${escapeHtml(entry.source || "-")}</span>
                  <strong>${escapeHtml(entry.displayValue || "-")}</strong>
                </li>
              `
            )
            .join("")
        : '<li class="empty">기여 항목이 없습니다.</li>';

      return `
        <article class="major-card">
          <header class="major-card__head">
            <h4>${escapeHtml(stat.label || key)}</h4>
            <strong>${escapeHtml(stat.displayValue || "-")}</strong>
          </header>
          <ul class="major-card__list">${list}</ul>
        </article>
      `;
    })
    .filter(Boolean)
    .join("");

  if (!cards) {
    return "";
  }

  return `
    <section class="major-stats">
      <h3>주요 스탯</h3>
      <div class="major-stats__grid">${cards}</div>
    </section>
  `;
}

function renderProfile(profile, query) {
  const imageHtml = profile.imageUrl
    ? `<img class="profile-avatar" src="${escapeHtml(profile.imageUrl)}" alt="${escapeHtml(profile.name)} 이미지" />`
    : '<div class="profile-avatar profile-avatar--empty">NO IMAGE</div>';

  return `
    <article class="profile-main">
      <div class="profile-visual">${imageHtml}</div>
      <div class="profile-body">
        <h1>${escapeHtml(profile.name || "-")}</h1>
        <p class="profile-world">서버: ${escapeHtml(query.worldNameCanonical || "-")}</p>
        <div class="profile-stats">
          <div><span>직업</span><strong>${escapeHtml(profile.className || "-")}</strong></div>
          <div><span>랭킹</span><strong>${escapeHtml(profile.ranking || "-")}</strong></div>
          <div><span>레벨</span><strong>${escapeHtml(profile.level || "-")}</strong></div>
          <div><span>길드</span><strong>${escapeHtml(profile.guildName || "-")}</strong></div>
          <div><span>경험치</span><strong>${escapeHtml(profile.expText || "-")}</strong></div>
        </div>
      </div>
    </article>
    ${renderMajorStats(profile)}
  `;
}

function renderEndpointCard(title, endpointResult) {
  if (!endpointResult || !endpointResult.ok) {
    const status = endpointResult?.statusCode ? ` (${endpointResult.statusCode})` : "";
    return `
      <article class="data-card">
        <h3>${escapeHtml(title)}</h3>
        <p class="empty">데이터를 불러오지 못했습니다${escapeHtml(status)}.</p>
      </article>
    `;
  }

  return `
    <article class="data-card">
      <h3>${escapeHtml(title)}</h3>
      <pre>${safeJson(endpointResult.data)}</pre>
    </article>
  `;
}

function renderEquipmentTab(equipmentTab) {
  const itemEquipment = equipmentTab?.itemEquipment;
  const cashitemEquipment = equipmentTab?.cashitemEquipment;
  const setEffect = equipmentTab?.setEffect;
  const petEquipment = equipmentTab?.petEquipment;

  const items = itemEquipment?.data?.item_equipment || [];
  const cashData = cashitemEquipment?.data || {};
  const cashItems =
    (Array.isArray(cashData.cash_item_equipment) && cashData.cash_item_equipment) ||
    (Array.isArray(cashData.cashitem_equipment_base) && cashData.cashitem_equipment_base) ||
    (Array.isArray(cashData.cash_item_equipment_base) && cashData.cash_item_equipment_base) ||
    [];

  const presetNo = Number(cashData.use_preset_no);
  const presetList = Array.isArray(cashData.cash_equipment_preset) ? cashData.cash_equipment_preset : [];
  const selectedPreset = presetList.find((preset) => Number(preset?.preset_no) === presetNo) || presetList[0];
  const presetCashItems = Array.isArray(selectedPreset?.cash_item_equipment) ? selectedPreset.cash_item_equipment : [];
  const resolvedCashItems = cashItems.length ? cashItems : presetCashItems;

  const itemList = items.length
    ? items
        .map((item) => {
          const icon = item.item_icon ? `<img src="${escapeHtml(item.item_icon)}" alt="${escapeHtml(item.item_name || "아이템")}" />` : "";
          return `
            <li>
              <div class="item-main">
                ${icon}
                <div>
                  <strong>${escapeHtml(item.item_name || "-")}</strong>
                  <p>${escapeHtml(item.item_equipment_slot_name || "-")}</p>
                </div>
              </div>
            </li>
          `;
        })
        .join("")
    : '<li class="empty">장비 데이터가 없습니다.</li>';

  const cashList = resolvedCashItems.length
    ? resolvedCashItems
        .map((item) => {
          const icon = item.cash_item_icon
            ? `<img src="${escapeHtml(item.cash_item_icon)}" alt="${escapeHtml(item.cash_item_name || "캐시 장비")}" />`
            : "";
          return `
            <li>
              <div class="item-main">
                ${icon}
                <div>
                  <strong>${escapeHtml(item.cash_item_name || "-")}</strong>
                  <p>${escapeHtml(item.cash_item_equipment_slot_name || "-")}</p>
                </div>
              </div>
            </li>
          `;
        })
        .join("")
    : '<li class="empty">캐시 장비 데이터가 없습니다.</li>';

  return `
    <section class="tab-grid">
      <article class="data-card data-card--wide">
        <h3>착용 장비</h3>
        <ul class="item-list">${itemList}</ul>
      </article>
      <article class="data-card">
        <h3>캐시 장비</h3>
        <ul class="simple-list">${cashList}</ul>
      </article>
      ${renderEndpointCard("세트 효과", setEffect)}
      ${renderEndpointCard("펫 장비", petEquipment)}
    </section>
  `;
}

function formatTimestamp(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("ko-KR", { hour12: false });
}

function extractChartValue(point) {
  if (typeof point.exp === "number" && Number.isFinite(point.exp)) {
    return point.exp;
  }

  if (typeof point.expRate === "number" && Number.isFinite(point.expRate)) {
    return point.expRate;
  }

  return null;
}

function renderLineChart(points) {
  const samples = points
    .map((point) => ({
      ts: point.ts,
      value: extractChartValue(point)
    }))
    .filter((point) => point.value !== null);

  if (samples.length < 2) {
    return '<p class="empty">그래프를 그리려면 경험치 히스토리가 2개 이상 필요합니다.</p>';
  }

  const width = 900;
  const height = 300;
  const padding = 34;
  const values = samples.map((sample) => sample.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;

  const pointsAttr = samples
    .map((sample, index) => {
      const x = padding + (index / (samples.length - 1)) * (width - padding * 2);
      const y = height - padding - ((sample.value - minValue) / valueRange) * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const circleHtml = samples
    .map((sample, index) => {
      const x = padding + (index / (samples.length - 1)) * (width - padding * 2);
      const y = height - padding - ((sample.value - minValue) / valueRange) * (height - padding * 2);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4" />`;
    })
    .join("");

  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="경험치 변화 그래프">
        <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" class="axis" />
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="axis" />
        <polyline points="${pointsAttr}" class="line" />
        ${circleHtml}
      </svg>
      <div class="chart-meta">
        <span>최소값 ${escapeHtml(minValue)}</span>
        <span>최대값 ${escapeHtml(maxValue)}</span>
      </div>
    </div>
  `;
}

function renderExpTab(expTab, expHistory, isLoading) {
  const currentExp = expTab?.currentExp ?? "-";
  const currentRate = expTab?.currentExpRate ?? "-";

  if (isLoading) {
    return '<section class="data-card"><h3>경험치 그래프</h3><p>히스토리를 불러오는 중입니다...</p></section>';
  }

  const points = expHistory?.points || [];

  const pointRows = points.length
    ? points
        .slice(-10)
        .reverse()
        .map((point) => {
          const value = extractChartValue(point);
          return `<tr><td>${escapeHtml(formatTimestamp(point.ts))}</td><td>${escapeHtml(value ?? "-")}</td></tr>`;
        })
        .join("")
    : '<tr><td colspan="2">저장된 히스토리가 없습니다.</td></tr>';

  return `
    <section class="tab-grid">
      <article class="data-card data-card--wide">
        <h3>경험치 그래프</h3>
        <p class="exp-now">현재 경험치: <strong>${escapeHtml(currentExp)}</strong> | 경험치율: <strong>${escapeHtml(currentRate)}</strong></p>
        ${renderLineChart(points)}
      </article>
      <article class="data-card">
        <h3>최근 기록</h3>
        <table class="history-table">
          <thead>
            <tr><th>시각</th><th>값</th></tr>
          </thead>
          <tbody>${pointRows}</tbody>
        </table>
      </article>
    </section>
  `;
}

function formatGuildDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("ko-KR", { hour12: false });
}

function renderGuildSummaryCard(guildTab) {
  const summary = guildTab?.guildSummary || {};
  const mark = summary.guildMarkIcon
    ? `<img class="guild-mark" src="${escapeHtml(summary.guildMarkIcon)}" alt="${escapeHtml(summary.guildName || "길드")} 마크" />`
    : '<div class="guild-mark guild-mark--empty">NO MARK</div>';

  return `
    <article class="data-card">
      <h3>길드 기본 정보</h3>
      <div class="guild-head">
        ${mark}
        <div>
          <strong>${escapeHtml(summary.guildName || "-")}</strong>
          <p>${escapeHtml(summary.worldName || "-")} | Lv.${escapeHtml(summary.guildLevel ?? "-")}</p>
        </div>
      </div>
      <ul class="kv-list">
        <li><span>길드장</span><strong>${escapeHtml(summary.guildMasterName || "-")}</strong></li>
        <li><span>길드원 수</span><strong>${escapeHtml(summary.guildMemberCount ?? "-")}</strong></li>
        <li><span>길드 생성일</span><strong>${escapeHtml(formatGuildDate(summary.guildCreateDate))}</strong></li>
        <li><span>oguild_id</span><strong>${escapeHtml(summary.oguildId || "-")}</strong></li>
      </ul>
    </article>
  `;
}

function renderGuildSelfMemberCard(guildTab, fallbackCharacterName) {
  const member = guildTab?.memberSelf;
  if (!member) {
    return `
      <article class="data-card">
        <h3>내 캐릭터 길드 정보</h3>
        <p class="empty">${escapeHtml(fallbackCharacterName || "현재 캐릭터")}와 일치하는 길드원 정보가 없습니다.</p>
      </article>
    `;
  }

  const personalSkills = Array.isArray(member.guild_personal_skill) ? member.guild_personal_skill : [];
  const skillList = personalSkills.length
    ? personalSkills.map((skill) => `<li>${escapeHtml(skill.skill_name || "-")} Lv.${escapeHtml(skill.skill_level ?? "-")}</li>`).join("")
    : '<li class="empty">개인 길드 스킬 정보가 없습니다.</li>';

  return `
    <article class="data-card">
      <h3>내 캐릭터 길드 정보</h3>
      <ul class="kv-list">
        <li><span>캐릭터명</span><strong>${escapeHtml(member.character_name || "-")}</strong></li>
        <li><span>레벨</span><strong>${escapeHtml(member.character_level ?? "-")}</strong></li>
        <li><span>길드 활동</span><strong>${escapeHtml(member.guild_activity ?? "-")}</strong></li>
      </ul>
      <h4 class="sub-title">개인 길드 스킬</h4>
      <ul class="simple-list">${skillList}</ul>
    </article>
  `;
}

function renderUnionSummaryCard(unionTab) {
  const unionEndpoint = unionTab?.union;
  if (!unionEndpoint || !unionEndpoint.ok) {
    return renderEndpointCard("유니온", unionEndpoint);
  }

  const unionData = unionEndpoint.data || {};
  return `
    <article class="data-card">
      <h3>유니온</h3>
      <ul class="kv-list">
        <li><span>유니온 레벨</span><strong>${escapeHtml(unionData.union_level ?? "-")}</strong></li>
        <li><span>유니온 등급</span><strong>${escapeHtml(unionData.union_grade || "-")}</strong></li>
      </ul>
      <p class="union-option">${escapeHtml(unionData.union_level_total_option || "-")}</p>
    </article>
  `;
}

function renderUnionRaiderSummaryCard(unionTab) {
  const unionRaiderEndpoint = unionTab?.unionRaider;
  if (!unionRaiderEndpoint || !unionRaiderEndpoint.ok) {
    return renderEndpointCard("유니온 공격대", unionRaiderEndpoint);
  }

  const unionRaiderData = unionRaiderEndpoint.data || {};
  const occupied = Array.isArray(unionRaiderData.use_union_occupied_option) ? unionRaiderData.use_union_occupied_option : [];
  const raider = Array.isArray(unionRaiderData.use_union_raider_option) ? unionRaiderData.use_union_raider_option : [];

  const occupiedList = occupied.length
    ? occupied.map((item) => `<li>${escapeHtml(item.option_name || "-")} ${escapeHtml(item.option_value || "")}</li>`).join("")
    : '<li class="empty">점령 효과 정보가 없습니다.</li>';

  const raiderList = raider.length
    ? raider.map((item) => `<li>${escapeHtml(item.option_name || "-")} ${escapeHtml(item.option_value || "")}</li>`).join("")
    : '<li class="empty">공격대원 효과 정보가 없습니다.</li>';

  return `
    <article class="data-card">
      <h3>유니온 공격대</h3>
      <ul class="kv-list">
        <li><span>적용 프리셋</span><strong>${escapeHtml(unionRaiderData.use_preset_no ?? "-")}</strong></li>
        <li><span>전장 프리셋 수</span><strong>${escapeHtml(Array.isArray(unionRaiderData.battle_map) ? unionRaiderData.battle_map.length : 0)}</strong></li>
      </ul>
      <h4 class="sub-title">점령 효과</h4>
      <ul class="simple-list">${occupiedList}</ul>
      <h4 class="sub-title">공격대원 효과</h4>
      <ul class="simple-list">${raiderList}</ul>
    </article>
  `;
}

function renderAndroidOptionList(options) {
  const list = Array.isArray(options) ? options : [];
  if (!list.length) {
    return '<li class="empty">옵션 정보가 없습니다.</li>';
  }

  return list
    .map((option) => `<li>${escapeHtml(option?.option_name || "-")} ${escapeHtml(option?.option_value || "")}</li>`)
    .join("");
}

function renderAndroidTab(androidTab) {
  if (!androidTab) {
    return '<section class="data-card"><p class="empty">안드로이드 정보를 불러올 수 없습니다.</p></section>';
  }

  const endpoint = androidTab?.androidEquipment;
  if (!endpoint || !endpoint.ok) {
    return `<section class="tab-grid">${renderEndpointCard("안드로이드", endpoint)}</section>`;
  }

  const activeAndroid = androidTab?.active?.androidEquipment || {};
  const activeHeart = androidTab?.active?.heartEquipment || {};
  const androidIcon = activeAndroid?.android_icon
    ? `<img class="profile-avatar" src="${escapeHtml(activeAndroid.android_icon)}" alt="${escapeHtml(activeAndroid.android_name || "안드로이드")} 아이콘" />`
    : '<div class="profile-avatar profile-avatar--empty">NO IMAGE</div>';
  const heartIcon = activeHeart?.heart_icon
    ? `<img class="profile-avatar" src="${escapeHtml(activeHeart.heart_icon)}" alt="${escapeHtml(activeHeart.heart_name || "하트")} 아이콘" />`
    : '<div class="profile-avatar profile-avatar--empty">NO IMAGE</div>';

  return `
    <section class="tab-grid">
      <article class="data-card">
        <h3>안드로이드</h3>
        <div class="guild-head">
          ${androidIcon}
          <div>
            <strong>${escapeHtml(activeAndroid?.android_name || "-")}</strong>
            <p>${escapeHtml(activeAndroid?.android_grade || "-")} | 프리셋 ${escapeHtml(androidTab?.usePresetNo ?? "-")}</p>
          </div>
        </div>
        <ul class="kv-list">
          <li><span>닉네임</span><strong>${escapeHtml(activeAndroid?.android_nickname || "-")}</strong></li>
          <li><span>성별</span><strong>${escapeHtml(activeAndroid?.android_gender || "-")}</strong></li>
          <li><span>창고 이동</span><strong>${escapeHtml(activeAndroid?.android_warehouse_usable_flag || "-")}</strong></li>
        </ul>
        <p class="union-option">${escapeHtml(activeAndroid?.android_description || "-")}</p>
      </article>
      <article class="data-card">
        <h3>하트 장비</h3>
        <div class="guild-head">
          ${heartIcon}
          <div>
            <strong>${escapeHtml(activeHeart?.heart_name || "-")}</strong>
            <p>잠재 등급 ${escapeHtml(activeHeart?.item_potential_option_grade || "-")}</p>
          </div>
        </div>
        <h4 class="sub-title">추가 옵션</h4>
        <ul class="simple-list">${renderAndroidOptionList(activeHeart?.item_additional_option)}</ul>
        <h4 class="sub-title">잠재 옵션</h4>
        <ul class="simple-list">${renderAndroidOptionList(activeHeart?.item_potential_option)}</ul>
        <h4 class="sub-title">에디셔널 잠재 옵션</h4>
        <ul class="simple-list">${renderAndroidOptionList(activeHeart?.item_additional_potential_option)}</ul>
      </article>
      ${renderEndpointCard("안드로이드 원본", endpoint)}
    </section>
  `;
}

function renderGuildTab(guildTab, fallbackCharacterName) {
  if (!guildTab) {
    return '<section class="data-card"><p class="empty">길드 정보를 불러올 수 없습니다.</p></section>';
  }

  return `
    <section class="tab-grid">
      ${renderGuildSummaryCard(guildTab)}
      ${renderGuildSelfMemberCard(guildTab, fallbackCharacterName)}
      ${renderEndpointCard("길드 식별자 조회", guildTab.guildId)}
      ${renderEndpointCard("캐릭터 길드", guildTab.characterGuild)}
      ${renderEndpointCard("길드 상세 원본", guildTab.guildBasic)}
    </section>
  `;
}

function renderUnionTab(unionTab) {
  if (!unionTab) {
    return '<section class="data-card"><p class="empty">유니온 정보를 불러올 수 없습니다.</p></section>';
  }

  return `
    <section class="tab-grid">
      ${renderUnionSummaryCard(unionTab)}
      ${renderUnionRaiderSummaryCard(unionTab)}
      ${renderEndpointCard("유니온 원본", unionTab.union)}
      ${renderEndpointCard("유니온 공격대 원본", unionTab.unionRaider)}
    </section>
  `;
}

function renderTabContent(activeTab, pageData, expHistoryState) {
  const tabs = pageData?.tabs || {};

  if (activeTab === "equipment") {
    return renderEquipmentTab(tabs.equipment);
  }

  if (activeTab === "exp") {
    return renderExpTab(tabs.exp, expHistoryState.data, expHistoryState.loading);
  }

  if (activeTab === "jewelSymbolVmatrix") {
    return `
      <section class="tab-grid">
        ${renderEndpointCard("쥬얼", tabs.jewelSymbolVmatrix?.jewel)}
        ${renderEndpointCard("심볼", tabs.jewelSymbolVmatrix?.symbol)}
        ${renderEndpointCard("V매트릭스", tabs.jewelSymbolVmatrix?.vmatrix)}
      </section>
    `;
  }

  if (activeTab === "hexamatrix") {
    return `
      <section class="tab-grid">
        ${renderEndpointCard("헥사 스킬", tabs.hexamatrix?.skill)}
        ${renderEndpointCard("헥사 스탯", tabs.hexamatrix?.stat)}
      </section>
    `;
  }

  if (activeTab === "hyperStat") {
    return `<section class="tab-grid">${renderEndpointCard("하이퍼스탯", tabs.hyperStat)}</section>`;
  }

  if (activeTab === "skillLink") {
    return `
      <section class="tab-grid">
        ${renderEndpointCard("스킬셋", tabs.skillLink?.skillEquipment)}
        ${renderEndpointCard("링크 스킬", tabs.skillLink?.linkSkill)}
      </section>
    `;
  }

  if (activeTab === "android") {
    return renderAndroidTab(tabs.android);
  }

  if (activeTab === "guild") {
    return renderGuildTab(tabs.guild, pageData?.profile?.name || "");
  }

  if (activeTab === "union") {
    return renderUnionTab(tabs.union);
  }

  return '<section class="data-card"><p>표시할 탭이 없습니다.</p></section>';
}

function setupTabNav(tabNav, onChange) {
  const tabButtons = [...tabNav.querySelectorAll(".tab-btn")];

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.dataset.tab;
      if (!tabId) {
        return;
      }

      tabButtons.forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });

      onChange(tabId);
    });
  });
}

async function initCharacterPage() {
  const routeEl = document.getElementById("characterRoute");
  const messageEl = document.getElementById("pageMessage");
  const profileCardEl = document.getElementById("profileCard");
  const tabNavEl = document.getElementById("tabNav");
  const tabContentEl = document.getElementById("tabContent");

  if (!routeEl || !messageEl || !profileCardEl || !tabNavEl || !tabContentEl) {
    return;
  }

  const routeInfo = getCharacterRouteInfo();
  if (!routeInfo) {
    setMessage(messageEl, "URL 형식이 올바르지 않습니다.", "error");
    return;
  }

  const { worldName, characterName } = routeInfo;
  routeEl.textContent = `현재 경로: /character/${worldName}/${characterName}`;

  const state = {
    activeTab: "equipment",
    pageData: null,
    expHistory: {
      loading: false,
      data: null
    }
  };

  tabContentEl.hidden = false;
  tabContentEl.innerHTML = renderPageErrorCard("캐릭터 데이터를 불러오는 중입니다...", null);

  setupTabNav(tabNavEl, (tabId) => {
    state.activeTab = tabId;
    tabContentEl.innerHTML = renderTabContent(state.activeTab, state.pageData, state.expHistory);
  });

  const params = new URLSearchParams({
    world_name: worldName,
    character_name: characterName
  });

  try {
    const response = await fetch(`/api/maplestorym/character/page-data?${params.toString()}`);
    const payload = await parseResponseSafely(response);

    if (!response.ok || !payload.ok) {
      const message = payload?.message || payload?.error?.error?.message || "캐릭터 조회에 실패했습니다.";
      setMessage(messageEl, message, "error");
      tabContentEl.hidden = false;
      tabContentEl.innerHTML = renderPageErrorCard(message, payload);
      return;
    }

    state.pageData = payload;

    profileCardEl.innerHTML = renderProfile(payload.profile || {}, payload.query || {});
    profileCardEl.hidden = false;
    tabNavEl.hidden = false;
    tabContentEl.hidden = false;
    tabContentEl.innerHTML = renderTabContent(state.activeTab, state.pageData, state.expHistory);

    setMessage(messageEl, "캐릭터 데이터를 불러왔습니다.", "success");

    if (payload.ocid) {
      state.expHistory.loading = true;
      tabContentEl.innerHTML = renderTabContent(state.activeTab, state.pageData, state.expHistory);

      const historyParams = new URLSearchParams({
        ocid: payload.ocid,
        limit: "40"
      });

      const historyResponse = await fetch(`/api/maplestorym/character/exp-history?${historyParams.toString()}`);
      const historyPayload = await parseResponseSafely(historyResponse);

      state.expHistory.loading = false;
      if (historyResponse.ok && historyPayload.ok) {
        state.expHistory.data = historyPayload;
      } else {
        state.expHistory.data = { ok: true, points: [] };
      }

      tabContentEl.innerHTML = renderTabContent(state.activeTab, state.pageData, state.expHistory);
    }
  } catch (error) {
    const message = `네트워크 오류: ${error.message}`;
    setMessage(messageEl, message, "error");
    tabContentEl.hidden = false;
    tabContentEl.innerHTML = renderPageErrorCard(message, { message: error.message });
  }
}

if (pageType === "index") {
  const redirected = redirectIndexCharacterPathIfNeeded();
  if (!redirected) {
    initIndexPage();
  }
}

if (pageType === "character") {
  initCharacterPage();
}
