// 새 UI 진입점. 글꼴(Pretendard, SIL OFL 1.1)은 npm 패키지에서 유니코드 범위별 조각으로 직접 호스팅한다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/home.css";
import "./styles/design.css";
import { render } from "preact";
import { App } from "./app.jsx";

const root = document.getElementById("app");
if (root) render(<App />, root);
