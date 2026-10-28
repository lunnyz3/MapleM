// 디자인 시스템 견본(/preview/design): 토큰·글꼴·아이콘·컴포넌트 상태를 한 화면에서 확인한다.
import { useState } from "preact/hooks";
import { Avatar } from "../components/Avatar.jsx";
import { Card } from "../components/Card.jsx";
import { BrandMark, Cloud, Leaf, Sparkle } from "../components/Decor.jsx";
import { ICON_NAMES, Icon } from "../components/Icon.jsx";
import { RankBadge } from "../components/RankBadge.jsx";
import { SkeletonList } from "../components/Skeleton.jsx";
import { SourceStamp } from "../components/SourceStamp.jsx";
import { StatTile } from "../components/StatTile.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { Segmented, TabPanel, Tabs } from "../components/Tabs.jsx";
import { formatKoreanUnits, kstToday } from "../lib/format.js";

const PALETTE = [
  ["sky", ["50", "100", "300", "500", "600", "700", "900"]],
  ["mint", ["50", "100", "300", "500", "700", "900"]],
  ["lavender", ["50", "100", "300", "500", "700", "900"]],
  ["peach", ["50", "100", "300", "500", "700", "900"]],
  ["gold", ["50", "100", "300", "500", "700", "900"]],
  ["cream", ["50", "100", "300"]],
  ["ink", ["50", "100", "300", "500", "700", "900"]]
];

const SEMANTIC = [
  ["--bg", "페이지 바탕"],
  ["--surface", "카드"],
  ["--surface-soft", "카드 안 구획"],
  ["--border", "테두리"],
  ["--text", "본문"],
  ["--text-muted", "보조 텍스트"],
  ["--text-subtle", "캡션"],
  ["--primary", "버튼 바탕"],
  ["--primary-strong", "링크·강조"],
  ["--success", "상승·성공"],
  ["--warning", "주의·추정"],
  ["--danger", "오류·하락"],
  ["--info", "안내"],
  ["--focus-ring", "포커스 링"]
];

const TYPE_SCALE = [
  ["40", "히어로", "var(--fs-40)", 800],
  ["28", "페이지 제목", "var(--fs-28)", 800],
  ["22", "섹션 제목(상세 화면)", "var(--fs-22)", 800],
  ["18", "카드 제목·소제목", "var(--fs-18)", 800],
  ["16", "본문", "var(--fs-16)", 400],
  ["14", "보조", "var(--fs-14)", 400],
  ["12", "캡션", "var(--fs-12)", 400]
];

const SOURCE_BADGES = [
  ["sky", "공식", "넥슨 Open API 값"],
  ["lavender", "계산", "공개한 산식으로 계산"],
  ["gold", "추정", "추정 모델, 오차 있음"],
  ["peach", "직접 입력", "사용자가 넣은 값"]
];

/** @param {{ title: string, children: any, description?: string }} props */
function Section({ title, description, children }) {
  return (
    <section class="ds-section">
      <header class="ds-section__head">
        <h2 class="section-title">{title}</h2>
        {description ? <p class="ds-section__desc">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function DesignSystem() {
  const [tab, setTab] = useState("level");
  const [segment, setSegment] = useState("favorites");
  const [kind, setKind] = useState("character");

  return (
    <div class="ds">
      <header class="ds-intro">
        <p class="hero__eyebrow">
          <Leaf size={16} />
          docs/design-system.md 구현 견본
        </p>
        <h1 class="ds-intro__title">메이플 하늘 대시보드 · 디자인 시스템</h1>
        <p class="ds-intro__lead">
          새 화면이 쓰는 토큰과 컴포넌트를 실제 코드로 모았어요. 오른쪽 위 버튼으로 다크 모드도 확인할 수 있어요.
        </p>
      </header>

      <Section title="색" description="컴포넌트는 팔레트를 직접 쓰지 않고 의미 토큰만 써요. 아래 의미 토큰은 현재 테마 값이에요.">
        <div class="ds-palette">
          {PALETTE.map(([name, shades]) => (
            <div class="ds-palette__row" key={name}>
              <span class="ds-palette__name">{name}</span>
              <div class="ds-palette__swatches">
                {shades.map((shade) => (
                  <span key={shade} class="ds-swatch" style={{ background: `var(--${name}-${shade})` }} title={`--${name}-${shade}`}>
                    <span class="ds-swatch__label">{shade}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div class="ds-tokens">
          {SEMANTIC.map(([token, label]) => (
            <div class="ds-token" key={token}>
              <span class="ds-token__chip" style={{ background: `var(${token})` }} />
              <span class="ds-token__text">
                <code>{token}</code>
                <span>{label}</span>
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="글꼴" description="Pretendard Variable(SIL OFL 1.1) 하나로 쓰고, 숫자는 tabular-nums로 자릿수를 맞춰요.">
        <Card>
          <div class="ds-type">
            {TYPE_SCALE.map(([size, label, fontSize, weight]) => (
              <div class="ds-type__row" key={size}>
                <span class="ds-type__meta num">
                  {size}px · {label}
                </span>
                <span class="ds-type__sample" style={{ fontSize, fontWeight: weight }}>
                  모험가의 오늘을 한눈에
                </span>
              </div>
            ))}
            <div class="ds-type__row">
              <span class="ds-type__meta">큰 수 표기</span>
              <span class="ds-type__sample num" style={{ fontSize: "var(--fs-22)", fontWeight: 800 }}>
                {formatKoreanUnits(1153901361)} · {formatKoreanUnits(208179041009010)} · {formatKoreanUnits(28700)}
              </span>
            </div>
          </div>
        </Card>
      </Section>

      <Section title="아이콘·장식" description="직접 그린 SVG. 24px 격자, 선 굵기 1.75px, 둥근 끝.">
        <Card>
          <ul class="ds-icons">
            {ICON_NAMES.map((name) => (
              <li key={name} class="ds-icons__item">
                <Icon name={name} />
                <code>{name}</code>
              </li>
            ))}
          </ul>
          <div class="ds-decor">
            <BrandMark size={48} />
            <Leaf size={48} class="ds-decor__leaf" />
            <Leaf size={36} class="ds-decor__leaf ds-decor__leaf--gold" />
            <Sparkle size={28} class="ds-decor__sparkle" />
            <Cloud width={120} class="ds-decor__cloud" />
          </div>
        </Card>
      </Section>

      <Section title="버튼·배지">
        <Card>
          <div class="ds-row">
            <button type="button" class="btn btn--primary">
              <Icon name="search" size={20} />
              검색
            </button>
            <button type="button" class="btn btn--secondary">
              <Icon name="refresh" size={20} />
              다시 시도
            </button>
            <button type="button" class="btn btn--ghost">기록 지우기</button>
            <button type="button" class="icon-btn" aria-label="즐겨찾기 예시">
              <Icon name="heart" />
            </button>
            <a class="text-link" href="#top">
              전체 보기
              <Icon name="chevronRight" size={18} />
            </a>
          </div>
          <div class="ds-row">
            {SOURCE_BADGES.map(([tone, label, help]) => (
              <span class="ds-badge-sample" key={label}>
                <span class={`badge tone-${tone}`}>{label}</span>
                <span class="ds-badge-sample__help">{help}</span>
              </span>
            ))}
          </div>
          <SourceStamp date={kstToday()} note="최근 집계일 기준" />
        </Card>
      </Section>

      <Section title="순위 배지·캐릭터 이미지" description="1·2·3위는 금·은·동 단풍잎, 그 외는 숫자. 이미지가 없으면 이름 첫 글자.">
        <Card>
          <div class="ds-row">
            {[1, 2, 3, 4, 5, 12, 128].map((rank) => (
              <RankBadge key={rank} rank={rank} />
            ))}
          </div>
          <div class="ds-row">
            <Avatar world="" name="단풍" size={44} />
            <Avatar world="" name="하늘" size={44} />
            <Avatar world="" name="구름" size={44} />
            <Avatar kind="guild" world="" name="길드" size={44} />
          </div>
        </Card>
      </Section>

      <Section title="탭" description="←/→ 키로 이동해요. 탭이 많으면 한 줄로 두고 옆으로 밀어요.">
        <Card>
          <Tabs
            idBase="ds-pill"
            label="견본 탭"
            scrollable
            value={tab}
            onChange={setTab}
            items={["종합", "유니온", "업적", "전장", "지하수로", "시간의 근원", "전투력", "무릉도장", "커닝M타워"].map((label, index) => ({
              id: index === 0 ? "level" : `t${index}`,
              label
            }))}
          />
          <TabPanel idBase="ds-pill" value={tab}>
            <p class="ds-note">선택한 탭: {tab}</p>
          </TabPanel>
          <Tabs
            idBase="ds-seg"
            label="견본 구획 탭"
            variant="segmented"
            value={segment}
            onChange={setSegment}
            items={[
              { id: "favorites", label: "즐겨찾기", count: 2 },
              { id: "recent", label: "최근 검색", count: 7 }
            ]}
          />
          <Segmented
            name="ds-kind"
            legend="검색 대상 견본"
            value={kind}
            onChange={setKind}
            options={[
              { value: "character", label: "캐릭터", icon: "user" },
              { value: "guild", label: "길드", icon: "flag" }
            ]}
          />
        </Card>
      </Section>

      <Section title="수치 타일" description="큰 수는 한국식 단위, 마우스를 올리면 전체 값. 변화량은 ▲▼ 기호와 함께.">
        <div class="ds-grid ds-grid--tiles">
          <StatTile label="전투력" icon="bolt" tone="peach" value="11억 5,390만" full="1,153,901,361" sub="성령 · 스카니아" delta={1250000} />
          <StatTile label="무릉도장" icon="gate" tone="mint" value="71" unit="층" sub="지난주보다" delta={-2} />
          <StatTile label="레벨" icon="crown" tone="gold" prefix="Lv." value="298" sub="피카츄 · 유니온" />
          <StatTile label="불러오는 중" icon="hourglass" tone="lavender" loading />
        </div>
      </Section>

      <Section title="로딩·빈 상태·오류">
        <div class="ds-grid">
          <Card title="로딩" icon="clock" tone="sky" headingLevel={3}>
            <SkeletonList rows={3} />
          </Card>
          <Card title="빈 상태" icon="info" tone="lavender" headingLevel={3}>
            <EmptyState compact title="최근 집계된 랭킹이 없어요" description="넥슨 랭킹은 하루 한 번 집계돼요." />
          </Card>
          <Card title="오류" icon="alert" tone="peach" headingLevel={3}>
            <ErrorState compact title="랭킹을 불러오지 못했어요" description="넥슨 API 응답이 원활하지 않아요." detail="HTTP 502" onRetry={() => {}} />
          </Card>
        </div>
      </Section>
    </div>
  );
}
