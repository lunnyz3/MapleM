from __future__ import annotations

from google import genai
from google.genai.types import HttpOptions

from .config import Settings


class VertexGeminiClient:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = genai.Client(
            vertexai=True,
            project=settings.google_cloud_project,
            location=settings.google_cloud_location,
            http_options=HttpOptions(api_version="v1"),
        )

    def generate(self, prompt: str) -> str:
        response = self._client.models.generate_content(
            model=self._settings.gemini_model,
            contents=prompt,
        )

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
