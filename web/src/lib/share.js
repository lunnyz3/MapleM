// 공유: 카드 캡처(html2canvas) · 이미지 저장(모바일은 서버 업로드 후 내려받기) · 카카오톡 공유 · 웹 공유 · 링크 복사.
// 서버 API는 기존 화면과 같다: GET /api/share/config, POST /api/share/item-image, GET /api/share/item-image-download/:fileName
import { render } from "preact";

export const SHARE_ATTRIBUTION = "Data based on NEXON Open API";
const DEFAULT_BASE_URL = "https://maplem.co.kr";
const HTML2CANVAS_SRC = "/vendor/html2canvas/html2canvas.min.js?v=20260305s";
const KAKAO_SDK_SRC = "https://developers.kakao.com/sdk/js/kakao.min.js";
/** 카카오 미리보기는 정사각형을 선호한다. 업로드가 크면 더 작게 다시 올린다. */
const KAKAO_SIZES = [800, 640, 512, 384];

/** @param {unknown} text @param {string} [fallback] */
const clean = (text, fallback = "") => String(text ?? "").trim().replace(/\s+/g, " ") || fallback;

// ---------------- 설정 ----------------

/** @type {Promise<{ kakaoEnabled: boolean, kakaoJsKey: string, baseUrl: string }> | null} */
let configPromise = null;

/** 공유 설정(카카오 JS 키 · 공유 링크 기준 주소). 실패하면 카카오 없이 동작한다. */
export function loadShareConfig() {
  if (!configPromise) {
    configPromise = (async () => {
      try {
        const response = await fetch("/api/share/config", { headers: { Accept: "application/json" } });
        const body = await response.json();
        if (!response.ok || !body?.ok) throw new Error("config");
        let baseUrl = DEFAULT_BASE_URL;
        try {
          const url = new URL(clean(body.shareWebBaseUrl, DEFAULT_BASE_URL));
          if (url.protocol === "http:" || url.protocol === "https:") baseUrl = url.toString().replace(/\/+$/, "");
        } catch {
          // 기본 주소를 쓴다.
        }
        const kakaoJsKey = clean(body.kakaoJsKey);
        return { kakaoEnabled: Boolean(body.kakaoEnabled) && Boolean(kakaoJsKey), kakaoJsKey, baseUrl };
      } catch {
        return { kakaoEnabled: false, kakaoJsKey: "", baseUrl: DEFAULT_BASE_URL };
      }
    })();
  }
  return configPromise;
}

/**
 * 공유할 페이지 주소(공유 기준 주소 + 경로).
 * @param {string} path
 */
export async function sharePageUrl(path) {
  const { baseUrl } = await loadShareConfig();
  return absoluteUrl(path, baseUrl);
}

/** @param {string} pathOrUrl @param {string} [base] */
function absoluteUrl(pathOrUrl, base = window.location.origin) {
  try {
    return new URL(String(pathOrUrl || ""), base).toString();
  } catch {
    return String(pathOrUrl || "");
  }
}

// ---------------- 스크립트 ----------------

/** @type {Map<string, Promise<void>>} */
const scripts = new Map();

/** @param {string} src */
function loadScript(src) {
  let pending = scripts.get(src);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const element = document.createElement("script");
      element.src = src;
      element.async = true;
      element.onload = () => resolve();
      element.onerror = () => reject(new Error("script"));
      document.head.appendChild(element);
    });
    pending.catch(() => scripts.delete(src));
    scripts.set(src, pending);
  }
  return pending;
}

async function getHtml2Canvas() {
  const w = /** @type {any} */ (window);
  if (typeof w.html2canvas !== "function") await loadScript(HTML2CANVAS_SRC);
  if (typeof w.html2canvas !== "function") throw new Error("이미지를 만드는 도구를 불러오지 못했어요.");
  return w.html2canvas;
}

// ---------------- 캡처 ----------------

/**
 * 안의 이미지가 다 들어올 때까지(최대 4.5초) 기다린다. 다른 출처 이미지는 CORS 로 다시 받는다.
 * @param {HTMLElement} root
 */
function waitImages(root) {
  const images = Array.from(root.querySelectorAll("img"));
  return Promise.all(
    images.map(
      (image) =>
        new Promise((resolve) => {
          if (image.loading === "lazy") image.loading = "eager";
          if (image.complete && image.naturalWidth > 0) return resolve(undefined);
          const timer = window.setTimeout(done, 4500);
          function done() {
            window.clearTimeout(timer);
            resolve(undefined);
          }
          image.addEventListener("load", done, { once: true });
          image.addEventListener("error", done, { once: true });
        })
    )
  );
}

/** html2canvas 가 못 읽는 색 표기 color(srgb r g b / a)(color-mix 의 계산값) → rgba() */
const SRGB_RE = /color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([-\d.e]+%?))?\s*\)/g;
const COLOR_PROPS = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "box-shadow",
  "text-shadow",
  "text-decoration-color",
  "fill",
  "stroke"
];

/** @param {string} value */
function toRgba(value) {
  return value.replace(SRGB_RE, (_, r, g, b, a) => {
    const channel = (/** @type {string} */ v) => Math.round(Math.max(0, Math.min(1, Number(v))) * 255);
    const alpha = a === undefined ? 1 : a.endsWith("%") ? Number(a.slice(0, -1)) / 100 : Number(a);
    return `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${Number.isFinite(alpha) ? alpha : 1})`;
  });
}

/**
 * 복제한 카드 안의 계산된 색 중 color(...) 를 rgba(...) 로 바꿔 인라인으로 넣는다.
 * @param {Element} root
 */
function inlineSafeColors(root) {
  const view = root.ownerDocument.defaultView || window;
  for (const element of [root, ...root.querySelectorAll("*")]) {
    const style = view.getComputedStyle(element);
    for (const prop of COLOR_PROPS) {
      const value = style.getPropertyValue(prop);
      if (value && value.includes("color(")) /** @type {HTMLElement} */ (element).style.setProperty(prop, toRgba(value), "important");
    }
  }
}

/**
 * 카드에 쓰인 글꼴(굵기·크기·글자)을 모두 내려받을 때까지 기다린다.
 * 글꼴은 유니코드 범위별 조각이라 document.fonts.ready 만으로는 아직 요청 전인 조각을 기다리지 못한다.
 * @param {HTMLElement} root
 */
async function loadFonts(root) {
  if (!document.fonts?.load) return;
  /** @type {Map<string, string>} */
  const specs = new Map();
  for (const element of [root, ...root.querySelectorAll("*")]) {
    const text = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || "")
      .join("")
      .trim();
    if (!text) continue;
    const style = getComputedStyle(element);
    const spec = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    specs.set(spec, (specs.get(spec) || "") + text);
  }
  await Promise.race([
    Promise.all([...specs].map(([spec, text]) => document.fonts.load(spec, text).catch(() => []))).then(() => document.fonts.ready),
    new Promise((resolve) => setTimeout(resolve, 4000))
  ]);
}

/**
 * 화면 밖에 카드를 그려 PNG 로 찍는다. 카드 안 이미지는 crossorigin="anonymous" 로 둬야 한다.
 * 찍는 동안 <html> 에 is-capturing 을 붙인다: html2canvas 는 원래 문서 body 에 인라인 <img> 를 넣어 글자 기준선을 재는데,
 * 전역 `img { display: block }` 때문에 그 img 가 줄을 바꿔 기준선이 아래로 잡히고 모든 글자가 밑으로 밀려 그려진다(share.css 에서 되돌림).
 * 배율은 기기와 상관없이 2배로 고정해 어디서 찍어도 같은 그림이 나오게 한다.
 * @param {import("preact").VNode} card
 * @returns {Promise<Blob>}
 */
export async function captureCard(card) {
  const html2canvas = await getHtml2Canvas();
  const host = document.createElement("div");
  host.className = "share-capture-host";
  host.setAttribute("aria-hidden", "true");
  document.body.appendChild(host);
  const root = document.documentElement;
  try {
    render(card, host);
    const target = /** @type {HTMLElement | null} */ (host.firstElementChild);
    if (!target) throw new Error("capture");
    await Promise.all([loadFonts(target), waitImages(target)]);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    root.classList.add("is-capturing");
    const canvas = await html2canvas(target, {
      backgroundColor: null,
      useCORS: true,
      logging: false,
      scale: 2,
      onclone: (/** @type {Document} */ _doc, /** @type {Element} */ element) => inlineSafeColors(element)
    });
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob && blob.size ? resolve(blob) : reject(new Error("이미지를 만들지 못했어요."))), "image/png");
    });
  } finally {
    root.classList.remove("is-capturing");
    render(null, host);
    host.remove();
  }
}

/**
 * maplem-<종류>-<이름>-<시각>.png
 * @param {string} name @param {string} [mode]
 */
export function shareFileName(name, mode = "share") {
  const safeName = clean(name, "item")
    .replace(/[^\w가-힯-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `maplem-${mode.replace(/[^a-z0-9_-]+/gi, "") || "share"}-${safeName || "item"}-${stamp}.png`;
}

// ---------------- 업로드 ----------------

/**
 * @typedef {{ itemName: string, worldName: string, characterName: string }} ShareMeta
 */

/**
 * PNG 를 서버에 올린다(카카오 이미지·모바일 내려받기용, 하루 보관).
 * @param {Blob} blob @param {string} fileName @param {ShareMeta} meta
 * @returns {Promise<{ imageUrl: string, downloadUrl: string }>}
 */
async function uploadImage(blob, fileName, meta) {
  const form = new FormData();
  form.append("image", blob, fileName);
  form.append("item_name", clean(meta.itemName));
  form.append("world_name", clean(meta.worldName));
  form.append("character_name", clean(meta.characterName));
  const response = await fetch("/api/share/item-image", { method: "POST", body: form });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok || !body?.ok) {
    const error = /** @type {any} */ (new Error(String(body?.message || "이미지를 올리지 못했어요.")));
    error.status = response.status;
    error.code = String(body?.code || "");
    throw error;
  }
  return { imageUrl: String(body.imageUrl || ""), downloadUrl: String(body.downloadUrl || "") };
}

/**
 * 정사각형(아래쪽 기준)으로 잘라 다시 그린다. 카카오 피드 미리보기용.
 * @param {Blob} blob @param {number} size
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 */
async function squareImage(blob, size) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    const sw = image.naturalWidth;
    const sh = image.naturalHeight;
    const side = Math.min(sw, sh);
    const sx = Math.floor((sw - side) / 2);
    const sy = sh > sw ? sh - side : 0;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return { blob, width: sw, height: sh };
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
    const out = await new Promise((resolve) => canvas.toBlob((value) => resolve(value || blob), "image/png"));
    return { blob: /** @type {Blob} */ (out), width: size, height: size };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** @param {any} error */
const isTooLarge = (error) => error?.status === 413 || String(error?.code || "").toUpperCase() === "IMAGE_TOO_LARGE";

/**
 * @param {Blob} blob @param {string} fileName @param {ShareMeta} meta
 */
async function uploadForKakao(blob, fileName, meta) {
  let lastError = null;
  for (const size of KAKAO_SIZES) {
    const square = await squareImage(blob, size);
    try {
      const uploaded = await uploadImage(square.blob, fileName, meta);
      return { ...square, imageUrl: absoluteUrl(uploaded.imageUrl) };
    } catch (error) {
      lastError = error;
      if (!isTooLarge(error)) throw error;
    }
  }
  throw lastError || new Error("이미지를 올리지 못했어요.");
}

// ---------------- 저장 ----------------

export function isMobileBrowser() {
  const ua = String(navigator.userAgent || "");
  const touchMac = navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1;
  return /Android|iPhone|iPad|iPod/i.test(ua) || touchMac;
}

/**
 * 모바일은 비동기 작업 뒤에 새 창을 열면 막히므로, 누른 순간 빈 창을 먼저 잡아 둔다.
 * 반드시 클릭 처리 안에서 await 전에 부른다.
 */
export function reserveDownloadWindow() {
  if (!isMobileBrowser()) return null;
  const popup = window.open("", "_blank");
  if (!popup) return null;
  try {
    popup.document.title = "이미지 준비 중";
    popup.document.body.style.cssText = "margin:0;padding:24px;font-family:sans-serif;color:#23243f";
    popup.document.body.textContent = "이미지를 준비하고 있어요…";
  } catch {
    // 다른 창 접근이 막혀도 주소 이동은 된다.
  }
  return popup;
}

/**
 * 이미지 저장. 데스크톱은 바로 내려받기, 모바일은 서버에 올린 뒤 내려받기 주소로(실패하면 새 창에 이미지).
 * @param {{ blob: Blob, fileName: string, meta: ShareMeta, popup: Window | null }} params
 * @returns {Promise<"download" | "open">}
 */
export async function saveImage({ blob, fileName, meta, popup }) {
  let used = false;
  try {
    if (isMobileBrowser()) {
      try {
        const uploaded = await uploadImage(blob, fileName, meta);
        const url = absoluteUrl(uploaded.downloadUrl || uploaded.imageUrl);
        if (url) {
          if (popup && !popup.closed) popup.location.href = url;
          else window.location.href = url;
          used = true;
          return "download";
        }
      } catch {
        // 아래 방법으로 이어 간다.
      }
      const objectUrl = URL.createObjectURL(blob);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      if (popup && !popup.closed) popup.location.href = objectUrl;
      else if (!window.open(objectUrl, "_blank")) window.location.href = objectUrl;
      used = true;
      return "open";
    }
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      anchor.remove();
    }, 0);
    used = true;
    return "download";
  } finally {
    if (!used && popup && !popup.closed) popup.close();
  }
}

// ---------------- 카카오톡 · 웹 공유 · 링크 ----------------

/** @param {string} key */
async function getKakao(key) {
  const w = /** @type {any} */ (window);
  if (!w.Kakao) await loadScript(KAKAO_SDK_SRC);
  const Kakao = w.Kakao;
  if (!Kakao) throw new Error("카카오톡 공유를 불러오지 못했어요.");
  if (typeof Kakao.isInitialized === "function" && !Kakao.isInitialized()) Kakao.init(key);
  if (!Kakao.Share?.sendDefault) throw new Error("카카오톡 공유를 쓸 수 없어요.");
  return Kakao;
}

/**
 * 카카오톡 공유: 이미지를 정사각형으로 올리고 피드 메시지를 보낸다.
 * @param {{ blob: Blob, fileName: string, meta: ShareMeta, title: string, description: string, pageUrl: string, buttonTitle: string }} params
 */
export async function shareKakao({ blob, fileName, meta, title, description, pageUrl, buttonTitle }) {
  const config = await loadShareConfig();
  if (!config.kakaoEnabled) throw new Error("카카오톡 공유를 쓸 수 없어요.");
  const [Kakao, image] = await Promise.all([getKakao(config.kakaoJsKey), uploadForKakao(blob, fileName, meta)]);
  Kakao.Share.sendDefault({
    objectType: "feed",
    content: {
      title: clean(title, "메이플M 플러스"),
      description: clean(description, "메이플M 플러스"),
      imageUrl: image.imageUrl,
      imageWidth: image.width,
      imageHeight: image.height,
      link: { webUrl: pageUrl, mobileWebUrl: pageUrl }
    },
    buttons: [{ title: clean(buttonTitle, "구경하기"), link: { webUrl: pageUrl, mobileWebUrl: pageUrl } }]
  });
}

/** 기기 공유창(navigator.share)이 있는지. */
export function canWebShare() {
  return typeof navigator.share === "function";
}

/**
 * 기기 공유창: 이미지 파일을 함께 보낼 수 있으면 파일로, 아니면 링크로.
 * @param {{ blob?: Blob | null, fileName: string, title: string, text: string, url: string }} params
 * @returns {Promise<"shared" | "cancelled">}
 */
export async function webShare({ blob, fileName, title, text, url }) {
  if (!canWebShare()) throw new Error("이 브라우저는 공유창을 지원하지 않아요.");
  try {
    if (blob) {
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title, text: [text, url].filter(Boolean).join("\n"), files: [file] });
        return "shared";
      }
    }
    await navigator.share({ title, text, url });
    return "shared";
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return "cancelled";
    throw error;
  }
}

/**
 * 글자를 클립보드에 넣는다(권한이 없으면 예전 방식으로).
 * @param {string} text
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 아래 방식으로 시도한다.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:-1000px;opacity:0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

// ---------------- 잠재 확률 자랑 문구 ----------------

/** @type {WeakMap<object, Promise<any>>} 장비별 계산 결과(문구·장비 상세가 같이 쓴다) */
const breakdowns = new WeakMap();

/**
 * 확률표(/probability/*.json) 계산은 기존 모듈을 그대로 쓴다(처음 쓸 때 따로 내려받음). 실패하면 null.
 * 장비 마스터리 상승분은 모듈이 빼고 계산한다.
 * @param {any} item @param {any} profile
 */
function itemBreakdown(item, profile) {
  if (!item || typeof item !== "object") return Promise.resolve(null);
  let pending = breakdowns.get(item);
  if (!pending) {
    pending = import("../../../public/js/features/item-share.js")
      .then(async (module) => ({ module, breakdown: await module.resolveTopPercentBreakdown(item, profile) }))
      .catch(() => null);
    breakdowns.set(item, pending);
  }
  return pending;
}

/** @param {any} module @param {number | null | undefined} probability fraction (0–1) */
function toPercentText(module, probability) {
  const value = Number(probability);
  return Number.isFinite(value) && value > 0 ? module.formatAdditionalOptionPercent(value * 100) : "";
}

/**
 * 장비 상세에 쓰는 계산 결과: 줄별 마스터리 상승분("+4%")과 잠재·에디·추가 옵션의 상위 %("3.2%", 이 장비 이상 나올 확률, 마스터리 적용 전 값 기준). 없으면 null.
 * @param {any} item @param {any} profile
 * @returns {Promise<{ bonuses: { potential: string[], additionalPotential: string[], additional: string[] }, additionalOptionTop: string, potentialTop: string, additionalPotentialTop: string } | null>}
 */
export async function itemInsight(item, profile) {
  const result = await itemBreakdown(item, profile);
  const breakdown = result?.breakdown;
  if (!breakdown) return null;
  const texts = (/** @type {any} */ section) => (Array.isArray(section?.lines) ? section.lines.map((line) => line?.text || "") : []);
  return {
    bonuses: {
      potential: texts(breakdown.mastery?.potential),
      additionalPotential: texts(breakdown.mastery?.additionalPotential),
      additional: texts(breakdown.mastery?.additional)
    },
    // 이 장비 이상 나올 확률(상위 %), 마스터리 적용 전 값 기준 — 공유 문구와 같다.
    additionalOptionTop: result.module.formatAdditionalOptionPercent(breakdown.additionalOptionPercent),
    potentialTop: toPercentText(result.module, breakdown.potentialProbability),
    additionalPotentialTop: toPercentText(result.module, breakdown.additionalProbability)
  };
}

/**
 * 공유 문구("상위 0.057%, 블랙큐브 1,766개, 에디셔널 큐브 3,548개 짜리 아이템입니다!"). 상위 % 는 이 장비 이상
 * 좋은 잠재·에디가 나올 확률(마스터리 적용 전 값 기준), 계산은 item-share.js captionFromBreakdown. 없으면 "".
 * @param {any} item @param {any} profile
 * @returns {Promise<string>}
 */
export async function topPercentCaption(item, profile) {
  try {
    const result = await itemBreakdown(item, profile);
    if (!result?.breakdown) return "";
    const caption = result.module.captionFromBreakdown(result.breakdown);
    return caption === "-" ? "" : caption;
  } catch {
    return "";
  }
}
