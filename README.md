# MapleM Character Explorer

메이플스토리M Open API를 사용하는 Node.js + Express 웹 애플리케이션입니다.

이 저장소에는 캐릭터 대화를 위한 별도의 Python 챗봇 서비스(`chatbot_service`)도 포함되어 있습니다.

## 서비스 구성

1. Node 앱 (공개 웹 + API 프록시)
2. Python FastAPI 챗봇 서비스 (LangGraph + Vertex AI + Redis + Mongo + Elasticsearch)

## 사전 준비

- Node.js 22 이상
- Python 3.11.x (Windows/Linux)
- Redis
- MongoDB
- Elastic Cloud (게이트 준비형 챗봇용)
- Google Cloud Vertex AI 접근 권한

## Node 앱 실행

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000` 또는 `PORT`로 지정한 주소를 열면 됩니다.

## Python 챗봇 서비스 실행

```bash
python -m pip install -r chatbot_service/requirements.lock
python -m uvicorn chatbot_service.main:app --host 0.0.0.0 --port 8001
```

동일한 명령을 Linux/macOS와 Windows PowerShell에서 모두 사용할 수 있습니다.

## 환경 변수

전체 목록은 `.env.example` 파일을 참고하세요.

중요한 챗봇 관련 변수:

- `CHATBOT_ENABLED=true` 설정 시 Node의 `/api/chat/*` 경로 활성화
- `CHATBOT_REQUIRE_ES_GATE=true`
- `CHATBOT_ES_GATE_READY=true` 는 ES 부트스트랩이 완료된 뒤에만 설정
- `PYTHON_CHAT_BASE_URL=http://localhost:8001`
- `GOOGLE_GENAI_USE_VERTEXAI=true`
- `VERTEX_API_KEY=<optional-express-mode-api-key>`
- `GOOGLE_CLOUD_PROJECT=<project-id>`
- `GOOGLE_CLOUD_LOCATION=global`
- `VERTEX_GEMINI_MODEL=gemini-2.5-flash`

## ES 게이트 정책

`CHATBOT_REQUIRE_ES_GATE=true` 이고 `CHATBOT_ES_GATE_READY=false` 인 경우, 채팅 엔드포인트는 `503` (`ES_GATE_NOT_READY`)를 반환합니다.

게이트 완료 체크리스트:

1. Elastic Cloud 배포 생성
2. alias `maplem-rag` 및 backing index `maplem-rag-v1` 생성
3. ELSER 필드 매핑 완료
4. 샘플 데이터 인덱싱 완료
5. BM25 + `text_expansion` + RRF 검색 검증 완료

## API 경로

### 기존 MapleM 경로

- `GET /api/health`
- `GET /api/maplestorym/id?character_name=...&world_name=...`
- `GET /api/maplestorym/character/all?character_name=...&world_name=...`
- `GET /api/maplestorym/character/page-data?character_name=...&world_name=...`
- `GET /api/maplestorym/character/exp-history?ocid=...&limit=30`

### 신규 채팅 경로 (Node 공개 API)

- `GET /api/chat/session/status?world_name=...&character_name=...`
- `POST /api/chat/message`
- `POST /api/chat/session/reset`

`POST /api/chat/message` 요청 본문:

```json
{
  "world_name": "스카니아",
  "character_name": "캐릭터명",
  "message": "질문"
}
```

세션 만료 응답 규격:

- HTTP `409`
- `code: "SESSION_EXPIRED"`
- `status: "expired"`

## 캐릭터 페이지 채팅 UI

캐릭터 페이지에는 오른쪽에 고정된 챗봇 패널이 포함되어 있습니다.

- 세션 상태 표시
- 멀티턴 메시지 기록
- 사용자 비활성 10분 후 자동 만료
- "새 대화 시작" 초기화 버튼

## Python CI

Python 3.11 매트릭스 검사를 위한 GitHub Actions 워크플로가 추가되어 있습니다.

- `ubuntu-latest`
- `windows-latest`

이 워크플로는 `chatbot_service/requirements.lock` 를 설치한 뒤 `pytest`를 실행합니다.
