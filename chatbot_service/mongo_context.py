from __future__ import annotations

import json
from typing import Any

from pymongo import DESCENDING, MongoClient


def _stringify_scalar(value: Any) -> str:
    if value is None:
        return "-"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value).strip()
    return text if text else "-"


def _to_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _to_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _pick_first(*values: Any, fallback: str = "-") -> str:
    for value in values:
        text = _stringify_scalar(value)
        if text != "-":
            return text
    return fallback


def _build_compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


_URL_REMOVED = object()


def _is_equipment_image_field(field_name: str) -> bool:
    name = str(field_name or "").strip().lower()
    if not name:
        return False
    if "icon" in name:
        return True
    if "image" in name and "url" in name:
        return True
    if name in {"item_icon", "icon_url", "image_url"}:
        return True
    return False


def _drop_equipment_image_urls(value: Any) -> Any:
    if isinstance(value, dict):
        result: dict[str, Any] = {}
        for key, item in value.items():
            if _is_equipment_image_field(str(key)):
                continue
            result[str(key)] = _drop_equipment_image_urls(item)
        return result

    if isinstance(value, list):
        return [_drop_equipment_image_urls(item) for item in value]

    return value


def _drop_all_url_fields(value: Any) -> Any:
    if isinstance(value, dict):
        result: dict[str, Any] = {}
        for key, item in value.items():
            key_text = str(key or "").strip().lower()
            if not key_text:
                continue
            if "url" in key_text or key_text in {"endpoint", "icon", "skill_icon", "item_icon"}:
                continue
            sanitized = _drop_all_url_fields(item)
            if sanitized is _URL_REMOVED:
                continue
            result[str(key)] = sanitized
        return result

    if isinstance(value, list):
        rows: list[Any] = []
        for item in value:
            sanitized = _drop_all_url_fields(item)
            if sanitized is _URL_REMOVED:
                continue
            rows.append(sanitized)
        return rows

    if isinstance(value, str):
        text = value.strip()
        lower = text.lower()
        if lower.startswith("http://") or lower.startswith("https://"):
            return _URL_REMOVED
        return value

    return value


class MongoCharacterContextProvider:
    def __init__(self, mongo_uri: str, db_name: str, collection_name: str):
        self._mongo_uri = str(mongo_uri or "").strip()
        self._db_name = str(db_name or "").strip()
        self._collection_name = str(collection_name or "").strip()
        self._client: MongoClient | None = None

    def _get_collection(self):
        if not self._mongo_uri:
            return None
        if self._client is None:
            self._client = MongoClient(self._mongo_uri, serverSelectionTimeoutMS=3000)
        return self._client[self._db_name][self._collection_name]

    def _find_latest_page_data_doc(self, world_name: str, character_name: str) -> dict[str, Any] | None:
        collection = self._get_collection()
        if collection is None:
            return None

        doc = collection.find_one(
            {
                "worldName": world_name,
                "characterName": character_name,
                "success": True,
                "responseBody.mode": "page-data",
            },
            sort=[("createdAt", DESCENDING)],
            projection={
                "responseBody": 1,
                "createdAt": 1,
                "_id": 0,
            },
        )
        return doc if isinstance(doc, dict) else None

    def _build_basic_context(
        self,
        *,
        world_name: str,
        character_name: str,
        created_at: Any,
        response_body: dict[str, Any],
        details: dict[str, Any],
    ) -> str:
        basic_data = _to_dict(_to_dict(details.get("basic")).get("data"))
        stat_data = _to_dict(_to_dict(details.get("stat")).get("data"))
        guild_data = _to_dict(_to_dict(details.get("guildBasic")).get("data"))
        union_data = _to_dict(_to_dict(details.get("union")).get("data"))
        equipment_section = {"itemEquipment": details.get("itemEquipment")}
        equipment_without_images = _drop_all_url_fields(_drop_equipment_image_urls(equipment_section))
        hexa_skill_section = {"hexamatrixSkill": details.get("hexamatrixSkill")}
        hexa_stat_section = {"hexamatrixStat": details.get("hexamatrixStat")}
        hexa_skill_section = _drop_all_url_fields(hexa_skill_section)
        hexa_stat_section = _drop_all_url_fields(hexa_stat_section)
        exp_amount = _pick_first(
            basic_data.get("character_exp"),
            stat_data.get("character_exp"),
            fallback="-",
        )

        lines = [
            f"character_name: {_pick_first(basic_data.get('character_name'), character_name)}",
            f"world_name: {world_name}",
            f"ocid: {_pick_first(response_body.get('ocid'))}",
            f"class: {_pick_first(basic_data.get('character_job_name'), basic_data.get('character_class'))}",
            f"level: {_pick_first(basic_data.get('character_level'), stat_data.get('character_level'))}",
            f"exp_rate: {_pick_first(basic_data.get('character_exp_rate'), stat_data.get('character_exp_rate'))}",
            f"exp_amount: {exp_amount}",
            f"guild: {_pick_first(guild_data.get('guild_name'), basic_data.get('guild_name'))}",
            f"union_level: {_pick_first(union_data.get('union_level'))}",
            f"created_at: {_stringify_scalar(created_at)}",
            "equipment_context_json:",
            _build_compact_json(equipment_without_images),
            "hexamatrix_skill_json:",
            _build_compact_json(hexa_skill_section),
            "hexamatrix_stat_json:",
            _build_compact_json(hexa_stat_section),
        ]
        return "\n".join(lines)

    def get_latest_context_payload(self, world_name: str, character_name: str) -> dict[str, Any]:
        doc = self._find_latest_page_data_doc(world_name, character_name)
        if not doc:
            return {"summary": "", "sections": {}, "has_data": False}

        response_body = _to_dict(doc.get("responseBody"))
        details = _to_dict(response_body.get("details"))
        if not details:
            return {"summary": "", "sections": {}, "has_data": False}

        summary = self._build_basic_context(
            world_name=world_name,
            character_name=character_name,
            created_at=doc.get("createdAt"),
            response_body=response_body,
            details=details,
        )
        # Temporary mode: run chatbot with basic context only.
        return {"summary": summary, "sections": {}, "has_data": True}

    def get_latest_context(self, world_name: str, character_name: str) -> str:
        payload = self.get_latest_context_payload(world_name, character_name)
        summary = str(payload.get("summary") or "").strip()
        sections = payload.get("sections") if isinstance(payload.get("sections"), dict) else {}
        all_json = str(sections.get("all") or "").strip()
        if summary and all_json:
            return "\n".join([summary, "character_details_json_all_compact:", all_json])
        return summary or all_json
