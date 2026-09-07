# 2026-09-07 전수 감사 4차 수정 배치 (성능 P 계열 — 응답 바이트 불변 범위)

> 기준: 2026-09-07, 브랜치 `fix/audit-batch4-performance` @ 4차 배치 커밋(비교 기준 = 3차 배치 종료 커밋 `bab14e8`). 발견 목록 정본: [../quality-assurance/2026-09-06-audit-findings.md](../quality-assurance/2026-09-06-audit-findings.md) · 합의·브랜치 운영: [../acknowledge/2026-09-06-consumer-repos-and-compat.md](../acknowledge/2026-09-06-consumer-repos-and-compat.md) · 소비자 계약: [../reference/consumer-contracts.md](../reference/consumer-contracts.md) · 진행 체크리스트: [../PROCESS.md](../PROCESS.md) · 1차 배치: [2026-09-06-audit-batch1.md](./2026-09-06-audit-batch1.md) · 2차 배치: [2026-09-07-audit-batch2.md](./2026-09-07-audit-batch2.md) · 3차 배치: [2026-09-07-audit-batch3.md](./2026-09-07-audit-batch3.md)

## 전제

- 3차 배치 브랜치 `fix/audit-batch3-serverless` 에서 분기했다. dev 머지는 아직 하지 않았다(사용자 지시: 배치별 브랜치를 쌓는다).
- 이번 배치의 대상은 **P 계열(성능·최적화)** 중 **성공 응답이 바이트 단위로 동일한 항목**이다. 헤더 추가는 계약 대조에서 "호환" 으로 분류된 것(P-15·P-17 헤더, P-18 ICS ETag/304)만 허용했다.
- 착수 전 결정은 acknowledge 의 "2026-09-07 4차 배치 착수 결정" 절이 정본이다(그룹·반영·제외 표).
- 상태 코드가 바뀌는 항목은 없다. 새 에러 코드도 없어 `lib/error-code.ts`·`error-message.ts`·`error.ts` 3파일은 변경이 없다.
- 스키마는 인덱스만 바뀐다(컬럼·테이블 변경 없음). 다만 **`bun run db:push` 대상이 하나 더 늘어난다**(아래 [배포 전 필수 조치](#배포-전-필수-조치)).

## 진행 방식

| 단계 | 수행 | 결과 |
|------|------|------|
| h. 4차 수정 | 워크플로 다중 에이전트, 파일이 겹치지 않는 10그룹(blog·drive·ai·logs-metrics·admin·shared·mail·spotify-weather-badge·calendar·schema-index) | P-01·P-02·P-05~P-09·P-12~P-23 의 승인 범위 구현 |
| h. 독립 회귀 리뷰 | 리뷰어 7(bblog-resume·mail-calendar-ai·storage-upload·weather-spotify-metrics·admin-manage·core-runtime·cross-cutting) 전원 완료 | 미승인 차이 1건 보고 → 재검증에서 반박, **원복 없음**. 조정자 보강 3건만 반영 |
| h. 문서 갱신 | 이 문서 포함 | 아래 [이번 배치 문서 갱신](#이번-배치-문서-갱신) |

## 반영 범위

괄호는 발견 ID.

### 쿼리 병렬화 (P-01)

| 영역 | 반영 |
|------|------|
| blog | `compose/blog.ts` 의 게시글 목록·방명록 목록에서 count 쿼리와 목록 쿼리를 `Promise.all` 로 동시 실행 |
| drive | `compose/drive.ts` 자산 목록의 select/count 동시 실행 |
| ai | `compose/ai.ts` 의 `listSessions`·`listMessages` count/select 동시 실행 |
| logs·metrics | `compose/logs.ts` 의 로그 이벤트 목록, `compose/metrics.ts` 의 `listLogs`(Mongo `countDocuments` + `find`) 동시 실행 |
| admin | `page/admin/db.ts` 의 목록 조회 함수 전반이 `const [[{ c }], rows] = await Promise.all([...])` 형태로 바뀌고, 대시보드 `counts()` 의 카운트 17종을 한 번에 병렬 실행 |

### 스키마 인덱스 (P-02)

| 구분 | 내용 |
|------|------|
| 추가 8종 | `idx_posts_published_hide_created`(posts: isPublished·isHide·created_at) · `idx_comments_post_created` · `idx_messages_user_deleted_created` · `idx_log_events_created` · `idx_weather_api_log_created` · `idx_image_assets_created` · `idx_mail_sync_logs_account_created`(기존 단일 `idx_mail_sync_logs_account` 를 대체) · `idx_resumes_type_updated` |
| 제거 4종 | `idx_calendar_event_uid`(uid 단독), `idx_subscription_token`·`idx_subscription_ics_token`(각각 컬럼 unique 와 중복), `idx_subscription_user`(3차의 `uq_calendar_subscription_user` 와 같은 컬럼) |

### 도메인별

| 영역 | 반영 |
|------|------|
| blog | 태그 집계를 파생 테이블 JOIN 에서 **상관 서브쿼리**(`JSON_ARRAYAGG` + `COALESCE(..., JSON_ARRAY())`)로 교체 — 목록·상세 동일 표현 재사용(P-14) · 방명록 목록의 이미지 N+1 을 `messageImages.messageId` `inArray` 일괄 조회로 교체하고 `ORDER BY messageId, imageId` 로 이미지 순서를 고정(P-14) · 카테고리·태그 생성 후의 재select 제거(삽입 id + 입력값으로 동일 객체 반환)(P-14) · 게시글 수정·삭제의 존재 확인을 `getPostById`(태그 JOIN 포함)에서 `getPostIdById`(postId 단일 컬럼)로 교체(P-14) · 회귀 리뷰 권고로 댓글 목록에 `desc(commentId)`, 방명록 목록에 `desc(id)` 타이브레이크 추가 |
| drive | 폴더 삭제의 재귀 조회를 **레벨 단위 일괄 조회**(`getByParentIds`)로 바꿔 트리를 한 번에 수집하고, 하위 폴더의 자산도 `folderId` `inArray` 한 번으로 가져온다. 삭제 순서(자식 → 부모, 자산 실물 → 행)는 그대로다(P-19) |
| ai | 채팅 전송 준비의 독립 조회 4종(자격증명 resolve·프롬프트·최근 메시지·첨부 이미지)을 `Promise.allSettled` 로 동시 실행하고 첫 거부를 그대로 재던진다. 보완 완료 후 처리(첨부 연결·세션 최종 메시지 시각·연결 사용 시각)도 병렬(P-20) · 첨부 이미지의 R2 다운로드를 병렬화(P-20) · 재연결 시 credentials·status·displayName 을 UPDATE 3회 대신 `updateOnReconnect` 단일 UPDATE 로 병합(P-20) |
| metrics | 디바이스 upsert 를 건별 `updateOne` 반복에서 `bulkWrite` 1회로 교체(`buildDeviceUpsertOperations`, `$set`/`$setOnInsert` 규칙 동일)(P-21) |
| admin | 토글 6곳(`togglePostFlag`·`toggleCommentHide`·`toggleCategoryHide`·`toggleMailAccount`·`toggleSpotifyWidgetToken`·`toggleResumeVisibility`)이 select 후 값 반전 대신 `not(column)` 단일 UPDATE 로 바뀌었다. 대상 행이 없으면 이전에는 조기 반환, 지금은 0행 UPDATE 로 동일하게 아무 일도 일어나지 않는다(P-22) |
| shared | `lib/credential-crypto.ts` 의 복호화 경로에 salt→파생키 LRU 캐시(최대 500) — scrypt 재계산 회피, 암호화는 매번 새 salt 라 캐시하지 않는다(P-06) · `service/shared/api-token.ts`·`service/domain/metrics/token.ts` 의 `lastUsedAt` 을 **마지막 갱신 후 5분이 지난 경우에만** UPDATE(P-07) · `service/shared/cache.ts` 의 LRU 를 별도 `accessOrder` 배열(O(n) 탐색) 대신 `Map` 삽입 순서 재삽입(O(1))으로 교체(P-08) · `lib/external-api.ts` 와 `tests/lib/external-api.test.ts` 삭제(사용처 없음, P-23) · `compose/shared.ts` 의 gdrive access token 을 프로세스 내에서 **만료 60초 전까지 캐시**(P-05) |
| mail | Gmail access token 을 `account.accessTokenExpiresAt` 기준으로 **만료 5분 전 선제 갱신**하고, 선제 갱신 실패는 삼켜 기존 토큰으로 진행한다(401 후 갱신 경로는 그대로)(P-05) · 메시지 upsert 를 건별에서 **배치**로 교체 — identity `SELECT ... inArray` 1회 → 신규 INSERT → 재조회 → 기존 UPDATE, 첨부는 마지막에 `upsertAttachments` 한 번으로 반영. 다중행 `ON DUPLICATE KEY UPDATE` 는 미적용이며 10건마다 이벤트 루프를 양보하던 처리도 사라졌다(P-09) · 폴더 메시지 수·미읽음 수를 두 쿼리에서 `countsByFolder` 단일 쿼리(`COUNT(*)` + 조건 `SUM`)로 교체(P-12) · 원격 플래그 반영을 계정 단위로 묶어 **계정당 provider 연결 1회** 후 폴더를 순회하고, 폴더별 실패는 `captureException` 으로 기록한 뒤 계속 진행한다(P-13) |
| spotify | access token 을 만료 5분 전 선제 갱신(응답의 새 `refresh_token` 저장은 3차 반영 유지)(P-05) · 계정 조회를 `spotify_accounts` + `account` **단일 JOIN** 으로 바꾸고, 조회된 토큰을 짧은 수명(5초·최대 50건)으로 넘겨 직후의 토큰 조회 왕복을 줄였다(P-16) |
| weather | 키 검증에서 키 조회와 24시간 사용량 카운트를 **상관 서브쿼리 1회**로 합치고, 결과를 5초 수명으로 넘겨 직후 `checkRateLimit` 이 재조회하지 않게 했다(한도 판정 값은 동일)(P-17) · KMA 캐시 TTL 경계를 base time 산출 상수(`ncst` 40분·`fcst` 45분·`vilage` 10분)와 일치시켜 상수화(P-17) · `GET /api/weather/locations` 에 `ETag`·`Cache-Control: private, max-age=3600` 추가, `If-None-Match` 일치 시 304(P-17) · `weather_api_key.lastUsedAt` UPDATE 는 3차 결정대로 매 요청 유지 |
| badge·thumbnail | `GET /api/badge/image` 응답에 기존 `Cache-Control` 과 같은 값의 `CDN-Cache-Control` 추가, 폰트 로드와 아이콘 로드를 `Promise.all` 로 병렬(P-15) · OG 썸네일은 그리드 엘리먼트를 모듈 상수로 끌어올리고(요청마다 325개 노드 생성 제거), 렌더 결과를 LRU 20·TTL 1시간으로 캐시한다(키 = 제목·카테고리·첫 태그 해시, 폰트를 하나도 못 읽으면 캐시하지 않음)(P-15) |
| calendar | `GET /api/calendar/:icsToken` 에 본문 해시 기반 약한 ETag(`W/"<hash>"`) 추가 — 매 렌더가 달라지는 `DTSTAMP` 줄은 해시에서 제외하고, `If-None-Match` 일치 시 304(본문 없음). 200 응답의 본문·`Cache-Control` 은 불변(P-18) · CalDAV `calendar-multiget` 이 href 마다 조회하던 것을 uid `inArray` 일괄 조회로 교체(응답 순서는 요청 href 순서 그대로)(P-18) · uid 조회가 원본 uid 와 `@b-calendar` 접미 uid 를 `or()` 로 한 번에 조회(2회 → 1회)(P-18) · ICS 구독 `lastAccessedAt` 을 5분 경과 시에만 갱신(service 에서 판정)(P-07) |

## 회귀 리뷰 결과와 조정자 보강

리뷰어 7 전원 완료. 승인 밖 차이로 보고된 것은 1건이며 재검증에서 반박돼 **원복은 없다**. 정본은 acknowledge 의 "2026-09-07 4차 배치 독립 회귀 리뷰 결과와 조정자 후속 조치".

1. **Mongo 재연결 경합 보강** — cross-cutting 이 `GET /api/metrics/logs` 의 count/select 병렬화로 두 호출이 같은 stale 클라이언트에서 실패하면 `resetMongo` 가 두 번 불려 두 번째가 새 클라이언트를 닫을 수 있다고 지적했다. 승인 항목(P-01) 범위이고 실제 도달이 어렵다고 재검증됐으나 비용이 낮아, `db/mongo.ts` 의 `resetMongo(stale?)` 를 "넘긴 인스턴스가 현재 인스턴스일 때만 교체" 로 바꾸고 `compose/metrics.ts` 의 `runMongo` 가 자기가 쓴 인스턴스를 넘기도록 했다.
2. **동점 순서 타이브레이크** — P-02 인덱스가 적용되면 `comments`·`messages` 목록이 filesort 대신 인덱스 순 스캔이 되어 같은 초에 저장된 행의 상대 순서가 바뀔 수 있다. HEAD 도 동점 순서는 미정의였으므로 `compose/blog.ts` 의 두 목록에 `desc(commentId)`·`desc(id)` 를 추가해 결정적으로 고정했다(동점이 아닌 행의 순서는 불변).
3. **중복 인덱스 2건 추가 제거** — schema-index 그룹이 보고만 한 `idx_subscription_user`·`idx_mail_sync_logs_account` 를 조정자가 제거했다(각각 3차의 user unique, 새 복합 인덱스의 접두와 중복).

## 스킵 항목과 사유

| 항목 | 사유 |
|------|------|
| P-03 (sharp/satori/resvg 지연 import) | `bun build` 단일 번들 + Vercel 런타임에서만 검증 가능 — preview 배포 확인 후 별도 진행 |
| P-04 (better-auth `cookieCache`) | 승인 표 A-9 결정대로 미적용(`Set-Cookie` 표면 변경) |
| P-10 · P-11 (IMAP·Gmail 프로토콜 호출 축소) | 1차 데이터 손실 수정 직후라 사용자 결정 대기 |
| P-13 의 SMTP 전 IMAP 로그인 생략 | 자격 검증 경로가 바뀌어 미적용(계정당 연결 1회만 반영) |
| P-12 의 발신자 `GROUP BY` | 상위 N 의미가 달라져 미적용. `markAllRead` 는 이미 단일 UPDATE 라 변경 없음 |
| P-14 의 `description` 목록 제외 | 승인 표 A-10 미적용 추천대로 응답 필드 유지 |
| P-14 의 `getAll*` LIMIT | 응답 건수가 바뀌므로 미적용 |
| P-16 의 이미지 축소·3~5초 캐시 | SVG 바이트·now-playing 지연이 달라져 미적용 |
| P-17 의 Redis INCR | 일일 한도 의미가 달라져 미적용 |
| P-18 의 `timeRange` 적용 | CalDAV REPORT 결과가 달라져 미적용 — 범위는 계속 무시한다 |
| P-19 의 blob 컬럼 분리·breadcrumb 체인·`LIKE 'L1%'` | 각각 조회 형태·의미 변화가 있어 미적용(폴더 트리 일괄 조회만 반영) |
| P-20 의 `resolveClient` 재사용 | 라우트 범위를 넘는 캐싱이라 미적용 |
| P-21 의 `countDocuments` 캐시 | 일일 한도 정확성이 흔들려 미적용 |
| P-22 의 `getMessageLikes` LIMIT | 어드민 렌더 결과가 달라져 미적용 |

## 검증

- `bunx tsc --noEmit` — **0 오류**.
- `bun test` — **3427 pass, 0 fail**(253 파일). 3차 배치 종료 시점 3198 pass 대비 +229.
- 변경 규모(`git diff bab14e8 --stat -- . ':!docs'` 실측, 문서 제외): **73 파일**(+4,580 / −1,480). 내역은 소스 36 · 테스트 37(신규 11 · 삭제 2 포함). 문서 갱신분은 별도(이 문서 포함 28 파일).
- 소스 36 파일 내역: `service/` 17 · `compose/` 9 · `route/` 5 · `db/` 2 · `lib/` 2 · `page/` 1.
- 삭제 2 파일: `lib/external-api.ts` · `tests/lib/external-api.test.ts`(P-23).

## 소비자 영향

응답 표면이 바뀐 지점은 헤더 3곳뿐이다. 상세 대조는 [../reference/consumer-contracts.md](../reference/consumer-contracts.md).

| 변경 | 이전 → 이후 | 소비자 |
|------|-------------|--------|
| `GET /api/badge/image` | 헤더 추가 — 기존 `Cache-Control` 과 동일한 값의 **`CDN-Cache-Control`** | 본문(PNG)·기존 헤더 불변. CDN 만 추가로 읽는다 |
| `GET /api/weather/locations` | 헤더 없음 → **`ETag` + `Cache-Control: private, max-age=3600`**, `If-None-Match` 일치 시 **304**(본문 없음) | ESP32·대시보드가 조건부 요청을 보내지 않으면 200 본문이 그대로 온다 |
| `GET /api/calendar/:icsToken` | 헤더 없음 → **`ETag: W/"<hash>"`**, `If-None-Match` 일치 시 **304** | Apple·Google 캘린더 구독은 304 를 표준으로 처리한다. 200 본문·`Cache-Control` 불변 |
| 토큰·구독 사용 시각 표시 | 매 요청 갱신 → **5분 단위 갱신** | `api_token`·`metrics_token` 의 `lastUsedAt`, 캘린더 구독 `lastAccessedAt` 의 표시 정밀도가 최대 5분 늦다(어드민·`/manage` 화면) |
| 동점 정렬 순서 | 미정의 → **결정적** | 블로그 댓글·방명록에서 같은 초에 저장된 행의 상대 순서가 `commentId`·`id` 내림차순으로 고정된다. P-02 인덱스가 적용되면 정렬 계획이 바뀌므로 이 고정이 전제다 |
| OG 썸네일 | 매 요청 렌더 → **동일 키 1시간 캐시** | 제목·카테고리·첫 태그가 같으면 최대 1시간 같은 PNG 가 나간다(폰트 가용성은 키에 없다 — 아래 운영상 인지 사항) |

## 배포 전 필수 조치

- **`bun run db:push` 대상이 3건**이다.
  1. 1차 — `mail_messages` unique 3열(`uq_mail_messages_account_remote`, D-05)
  2. 3차 — `calendar_subscription.user_id` unique(`uq_calendar_subscription_user`, R-25). push 전에 `calendar_subscription` 의 `user_id` 중복 행을 먼저 정리해야 unique 생성이 성공한다
  3. 4차 — P-02 인덱스 **8종 추가 + 중복 4종 제거**(위 [스키마 인덱스](#스키마-인덱스-p-02) 표). push 전까지 인덱스는 DB 에 없고, 적용 후에는 목록 정렬 계획이 바뀐다(동점 순서는 위 타이브레이크로 고정돼 있다)
- 인덱스 추가는 대상 테이블(`posts`·`comments`·`messages`·`log_events`·`weather_api_log`·`image_assets`·`mail_sync_logs`·`resumes`)에 락·쓰기 지연을 만들 수 있으므로 트래픽이 적은 시간대에 적용한다.
- 코드 배포와 `db:push` 순서는 무관하다(인덱스 유무와 무관하게 동작한다). 다만 인덱스 적용 전에는 P-02 의 성능 효과가 없다.
- `deploy/` 하위 Docker 서비스(caldav-proxy·upload-server)는 이번 배치에서 변경이 없어 재빌드가 필요 없다.

## 운영상 인지 사항

acknowledge 의 "2026-09-07 4차 배치 독립 회귀 리뷰 결과와 조정자 후속 조치" 말미 목록을 옮긴다.

- 썸네일 렌더 캐시의 키에 **폰트 가용성이 없다** — 두 웨이트 중 하나만 로드된 렌더가 최대 1시간 캐시될 수 있다(전량 실패 시엔 캐시하지 않는다).
- `api_token`·`metrics_token` 의 `lastUsedAt`, 캘린더 구독 `lastAccessedAt` 은 5분 단위로만 갱신된다.
- mail 메시지 upsert 가 배치로 바뀌었고 원격 플래그 반영은 계정당 연결 1회다. `added`/`updated` 집계·identityScope·`moveMessages` 규칙은 그대로다.
- Gmail·Spotify access token 은 만료 5분 전이면 선제 갱신하며, 선제 갱신 실패는 삼키고 기존 401 후 갱신 경로로 떨어진다(최종 오류 매핑 동일). gdrive access token 은 프로세스 내에서 만료 60초 전까지 캐시된다.
- P-03(지연 import)은 preview 배포 검증 전이라 미적용, P-10·P-11 은 사용자 결정 대기다.

## 이번 배치 문서 갱신

이 문서 외의 항목은 배치 문서 갱신 워크플로의 다른 작성자가 담당하는 **예상 목록**이다(트리거 표: [../guidelines/docs-maintenance.md](../guidelines/docs-maintenance.md)).

| 문서 | 반영 |
|------|------|
| [../domains/blog.md](../domains/blog.md) | 태그 상관 서브쿼리, 방명록 이미지 일괄 조회·이미지 순서, 카테고리·태그 생성 재select 제거, 존재 확인 경량 쿼리, 댓글·방명록 타이브레이크 |
| [../domains/mail.md](../domains/mail.md) | 배치 upsert 흐름, 첨부 일괄 upsert, 폴더 카운트 단일 쿼리, 계정당 provider 1회 연결, Gmail 토큰 선제 갱신 |
| [../domains/calendar.md](../domains/calendar.md) | ICS ETag·304, multiget 일괄 조회, uid `or()` 단일 조회, 구독 `lastAccessedAt` 5분 |
| [../domains/drive.md](../domains/drive.md) | 폴더 삭제의 트리 일괄 조회·자산 일괄 조회 |
| [../domains/ai.md](../domains/ai.md) | 전송 준비 병렬화, 첨부 R2 병렬 다운로드, 재연결 단일 UPDATE |
| [../domains/spotify.md](../domains/spotify.md) | 계정+토큰 JOIN 1회, 만료 5분 전 선제 갱신 |
| [../domains/weather.md](../domains/weather.md) | 키 검증 단일 쿼리·사용량 전달, KMA TTL 경계 상수, `/locations` ETag·304 |
| [../domains/badge.md](../domains/badge.md) | `CDN-Cache-Control`, 폰트·아이콘 병렬 로드, 썸네일 렌더 캐시·그리드 상수화 |
| [../domains/metrics.md](../domains/metrics.md) | 디바이스 upsert `bulkWrite`, 로그 목록 count/select 병렬, `resetMongo(stale)` |
| [../domains/logs.md](../domains/logs.md) | 로그 이벤트 목록 count/select 병렬 |
| [../admin-features.md](../admin-features.md) | 목록·대시보드 카운트 병렬, 토글 단일 UPDATE |
| [../reference/db-schema.md](../reference/db-schema.md) | 인덱스 8종 추가·중복 4종 제거, `db:push` 대기 3건 |
| [../reference/api-endpoints.md](../reference/api-endpoints.md) | badge `CDN-Cache-Control`, `/api/weather/locations` 304, ICS 304 |
| [../reference/consumer-contracts.md](../reference/consumer-contracts.md) | 헤더 추가 3곳에 "4차 반영" 표기 |
| [../reference/lib-utilities.md](../reference/lib-utilities.md) | `external-api.ts` 삭제, `credential-crypto` 파생키 캐시 |
| [../reference/shared-services.md](../reference/shared-services.md) | `cache.ts` LRU O(1), `api-token` `lastUsedAt` 5분 |
| [../deploy.md](../deploy.md) | `db:push` 대기 3건(인덱스 포함)과 적용 주의 |
| [../testing.md](../testing.md) | 스위트 규모(3427 pass / 253 파일) |
| [../quality-assurance/2026-09-06-audit-findings.md](../quality-assurance/2026-09-06-audit-findings.md) | P 행의 완료/부분/보류 표기와 배치 표기 규칙에 4차 추가 |
| [./index.md](./index.md) | 4차 배치 1행 추가 |
