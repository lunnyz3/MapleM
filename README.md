# MapleM Character Explorer

Node.js + Express web app for MapleStory M Open API.

This repository now includes a separate Python chatbot service (`chatbot_service`) for character chat.

## Services

1. Node app (public web + API proxy)
2. Python FastAPI chatbot service (LangGraph + Vertex AI + Redis + Mongo + Elasticsearch)

## Prerequisites

- Node.js 22+
- Python 3.11.x (Windows/Linux)
- Redis
- MongoDB
- Elastic Cloud (for gate-ready chatbot)
- Google Cloud Vertex AI access

## Run Node app

```bash
npm install
npm start
```

Open `http://localhost:3000` (or `PORT`) in your browser.

## Run Python chatbot service

```bash
python -m pip install -r chatbot_service/requirements.lock
python -m uvicorn chatbot_service.main:app --host 0.0.0.0 --port 8001
```

Same command works on Linux/macOS and Windows PowerShell.

## Environment variables

See `.env.example` for the full list.

Important chatbot variables:

- `CHATBOT_ENABLED=true` to enable Node `/api/chat/*`
- `CHATBOT_REQUIRE_ES_GATE=true`
- `CHATBOT_ES_GATE_READY=true` only after ES bootstrap is complete
- `PYTHON_CHAT_BASE_URL=http://localhost:8001`
- `GOOGLE_GENAI_USE_VERTEXAI=true`
- `GOOGLE_CLOUD_PROJECT=<project-id>`
- `GOOGLE_CLOUD_LOCATION=global`
- `VERTEX_GEMINI_MODEL=gemini-2.5-flash`

## ES gate policy

If `CHATBOT_REQUIRE_ES_GATE=true` and `CHATBOT_ES_GATE_READY=false`, chat endpoints return `503` (`ES_GATE_NOT_READY`).

Expected gate completion checklist:

1. Elastic Cloud deployment created
2. alias `maplem-rag` and backing index `maplem-rag-v1` created
3. ELSER field mapping completed
4. sample data indexed
5. BM25 + `text_expansion` + RRF retrieval verified

## API routes

### Existing MapleM routes

- `GET /api/health`
- `GET /api/maplestorym/id?character_name=...&world_name=...`
- `GET /api/maplestorym/character/all?character_name=...&world_name=...`
- `GET /api/maplestorym/character/page-data?character_name=...&world_name=...`
- `GET /api/maplestorym/character/exp-history?ocid=...&limit=30`

### New chat routes (Node public API)

- `GET /api/chat/session/status?world_name=...&character_name=...`
- `POST /api/chat/message`
- `POST /api/chat/session/reset`

`POST /api/chat/message` body:

```json
{
  "world_name": "스카니아",
  "character_name": "캐릭터명",
  "message": "질문"
}
```

Expired session response spec:

- HTTP `409`
- `code: "SESSION_EXPIRED"`
- `status: "expired"`

## Character page chat UI

Character page now includes a fixed right-side chatbot panel:

- Session status display
- Multi-turn message history
- Auto-expire after 10 minutes of user inactivity
- "새 대화 시작" reset button

## Python CI

A GitHub Actions workflow was added for Python 3.11 matrix checks:

- `ubuntu-latest`
- `windows-latest`

The workflow installs `chatbot_service/requirements.lock` and runs pytest.
