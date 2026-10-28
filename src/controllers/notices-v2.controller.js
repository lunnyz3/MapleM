// v2 notices: the latest Nexon notices, patch notes and events in one response.
//   GET /api/v2/notices → { ok, notice: [], patch: [], event: [] } (each { title, url, date }, newest first)
const { env } = require("../config/env");
const { getNoticeList } = require("../services/maplestorym.service");

const LIST_SIZE = 6;
const KINDS = [
  ["notice", "notice", "notice"],
  ["patch", "notice-patch", "patch_notice"],
  ["event", "notice-event", "event_notice"]
];

function pickRows(data, field) {
  const rows = Array.isArray(data?.[field]) ? data[field] : [];
  return rows
    .map((row) => ({ title: String(row?.title || "").trim(), url: String(row?.url || ""), date: String(row?.date || "") }))
    .filter((row) => row.title && /^https:\/\//.test(row.url))
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, LIST_SIZE);
}

function createNoticesHandler({ fetchList = getNoticeList, hasApiKey = () => Boolean(env.nexonApiKey) } = {}) {
  return async function getNotices(req, res) {
    if (!hasApiKey()) {
      return res.status(500).json({ ok: false, message: "NEXON_OPEN_API_KEY is not configured" });
    }
    const results = await Promise.allSettled(KINDS.map(([, path]) => fetchList(path)));
    const payload = { ok: true };
    KINDS.forEach(([key, , field], index) => {
      const result = results[index];
      payload[key] = result.status === "fulfilled" ? pickRows(result.value?.data, field) : [];
    });
    if (results.every((result) => result.status === "rejected")) {
      return res.status(502).json({ ok: false, message: "공지를 불러오지 못했습니다." });
    }
    res.set("Cache-Control", "public, max-age=300");
    return res.json(payload);
  };
}

module.exports = { createNoticesHandler, getNotices: createNoticesHandler() };
