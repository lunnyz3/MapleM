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
const ASSET_VERSION = "20260303p";

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

bootstrap().catch((error) => {
  console.error("Frontend bootstrap error:", error);
});
