# MapleM Chatbot Service (Python)

FastAPI service for character chatbot orchestration.

## Runtime

- Python 3.11.x
- Works on Windows PowerShell and Linux/macOS shell

## Install

```bash
python -m pip install -r chatbot_service/requirements.lock
```

## Run

```bash
python -m uvicorn chatbot_service.main:app --host 0.0.0.0 --port 8001
```

## Required environment variables

```env
CHATBOT_ENABLED=true
CHATBOT_REQUIRE_ES_GATE=true
CHATBOT_ES_GATE_READY=false

REDIS_URL=redis://localhost:6379/0

MONGODB_URI=mongodb+srv://...
MONGO_DB_NAME=maplem
MONGO_LOG_COLLECTION=requestlogs

ELASTICSEARCH_URL=https://<cluster-id>.<region>.aws.cloud.es.io:443
ELASTICSEARCH_API_KEY=<api_key>
ELASTICSEARCH_INDEX_ALIAS=maplem-rag
ELASTICSEARCH_TEXT_FIELD=content
ELASTICSEARCH_SPARSE_FIELD=content_embedding
ELASTICSEARCH_ELSER_MODEL_ID=.elser_model_2

GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=<project-id>
GOOGLE_CLOUD_LOCATION=global
VERTEX_GEMINI_MODEL=gemini-2.5-flash
```

## API

- `GET /health`
- `GET /v1/chat/session/status`
- `POST /v1/chat/message`
- `POST /v1/chat/session/reset`

## Notes

- With `CHATBOT_REQUIRE_ES_GATE=true` and `CHATBOT_ES_GATE_READY=false`, chat endpoints return `503 ES_GATE_NOT_READY`.
- Session key format: `chat:{chat_sid}:{world_name}:{character_name}`.
- Session timeout policy: expire after 10 minutes (`600s`) from the last user message.
