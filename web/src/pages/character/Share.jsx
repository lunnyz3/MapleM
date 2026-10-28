// 캐릭터 화면 공유: 프로필 카드(이미지 저장·카카오톡·공유창·링크 복사) · 장비 카드(잠재 확률 자랑 문구).
import "../../styles/share.css";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { BrandMark } from "../../components/Decor.jsx";
import { Icon } from "../../components/Icon.jsx";
import { Sheet } from "../../components/Sheet.jsx";
import { Skeleton } from "../../components/Skeleton.jsx";
import { toast } from "../../components/Toast.jsx";
import { combatPowerOf } from "../../lib/character.js";
import { formatComma, formatDecimal, formatKoreanUnits } from "../../lib/format.js";
import { urls, worldIconSrc } from "../../lib/game.js";
import {
  SHARE_ATTRIBUTION,
  canWebShare,
  captureCard,
  copyText,
  loadShareConfig,
  reserveDownloadWindow,
  saveImage,
  shareFileName,
  shareKakao,
  sharePageUrl,
  topPercentCaption,
  webShare
} from "../../lib/share.js";
import { useShareCaption } from "../../lib/shareSettings.js";
import { EquipDetail } from "./Equipment.jsx";

/** 카드 안 다른 출처 이미지(넥슨)는 CORS 로 받아야 캡처에 찍힌다. */
const CORS = "anonymous";

/** 카드 아래: 로고 · 주소 · 출처 한 줄 */
function CardFoot() {
  return (
    <footer class="sc-foot">
      <div class="sc-foot__row">
        <span class="sc-brand">
          <BrandMark size={22} />
          메이플M<b>플러스</b>
        </span>
        <span class="sc-domain">maplem.co.kr</span>
      </div>
      <span class="sc-attribution" lang="en">
        {SHARE_ATTRIBUTION}
      </span>
    </footer>
  );
}

/**
 * 프로필 공유 카드(600px, 정사각형에 가까운 판). 캡처와 미리보기에 같이 쓴다.
 * html2canvas 로 찍으므로 share.css 의 캡처 안전 규칙(gap 없음, 줄 높이 고정)을 지킨다.
 * @param {{ profile: any, world: string }} props
 */
export function ProfileShareCard({ profile, world }) {
  const name = profile.name || "";
  const power = combatPowerOf(profile.combatPower).value;
  const expRate = Math.max(0, Math.min(100, Number(profile.expRate) || 0));
  const overall = Number(profile.overallRanking) || 0;
  const guild = profile.guildName && profile.guildName !== "-" ? profile.guildName : "";
  const worldIcon = worldIconSrc(world);
  // 이름이 길면 글자를 줄여 한 줄에 둔다(영문 12자·한글 8자 안팎까지).
  const nameWidth = [...name].reduce((sum, char) => sum + (/[\u3131-\uD79D]/.test(char) ? 1 : 0.62), 0);
  const nameClass = nameWidth > 9 ? " is-longer" : nameWidth > 6.5 ? " is-long" : "";
  return (
    <article class="sc sc-profile">
      <span class="sc-cloud sc-cloud--1" aria-hidden="true" />
      <span class="sc-cloud sc-cloud--2" aria-hidden="true" />
      <span class="sc-glow" aria-hidden="true" />
      <header class="sc-profile__top">
        <span class="sc-pill">
          {worldIcon ? <img src={worldIcon} alt="" width={18} height={18} /> : null}
          {world}
        </span>
        <span class="sc-pill sc-pill--soft">{profile.jobName || profile.className || "-"}</span>
      </header>
      <div class="sc-profile__stage">
        {profile.imageUrl ? <img src={profile.imageUrl} alt="" width={184} height={184} crossOrigin={CORS} /> : <b>{name.slice(0, 1)}</b>}
      </div>
      <h2 class={`sc-profile__name${nameClass}`}>{name}</h2>
      <div class="sc-profile__level">
        <span class="sc-profile__lv">Lv.{profile.level ?? "-"}</span>
        <span class="sc-exp">
          <span style={{ width: `${expRate}%` }} />
        </span>
        <span class="sc-profile__exp">{formatDecimal(expRate, 2)}%</span>
      </div>
      <ul class="sc-stats">
        <li class="sc-stat sc-stat--power">
          <span class="sc-stat__label">전투력</span>
          <span class="sc-stat__value">{power !== null ? formatKoreanUnits(power) : "-"}</span>
        </li>
        <li class="sc-stat">
          <span class="sc-stat__label">종합 랭킹</span>
          <span class="sc-stat__value">{overall ? `${formatComma(overall)}위` : "-"}</span>
        </li>
        <li class="sc-stat">
          <span class="sc-stat__label">길드</span>
          <span class="sc-stat__value">
            {guild && profile.guildMarkIcon ? <img src={profile.guildMarkIcon} alt="" width={20} height={20} crossOrigin={CORS} /> : null}
            {guild || "-"}
          </span>
        </li>
      </ul>
      <CardFoot />
    </article>
  );
}

/**
 * 장비 공유 카드: 게임 툴팁 판 + (선택) 자랑 문구 말풍선 + 주인. 옵션은 두 줄로 나란히 놓아 정사각형에
 * 가깝게 만든다(카카오톡 말풍선은 세로로 긴 이미지의 가운데만 잘라 보여 준다).
 * @param {{ item: any, caption?: string, profile: any, world: string }} props
 */
export function ItemShareCard({ item, caption = "", profile, world }) {
  const worldIcon = worldIconSrc(world);
  return (
    <article class="sc sc-item sc-item--wide">
      <span class="sc-glow" aria-hidden="true" />
      <header class="sc-item__owner">
        {profile?.imageUrl ? <img class="sc-item__avatar" src={profile.imageUrl} alt="" width={40} height={40} crossOrigin={CORS} /> : null}
        <span class="sc-item__who">
          <b>{profile?.name || ""}</b>
          <span>
            {worldIcon ? <img src={worldIcon} alt="" width={14} height={14} /> : null}
            {world} · Lv.{profile?.level ?? "-"}
          </span>
        </span>
      </header>
      {caption ? <p class="sc-bubble">{caption}</p> : null}
      <div class="sc-item__detail">
        <EquipDetail item={item} profile={profile} />
      </div>
      <CardFoot />
    </article>
  );
}

/**
 * @typedef {Object} ShareSpec
 * @property {() => Promise<Blob>} getBlob     카드 이미지(PNG)
 * @property {string} fileName
 * @property {import("../../lib/share.js").ShareMeta} meta
 * @property {string} path                     공유할 화면 경로
 * @property {string} title                    카카오·공유창 제목
 * @property {string} description              카카오 설명·공유창 글
 * @property {string} buttonTitle              카카오 버튼
 */

/** 카카오톡 공유를 쓸 수 있는지(GET /api/share/config 에 키가 있으면 true, 없으면 버튼을 숨긴다). */
export function useKakaoEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    loadShareConfig().then((config) => alive && setEnabled(config.kakaoEnabled));
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}

/** @param {any} error @param {string} fallback */
const messageOf = (error, fallback) => String(error?.message || "") || fallback;

/**
 * 공유 버튼 묶음: 이미지 저장 · 카카오톡(키가 있을 때) · 공유(기기 공유창이 있을 때) · 링크 복사.
 * @param {{ spec: ShareSpec, compact?: boolean, class?: string }} props
 */
export function ShareActions({ spec, compact = false, class: className = "" }) {
  const kakao = useKakaoEnabled();
  const [busy, setBusy] = useState(/** @type {string} */ (""));
  const native = canWebShare();

  /** @param {string} key @param {() => Promise<void>} job */
  const run = async (key, job) => {
    if (busy) return;
    setBusy(key);
    try {
      await job();
    } finally {
      setBusy("");
    }
  };

  const copyLink = async () => {
    const url = await sharePageUrl(spec.path);
    toast((await copyText(url)) ? "링크를 복사했어요" : url, "success");
  };

  const onSave = () => {
    // 모바일은 누른 순간 창을 잡아 둬야 막히지 않는다(await 전에).
    const popup = reserveDownloadWindow();
    run("save", async () => {
      try {
        const blob = await spec.getBlob();
        const mode = await saveImage({ blob, fileName: spec.fileName, meta: spec.meta, popup });
        toast(mode === "open" ? "새 창의 이미지를 길게 눌러 저장하세요" : "이미지를 저장했어요", "success");
      } catch (error) {
        if (popup && !popup.closed) popup.close();
        toast(messageOf(error, "이미지를 저장하지 못했어요."), "error");
      }
    });
  };

  const onKakao = () =>
    run("kakao", async () => {
      try {
        const [blob, pageUrl] = await Promise.all([spec.getBlob(), sharePageUrl(spec.path)]);
        await shareKakao({ blob, fileName: spec.fileName, meta: spec.meta, title: spec.title, description: spec.description, pageUrl, buttonTitle: spec.buttonTitle });
      } catch (error) {
        toast(messageOf(error, "카카오톡 공유를 열지 못했어요."), "error");
      }
    });

  const onNative = () =>
    run("native", async () => {
      try {
        const [blob, url] = await Promise.all([spec.getBlob(), sharePageUrl(spec.path)]);
        await webShare({ blob, fileName: spec.fileName, title: spec.title, text: spec.description, url });
      } catch {
        // 공유창이 막히면(사용자 동작 만료 등) 링크라도 복사한다.
        await copyLink();
      }
    });

  const onCopy = () => run("copy", copyLink);

  /** @type {Array<{ key: string, label: string, short: string, icon: string, onClick: () => void, tone?: string }>} */
  const actions = [
    ...(kakao ? [{ key: "kakao", label: "카카오톡으로 보내기", short: "카톡", icon: "kakao", onClick: onKakao, tone: "kakao" }] : []),
    { key: "save", label: "이미지 저장", short: "저장", icon: "download", onClick: onSave, tone: "primary" },
    ...(native && !compact ? [{ key: "native", label: "다른 앱으로 공유", short: "공유", icon: "share", onClick: onNative }] : []),
    { key: "copy", label: "링크 복사", short: "링크", icon: "link", onClick: onCopy }
  ];

  return (
    <div class={`share-actions${compact ? " share-actions--compact" : ""}${kakao ? " has-kakao" : ""} ${className}`} role="group" aria-label="공유">
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          class={`share-btn share-btn--${action.tone || "plain"}${busy === action.key ? " is-busy" : ""}`}
          aria-label={compact ? action.label : undefined}
          title={compact ? action.label : undefined}
          aria-busy={busy === action.key ? "true" : undefined}
          disabled={Boolean(busy) && busy !== action.key}
          onClick={action.onClick}
        >
          <span class="share-btn__icon">
            {busy === action.key ? (
              <span class="share-btn__spin" aria-hidden="true" />
            ) : action.icon === "kakao" ? (
              <img class="share-btn__kakao" src="/assets/icon-kakaotalk.png" alt="" width={24} height={24} />
            ) : (
              <Icon name={action.icon} size={compact ? 16 : 20} />
            )}
          </span>
          <span class="share-btn__label">{compact ? action.short : action.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * 프로필 카드 시트 내용: 열면 카드를 찍어 미리보기로 보여주고, 버튼은 그 이미지를 그대로 쓴다.
 * @param {{ profile: any, world: string }} props
 */
function ProfileSharePanel({ profile, world }) {
  const [preview, setPreview] = useState(/** @type {{ status: "loading" } | { status: "ready", url: string } | { status: "error" }} */ ({ status: "loading" }));
  const blobRef = useRef(/** @type {Promise<Blob> | null} */ (null));
  const name = profile.name || "";

  const getBlob = () => {
    if (!blobRef.current) {
      blobRef.current = captureCard(<ProfileShareCard profile={profile} world={world} />);
      blobRef.current.catch(() => {
        blobRef.current = null;
      });
    }
    return blobRef.current;
  };

  useEffect(() => {
    let alive = true;
    /** @type {string} */
    let objectUrl = "";
    getBlob().then(
      (blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (alive) setPreview({ status: "ready", url: objectUrl });
      },
      () => alive && setPreview({ status: "error" })
    );
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  /** @type {ShareSpec} */
  const spec = {
    getBlob,
    fileName: shareFileName(`${world}-${name}`, "profile"),
    meta: { itemName: name, worldName: world, characterName: name },
    path: urls.character(world, name),
    title: `${world} ${name}`,
    description: [world, profile.jobName || profile.className, profile.level ? `Lv.${profile.level}` : ""].filter(Boolean).join(" · "),
    buttonTitle: "캐릭터 구경하기"
  };

  return (
    <div class="share-panel">
      <div class="share-preview">
        {preview.status === "ready" ? (
          <img class="share-preview__img" src={preview.url} alt={`${name} 캐릭터 카드`} />
        ) : preview.status === "error" ? (
          <div class="share-preview__live">
            <ProfileShareCard profile={profile} world={world} />
          </div>
        ) : (
          <Skeleton height={320} radius={20} />
        )}
      </div>
      <ShareActions spec={spec} />
    </div>
  );
}

/**
 * 프로필 머리의 "공유" 버튼 + 카드 시트.
 * @param {{ data: any, world: string }} props
 */
export function ProfileShareButton({ data, world }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" class="btn btn--primary btn--sm share-open" onClick={() => setOpen(true)}>
        <Icon name="share" size={18} />
        공유
      </button>
      <Sheet open={open} title="캐릭터 카드" class="share-sheet" onClose={() => setOpen(false)}>
        {open ? <ProfileSharePanel profile={{ ...data.profile, name: data.profile?.name || data.query?.characterName || "" }} world={world} /> : null}
      </Sheet>
    </>
  );
}

/**
 * 장비 공유: 잠재 확률 문구(계산되면) + 문구 넣기 토글 + 공유 버튼. 툴팁에서는 아이콘만.
 * 시트에서는 [자랑 문구] → children(장비 상세) → [아래에 붙는 공유 버튼 줄] 순서로 그린다.
 * @param {{ item: any, profile: any, world: string, compact?: boolean, children?: any }} props
 */
export function ItemShare({ item, profile, world, compact = false, children }) {
  const [caption, setCaption] = useState(/** @type {string | null} */ (null));
  const [withCaption, setWithCaption] = useShareCaption();
  const cache = useRef(/** @type {Map<string, Promise<Blob>>} */ (new Map()));
  const name = profile?.name || "";

  useEffect(() => {
    let alive = true;
    setCaption(null);
    topPercentCaption(item, profile).then((text) => alive && setCaption(text));
    return () => {
      alive = false;
    };
  }, [item]);

  const used = withCaption && caption ? caption : "";
  const spec = useMemo(
    () =>
      /** @type {ShareSpec} */ ({
        getBlob: async () => {
          // 문구가 계산 중이면 기다렸다가 넣는다.
          const text = withCaption ? caption ?? (await topPercentCaption(item, profile)) : "";
          let pending = cache.current.get(text);
          if (!pending) {
            pending = captureCard(<ItemShareCard item={item} caption={text} profile={profile} world={world} />);
            pending.catch(() => cache.current.delete(text));
            cache.current.set(text, pending);
          }
          return pending;
        },
        fileName: shareFileName(item.itemName || "item", "item"),
        meta: { itemName: item.itemName || "", worldName: world, characterName: name },
        path: urls.character(world, name),
        title: item.itemName || "메이플M 아이템",
        description: used || `${world} ${name}의 ${item.itemName || "아이템"}`,
        buttonTitle: "아이템 구경하기"
      }),
    [item, caption, withCaption, used]
  );

  if (compact) return <ShareActions spec={spec} compact class="eq-tip__share" />;

  return (
    <div class="item-share">
      {caption ? (
        <div class="item-share__brag">
          <p class="item-share__caption">{caption}</p>
          <label class="item-share__toggle">
            <input type="checkbox" checked={withCaption} onChange={(event) => setWithCaption(/** @type {HTMLInputElement} */ (event.currentTarget).checked)} />
            <span>이미지에 문구 넣기</span>
          </label>
        </div>
      ) : null}
      {children}
      {/* 시트 아래에 붙어 있는 공유 줄: 긴 장비 정보를 내리지 않아도 바로 보인다 */}
      <section class="item-share__bar" aria-label="장비 공유">
        <ShareActions spec={spec} />
      </section>
    </div>
  );
}
