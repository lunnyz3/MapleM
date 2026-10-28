// 장비 마스터리(mastery_info)를 프리셋 장비에 채운다.
//
// 넥슨 API(character/item-equipment)는 지금 착용 중인 목록(item_equipment)의 장비에만 mastery_info 를 주고,
// equipment_preset[].item_equipment 의 같은 장비는 null 로 준다. 마스터리는 프리셋이 아니라 장비에 붙어 있으므로
// 착용 목록에서 같은 장비를 찾아 그대로 옮긴다.
//
// 같은 장비로 보는 조건: 부위 이름 + 아이템 이름 + 스타포스 + 잠재·에디셔널·추가 옵션이 모두 같음.
// 이름만 같은 다른 장비(옵션이 다른 사본)에 잘못 옮기지 않도록 옵션까지 비교한다.
// 조건에 맞는 착용 장비가 여럿이고 mastery_info 가 서로 다르면(같은 반지 두 개 등) 옮기지 않는다.
"use strict";

function fingerprintOptions(list) {
  return (Array.isArray(list) ? list : []).map((option) => [
    String(option?.option_name ?? "").replace(/\s+/g, ""),
    String(option?.option_value ?? "").replace(/\s+/g, ""),
  ]);
}

function itemIdentity(item) {
  return JSON.stringify([
    String(item?.item_equipment_slot_name ?? ""),
    String(item?.item_name ?? ""),
    String(item?.starforce_upgrade ?? ""),
    fingerprintOptions(item?.item_potential_option),
    fingerprintOptions(item?.item_additional_potential_option),
    fingerprintOptions(item?.item_additional_option),
  ]);
}

function hasMasteryInfo(item) {
  return Boolean(item?.mastery_info && typeof item.mastery_info === "object");
}

/**
 * 착용 목록에서 preset 장비와 같은 장비의 mastery_info 를 찾는다. 하나로 정해지지 않으면 null.
 * @param {object} presetItem
 * @param {Map<string, object[]>} wornByIdentity
 */
function findWornMastery(presetItem, wornByIdentity) {
  const candidates = wornByIdentity.get(itemIdentity(presetItem)) || [];
  if (!candidates.length) {
    return null;
  }
  const distinct = new Set(candidates.map((item) => JSON.stringify(item.mastery_info)));
  return distinct.size === 1 ? candidates[0].mastery_info : null;
}

/**
 * item-equipment 응답(data)을 바꾸지 않고, 프리셋 장비에 mastery_info 를 채운 사본을 돌려준다.
 * 채울 것이 없으면 받은 객체를 그대로 돌려준다.
 * @param {object} itemData character/item-equipment 응답 data
 */
function fillPresetMasteryInfo(itemData) {
  const worn = Array.isArray(itemData?.item_equipment) ? itemData.item_equipment : [];
  const presets = Array.isArray(itemData?.equipment_preset) ? itemData.equipment_preset : [];
  if (!worn.length || !presets.length) {
    return itemData;
  }

  /** @type {Map<string, object[]>} */
  const wornByIdentity = new Map();
  for (const item of worn) {
    if (!hasMasteryInfo(item)) continue;
    const key = itemIdentity(item);
    if (!wornByIdentity.has(key)) wornByIdentity.set(key, []);
    wornByIdentity.get(key).push(item);
  }
  if (!wornByIdentity.size) {
    return itemData;
  }

  let changed = false;
  const nextPresets = presets.map((preset) => {
    const list = Array.isArray(preset?.item_equipment) ? preset.item_equipment : null;
    if (!list) return preset;
    let presetChanged = false;
    const nextList = list.map((item) => {
      if (hasMasteryInfo(item)) return item;
      const mastery = findWornMastery(item, wornByIdentity);
      if (!mastery) return item;
      presetChanged = true;
      return { ...item, mastery_info: { ...mastery } };
    });
    if (!presetChanged) return preset;
    changed = true;
    return { ...preset, item_equipment: nextList };
  });
  return changed ? { ...itemData, equipment_preset: nextPresets } : itemData;
}

module.exports = { fillPresetMasteryInfo, itemIdentity };
