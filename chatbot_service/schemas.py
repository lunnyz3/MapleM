from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChatMessageItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    ts: str


class ChatSessionInfo(BaseModel):
    chat_sid: str
    world_name: str
    character_name: str
    status: Literal["idle", "active", "expired", "reset"]
    created_at: str | None = None
    last_user_at: str | None = None
    expires_at: str | None = None
    thread_id: str | None = None
    messages: list[ChatMessageItem] = Field(default_factory=list)


class ChatStatusResponse(BaseModel):
    ok: bool
    status: Literal["idle", "active", "expired", "unavailable", "error"]
    session: ChatSessionInfo | None = None
    code: str | None = None
    message: str | None = None


class ChatStatusRequest(BaseModel):
    chat_sid: str = Field(min_length=1, max_length=200)
    world_name: str = Field(min_length=1, max_length=100)
    character_name: str = Field(min_length=1, max_length=100)


class ChatMessageRequest(BaseModel):
    chat_sid: str = Field(min_length=1, max_length=200)
    world_name: str = Field(min_length=1, max_length=100)
    character_name: str = Field(min_length=1, max_length=100)
    message: str = Field(min_length=1, max_length=2000)


class ChatMessageResponse(BaseModel):
    ok: bool
    status: Literal["active", "expired", "unavailable", "error"]
    answer: str | None = None
    session: ChatSessionInfo | None = None
    code: str | None = None
    message: str | None = None


class ChatResetRequest(BaseModel):
    chat_sid: str = Field(min_length=1, max_length=200)
    world_name: str = Field(min_length=1, max_length=100)
    character_name: str = Field(min_length=1, max_length=100)


class ChatResetResponse(BaseModel):
    ok: bool
    status: Literal["reset", "unavailable", "error"]
    session: ChatSessionInfo | None = None
    code: str | None = None
    message: str | None = None


class RetrievedDocument(BaseModel):
    doc_id: str
    title: str
    content: str
    source: str
    score: float
