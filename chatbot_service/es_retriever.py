from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from elasticsearch import Elasticsearch

from .config import Settings
from .schemas import RetrievedDocument


@dataclass
class _RankedHit:
    doc_id: str
    title: str
    content: str
    source: str


class ElasticHybridRetriever:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._client: Elasticsearch | None = None

        if settings.es_url:
            kwargs: dict[str, Any] = {
                "hosts": [settings.es_url],
                "request_timeout": 10,
            }
            if settings.es_api_key:
                kwargs["api_key"] = settings.es_api_key
            elif settings.es_username and settings.es_password:
                kwargs["basic_auth"] = (settings.es_username, settings.es_password)

            self._client = Elasticsearch(**kwargs)

    def ping(self) -> bool:
        if self._client is None:
            return False
        return bool(self._client.ping())

    def retrieve(self, query: str, limit: int = 6) -> list[RetrievedDocument]:
        if not query.strip():
            return []
        if self._client is None:
            return []

        try:
            bm25_hits = self._search_bm25(query)
            elser_hits = self._search_elser(query)
        except Exception:
            return []
        return self._rrf_merge(bm25_hits, elser_hits, limit=limit)

    def _search_bm25(self, query: str) -> list[_RankedHit]:
        res = self._client.search(
            index=self._settings.es_index_alias,
            size=self._settings.es_bm25_size,
            query={
                "multi_match": {
                    "query": query,
                    "fields": ["title^2", self._settings.es_text_field],
                    "type": "best_fields",
                }
            },
            source=["title", self._settings.es_text_field, "url", "source"],
        )
        return self._normalize_hits(res, source="bm25")

    def _search_elser(self, query: str) -> list[_RankedHit]:
        res = self._client.search(
            index=self._settings.es_index_alias,
            size=self._settings.es_elser_size,
            query={
                "text_expansion": {
                    self._settings.es_sparse_field: {
                        "model_id": self._settings.es_elser_model_id,
                        "model_text": query,
                    }
                }
            },
            source=["title", self._settings.es_text_field, "url", "source"],
        )
        return self._normalize_hits(res, source="elser")

    def _normalize_hits(self, response: dict[str, Any], source: str) -> list[_RankedHit]:
        hits = ((response or {}).get("hits") or {}).get("hits") or []
        normalized: list[_RankedHit] = []
        for hit in hits:
            if not isinstance(hit, dict):
                continue
            src = hit.get("_source") or {}
            if not isinstance(src, dict):
                src = {}
            doc_id = str(hit.get("_id") or "").strip()
            title = str(src.get("title") or "").strip()
            content = str(src.get(self._settings.es_text_field) or "").strip()
            if not doc_id:
                continue
            normalized.append(
                _RankedHit(
                    doc_id=doc_id,
                    title=title,
                    content=content,
                    source=source,
                )
            )
        return normalized

    def _rrf_merge(self, left: list[_RankedHit], right: list[_RankedHit], limit: int) -> list[RetrievedDocument]:
        rrf_scores: dict[str, float] = {}
        docs: dict[str, _RankedHit] = {}

        def add_hits(hits: list[_RankedHit]) -> None:
            for idx, hit in enumerate(hits, start=1):
                docs.setdefault(hit.doc_id, hit)
                rrf_scores[hit.doc_id] = rrf_scores.get(hit.doc_id, 0.0) + 1.0 / (self._settings.es_rrf_k + idx)

        add_hits(left)
        add_hits(right)

        ranked_ids = sorted(rrf_scores.keys(), key=lambda doc_id: rrf_scores[doc_id], reverse=True)
        output: list[RetrievedDocument] = []
        for doc_id in ranked_ids[: max(1, limit)]:
            hit = docs[doc_id]
            output.append(
                RetrievedDocument(
                    doc_id=hit.doc_id,
                    title=hit.title,
                    content=hit.content,
                    source=hit.source,
                    score=float(rrf_scores[doc_id]),
                )
            )
        return output
