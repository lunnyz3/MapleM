import {
  applyPageIdentity,
  bindCharacterSearchForm,
  bindGuildSearchForm,
  redirectIndexCharacterPathIfNeeded,
  redirectIndexGuildPathIfNeeded,
} from "../core/common.js";

function initIndexPage() {
  applyPageIdentity();
  bindCharacterSearchForm(document.getElementById("quickSearchForm"));
  bindCharacterSearchForm(document.getElementById("searchForm"));
  bindGuildSearchForm(document.getElementById("guildSearchForm"));
}


export function init() {
  const redChar = redirectIndexCharacterPathIfNeeded();
  const redGuild = redChar ? true : redirectIndexGuildPathIfNeeded();
  if (!redChar && !redGuild) {
    initIndexPage();
  }
}
