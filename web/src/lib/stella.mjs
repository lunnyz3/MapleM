// 스타코러스 별자리판(순수 함수): 별 열기·닫기(먼저 열어야 하는 별 중 하나가 열려 있어야 열린다), 닫으면 이어지지 않는
// 별도 같이 닫는다. 열린 별의 스탯 합을 직접 입력 값으로 바꾼다. 표는 src/game-data/stella.json.

/** @param {any[]} nodes @param {Set<string>} open @param {string} id */
export function canOpen(nodes, open, id) {
  const node = nodes.find((item) => item.id === id);
  if (!node) return false;
  return !node.needs.length || node.needs.some((need) => open.has(need));
}

/** 시작 별에서 열린 별을 따라 이어지는 별만 남긴다. @param {any[]} nodes @param {Set<string>} open */
export function prune(nodes, open) {
  const reachable = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (!open.has(node.id) || reachable.has(node.id)) continue;
      if (!node.needs.length || node.needs.some((need) => reachable.has(need))) {
        reachable.add(node.id);
        changed = true;
      }
    }
  }
  return reachable;
}

/** 열려 있으면 닫고(이어지지 않게 된 별도 닫는다), 열 수 있으면 연다. @returns {Set<string>} */
export function toggle(nodes, open, id) {
  if (open.has(id)) {
    const next = new Set(open);
    next.delete(id);
    return prune(nodes, next);
  }
  return canOpen(nodes, open, id) ? new Set([...open, id]) : open;
}

/** 별 하나의 값(범위 별은 고른 값, 안 골랐으면 가장 작은 값). */
export function nodeValue(node, picks, ranges) {
  if (!node.range) return node.value;
  const choices = ranges[node.stat] || [];
  const picked = Number(picks?.[node.id]);
  return choices.includes(picked) ? picked : choices[0] || 0;
}

/** 열린 별의 스탯별 합과 세리온 비용. @returns {{ totals: Record<string, number>, cost: number }} */
export function boardTotals(nodes, open, picks, ranges) {
  const totals = {};
  let cost = 0;
  for (const node of nodes) {
    if (!open.has(node.id)) continue;
    totals[node.stat] = (totals[node.stat] || 0) + nodeValue(node, picks, ranges);
    cost += node.cost;
  }
  return { totals, cost };
}

/** 스탯 합 → 직접 입력 값({ starcorusDamage: 18, … }). 0인 스탯도 0으로 넣는다(판에서 지운 값을 지우려고). */
export function toManualValues(totals, manualIds) {
  return Object.fromEntries(Object.entries(manualIds).map(([stat, id]) => [id, Math.round((totals[stat] || 0) * 100) / 100]));
}
