# 기존 사이트 전수 조사 (Legacy Audit)

- 조사일: 2026-10-28
- 기준 커밋: `57cb54c` (운영 체크아웃과 동일), 핫픽스 `3486272` 반영 후 재점검
- 방법: 코드 정독(서버 전체, 클라이언트는 기능 단위), 운영 사이트 헤드리스 브라우저 점검, 로컬 서버(MongoDB 끔) 점검, 운영 PM2 로그 확인, 운영 MongoDB 읽기 전용 집계(운영자 승인)
- 표기: **운영 확인** = maplem.co.kr에서 직접 확인 / **로컬 확인** = 같은 코드를 로컬에서 실행해 확인 / **코드 확인** = 코드로만 확인

---

## 1. 기술 스택과 실행 환경

| 영역 | 현재 상태 |
|---|---|
| 서버 | Node 22, Express 5 (`server.js` → `src/app.js`), CommonJS |
| 프런트엔드 | 빌드 없는 바닐라 JS(ES modules) + 페이지별 HTML 4개(`index`, `character`, `ranking`, `guild`) + 수작업 CSS. 캐시 무효화는 `?v=날짜` 수동 관리 |
| 데이터베이스 | MongoDB Atlas **M0 무료(512MB)**, 컬렉션 1개(`requestlogs`) — 넥슨 응답 원본을 그대로 저장 |
| 외부 API | 넥슨 Open API(메이플스토리M) — `axios`, 서버에서 키 보관 |
| 배포 | 이 저장소 체크아웃이 곧 운영. PM2 `maplem`(포트 3100) + Cloudflare Tunnel + nginx. `public/` 수정은 즉시 반영, `src/` 수정은 `pm2 restart` 필요 |
| 기타 의존성 | `html2canvas`(이미지 캡처), `multer`(공유 이미지 업로드), Kakao JS SDK(공유) |
| 챗봇 | `chatbot_service/`(Python FastAPI + Elasticsearch ELSER + Redis + Vertex Gemini). **운영에서 실행되지 않음**(PM2에 없음, `/api/chat/*`는 503) |
| 테스트 | 없음(이번 작업에서 `node --test` 기반 첫 테스트 추가) |
| CI | `chatbot-python-ci.yml`(챗봇만). 웹 앱 CI 없음 |
| 인증·회원 | 없음 |
| 스케줄러 | 공유 이미지 정리 타이머(10분 간격, 24시간 TTL)뿐. 데이터 수집 크론 없음 |

### 파일별 역할과 규모

| 파일 | 줄 수 | 역할 |
|---|---:|---|
| `src/controllers/maplestorym.controller.js` | 3,779 | 요청 파싱, 넥슨 호출 조합, 스탯 기여도 분석, 프리셋 복원, 경험치 기록, 랭킹 — **단일 거대 모듈** |
| `src/services/maplestorym.service.js` | 239→263 | 넥슨 호출(axios), 요청 로그 저장 |
| `src/controllers/share.controller.js` | 316 | 공유 이미지 업로드/다운로드/정리 |
| `src/controllers/chat.controller.js` | 264 | 챗봇 프록시(비활성) |
| `src/config/starforce-set-options.js` | 410 | 스타포스 세트 옵션 상수 |
| `src/config/worlds.js` | 52 | 월드 목록·별칭 |
| `public/js/pages/character.js` | 4,590 | 캐릭터 상세 화면 전체(168KB, 단일 파일) |
| `public/js/pages/ranking.js` + `features/ranking-shared.js` | 583 + 395 | 랭킹 화면 |
| `public/js/pages/guild.js` + `features/guild-shared.js` | 189 + 543 | 길드 화면 |
| `public/js/features/item-share.js` | 893 | 잠재능력 상위 % 계산·공유 이미지 |
| `public/js/features/equipment-shared.js` | 667 | 장비 툴팁·등급·엠블렘 표시 |
| `public/js/core/common.js` | 651 | 공통 유틸·검색 폼·직업 분류·월드 목록 |
| `public/css/page-character.css` | 5,825 | 캐릭터 화면 스타일(107KB) |
| `public/probability/*.json` | 약 41만 줄 | 부위별 잠재/에디셔널 확률표 21개 |

---

## 2. 페이지·기능 목록과 실제 동작 여부

| # | 기능 | 경로 | 관련 소스 | 2026-10-28 점검 결과 | 판정 |
|---|---|---|---|---|---|
| 1 | 메인(캐릭터 검색) | `/` | `index.html`, `pages/index.js` | 운영 확인: 정상. 길드 검색은 최근 커밋에서 제거됨 | 대체(새 대시보드) |
| 2 | 상단 빠른 검색(월드+이름) | 모든 페이지 | `core/common.js` | 운영 확인: 정상 | 유지·개선(최근 검색/자동완성) |
| 3 | 캐릭터 프로필(이미지, 직업, 레벨, 경험치율, 길드, 전체 랭킹) | `/character/:월드/:이름` | `character.js`, 컨트롤러 `buildPageData` | 운영 확인: 정상(응답 약 7.9초, 로컬 1.7초) | 유지·개선 |
| 4 | 주요 스탯 + 출처별 기여도 분석(장비/세트/스타포스/심볼/유니온/길드/HEXA 등) | 캐릭터 > 장비 | 컨트롤러 `buildMajorStats`(1029~) | 운영 확인: 표시됨. 계산 규칙의 최신성은 미검증 → `game-data-audit.md` | 수정(검증 후 모듈화) |
| 5 | 장비 + 프리셋(과거 기록으로 다른 프리셋 복원) | 캐릭터 > 장비 | `extractEquipmentPresetResult`(2103~), `equipment-shared.js` | 운영 확인: 표시됨. 복원은 과거 원본 30건을 매번 읽음 | 수정(저장 구조 개선) |
| 6 | 캐시 장비·안드로이드·하트·펫·뷰티 | 캐릭터 > 장비/안드로이드 | `character.js` | 로컬 확인: 표시됨 | 유지 |
| 7 | 잠재능력 요약·상위 %·예상 큐브 수 | 장비 툴팁/공유 | `item-share.js`, `public/probability/*.json` | 코드 확인. 확률표 최신성 미검증 | 수정(데이터 검증) |
| 8 | 경험치/레벨 그래프 | 캐릭터 > 경험치 | `getCharacterExpHistory`(3218~), `renderExpTab` | 운영 확인: 과거 기록 표시. **8월 말 이후 새 기록이 쌓이지 않음**(DB 용량 초과) | 대체(성장 기록 시스템) |
| 9 | 쥬얼·심볼(아케인/어센틱)·V매트릭스 | 캐릭터 > 쥬얼·심볼 | `renderJewelSymbolVmatrixTab` | 로컬 확인: 표시됨. **V매트릭스 스킬 코어 이름이 "-"로 표시**(필드 불일치 의심) | 수정 |
| 10 | HEXA 스킬·HEXA 스탯 + 누적 강화 비용 | 캐릭터 > 스킬 | `renderHexamatrixTab`, `resolveHexaCostTableByGroup` | 로컬 확인: 표시됨. 비용표는 하드코딩 | 수정(데이터 검증) |
| 11 | 하이퍼스탯·링크스킬(프리셋) | 캐릭터 > 하이퍼스탯 | `renderHyperStatTab` | 로컬 확인: 표시됨 | 유지 |
| 12 | 길드 탭(길드 정보·길드 스킬·내 기여) | 캐릭터 > 길드 | `buildGuildTab` | 로컬 확인: 표시됨 | 유지 |
| 13 | 유니온(등급·레벨 합·효과·공격대) | 캐릭터 > 유니온 | `buildUnionTab` | 로컬 확인: 표시됨 | 유지 |
| 14 | 프로필 카드·장비 카드 이미지 저장/카카오 공유 | 캐릭터 | `character.js` 공유 함수군, `share.controller.js` | 코드 확인(업로드는 인증·속도 제한 없음) | 수정(보안) |
| 15 | 캐릭터 AI 챗봇 | 캐릭터 | `chat.controller.js`, `chatbot_service/` | 운영 확인: **비활성(503)**. 페이지마다 상태 조회가 실패해 콘솔 오류 발생 | 보류(운영자 결정) — 비활성 시 호출 자체를 하지 않도록 수정 |
| 16 | 종합(레벨) 랭킹 | `/ranking.html?type=level` | `ranking.js`, `ranking-shared.js` | 운영 확인: **장애였음 → 핫픽스로 복구** | 수정(성능) |
| 17 | 유니온 랭킹 | `?type=union` | 동일 | 위와 동일(복구) | 수정 |
| 18 | 업적 랭킹 | `?type=achievement` | 동일 | 위와 동일(복구) | 수정 |
| 19 | 시간의 근원 랭킹 | `?type=root-of-time` | 동일 | 위와 동일(복구) | 수정 |
| 20 | 샤레니안의 전장(길드) 랭킹 | `?type=sharenian-battlefield` | 동일 | 복구됨. 단 10-26·10-28 데이터 0건(10-19는 200건) — **기준일 안내 없이 빈 표** | 수정(최근 유효일 자동 탐색) |
| 21 | 샤레니안의 지하수로(길드) 랭킹 | `?type=sharenian-waterway` | `common.js:373`에서 비활성 | **API는 정상(200건)인데 메뉴가 꺼져 종합 랭킹으로 넘어감** | 수정(재활성화) |
| 22 | 랭킹 내 캐릭터 검색(내 순위 찾기) | 랭킹 | `ranking.js:263` | 장애였음 → 복구 | 유지 |
| 23 | 길드 상세(기본 정보·길드원·건물·능력) | `/guild/:월드/:이름` | `guild.js`, `guild-shared.js` | 장애였음(코드상 랭킹과 동일 원인) → 복구 | 유지·개선 |
| 24 | `/dashboard.html` | — | 메인으로 이동만 하는 빈 페이지 | 운영 확인 | 제거 |
| 25 | 원본 프록시 API(`/api/maplestorym/character/*?ocid=` 등 23개) | — | `maplestorym.routes.js` | 동작. **누구나 우리 키로 넥슨 API를 무제한 호출 가능** | 대체(필요한 집계 API만 공개 + 캐시 + 속도 제한) |
| 26 | `/api/health`, `/api/health/routes` | — | | 동작. 라우트 목록 공개 | 수정(내부 정보 축소) |

---

## 3. 2026-10-28 장애와 조치 기록

- **증상**: 랭킹 6종, 길드 상세, 랭킹 내 캐릭터 검색이 HTTP 500("JSON 응답이 아닙니다.").
- **원인**: Atlas M0 용량 512MB가 가득 차 쓰기가 막혔다(`MongoServerError: you are over your space quota`). 랭킹·길드·ID 컨트롤러는 넥슨 응답을 받은 뒤 `saveRequestLog`를 예외 처리 없이 기다렸고, 저장 실패가 그대로 Express 기본 500 HTML로 이어졌다. 캐릭터 상세는 로그 저장을 `try/catch`로 감싸 둬서 살아 있었다.
- **시점 추정**: DB의 가장 최근 문서가 2026-08-28 → 그 무렵부터 약 2개월간 랭킹·길드가 멈췄을 가능성이 높다(PM2 로그에 타임스탬프가 없어 정확한 시점은 확인 불가).
- **조치**: 운영자 승인 후 `main`에 핫픽스 `3486272`를 커밋하고 `pm2 restart maplem` 실행. 로그 저장은 이제 실패해도 응답을 막지 않고, 용량 초과 오류가 나면 10분간 쓰기를 건너뛴다. 단위 테스트 3개 추가(수정 전 코드에서 2개 실패, 수정 후 통과).
- **재점검**: 운영 `ranking/level·union·achievement·root-of-time`, `guild/id`, `id` 모두 200. 랭킹 화면 정상 표시.
- **남은 문제**: DB는 여전히 가득 차 있어 경험치 기록이 쌓이지 않는다 → §6, `remaining-tasks.md`.

---

## 4. 넥슨 API 연결 상태와 호출량

상세 대조는 `docs/research/nexon-api-audit.md` 참고. 여기서는 구조 문제만 적는다.

| 화면 | 1회 조회당 넥슨 호출 수 | 근거 |
|---|---:|---|
| 캐릭터 상세 | **최대 약 29회**: `id` 1 + 상세 19(병렬) + `guild/id`·`guild/basic` 2 + 전체 랭킹 찾기 최대 7(순차) | `fetchCharacterDetails`(1354~), `resolveLatestOverallRankingByOcid`(1726~) — 랭킹 200위 밖 캐릭터는 7일치를 하나씩 실패할 때까지 조회 |
| 랭킹 1페이지(50행) | **약 100~150회**: 랭킹 1 + 행마다 `id`·`character/basic`(썸네일) + 길드마다 `guild/id`·`guild/basic`(길드 마크) | `ranking-shared.js:145,156,271,283` — 길드 마크는 랭킹 응답의 `guild_mark_icon`에 이미 있음 |
| 길드 상세 | 2 + 길드원마다 `id`·`character/basic` | `hydrateGuildMemberThumbs` |

- 서버 캐시 없음: 같은 캐릭터·랭킹을 누가 열든 매번 넥슨을 다시 부른다.
- 429 재시도가 지연 없이 즉시 2번 재요청한다(`maplestorym.service.js:19~44`) → 한도 초과 시 더 악화.
- 동시 요청 병합(in-flight dedupe) 없음.

---

## 5. 하드코딩

게임 수치 상세는 `docs/game-data-audit.md`. 구조적으로 확인된 문제:

- 같은 목록이 여러 곳에 중복: 월드 목록(`src/config/worlds.js`, HTML 4개의 `<option>` 9곳, `ranking-shared.js` 정렬 순서), 물리/마법 직업 목록(`maplestorym.controller.js:161~218`, `public/js/core/common.js:~463`) — 직업 하나 추가에 파일 2개, 월드 하나 추가에 파일 6개를 고쳐야 했다(커밋 `57cb54c` 참고).
- 랭킹 조회 하한일 `2025-12-01`(`controller:49`), 프리셋 복원 조회 30건(`:48`) 같은 운영 값이 코드 상수.
- HEXA 강화 비용표, 스타포스 세트 옵션, 잠재능력 확률표 21개가 출처·적용 버전 없이 들어 있음.
- 확률표 파일명 오류: `gloves_potential_prob.json.json`, `gloves_additional_potential_prob.json.json`.

---

## 6. 데이터 저장(MongoDB) 현황 — 읽기 전용 집계, 2026-10-28

| 구분 | 용량 | 문서 수 | 기간 |
|---|---:|---:|---|
| 전체 `requestlogs` | 504MB(압축 전) / 디스크 127MB / 인덱스 7MB | 24,238 | 2026-03-03 ~ 2026-08-28 |
| 캐릭터 상세 원본(page-data) | 307.9MB | 691 | 03-03 ~ 08-24 |
| 캐릭터 전체 원본(all) | 128.6MB | 407 | 07-25 ~ 08-28 |
| 길드 원본(guild/basic) | 27.5MB | 174 | |
| 캐릭터 기본 원본(character/basic, 랭킹 썸네일용) | 15.0MB | 13,417 | 어디서도 다시 읽지 않음 |
| 랭킹 원본 6종 | 약 20.6MB | 270 | 다시 읽지 않음 |
| ID 조회 실패 로그 | 2.9MB | 8,809 | 다시 읽지 않음 |

- 경험치 그래프에 필요한 값은 레벨·경험치·경험치율 3개인데, 이를 위해 건당 약 445KB의 원본 전체를 저장한다. 같은 데이터를 압축된 스냅샷(건당 수백 바이트)으로 바꾸면 수백 배 적게 든다.
- Atlas M0 한도는 압축 전 데이터 크기 기준으로 보인다(dataSize 504MB + 인덱스 ≈ 512MB). 삭제하면 바로 줄어드는 구조로 추정되나 Atlas 문서로 재확인 필요.
- 정리안(삭제 포함)은 운영자 승인 대상 → `remaining-tasks.md`.

---

## 7. 잠재 버그

| # | 내용 | 위치 | 영향 |
|---|---|---|---|
| B1 | 로그 저장 실패가 응답을 500으로 바꿈 | `service.saveRequestLog` 호출부 전반 | **해결**(핫픽스 `3486272`) |
| B2 | 429 즉시 재시도(지연 없음) | `maplestorym.service.js:19~44` | 한도 초과 악화 |
| B3 | 전체 랭킹 찾기가 최대 7번 순차 호출 | `controller:1726~1756` | 상세 페이지 지연, 호출 한도 낭비 |
| B4 | 샤레니안의 전장: 데이터 없는 날짜에 안내 없이 빈 표 | `ranking.js` | 사용자 혼란 |
| B5 | 샤레니안의 지하수로: 동작하는 랭킹이 비활성 처리됨 | `common.js:373` | 기능 손실 |
| B6 | V매트릭스 스킬 코어 이름 "-" 표시 | `renderSimpleVmatrixCoreBoard` 추정 | 정보 누락(원인은 API 필드 대조 필요) |
| B7 | 챗봇 비활성인데 모든 캐릭터 페이지가 상태 조회 → 503, 콘솔 오류 | `character.js` 챗봇 컨트롤러 | 불필요한 요청 |
| B8 | 전역 `error`/`unhandledrejection` 핸들러가 어떤 스크립트 오류든 본문을 "Bootstrap error"로 덮어씀 | `public/js/main.js:15~27, 45~50` | 외부 SDK 오류 하나로 화면 전체가 사라질 수 있음 |
| B9 | 위 오류 메시지를 `innerHTML`로 삽입 | `main.js:24` | XSS 여지(낮음) |
| B10 | `main.js`의 `ASSET_VERSION`(`20260305s`)과 HTML의 `?v=`가 따로 놀고, 하위 모듈 import에는 버전이 없음 | `main.js:13` 등 | 배포 후 오래된 JS가 섞일 수 있음 |
| B11 | `sendFile`에 절대경로를 넘겨 체크아웃 경로에 점 폴더가 있으면 404 | `src/app.js` | 운영 영향 없음, 작업 사본에서 수정 |
| B12 | `meta.dataTimestamp`가 넥슨 데이터 기준 시각이 아니라 서버 현재 시각 | `controller:2978` | "언제 기준 데이터인가"를 잘못 안내 |
| B13 | 확률표 파일명 `.json.json` | `public/probability/` | 유지보수 혼란 |

## 8. 성능 문제

- 넥슨 호출 과다(§4)와 캐시 부재가 가장 크다. 랭킹 한 페이지가 100회 이상 호출해, 동시 사용자가 몇 명만 돼도 넥슨 호출 한도(초당/일일)에 걸린다.
- 캐릭터 상세가 매번 MongoDB에서 원본 30건(최대 수십 MB)을 읽어 프리셋을 복원한다(`controller:1767~1791`).
- 프런트엔드: 캐릭터 화면 JS 168KB + CSS 107KB 단일 파일, 코드 분할 없음. 확률표 JSON은 필요할 때 불러온다(양호).
- 정적 파일 캐시는 Cloudflare 4시간 + 수동 `?v=`. 파일 해시 기반 캐시 무효화 없음.

## 9. 보안 문제

| # | 내용 | 심각도 |
|---|---|---|
| S1 | 원본 프록시 API 23개가 인증·속도 제한 없이 공개 → 외부에서 우리 키 한도를 소진 가능 | 높음 |
| S2 | 공유 이미지 업로드가 인증·속도 제한 없음(PNG 검사·2MB·24시간 TTL·최대 1,000개는 있음) | 중간 |
| S3 | 보안 헤더 없음(HSTS, CSP, X-Frame-Options, nosniff, Referrer-Policy), `X-Powered-By: Express` 노출 | 중간 |
| S4 | 오류 응답에 넥슨 원본 오류와 내부 엔드포인트 URL을 그대로 전달 | 낮음 |
| S5 | `/api/health/routes`가 내부 라우트 목록 공개 | 낮음 |
| S6 | `.env`에 넥슨·Vertex·Elasticsearch·Kakao 키가 함께 있음(서버 측 보관은 정상). `KAKAO_JS_KEY`는 원래 공개용 | 정보 |
| S7 | XSS: 템플릿 문자열 + `innerHTML` 렌더링이 대부분이나 `escapeHtml`을 194곳에서 사용 중. 전수 검증은 컴포넌트 재작성 때 수행 | 확인 필요 |

## 10. 유지·수정·대체·제거 판단

- **유지**: 캐릭터 상세의 탭 구성 데이터(장비·프리셋·심볼·HEXA·유니온·길드), 스탯 기여도 분석 아이디어, 잠재 상위 % 계산, 이미지 공유, 랭킹 6종, 길드 상세.
- **수정**: 넥슨 호출 계층(캐시·병합·백오프), 로그 저장 구조(압축 스냅샷), 게임 상수 중앙화·출처 관리, 샤레니안 랭킹 2종, V매트릭스 표시, 보안 헤더·속도 제한.
- **대체**: 원본 프록시 API → 집계 API, 경험치 원본 로그 → 성장 기록 스냅샷, 메인 화면 → 새 대시보드, 페이지별 거대 JS/CSS → 디자인 시스템 + 컴포넌트 모듈.
- **제거**: `dashboard.html`(빈 리다이렉트), 비활성 챗봇 호출(챗봇 유지 여부는 운영자 결정), 다시 읽지 않는 로그(`character/basic`·랭킹·ID 실패 로그 — 삭제는 승인 후).
