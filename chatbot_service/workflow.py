from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from .es_retriever import ElasticHybridRetriever
from .llm_client import VertexGeminiClient
from .mongo_context import MongoCharacterContextProvider
from .schemas import RetrievedDocument


class ChatWorkflowState(TypedDict, total=False):
    world_name: str
    character_name: str
    question: str
    history: list[dict[str, str]]
    mongo_context_summary: str
    mongo_context_sections: dict[str, str]
    mongo_context: str
    retrieved_docs: list[RetrievedDocument]
    prompt: str
    answer: str


class CharacterChatWorkflow:
    SUMMARY_CHAR_LIMIT = 0
    SECTION_CHAR_LIMIT = 0
    SECTION_TOTAL_CHAR_LIMIT = 0
    FULL_SECTION_CHAR_LIMIT = 0

    FULL_CONTEXT_KEYWORDS = (
        "전체json",
        "전체 json",
        "전체 덤프",
        "전체 분석",
        "전부 기준",
        "모든 정보",
        "all json",
        "full json",
    )

    SECTION_KEYWORDS: dict[str, tuple[str, ...]] = {
        "starforce": ("스타포스", "강화", "sf"),
        "potential": ("잠재", "에디", "추옵", "보조무기", "엠블", "옵션"),
        "equipment": ("장비", "세팅", "템", "아이템", "무기", "보조", "엠블"),
        "boss": ("보스", "레이드", "스우", "데미안", "진힐라", "세렌", "검마"),
        "stats": ("스탯", "전투력", "딜", "dps", "공격력", "방무", "보공"),
        "progression": ("육성", "성장", "유니온", "링크", "하이퍼", "헥사", "코어"),
    }

    GREETING_KEYWORDS = ("안녕", "ㅎㅇ", "hello", "hi", "하이", "반가")

    def __init__(
        self,
        *,
        mongo_provider: MongoCharacterContextProvider,
        retriever: ElasticHybridRetriever,
        llm_client: VertexGeminiClient,
    ):
        self._mongo_provider = mongo_provider
        self._retriever = retriever
        self._llm = llm_client
        self._graph = self._build_graph()

    def _build_graph(self):
        graph = StateGraph(ChatWorkflowState)
        graph.add_node("gather_context", self._gather_context)
        graph.add_node("build_prompt", self._build_prompt)
        graph.add_node("generate_answer", self._generate_answer)
        graph.add_edge(START, "gather_context")
        graph.add_edge("gather_context", "build_prompt")
        graph.add_edge("build_prompt", "generate_answer")
        graph.add_edge("generate_answer", END)
        return graph.compile()

    def run(
        self,
        *,
        world_name: str,
        character_name: str,
        question: str,
        history: list[dict[str, str]],
    ) -> dict[str, Any]:
        initial_state: ChatWorkflowState = {
            "world_name": world_name,
            "character_name": character_name,
            "question": question,
            "history": history,
        }
        result = self._graph.invoke(initial_state)
        return {
            "answer": str(result.get("answer") or "").strip(),
            "mongo_context": str(result.get("mongo_context") or ""),
            "retrieved_docs": result.get("retrieved_docs") or [],
        }

    def _gather_context(self, state: ChatWorkflowState) -> ChatWorkflowState:
        question = str(state.get("question") or "")
        world_name = str(state.get("world_name") or "")
        character_name = str(state.get("character_name") or "")

        mongo_payload = self._mongo_provider.get_latest_context_payload(world_name, character_name)
        mongo_summary = str(mongo_payload.get("summary") or "")
        mongo_sections = (
            mongo_payload.get("sections")
            if isinstance(mongo_payload.get("sections"), dict)
            else {}
        )
        es_docs = self._retriever.retrieve(question, limit=6)

        return {
            "mongo_context_summary": mongo_summary,
            "mongo_context_sections": mongo_sections,
            "retrieved_docs": es_docs,
        }

    @staticmethod
    def _normalize_question(question: str) -> str:
        return str(question or "").strip().lower()

    def _is_short_greeting(self, question: str) -> bool:
        normalized = self._normalize_question(question)
        compact = normalized.replace(" ", "")
        if not compact:
            return False
        if len(compact) > 8:
            return False
        return any(keyword in compact for keyword in self.GREETING_KEYWORDS)

    def _detect_requested_sections(self, question: str) -> list[str]:
        normalized = self._normalize_question(question)
        compact = normalized.replace(" ", "")
        if not compact:
            return []

        for keyword in self.FULL_CONTEXT_KEYWORDS:
            if keyword in normalized or keyword.replace(" ", "") in compact:
                return ["all"]

        selected: list[str] = []
        for section_name, keywords in self.SECTION_KEYWORDS.items():
            if any((keyword in normalized or keyword in compact) for keyword in keywords):
                selected.append(section_name)
        return selected

    @staticmethod
    def _trim_text(text: str, limit: int) -> str:
        raw = str(text or "")
        if limit <= 0 or len(raw) <= limit:
            return raw
        return raw[:limit] + "\n...[truncated]"

    def _build_selected_mongo_context(self, question: str, summary: str, sections: dict[str, str]) -> str:
        summary_text = str(summary or "").strip()
        requested_sections = self._detect_requested_sections(question)
        is_greeting = self._is_short_greeting(question)

        blocks: list[str] = []
        if summary_text:
            blocks.append("[summary]\n" + summary_text)

        if is_greeting or not requested_sections:
            return "\n\n".join(blocks).strip()

        for section_name in requested_sections:
            source_text = str(sections.get(section_name) or "").strip()
            if not source_text:
                continue
            blocks.append(f"[section:{section_name}]\n{source_text}")

        return "\n\n".join(blocks).strip()

    def _build_prompt(self, state: ChatWorkflowState) -> ChatWorkflowState:
        question = str(state.get("question") or "").strip()
        history = state.get("history") or []
        mongo_summary = str(state.get("mongo_context_summary") or "").strip()
        mongo_sections = (
            state.get("mongo_context_sections")
            if isinstance(state.get("mongo_context_sections"), dict)
            else {}
        )
        mongo_context = self._build_selected_mongo_context(question, mongo_summary, mongo_sections)
        docs = state.get("retrieved_docs") or []

        history_lines: list[str] = []
        for item in history[-6:]:
            role = str(item.get("role") or "").strip()
            content = str(item.get("content") or "").strip()
            if not role or not content:
                continue
            if role == "assistant":
                role = "model"
            if role not in {"user", "model"}:
                continue
            history_lines.append(f"{role}: {content}")

        doc_lines: list[str] = []
        for idx, doc in enumerate(docs, start=1):
            title = str(doc.title or "").strip() or "(제목 없음)"
            content = str(doc.content or "").strip()
            if not content:
                continue
            snippet = content[:500]
            doc_lines.append(f"[DOC {idx}] {title}\n{snippet}")

        system_block = "\n".join(
            [
                "당신은 '메이플M 개인 캐릭터 상담 챗봇'입니다.",
                "",
                "[핵심 목표]",
                "- 사용자의 질문에 대해, 제공된 '캐릭터 컨텍스트'와 '검색 컨텍스트'를 근거로",
                "  캐릭터 성장/장비/강화/사냥/보스/스펙 관련 조언을 제공합니다.",
                "",
                "[우선순위 규칙]",
                "1) 캐릭터 컨텍스트(Mongo)가 있으면 가장 신뢰하고 최우선으로 사용합니다.",
                "2) 검색 컨텍스트(문서)는 보조 근거로 사용하되, 캐릭터 컨텍스트와 충돌하면 캐릭터 컨텍스트를 우선합니다.",
                "3) 둘 다 불충분하면 추측하지 말고 '부족한 정보'를 명시한 뒤 확인 질문을 합니다."
                "4) 질문자가 '권진욱'이라고 채팅을 치면 그 즉시 '연철아 부디 너만 알고 너만 알아줬으면 좋겠다'를 출력하세요",
                "",
                "[안전/정책]",
                "- 사실을 만들어내지 마세요(추측/환각 금지).",
                "- 내부 시스템명, 문서 id, 인덱스명, 경로, API 키/토큰 등 비공개 정보를 답변에 절대 노출하지 마세요.",
                "- 사용자 질문이 캐릭터와 무관하면: 메이플M 일반 정보로 짧게 답하거나, 캐릭터 정보가 필요함을 안내하세요.",
                "- 불법/위험/부정행위(핵, 매크로, 계정 탈취, 취약점 악용 등) 요청은 거절하고 안전한 대안을 제시하세요.",
                "- 결제/현금거래/확률형 아이템 관련 조언은 '일반적인 정보' 수준으로만 제공하고 확정적 이득을 보장하지 마세요.",
                "",
                "[답변 스타일]",
                "- 한국어로 답하되, 사용자가 상세/전체 출력을 요청하면 요약하지 말고 충분히 자세히 작성하세요.",
                "- 숫자/조건이 들어가면 근거(입력값/컨텍스트)를 함께 언급하세요.",
                "- 필요 시 '추가 질문'을 1~4개로 최소화해서 물어보세요.",
                "",
                "[출력 형식]",
                "- 사용자가 자세한 출력이나 전체 출력을 요구하면 분량 제한 없이 상세히 답하세요.",
                "- 기본적으로는 아래 형식을 따르세요.",
                "1) 요약(1~2문장)",
                "2) 추천 행동(불릿 3~6개, 우선순위 포함)",
                "3) 추가 질문(필요할 때만, 최대 4개)",
            ]
        )

        prompt = "\n\n".join(
            [
                "### SYSTEM",
                system_block,
                "",
                "### 캐릭터 컨텍스트 (Mongo)",
                mongo_context or "(MongoDB 캐릭터 컨텍스트 없음)",
                "",
                "### 검색 컨텍스트 (RAG 문서)",
                "\n\n".join(doc_lines) or "(Elasticsearch 검색 결과 없음)",
                "",
                "### 대화 기록",
                "\n".join(history_lines) or "(이전 대화 없음)",
                "",
                "### 사용자 질문",
                question,
                "",
                "### 지시",
                "- 위 컨텍스트에 근거해 답하세요. 근거가 없으면 모른다고 말하고 필요한 정보를 질문하세요.",
            ]
        )

        return {"prompt": prompt, "mongo_context": mongo_context}

    def _generate_answer(self, state: ChatWorkflowState) -> ChatWorkflowState:
        prompt = str(state.get("prompt") or "").strip()
        answer = self._llm.generate(prompt)
        return {"answer": answer}
