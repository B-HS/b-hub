# 2026-09-07 전수 감사 3차 수정 배치 (서버리스 적합성 R 계열 + 공개 경로 rate limit)

> 기준: 2026-09-07, 브랜치 `fix/audit-batch3-serverless` @ 워킹트리 미커밋 변경(비교 기준 = 2차 배치 종료 커밋 `b79c300`). 발견 목록 정본: [../quality-assurance/2026-09-06-audit-findings.md](../quality-assurance/2026-09-06-audit-findings.md) · 합의·브랜치 운영: [../acknowledge/2026-09-06-consumer-repos-and-compat.md](../acknowledge/2026-09-06-consumer-repos-and-compat.md) · 소비자 계약: [../reference/consumer-contracts.md](../reference/consumer-contracts.md) · 진행 체크리스트: [../PROCESS.md](../PROCESS.md) · 1차 배치: [2026-09-06-audit-batch1.md](./2026-09-06-audit-batch1.md) · 2차 배치: [2026-09-07-audit-batch2.md](./2026-09-07-audit-batch2.md)

## 전제

- 2차 배치 브랜치 `fix/audit-batch2-immediate-errors` 에서 분기했다. dev 머지는 아직 하지 않았다(사용자 지시: 배치별 브랜치를 쌓는다).
- 이번 배치는 **R 계열(조건부 위험 = 서버리스 적합성)** 과, 2차에서 R-02 배선 대기로 미뤘던 **S-16·S-17**(공개 경로·발송 rate limit), 그리고 4차로 이월했던 **E-09**(raw `sql` 의 JS `Date` 파라미터)가 대상이다.
- 착수 전 결정은 acknowledge 의 "2026-09-07 3차 배치 착수 결정" 절이 정본이다. 요지: R-01 은 `@vercel/functions` 를 들이지 않고 **응답 전 `await`**, R-02 는 계약(헤더·429) 유지 + `unref` + 공유 스토어 주입, R-04 는 `connectionLimit` 20 유지, R-06 은 락 실패 시 409 대신 **0 결과 성공 응답**.
- 상태 코드 변경을 수반하는 신규 승인 항목은 없다. 새로 생기는 오류 응답은 기존 코드(`RATE_LIMIT_EXCEEDED`·`LOG_BATCH_TOO_LARGE`·`METRICS_*_TOO_LARGE`·`AI_ATTACHMENT_TOO_LARGE`·`CALENDAR_GROUP_NOT_FOUND`·`BLOG_POST_NOT_FOUND`·`FORBIDDEN`·`VALIDATION_ERROR`)를 재사용한다. `lib/error-code.ts`·`error-message.ts`·`error.ts` 3파일은 변경 없다.

## 진행 방식

| 단계 | 수행 | 결과 |
|------|------|------|
| g. 3차 수정 | 워크플로 다중 에이전트, 파일이 겹치지 않는 그룹 분할 | R-01~R-04 · R-06 · R-09~R-16 · R-18~R-21 · R-23~R-31 + S-16 · S-17 + E-09 구현 |
| g. 조정자 후속 | 최종 검증 지적 반영 + Redis 배선 | Discord 알림 fire-and-forget 원복, `service/shared/redis-client.ts` 신설, 공유 스토어 주입(acknowledge "3차 배치 조정자 후속 조치") |
| g. 독립 회귀 리뷰 | 리뷰어 7(1건은 권한 문제로 조정자 직접 검토) | 승인 밖 차이 3건 원복(아래 [회귀 리뷰 원복](#회귀-리뷰-원복-3건)) |
| g. 문서 갱신 | 이 문서 포함 | 아래 [문서 갱신](#문서-갱신) |

## 반영 범위

괄호는 발견 ID.

### 코어 런타임

| 영역 | 반영 |
|------|------|
| rate limit 코어 | `lib/rate-limit.ts` — `createRateLimiter(config, store?)` 로 공유 스토어를 선택 주입받고, cleanup `setInterval` 에 `unref()`. 스토어가 있으면 `checkLimit`/`reset` 이 Promise 를 돌려주고, 스토어 오류는 `captureException` 후 인메모리로 폴백한다. 결과 형태(`allowed`·`limit`·`remaining`·`resetAt`)와 429 계약은 그대로다(R-02) |
| rate limit 스토어 | `service/shared/rate-limit-store.ts` 신설 — `createRedisRateLimitStore({ url })`. `INCR` + `PEXPIRE` + `PTTL` 를 Lua 한 스크립트로 실행해 윈도 적용을 원자화한다(R-02) |
| Redis 클라이언트 | `service/shared/redis-client.ts` 신설 — 프로세스당 URL별 클라이언트 1개를 지연 생성(`lazyConnect`·`enableOfflineQueue: false`·connect timeout 3초·`maxRetriesPerRequest` 1). `ensureConnected()` 가 **첫 명령 전에 연결 완료를 기다린다**(offline queue 없이 첫 명령이 즉시 거부되던 결함 해소). 연결 후 장애는 즉시 실패 → 폴백, ioredis 가 백그라운드 재연결(조정자 후속 3) |
| Redis 캐시 | `service/shared/redis-cache.ts` — import 시 생성하던 클라이언트를 `getEnv().REDIS_URL` 기반 지연 조회로 바꾸고, 무제한 `Map` 로컬 캐시를 `createCache`(LRU 500 · TTL 30초)로 교체. 실패를 무음 삼키지 않고 `captureException`(R-03) |
| 배선 | `compose/index.ts` 가 `REDIS_URL` 이 있을 때만 스토어 1개를 만들어 `composeMail`·`composeAi` 에 주입(`ComposeMailArgs`·`ComposeAiArgs` 의 선택 필드 `rateLimitStore`). 공개 경로(badge·spotify playing) 리미터는 `route/index.ts` 의 인메모리 그대로다 |
| DB 풀 | `db/index.ts` — `process.env.DATABASE_URL` 직접 참조를 `getEnv().DATABASE_URL` 로 바꾸고 `maxIdle: 5`·`idleTimeout: 60초`·`enableKeepAlive`·`keepAliveInitialDelay: 10초` 추가. `connectionLimit` 은 처리량 변화를 피해 20 유지(R-04) |
| Sentry | `index.ts` 가 부트스트랩에서 `initSentry(getEnv().SENTRY_DSN)` 를 **최초로 호출**한다. 이전까지 `captureException` 은 no-op 이었다(R-21) |

### 공개 경로 rate limit (S-16·S-17)

| 경로 | 반영 |
|------|------|
| `GET /api/badge/image` | IP(`x-forwarded-for` 첫 값 → `x-real-ip` → `unknown`) 기준 분당 60회. `X-RateLimit-Limit`/`-Remaining`/`-Reset` 헤더를 200 PNG 응답에도 싣고, 초과 시 429 `RATE_LIMIT_EXCEEDED`. 추가로 `dto/badge.ts` 가 `width * height <= 2,000,000` 을 refine 해 초과 시 400(개별 상한 4096 은 유지) |
| `GET /api/spotify/playing/:token`·`/widget`·`/data` | `토큰:IP` 기준 분당 60회. 같은 3종 헤더 + 초과 시 429 |
| `POST /api/mail/messages/:id/reply`·`/forward` | 기존 `send` 와 **같은 리미터·같은 키**(`pathKey: 'mail:messages:send'`)를 적용. 분당 20회, `X-RateLimit-*` 헤더가 새로 붙고 초과 시 429 |

### 도메인별

| 영역 | 반영 |
|------|------|
| mail | 계정 단위 동기화 락 — `mail_accounts.lastSyncStatus='running'` + `lastSyncAt` 을 조건부 UPDATE 로 잡고(5분 stale 시 탈취 허용), 락 실패면 `{ added:0, updated:0, deleted:0, durationMs }` 로 즉시 성공 응답. `finally` 에서 해제(R-06) · incremental 폴더 동기화를 `Promise.all` → `Promise.allSettled` 로 바꿔 부분 성공을 집계한 뒤 첫 실패를 재던짐(R-06) · 헤더 유래 값 컬럼 길이 절단(`messageIdHeader`·`inReplyTo` 500, `remoteFolderId` 255, 첨부 `filename` 255·`mimeType` 100·`contentId` 255)(R-06) · 메시지 상세 조회의 읽음 처리는 **로컬 DB 갱신을 await**, 원격 provider 반영만 비동기(R-01) · `deleteMessages` 가 캐시된 첨부 R2 오브젝트를 선삭제한 뒤 행을 지운다(R-20) · FULLTEXT 프로브 실패 시 메모이즈를 되돌려 다음 요청에서 재시도(R-29) |
| ai | 메시지 정렬에 2차 키 `id` 추가(같은 `createdAt` 의 순서 뒤집힘 제거, R-18) · codex refresh 실패 중 OAuth `error` 가 `invalid_grant` 또는 `refresh_token*` 일 때만 `reauth_required` 로 표시하고 그 외 일시 장애는 `AI_TOKEN_REFRESH_FAILED`(502)로 통과(R-19) · 첨부 insert 실패 시 업로드한 R2 오브젝트를 정리, 삭제는 DB 행 → 스토리지 순서(R-20) · `POST /api/ai/attachments` 에 `bodyLimit`(20MB + 멀티파트 여유 1MB) → 초과 시 413 `AI_ATTACHMENT_TOO_LARGE`(R-23) · 사용량 로그(`logUsage`)를 응답 전 `await`(R-01) |
| logs | 오류 로그 캡처(`middleware/log-capture.ts`)를 응답 전 `await`(R-01) · Discord 알림은 **fire-and-forget 유지**(조정자 후속 1)하되 분당 20건 전역 예산·throttle 키 상한 500·`allowed_mentions: { parse: [] }`·3초 timeout·비2xx 시 throw(호출부가 `captureException` 으로 흡수)(R-11) · 신규 크론 `GET /api/logs/purge`(`verifyCronAuth`, 시크릿은 `UPLOAD_SERVER_SECRET` 폴백) + `vercel.json` crons `40 4 * * *`. 기존 admin `POST /api/logs/purge` 는 그대로(R-12) · 정책 삭제를 `LIMIT 1000` × 최대 50회 반복으로 바꾸고, `weather_api_log` 90일 · `mail_sync_logs` 90일 · 완료된 `mail_sync_sessions` 30일 보존 삭제를 추가(R-12) · `POST /api/logs`·`/api/logs/batch` 에 `bodyLimit` 1MB → 413 `LOG_BATCH_TOO_LARGE`(R-23) · 디바이스 키 `lastUsedAt` 갱신을 응답 전 `await`(R-01) |
| weather | KMA fetch 에 8초 `AbortSignal.timeout`, 4xx 는 재시도 없이 즉시 실패(502 `WEATHER_KMA_API_ERROR`), `resultCode='03'`(NO_DATA) 응답을 30초 negative cache, 같은 캐시 키의 동시 요청을 single-flight 로 합류(R-10) · weather key `lastUsedAt` 갱신과 요청 로그 기록을 응답 전 `await`(R-01) |
| metrics | 아카이브 실행당 최대 3일 · 200초 시간 예산으로 제한(R-09) · `POST /api/metrics/ingest` `bodyLimit` 128KB → 413 `METRICS_PAYLOAD_TOO_LARGE`, `/ingest/batch` 4MB → 413 `METRICS_BATCH_TOO_LARGE`. 두 응답 모두 `errorResponse` 봉투(R-23) |
| spotify | 429 재시도의 **대기 총합을 3초로 캡**하고 초과 시 `SPOTIFY_API_ERROR`(502). 이전에는 `Retry-After` 를 최대 60초까지 그대로 자던 경로가 최대 180초였다(R-30) · refresh 응답에 새 `refresh_token` 이 있으면 저장(R-31) · API 키 `lastUsedAt` 갱신을 응답 전 `await`(R-01) |
| calendar | `calendar_subscription.user_id` unique 추가(**`db:push` 필요**) + 구독 생성을 `onDuplicateKeyUpdate` upsert 로, 생성 직후 실제 행을 재조회해 반환(R-25) · 이벤트 생성·수정에서 남의(또는 없는) `groupId` 는 404 `CALENDAR_GROUP_NOT_FOUND`, `dtend < dtstart` 는 400 (`createEventSchema`·`updateEventSchema` 는 Zod refine, 대체 바디 경로는 라우트에서 `VALIDATION_ERROR`)(R-26) |
| blog | 댓글 생성 시 게시글이 없으면 404 `BLOG_POST_NOT_FOUND`, `posts.is_comment=false` 면 403 `FORBIDDEN`(R-16) |
| drive | `access_count` 를 `sql\`access_count + 1\`` 원자 증가(`touchAccess`)로 교체 — 읽고-쓰기 유실 제거(R-24) · 목록의 stale 업로드 필터를 raw `sql` 에서 drizzle 연산자(`or`·`notInArray`·`gte`)로 교체(**E-09 완료**) · 실물 삭제 실패를 `captureException` 으로 보고(행 삭제는 진행)(R-20) |
| upload-server | `gdrive-client.ts` 의 무한 `folderCache` 를 LRU 500(`createBoundedLruCache`)으로(R-32 부분) |
| font·shared | `@fontsource/inter`·`@fontsource/noto-sans-kr` 를 devDependencies → **dependencies** 로 이동, `font-loader` 의 파일 읽기 실패를 `captureException`(R-13) · `service/shared/storage.ts` 의 삼키던 예외 전부 `captureException` |
| admin·manage SSR | 토큰·키 발급 POST 5곳(admin metrics tokens, manage tokens·weather keys·spotify keys·spotify widget tokens)이 200 HTML 대신 **303 + 일회성 httpOnly 쿠키 `hub_reveal`**(Path=발급 경로, maxAge 60초, SameSite=Lax, 프로덕션 Secure)을 세우고, 다음 GET 이 쿠키를 읽어 1회 표시 후 삭제한다. 새로고침 재발급이 사라진다(R-14) · 어드민 로그아웃은 `GET /admin/login/logout`(기존 링크 유지)과 CSRF 폼용 `POST /admin/login/logout` 을 같은 핸들러로 병행(R-14 + 회귀 리뷰 원복) · 요청당 `getSession` 1회 — 세션을 요청 컨텍스트(`adminSession`)에 캐시하고 CSRF 가드가 먼저 채운다(R-15) · `page/admin/db.ts` 의 검색어 `q` 22곳에 `escapeLikePattern` 적용(`likeContains`)(R-28) · `/manage/mail/sync` 의 `batchSize` 를 DTO 상수(10..500, 기본 100)로 서버에서 클램프(R-27) |

## 회귀 리뷰 원복 3건

독립 회귀 리뷰(리뷰어 7 중 6 완료, mail-calendar-ai 는 권한 프롬프트 폭주로 조정자가 diff 직접 검토)에서 승인 목록 밖의 차이 3건을 HEAD 의미로 되돌렸다. 정본은 acknowledge 의 "2026-09-07 3차 배치 독립 회귀 리뷰 결과와 조치".

1. **`GET /admin/login/logout` 유지**(R-14) — 구현이 GET 을 세션 종료 없는 303 안내로 바꿔 기존 링크·북마크로 로그아웃이 되지 않았다. `signOut` + 302 를 GET 에 복원하고 POST 를 병행한다.
2. **`/api/logs/purge` 크론 라우트는 GET 전용**(R-12) — GET·POST 를 모두 받으면서 기존 admin POST 앞에 마운트돼 `Authorization` 헤더를 실은 POST 가 크론 분기로 흡수됐다. Vercel 크론은 GET 이므로 크론 서브라우트를 GET 으로 좁혔다.
3. **`/admin/*`·`/manage/*` 의 `app.use('*', guard)` 복원**(R-15) — 대시보드·오버뷰의 와일드카드 가드를 인라인 가드로 바꿔 미매칭 경로가 303/403 대신 404 가 됐다. `use('*')` 를 되돌렸고, 세션은 요청 컨텍스트 캐시 덕에 여전히 요청당 1회 조회다.

## 스킵 항목과 사유

| 항목 | 사유 |
|------|------|
| R-05 (크론 Bearer 시크릿 env 불일치) | 코드 변경이 아니라 **배포 env 확인 사항**으로 남긴다. `lib/cron-auth.ts` 는 주입된 시크릿과 비교하고, 크론 라우트는 `UPLOAD_SERVER_SECRET` 으로 폴백한다 |
| R-07 (Vercel 4.5MB 본문 한도 우회) | presigned/스트리밍 도입은 업로드 계약 변경이라 보류 |
| R-08 (`functions.maxDuration`) | 비용·타임아웃 정책 결정이 필요해 보류 |
| R-14 의 `/manage` 로그아웃 | 이번 범위에서 변경하지 않았다(어드민만 GET+POST 병행) |
| R-22 (`middleware/request-logger.ts` 장착) | 장착 시 모든 요청에 쓰기가 붙어 비용·지연 영향이 커 보류 |
| R-32 의 멀티파트 스트리밍 | upload-server 의 `formData` 전량 버퍼링 제거는 계약·메모리 프로파일 영향이 커 보류. folderCache LRU 만 반영 |
| E-13 | 2차와 동일 — `posts` 에 작성자 컬럼이 없어 `postsCount: 0` 리터럴 유지 |
| A-6~A-10 | d2 심층 검토 결과대로 미적용·조건부 보류 |
| P 계열 전체 | 4차(성능) 배치로 이월 |

## 검증

- `bunx tsc --noEmit` — **0 오류**.
- `bun test` — **3198 pass, 0 fail**(243 파일). 2차 배치 종료 시점 3010 pass 대비 +188.
- 변경 규모(`git diff b79c300 --stat` 실측): 수정 **115 파일**(+3,280 / −582). 내역은 소스 62 · 테스트 48 · 그 외 5(`bun.lock`·`package.json`·`vercel.json`·`docs/PROCESS.md`·`docs/acknowledge/2026-09-06-consumer-repos-and-compat.md`).
- 소스 62 파일 내역: `service/` 19 · `page/` 12 · `route/` 10 · `compose/` 9 · `dto/` 3 · `lib/` 3 · `db/` 2 · `middleware/` 2 · `deploy/` 1 · `index.ts` 1.
- 신규 파일 13: 소스 3(`route/logs/purge.ts`, `service/shared/rate-limit-store.ts`, `service/shared/redis-client.ts`) + 테스트 10(`tests/compose/ai.test.ts`, `tests/compose/logs.test.ts`, `tests/db/index.test.ts`, `tests/deploy/gdrive-client.test.ts`, `tests/lib/discord.test.ts`, `tests/page/admin/db-search.test.ts`, `tests/route/ai/attachment.test.ts`, `tests/route/logs/purge.test.ts`, `tests/service/shared/rate-limit-store.test.ts`, `tests/service/shared/redis-client.test.ts`).

## 소비자 영향

응답 표면이 바뀐 지점이다. 상세 대조는 [../reference/consumer-contracts.md](../reference/consumer-contracts.md).

| 변경 | 이전 → 이후 | 소비자 |
|------|-------------|--------|
| badge 이미지 | 상한 없음 → **IP 분당 60회 429** + `width*height > 2,000,000` 이면 400 + 200 응답에 `X-RateLimit-*` 헤더 | 계약 문서상 런타임 소비자 미확인. 800×250 기본값·일반 배지 크기는 상한에 걸리지 않는다 |
| spotify playing 3종 | 상한 없음 → **토큰+IP 분당 60회 429** + `X-RateLimit-*` 헤더 | 소비처 미확인. 위젯은 60초 이내 재요청이 60회를 넘지 않으면 무영향 |
| mail reply/forward | 상한 없음 → **분당 20회 429**(send 와 공유) + `X-RateLimit-*` 헤더 | mail 클라이언트는 `error.message` 만 toast. 사람이 치는 발송 빈도로는 도달하지 않는다 |
| mail 동기화 중복 호출 | 세션 정리 후 중복 실행 → **`{ added:0, updated:0, deleted:0, durationMs }` 성공 응답** | mail 클라이언트가 자동·수동 동기화를 겹쳐 호출해도 오류 toast 가 뜨지 않는다. 진행 중에는 `GET /api/mail/accounts` 의 `lastSyncStatus` 가 `'running'` 으로 보인다(클라이언트는 `'error'`·`'success'` 만 구분 → 중립 배지) |
| ai 첨부 업로드 | 본문 상한 없음 → **21MB 초과 시 413 `AI_ATTACHMENT_TOO_LARGE`** | 기존 서비스 단 20MB 검증과 같은 코드라 오류 처리 분기 불변 |
| logs 수집 | 본문 상한 없음 → **1MB 초과 시 413 `LOG_BATCH_TOO_LARGE`** | ESP32 배치(최대 50건)는 1MB 에 도달하지 않는다 |
| metrics 수집 | payload 필드만 검사 → **본문 128KB(단건)·4MB(배치) 초과 시 413** | dashboard·ESP32 payload 는 기존 64KB payload 상한 안이라 무영향 |
| calendar 이벤트 생성·수정 | 남의 groupId 는 무시되거나 저장 → **404 `CALENDAR_GROUP_NOT_FOUND`**, `dtend < dtstart` → **400** | Calendar 는 자기 그룹만 보내므로 무영향. 역전 날짜를 보내던 경로가 있으면 400 으로 드러난다 |
| blog 댓글 생성 | 게시글 없어도 200 → **404 `BLOG_POST_NOT_FOUND`**, 댓글 비허용 글이면 **403 `FORBIDDEN`** | bblog 는 존재하는 글에서만 폼을 노출한다 |
| weather KMA | 무한 대기·4xx 재시도 → **8초 timeout · 4xx 즉시 502 · NO_DATA 30초 캐시** | 응답 형식 불변. 장애 시 502 가 더 빨리 온다 |
| spotify 429 | 최대 180초 대기 → **총 3초 초과 시 502 `SPOTIFY_API_ERROR`** | 위젯이 오래 매달리는 대신 빨리 실패한다 |
| 토큰·키 발급 화면(`/admin`·`/manage`) | POST 응답에 값이 담긴 200 HTML → **303 + 다음 GET 에서 1회 표시** | 브라우저 전용. 새로고침 재발급이 사라지고 값 노출 창이 60초로 제한된다 |

## 배포 전 필수 조치

- **`bun run db:push` 대상이 2건**이다: 1차의 `mail_messages` unique 3열(`uq_mail_messages_account_remote`)과 이번 3차의 `calendar_subscription.user_id` unique(`uq_calendar_subscription_user`). push 전에는 구독 upsert 가 중복 행을 만들 수 있다 — push 전에 `calendar_subscription` 의 `user_id` 중복 행을 먼저 정리해야 unique 생성이 성공한다.
- `vercel.json` 의 크론이 **4개**가 됐다(`/api/logs/purge` 추가, `40 4 * * *`). 크론 인증은 `UPLOAD_SERVER_SECRET` 을 쓰므로 배포 env 에 설정돼 있어야 401 이 나지 않는다(R-05).
- `REDIS_URL` 이 설정된 배포에서만 rate limit 카운터가 인스턴스 간 공유된다. 미설정이면 기존 인메모리 동작 그대로다.
- `SENTRY_DSN` 이 설정돼 있으면 이번 배치부터 실제로 이벤트가 전송되고, 아웃바운드 fetch 에 `sentry-trace`/`baggage` 헤더가 붙는다.
- `@fontsource` 2종이 dependencies 로 이동해 프로덕션 badge·썸네일이 실제 폰트로 렌더된다(이전 프로덕션은 폰트 로드 실패 폴백이었을 수 있다).
- upload-server(`deploy/upload-server`)는 `gdrive-client.ts` 가 바뀌었으므로 **재빌드·재기동**이 필요하다.

## 운영상 인지 사항

acknowledge 의 "2026-09-07 3차 배치 독립 회귀 리뷰 결과와 조치" 말미 목록을 옮긴다.

- `POST /api/logs/purge` 의 등급별 삭제 건수는 `LIMIT 1000` × 50회 = 50,000 에서 캡된다(초과분은 다음 실행에서 이어 지운다). 보존 삭제(`weather_api_log`·`mail_sync_logs`·`mail_sync_sessions`)도 같은 반복 규칙이다.
- 동기화 진행 중에는 `mail_accounts.lastSyncStatus` 가 `'running'` 으로 조회된다.
- drive 자산 삭제가 실물 삭제 → 행 삭제 순서라, 행 삭제가 실패하는 드문 경우 실물만 사라진 행이 남을 수 있다(R-20 승인 방향).
- `REDIS_URL` 설정 배포에서 프로세스의 첫 Redis 연결이 실패하면 ioredis 가 `end` 상태가 되어 그 프로세스는 계속 인메모리로 동작한다(응답 불변, Sentry 기록).
- badge·spotify playing 의 새 429 는 계약 문서상 런타임 소비자가 없어 실영향이 확인되지 않았다.

## 문서 갱신

| 문서 | 반영 |
|------|------|
| [../domains/mail.md](../domains/mail.md) | 동기화 락(0 결과 응답·5분 stale)·allSettled·헤더 길이 절단, 상세 조회 읽음 처리 await, 첨부 R2 선삭제, FULLTEXT 프로브 재시도, reply/forward rate limit |
| [../domains/ai.md](../domains/ai.md) | 메시지 정렬 2차 키, reauth 판정 축소, 첨부 정리·삭제 순서, `bodyLimit` 413, 사용량 로그 await, rate limit 공유 스토어 |
| [../domains/calendar.md](../domains/calendar.md) | 구독 user unique·upsert, 이벤트 groupId 404·날짜 역전 400 |
| [../domains/drive.md](../domains/drive.md) | `access_count` 원자 증가, stale 필터 drizzle 연산자, 실물 삭제 실패 보고 |
| [../domains/weather.md](../domains/weather.md) | KMA timeout·4xx 즉시 실패·NO_DATA negative cache·single-flight, 키 사용 시각·요청 로그 await |
| [../domains/spotify.md](../domains/spotify.md) | playing 429·헤더, 재시도 대기 3초 캡, refresh_token 저장, 키 사용 시각 await |
| [../domains/logs.md](../domains/logs.md) · [../logging.md](../logging.md) | purge 크론 GET·보존 삭제·LIMIT 반복, Discord 예산·throttle·fire-and-forget, `bodyLimit` 413, 캡처 await |
| [../domains/badge.md](../domains/badge.md) | IP 429·픽셀 상한 400·헤더, `@fontsource` dependencies |
| [../domains/blog.md](../domains/blog.md) | 댓글 생성 404/403 |
| [../domains/metrics.md](../domains/metrics.md) | ingest `bodyLimit` 413 2종, 아카이브 3일·200초 예산 |
| [../admin-features.md](../admin-features.md) · [../manage-features.md](../manage-features.md) | 발급 PRG·`hub_reveal` 쿠키, 로그아웃 GET/POST, 요청당 세션 1회, LIKE 이스케이프, batchSize 클램프 |
| [../deploy.md](../deploy.md) | crons 4개, db:push 대상 2건, `REDIS_URL`·`SENTRY_DSN`·`UPLOAD_SERVER_SECRET` 역할 |
| [../architecture.md](../architecture.md) | 부트스트랩의 `initSentry`, rate limit 공유 스토어·Redis 클라이언트 지연 생성 |
| [../reference/api-endpoints.md](../reference/api-endpoints.md) | `GET /api/logs/purge` 신규, 413·429 경로, reply/forward 헤더, calendar 404/400, comments 404/403 |
| [../reference/env.md](../reference/env.md) | `REDIS_URL` 이 `getEnv()` 경유 + rate limit 공유, `SENTRY_DSN` 실사용, 크론 시크릿 |
| [../reference/lib-utilities.md](../reference/lib-utilities.md) | `rate-limit` 스토어 시그니처, `with-rate-limit` 비동기 허용, `discord` 예산, `cron-auth` 사용처 |
| [../reference/shared-services.md](../reference/shared-services.md) | `redis-client`·`rate-limit-store` 신규, `redis-cache` LRU, `font-loader`·`storage` 보고 |
| [../reference/db-schema.md](../reference/db-schema.md) | `calendar_subscription` user unique |
| [../reference/consumer-contracts.md](../reference/consumer-contracts.md) | mail sync 0 결과·reply/forward 429·ai 첨부 413·calendar 404/400·logs·metrics 413·badge/spotify 429 에 "3차 반영" 표기 |
| [../quality-assurance/2026-09-06-audit-findings.md](../quality-assurance/2026-09-06-audit-findings.md) | 3차 대상 행 완료/보류 표기(회귀 리뷰 원복 3건 포함) |
