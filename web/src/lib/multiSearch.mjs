// 멀티서치(순수 함수): 붙여 넣은 글에서 캐릭터 이름 뽑기. 카톡 대화(한 줄이라도)면 보낸 사람만, 아니면 줄·쉼표마다(띄어 쓴 이름 여럿도).
// 대화명("🦋 울보루팡 카데나 269 스카", "스카 𝓑 푱둉 나로", "몬밀/캡틴/295")은 이모지·기호를 떼고 월드(줄임말 포함 → 그 사람의 월드)·
// 직업 이름과 줄임말(게임에서 이름으로 못 쓰거나, 대화명에선 직업 표시)·레벨을 빼면 남는 낱말이 이름 후보(앞일수록 먼저, 서버가
// 있는 이름을 고른다). "울보루팡269"·"울보루팡카데나"처럼 붙여 쓴 것은 떼어 본 이름도 후보.

const NAME = /^[가-힣A-Za-z0-9]{2,12}$/;
// 모바일 복사: "[몬밀] [오후 3:21] 안녕" · PC 내보내기: "2026. 10. 30. 오후 3:21, 몬밀 : 안녕" · "2026년 10월 30일 오후 3:21, 몬밀 : 안녕"
const MOBILE_LINE = /^\[([^\]]+)\]\s*\[(?:오전|오후)\s*\d{1,2}:\d{2}\]/;
const PC_LINE = /^\d{4}(?:\.\s*\d{1,2}\.\s*\d{1,2}\.|년\s*\d{1,2}월\s*\d{1,2}일)\s*(?:오전|오후)\s*\d{1,2}:\d{2},\s*([^:]+?)\s*:/;
const MAX_CANDIDATES = 3;

const WORLD_ALIASES = { 스카니아: ["스카", "스카니"], 제니스: ["제니"], 크로아: ["크로"], 유니온: ["유니"], 엘리시움: ["엘리", "엘리시"], 아케인: ["아케"] };
const CLASS_WORDS = new Set(
  (
    "히어로 히어 팔라딘 팔라 팔 다크나이트 다크 닼나 다나 아크메이지 불독 썬콜 비숍 비숖 보우마스터 보마 신궁 패스파인더 패파 " +
    "나이트로드 나로 섀도어 섀도 듀얼블레이드 듀블 바이퍼 캡틴 캡 캐논슈터 캐슈 캐논 소울마스터 소마 플레임위자드 플위 " +
    "윈드브레이커 윈브 나이트워커 나워 스트라이커 스커 미하일 미하 아란 에반 루미너스 루미 메르세데스 메르 팬텀 은월 " +
    "데몬슬레이어 데슬 데몬어벤져 데벤 배틀메이지 배메 와일드헌터 와헌 메카닉 메카 제논 블래스터 블래 카이저 엔젤릭버스터 엔버 " +
    "카데나 카데 일리움 일리 아크 아이엘 호영 아델 칼리 라라 카인 렌 키네시스 키네 시아 에릴"
  ).split(" ")
);
const OTHER_WORDS = new Set(["길마", "부길마", "길드장", "운영진", "방장", "부방장", "본캐", "부캐", "lv"]);
const LEVEL = /^(?:lv)?\d+$/i;
// 붙여 쓴 꼬리: 레벨(100~300)·두 글자 넘는 직업·월드, 머리: 월드
const GLUED_LEVEL = /^(.{2,}?)(?:lv)?(?:[12]\d\d|300)$/i;
const GLUED_CLASS = [...CLASS_WORDS].filter((word) => word.length >= 2);

const wordsOf = (text) => String(text || "").split(/[^가-힣A-Za-z0-9]+/).filter(Boolean);
const isTagWord = (word) => CLASS_WORDS.has(word) || OTHER_WORDS.has(word.toLowerCase()) || LEVEL.test(word);

/** 월드 이름·줄임말 → 월드(넘겨받은 월드만) */
function worldWords(worlds) {
  const map = new Map();
  for (const world of worlds) {
    map.set(world, world);
    for (const alias of WORLD_ALIASES[world] || []) map.set(alias, world);
  }
  return map;
}

/** 붙여 쓴 레벨·직업·월드를 뗀 이름(뗄 게 없으면 "") */
function unglue(word, worldOf) {
  const worldKeys = [...worldOf.keys()].filter((key) => key.length >= 2);
  const tails = [...GLUED_CLASS, ...worldKeys].sort((a, b) => b.length - a.length);
  let name = word;
  for (;;) {
    const level = GLUED_LEVEL.exec(name);
    const tail = tails.find((suffix) => name.length - suffix.length >= 2 && name.endsWith(suffix));
    const head = worldKeys.find((prefix) => name.length - prefix.length >= 2 && name.startsWith(prefix));
    if (level) name = level[1];
    else if (tail) name = name.slice(0, -tail.length);
    else if (head) name = name.slice(head.length);
    else break;
  }
  return name === word ? "" : name;
}

/** 대화명·한 사람 줄 → { world, names }(이름 후보, 앞일수록 그럴듯함) */
function labelNames(label, worldOf) {
  let world = "";
  const names = [];
  const add = (name) => NAME.test(name) && !names.includes(name) && names.push(name);
  for (const word of wordsOf(label)) {
    if (worldOf.has(word)) world ||= worldOf.get(word);
    else if (!isTagWord(word)) {
      add(word);
      add(unglue(word, worldOf));
    }
  }
  return { world, names: names.slice(0, MAX_CANDIDATES) };
}

/** 목록: 줄·쉼표마다, 띄어 쓴 낱말은 저마다 이름. 단 "몬밀 캡틴 295 스카"처럼 직업·레벨·월드가 섞이면 한 사람 */
function listLabels(lines, worldOf) {
  return lines
    .flatMap((line) => line.split(/[,;·]+/))
    .flatMap((piece) => {
      const words = piece.trim().split(/\s+/).filter(Boolean);
      const tagged = words.some((word) => wordsOf(word).some((part) => worldOf.has(part) || isTagWord(part)));
      return words.length > 1 && tagged ? [piece] : words;
    });
}

/**
 * @param {string} text @param {string[]} worlds 월드 이름(대화명의 월드를 알아보려고)
 * @param {number} [limit]
 * @returns {{ entries: Array<{ world: string, name: string, alts?: string[] }>, fromChat: boolean, skipped: number, hint: string }}
 *   hint: 월드를 적은 사람이 가장 많은 월드(월드를 안 적은 사람을 넥슨에서 찾을 때 먼저)
 */
export function parseNames(text, worlds = [], limit = 30) {
  const worldOf = worldWords(worlds);
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const senders = lines.map((line) => (MOBILE_LINE.exec(line) || PC_LINE.exec(line) || [])[1]).filter(Boolean);
  // 카톡 형식 줄이 하나라도 있으면 대화: 보낸 사람만 읽고 대화 내용·이어진 줄·날짜 줄은 버린다
  const fromChat = senders.length > 0;
  const seen = new Set();
  const entries = [];
  const perWorld = new Map();
  let skipped = 0;
  for (const label of fromChat ? senders : listLabels(lines, worldOf)) {
    const { world, names } = labelNames(label, worldOf);
    if (!names.length) continue;
    const key = `${world}/${names[0].toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (entries.length >= limit) {
      skipped += 1;
      continue;
    }
    entries.push(names.length > 1 ? { world, name: names[0], alts: names.slice(1) } : { world, name: names[0] });
    if (world) perWorld.set(world, (perWorld.get(world) || 0) + 1);
  }
  const hint = [...perWorld].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  return { entries, fromChat, skipped, hint };
}

/**
 * 들어갈 수 있는 가장 어려운 보스(입장 전투력 기준). 전투력·레벨을 모르면 null.
 * @param {{ level: number, power: number }} member @param {Array<{ name: string, difficulty: string, level: number, power: number }>} bosses
 */
export function hardestBoss(member, bosses) {
  if (!(member?.power > 0) || !(member?.level > 0)) return null;
  let best = null;
  for (const boss of bosses) if (member.level >= boss.level && member.power >= boss.power && (!best || boss.power > best.power)) best = boss;
  return best;
}
