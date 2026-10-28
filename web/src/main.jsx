// 새 UI 진입점. 글꼴은 모두 직접 호스팅(SIL OFL 1.1):
//   본문 Pretendard(npm pretendard, 유니코드 범위별 조각) · 제목·큰 숫자 SUIT(npm @sun-typeface/suit, 원본 woff2).
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/motion.css";
import "./styles/pages.css";
import "./styles/home.css";
import "./styles/design.css";
import { render } from "preact";
import { App } from "./app.jsx";

const root = document.getElementById("app");
if (root) render(<App />, root);
