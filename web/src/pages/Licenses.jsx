// 라이선스·출처 화면(/preview/licenses): 직접 호스팅하는 글꼴, 오픈소스 패키지, 디자인 참고, 데이터 출처.
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
    file: "licenses/pretendard-OFL.txt",
    note: "작성자가 배포한 유니코드 범위별 조각(dynamic subset)을 그대로 써서, 화면에 필요한 조각만 내려받아요."
  },
  {
    name: "SUIT",
    use: "제목·큰 숫자",
    version: "@sun-typeface/suit@2.0.5 (npm)",
    by: "© SUNN (sun.fo/suit), 예약 글꼴 이름 “SUIT”",
    license: "SIL Open Font License 1.1",
    file: "licenses/SUIT-OFL.txt",
    note: "OFL은 고친 글꼴에 예약 이름을 못 쓰게 해서, 글자를 잘라내지 않은 원본 woff2(Bold·ExtraBold 두 굵기)를 그대로 배포해요."
  }
];

const PACKAGES = [
  { name: "Preact", version: "10.29.8", license: "MIT", use: "화면 구성 요소" },
  { name: "Vite", version: "8.3.4", license: "MIT", use: "빌드 도구(배포 파일에는 포함되지 않음)" },
  { name: "@preact/preset-vite", version: "2.10.6", license: "MIT", use: "빌드 도구(배포 파일에는 포함되지 않음)" }
];

export function Licenses() {
  const base = urls.home;
  return (
    <div class="lic">
      <header class="page-head">
        <Aurora tone="dusk" />
        <p class="page-head__eyebrow">
          <Icon name="info" size={16} />
          출처와 라이선스
        </p>
        <h1 class="page-head__title display">
          <BlurText text="라이선스 · 출처" />
        </h1>
        <p class="page-head__lead">이 화면에 쓰인 글꼴·코드·데이터의 출처와 라이선스예요.</p>
      </header>

      <Reveal>
        <Card title="글꼴" icon="sparkle" tone="lavender" description="두 글꼴 모두 이 사이트에서 직접 내려보내요(외부 글꼴 서버를 쓰지 않아요)">
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
                <p class="lic-item__note">{font.note}</p>
                <a class="text-link" href={`${base}${font.file}`}>
                  {font.license} 전문 보기
                  <Icon name="chevronRight" size={18} />
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </Reveal>

      <Reveal delay={60}>
        <Card title="오픈소스 패키지" icon="bolt" tone="sky">
          <ul class="lic-table">
            {PACKAGES.map((pkg) => (
              <li key={pkg.name}>
                <strong>{pkg.name}</strong>
                <span class="num">{pkg.version}</span>
                <span class="badge tone-sky">{pkg.license}</span>
                <span class="lic-table__use">{pkg.use}</span>
              </li>
            ))}
          </ul>
        </Card>
      </Reveal>

      <Reveal delay={120}>
        <Card title="인터랙션 디자인 참고" icon="sparkle" tone="peach">
          <p class="lic-body">
            숫자 카운트업, 블러 텍스트 등장, 스포트라이트·틸트 카드, 자석 버튼, 오로라 배경은{" "}
            <a href="https://reactbits.dev" rel="noopener noreferrer">
              React Bits
            </a>
            (David Haz)의 컴포넌트 아이디어를 참고했어요. React Bits는 순수 MIT가 아니라 <strong>MIT + Commons Clause</strong> 조건이라, 코드를 가져오지 않고
            외부 의존성 없이 직접 새로 만들었어요(<code>web/src/components/Motion.jsx</code>).
          </p>
        </Card>
      </Reveal>

      <Reveal delay={180}>
        <Card title="데이터 출처" icon="info" tone="gold">
          <p class="lic-body" lang="en">
            Data based on NEXON Open API
          </p>
          <p class="lic-body">
            캐릭터·랭킹·길드 정보는 넥슨 Open API의 메이플스토리M 데이터예요. 게임 이미지와 데이터의 권리는 넥슨에 있어요. 메이플M 플러스는 넥슨의 공식 서비스가
            아니에요. 계산 전투력·출처별 합산처럼 이 사이트가 계산한 값에는 “계산”·“추정” 표시를 달았어요.
          </p>
        </Card>
      </Reveal>
    </div>
  );
}
