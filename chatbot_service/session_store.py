from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from redis import Redis


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(value: datetime) -> str:
    clean = value.astimezone(timezone.utc).replace(microsecond=0)
    return clean.isoformat().replace("+00:00", "Z")


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


class ChatSessionStore:
    def __init__(self, redis_url: str):
        self._client = Redis.from_url(redis_url, decode_responses=True)

    @staticmethod
    def build_key(chat_sid: str, world_name: str, character_name: str) -> str:
        return f"chat:{chat_sid}:{world_name}:{character_name}"

    def ping(self) -> bool:
        return bool(self._client.ping())

    def get_session(self, chat_sid: str, world_name: str, character_name: str) -> dict[str, Any] | None:
        raw = self._client.get(self.build_key(chat_sid, world_name, character_name))
        if not raw:
            return None
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return None
        return data if isinstance(data, dict) else None

    def save_session(
        self,
        chat_sid: str,
        world_name: str,
        character_name: str,
        session_data: dict[str, Any],
        ttl_seconds: int,
    ) -> None:
        payload = json.dumps(session_data, ensure_ascii=False)
        self._client.setex(self.build_key(chat_sid, world_name, character_name), ttl_seconds, payload)

    def delete_session(self, chat_sid: str, world_name: str, character_name: str) -> int:
        return int(self._client.delete(self.build_key(chat_sid, world_name, character_name)))

    @staticmethod
    def is_expired(session_data: dict[str, Any], *, now: datetime | None = None) -> bool:
        now_utc = now or utc_now()
        expires_at = parse_iso(str(session_data.get("expires_at") or ""))
        if expires_at is None:
            return False
        return now_utc >= expires_at

    @staticmethod
    def init_session(
        *,
        chat_sid: str,
        world_name: str,
        character_name: str,
        ttl_seconds: int,
    ) -> dict[str, Any]:
        now = utc_now()
        return {
            "chat_sid": chat_sid,
            "world_name": world_name,
            "character_name": character_name,
            "created_at": to_iso(now),
            "last_user_at": None,
            "expires_at": to_iso(now + timedelta(seconds=ttl_seconds)),
            "thread_id": "",
            "messages": [],
        }

    @staticmethod
    def touch_after_user_message(session_data: dict[str, Any], ttl_seconds: int) -> dict[str, Any]:
        now = utc_now()
        session_data["last_user_at"] = to_iso(now)
        session_data["expires_at"] = to_iso(now + timedelta(seconds=ttl_seconds))
        return session_data
