// Title, description and share preview (og) tags for the web app's index.html. Link previews
// (KakaoTalk, messengers, search engines) do not run scripts, so the server writes these per address.
const scoreMax = require("../game-data/item-score-max.json");

const SITE = "메이플M 플러스";
const ORIGIN = "https://maplem.co.kr";
const IMAGE = `${ORIGIN}/og.png`;
const DEFAULT_DESCRIPTION = "메이플스토리M 캐릭터·길드 검색, 장비 템환산과 잠재 상위 %, 전투력·아이템 랭킹, 계산기, 무료 카카오톡 봇.";

const STATIC_PAGES = {
  "/": { title: SITE, description: DEFAULT_DESCRIPTION },
  "/ranking": { title: "랭킹", description: "메이플스토리M 전투력·레벨 공식 랭킹과 템환산·잠재·에디 스펙 랭킹, 제네시스·아케인셰이드 아이템 랭킹." },
  "/stats": { title: "통계", description: "메이플스토리M 전투력 상위 캐릭터의 직업별 인원·평균 전투력·템환산, 직업별 상위 100명의 무기 잠재·에디·추옵과 장신구, 레벨 분포." },
  "/game": { title: "미니게임", description: "메이플스토리M 장비창만 보고 누가 더 센지, 전투력이 얼마인지 맞히는 미니게임. 연속 기록과 점수에 도전하세요." },
  "/my": { title: "내 캐릭터 한눈에", description: "메이플스토리M 즐겨찾기한 본캐·부캐의 전투력·템환산·최근 7일 변화를 한 표로." },
  "/party": { title: "보스 파티 모집", description: "메이플스토리M 보스 파티 모집: 월드·보스·조건 전투력으로 글을 올리고, 지원자의 전투력과 입장 가능을 바로 확인." },
  "/looks": { title: "코디 구경", description: "메이플스토리M 인기 헤어·성형·캐시 아이템 순위와 그 코디를 한 캐릭터, 무작위 코디 구경." },
  "/events": { title: "이벤트 달력", description: "메이플스토리M 진행 중인 이벤트와 끝나는 날(D-day), 곧 시작하는 이벤트." },
  "/race": { title: "레벨 300 레이스", description: "메이플스토리M 레벨 랭킹 상위 20명의 Lv.300 레이스 실시간 중계와 이번 주 가장 많이 오른 사람." },
  "/news": { title: "강화 소식", description: "메이플스토리M 오늘 스타포스 최대 달성·옵션 대박·새 장비를 맞춘 캐릭터 소식." },
  "/hall": { title: "명예의 전당", description: "메이플스토리M 전투력·템환산·무기 잠재·추옵·최종 대미지 추옵 최고 기록 보유자." },
  "/calc": { title: "계산기", description: "메이플스토리M HEXA 강화 기간, HEXA 스탯 기댓값, 심볼 비용, 무기 해방 날짜 계산기." },
  "/multi": { title: "멀티서치", description: "메이플스토리M 캐릭터 여러 명을 한 번에: 닉네임 목록이나 카톡 대화를 붙여 넣으면 전투력·템환산·갈 수 있는 보스를 한 표로." },
  "/compare": { title: "캐릭터 비교", description: "메이플스토리M 두 캐릭터의 전투력·스탯·장비 템환산 비교." },
  "/guild": { title: "길드", description: "메이플스토리M 길드 검색과 길드원 전투력 순위." },
  "/guild/compare": { title: "길드 비교", description: "메이플스토리M 두 길드의 길드원 수·평균 레벨·상위 10명 전투력·보스 입장 인원 비교." },
  "/bot": { title: "카카오톡 봇", description: "단톡방에 무료로 넣는 메이플스토리M 캐릭터 정보 봇. 오픈채팅으로 신청하세요." }
};

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment).trim();
  } catch {
    return "";
  }
}

/** 192215561 → "1억 9,221만" */
function koreanUnits(value) {
  const number = Math.floor(Number(value) || 0);
  const eok = Math.floor(number / 1e8);
  const man = Math.floor((number % 1e8) / 1e4);
  const parts = [];
  if (eok) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man) parts.push(`${man.toLocaleString("ko-KR")}만`);
  return parts.join(" ") || number.toLocaleString("ko-KR");
}

/**
 * @param {string} pathname request path (already without query)
 * @param {{ findSpec?: (worldName: string, characterName: string) => Promise<object | null> }} [deps]
 * @returns {Promise<{ title: string, description: string, path: string }>}
 */
async function pageMeta(pathname, { findSpec } = {}) {
  const pagePath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
  const character = pagePath.match(/^\/character\/([^/]+)\/([^/]+)$/);
  if (character) {
    const world = decodeSegment(character[1]);
    const name = decodeSegment(character[2]);
    let description = `${world} ${name}의 장비·스탯·전투력·성장 기록을 메이플M 플러스에서 확인하세요.`;
    const spec = findSpec && world && name ? await findSpec(world, name).catch(() => null) : null;
    if (spec) {
      const facts = [
        spec.characterLevel ? `Lv.${spec.characterLevel}` : "",
        spec.characterClass || "",
        spec.combatPower ? `전투력 ${koreanUnits(spec.combatPower)}` : "",
        spec.itemScore && scoreMax.fullSet?.max ? `템환산 ${Math.min(100, (Number(spec.itemScore) / scoreMax.fullSet.max) * 100).toFixed(1)}점` : ""
      ].filter(Boolean);
      if (facts.length) description = `${world} · ${facts.join(" · ")}`;
    }
    return { title: `${name} · ${world} · ${SITE}`, description, path: pagePath };
  }
  const guild = pagePath.match(/^\/guild\/([^/]+)\/([^/]+)$/);
  if (guild) {
    const world = decodeSegment(guild[1]);
    const name = decodeSegment(guild[2]);
    return { title: `${name} · ${world} 길드 · ${SITE}`, description: `${world} ${name} 길드의 길드원 목록과 전투력 순위.`, path: pagePath };
  }
  const page = STATIC_PAGES[pagePath];
  if (page) return { title: page.title === SITE ? SITE : `${page.title} · ${SITE}`, description: page.description, path: pagePath };
  return { title: SITE, description: DEFAULT_DESCRIPTION, path: pagePath };
}

/** Puts the page's title, description and og/twitter tags into the built index.html. */
function renderIndex(html, meta) {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const url = escapeHtml(`${ORIGIN}${meta.path.split("/").map((part) => encodeURIComponent(decodeSegment(part))).join("/")}`);
  const tags = [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta property="og:locale" content="ko_KR" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`
  ].join("\n    ");
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${description}" />`)
    .replace("</head>", `    ${tags}\n  </head>`);
}

module.exports = { pageMeta, renderIndex, escapeHtml, koreanUnits };
