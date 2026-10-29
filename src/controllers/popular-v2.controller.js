// v2 popular searches: characters opened most on the site today and yesterday (KST).
//   GET /api/v2/popular → { ok, items: [{ worldName, characterName, characterClass, count }] }
const { popularSearches } = require("../services/popular-search.service");

async function getPopular(req, res) {
  try {
    const items = await popularSearches({ limit: 10 });
    res.set("Cache-Control", "public, max-age=60");
    return res.json({ ok: true, items });
  } catch (error) {
    console.error("[popular-search] list failed:", error?.message || error);
    return res.status(500).json({ ok: false, message: "인기 검색을 불러오지 못했습니다." });
  }
}

module.exports = { getPopular };
