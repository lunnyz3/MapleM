// 새 UI(Vite + Preact) 빌드 설정. 결과는 dist/preview/ 이고 Express가 /preview 로 서빙한다.
//   npm run build:web   → dist/preview/
//   npm run dev:web     → http://localhost:5173/preview/ (API·기존 화면은 MAPLEM_API_ORIGIN 으로 프록시)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

const require = createRequire(import.meta.url);
const webRoot = fileURLToPath(new URL(".", import.meta.url));
const outDir = fileURLToPath(new URL("../dist/preview", import.meta.url));
// 개발 서버가 /api 와 기존 화면(/character, /ranking.html …)을 넘길 로컬 Express 주소.
const apiOrigin = process.env.MAPLEM_API_ORIGIN || "http://localhost:3200";

/**
 * 직접 호스팅하는 글꼴(모두 SIL OFL 1.1)의 라이선스 전문을 빌드 결과에 함께 넣는다.
 *   /preview/licenses/pretendard-OFL.txt  ← npm pretendard@1.3.9
 *   /preview/licenses/SUIT-OFL.txt        ← npm @sun-typeface/suit@2.0.5
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
  base: "/preview/",
  plugins: [preact(), fontLicense()],
  build: {
    outDir,
    emptyOutDir: true,
    // 글꼴 조각(woff2)은 base64로 CSS에 넣지 않고 파일로 둔다.
    assetsInlineLimit: (filePath) => (filePath.endsWith(".woff2") ? false : undefined)
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // /preview 밖의 요청(API, 기존 상세 화면)은 로컬 Express로 보낸다.
      "^/(?!preview(?:/|$)).*": { target: apiOrigin }
    }
  }
});
