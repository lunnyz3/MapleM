import {
  applyPageIdentity,
  bindCharacterSearchForm,
  redirectIndexCharacterPathIfNeeded,
  redirectIndexGuildPathIfNeeded,
} from "../core/common.js";

function initIndexPage() {
  applyPageIdentity();
  bindCharacterSearchForm(document.getElementById("quickSearchForm"));
  bindCharacterSearchForm(document.getElementById("searchForm"));
}


export function init() {
  const redChar = redirectIndexCharacterPathIfNeeded();
  const redGuild = redChar ? true : redirectIndexGuildPathIfNeeded();
  if (!redChar && !redGuild) {
    initIndexPage();
  }
}
