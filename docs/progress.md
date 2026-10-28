# 진행 기록 (Progress Log)

새 세션은 이 파일 → `remaining-tasks.md` → `implementation-plan.md` 순서로 읽고 이어서 진행한다.

## 작업 환경 (중요)

- `/home/jhc/mapleM` 체크아웃이 **곧 운영 서버**다(PM2 `maplem`, 포트 3100). 여기서 `public/`을 고치면 즉시 반영되고, `src/`는 `pm2 restart maplem` 후 반영된다. 운영 반영·재시작·운영 DB 쓰기는 **반드시 운영자 승인 후**.
- 개편 작업은 git worktree `/home/jhc/mapleM/.claude/worktrees/renewal`(브랜치 `worktree-renewal`)에서만 한다. **2026-10-28 현재 변경 사항은 아직 커밋하지 않았다**(파일로 디스크에 있음).
- 운영 DB: Docker `maplem-mongo`(127.0.0.1:27027, `/home/jhc/maplem-mongo`, 매일 19:00 UTC 백업). 27017은 Rocket.Chat MongoDB — 건드리지 않는다.
- 로컬 실행: `node scripts/dev/run-local.js`(:3200, MongoDB 없음) / `node scripts/dev/run-local.js --staging`(:3300, 스테이징 DB `maplem_staging`). 둘 다 운영 `.env`에서 넥슨 키만 가져온다.
- 헤드리스 브라우저: `bash scripts/dev/setup-browser.sh`(최초 1회) 후 `require("./scripts/dev/browser.js").launchBrowser()`.
- 테스트: `npm test`(현재 24개 통과).

## 2026-10-28 세션 1

### 운영에 반영된 것(운영자 승인)
1. 핫픽스 `3486272`: 로그 저장 실패가 응답을 500으로 만들던 문제(랭킹·길드 장애) 수정 + `pm2 restart`.
2. DB 이전: Atlas M0(512MB 가득, 8월 말부터 쓰기 차단) → Docker MongoDB 7.0. 24,238건 복원·대조 일치, 운영 `.env` 백업 후 전환, 기록 저장 재개 확인, 매일 백업 cron 등록.

### 작업 사본에서 완료(테스트 완료, 운영 반영 대기 — `remaining-tasks.md` A1)
- 넥슨 호출 계층 `src/nexon/client.js`(캐시·병합·동시성·백오프·사용량 로그), 썸네일 API `/api/maplestorym/character/image`
- ID 조회 한글 월드명만, 전체 랭킹 찾기 2일, DB 재연결 재시도, 챗봇 비활성 상태 조회 200
- 랭킹: 월드 필터 전달·월드 내 순위, 지하수로 재활성화, 전장 빈 날짜 → 최근 집계일, 전투력·무릉도장·커닝M타워 추가, 하한일 2025-11-27, "시간의 근원" 표기
- 출처 표기(푸터·공유 이미지), 캐시 버전 문자열 `20261028a`
- V매트릭스 삭제 필드 대응(`src/transform/vmatrix.js`), 공격 타입 stat 판정(캡틴·메카닉 마법)
- 문서: legacy-audit, game-data-audit, architecture, design-system, implementation-plan, remaining-tasks, test-results, research/*

### 진행 중
- V매트릭스 공격력 % 규칙(7.6 + 0.6×(Lv−1), 상한 25%) 대조: 공식 가이드상 공용 코어 최대 Lv.30에서 정확히 25%(운영자 지식과 일치). maplemworlds는 코어별 기여를 공개하지 않아 판정 불가. maplemtool 조사 결과 대기.
- `docs/competitor-feature-inventory.md` 작성(maplemtool 결과 합치기 전).

### 다음 할 일
`remaining-tasks.md` B 목록.

### 상태 표기 규칙
미조사 / 조사 완료 / 구현 예정 / 구현 중 / 구현 완료 / 테스트 완료 / 운영 반영 / 보류 / 차단됨 — 구현 완료와 테스트 완료를 구분한다.
