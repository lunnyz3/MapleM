// v2 코디 구경·통계.
//   GET /api/v2/looks/stats?gender=Female|Male         → { ok, total, hair, face, skin: [{ name, count, share }], slots, items: { [slot]: [{ name, count, share, icon }] } }
//   GET /api/v2/looks/wearers?kind=hair|face|skin|item&name=&gender= → { ok, people: [{ world, name, className, gender, hair, face }] } (무작위 24명)
//   GET /api/v2/looks/random?gender=                    → { ok, people } (무작위 24명)
const { lookStats, randomLooks, wearers } = require("../services/looks.service");

function handler(compute, cacheControl) {
  return async (req, res) => {
    try {
      const result = await compute(req);
      res.set("Cache-Control", cacheControl);
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error("[looks] read failed:", error?.message || error);
      return res.status(503).json({ ok: false, message: "코디를 불러오지 못했습니다." });
    }
  };
}

const gender = (req) => String(req.query.gender || "");

const getLookStats = handler((req) => lookStats({ gender: gender(req) }), "public, max-age=600");
const getLookWearers = handler(
  async (req) => ({ people: await wearers({ kind: String(req.query.kind || ""), name: String(req.query.name || ""), gender: gender(req) }) }),
  "public, max-age=300"
);
const getRandomLooks = handler(async (req) => ({ people: await randomLooks({ gender: gender(req) }) }), "no-store");

module.exports = { getLookStats, getLookWearers, getRandomLooks };
