import {
  initThemeControls,
  pageType,
  removeDisabledRankingMenuLinks,
} from "./core/common.js";

const PAGE_MODULE_BY_TYPE = {
  index: "./pages/index.js",
  ranking: "./pages/ranking.js",
  guild: "./pages/guild.js",
  character: "./pages/character.js",
};
const ASSET_VERSION = "20261028a";

function renderBootstrapError(error) {
  const reason = String(error?.message || error || "unknown");
  const messageEl = document.getElementById("pageMessage");
  if (messageEl) {
    messageEl.textContent = `Bootstrap error: ${reason}`;
    messageEl.className = "notice error";
  }

  const tabContentEl = document.getElementById("tabContent");
  if (tabContentEl) {
    tabContentEl.innerHTML = `<article class="data-card data-card--wide"><h3>Error</h3><p class="empty">Bootstrap error: ${reason}</p></article>`;
  }
}

async function bootstrap() {
  initThemeControls();
  removeDisabledRankingMenuLinks();

  const targetModulePath = PAGE_MODULE_BY_TYPE[pageType];
  if (!targetModulePath) {
    return;
  }

  const pageModule = await import(`${targetModulePath}?v=${ASSET_VERSION}`);
  if (typeof pageModule?.init === "function") {
    await pageModule.init();
  }
}

window.addEventListener("error", (event) => {
  renderBootstrapError(event?.error || event?.message || "script_error");
});
window.addEventListener("unhandledrejection", (event) => {
  renderBootstrapError(event?.reason || "unhandled_rejection");
});

bootstrap().catch((error) => {
  console.error("Frontend bootstrap error:", error);
  renderBootstrapError(error);
});

