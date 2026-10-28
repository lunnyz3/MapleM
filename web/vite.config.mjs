// 사이트 화면(Vite + Preact) 빌드 설정. 결과는 dist/web/ 이고 Express가 / 에서 서빙한다.
// 스크립트·스타일은 app/ 아래(기존 화면의 /assets 이미지와 섞이지 않게).
//   npm run build:web   → dist/web/
//   npm run dev:web     → http://localhost:5173/ (API·이미지는 MAPLEM_API_ORIGIN 으로 프록시)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

const require = createRequire(import.meta.url);
const webRoot = fileURLToPath(new URL(".", import.meta.url));
const outDir = fileURLToPath(new URL("../dist/web", import.meta.url));
// 개발 서버가 /api 와 기존 화면(/character, /ranking.html …)을 넘길 로컬 Express 주소.
const apiOrigin = process.env.MAPLEM_API_ORIGIN || "http://localhost:3200";

/**
 * 직접 호스팅하는 글꼴(모두 SIL OFL 1.1)의 라이선스 전문을 빌드 결과에 함께 넣는다.
 *   /licenses/pretendard-OFL.txt  ← npm pretendard@1.3.9
 *   /licenses/SUIT-OFL.txt        ← npm @sun-typeface/suit@2.0.5
 * @returns {import("vite").Plugin}
 */
function fontLicense() {
  const files = [
    ["licenses/pretendard-OFL.txt", "pretendard/dist/LICENSE.txt"],
    ["licenses/SUIT-OFL.txt", "@sun-typeface/suit/LICENSE"]
  ];
  return {
    name: "maplem:font-license",
    apply: "build",
    generateBundle() {
      for (const [fileName, from] of files) {
        this.emitFile({ type: "asset", fileName, source: readFileSync(require.resolve(from), "utf8") });
      }
    }
  };
}

export default defineConfig({
  root: webRoot,
  base: "/",
  plugins: [preact(), fontLicense()],
  build: {
    outDir,
    emptyOutDir: true,
    assetsDir: "app",
    // 글꼴 조각(woff2)은 base64로 CSS에 넣지 않고 파일로 둔다.
    assetsInlineLimit: (filePath) => (filePath.endsWith(".woff2") ? false : undefined)
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // API·이미지·확률표는 로컬 Express로 보낸다(화면 주소는 Vite 가 맡는다).
      "^/(api|assets|probability|js|css|uploads|vendor)(/|$)": { target: apiOrigin }
    }
  }
});
