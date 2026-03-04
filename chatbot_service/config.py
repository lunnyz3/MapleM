from __future__ import annotations

from dataclasses import dataclass
import os


def _to_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _to_int(value: str | None, default: int) -> int:
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return default
    return parsed


@dataclass(frozen=True)
class Settings:
    chatbot_enabled: bool
    require_es_gate: bool
    es_gate_ready: bool
    redis_url: str
    session_ttl_seconds: int
    session_history_limit: int
    mongo_uri: str
    mongo_db_name: str
    mongo_collection_name: str
    es_url: str
    es_username: str
    es_password: str
    es_api_key: str
    es_index_alias: str
    es_text_field: str
    es_sparse_field: str
    es_elser_model_id: str
    es_bm25_size: int
    es_elser_size: int
    es_rrf_k: int
    gemini_model: str
    google_cloud_project: str
    google_cloud_location: str



def load_settings() -> Settings:
    return Settings(
        chatbot_enabled=_to_bool(os.getenv("CHATBOT_ENABLED"), False),
        require_es_gate=_to_bool(os.getenv("CHATBOT_REQUIRE_ES_GATE"), True),
        es_gate_ready=_to_bool(os.getenv("CHATBOT_ES_GATE_READY"), False),
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        session_ttl_seconds=max(60, _to_int(os.getenv("CHATBOT_SESSION_TTL_SECONDS"), 600)),
        session_history_limit=max(10, _to_int(os.getenv("CHATBOT_SESSION_HISTORY_LIMIT"), 40)),
        mongo_uri=os.getenv("MONGODB_URI", ""),
        mongo_db_name=os.getenv("MONGO_DB_NAME", "maplem"),
        mongo_collection_name=os.getenv("MONGO_LOG_COLLECTION", "requestlogs"),
        es_url=os.getenv("ELASTICSEARCH_URL", ""),
        es_username=os.getenv("ELASTICSEARCH_USERNAME", ""),
        es_password=os.getenv("ELASTICSEARCH_PASSWORD", ""),
        es_api_key=os.getenv("ELASTICSEARCH_API_KEY", ""),
        es_index_alias=os.getenv("ELASTICSEARCH_INDEX_ALIAS", "maplem-rag"),
        es_text_field=os.getenv("ELASTICSEARCH_TEXT_FIELD", "content"),
        es_sparse_field=os.getenv("ELASTICSEARCH_SPARSE_FIELD", "content_embedding"),
        es_elser_model_id=os.getenv("ELASTICSEARCH_ELSER_MODEL_ID", ".elser_model_2"),
        es_bm25_size=max(1, _to_int(os.getenv("ELASTICSEARCH_BM25_SIZE"), 10)),
        es_elser_size=max(1, _to_int(os.getenv("ELASTICSEARCH_ELSER_SIZE"), 10)),
        es_rrf_k=max(1, _to_int(os.getenv("ELASTICSEARCH_RRF_K"), 60)),
        gemini_model=os.getenv("VERTEX_GEMINI_MODEL", "gemini-2.5-flash"),
        google_cloud_project=os.getenv("GOOGLE_CLOUD_PROJECT", ""),
        google_cloud_location=os.getenv("GOOGLE_CLOUD_LOCATION", "global"),
    )
