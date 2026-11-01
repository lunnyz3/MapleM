// 즐겨찾기 알림(웹 푸시): 서비스 워커(/sw.js) 등록, 구독, 따라가는 캐릭터·길드(즐겨찾기) 보내기.
// 화면이 열릴 때마다 즐겨찾기를 다시 보내서 서버 목록이 브라우저 즐겨찾기와 같게 한다.
import { getJson, postJson } from "./api.js";

const EVENTS_KEY = "mmp.push.events";

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** 이벤트 종료 알림을 받을지(이 브라우저에 저장, 기본 켬) */
export function eventsWanted() {
  try {
    return localStorage.getItem(EVENTS_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setEventsWanted(on) {
  try {
    localStorage.setItem(EVENTS_KEY, on ? "1" : "0");
  } catch {
    // 저장 못 해도 이번 구독에는 반영된다
  }
}

/** 즐겨찾기 → { characters, guilds } */
export function followsOf(favorites) {
  const pick = (kind) => favorites.filter((entry) => entry.kind === kind).map(({ world, name }) => ({ world, name }));
  return { characters: pick("character"), guilds: pick("guild") };
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration ? registration.pushManager.getSubscription() : null;
}

function keyBytes(base64url) {
  const padded = (base64url + "===".slice((base64url.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function save(subscription, favorites) {
  const { response, body } = await postJson("/api/v2/push/subscribe", { subscription: subscription.toJSON(), follows: followsOf(favorites), events: eventsWanted() });
  if (!response.ok || !body?.ok) throw new Error(body?.message || "subscribe");
  return body.follows;
}

/** 알림 켜기: 권한 → 서비스 워커 → 구독 → 서버에 저장 → 확인 알림. 거절하면 "denied" 오류 */
export async function enablePush(favorites) {
  if (!pushSupported()) throw new Error("unsupported");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("denied");
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const { response, body } = await getJson("/api/v2/push/key");
  if (!response.ok || !body?.publicKey) throw new Error("unavailable");
  const subscription =
    (await registration.pushManager.getSubscription()) || (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(body.publicKey) }));
  const follows = await save(subscription, favorites);
  postJson("/api/v2/push/test", { endpoint: subscription.endpoint }).catch(() => {});
  return follows;
}

export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await postJson("/api/v2/push/unsubscribe", { endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}

/** 이미 켠 브라우저면 즐겨찾기를 다시 보낸다(켜지 않았으면 아무것도 하지 않는다) */
export async function syncPush(favorites) {
  if (!pushSupported() || Notification.permission !== "granted") return null;
  const subscription = await currentSubscription();
  return subscription ? save(subscription, favorites) : null;
}
