# 진행 기록 (Progress Log)

새 세션은 이 파일 → `remaining-tasks.md` → `implementation-plan.md` 순서로 읽고 이어서 진행한다.

## 작업 환경 (중요)

- `/home/jhc/mapleM` 체크아웃이 **곧 운영 서버**다(PM2 `maplem`, 포트 3100). 여기서 `public/`을 고치면 즉시 반영되고, `src/`는 `pm2 restart maplem` 후 반영된다. 운영 반영·재시작·운영 DB 쓰기는 **반드시 운영자 승인 후**.
- 개편 작업은 git worktree `/home/jhc/mapleM/.claude/worktrees/renewal`(브랜치 `worktree-renewal`)에서만 한다. 운영 반영 순서: 이 브랜치에 커밋 → 운영 체크아웃의 `main`을 fast-forward → 운영자 승인 후 `pm2 restart maplem`. push는 운영자가 요청할 때만.
- 운영 DB: Docker `maplem-mongo`(127.0.0.1:27027, `/home/jhc/maplem-mongo`, 매일 19:00 UTC 백업). 27017은 Rocket.Chat MongoDB — 건드리지 않는다.
- 로컬 실행: `node scripts/dev/run-local.js`(:3200, MongoDB 없음) / `node scripts/dev/run-local.js --staging`(:3300, 스테이징 DB `maplem_staging`). 둘 다 운영 `.env`에서 넥슨 키만 가져온다.
- 헤드리스 브라우저: `bash scripts/dev/setup-browser.sh`(최초 1회) 후 `require("./scripts/dev/browser.js").launchBrowser()`.
- 테스트: `npm test`(현재 31개 통과).

## 2026-10-28 세션 1

### 운영에 반영된 것(운영자 승인)
1. 핫픽스 `3486272`: 로그 저장 실패가 응답을 500으로 만들던 문제(랭킹·길드 장애) 수정 + `pm2 restart`.
2. DB 이전: Atlas M0(512MB 가득, 8월 말부터 쓰기 차단) → Docker MongoDB 7.0. 24,238건 복원·대조 일치, 운영 `.env` 백업 후 전환, 기록 저장 재개 확인, 매일 백업 cron 등록.

### 3. 1차 개선 묶음 운영 반영 — 커밋 `d7270b1`(main, push 안 함) + `pm2 restart maplem`. 운영 API 15종·화면 10개 점검 통과
- 넥슨 호출 계층 `src/nexon/client.js`(캐시·병합·동시성·백오프·사용량 로그), 썸네일 API `/api/maplestorym/character/image`
- ID 조회 한글 월드명만, 전체 랭킹 찾기 2일, DB 재연결 재시도, 챗봇 비활성 상태 조회 200
- 랭킹: 월드 필터 전달·월드 내 순위, 지하수로 재활성화, 전장 빈 날짜 → 최근 집계일, 전투력·무릉도장·커닝M타워 추가, 하한일 2025-11-27, "시간의 근원" 표기
- 출처 표기(푸터·공유 이미지), 캐시 버전 문자열 `20261028a`
- V매트릭스 삭제 필드 대응(`src/transform/vmatrix.js`), 공격 타입 stat 판정(캡틴·메카닉 마법), 유니온 스탯(`user/union-stat`) 반영
- V매트릭스 공격력 % 규칙은 `VMATRIX_STAT_RULES=on`일 때만 적용(운영 기본 꺼짐)
- 문서: legacy-audit, game-data-audit, architecture, design-system, implementation-plan, remaining-tasks, test-results, research/*

### 4. V매트릭스 공격력 % 규칙 운영 반영 — `91b55cd`
- 검증: 공식 최대 레벨 30, 운영자 지식(최대 25%), maplemtool 관찰값(Lv.1 7.6% → Lv.30 25%)과 대상 10코어가 모두 일치.
- 공격력 % 규칙 기본 켜짐(`VMATRIX_STAT_RULES=off`로 끔), 근거 없는 기본 효과 4종은 기본 꺼짐(`VMATRIX_BASE_EFFECTS=on`으로 켬).
- 운영 확인: 피카츄 마법 공격력 % 413%(V매트릭스 10건 + 유니온 스탯 20%).

### 5. 챌린저스 월드 제거 운영 반영 — `ce5c52d`
- 운영자 결정. 월드 설정·검색 목록 7곳·랭킹 정렬에서 제거, 운영에서 400 거부·HTML 0건 확인.

### 운영자 결정 (2026-10-28)
- 넥슨에 데이터 보관(30일 갱신 고지) 문의 완료 → 답변 대기.
- 외부 백업: 하지 않음. `debug/` 폴더: 그대로 둠.

### 6. 스탯 정확도 보정 작업 (운영자 요청: "전투력·옵션 수치가 게임과 하나도 안 맞으니 경쟁 사이트 수치·조건을 전부 맞춰라")
- 운영자 허락: 경쟁 사이트 공개 JS를 분석해 규칙·상수를 가져와도 됨(코드는 통째로 복사하지 않고 우리 코드로 재구현).
- 운영자 주장: "캡틴은 물리". 실측(넥슨 stat 마공≈2×물공, 장비 옵션 마법 96 vs 물리 56, 공식 능력치 가이드)은 마법 → 마법 유지, 경쟁 사이트 처리 확인 후 재보고 예정.
- 기준 캐릭터 5명: 유니온/피카츄(아크메이지 썬콜), 스카니아/디올(듀얼블레이드), 스카니아/버디(소울마스터), 스카니아/성령(에릴), 스카니아/몬밀(캡틴).
  - 우리 계산값: `docs/research/calibration/ours/*.json`(배포본 기준), 넥슨 원본: `test/fixtures/characters/*.json`.
  - 경쟁 사이트 화면 수치: `docs/research/calibration/*.json`(수집 중), 경쟁 사이트 JS 규칙: `docs/research/rules/`(분석 중).
- 전투력: stat API '전투력'은 현재 착용 상태 값(피카츄 3,434만 vs 공식 1.92억, 버디 329만 vs 4.97억). 공식 전투력 랭킹 값을 프로필에 표시하도록 구현(1만 위 밖이면 "현재 전투력"으로 표시).

- **운영자 결정(2026-10-28): 캐릭터 화면의 첫 표시는 무조건 "보스 세팅" 기준.** 프리셋이 있는 항목(장비 3프리셋·HEXA 스탯 페이지·하이퍼스탯·링크·유니온 스탯·쥬얼·안드로이드)에서 보스용을 골라 계산한다. 넥슨 세트 효과(set-effect)는 현재 착용 기준이라 보스 프리셋으로 바꾸면 세트·스타포스 세트를 아이템 목록으로 다시 계산해야 한다. 경쟁 사이트가 보스 세팅에서 고르는 프리셋 규칙을 수집 중.
- **보정 표본 확대(운영자 요청 "50명 정도 긁어와서 규칙·상수 추출 후 적용")**: 전 직업 49종 1명씩 48명 + 기준 5명 = 53명. 목록 `docs/research/calibration/sample-50.json`, 넥슨 원본 `.cache/calibration/fixtures/`(커밋 안 함), 경쟁 사이트 수집본 `.cache/calibration/competitor/`(수집 중, 화면이 스스로 불러오는 데이터 포함 — 운영자 허락).
- 테스트 인프라: `test/stat-snapshots.test.js` + `scripts/dev/update-stat-snapshots.js`(규칙 변경 시 스냅샷 재생성 후 diff 검토).

- **보정 1차 결과(기준 5명, 두 경쟁 사이트 대부분 일치)**: 최대 대미지 기본값 4억(우리 1억), 공통 패시브(공% 300·대미지 60·보공 10·치피 30·최종 10), 방어율 무시는 곱연산(우리는 단순 합산 → 100% 초과), 문장(엠블렘)·소울·스타포스 강화옵션·솔 야누스·하이퍼 일부·길드 개인 스킬 동시 옵션 누락. 보스 세팅 = 장비·하이퍼·링크·쥬얼·기계 심장·유니온 프리셋 조합 중 계산 전투력 최대(HEXA 스탯 페이지는 조합 밖). 캡틴(몬밀)은 두 사이트 모두 마법 → 마법 유지 확정.
- **계산 엔진 재구축 진행 중(별도 작업자)**: `src/domain/stats/` + `src/game-data/`, 화면 분류(장비·스킬·성장·콘텐츠)·보스 세팅/현재 착용 토글, 검증 `test/stat-engine-calibration.test.js`, 보고서 `docs/research/calibration/engine-report.md`. 규칙 근거 `docs/research/rules/`(경쟁 사이트 공개 JS 분석, 운영자 허락).
- 확률표 재생성 완료(공식 20페이지·114표, 전 행 90,480행 대조 일치, 테스트 11개) — 운영 반영 대기.

### 7. 계산 엔진 재구축 (작업 사본, 운영 반영 대기)
- `src/domain/stats/`(파서·프리셋·출처별 기여·합계·전투력·조합 탐색·응답 변환) + `src/game-data/` 8개 JSON(각 `_meta`에 출처 사이트·JS 위치·추출일·'추정' 표시). 옛 `buildMajorStats`와 `src/config/starforce-set-options.js`는 제거.
- 보스 세팅 = 장비·기계 심장·하이퍼·쥬얼·링크·유니온 스탯 프리셋 조합 중 계산 전투력 최고(두 사이트 공통 공식). HEXA 스탯은 활성 페이지(53/53 일치). 화면 첫 표시는 보스 세팅, 토글로 현재 착용.
- 53명 대조(`docs/research/calibration/engine-report.md`): 대미지·보공·치피·최대 대미지·최종 53/53, 공격력%·방무 52/53, 프리셋 선택 maplemtool과 52/53. 기준 5명 스탯 40개 중 39개가 두 사이트 중 하나와 정확히 일치.
- V매트릭스 환경변수 스위치(`VMATRIX_STAT_RULES`·`VMATRIX_BASE_EFFECTS`)는 없어졌다: 공격력% 규칙(패시브 50 + 공용 코어 레벨 합)은 엔진에 포함, 기본 효과 4종은 두 사이트처럼 제외.
- 방어율 무시: maplemworlds 방식(옵션 줄마다 곱연산) 채택. 인게임 값과 1~2명 대조 필요(운영자).
- 계산 전투력은 "추정"으로 표시. API 밖 입력(스타코러스 등)을 0으로 두어 공식 랭킹보다 약 1.29배 낮다 — 공식 값은 프로필 칩에 따로 표시.

### 작업 사본에만 있는 변경(운영 반영 전)
- 소울: 부위 목록 대신 API에 소울이 있으면 표시(7/30 10부위 확장 대응)
- 심볼: 어센틱 7종 모두 표시(6개 자르기 제거), 카르시온 제거, MAX 레벨 아케인 20·어센틱 11
- 보안: 보안 헤더 미들웨어, `X-Powered-By` 제거, IP별 속도 제한(넥슨 데이터 120/분, 캐릭터 상세 30/분, 썸네일 300/분, 업로드 10/분) — 로컬에서 동작 확인
- 프로필 전투력 칩(공식 랭킹 값 / 현재 착용 값)
- 진행 중(다른 작업자): 잠재 확률표 재생성(`public/probability`, `item-share.js`, `scripts/data/`)

### 다음 할 일
`remaining-tasks.md` B 목록 3번부터: 확률표 정정 → 소울·어센틱 → `src/game-data/` 중앙화 → 보안 정비 → 디자인 시스템·새 메인.

### 상태 표기 규칙
미조사 / 조사 완료 / 구현 예정 / 구현 중 / 구현 완료 / 테스트 완료 / 운영 반영 / 보류 / 차단됨 — 구현 완료와 테스트 완료를 구분한다.
