"use strict";

// Best records and growth journal per character (pure). Every lookup or collection gives a
// snapshot; the record keeps the highest value seen for each metric (with when) and one journal
// row per KST day with that day's numbers (combat power: the day's highest) and the gear that
// changed since the previous snapshot.

const JOURNAL_DAYS = 180;
const MAX_CHANGES_PER_DAY = 40;
const BEST_METRICS = ["combatPower", "itemScore", "itemScoreWithoutEmblem", "potential", "additionalPotential", "maxDamage"];
// These depend on the item score formula and restart when SCORE_VERSION changes.
const SCORE_METRICS = new Set(["itemScore", "itemScoreWithoutEmblem"]);
const JOURNAL_METRICS = ["combatPower", "itemScore", "potential", "additionalPotential", "level"];

function kstDate(now) {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function samePiece(a, b) {
  if (!a || !b) return !a && !b;
  return a.name === b.name && a.starforce === b.starforce && Math.abs((a.score || 0) - (b.score || 0)) < 0.05;
}

function piece(entry) {
  return { name: String(entry.name || ""), starforce: Number(entry.starforce) || 0, score: Number(entry.score) || 0 };
}

/**
 * Slots whose item, starforce or score changed: [{ slot, from, to }] (from/to null when the slot
 * was empty). Slot names are unique per preset ("반지 (2번째 슬롯)").
 */
function gearChanges(before, after) {
  const was = new Map((before || []).map((entry) => [entry.slot, piece(entry)]));
  const now = new Map((after || []).map((entry) => [entry.slot, piece(entry)]));
  const changes = [];
  for (const slot of new Set([...was.keys(), ...now.keys()])) {
    const from = was.get(slot) || null;
    const to = now.get(slot) || null;
    if (!samePiece(from, to)) changes.push({ slot, from, to });
  }
  return changes;
}

/** Same-day changes fold together: a slot keeps its first `from` and latest `to`. */
function mergeChanges(earlier, later) {
  const bySlot = new Map(earlier.map((change) => [change.slot, change]));
  later.forEach((change) => {
    const first = bySlot.get(change.slot);
    bySlot.set(change.slot, { slot: change.slot, from: first ? first.from : change.from, to: change.to });
  });
  return [...bySlot.values()].filter((change) => !samePiece(change.from, change.to)).slice(0, MAX_CHANGES_PER_DAY);
}

/**
 * @param {object | null} previous stored record ({ best, journal, gear, scoreVersion }) or null
 * @param {{ scoreVersion: number, combatPower?, itemScore?, itemScoreWithoutEmblem?, potential?,
 *   additionalPotential?, maxDamage?, level?, gear?: Array<{ slot, name, starforce, score }> }} snapshot
 * @returns {{ best: object, journal: object[], gear: object[], scoreVersion: number }}
 */
function mergeRecord(previous, snapshot, now = new Date()) {
  const sameVersion = previous?.scoreVersion === snapshot.scoreVersion;

  const best = {};
  BEST_METRICS.forEach((metric) => {
    const old = previous?.best?.[metric];
    const kept = old && (sameVersion || !SCORE_METRICS.has(metric)) ? old : null;
    const value = positive(snapshot[metric]);
    const next = value !== null && (!kept || value > kept.value) ? { value, at: now } : kept;
    if (next) best[metric] = next;
  });

  const journal = (Array.isArray(previous?.journal) ? previous.journal : []).map((row) => {
    if (sameVersion) return row;
    const { itemScore, changes, ...rest } = row;
    return rest;
  });
  const date = kstDate(now);
  const today = journal.length && journal[journal.length - 1].date === date ? journal.pop() : null;
  const gear = Array.isArray(snapshot.gear) ? snapshot.gear.map((entry) => ({ slot: String(entry.slot), ...piece(entry) })) : [];
  // The first snapshot and a formula change have nothing comparable to diff against.
  const changes = previous?.gear?.length && sameVersion && gear.length ? gearChanges(previous.gear, gear) : [];

  const row = { date };
  JOURNAL_METRICS.forEach((metric) => {
    const value = positive(snapshot[metric]) ?? today?.[metric] ?? null;
    if (value !== null) row[metric] = value;
  });
  // 전투력은 그날 본 값 중 가장 높은 값(사냥 프리셋으로 바꿔 끼워도 그날 최고가 남는다).
  if (positive(today?.combatPower) && positive(row.combatPower)) row.combatPower = Math.max(today.combatPower, row.combatPower);
  const merged = mergeChanges(today?.changes || [], changes);
  if (merged.length) row.changes = merged;
  journal.push(row);

  return {
    best,
    journal: journal.slice(-JOURNAL_DAYS),
    gear: gear.length ? gear : previous?.gear || [],
    scoreVersion: snapshot.scoreVersion
  };
}

module.exports = { mergeRecord, gearChanges, kstDate, BEST_METRICS, JOURNAL_DAYS };
