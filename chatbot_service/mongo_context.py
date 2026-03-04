from __future__ import annotations

from typing import Any

from pymongo import DESCENDING, MongoClient


def _as_text(value: Any, fallback: str = "-") -> str:
    text = str(value or "").strip()
    return text if text else fallback


def _first_non_empty(*values: Any, fallback: str = "-") -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return fallback


def _to_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


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

    def get_latest_context(self, world_name: str, character_name: str) -> str:
        collection = self._get_collection()
        if collection is None:
            return ""

        doc = collection.find_one(
            {
                "worldName": world_name,
                "characterName": character_name,
                "success": True,
                "responseBody.mode": "page-data",
            },
            sort=[("createdAt", DESCENDING)],
            projection={
                "responseBody.details": 1,
                "responseBody.ocid": 1,
                "createdAt": 1,
                "_id": 0,
            },
        )

        if not isinstance(doc, dict):
            return ""

        details = ((doc.get("responseBody") or {}).get("details") or {})
        if not isinstance(details, dict):
            return ""

        basic = ((details.get("basic") or {}).get("data") or {})
        stat = ((details.get("stat") or {}).get("data") or {})
        item_data = ((details.get("itemEquipment") or {}).get("data") or {})
        items = _to_list(item_data.get("item_equipment"))
        union_data = ((details.get("union") or {}).get("data") or {})
        guild_basic_data = ((details.get("guildBasic") or {}).get("data") or {})

        stat_rows = _to_list(stat.get("final_stat"))
        major_stats: list[str] = []
        for row in stat_rows[:6]:
            if not isinstance(row, dict):
                continue
            name = _as_text(row.get("stat_name"), "")
            value = _as_text(row.get("stat_value"), "")
            if name and value:
                major_stats.append(f"{name}: {value}")

        equipment_names: list[str] = []
        for item in items[:12]:
            if not isinstance(item, dict):
                continue
            item_name = _as_text(item.get("item_name"), "")
            slot_name = _as_text(item.get("item_equipment_slot"), "")
            if item_name:
                if slot_name:
                    equipment_names.append(f"{slot_name}={item_name}")
                else:
                    equipment_names.append(item_name)

        summary_lines = [
            f"캐릭터명: {_first_non_empty(basic.get('character_name'), character_name)}",
            f"월드: {world_name}",
            f"직업: {_first_non_empty(basic.get('character_job_name'), basic.get('character_class'))}",
            f"레벨: {_first_non_empty(basic.get('character_level'), stat.get('character_level'))}",
            f"경험치 비율: {_first_non_empty(basic.get('character_exp_rate'), stat.get('character_exp_rate'))}",
            f"길드: {_first_non_empty(guild_basic_data.get('guild_name'), basic.get('guild_name'))}",
            f"유니온 레벨: {_as_text(union_data.get('union_level'))}",
        ]

        if major_stats:
            summary_lines.append("주요 스탯: " + " | ".join(major_stats))
        if equipment_names:
            summary_lines.append("핵심 장비: " + " | ".join(equipment_names))

        return "\n".join(summary_lines)
