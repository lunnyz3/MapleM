from __future__ import annotations

from google import genai
from google.genai.types import HttpOptions

from .config import Settings


class VertexGeminiClient:
    def __init__(self, settings: Settings):
        self._settings = settings
        client_kwargs = {"vertexai": True, "http_options": HttpOptions(api_version="v1")}

        # Vertex API key mode and project/location mode are mutually exclusive.
        if settings.vertex_api_key:
            client_kwargs["api_key"] = settings.vertex_api_key
        else:
            if settings.google_cloud_project:
                client_kwargs["project"] = settings.google_cloud_project
            if settings.google_cloud_location:
                client_kwargs["location"] = settings.google_cloud_location

        self._client = genai.Client(**client_kwargs)

    @staticmethod
    def _is_resource_exhausted(error: Exception) -> bool:
        text = str(error or "").upper()
        return (
            "RESOURCE_EXHAUSTED" in text
            or " 429 " in text
            or "CODE': 429" in text
            or 'CODE": 429' in text
        )

    def generate(self, prompt: str) -> str:
        try:
            response = self._client.models.generate_content(
                model=self._settings.gemini_model,
                contents=prompt,
                config={
                    "temperature": 0.2,
                    "max_output_tokens": 4096,
                },
            )
        except Exception as error:
            if self._is_resource_exhausted(error):
                return "현재 AI 사용량이 높아 잠시 후 다시 시도해 주세요."
            raise

        text = str(getattr(response, "text", "") or "").strip()
        if text:
            return text

        candidates = getattr(response, "candidates", None) or []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            if content is None:
                continue
            parts = getattr(content, "parts", None) or []
            collected = [str(getattr(part, "text", "") or "").strip() for part in parts]
            merged = "\n".join([segment for segment in collected if segment])
            if merged:
                return merged

        return "현재 답변을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요."
