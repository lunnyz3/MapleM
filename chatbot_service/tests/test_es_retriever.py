from chatbot_service.config import Settings
from chatbot_service.es_retriever import ElasticHybridRetriever, _RankedHit


def build_settings() -> Settings:
    return Settings(
        chatbot_enabled=True,
        require_es_gate=False,
        es_gate_ready=True,
        redis_url="redis://localhost:6379/0",
        session_ttl_seconds=600,
        session_history_limit=40,
        mongo_uri="",
        mongo_db_name="maplem",
        mongo_collection_name="requestlogs",
        es_url="",
        es_username="",
        es_password="",
        es_api_key="",
        es_index_alias="maplem-rag",
        es_text_field="content",
        es_sparse_field="content_embedding",
        es_elser_model_id=".elser_model_2",
        es_bm25_size=10,
        es_elser_size=10,
        es_rrf_k=60,
        gemini_model="gemini-2.5-flash",
        google_cloud_project="test-project",
        google_cloud_location="global",
    )


def test_rrf_merge_prefers_documents_appearing_in_both_lists():
    retriever = ElasticHybridRetriever(build_settings())

    left = [
        _RankedHit(doc_id="A", title="A", content="A", source="bm25"),
        _RankedHit(doc_id="B", title="B", content="B", source="bm25"),
    ]
    right = [
        _RankedHit(doc_id="B", title="B", content="B", source="elser"),
        _RankedHit(doc_id="C", title="C", content="C", source="elser"),
    ]

    merged = retriever._rrf_merge(left, right, limit=3)
    ids = [doc.doc_id for doc in merged]

    assert ids[0] == "B"
    assert set(ids) == {"A", "B", "C"}
