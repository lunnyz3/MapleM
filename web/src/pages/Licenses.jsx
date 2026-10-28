// 라이선스 화면(/preview/licenses): 직접 호스팅하는 글꼴(SIL OFL 1.1) 고지.
import { Card } from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import { Aurora, BlurText, Reveal } from "../components/Motion.jsx";
import { urls } from "../lib/game.js";

const FONTS = [
  {
    name: "Pretendard",
    use: "본문·화면 글자",
    version: "pretendard@1.3.9 (npm)",
    by: "© Kil Hyung-jin (orioncactus)",
    license: "SIL Open Font License 1.1",
    file: "licenses/pretendard-OFL.txt"
  },
  {
    name: "SUIT",
    use: "제목·큰 숫자",
    version: "@sun-typeface/suit@2.0.5 (npm)",
    by: "© SUNN (sun.fo/suit), 예약 글꼴 이름 “SUIT”",
    license: "SIL Open Font License 1.1",
    file: "licenses/SUIT-OFL.txt"
  }
];

export function Licenses() {
  const base = urls.home;
  return (
    <div class="lic">
      <header class="page-head">
        <Aurora tone="dusk" />
        <h1 class="page-head__title display">
          <BlurText text="글꼴 라이선스" />
        </h1>
      </header>

      <Reveal>
        <Card title="글꼴" icon="sparkle" tone="lavender">
          <ul class="lic-list">
            {FONTS.map((font) => (
              <li key={font.name} class="lic-item">
                <div class="lic-item__head">
                  <strong class={`lic-item__name${font.name === "SUIT" ? " display" : ""}`}>{font.name}</strong>
                  <span class="badge tone-lavender">{font.use}</span>
                </div>
                <p class="lic-item__meta num">
                  {font.version} · {font.by}
                </p>
                <a class="text-link" href={`${base}${font.file}`}>
                  {font.license} 전문 보기
                  <Icon name="chevronRight" size={18} />
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </Reveal>
    </div>
  );
}
