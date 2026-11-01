"use strict";

// 잠재 수준(장비 갈아타기 손익분기).
//   GET /api/v2/item-levels?family=아케인셰이드&slot=모자&attack=physical
//     → { ok, family, slot, attackType, levels: [{ key, label, score, potential, additionalPotential, potentialGrade, additionalPotentialGrade }] | null,
//         sample, scope: "slot"|"weapons"|"", builtAt }
//     slot: 방어구는 부위 이름(모자·한벌옷 …), 무기는 무기 종류(단검·완드 …). 하루 한 번 다시 센다.
const { potentialLevels } = require("../services/potential-levels.service");
const { FAMILIES } = require("../domain/items/potential-levels");

async function getItemLevels(req, res) {
  const family = String(req.query.family ?? "").trim();
  const slot = String(req.query.slot ?? "")
    .trim()
    .slice(0, 20);
  const attackType = req.query.attack === "magical" ? "magical" : "physical";
  if (!FAMILIES.includes(family) || !slot) {
    return res.status(400).json({ ok: false, message: "family(아케인셰이드|제네시스) and slot are required" });
  }
  try {
    const result = await potentialLevels({ family, slot, attackType });
    res.set("Cache-Control", "public, max-age=3600");
    return res.json({ ok: true, family, slot, attackType, ...result });
  } catch (error) {
    console.error("[item-levels] read failed:", error?.message || error);
    return res.status(503).json({ ok: false, message: "잠재 분포를 불러오지 못했습니다." });
  }
}

module.exports = { getItemLevels };
