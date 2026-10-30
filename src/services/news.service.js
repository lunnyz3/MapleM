// 오늘의 강화 소식: 날짜별 기록의 장비 변화(src/domain/stats/upgrade-news.js)에 직업과 장비 아이콘을 붙인다.
// 하루치를 훑는 데 몇 초 걸려 10분 보관하고, 지난 값을 주면서 새로 계산한다. 오늘 수집 전(새벽)이라 비어 있으면 어제.
const mongoose = require("mongoose");
const { CharacterRecord } = require("../models/character-record.model");
const { CharacterSpec } = require("../models/character-spec.model");
const { EquipmentItem } = require("../models/equipment-item.model");
const { SCORE_VERSION } = require("../domain/items/score");
const { buildNews, newsLine } = require("../domain/stats/upgrade-news");

const TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 60000;
const PER_TYPE = 60;
const EMPTY_COUNTS = Object.freeze({ star: 0, reached: 0, option: 0, new: 0, characters: 0 });
/** @type {Map<string, { value: any, at: number, pending: Promise<any> | null }>} */
const store = new Map();

const isMongoConnected = () => mongoose.connection.readyState === 1;
const kstDate = (now, daysAgo = 0) => new Date(now.getTime() + 9 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function computeNews(date) {
  const rows = await CharacterRecord.aggregate([
    { $match: { "journal.date": date } },
    { $project: { _id: 0, ocid: 1, worldName: 1, characterName: 1, day: { $filter: { input: "$journal", as: "entry", cond: { $eq: ["$$entry.date", date] } } } } },
    { $unwind: "$day" },
    { $match: { "day.changes.0": { $exists: true } } },
    { $project: { ocid: 1, worldName: 1, characterName: 1, changes: "$day.changes" } }
  ]).option({ maxTimeMS: TIMEOUT_MS, allowDiskUse: true });
  const news = buildNews(rows, PER_TYPE);
  const ocids = [...new Set(news.events.map((event) => event.ocid))];
  const names = [...new Set(news.events.map((event) => event.item))];
  const [specs, items] = await Promise.all([
    CharacterSpec.find({ ocid: { $in: ocids } }, { _id: 0, ocid: 1, characterClass: 1 }).lean().maxTimeMS(TIMEOUT_MS),
    EquipmentItem.find({ ocid: { $in: ocids }, itemName: { $in: names }, scoreVersion: SCORE_VERSION }, { _id: 0, ocid: 1, itemName: 1, "item.item_icon": 1, "item.item_grade": 1 })
      .lean()
      .maxTimeMS(TIMEOUT_MS)
  ]);
  const classOf = new Map(specs.map((spec) => [spec.ocid, spec.characterClass]));
  const iconOf = new Map(items.map((item) => [`${item.ocid}|${item.itemName}`, { icon: item.item?.item_icon || "", grade: item.item?.item_grade || "" }]));
  return {
    date,
    counts: news.counts,
    // ocid·무게는 화면에 보내지 않는다
    events: news.events.map(({ ocid, weight, ...event }) => ({ ...event, className: classOf.get(ocid) || "", ...(iconOf.get(`${ocid}|${event.item}`) || { icon: "", grade: "" }) }))
  };
}

/** 그날 소식(10분 보관, 지난 값을 주며 새로 계산). */
function newsOf(date) {
  const entry = store.get(date) || { value: null, at: 0, pending: null };
  const fresh = entry.value && Date.now() - entry.at < TTL_MS;
  if (!fresh && !entry.pending) {
    entry.pending = computeNews(date).then(
      (value) => {
        store.set(date, { value, at: Date.now(), pending: null });
        // 오늘·어제만 남긴다
        if (store.size > 3) [...store.keys()].sort().slice(0, store.size - 3).forEach((key) => store.delete(key));
        return value;
      },
      (error) => {
        entry.pending = null;
        throw error;
      }
    );
    store.set(date, entry);
    if (entry.value) entry.pending.catch((error) => console.error("[news] refresh failed:", error?.message || error));
  }
  return entry.value ? Promise.resolve(entry.value) : entry.pending;
}

/**
 * GET /api/v2/news(?day=yesterday) → { date, counts, events: [{ type, slot, item, fromItem, fromStar, toStar, gain, reached, world, name, className, icon, grade }] }
 */
async function upgradeNews({ day = "" } = {}) {
  if (!isMongoConnected()) return { date: "", counts: EMPTY_COUNTS, events: [] };
  const now = new Date();
  if (day === "yesterday") return newsOf(kstDate(now, 1));
  const today = await newsOf(kstDate(now));
  return today.events.length ? today : newsOf(kstDate(now, 1));
}

/** 전광판에 끼울 오늘의 큰 소식 셋(이미 계산된 것만, 없으면 뒤에서 계산을 시작하고 빈 목록). */
function headlineNews(count = 3) {
  if (!isMongoConnected()) return [];
  const date = kstDate(new Date());
  const entry = store.get(date);
  newsOf(date).catch(() => {});
  const events = entry?.value?.events || [];
  // 최대 별 달성 둘 + 옵션 대박 하나(모자라면 있는 만큼)
  const picks = [...events.filter((event) => event.type === "star" && event.reached).slice(0, count - 1), ...events.filter((event) => event.type === "option").slice(0, 1)];
  return picks
    .slice(0, count)
    .map((event, index) => ({ id: `news-${date}-${index}`, text: newsLine(event), world: event.world, name: event.name }));
}

module.exports = { upgradeNews, headlineNews };
