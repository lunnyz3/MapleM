# 넥슨 Open API(메이플스토리M) 명세 조사와 우리 코드 대조

- 작성일: 2026-10-28 (모든 출처 확인일도 2026-10-28)
- 대상: maplem.co.kr, 브랜치 `worktree-renewal`, 커밋 `57cb54c` 기준. 코드 수정은 하지 않았다.
- 줄 번호: `src/controllers/maplestorym.controller.js`(이하 `controller`), `src/routes/maplestorym.routes.js`(`routes`), `src/config/worlds.js`, `public/js/**`는 커밋 `57cb54c`와 같다. `src/services/maplestorym.service.js`(`service`)는 조사 중에 다른 세션이 수정하고 있어서(미커밋, 요청 로그 저장을 best-effort로 바꾸는 변경) 2026-10-28 15시(KST) 작업 트리 기준으로 적었다. 커밋 `57cb54c`에서는 `requestNexon` 이하가 2줄 앞이다.
- 근거 표기
  - **[실측]** 2026-10-28 15:02~15:15 KST에 실제 API를 GET으로 39회 호출해 확인(예산 40회, 초당 1.25회 이하). 원본 응답은 scratchpad에만 두었고, 저장 전에 API 키 조각을 가리고 `ocid`/`oguild_id`는 앞 8자만 남겼다.
  - **[문서]** 공식 문서·스펙·공지로만 확인.
  - **[코드]** 우리 코드를 정적으로 읽어 확인.
  - **[추정]** 위 근거로부터의 추론. 확인이 더 필요하다.
- 출처 ID는 문서 끝 「출처」 절에 URL과 함께 정리했다.

---

## 1. 요약

**공식 엔드포인트는 38개이고 그중 28개를 쓴다.** 내역은 캐릭터 18개(`/id` 포함), 유니온 3개, 길드 2개, 랭킹 9개, 공지 6개다 [문서 S1, S2]. 28개 가운데 `character/beauty-equipment`와 `character/skill-equipment`는 호출만 하고 화면이나 챗봇 어디에서도 쓰지 않는다. `ranking/sharenian-waterway`는 서버 라우트만 있고 UI에서는 숨겨 두었다 [코드]. 넥슨에 없는 경로를 부르는 곳은 없다. `/maplestorym/v1/character/all`은 로그 저장용 키 문자열일 뿐 실제로 호출하지는 않는다(controller:47) [코드].

가장 중요한 문제는 다음과 같다.

1. **출처 표기가 없다.** 넥슨은 "Data based on NEXON Open API" 문구를 서비스에 명시하라고 요구한다(약관 제6조 ④, API 사용하기 가이드) [문서 S3, S6]. 그런데 `public/` 아래 HTML/JS 어디에도 이 문구나 "NEXON" 표기가 없고, 공유 이미지에도 없다 [코드].
2. **`/id` 호출이 늘 두 배로 나간다.** 월드명을 영문(`Scania` 등)으로 먼저 보내 `400 OPENAPI00004`를 받은 뒤 한글로 다시 보낸다 [실측]. 실패 응답은 MongoDB 로그로도 저장된다(worlds.js:2-9, controller:1303-1352).
3. **2026-09~10월 스키마 변경이 반영되지 않았다.**
   - 2026-10-15에 삭제된 `union-raider` 필드 3개(전투 지도 프리셋 번호, 점령 효과, 프리셋별 전투 지도)에 기대고 있다 [문서 N-3563720, 실측].
   - 같은 날 추가된 `user/union-stat`을 쓰지 않는다. 그래서 유니온 스탯(실측 표본 기준 물리 공격력 20%, 보스 공격력 20%, 치명타 피해 20% 등)이 주요 스탯 계산에서 빠진다.
   - 2026-09-17에 삭제된 V매트릭스 `slot_id`·`slot_level`·`vcore_name`에 기대고 있다 [문서 N-3546529, 실측]. 이 때문에 V매트릭스 스탯 기여가 0이 되고, 스킬·특수 코어 이름은 "-"로 보인다(controller:860-927, 2695-2702, character.js:3469-3472).
4. **랭킹의 월드 필터가 동작하지 않는다.** 서버가 `world_name`을 검사만 하고 넥슨에 넘기지 않는다(controller:1256-1267). `world_name`을 넣으면 넥슨은 해당 월드 200행만 돌려준다 [실측].
5. **호출량이 많고, 캐시와 동시성 제한이 없다.**
   - 캐릭터 1회 조회에 22~39회가 나가고, 그중 19회는 동시에 나간다.
   - 랭킹 1페이지(50행)를 열면 행마다 썸네일용으로 `/id`(2회)와 `basic`(1회)을 불러 약 150~250회가 나간다.
   - 길드 페이지는 길드원 1명당 3회를 부른다 [코드].
   - 개발 단계 키라면 초당 5건·하루 1,000건 한도를 곧바로 넘는다 [문서 S4]. 키 종류는 확인하지 못했다.
6. **재시도가 공식 권고와 맞지 않는다.** 429는 백오프 없이 즉시 재시도하고, 5xx·점검 코드(00010, 00011)는 재시도하지 않는다. 오히려 재시도 금지 코드인 00004에 대해서는 재시도한다 [문서 S5, 코드].
7. **`ocid`를 그대로 쓰는 공개 패스스루 라우트가 인증·속도 제한 없이 열려 있다.** 제3자가 우리 키 할당량으로 넥슨 API를 다시 쓸 수 있는 구조다(약관 제5조 ⑤·⑧의 취지와 충돌 소지) [코드, 문서 S6].
8. **약관상 데이터 갱신·삭제 장치가 없다.** 넥슨 API 문서 페이지에 "크롤링한 데이터는 30일 이내 갱신 의무"가 고지되어 있다 [문서 S1]. 우리 쪽 `RequestLog`에는 TTL이 없고, 프리셋 폴백은 기간 제한 없이 과거 로그를 현재 값처럼 섞는다 [코드].

---

## 2. 엔드포인트 표

경로는 모두 `GET https://open.api.nexon.com/maplestorym/v1/...`이고 인증은 헤더 `x-nxopen-api-key`다 [문서 S1, S3]. "설명" 열은 카테고리별 스펙(S1-C·S1-U·S1-G·S1-R·S1-N, 2026-10-28 확인) 기준이고, [실측] 표시는 2026-10-28 호출 결과다. 캐릭터·유니온 API의 필수 파라미터는 `ocid` 하나, 랭킹은 `date`(필수)·`world_name`·`ocid`·`page`(선택), 공지 상세는 `notice_id`(필수)다.

| 공식 엔드포인트 | 설명 | 우리 사용 여부 | 우리 코드 위치 | 문제·비고 |
|---|---|---|---|---|
| `/id` | 캐릭터 식별자(ocid). 필수 `character_name`, `world_name`(한글 enum 8개: 아케인·크로아·엘리시움·루나·스카니아·유니온·제니스·챌린저스) [S1-C] | 사용 | service:6, 48-54 / controller:1303-1352 / routes:39 / 클라 ranking.js:252-273, ranking-shared.js:141-153 | 영문 월드명을 먼저 보내 `400 OPENAPI00004`를 받는다 [실측]. 조회마다 2회가 나가고 실패 로그가 쌓인다. ocid는 64자, API 키 조각은 없음 [실측] |
| `/character/basic` | 기본 정보 | 사용 | controller:23, 2899-2950 / routes:44 / ranking-shared.js:155-166 | 삭제 예정인 `character_job_name`을 사용(2931, 2949). 없는 필드 `character_icon`·`ranking`·`guild_name`을 참조(1428, 2934, 2940) |
| `/character/stat` | 스탯 | 사용 | controller:24, 463-505, 1029- | 없는 필드 `character_exp`·`character_level`·`ranking`으로 폴백(2903-2966) |
| `/character/hyper-stat` | 하이퍼 스탯 | 사용 | controller:25, 663-678, 2462-2508 | 스펙과 실응답이 일치 [실측] |
| `/character/guild` | 가입 길드명 | 사용 | controller:26, 1428 | 이상 없음 [실측] |
| `/character/item-equipment` | 장착 장비(프리셋 포함) | 사용 | controller:27, 603-641, 714-731, 2002-2261 | 제거 예정인 `item_option`을 사용(2078). `mastery_info`(2026-07-30)·`freestyle_coupon_flag`(2026-10-15)는 쓰지 않음. `emblem_level`이 실응답에서는 number(스펙은 string) |
| `/character/cashitem-equipment` | 장착 캐시(프리셋, 드레스업) | 사용 | controller:28, 2095-2261 | 모루 외형 아이콘보다 원본 아이콘을 우선(2098). `character_look_mode` 미사용. `cash_item_gender`가 실응답에서는 string(스펙은 number) |
| `/character/symbol` | 아케인·어센틱 심볼 | 사용 | controller:29, 697-712, 2611-2693 | 존재하지 않는 `arcane_force` 등 10여 개 키를 탐색해 늘 null(2617-2692) |
| `/character/set-effect` | 세트 효과 | 사용 | controller:30, 507-517, 2559-2563 | 이상 없음 [실측] |
| `/character/android-equipment` | 안드로이드·기계 심장(프리셋) | 사용 | controller:31, 733-783, 2331-2411 | 없는 필드 `heart_equipment.item_additional_potential_option`(778, 2356). 넥슨 쪽 불일치: 실응답은 `cash_item_gender`, 스펙은 `android_item_gender` [실측] |
| `/character/jewel` | 쥬얼 | 사용 | controller:32, 2413-2460 | 이상 없음 [실측] |
| `/character/beauty-equipment` | 헤어·성형·피부(2024-05-02 이후 데이터) | **호출만 함** | controller:33 | 화면·챗봇 모두 미사용. 조회마다 1회 낭비 [코드] |
| `/character/pet-equipment` | 펫·펫 세트 | 사용 | controller:34, 785-797, 2564-2575 | 없는 필드 `pet_auto_skill_option`(796, 2574) |
| `/character/skill-equipment` | 장착 스킬 | **호출, 사실상 미사용** | controller:35, 2761-2787 | `skill`은 객체인데 `toArray`로 배열 처리해 `skillSet`이 항상 빈 배열 [실측+코드]. 클라도 쓰지 않음 |
| `/character/link-skill` | 링크 스킬(프리셋) | 사용 | controller:36, 680-695, 2510-2554 | 넥슨 쪽 불일치: 실응답 키는 `use_prest_no`(오타), 스펙은 `use_preset_no` [실측]. 우리 코드는 두 키 모두 처리(686, 2512) |
| `/character/vmatrix` | V매트릭스(2026-07-09 이후 데이터) | 사용 | controller:37, 860-927, 2695-2702 / character.js:3432-3474 | 2026-09-17에 삭제된 `slot_id`·`slot_level`·`vcore_name`에 의존. 스탯 기여가 0이고 코어명은 "-". 미장착 코어도 표시. `vcore_skill_name4`·`vcore_score`·`vmatrix_total_score` 미사용 |
| `/character/hexamatrix-skill` | HEXA 스킬 | 사용 | controller:38, 2717-2733 | 없는 `skill_effect`·`skill_level`을 참조. `skill_description`·`skill_score`·`hexamatrix_total_score` 미사용 |
| `/character/hexamatrix-stat` | HEXA 스탯 | 사용 | controller:39, 643-661, 2735-2748 | 없는 `stat_info[].slot_level`을 참조(2742) |
| `/user/union` | 유니온 레벨·등급 | 사용 | service:7, 61-64 / controller:43, 799-805, 2581-2594 / routes:48 | 이상 없음 [실측] |
| `/user/union-raider` | 공격대원 효과 | 사용 | service:8, 66-69 / controller:44, 806-811, 2263-2329, 2582-2584 / routes:49 | 2026-10-15 삭제 필드 3개에 의존. 실응답에는 `use_union_raider_option`만 있음 [실측] |
| `/user/union-stat` | 유니온 스탯(2026-10-15 신규, 그 이후 데이터) | **미사용** | — | 주요 스탯(보스 공격력, 치명타 피해, 물리 공격력 %)을 담고 있어 우리 스탯 계산에서 빠짐 [실측] |
| `/guild/id` | 길드 식별자. 필수 `guild_name`, `world_name`(한글 enum) | 사용 | service:9, 71-77 / controller:1428-1477, 3510-3565 / routes:50 / ranking-shared.js:265-281, guild.js:93 | 한글 월드명을 보냄(정상). oguild_id는 64자, 키 조각 없음 [실측] |
| `/guild/basic` | 길드 기본·길드원·스킬·건물 | 사용 | service:10, 79-84 / controller:1479-1526, 814-849, 2809-2874, 3567-3614 / routes:51 | 넥슨 쪽 불일치: 실응답은 `guild_create_date`, 스펙은 `world_create_date` [실측]. 우리 코드는 둘 다 처리(2844, guild.js:140) |
| `/ranking/level` | 레벨 랭킹 | 사용 | service:11, 86-89 / controller:1726-1756, 3717-3719 / routes:65 | `world_name`을 넘기지 않음(1256-1267). 응답에 `guild_mark_icon` 있음(200/200) [실측] |
| `/ranking/dojang` | 무릉도장 랭킹 | **미사용** | — | 스펙과 실응답 일치 [실측] |
| `/ranking/root-of-time` | 시간의 근원 랭킹 | 사용 | service:16, 111-114 / controller:3742-3744 / routes:70 | `world_name` 미전달. `guild_name`이 null인 행 있음 [실측] |
| `/ranking/union` | 유니온 랭킹 | 사용 | service:12, 91-94 / controller:3721-3723 / routes:66 | `world_name` 미전달. `guild_name` null 있음 [실측] |
| `/ranking/combat-power` | 전투력 랭킹 | **미사용** | — | `guild_name` null 있음 [실측] |
| `/ranking/kerning-m-tower` | 커닝M타워 랭킹 | **미사용** | — | `guild_name` null 있음 [실측] |
| `/ranking/achievement` | 업적 랭킹 | 사용 | service:13, 96-99 / controller:3725-3727 / routes:67 | `world_name` 미전달 |
| `/ranking/sharenian-battlefield` | 샤레니안의 전장(길드) | 사용 | service:14, 101-104 / controller:3729-3736 / routes:68 | 2026-10-27은 빈 배열, 2026-10-25는 200행 [실측]. 매일 집계되지 않는 것으로 보임 [추정]. `season_score`가 실응답에서는 number(스펙은 string) |
| `/ranking/sharenian-waterway` | 샤레니안의 지하수로(길드) | 서버만, **UI 숨김** | service:15, 106-109 / controller:3738-3740 / common.js:373 | 2026-10-27 데이터 200행 정상 [실측]. `season_score`는 number |
| `/notice` | 공지 최근 20개 | **미사용** | — | [실측] |
| `/notice/detail` | 공지 상세(`notice_id`) | **미사용** | — | [실측] |
| `/notice-patch` | 패치노트 최근 20개 | **미사용** | — | [실측] |
| `/notice-patch/detail` | 패치노트 상세 | **미사용** | — | 호출하지 않음. shape는 스펙으로 생성 |
| `/notice-event` | 진행 중 이벤트 20개 | **미사용** | — | [실측] |
| `/notice-event/detail` | 이벤트 상세 | **미사용** | — | 호출하지 않음. shape는 스펙으로 생성 |

공지 API는 "실시간 조회 또는 최소 일배치"를 권장하고, 실시간이 아니면 이용자에게 홈페이지 공지를 확인하라고 안내해야 한다 [문서 S1-N].

---

## 3. 필드 변경·불일치 상세

### 3.1 최근 변경 이력 (2025-09 ~ 2026-10, 메이플스토리M)

10월 15일 이후로는 메이플스토리M 공지가 더 없다(2026-10-28 기준) [문서 공지 목록].

| 적용 일시 | 변경 내용 | 출처 | 우리 코드 반영 |
|---|---|---|---|
| 2026-10-15 10:00 | 신규 `user/union-stat`. `union-raider`에서 "적용 중인 전투 지도의 프리셋 번호, 적용 중인 점령 효과 정보, 프리셋 별 전투 지도 정보" 삭제. item/cash/android/beauty에 `freestyle_coupon_flag` 추가. 캐시 `character_look_mode` 설명 추가. 어센틱심볼 아르테리아. HEXA 어센트 스킬 추가, V코어 초기화로 비활성화된 HEXA 스킬이 활성으로 보이던 오류 수정 | N-3563720 | **미반영**(삭제 필드 계속 사용, union-stat 미사용) |
| 2026-10-01 11:00 | vmatrix 코어별 `vcore_score`, HEXA `skill_score` 추가 | N-3555906 | 미사용 |
| 2026-09-17 10:00 | vmatrix `vmatrix_total_score` 추가, **`slot_id`·`slot_level`·`vcore_name` 삭제**. HEXA `hexamatrix_total_score` 추가. 어센틱 오디움·도원경. union-raider 3개 필드를 null/[]로 응답(다음 업데이트 때 삭제 예고) | N-3546529 | **미반영**(삭제 필드 사용) |
| 2026-07-30 11:30 | **챌린저스 월드**(캐릭터·길드·랭킹), **신규 직업 렌**, item `mastery_info` | N-3512071 | 월드·직업은 반영(worlds.js:9, controller:199, common.js:466). 챌린저스 월드 아이콘 없음(common.js:374-389). `mastery_info` 미사용 |
| 2026-07-09 10:00 | vmatrix 사양 변경: `slot_id`·`slot_level`·`vcore_name`을 null로 응답. `vcore_skill_name4`, `vcore_expire_flag`, `vcore_expire_date`, `vcore_equipment_flag` 추가 | N-3496311 | 미반영 |
| 2026-07-07 | 그날 기준일 랭킹 전체 미조회 오류(13:45 수정) | N-3495100 | 해당 없음 |
| 2026-07-02 10:00 | `character_image`에 action·emotion·wmotion·width·height·x·y 쿼리 파라미터 지원 | N-3490631, S1-C | 미사용(선택) |
| 2026-07-02 13:24~13:53 | 던전앤파이터·사이퍼즈를 뺀 모든 게임 API 호출 장애 | N-3491126 | 장애 대응 로직 없음 |
| 2026-04-28 14:00 | 캐릭터 이미지 렌더링 위치 1px 하향 | N-3433876 | 영향 미미 |
| 2026-02-12 | 어센틱 아르크스 | N-3374338 | 해당 없음(문자열 파싱) |
| 2026-01-22 | 기본 옵션 전체 표기. 캐시 만료 기간 필드 모두 제공 | N-3354935 | 해당 없음 |
| 2025-12-18 | `item_basic_option` 도입(**`item_option` 대신 쓰라고 안내**). 모루 외형 필드. 아에르. **샤레니안 전장·지하수로 랭킹 신규** | N-3313614 | 스탯 계산은 `item_basic_option` 사용(725). 뷰는 아직 `item_option`(2078) |
| 2025-11-27 | item/cash/android 프리셋 추가, `union_grade_icon`, **랭킹 7종 신규**(level, dojang, root-of-time, union, combat-power, kerning-m-tower, achievement) | N-3274754 | 랭킹 3종 미사용 |
| 2025-10-30 | basic 경험치 % 추가, "캐릭터 직업 명 파라미터 정보 변경"(공지 문구. 현재 스펙은 `character_job_name` 삭제 예정, `character_class` 사용을 안내). hyper-stat·union·union-raider·guild/id·guild/basic 신규 | N-3202684, S1-C | `character_job_name` 계속 사용(§3.3) |

### 3.2 삭제된 필드를 아직 쓰는 곳 (영향 큼)

| 필드 | 삭제 시점 | 우리 코드 | 결과 |
|---|---|---|---|
| union-raider `use_preset_no`, `use_union_occupied_option`, `battle_map` (필드명은 우리 코드가 쓰던 키와 공지 문구를 대조한 것) | 2026-09-17 null/[], 2026-10-15 삭제 [N-3546529, N-3563720]. 2026-10-28 실응답에는 `use_union_raider_option`만 있음 [실측] | controller:806-808(점령 효과 스탯), 2263-2329(프리셋), 2583(활성 점령 효과) | 점령 효과 스탯이 0이 되고 전투 지도가 비어 보인다. `mergePresetResult`(1814-1875)가 MongoDB 과거 로그(최근 30건, 기간 제한 없음, 1767-1791)의 옛 전투 지도·활성 프리셋 번호를 현재 값처럼 섞어 보여줄 수 있다 [코드, 추정] |
| vmatrix `vcore_name`, `slot_level`, `slot_id` | 2026-07-09 null, 2026-09-17 삭제 [N-3496311, N-3546529, 실측] | controller:869-875(스탯 기여), 2696-2698(뷰) / character.js:3469-3472 | 쓸만한 컴뱃 오더스·샤프 아이즈·윈드 부스터·어드밴스드 블레스와 공격력 % 스킬 코어의 스탯 기여가 전혀 잡히지 않는다. 화면에는 스킬·특수 코어가 "- (Lv. N)"으로 나온다(서버가 빈 이름을 "-"로 채우고, 클라는 "-"가 truthy라 스킬명 폴백을 타지 않음) |

### 3.3 폐기 예정 필드를 쓰는 곳

| 필드 | 공식 안내 | 우리 코드 |
|---|---|---|
| basic `character_job_name` | "일정 기간 이후 삭제될 예정입니다. character_class 파라미터를 사용해주세요" [S1-C]. 실측에서는 아직 응답되며 `character_class`와 값이 같았음 [실측] | controller:2931(`profile.jobName`), 2949(직업 판정에서 우선 사용) / character.js:802, item-share.js:261 / chatbot_service/mongo_context.py:169 |
| item `item_option` | "향후 제거될 예정입니다. item_basic_option에 포함된 내용으로 사용해주세요" [S1-C, N-3313614] | controller:2078(`itemOptionText`, 클라에서는 쓰지 않음) |

### 3.4 스펙에도 실응답에도 없는 필드를 참조하는 곳 (늘 빈 값)

`basic.character_icon`(2934), `basic.ranking`·`stat.ranking`(2911, 2940), `basic.guild_name`(1428, 2935), `stat.character_exp`/`character_exp_rate`/`character_level`(2903-2904, 2966), `pet_auto_skill_option`(796, 2574), `heart_equipment.item_additional_potential_option`(778, 2356), 심볼 `arcane_force` 등(2617-2692), HEXA `skill_effect`·`skill_level`(2728, 2731), HEXA 스탯 `stat_info[].slot_level`(2742). 클라에도 `character_icon` 폴백이 있다(ranking-shared.js:164) [코드, 실측 키 목록과 대조].

### 3.5 새 필드 중 쓰지 않는 것 (선택 개선)

- `union-stat` 전체. 반드시 반영해야 한다.
- vmatrix `vmatrix_total_score`, `vcore_score`, `vcore_skill_name4`, `vcore_equipment_flag`, `vcore_expire_flag`/`vcore_expire_date`. 장착 여부 플래그는 계산 정확성에 필요하다.
- HEXA `hexamatrix_total_score`, `skill_score`, `skill_description`.
- item `mastery_info`, `freestyle_coupon_flag`, `item_combat_power`. 마지막 것은 뷰에 전달은 한다(2077).
- cash `character_look_mode`, `cash_item_option`, `date_expire`, `cash_item_coloring_prism`.
- basic `character_image`의 모션·표정 파라미터.
- 랭킹 3종(dojang, combat-power, kerning-m-tower), 공지 API 6종.

### 3.6 넥슨 스펙과 실응답의 불일치 [실측, 2026-10-28]

| 엔드포인트 | 스펙 | 실응답 | 우리 코드 영향 |
|---|---|---|---|
| link-skill | `use_preset_no` | `use_prest_no` | 두 키 모두 처리(686, 2512). 넥슨이 오타를 고치면 `use_preset_no`로 자동 전환됨 |
| guild/basic | `world_create_date` | `guild_create_date` | 두 키 모두 처리(2844, guild.js:140) |
| android cash item | `android_item_gender` | `cash_item_gender` | 쓰지 않음 |
| cashitem `cash_item_gender` | number | string | 쓰지 않음 |
| item `emblem_info.emblem_level` | string | number | 뷰에 원본 객체를 그대로 전달(2091) |
| skill `equipment_skill_set` | string | number | 쓰지 않음 |
| link-skill `skill_level` | string | number | `?? "-"`로 그대로 전달 |
| ranking sharenian 2종 `season_score` | string | number | 클라 `parseNumericValue`로 처리(ranking.js:130-137) |
| 랭킹 4종 `guild_name` | nullable 표기 없음 | null 있음 | 클라 `String(x \|\| "")`로 처리 |
| item·cash·beauty 다수 | nullable 표기 없음 | null 있음(`starforce_upgrade`, `soul_info`, `mastery_info`, 모루 필드, 엔젤릭버스터용 `additional_*` 등) | 대부분 `?.`/`\|\|`로 방어 |
| 스펙 문서 오류 | 랭킹 sharenian-battlefield의 `date` 파라미터 `in: queryWS`, guild/basic `world_name` 설명이 "길드 명", union `union_level` 설명이 "캐릭터 직업" | — | 영향 없음 |

AI 에이전트 가이드도 "nullable 표시가 없는 필드에도 null이 옵니다", "응답 스키마도 실제와 다를 수 있습니다"라고 적고 있다 [문서 S5].

### 3.7 응답 형태 스냅샷 (스키마 변경 감지용)

- 위치: `docs/research/api-shapes/`. 파일 39개 = 공식 엔드포인트 38개 + `error-response.json`. 경로의 `/maplestorym/v1/` 뒤를 `-`로 이은 이름을 쓴다. 예: `character-vmatrix.json`, `ranking-level.json`.
- 값은 지우고 자료형만 남겼다. `_meta.source`가 `live-response`이면 실응답 기반이고, `notice-patch-detail.json`·`notice-event-detail.json` 두 개만 `spec-only`다.
- 표기 규칙
  - 잎 노드는 JSON 자료형 이름이다.
  - `a|b`는 합집합, `absent`는 배열 항목 일부에 키가 없음을 뜻한다.
  - `[]`는 표본이 없는 빈 배열이다(예: 표본 캐릭터가 엔젤릭버스터가 아니라서 `additional_cash_item_equipment`가 빔).
  - `__also`는 객체·배열이 null일 수도 있음을 뜻한다.
- `ranking-sharenian-battlefield.json`은 2026-10-25 응답으로 만들었다. 2026-10-27 응답은 빈 배열이었다.
- 변경 감지 방법: 스펙 인덱스 `https://openapi.nexon.com/static/script/specification.json`에 메이플스토리M 스펙 파일 5개가 있고, 이 파일들은 게임 문서 페이지의 YAML과 바이트 단위로 같다(sha256 일치) [실측 S2]. 주기적으로 이 인덱스의 해시를 비교하고, 엔드포인트별 실응답 shape를 이 폴더와 비교하면 된다.

---

## 4. 데이터 기준 시점·호출 제한·오류 코드

### 4.1 데이터 기준 시점과 조회 범위 [문서 S1-C, S1-U, S1-G, S1-R]

| 구분 | 내용 |
|---|---|
| `date` 파라미터 | 메이플스토리M은 **랭킹 9종에만** 있다. 필수이고 "조회 기준일(KST)"이다. 캐릭터·유니온·길드·공지 API에는 `date`가 없어 늘 현재 상태만 준다. 과거 시점은 조회할 수 없다 [문서 S1, 실측: 스펙 파라미터 목록] |
| 캐릭터·유니온 반영 지연 | "게임 데이터는 평균 10분 후 확인 가능" |
| 길드 반영 지연 | "길드 데이터는 평균 15분 후 확인 가능" |
| 조회 가능 범위 | 캐릭터는 2022-01-01 이후 데이터(API마다 차이), 유니온 2025-10-30 이후, 헤어·성형·피부 2024-05-02 이후, V매트릭스 2026-07-09 이후, 유니온 스탯 2026-10-15 이후 |
| 업데이트 직후 | 신규 필드는 "업데이트 이후 게임에 접속한 캐릭터가 올바르게 응답"된다. 장착 이력이 없으면 펫 세트가 빠지는 사례도 있다 [N-3563720, N-3203789] |
| ocid | "게임 콘텐츠 변경으로 ocid가 변경될 수 있습니다". 우리 경험치 히스토리는 ocid로 조회하므로(controller:1585-1597) ocid가 바뀌면 히스토리가 끊긴다 [코드] |
| 랭킹 | 2025-11-27 데이터부터. 매일 02:30경 1일 1회 집계. 전체 월드 기준 1만 등까지. 최대 2년 전까지. 1페이지 200건. `world_name`과 `ocid`는 함께 쓸 수 없음 [문서 S1-R] |
| 랭킹 실측 | 페이지당 200행. `world_name=스카니아`면 200행 모두 스카니아이고 `ranking`은 전체 순위(5~538), `world_ranking`은 1~200. `ocid`와 `page=1`을 함께 보내도 200 응답이며 해당 캐릭터 1행이 온다. 그래서 controller:1260 주석("page를 거부할 수 있음")은 적어도 page=1에는 맞지 않는다. 샤레니안 전장은 10-27이 빈 배열, 10-25가 200행 [실측] |
| date 경계 동작 | 필수 date API는 오늘 날짜도 받지만 집계 이후에만 된다. 미래는 `400 OPENAPI00009`, 첫 날짜 이전은 00009 또는 00004 [문서 S5]. 미실측 |
| 우리 하한값 | `rankingDateFloor = "2025-12-01"`(controller:49, common.js:357). 공식 하한은 2025-11-27이고, 샤레니안 2종은 2025-12-18에 신설됨 [N-3313614] |
| 응답 헤더 | 호출 한도 관련 헤더가 없다. `cache-control: no-cache, no-store, max-age=0, must-revalidate`, CloudFront 경유(`x-cache: Miss from cloudfront`) [실측]. 응답 시간은 23~170ms(대부분 40~60ms) [실측] |

### 4.2 호출 제한 [문서 S4, S7, S8, N-2455713]

| 애플리케이션 타입 | 초당 최대 | 1일 최대 |
|---|---|---|
| 개발 단계 | 5건 | 1,000건 |
| 서비스 단계 | 500건 | 20,000,000건 |

- 허용량은 **애플리케이션 단위로 합산**된다(키 2개까지 발급 가능). 서비스 단계로 바꿀 때는 키를 새로 발급받아야 한다 [S4].
- 한도를 넘으면 API Key가 **일시 차단**되고 다음 주기에 자동 해제된다. 어뷰징 탐지·신고로 차단될 수도 있고, 차단된 키는 사용자가 직접 재발급할 수 없다 [S8, FAQ 2354132].
- 우리 키가 어느 타입인지는 확인하지 못했다(콘솔 로그인 필요, 응답 헤더에도 정보 없음).

### 4.3 오류 코드 [문서 S3, S9]와 재시도 권고 [문서 S5]

| 코드 | HTTP | 의미 | 공식 가이드의 재시도 | 우리 코드 |
|---|---|---|---|---|
| OPENAPI00001 | 500 | 서버 내부 오류 | 예(백오프) | 재시도 안 함 |
| OPENAPI00002 | 403 | 권한 없음 | 아니오 | — |
| OPENAPI00003 | 400 | 유효하지 않은 식별자 | 아니오 | — |
| OPENAPI00004 | 400 | 파라미터 누락·유효하지 않음. 없는 이름으로 조회해도 이 코드 | **아니오** | **월드명을 바꿔 재시도**(controller:1343) |
| OPENAPI00005 | 400 | 유효하지 않은 API KEY | 아니오 | — |
| OPENAPI00006 | 400 | 유효하지 않은 게임·경로(다른 게임 키 포함) | 아니오 | — |
| OPENAPI00007 | 429 | 호출량 초과 | 예(**백오프 필수**) | **즉시** 최대 2회 재시도(service:39). 백오프·지터·Retry-After 없음 |
| OPENAPI00009 | 400 | 데이터 준비 중(미래·범위 밖 date에도) | 예(1회) | 랭킹 화면에서 오늘→어제 폴백만 함(ranking.js:210-235) |
| OPENAPI00010 | 400 | 게임 점검 중 | 예 | 처리 없음. 영어 원문이 화면에 그대로 나갈 수 있음 |
| OPENAPI00011 | 503 | API 점검 중 | 예 | 처리 없음 |

에러 본문 형식은 `{"error":{"name":"OPENAPI00004","message":"Please input valid parameter"}}`다 [실측, `api-shapes/error-response.json`]. 클라이언트는 코드(`error.name`)가 아니라 **영어 메시지 문자열**을 매칭해 문구를 바꾼다(common.js:320-356, ranking-shared.js:111-125). 공식 가이드는 "공식 설명을 사용자 문구로 그대로 쓰지 말 것", "1단계(/id) 성공을 존재 확인으로 쓰지 말 것"을 권한다 [S5].

---

## 5. 약관상 주의점

이용약관은 2024-09-09 시행본이다 [S6]. 조항 번호는 약관 원문 기준이다.

| 조항·출처 | 원문 요지(인용) | 우리 서비스와의 관계 |
|---|---|---|
| 제6조 ④ [S6] + API 사용하기 「애플리케이션 제작하기」 [S3] | "결과 데이터에 회사가 별도로 정하는 방법에 따라 'NEXON Open API'를 이용한 것임을 명시해야 하며" / "서비스 및 애플리케이션에 'Data based on NEXON Open API'라는 문구를 명시해주시길 바랍니다." | **위반 상태.** `public/*.html`과 `public/js/**`에 표기가 전혀 없다. 공유 이미지(item-share.js, 프로필 카드)에도 없다 [코드] |
| 게임 문서 페이지 고지 [S1] | "고지: API를 통해 데이터를 크롤링한 경우 30일 이내에 크롤링한 데이터를 갱신해야 할 의무가 있습니다." (AI 가이드도 "응답을 저장하면 30일 이내에 다시 받아 갱신"이라고 함 [S5]) | `RequestLog`에 TTL이 없다(src/models/request-log.model.js). 원본 응답을 무기한 보관하고, 프리셋 폴백은 나이 제한 없이 과거 로그를 현재 값처럼 보여준다(controller:1767-1875). 경험치 히스토리(시계열)도 30일이 넘은 스냅샷을 쓴다. 시계열 보관을 "갱신 대상 크롤링 데이터"로 보는지는 문서에 없으니 넥슨에 확인이 필요하다 |
| 제5조 ⑤ [S6] | "사전 동의 없이 API 서비스의 결과 데이터를 본 약관에서 허용한 범위를 넘어서서 무단으로 복제, 저장, 가공, 배포하거나 프로그램 등을 통해 API 서비스를 다시 제 3자에게 제공하는 행위는 할 수 없습니다." | (1) `/api/maplestorym/character/*?ocid=`, `/guild/*`, `/ranking/*`, `/id`, `/character/all`이 넥슨 응답을 거의 그대로 돌려주는 공개 패스스루다. 인증·속도 제한·출처 확인이 없다(routes:39-74, controller:3435-3484, api.routes.js). "API 서비스를 다시 제3자에게 제공"으로 볼 소지가 있다. (2) MongoDB 저장과 성장 기록 가공은 서비스 기능 범위이지만, 30일 갱신 의무와 함께 범위를 관리해야 한다 |
| 제5조 ⑧ [S6] | "자동화 프로그램을 이용하여 접속하거나 … 주기적/지속적인 접속을 시도하여 과부하를 발생시키는 등의 방식으로 … 접근해서는 안 됩니다." | 랭킹·길드 화면의 썸네일 fan-out(행마다 2~3회)과 19개 동시 호출은 과부하·한도 초과 위험이 있다. 자체 랭킹용 일괄 수집을 만든다면 할당량과 속도를 명시적으로 제한해야 한다 |
| 제5조 ①② [S6] | API Key 제공·공개·공유 금지, 도용 방지 | 키는 서버 `.env`에만 있고 프런트로 나가지 않는다(env.js:26, service:27) [코드]. 다만 공개 프록시 때문에 키를 간접적으로 쓰게 하는 효과가 있다 |
| 제6조 ⑥ [S6] | "회사의 승낙 없이 영리 목적으로 이용하거나 … 제3자에게 이용하도록 할 수 없습니다." | 현재 `public/`에 광고·후원 코드는 없다 [코드]. 수익화할 때는 사전 승낙이 필요하다 |
| 제5조 ③ [S6] | 이용자에게 대가를 받을 때는 홈페이지 안내와 "게임 IP 사용 가이드" 준수 | 유료화 시 해당 |
| 제6조 ⑤ [S6] | 창작 콘텐츠 권리자는 결과 데이터 제외·비공개를 요청할 수 있다 | 특정 캐릭터 데이터를 지우는 절차가 없다(MongoDB에 이름·응답 원본 보관) |
| 제11조 ③ [S6] | "이용계약이 해지되거나 API 서비스가 중단된 경우 … 결과 데이터 일체를 삭제하여야 합니다." | 일괄 삭제 스크립트나 절차가 없다 |
| 제7조 ①, 제4조 ② [S6] | 서비스 범위·횟수 변경을 홈페이지에 공지 | 공지 확인 절차가 없다. §3.7의 감시 스크립트로 보완 가능 |
| AI 에이전트 가이드 [S5] (2026-10-22 추가, 약관은 아니지만 공식 권고) | "식별자는 비밀로 취급", "프론트엔드로 식별자를 내려 URL에 싣기 → 서버 안에서만 사용", 64자 식별자의 뒤 32자가 API Key 뒤 32자와 같았던 사례 | 우리는 ocid를 응답·URL로 노출한다(controller:2959, character.js:4556-4559, ranking.js:269-300). 실측 결과 우리 ocid·oguild_id에는 키 조각이 없었다(키 16자 창 비교) [실측]. 그래도 권고에 맞추려면 비노출이 바람직하다. 챗봇은 ocid를 외부 LLM(Vertex AI) 프롬프트에 넣는다(mongo_context.py:168) |
| 공지 API 정책 [S1-N] | 실시간 또는 최소 일배치, 아니면 홈페이지 공지 확인 안내 | 공지 기능을 추가할 때 지킬 것 |

참고로, 조사 중 다른 세션이 작업 트리에서 MongoDB Atlas 저장 용량 초과("space quota")를 전제로 로그 저장을 best-effort로 바꾸고 있었다(service:116-140, 미커밋). 원본 응답을 통째로 무기한 저장하는 방식이 용량 문제로도 이어지고 있다는 뜻이다 [코드, 추정].

---

## 6. 우리 코드의 버그·위험 (파일:줄 근거)

심각도: 상 = 잘못된 값 표시·약관 위반·할당량 위험, 중 = 비효율·잠재 장애, 하 = 정리 대상.

| # | 심각도 | 내용 | 근거 |
|---|---|---|---|
| B1 | 상 | 출처 표기 "Data based on NEXON Open API"가 없다 | `public/*.html`, `public/js/**` 전수 grep에서 0건 |
| B2 | 상 | `/id` 호출 시 영문 월드명을 먼저 보내 매번 400을 받은 뒤 한글로 재시도한다. 모든 캐릭터·랭킹 썸네일·길드원 썸네일 조회에서 `/id` 호출이 2배가 되고, `getCharacterId` 경로(shouldLog=true)는 실패 로그까지 MongoDB에 쓴다 | worlds.js:2-9(`nexon: "Scania"` 등), controller:1305(`[nexonWorldName, worldNameCanonical]`), 1329-1347. [실측] `world_name=Scania` → `400 OPENAPI00004 "Please input valid parameter"` |
| B3 | 상 | union-raider 삭제 필드에 의존한다. 점령 효과 스탯 0, 전투 지도 공백, 과거 MongoDB 로그의 전투 지도·활성 프리셋이 현재 값처럼 섞일 수 있다 | controller:806-808, 2265-2267, 2306, 2583, 1814-1875 + §3.2 |
| B4 | 상 | `user/union-stat`을 쓰지 않아 주요 스탯(보공·크뎀·물공%·물리 대미지 등)이 빠진다 | controller:42-45(목록에 없음). [실측] union-stat 응답에 해당 스탯 존재 |
| B5 | 상 | V매트릭스 계산·표시가 삭제 필드에 의존한다. 스탯 기여 0, 코어명 "-", 미장착 코어(실측 34개 중 4개가 `vcore_equipment_flag=0`)까지 표시, 4번째 스킬명 누락 | controller:869-875, 2695-2702 / character.js:3432-3474 |
| B6 | 상 | 랭킹 월드 필터가 넥슨에 전달되지 않는다. 클라는 `world_name`을 보내지만(ranking.js:196) 서버가 `params`에 넣지 않는다. 필터를 고쳐도 순위 표시는 `row.ranking`(전체 순위)을 쓰고 있어 `world_ranking`으로 바꿔야 한다 | controller:1188-1281(특히 1256-1267) / ranking.js:158, 311 |
| B7 | 상 | 캐시·동시성 제한이 없다. 캐릭터 1회에 19개를 동시에 호출(Promise.all)하고 429는 즉시 재시도한다(최악 57건 버스트). 응답 캐시가 없어 같은 캐릭터를 다시 열어도 전부 재호출한다 | controller:1358-1406, service:21-46 |
| B8 | 상 | 랭킹·길드 화면의 썸네일 fan-out. 랭킹 50행이면 행마다 `/id`(2회)+`basic`(1회)로 약 150회. 길드 마크가 응답에 없는 랭킹(union·achievement·root-of-time)은 길드마다 2회를 더해 최대 약 250회. 길드 페이지는 길드원마다 3회. 캐시는 페이지 메모리뿐이다 | ranking-shared.js:127-216, 217-251, 253-297, 344-376 / ranking.js:528-529 / guild.js:67 |
| B9 | 상 | 공개 패스스루 라우트에 인증·rate limit이 없다. 우리 키 할당량으로 누구나 넥슨 API를 쓸 수 있고, `/api/health/routes`가 전체 라우트 목록을 공개한다 | routes:39-74, controller:3435-3484, src/routes/api.routes.js:10-21, src/app.js(rate limit 미들웨어 없음) |
| B10 | 중 | 전체 랭킹 찾기가 서버(오늘부터 7일)와 클라(다시 7일)에서 중복된다. 1만 등 밖 캐릭터는 매 조회마다 최대 14회가 낭비된다(빈 결과가 200+빈 배열로 온다는 점은 문서 근거만 있고 미실측) | controller:1710-1756, 3161 / character.js:3968-3987, ranking-shared.js:299-342 |
| B11 | 중 | 쓰지 않는 호출이 2개 있다(`beauty-equipment`, `skill-equipment`). 후자는 `skill` 객체를 배열로 취급하는 버그도 있다 | controller:33, 35, 2765-2785 |
| B12 | 중 | 재시도 정책이 공식 권고와 어긋난다. 00004에 재시도, 5xx·00009·00010·00011은 재시도 없음, 백오프·지터 없음. 클라 오류 처리는 영어 메시지 매칭에 의존한다 | service:37-43, controller:1343, common.js:320-356 |
| B13 | 중 | page-data에서 넥슨 호출이 모두 성공해도 MongoDB 읽기(hasExpHistory, loadRecentPageDataDetailsByOcid)가 실패하면 전체가 500이 되고, 오류 endpoint가 `/id`로 잘못 기록된다(`getErrorInfo` 기본값). 커밋 `57cb54c`의 `saveRequestLog`는 예외를 전파해 패스스루 라우트도 500이 났다. 작업 트리에서 다른 세션이 수정 중이다 | controller:3159-3161, 3192-3214, 1283-1293 / service(커밋본) |
| B14 | 중 | 폐기 예정 필드 `character_job_name`(직업 판정 우선값), `item_option`을 사용한다 | controller:2931, 2949, 2078 / chatbot_service/mongo_context.py:169 |
| B15 | 중 | 저장 데이터 수명 관리가 없다. TTL이 없고, 프리셋 폴백은 나이 제한 없이 최근 30건을 쓰고, 화면에 출처 시각 경고도 없다. ocid 변경 시 히스토리가 끊긴다 | src/models/request-log.model.js, controller:1767-1791, 1585-1597 |
| B16 | 하 | 존재하지 않는 필드 참조(§3.4), 캐시 아이콘 우선순위(모루 외형 무시), HEXA `skill_description` 미전달 | §3.4, controller:2098, 2717-2733 |
| B17 | 하 | 랭킹 하한 2025-12-01이 공식 2025-11-27과 다르다. 미래 날짜·페이지 상한(1만 등 = 200건×50페이지)을 검증하지 않는다 | controller:49, 1203-1254 / common.js:357 / ranking.js:167-178 |
| B18 | 하 | 샤레니안: 전장 랭킹은 날짜에 따라 빈 배열이 오는데(10-27) 클라는 기본 날짜가 오늘이고 빈 결과를 "준비 중"으로 처리하지 않는다. 데이터가 있는 지하수로는 숨겨져 있다 | common.js:373, ranking.js:384-388, 148-150 / [실측] |
| B19 | 하 | 챌린저스 월드 아이콘이 없다(랭킹 행·월드 표시) | common.js:374-389, public/assets(이미지 없음) |
| B20 | 하 | controller:1260 주석("ocid 조회 때 page를 거부할 수 있음")이 실측과 다르다. 서버 1737-1741은 page=1과 함께 보내고 정상 동작한다 | [실측] ocid+page=1 → 200, 1행 |

### 6.1 화면별 넥슨 API 호출 수 [코드 + 실측 E1]

| 화면 | 단계 | 호출 수 |
|---|---|---|
| 캐릭터(page-data) | `/id` 영문 실패 + 한글 성공 | 2 |
| | 상세 17개 + union 2개 (동시) | 19 |
| | guild/id + guild/basic (길드 있을 때) | 0~2 |
| | 전체 랭킹 찾기 (오늘부터 최대 7일) | 1~7 |
| | **서버 소계** | **22~30** |
| | 클라 보정: 랭킹 못 찾으면 다시 7일 / 길드 마크 없으면 2 | 0~9 |
| | **합계** (1만 등 안 + 길드 있음이 보통 24) | **22~39** |
| 랭킹 1페이지(50행) | 랭킹 1 (+오늘 미집계 시 1) + 썸네일 50×3 + 길드 마크 0~50×2 | 약 151~252 |
| 길드 | guild/id + guild/basic + 길드원 N명 × 3 | 2 + 3N |

---

## 7. 권장 조치 (우선순위 순)

**P0. 바로 (약관·잘못된 값)**

1. **출처 표기 추가.** 모든 페이지 공통 푸터와 공유 이미지·프로필 카드에 `Data based on NEXON Open API`를 넣는다(B1).
2. **월드명 수정.** `worlds.js`의 `nexon` 값을 한글로 바꾸거나 `resolveOcid`가 한글 canonical만 보내게 한다. 영문 alias는 입력 정규화에만 쓰고, 00004 재시도는 없앤다. 이것만으로 `/id` 호출과 실패 로그가 절반으로 준다(B2).
3. **union-stat 연동과 union-raider 정리.** 삭제 필드 의존을 없애고, 유니온 탭의 전투 지도·점령 효과 UI를 유니온 스탯 프리셋으로 바꾼다. 주요 스탯 계산에 `use_union_stat`을 넣고, 유니온 프리셋의 MongoDB 폴백을 끄거나 2026-10-15 이전 로그를 제외한다(B3, B4).
4. **V매트릭스 수정.** 이름은 `vcore_skill_name1~4`로 만들고, `vcore_equipment_flag === "1"`인 코어만 계산·표시한다. 만료 코어를 처리하고 `slot_*` 의존을 없앤다. 슬롯 레벨이 사라졌으니 공격력 % 산식(controller:851-858)도 재검토한다. `vcore_score`·`vmatrix_total_score` 표시는 선택(B5).
5. **랭킹 월드 필터 수정.** 검증된 한글 `world_name`을 `params`에 넣고, 필터가 있을 때는 `world_ranking`을 표시하고 페이지 계산에도 쓴다(B6).

**P1. 다음 배포 (할당량·안정성)**

6. **서버 캐시.** 키는 (엔드포인트, 식별자, date). 캐릭터·길드는 5~10분(반영 지연이 평균 10~15분), 랭킹은 다음 02:30 KST까지, `/id`→ocid는 길게 두되 00003이 오면 무효화한다. 동시성은 토큰 버킷 등으로 허용량 아래로 묶는다(B7).
7. **썸네일 fan-out 줄이기.** 지연 로딩(뷰포트 진입 시), 서버 측 이름→이미지 캐시, 기본 이미지 유지를 적용한다. 레벨 랭킹처럼 응답에 `guild_mark_icon`이 있으면 쓰고, 없으면 길드 마크 조회를 생략하는 것도 고려한다(B8).
8. **재시도 정책 교체.** 429·5xx·00009(1회)·00010·00011만 지수 백오프와 지터로 재시도하고(Retry-After가 오면 존중), 00003·00004·00006은 재시도하지 않는다. 사용자 문구는 `error.name` 기준으로 매핑한다(B12).
9. **불필요한 호출 제거.** `beauty-equipment`, 쓰지 않는다면 `skill-equipment`(쓴다면 `skill` 객체 구조를 반영), 전체 랭킹 찾기의 서버·클라 중복(1회 + 캐시, 00009면 어제 1회만)을 정리한다(B10, B11).
10. **공개 라우트 보호.** 패스스루 라우트에 IP·세션 rate limit과 Origin 확인을 걸고, 응답에서 필요한 필드만 내려 준다. 넥슨 원본을 그대로 반환하는 `/character/all`·개별 패스스루는 내부용으로 돌린다. ocid는 서버 세션이나 서명 토큰으로 대체하는 것을 검토한다. `/api/health/routes`는 비공개로 한다(B9).
11. **장애 격리.** page-data에서 MongoDB 읽기 실패와 넥슨 응답을 분리하고 오류 endpoint를 정확히 기록한다(B13).

**P2. 정합성·유지보수**

12. **저장 정책.** 원본 응답 대신 필요한 요약값(레벨·경험치·날짜)만 장기 보관한다. 원본은 TTL(예: 30일)을 두고, 프리셋 폴백은 30일 이내·스키마 버전 일치 로그로 제한한다. 캐릭터별 삭제와 해지 시 전체 삭제 절차를 만든다. 30일 갱신 의무와 시계열 보관의 관계는 help_openapi@nexon.co.kr에 문의한다(B15, §5).
13. **폐기 예정·유령 필드 정리.** `character_job_name`은 `character_class`로(서버·클라·챗봇 모두), `item_option`은 `item_basic_option`으로 바꾸고, §3.4의 참조를 지운다. HEXA `skill_description`을 표시한다(B14, B16).
14. **스키마 감시 자동화.** 하루 한 번 `specification.json`과 스펙 YAML의 해시, 공지 목록(메이플스토리M headlineId 2772)을 확인한다. 필요하면 소수의 실응답 shape를 `docs/research/api-shapes`와 비교한다(§3.7).
15. **작은 수정.** 랭킹 하한(2025-11-27, 샤레니안은 2025-12-18), 미래 날짜·페이지 상한 검증, 챌린저스 아이콘, 샤레니안 전장 빈 결과 처리와 지하수로 노출 재검토(B17~B19), controller:1260 주석 정정(B20).
16. **신규 기능 후보.** 무릉도장·전투력·커닝M타워 랭킹, 공지·패치노트·이벤트(실시간 또는 일배치 + 홈페이지 안내 문구), 캐릭터 이미지 모션 파라미터.

---

## 8. 확인하지 못한 것

- **우리 API Key의 애플리케이션 타입**(개발/서비스)과 실제 일일 호출량, 429 발생 빈도. 넥슨 콘솔 로그인이 필요하고, 운영 DB 접근은 금지되어 로그를 분석하지 못했다. 응답 헤더에도 한도 정보가 없다 [실측].
- **랭킹 1만 등 밖 캐릭터의 ocid 랭킹 조회 응답.** 200+빈 배열일 것으로 보지만(AI 가이드 근거) 표본이 없어 실측하지 못했다.
- **샤레니안의 전장 랭킹 집계 주기.** 날짜 두 개(10-25 있음, 10-27 없음)만 확인했다.
- **미래 날짜, 첫 날짜 이전, 마지막 페이지를 넘긴 page의 실제 오류 코드.** AI 가이드 기준으로만 적었다.
- **`notice-patch/detail`, `notice-event/detail` 실응답.** 스펙으로 shape를 만들었다.
- **빈 배열이라 항목 형태를 못 본 필드.** 엔젤릭버스터 전용 `additional_*`, `steal_skill`, `stella_memorize`. 표본 캐릭터에 해당 데이터가 없었다.
- **union-raider에서 삭제된 필드의 정확한 키 이름.** 공지는 한국어 설명만 있어 우리 코드가 쓰던 키(`use_preset_no`, `use_union_occupied_option`, `battle_map`)와 대조해 추정했다. 현재 응답에 `use_union_raider_option`만 있다는 것은 실측했다.
- **영문 월드명 오류.** `Scania` 하나만 실측했다. 다른 영문명도 enum 밖이므로 같다고 추정한다.
- **"30일 이내 갱신 의무"의 정확한 범위**(시계열 기록 보관 허용 여부, 갱신의 의미)와 제5조 ③의 "홈페이지 내 안내된 내용"이 가리키는 문서. 공식 문서에 세부 내용이 없다.
- **2026-10-15 이후 변경.** 2026-10-28 기준 메이플스토리M 공지는 10-15가 마지막이다. 그 뒤에 예고된 변경은 찾지 못했다.
- **화면 동작 실검증.** 운영 화면을 직접 띄워 보지 않았다. V코어 "-" 표시, 유니온 탭 공백 등은 코드와 실응답 대조로 판단한 것이다.

---

## 출처 (모두 2026-10-28 확인)

- **S1** 메이플스토리M API 문서(게임 > 메이플스토리M, "30일 이내 갱신 의무" 고지 포함): https://openapi.nexon.com/ko/game/maplestorym/
  - **S1-C** 캐릭터 정보 조회 스펙: https://openapi.nexon.com/static/api/maplestorym/1_ko_script20261015010017.yaml
  - **S1-U** 유니온 정보 조회 스펙: https://openapi.nexon.com/static/api/maplestorym/56_ko_script20261015010045.yaml
  - **S1-G** 길드 정보 조회 스펙: https://openapi.nexon.com/static/api/maplestorym/57_ko_script20260730023028.yaml
  - **S1-R** 랭킹 정보 조회 스펙: https://openapi.nexon.com/static/api/maplestorym/58_ko_script20260730023037.yaml
  - **S1-N** 공지 정보 조회 스펙: https://openapi.nexon.com/static/api/maplestorym/28_ko_script20250414070823.yaml
- **S2** 스펙 인덱스: https://openapi.nexon.com/static/script/specification.json
- **S3** API 사용하기(오류 코드표, 출처 표기 문구): https://openapi.nexon.com/ko/guide/request-api/
- **S4** 사전 준비하기(애플리케이션 타입별 호출 허용량): https://openapi.nexon.com/ko/guide/prepare-in-advance/
- **S5** AI 에이전트 가이드(재시도·캐시·식별자 취급·30일 갱신): https://openapi.nexon.com/ko/guide/ai-agent/ (원문: https://openapi.nexon.com/ko/guide/ai-agent.md)
- **S6** 이용약관(2024-09-09 시행): https://openapi.nexon.com/ko/support/terms/
- **S7** FAQ – API 이용 제한: https://openapi.nexon.com/ko/support/faq/2354215/
- **S8** FAQ – API KEY 차단 사유: https://openapi.nexon.com/ko/support/faq/2354128/ (재발급 불가: https://openapi.nexon.com/ko/support/faq/2354132/)
- **S9** FAQ – 에러 코드: https://openapi.nexon.com/ko/support/faq/2354156/
- 공지(메이플스토리M 목록: https://openapi.nexon.com/ko/support/notice/ 의 "메이플스토리M" 탭)
  - **N-3563720** 2026-10-15 콘텐츠 업데이트: https://openapi.nexon.com/ko/support/notice/3563720/
  - **N-3555906** 2026-10-01: https://openapi.nexon.com/ko/support/notice/3555906/
  - **N-3546529** 2026-09-17: https://openapi.nexon.com/ko/support/notice/3546529/
  - **N-3512071** 2026-07-30(챌린저스·렌): https://openapi.nexon.com/ko/support/notice/3512071/
  - **N-3496311** 2026-07-09(V매트릭스 사양 변경): https://openapi.nexon.com/ko/support/notice/3496311/
  - **N-3495100** 2026-07-07 랭킹 오류: https://openapi.nexon.com/ko/support/notice/3495100/
  - **N-3490631** 2026-07-02 캐릭터 이미지 파라미터: https://openapi.nexon.com/ko/support/notice/3490631/
  - **N-3433876** 2026-04-28 이미지 렌더링 위치: https://openapi.nexon.com/ko/support/notice/3433876/
  - **N-3374338** 2026-02-12: https://openapi.nexon.com/ko/support/notice/3374338/
  - **N-3354935** 2026-01-22: https://openapi.nexon.com/ko/support/notice/3354935/
  - **N-3313614** 2025-12-18: https://openapi.nexon.com/ko/support/notice/3313614/
  - **N-3274754** 2025-11-27(랭킹 7종 신규): https://openapi.nexon.com/ko/support/notice/3274754/
  - **N-3203789** 2025-10-30 펫 세트·경험치 안내: https://openapi.nexon.com/ko/support/notice/3203789/
  - **N-3202684** 2025-10-30(유니온·길드 신규): https://openapi.nexon.com/ko/support/notice/3202684/
  - **N-3491126** 2026-07-02 전체 API 장애(공통): https://openapi.nexon.com/ko/support/notice/3491126/
  - **N-3568549** 2026-10-22 AI 에이전트 가이드 추가(공통): https://openapi.nexon.com/ko/support/notice/3568549/
  - **N-2455713** 서비스 단계 초당 허용량 100→500 상향(공통): https://openapi.nexon.com/ko/support/notice/2455713/
  - **N-2618488** 약관 변경(2024-09-09 시행, 공통): https://openapi.nexon.com/ko/support/notice/2618488/
- **실측 기록**: 2026-10-28 15:02~15:15 KST, GET 39회(HTTP 200 38회, 의도한 400 1회). 키 미출력, 원본은 scratchpad(`.../scratchpad/research-nexon-api/raw/`)에만 보관. 키 조각(16자 창) 검사 결과 `docs/research`와 scratchpad 모두 0건.
