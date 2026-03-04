from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .config import Settings, load_settings
from .es_retriever import ElasticHybridRetriever
from .llm_client import VertexGeminiClient
from .mongo_context import MongoCharacterContextProvider
from .schemas import (
    ChatMessageItem,
    ChatMessageRequest,
    ChatMessageResponse,
    ChatResetRequest,
    ChatResetResponse,
    ChatSessionInfo,
    ChatStatusRequest,
    ChatStatusResponse,
)
from .session_store import ChatSessionStore, to_iso, utc_now
from .workflow import CharacterChatWorkflow


logger = logging.getLogger("maplem-chatbot")
logging.basicConfig(level=logging.INFO)

CHATBOT_DISABLED_CODE = "CHATBOT_DISABLED"
ES_GATE_NOT_READY_CODE = "ES_GATE_NOT_READY"
SESSION_EXPIRED_CODE = "SESSION_EXPIRED"


class ServiceContainer:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._session_store: ChatSessionStore | None = None
        self._mongo_provider: MongoCharacterContextProvider | None = None
        self._retriever: ElasticHybridRetriever | None = None
        self._llm: VertexGeminiClient | None = None
        self._workflow: CharacterChatWorkflow | None = None

    @property
    def session_store(self) -> ChatSessionStore:
        if self._session_store is None:
            self._session_store = ChatSessionStore(self.settings.redis_url)
        return self._session_store

    @property
    def mongo_provider(self) -> MongoCharacterContextProvider:
        if self._mongo_provider is None:
            self._mongo_provider = MongoCharacterContextProvider(
                self.settings.mongo_uri,
                self.settings.mongo_db_name,
                self.settings.mongo_collection_name,
            )
        return self._mongo_provider

    @property
    def retriever(self) -> ElasticHybridRetriever:
        if self._retriever is None:
            self._retriever = ElasticHybridRetriever(self.settings)
        return self._retriever

    @property
    def llm(self) -> VertexGeminiClient:
        if self._llm is None:
            self._llm = VertexGeminiClient(self.settings)
        return self._llm

    @property
    def workflow(self) -> CharacterChatWorkflow:
        if self._workflow is None:
            self._workflow = CharacterChatWorkflow(
                mongo_provider=self.mongo_provider,
                retriever=self.retriever,
                llm_client=self.llm,
            )
        return self._workflow


settings = load_settings()
services = ServiceContainer(settings)
app = FastAPI(title="MapleM Chatbot Service", version="0.1.0")


@app.get("/health")
def health() -> dict[str, Any]:
    redis_ok = False
    try:
        redis_ok = services.session_store.ping()
    except Exception:
        redis_ok = False

    es_ok = False
    try:
        es_ok = services.retriever.ping()
    except Exception:
        es_ok = False

    return {
        "ok": True,
        "chatbot_enabled": settings.chatbot_enabled,
        "require_es_gate": settings.require_es_gate,
        "es_gate_ready": settings.es_gate_ready,
        "redis": redis_ok,
        "elasticsearch": es_ok,
    }


def _assert_chatbot_available() -> None:
    if not settings.chatbot_enabled:
        raise HTTPException(
            status_code=503,
            detail={
                "ok": False,
                "status": "unavailable",
                "code": CHATBOT_DISABLED_CODE,
                "message": "Chatbot is disabled. Set CHATBOT_ENABLED=true to enable it.",
            },
        )
    if settings.require_es_gate and not settings.es_gate_ready:
        raise HTTPException(
            status_code=503,
            detail={
                "ok": False,
                "status": "unavailable",
                "code": ES_GATE_NOT_READY_CODE,
                "message": "Elasticsearch gate is not ready. Complete ES bootstrap first.",
            },
        )


def _normalize_session(scope: ChatStatusRequest, session: dict[str, Any] | None, status: str) -> ChatSessionInfo:
    if not isinstance(session, dict):
        return ChatSessionInfo(
            chat_sid=scope.chat_sid,
            world_name=scope.world_name,
            character_name=scope.character_name,
            status=status,
            created_at=None,
            last_user_at=None,
            expires_at=None,
            thread_id=None,
            messages=[],
        )

    raw_messages = session.get("messages") if isinstance(session.get("messages"), list) else []
    messages: list[ChatMessageItem] = []
    for item in raw_messages:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip()
        content = str(item.get("content") or "").strip()
        ts = str(item.get("ts") or "").strip()
        if role not in {"user", "assistant"}:
            continue
        if not content or not ts:
            continue
        messages.append(ChatMessageItem(role=role, content=content, ts=ts))

    return ChatSessionInfo(
        chat_sid=scope.chat_sid,
        world_name=scope.world_name,
        character_name=scope.character_name,
        status=status,
        created_at=str(session.get("created_at") or "") or None,
        last_user_at=str(session.get("last_user_at") or "") or None,
        expires_at=str(session.get("expires_at") or "") or None,
        thread_id=str(session.get("thread_id") or "") or None,
        messages=messages,
    )


def _validate_scope(chat_sid: str, world_name: str, character_name: str) -> ChatStatusRequest:
    try:
        return ChatStatusRequest(
            chat_sid=str(chat_sid or "").strip(),
            world_name=str(world_name or "").strip(),
            character_name=str(character_name or "").strip(),
        )
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail={"ok": False, "message": "Invalid request", "errors": exc.errors()})


@app.get("/v1/chat/session/status", response_model=ChatStatusResponse)
def get_session_status(
    chat_sid: str = Query(default="", min_length=1, max_length=200),
    world_name: str = Query(default="", min_length=1, max_length=100),
    character_name: str = Query(default="", min_length=1, max_length=100),
):
    _assert_chatbot_available()
    scope = _validate_scope(chat_sid, world_name, character_name)
    session = services.session_store.get_session(scope.chat_sid, scope.world_name, scope.character_name)

    if not session:
        return ChatStatusResponse(ok=True, status="idle", session=_normalize_session(scope, None, "idle"))

    if services.session_store.is_expired(session):
        return ChatStatusResponse(ok=True, status="expired", session=_normalize_session(scope, session, "expired"))

    return ChatStatusResponse(ok=True, status="active", session=_normalize_session(scope, session, "active"))


@app.post("/v1/chat/message", response_model=ChatMessageResponse)
def post_message(request: ChatMessageRequest):
    _assert_chatbot_available()
    scope = _validate_scope(request.chat_sid, request.world_name, request.character_name)
    prompt_text = str(request.message or "").strip()
    if not prompt_text:
        raise HTTPException(status_code=400, detail={"ok": False, "message": "message is required"})

    session = services.session_store.get_session(scope.chat_sid, scope.world_name, scope.character_name)
    if not session:
        session = services.session_store.init_session(
            chat_sid=scope.chat_sid,
            world_name=scope.world_name,
            character_name=scope.character_name,
            ttl_seconds=settings.session_ttl_seconds,
        )
        session["thread_id"] = str(uuid4())

    if services.session_store.is_expired(session):
        return JSONResponse(
            status_code=409,
            content=ChatMessageResponse(
                ok=False,
                status="expired",
                code=SESSION_EXPIRED_CODE,
                message="Session expired after 10 minutes of user inactivity.",
                session=_normalize_session(scope, session, "expired"),
            ).model_dump(),
        )

    history = session.get("messages") if isinstance(session.get("messages"), list) else []

    try:
        result = services.workflow.run(
            world_name=scope.world_name,
            character_name=scope.character_name,
            question=prompt_text,
            history=history,
        )
    except Exception as exc:
        logger.exception("Failed to process chat message")
        raise HTTPException(status_code=500, detail={"ok": False, "status": "error", "message": str(exc)})

    user_ts_dt = utc_now()
    assistant_ts_dt = utc_now()

    next_messages = [
        *history,
        {"role": "user", "content": prompt_text, "ts": to_iso(user_ts_dt)},
        {"role": "assistant", "content": str(result.get("answer") or ""), "ts": to_iso(assistant_ts_dt)},
    ]
    history_limit = max(10, settings.session_history_limit)
    session["messages"] = next_messages[-history_limit:]
    session["last_user_at"] = to_iso(user_ts_dt)
    session["expires_at"] = to_iso(user_ts_dt + timedelta(seconds=settings.session_ttl_seconds))

    services.session_store.save_session(
        scope.chat_sid,
        scope.world_name,
        scope.character_name,
        session,
        settings.session_ttl_seconds,
    )

    return ChatMessageResponse(
        ok=True,
        status="active",
        answer=str(result.get("answer") or ""),
        session=_normalize_session(scope, session, "active"),
    )


@app.post("/v1/chat/session/reset", response_model=ChatResetResponse)
def reset_session(request: ChatResetRequest):
    _assert_chatbot_available()
    scope = _validate_scope(request.chat_sid, request.world_name, request.character_name)
    services.session_store.delete_session(scope.chat_sid, scope.world_name, scope.character_name)
    return ChatResetResponse(ok=True, status="reset", session=_normalize_session(scope, None, "reset"))


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        return JSONResponse(status_code=exc.status_code, content=detail)
    return JSONResponse(status_code=exc.status_code, content={"ok": False, "message": str(detail)})
