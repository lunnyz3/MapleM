import {
  applyPageIdentity,
  bindGuildSearchForm,
  buildScopedIdentityLabel,
  getGuildRouteInfo,
  normalizeGuildLookupErrorMessage,
  parseResponseSafely,
  renderErrorCard,
  renderLoadingCard,
  renderNotFoundCard,
  setMessage,
  setupTabNav,
  toArray,
} from "../core/common.js";
import { hydrateGuildMemberThumbs } from "../features/ranking-shared.js";
import {
  renderGuildAbilityTab,
  renderGuildBuildingTab,
  renderGuildMemberListTab,
  renderGuildSummaryCard,
} from "../features/guild-shared.js";

async function initGuildPage() {
  applyPageIdentity();
  bindGuildSearchForm(document.getElementById("quickSearchForm"));
  bindGuildSearchForm(document.getElementById("searchForm"));

  const messageEl = document.getElementById("pageMessage");
  const summaryEl = document.getElementById("guildSummary");
  const tabNavEl = document.getElementById("guildTabNav");
  const tabContentEl = document.getElementById("guildTabContent");
  const searchSectionEl = document.getElementById("guildSearchSection");

  const routeInfo = getGuildRouteInfo();
  if (!routeInfo) {
    setMessage(messageEl, "월드/길드명을 입력해 주세요.", "info");
    if (tabNavEl) tabNavEl.hidden = true;
    if (summaryEl) summaryEl.hidden = true;
    if (tabContentEl) {
      tabContentEl.innerHTML = renderNotFoundCard(
        "월드/길드명을 입력해 주세요.",
      );
    }
    return;
  }

  if (searchSectionEl) searchSectionEl.hidden = true;
  const { worldName, guildName } = routeInfo;
  applyPageIdentity(buildScopedIdentityLabel(guildName, worldName));
  setMessage(messageEl, "길드 데이터를 불러오는 중입니다...", "info");
  if (tabContentEl) {
    tabContentEl.innerHTML = renderLoadingCard("길드 데이터를 불러오는 중입니다...");
  }

  const state = {
    activeTab: "members",
    data: null,
  };

  const renderTab = () => {
    if (!tabContentEl || !state.data) return;
    if (state.activeTab === "members") {
      tabContentEl.innerHTML = renderGuildMemberListTab(
        state.data.members,
        state.data.summary.worldName || worldName,
      );
      hydrateGuildMemberThumbs(tabContentEl);
      return;
    }
    if (state.activeTab === "buildings") {
      tabContentEl.innerHTML = renderGuildBuildingTab(state.data.buildings);
      return;
    }
    if (state.activeTab === "abilities") {
      tabContentEl.innerHTML = renderGuildAbilityTab(state.data.abilities);
      return;
    }
    tabContentEl.innerHTML = renderNotFoundCard("표시할 탭이 없습니다.");
  };

  if (tabNavEl) {
    setupTabNav(tabNavEl, (tab) => {
      state.activeTab = tab;
      renderTab();
    });
  }

  try {
    const idQuery = new URLSearchParams({
      world_name: worldName,
      guild_name: guildName,
    });
    const idRes = await fetch(`/api/maplestorym/guild/id?${idQuery.toString()}`);
    const idPayload = await parseResponseSafely(idRes);
    if (!idRes.ok || !idPayload?.ok) {
      const mRaw =
        idPayload?.message ||
        idPayload?.error?.error?.message ||
        "길드 조회에 실패했습니다.";
      const m = normalizeGuildLookupErrorMessage(mRaw);
      setMessage(messageEl, m, "error");
      if (tabContentEl) {
        tabContentEl.innerHTML =
          m === "검색 결과가 없습니다." ? renderNotFoundCard(m) : renderErrorCard(m);
      }
      return;
    }

    const oguildId = String(idPayload?.data?.oguild_id || "").trim();
    if (!oguildId) {
      const m = "길드 ID를 찾을 수 없습니다.";
      setMessage(messageEl, m, "error");
      if (tabContentEl) tabContentEl.innerHTML = renderErrorCard(m);
      return;
    }

    const basicQuery = new URLSearchParams({ oguild_id: oguildId });
    const basicRes = await fetch(`/api/maplestorym/guild/basic?${basicQuery.toString()}`);
    const basicPayload = await parseResponseSafely(basicRes);
    if (!basicRes.ok || !basicPayload?.ok) {
      const mRaw =
        basicPayload?.message ||
        basicPayload?.error?.error?.message ||
        "길드 조회에 실패했습니다.";
      const m = normalizeGuildLookupErrorMessage(mRaw);
      setMessage(messageEl, m, "error");
      if (tabContentEl) {
        tabContentEl.innerHTML =
          m === "검색 결과가 없습니다." ? renderNotFoundCard(m) : renderErrorCard(m);
      }
      return;
    }

    const basicData = basicPayload?.data || {};
    const summary = {
      guildName: basicData.guild_name || guildName || "-",
      worldName: basicData.world_name || worldName || "-",
      guildLevel: basicData.guild_level ?? "-",
      guildCreateDate:
        basicData.guild_create_date || basicData.world_create_date || "-",
      guildMarkIcon: basicData.guild_mark_icon || "",
      guildMasterName: basicData.guild_master_name || "-",
      guildMemberCount: basicData.guild_member_count ?? "-",
    };
    const members = toArray(basicData.guild_member).map((member) => ({
      characterName: member?.character_name || "-",
      characterLevel: member?.character_level ?? "-",
      characterJob: member?.character_class || member?.character_job_name || "-",
      guildMemberGrade:
        member?.guild_member_grade || member?.guild_grade || "",
      guildActivity: member?.guild_activity ?? "-",
      characterImage:
        member?.character_image || member?.character_icon || "",
    }));
    const buildings = toArray(basicData.guild_building).map((building) => ({
      buildingName: building?.building_name || "-",
      buildingLevel: building?.building_level ?? 0,
    }));
    const abilities = toArray(basicData.guild_ability).map((ability) => ({
      abilityName: ability?.ability_name || "-",
      abilityLevel: ability?.ability_level ?? 0,
      abilityOption: ability?.ability_option || "-",
      abilityIcon: ability?.ability_icon || "",
      abilityGrade:
        ability?.ability_grade_name || ability?.ability_grade || "",
    }));

    state.data = { summary, members, buildings, abilities };
    applyPageIdentity(
      buildScopedIdentityLabel(summary.guildName || guildName, summary.worldName || worldName),
    );
    if (summaryEl) {
      summaryEl.innerHTML = renderGuildSummaryCard(summary);
      summaryEl.hidden = false;
    }
    if (tabNavEl) tabNavEl.hidden = false;
    setMessage(messageEl, "", "info");
    renderTab();
  } catch (error) {
    const m = `네트워크 오류: ${error.message}`;
    setMessage(messageEl, m, "error");
    if (tabContentEl) tabContentEl.innerHTML = renderErrorCard(m);
  }
}


export async function init() {
  await initGuildPage();
}
