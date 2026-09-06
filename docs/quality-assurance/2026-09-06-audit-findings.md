# 2026-09-06 전수 감사 발견 목록 (정본)

> 기준: `dev` @ `6e6fed2`. 7개 도메인 감사 에이전트 + 코어(index/compose/middleware/lib) 직접 검토. 줄번호는 이 커밋 기준이며 수정이 진행되면 어긋날 수 있다.
> 전제: 요청/응답 계약 불변, 소비자 동작 100% 보장. 합의: [../acknowledge/2026-09-06-consumer-repos-and-compat.md](../acknowledge/2026-09-06-consumer-repos-and-compat.md). 진행 상태: [../PROCESS.md](../PROCESS.md).
> 베이스라인: `bunx tsc --noEmit` 통과. `bun test` 2626 중 1 실패(`tests/route/index.test.ts`, `DATABASE_URL` 미설정 환경에서 `route/index.ts:101` 의 `getEnv()` 의존).

ID 규칙: D=데이터 손실·손상, S=보안, E=즉시 500·잘못된 값, R=조건부 위험, P=성능. 각 항목의 `계약` 열은 d 단계(계약 대조)에서 채운다: 불변 / 코드변경 승인 / 소비자 동시 수정.

> **진행 표기(2026-09-06 1차 배치)**: `계약` 열의 **완료(1차)** 는 1차 수정 배치(+후속·회귀 리뷰 반영)에서 코드에 반영된 항목이다. **부분(1차)** 은 수정 방향의 일부만 반영된 항목이며 남은 범위를 괄호에 적었다. 표기 없는 행은 미착수(2차 이후)다. 배치 요약·검증 결과는 [../history/2026-09-06-audit-batch1.md](../history/2026-09-06-audit-batch1.md). **`mail_messages` unique 변경(D-05)은 `bun run db:push` 전까지 DB 에 반영되지 않는다.**

## D. 데이터 손실·손상

| ID | 위치 | 문제 | 수정 방향 | 계약 |
|----|------|------|-----------|------|
| D-01 | route/drive/lifecycle.ts:15,24,33 | POST 전용. Vercel Cron 은 GET 이라 매일 404, 크론 미실행 | `route.on(['GET','POST'])`. 단 D-02·D-03 먼저 | 완료(1차) |
| D-02 | compose/drive.ts:253-258 | `and()` 안 raw sql OR 괄호 누락 → `lastViewedAt IS NULL` 전부 stale 선택 | `or(lt(), isNull())` | 완료(1차) |
| D-03 | storage-lifecycle.ts:56-69, compose/drive.ts:249-261 | NULL 을 30일 미접근으로 간주 + L3 사본 미확인 → 유일 사본 삭제 | `COALESCE(last_viewed_at, created_at)` + `gdrive_file_id IS NOT NULL` | 완료(1차) |
| D-04 | storage-lifecycle.ts:79-101, compose/drive.ts:272-279 | 승격 조건 accessCount>=5 리셋 없음 → evict/promote 매일 반복 | `last_viewed_at >= cutoff` 조건 또는 카운터 리셋 | 완료(1차) |
| D-05 | db/schema.ts:465, compose/mail.ts:218-262 | unique(accountId, remoteMessageId) 인데 IMAP UID 는 폴더별 → 폴더 간 덮어씀 | unique 에 folderId 포함, upsert/삭제 folderId 스코프 | 완료(1차) — `db:push` 필요 |
| D-06 | compose/mail.ts:263-268, gmail-provider.ts:257-263, mail-sync.ts:232-234 | 라벨 하나 제거 시 로컬 행 통째 삭제 + 폴더 병렬 경합 | 삭제 folderId 스코프, upsert 시 folderId 갱신 | 완료(1차) |
| D-07 | imap-provider.ts:440-453, mail-message.ts:271-306 | mailbox 미선택 move/flags/delete → imapflow 조용히 false, catch {} 은닉 | (계정,폴더) 단위 lock 후 실행, uidMap 갱신, 에러 기록 | 완료(1차) |
| D-08 | gmail-provider.ts:291 | historyId 를 목록과 동시에 → 틈새 메시지 영구 누락 | `/profile` 먼저 | 완료(1차) |
| D-09 | imap-provider.ts:190-201,297 | 증분 100건 초과 시 오래된 쪽 영구 누락, `N:*` 최신 1건 재수신 | 오름차순 batchSize + `uid > lastUid` | 완료(1차) |
| D-10 | mail-sync.ts:204-223 | 커서 있으면 fetchFolders 생략 → 새 폴더/라벨 영구 미반영 | incremental 에서도 폴더 목록 upsert | 완료(1차) |
| D-11 | mail-draft.ts:68-77, mail-sync.ts:229 | `__local_drafts__` 폴더가 sync 대상 → 계정 sync 전부 실패 | `__local_` 접두 폴더 제외 | 완료(1차) |
| D-12 | lib/ics-parser.ts:127-156 | VALARM/RECURRENCE-ID 미처리 → 설명·시작일 덮어씀 | VALARM 구간 무시, RECURRENCE-ID VEVENT 스킵 | 완료(1차) |
| D-13 | lib/ics-parser.ts:19-42 | TZID 무시, 서버 로컬 Date, `Z` 는 진짜 UTC → 9시간 어긋남 | 사용자 TZ 벽시계로 변환 | 완료(1차) |
| D-14 | lib/ics.ts:97-109, caldav.ts:295-297 | VTIMEZONE 오프셋 전부 +0000 | 실제 오프셋 산출 또는 VTIMEZONE 생략 | 완료(1차) |
| D-15 | route/calendar/caldav.ts:319-388, calendar.ts:314 | PUT 에서 exdate 미전달 → 단일 발생 삭제 무시 | `exdate: parsed.exdate` | 완료(1차) |
| D-16 | route/calendar/caldav.ts:118 vs 146,177,192,206 | PROPFIND/REPORT href 불일치 → 유령·중복·무한 재동기화 | href 생성 단일화 | 완료(1차) |
| D-17 | lib/ics.ts:54-57, ics-parser.ts:65-67 | BYDAY ordinal → RRule throw → events API 사용자 전체 500 | RRule 파서 사용 + DTO 검증 | 완료(1차) |
| D-18 | compose/metrics.ts:133, log.ts:112-121 | archive 재실행 같은 R2 키 덮어씀 → 부분 삭제 시 유실 | 키에 runId 또는 IfNoneMatch 후 merge | 완료(1차) |
| D-19 | page/admin/db.ts:1070,490,811 | 어드민 삭제 3종 스토리지 미삭제 → 고아 오브젝트 | 서비스 경로(스토리지 삭제 포함) 호출 | 완료(1차) |
| D-20 | compose/blog.ts:349-371 | 메시지 INSERT 2개 비트랜잭션, imageIds 미검증 → 고아 메시지 | `db.transaction`, `z.uuid()` | 완료(1차) |
| D-21 | calendar.ts:341-349 | tombstone→delete→ctag 비원자적 | compose 트랜잭션 메서드 | 완료(1차) |
| D-22 | ai-chat.ts:114-132 | user/assistant 메시지 insert 비트랜잭션 | `insertMessagePair` 트랜잭션 | 완료(1차) |

## S. 보안

| ID | 위치 | 문제 | 수정 방향 | 계약 |
|----|------|------|-----------|------|
| S-01 | deploy/upload-server/upload-handler.ts:73-77,133-138, index.ts:108-133 | 무인증 /upload, hub 검증 무시, 클라이언트 s3Key 로 R2 덮어쓰기 | hub 검증 200 확인 후 쓰기, s3Key 는 hub 반환값 | 부분(1차) — status 게이트 + s3Key 대조까지 |
| S-02 | deploy/upload-server/blog-image-handler.ts:46-50, index.ts:92-100 | assetId 경로 탈출 | `^[A-Za-z0-9_-]+$` 검증 | 완료(1차) |
| S-03 | page/admin/csrf.ts:29-30 | secret 없으면 CSRF 검사 생략(fail-open) | 라우트 생성 시 throw 또는 403 | 완료(1차) |
| S-04 | page/admin/csrf.ts:17-18 | 멀티바이트 토큰 → timingSafeEqual 길이 오류 500 | 바이트 길이 비교 또는 hex 정규식 선검사 | 완료(1차) |
| S-05 | route/drive/asset.ts:19-23 | UPLOAD_SERVER_SECRET 미설정 시 통과 → gdrive-token 획득 가능 | SERVICE_NOT_CONFIGURED 차단 | 완료(1차) |
| S-06 | compose/blog.ts:493, lib/env.ts:41 | HMAC 키 '' → 이미지 complete 토큰 위조 | fail-closed | 완료(1차) |
| S-07 | lib/cron-auth.ts:8, drive-asset.ts:341,349,368, route/drive/asset.ts:22 | 시크릿 `!==` 비교 | sha256 후 timingSafeEqual | 완료(1차) |
| S-08 | device-key.ts:39-48, route/logs/log-event.ts:46-74, require-device-key.ts:20 | 디바이스 한도가 본문 deviceId 로 집계 → 우회 | 컨텍스트 deviceId 강제 | 완료(1차) |
| S-09 | db/schema.ts:355, require-weather-key.ts:35-44, weather-api-key.ts:64-78 | endpoint varchar(50) 초과 시 insert 실패 → dailyLimit 미차감 | slice 또는 컬럼 확장 | 완료(1차) |
| S-10 | page/admin/users.tsx:319-326 | Ban 이 세션 미회수 | revokeAllUserSessions | 완료(1차) |
| S-11 | service/domain/resume/resume.ts:33-42 | /public/web 이 어느 사용자든 최신 web 행, admin PATCH 도 그 행 | admin 소유 행 한정 | 완료(1차) — admin 우선 정렬 |
| S-12 | compose/shared.ts:91-98 | gdrive refresh token 을 scope LIKE 로 아무 사용자 것 선택 | owner userId 고정 | 완료(1차) — admin 우선 정렬 |
| S-13 | lib/url-validator.ts:1-29 | IPv4-mapped IPv6·DNS rebinding 미방어, `/\evil.com` 오픈 리다이렉트 | resolve 후 검사, `/\` 거부 | 완료(1차) |
| S-14 | icon-loader.ts:138-143,102,146-153 | timeout 이 본문 전 해제, 크기 상한 없음, MIME 허용목록 없음, parseICO 미주입 | 본문 후 clear, 상한, 허용목록 | 완료(1차) |
| S-15 | page/admin/pages/calendar.tsx:36 | color 인라인 style CSS injection | hex 패턴일 때만 렌더 | 완료(1차) |
| S-16 | route/spotify/playing.ts, route/badge.ts | 공개 경로 rate limit 없음, badge 4096×4096 + 임의 폰트 fetch | IP rate limit + 크기 상한 | |
| S-17 | route/mail/message.ts:265-301 | reply/forward 가 발송 rate limit 우회 | withRateLimit | |

## E. 즉시 500 또는 잘못된 값

| ID | 위치 | 문제 | 수정 방향 | 계약 |
|----|------|------|-----------|------|
| E-01 | compose/blog.ts:157, db/schema.ts:146 | 댓글 있는 게시글 삭제 FK 500 | 트랜잭션에서 comments 먼저 삭제 | |
| E-02 | compose/resume.ts:58-64 | 빈 PATCH `set({})` 500 | early return | |
| E-03 | page/admin/format.ts:39 + 모든 목록 페이지 | page 미클램프 → 음수 OFFSET 500 | `Math.max(1, …)` | |
| E-04 | service/shared/image-generator.ts:32-39 | wasm init 레이스 → Already initialized 500 | initPromise 메모이즈 | |
| E-05 | badge.ts:88 | `fontSize ?? …` 0 통과 → 텍스트 없는 PNG 1년 고착 | `\|\|` | |
| E-06 | badge.ts:140 | generate 미래핑 → satori 예외 500 | IMAGE_GENERATE_FAILED | |
| E-07 | route/blog/thumbnail.ts:44 | OG 요청마다 views +1 | 조회수 없는 읽기 메서드 | |
| E-08 | route/weather/weather.ts:87-89, mock.ts:85-87 | 로컬 getHours → Vercel UTC 9시간 어긋남 | kma-api getBaseDateTime 사용 | |
| E-09 | db/index.ts, compose/drive.ts:152,256 | raw `sql` 파라미터에 JS Date 를 넣는 두 곳이 프로세스 TZ 에 따라 다른 리터럴을 만든다. `timezone` 옵션은 근본 해법이 아님(A-8 검토) | raw sql Date 비교를 drizzle 연산자(`lt`·`gte`)로 교체. MySQL `@@session.time_zone` 측정은 별도 운영 확인 | 불변 |
| E-10 | compose/spotify.ts:133,158-161 | new Error → 500 | createAppError | |
| E-11 | with-spotify-auth.ts:27-41, spotify-widget-token.ts:39-45 | isActive 미집행 | provider 생성 시 검사 | |
| E-12 | compose/mail.ts:79-82 | 중복 계정 500, 409 코드 미사용 | ER_DUP_ENTRY → 409 | |
| E-13 | compose/blog.ts:530 | postsCount 항상 0 | 상관 서브쿼리 또는 필드 제거 | |
| E-14 | route/ai/chat.ts:33-46, providers/*.ts | 클라이언트 끊겨도 업스트림 소비 → 과금 지속 | AbortSignal 전파 + reader.cancel | |
| E-15 | ai-provider-factory.ts:56-63,82-99 | single-flight persist 전 해제 → 정상 토큰 reauth_required | Map 삭제를 persist 후로 | |
| E-16 | drive-asset.ts:278-335, route/drive/asset.ts:66-73 | prepare sizeBytes 미검증, 쿼터 신고값, Content-Length 오염 | Zod + complete 에서 실제 크기 재검증 | |
| E-17 | drive-asset.ts:354-389,213-262 | fileHash 중복 500, uploading 상태 잔존 | ER_DUP_ENTRY → 409, failed 처리 | |
| E-18 | drive-asset.ts:454-475 | L1 만 있는 자산 download 항상 500 | R2 폴백 | |
| E-19 | gmail-provider.ts:115, imap-provider.ts:105 | Invalid Date → 배치 실패 | NaN 이면 null | |
| E-20 | gmail-helpers.ts:53-66 | .eml 첨부 본문이 실제 본문 대체 | message/rfc822 미재귀 | |
| E-21 | deploy/caldav-proxy/proxy.ts:17-27 | gzip 헤더 잔존 → 응답 깨짐 | Accept-Encoding identity 또는 헤더 제거 | |
| E-22 | calendar.ts:286-331,443-446 | PUT ETag(JS now) vs GET ETag(DB) 불일치 | 저장 시각 명시 | 완료(1차) |
| E-23 | route/metrics/ingest.ts:23 | `.length` UTF-16 → 64KB 상한 무효 | Buffer.byteLength | |
| E-24 | users.tsx:324,332 | Invalid Date 500, 음수 quota | parseDateEnd, 음수 거부 | |
| E-25 | route/calendar/subscription.ts:70-90 | 구독 없어도 regenerate 성공 | 존재 확인 후 404 | |
| E-26 | tests/route/index.test.ts, route/index.ts:101 | DATABASE_URL 없는 환경에서 테스트 실패 | isProduction 을 deps 로 | 완료(1차) |
| E-27 | mail-sync.ts:264-277 | 실패 시 disconnect 누락 | finally | 완료(1차) |
| E-28 | mail-sync.ts:301-329 | syncHistorical folderId 소유 미검증, 세션 커서 폴더 오용 | accountId 대조, folderId 불일치 시 세션 무시 | |
| E-29 | route/calendar/caldav.ts:228-229 | free-busy time-range Invalid Date | parseICSDateTime | 완료(1차) |
| E-30 | lib/ics.ts:90 | 종일 이벤트 UNTIL 값 타입 불일치 | 종일이면 DATE 형식 | 완료(1차) |

## R. 조건부 위험

| ID | 위치 | 문제 | 수정 방향 | 계약 |
|----|------|------|-----------|------|
| R-01 | log-capture.ts:34-45, require-weather-key.ts:35, device-key.ts:30-34, weather-api-key.ts:33-37, spotify-api-key.ts:44, compose/ai.ts:263-277, compose/logs.ts:58, mail-message.ts:137 | 응답 후 fire-and-forget write 유실 (waitUntil 0건) | await 또는 `@vercel/functions` waitUntil | |
| R-02 | lib/rate-limit.ts:19,30, compose/mail.ts:811, compose/ai.ts:281 | 인스턴스별 Map, setInterval unref 없음 | Redis 카운터 또는 unref + 문서화 | |
| R-03 | service/shared/redis-cache.ts:3-37 | import 시 Redis 생성, REDIS_URL 없으면 무한 재접속, memoryStore 무제한, 실패 무음 | 지연 생성, enableOfflineQueue false, createCache | |
| R-04 | db/index.ts:13-18 | connectionLimit 20 × 인스턴스, maxIdle/idleTimeout 없음 | 5/2/30s/keepAlive | |
| R-05 | vercel.json, lib/cron-auth.ts | 크론 Bearer 가 CRON_SECRET 인데 UPLOAD_SERVER_SECRET 과 비교. env 불일치 시 401 | env 확인 후 결정 | |
| R-06 | mail-sync.ts:183-186,232-234,112-149 | 상호배제 없음, Promise.all 부분 커밋, 헤더 길이 미절단 | 세션 락, allSettled, slice | |
| R-07 | route/mail/upload.ts:31, ai-attachment.ts:38, mail-message.ts:354-416 | Vercel 4.5MB 본문 한도 vs 전량 버퍼 | presigned/스트림 (계약 영향 검토) | |
| R-08 | vercel.json | maxDuration 미설정 | functions.maxDuration | |
| R-09 | compose/metrics.ts:118-134 | archive 하루치 toArray + gzipSync 동기 | 스트리밍 gzip + 멀티파트 | |
| R-10 | kma-api.ts:156-220 | timeout 없음, 4xx 재시도, NO_DATA 미캐시 | AbortSignal.timeout, 4xx 즉시 실패, negative cache | |
| R-11 | compose/logs.ts:51-60, lib/discord.ts:9-17 | throttle 키 우회, allowed_mentions 없음, Map 무한 | 전역 예산 + Map 상한 | |
| R-12 | log-capture.ts, compose/logs.ts:45-48 | 모든 4xx 기록, purge 크론 없음, weather_api_log·mail_sync_logs 삭제 경로 없음 | purge 크론 + LIMIT 반복 | |
| R-13 | font-loader.ts:30,55-93 | fontCache 무제한, timeout 없음, fs 오류 무음, @fontsource devDependencies | 상한·timeout·negative cache·dependencies 이동 | 부분(1차) — 캐시 상한·timeout 만 |
| R-14 | page/admin 토큰 발급 5곳, login.tsx 로그아웃 GET | PRG 이탈로 중복 발급, 로그아웃 CSRF | 일회성 쿠키 + 303, POST 폼 | |
| R-15 | page/admin/index.ts:60,65, manage/index.ts:86-95 | 요청당 getSession 3회 | 세션 컨텍스트 재사용 | |
| R-16 | comment.ts:32-39 | 게시글 존재·isComment 미확인 | 조회 후 404/403 | |
| R-17 | route/blog/post.ts:27-58 | 공개 가시성 기본값 없음(docs 인지) | 비admin 은 isPublished=true 강제 | |
| R-18 | compose/ai.ts:200-208 | createdAt 단독 정렬 순서 뒤집힘 | id 2차 정렬 | |
| R-19 | ai-provider-factory.ts:81-85 | 일시 장애도 영구 reauth_required | invalid_grant 만 reauth | |
| R-20 | compose/mail.ts:582, compose/ai.ts:179, drive-asset.ts:508, storage.ts | 삭제 시 R2 고아, 실패 무음 | 스토리지 삭제 선행 + captureException | |
| R-21 | lib/sentry.ts | initSentry 미호출 → captureException no-op (문서화됨) | 부트스트랩에서 호출 | |
| R-22 | middleware/request-logger.ts | 미장착 → 대시보드 요청 수치 0 (문서화됨) | 장착(waitUntil) 또는 제거 | |
| R-23 | dto/logs/log-event.ts:23, route/metrics/ingest.ts:50,81, route/ai/attachment.ts:22 | 바디 크기 상한 없음 | bodyLimit / refine | |
| R-24 | drive-asset.ts:425,462 | accessCount 읽고-쓰기 유실 | `sql\`access_count + 1\`` | |
| R-25 | compose/calendar.ts:134-141 | 구독 user_id unique 없음 | unique + upsert | |
| R-26 | route/calendar/event.ts:114-201 | groupId 소유 미확인, dtend<dtstart 미검증 | getGroupById, refine | |
| R-27 | page/manage/pages/mail-sync.tsx:164-165 | batchSize 서버 미클램프 | DTO 재사용 | |
| R-28 | page/admin/db.ts params.q 22곳 | escapeLikePattern 미적용 | 적용 | |
| R-29 | compose/mail.ts:365-379 | FULLTEXT 프로브 실패 시 false 고정 | null 로 되돌려 재시도 | |
| R-30 | spotify-provider.ts:59-64 | 429 시 요청 안 최대 180초 sleep | 상한 2-3초 후 실패 | |
| R-31 | compose/spotify.ts:162-170 | 새 refresh_token 무시 | 있으면 저장 | |
| R-32 | deploy/upload-server/index.ts:112,86, gdrive-client.ts:6-40 | formData 전량 메모리, folderCache 무한 | 스트리밍, LRU | |

## P. 성능·최적화

| ID | 위치 | 문제 | 수정 방향 | 계약 |
|----|------|------|-----------|------|
| P-01 | compose/blog.ts:61-69,274-297, compose/drive.ts:175-183, compose/ai.ts:156-198, compose/logs.ts:37-38, compose/metrics.ts:68-76, page/admin/db.ts 32쌍 + counts() 17개 | count/select 순차 await | Promise.all | 불변 |
| P-02 | db/schema.ts | 인덱스 부재: posts(isPublished,isHide,createdAt), comments(postId,createdAt), messages(userId,deletedAt,createdAt), log_events(createdAt), weather_api_log(createdAt), image_assets(createdAt), mail_sync_logs(accountId,createdAt), resumes(type,updatedAt); 이중 인덱스 calendar_event.uid, subscription.token/icsToken | 추가·제거 후 db:push | 불변 |
| P-03 | compose/shared.ts:3-5 | sharp/satori/resvg/tw-to-css eager import → 콜드스타트 | 지연 import | 불변 |
| P-04 | auth-provider.ts | cookieCache 미사용 → 요청마다 세션 DB 조회 | cookieCache (Set-Cookie 추가되므로 소비자 확인) | |
| P-05 | compose/spotify.ts:137-170, compose/mail.ts:32-40, gmail-provider.ts:36-43, compose/shared.ts:114-131 | 토큰 만료 시각 미사용 → 항상 401 후 refresh; gdrive 매번 refresh | 만료 임박 선제 갱신, 캐시 | 불변 |
| P-06 | credential-crypto.ts:12 | scrypt 매 요청(14ms) | salt→key 캐시 | 불변 |
| P-07 | api-token.ts:36, metrics/token.ts:41, compose/calendar.ts:155-157 | lastUsedAt 매 요청 UPDATE | N분 경과 시만 | 불변 |
| P-08 | service/shared/cache.ts | LRU O(n) | Map 순서 활용 | 불변 |
| P-09 | compose/mail.ts:218-287, mail-sync.ts:110-153 | 메시지당 3~5쿼리 순차 | 배치 upsert + inArray | 불변 |
| P-10 | imap-provider.ts:217,191-197,373-375 | source:true 전체 원문, backward 전체 UID 나열, UID 당 STORE | bodyStructure, 범위 계산, join | 불변 |
| P-11 | gmail-provider.ts:312-368,382-390,184-185 | 메시지당 1요청, 첨부마다 전문 재조회, 라벨 N+1 | batchModify, 메타 전달, 카운트 fetch 제거 | 불변 |
| P-12 | compose/mail.ts:642-657,609-622,344-357 | 발신자 1만 행 dedupe, markAllRead 전체 로드, 카운트 2회 | GROUP BY, 단일 UPDATE, SUM | 불변 |
| P-13 | mail-message.ts:427,171-175 | SMTP 전 IMAP 로그인, 그룹마다 provider 생성 | 생략, 계정당 1회 | 불변 |
| P-14 | compose/blog.ts:16-24,301-338,32,501-516,462-574, post.ts:97-106 | tagsSubquery 전체 집계, message_images N+1, description 전체, 재select, getAll* LIMIT 없음, 존재 확인에 getPostById | 상관 서브쿼리, IN, 페이지네이션 | description 제외는 계약 영향 |
| P-15 | route/badge.ts:113, route/blog/thumbnail.ts:176-185,88-102, badge.ts:66-83 | CDN 캐시 헤더 없음, 썸네일 매번 폰트 파싱+풀 렌더, 그리드 325 div, 순차 fetch | CDN-Cache-Control, 캐시, 상수화, Promise.all | 헤더 추가 |
| P-16 | spotify-data.ts:49, spotify-widget.ts:44-59, compose/spotify.ts:131-145, playing.ts | 640px base64 100KB, 2쿼리, 캐시 없음 | 최소 이미지, JOIN, 3-5초 캐시 | SVG 내부 변경 |
| P-17 | weather-api-key.ts:23-50, kma-api.ts:89-93, route/weather/location.ts:45-48 | 요청마다 DB 4회, base time/TTL 불일치, /locations 캐시 헤더 없음 | Redis INCR, 임계 일치, ETag | 헤더 추가 |
| P-18 | route/calendar/ics.ts:22-35, caldav.ts:151-184, calendar.ts:243-249 | 폴링마다 전체 재생성, multiget N+1, timeRange 무시, uid 2회 | ETag 304, inArray, 범위 쿼리, or() | ETag 는 계약 확인 |
| P-19 | compose/drive.ts:255,274,135, drive-folder.ts:38-166 | LIKE '%L1%', getById mediumblob, N+1 | LIKE 'L1%', 컬럼 분리, CTE | 불변 |
| P-20 | ai-chat.ts:57-60,133-160, ai-attachment.ts:83-87, ai-connection.ts:84-86, session.ts:78 | 직렬 await, R2 직렬, UPDATE 3회, resolveClient 낭비 | Promise.all, 병합 | 불변 |
| P-21 | require-metrics-token.ts:26-29, log.ts:75-87 | 매 요청 countDocuments 24h, device upsert 직렬 | limit/캐시, bulkWrite | 불변 |
| P-22 | page/admin/db.ts 토글 6곳, getMessageLikes | select+update, LIMIT 없음 | NOT col 단일문, LIMIT | 불변 |
| P-23 | lib/external-api.ts | dead code, 4xx 재시도 | 사용 시 정리 | 불변 |

## 상태 코드 변경이 수반되는 항목 (사용자 개별 승인)

- E-12 중복 메일 계정 500 → 409
- E-17 drive fileHash 중복 500 → 409
- E-11 Spotify isActive 집행 시 비활성 계정 200 → 404
- route/blog/comment.ts:75,99, route/blog/message.ts:92 not_owner 404 → 403 (감사 지적, 목록에는 미포함)

## 세부 근거

도메인별 원문 보고서는 세션 스크래치패드(`agent-*.md` 7파일)에 있으며 필요 시 `docs/history/` 로 옮긴다.

## 계약 대조 결과 (d 단계, 2026-09-06)

근거: [../reference/consumer-contracts.md](../reference/consumer-contracts.md). 분류는 세 가지다. **불변** = 요청/응답/상태 코드가 그대로라 소비자 영향 없음. **승인** = 오류 상태 코드·검증 상한·쿠키 등 계약 표면이 바뀌므로 사용자 결정 필요. **소비자** = b-hub 가 아니라 소비자 레포를 고쳐야 하거나 양쪽 동시 수정.

### 불변 (워크플로 대상)

- D 전부(D-01~D-22). CalDAV href 단일화(D-16)는 Apple 프로필의 `/caldav/<token>/` 경로 체계를 유지한다.
- S 전부. 단 S-03·S-05·S-06 fail-closed 는 프로덕션 env 가 설정돼 있음을 전제하며, 미설정 시 해당 기능이 503/403 으로 막히는 것이 의도다. S-11 은 현재 `/public/web` 이 서빙 중인 행이 admin 소유인지 DB 에서 먼저 확인한다.
- E-01~E-09, E-13~E-16, E-18~E-30. E-16 의 prepare Zod 도입은 Storage 가 `!json.success` 만 보므로 호환. E-18 은 500 이던 경로가 200 스트림이 되는 개선.
- R-01~R-06, R-08~R-16, R-18~R-32. R-15 세션 컨텍스트 재사용은 SSR 페이지 내부 변경.
- P-01~P-03, P-05~P-13, P-15~P-23. P-15·P-17 은 헤더 추가만이라 호환. P-18 ICS `ETag`/304 는 표준 동작이라 호환.
- 소비자 대조에서 새로 확인된 b-hub 측 결함(불변으로 수정 가능):
  - C-01 `dto/blog/image.ts:16-17` complete 의 `width/height` 가 `positive().nullable()` 인데 upload-server 는 메타 실패 시 `0` 을 보냄 → 400 으로 업로드 전체 실패. `0 → null` 허용.
  - C-04 AI providers/models 의 `displayName: null` 이 Calendar·Rirekisyo 의 strict `z.string()` 을 깨뜨려 AI 패널 전체가 숨겨짐. null 대신 `provider`/`modelId` 폴백 문자열로 반환(값 변경만, 타입은 string 유지).
  - C-10 `route/calendar/group.ts:54-55` PATCH 가 `data: null` 을 돌려줄 수 있음. 갱신 행을 항상 반환.
  - C-11 `compose/metrics.ts:103` series 의 `$project` 가 `cpu.cores.0.usage` 같은 배열 인덱스 경로에서 `v` 를 못 만들어 dashboard 역직렬화 실패 가능. Mongo 실쿼리로 확인 후 `$arrayElemAt` 계열로 수정.
  - C-15 `route/drive/asset.ts:78-113` `/status`·`/complete` 가 upload-server 시크릿을 검사하지 않음. upload-server 는 세 콜백 모두 Bearer 를 보내므로 검사 추가는 호환(S-01 과 함께). — **완료(1차)**: 두 콜백에 `requireUploadServer` 적용, 미설정 시 `SERVICE_NOT_CONFIGURED`(503).
  - C-16 `route/mail/upload.ts:35` 가 `inline` 필드를 읽는데 mail 클라이언트는 `isInline` 을 보냄. 둘 다 받도록 하되, 실제 인라인 처리 경로가 켜지면 발송 결과(cid 임베드)가 달라지므로 승인 항목 A-7 로 분리.

### 승인 필요 (사용자 결정)

| 번호 | 항목 | 현재 | 제안 | 소비자 영향 |
|------|------|------|------|-------------|
| A-1 | E-12 중복 메일 계정 | 500 `INTERNAL_ERROR` | 409 `MAIL_ACCOUNT_ALREADY_EXISTS` | mail 은 `error.message` 만 toast. 호환 |
| A-2 | E-17 drive fileHash 중복(complete·직접 업로드) | 500 | 409 `DRIVE_DUPLICATE_FILE` | Storage 는 이 코드를 이미 매핑. upload-server 는 `!ok` 만 봄. 호환 |
| A-3 | E-10 Spotify refresh 실패·미연결 계정 | 500 | 502 `SPOTIFY_API_ERROR` / 404 `SPOTIFY_ACCOUNT_NOT_FOUND` | 위젯·API 키 소비처 미확인. 상태 코드만 바뀜 |
| A-4 | E-11 Spotify `isActive` 집행 | 비활성 계정도 200 | 비활성이면 404 | 소비처 미확인. 토글의 의도대로 동작하게 됨 |
| A-5 | R-17 공개 게시글 가시성 | 비로그인도 `?isPublished=false`·숨김 글 id 로 열람 가능 | admin 세션 없으면 `isPublished=true, isHide=false` 강제 | bblog 편집 페이지·초안 URL 은 admin 쿠키가 전달되므로 유지됨. 비로그인 초안 열람만 막힘 |
| A-6 | C-03 calendar range 상한 | 366일 초과 400 → Calendar AI 컨텍스트가 25개월을 요청해 항상 실패 | 상한을 800일로 완화 | Calendar AI 컨텍스트가 비로소 동작. 다른 소비자 영향 없음 |
| A-7 | C-16 mail 업로드 `isInline` 수용 | 에디터 이미지가 첨부 규칙(25MB)으로 처리 | `isInline` 도 읽어 인라인 규칙(10MB·jpeg/png/gif/webp·매직바이트) 적용 | cid 임베드 경로는 존재하지 않음(정정). 10~25MB·HEIC/SVG 등이 새로 거부되는 동작 축소. 검토 결과 미적용 권고 |
| A-8 | E-09 DB `timezone: 'Z'` | 로컬(KST)·Vercel(UTC) 혼재 기록 | 커넥션 타임존 UTC 고정 | Vercel 이 기록한 기존 행은 이미 UTC. 로컬에서 기록한 개발 데이터만 9시간 차 |
| A-9 | P-04 better-auth `cookieCache` | 요청마다 세션 DB 조회 | 쿠키 캐시(5분)로 조회 생략 | `Set-Cookie` 에 `session_data` 쿠키 추가. 소비자는 쿠키 전체를 전달하므로 호환이나 쿠키 표면 변경 |
| A-10 | P-14 목록 응답의 `description` 제거 | 공개 목록이 본문 전체 반환 | 목록에서 제외 | bblog 는 읽지 않으나 응답 필드 삭제 = 계약 변경. **미적용 추천** |

### 소비자 측 결함 · 운영 확인 (b-hub 밖)

- K-1 Rirekisyo `commuting_time` vs b-hub `commuting_hours/minutes` (필수) → Rirekisyo 의 이력서 생성·수정이 현재 400. b-hub 가 완화하면 `/manage/resume` 편집기와 호환 확인 필요. 결정: Rirekisyo 수정 / b-hub optional 완화.
- K-2 Rirekisyo 가 `type='web'` 을 모름 → 목록에 web 행이 섞이면 상세 페이지 크래시. 결정: `GET /api/resume` 기본 목록에서 web 제외(계약 변경, RESUME 는 미사용이라 안전) / Rirekisyo 수정.
- K-3 Banga 로그아웃이 GET `/api/auth/sign-out` → 404. Banga 수정 필요.
- K-4 hn-alert 는 `/api/hn/*` 삭제로 전면 고장. 복구 계획 없으면 방치.
- K-5 ESP32 펌웨어는 24h 350회 이상 필요. 발급된 weather 키의 `dailyLimit` 값 DB 확인 필요(기본 100).
- K-6 `ESP32-weather` 레포가 `include/secrets.h` 를 git 에 추적. 키 회전 권장.
- K-7 bblog 의 `NEXT_PUBLIC_API_URL` 폴백이 `hub.gumyo.net`(RESUME·upload-server 는 `api.gumyo.net`). 배포 env 의존.
- K-8 dashboard 의 `X-Metrics-Token` 문서 표기는 오기. 실제는 `Authorization: Bearer`. b-hub docs 정정 대상.
- K-9 Storage 서버 액션 경유 뮤테이션은 에러 shape 를 잃음(소비자 문서 인지).
