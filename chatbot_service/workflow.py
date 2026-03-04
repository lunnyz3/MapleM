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
    mongo_context: str
    retrieved_docs: list[RetrievedDocument]
    prompt: str
    answer: str


class CharacterChatWorkflow:
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

        mongo_context = self._mongo_provider.get_latest_context(world_name, character_name)
        es_docs = self._retriever.retrieve(question, limit=6)

        return {
            "mongo_context": mongo_context,
            "retrieved_docs": es_docs,
        }

    def _build_prompt(self, state: ChatWorkflowState) -> ChatWorkflowState:
        question = str(state.get("question") or "").strip()
        history = state.get("history") or []
        mongo_context = str(state.get("mongo_context") or "").strip()
        docs = state.get("retrieved_docs") or []

        history_lines: list[str] = []
        for item in history[-12:]:
            role = str(item.get("role") or "").strip()
            content = str(item.get("content") or "").strip()
            if not role or not content:
                continue
            if role not in {"user", "assistant"}:
                continue
            history_lines.append(f"{role}: {content}")

        doc_lines: list[str] = []
        for idx, doc in enumerate(docs, start=1):
            title = str(doc.title or "").strip() or "(제목 없음)"
            content = str(doc.content or "").strip()
            if not content:
                continue
            snippet = content[:900]
            doc_lines.append(f"[{idx}] {title}\n{snippet}")

        prompt = "\n\n".join(
            [
                "시스템 지시:",
                "- 당신은 메이플M 캐릭터 정보 기반 상담 챗봇입니다.",
                "- 근거가 부족하면 추측 대신 모른다고 말하고, 추가 확인 방법을 제안합니다.",
                "- 답변은 한국어로 간결하고 정확하게 작성합니다.",
                "- 답변에서 출처 문서 id나 내부 시스템 이름을 노출하지 않습니다.",
                "캐릭터 컨텍스트:",
                mongo_context or "(MongoDB 캐릭터 컨텍스트 없음)",
                "검색 컨텍스트:",
                "\n\n".join(doc_lines) or "(Elasticsearch 검색 결과 없음)",
                "대화 기록:",
                "\n".join(history_lines) or "(이전 대화 없음)",
                "사용자 질문:",
                question,
            ]
        )

        return {"prompt": prompt}

    def _generate_answer(self, state: ChatWorkflowState) -> ChatWorkflowState:
        prompt = str(state.get("prompt") or "").strip()
        answer = self._llm.generate(prompt)
        return {"answer": answer}
