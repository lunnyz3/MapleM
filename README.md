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

Iris 봇은 `character/all`에 `include_stats=1`을 붙여 조회합니다. 응답의 `stats`에는
홈페이지와 같은 엔진으로 계산한 `majorStats`(보스 세팅), `majorStatsCurrent`(현재 착용),
`statSetting`(프리셋·계산 전투력), `majorStatOrder`, `attackType`이 들어갑니다.
원본 `details`와 같은 조회 결과로 계산하며, 홈페이지의 직접 입력 값은 적용하지 않습니다.
파라미터를 생략하면 기존 응답 형태를 유지합니다.

`include_combat_power=1`을 붙이면 `combatPowerHistory`에 DB에 저장된 최근 24시간의
최고 전투력(`value`), 저장 시각(`observedAt`), 조회 상태(`status`)도 반환합니다.
원본 능력치의 전투력과 해당 캐릭터의 공식 전투력 랭킹 기록을 비교하며 계산 추정치는
포함하지 않습니다. 기록이 없거나 DB를 조회할 수 없으면 `value`는 `null`입니다.
일별 스냅샷은 최신 값으로 덮어쓰므로 이미 덮어쓴 과거 값은 비교 대상에 남아 있지 않습니다.

캐릭터 조회(`all`, `page-data`)는 한국 날짜별 최신 정상 스냅샷을 자동 저장합니다.
실패·부분 실패 조회는 기존 정상 스냅샷을 덮어쓰지 않습니다. `all`의 `meta`에도
`mongoConnected`, `aggregateSaved`, `dataTimestamp`를 반환하고, `character/log-status`는
봇과 홈페이지 양쪽 조회 기록을 확인합니다. 조회하지 않은 캐릭터를 정기 수집하는 작업은 없습니다.

캐릭터 검색 후에는 같은 길드의 명단을 한 번 등록하고 백그라운드에서 길드원 상세를
순차 조회·저장합니다(`all`, `page-data` 공통). 오늘 정상 저장된 캐릭터는 건너뛰며,
같은 길드를 여러 번 검색해도 작업을 중복 등록하지 않습니다. 다른 길드로 재귀 수집하지
않고, DB 저장 불가 시 중단합니다. 부분 실패는 5분 후 새 검색이 들어오면 재시도합니다.
서버 재시작으로 작업 상태가 사라져도 이미 저장한 캐릭터는 DB 기준으로 건너뜁니다.

- 기본 활성화: `GUILD_COLLECTION_ENABLED=true`
- 캐릭터 간 대기: `GUILD_COLLECTION_MEMBER_DELAY_MS=1000`
- 진행 조회: `GET /api/maplestorym/guild/collection-status?world_name=유니온&guild_name=길드명`
- 캐릭터 조회 응답의 `meta.guildCollection`에도 등록 시점의 진행 상태를 반환합니다.

Iris의 경험치 비교는 홈페이지 경험치 기록 API와 같은 레벨 진행도 계산을 사용합니다.
기본은 어제 저장값과 현재값, `7일`은 7일 전 저장값과 현재값을 비교합니다.
해당 날짜의 기록이 없으면 다른 날짜로 대체하지 않고 기록 부족으로 표시합니다.

```text
.경험치비교 유니온 피카츄 데나
.경험치비교 유니온 피카츄 / 스카니아 디올 7일
```

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
