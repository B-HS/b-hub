# 2026-09-06 — 전수 감사 후속 수정의 전제: 소비자 레포 전체 참조 + 동작 100% 보장

## 결정

1. b-hub 내부 수정(버그·최적화)은 **모든 소비자 프로젝트를 로컬에서 참조 가능한 상태**에서 진행한다. 요청/응답 계약은 그대로 유지하고, 현재 돌아가는 소비자 동작이 100% 보장되어야 한다.
2. 로컬에 없던 소비자 레포 11개를 `~/development/` 에 클론했다(사용자 승인, 전부 클론안 선택).
3. 수정 전에 소비자별 **계약 인벤토리**(엔드포인트·헤더·요청/응답 필드·에러 코드·SSE·타이밍 가정)를 문서로 고정하고, 그 문서 대조를 통과한 변경만 적용한다.

## 소비자 레포 지도 (`~/development/` 기준)

| 폴더 | GitHub | 브랜치 | 소비 도메인 | 비고 |
|------|--------|--------|-------------|------|
| bblog | B-HS/BBlog | dev | blog | 기존 로컬 |
| RESUME | B-HS/RESUME | dev | resume | 기존 로컬 |
| mail | B-HS/mail | vercel | mail, ai | 신규 클론 |
| Calendar | B-HS/Calendar | vercel | calendar, mail, ai | 신규 클론 |
| Storage | B-HS/Storage | vercel | drive, upload-server | 신규 클론 |
| weather | B-HS/weather | vercel | weather | 신규 클론 |
| dashboard | B-HS/dashboard | dev | metrics | docs 의 `~/machboard` 실체. Rust + Tauri |
| ESP32-Weather-API | B-HS/ESP32-Weather-API | dev | weather | C++ 펌웨어(신) |
| ESP32-weather | B-HS/ESP32-weather | main | weather, logs | C++ 펌웨어(구), X-Device-Key |
| Rirekisyo | B-HS/Rirekisyo | dev | resume, ai(추정) | 실소비 여부 확인 중 |
| hn-alert | B-HS/hn-alert | dev | 미확인 | api.gumyo.net 참조, 실소비 여부 확인 중 |
| Banga | B-HS/Banga | vercel | auth(추정) | better-auth 세션 공유 추정, 확인 중 |
| nextjs-portfolio | B-HS/nextjs-portfolio | dev | weather(문서) | 실소비 여부 확인 중 |

- 소비자가 아닌 것으로 판정: message-container·corekeeper(자체 `/api/logs`), TAIDE·llm-rules(문서 언급), testing-page(정적 HTML), BWeather·Badge·Image-Bucket·simple-proxy·bcalendar-private(이전 세대).
- 미확인: spotify 위젯 토큰·X-Spotify-Key 소비처, badge 소비처. 코드 검색에 걸린 외부 레포 없음. 사용자 확인 필요.

## 적용 규칙

- 소비자 계약 인벤토리 정본: [../reference/consumer-contracts.md](../reference/consumer-contracts.md) (작성 중). 엔드포인트를 바꾸는 모든 변경은 이 문서의 해당 행을 먼저 대조한다.
- 오류 상태 코드가 바뀌는 수정(예: 500 → 409)은 계약 변경으로 간주해 소비자 코드에서 해당 코드를 읽는지 확인한 뒤 사용자에게 개별 승인을 받는다.
- 펌웨어(ESP32)와 데스크톱(dashboard)은 배포된 바이너리를 갱신하기 어려우므로 요청/응답 필드·타입·크기 상한을 가장 엄격하게 고정한다.

## 2026-09-06 사용자 결정 (d 단계)

- 상태 코드 변경 A-1(메일 계정 중복 409)·A-2(drive 해시 중복 409)·A-3(Spotify 500 → 502/404)·A-4(Spotify `isActive` 집행): **적용**. 단 "기존 동작이 완벽하게 보장되어야 한다" 는 전제가 재강조됨. 구현 시 해당 경로의 성공 응답은 바이트 단위로 동일해야 하며, 바뀌는 것은 오류 경로의 상태 코드·코드 문자열뿐이어야 한다.
- A-5 공개 게시글 가시성 강제: **적용**. admin 세션이 있으면 기존 동작 그대로.
- A-6(calendar range 800일)·A-7(mail `isInline` 수용)·A-8(DB timezone UTC)·A-9(cookieCache): 사용자가 전부 선택했으나 **"매우 민감하므로 기존 동작에 영향이 없는지 완벽하게 파악한 뒤 작업 여부를 다시 검토"** 하라는 조건이 붙음. 따라서 심층 영향 검토(별도 워크플로)를 먼저 수행하고 결과를 보고한 뒤 재결정한다. 이번 수정 배치에는 포함하지 않는다.
- A-10 목록 `description` 제거: 미적용.
- Rirekisyo 불일치(K-1·K-2): **보류**. b-hub 계약도 Rirekisyo 도 이번 범위에서 손대지 않는다.
- 실행 방식: 1차(D·S·C-15) → 2차(E·C-01·C-04·C-10·C-11·A-1~A-5) → 3차(R·S-16·S-17) → 4차(P) 순으로 Workflow(구현 opus + 검증 파이프라인). 스키마 변경은 에이전트가 `db:push` 를 실행하지 않고 사용자가 직접 반영한다.

## 2026-09-06 A-6~A-9 심층 영향 검토 결과 (d2 단계, 워크플로 12 에이전트: 항목별 서버·소비자 분석 + 반박 검증)

| 항목 | 분석가 2인 | 반박 검증 최종 | 핵심 근거 |
|------|-----------|---------------|-----------|
| A-6 calendar range 800일 | 조건부 적용 | **조건부 적용** | 상한만 올리면 Calendar AI 컨텍스트가 400(range) 에서 400(AI content 100,000자 초과) 으로 자리만 옮긴다. 설명 200자짜리 DAILY 반복 1건만으로 366일 컨텍스트가 114,923자. 응답 4.5MB 초과 임계도 DAILY 반복 ~15건으로 내려간다. 기존 테스트(732일 → 400 기대) 가 깨진다. Calendar FE 의 컨텍스트 절단·`res.ok` 검사·재조회 억제가 선행돼야 실익이 있다. |
| A-7 mail `isInline` 수용 | 조건부 적용 | **조건부 적용** | 발견 목록의 "cid 임베드가 원래 의도" 서술은 오기였다. 코드에 cid 경로는 없고, 바뀌는 것은 에디터 이미지에 인라인 규칙(10MB 상한·jpeg/png/gif/webp 화이트리스트·매직바이트) 이 새로 적용되는 것뿐이다. 즉 오늘 통과하던 10~25MB 이미지·HEIC/SVG/AVIF·`image/jpg` 같은 근접 MIME 이 413/422 로 거부되는 **동작 축소**다. 실패는 전역 토스트로 보이므로 "무음 실패" 주장은 반박됨. |
| A-8 DB `timezone: 'Z'` | 조건부 적용 | **미적용** | mysql2 는 `SET time_zone` 을 보내지 않는다. 옵션은 raw `sql` 파라미터의 JS Date 이스케이프와 바이너리 파서에만 작용하며, 저장소에서 Date 파라미터는 `compose/drive.ts:152,256` 두 곳뿐(둘 다 읽기 필터). 프로덕션(TZ=UTC)에서는 바이트 동일, 로컬(KST)에서만 바뀐다. E-09 의 "KST/UTC 혼재" 는 MySQL 세션 타임존 vs drizzle 의 `+0000` 가정 사이의 문제라 이 옵션으로 해결되지 않으며, `@@session.time_zone` 측정 없이는 수정인지 회귀인지도 판정 불가. 근본 해법은 raw sql Date 비교를 drizzle 연산자로 바꾸는 것(1차 배치 D-02 가 :256 을 이미 치환). |
| A-9 better-auth cookieCache | 조건부 적용 | **미적용** | 캐시 히트 시 DB 를 전혀 읽지 않아 세션 회수·Ban·role 변경이 최대 5분 지연된다. `route/` 안에서 `getSession(c)` 를 직접 호출하는 곳이 19파일 66곳이라 admin 경로만 우회시키는 완화가 불가능하고, 그중 `PATCH /api/resume/web` 은 공개 문서 쓰기 경로다. 캐시 payload 에 세션 토큰·이메일·role 이 서명만 된 평문으로 실리고, session_token 과 바인딩되지 않아 payload 유출 시 300초간 타인 인증이 가능하다. 계약 인벤토리 M33(세션 쿠키 1종) 을 깨고 모든 `*.gumyo.net` 요청 쿠키가 +1.4KB 늘며, upload-server 의 `verifySession` 도 stale 창을 상속한다. |

조정자 권고: A-6 은 Calendar FE 수정과 한 묶음으로 보류, A-7 은 미적용(현행 `inline` 유지, 문서 오기 정정), A-8 은 미적용(대신 raw sql Date 비교 제거를 P/R 배치에 포함, E-09 재정의), A-9 는 미적용(P-04 대체안: 요청당 중복 getSession 제거 R-15). 최종 결정은 사용자.

## 2026-09-06 A-6~A-9 최종 결정 (사용자: "권고대로")

- A-6 calendar range 800일: **보류**. Calendar FE 의 AI 컨텍스트 절단·`res.ok` 검사·재조회 억제와 한 묶음으로 다룬다.
- A-7 mail `isInline` 수용: **미적용**. 라우트는 현행대로 `inline` 만 읽는다. 발견 목록의 "cid 임베드" 서술은 정정했다.
- A-8 DB `timezone: 'Z'`: **미적용**. 대신 raw `sql` 에 JS Date 를 넣는 두 곳(`compose/drive.ts` stale 필터 등)을 drizzle 연산자로 바꾸는 항목을 성능 배치(E-09 재정의)에 포함한다.
- A-9 better-auth cookieCache: **미적용**. P-04 는 요청당 중복 `getSession` 제거(R-15)로 대체한다.

## 2026-09-06 1차 배치 독립 회귀 리뷰 결과와 조치

소비자 그룹 6 + 횡단 1 리뷰어가 HEAD 와 워킹트리를 대조했다(storage-upload·weather-esp32-logs·dashboard-metrics 는 clean). 승인 목록 밖의 차이 3건을 조정자가 직접 수정했다.

1. 부트스트랩 throw 제거 — `createAdminRoute`/`createManageRoute` 가 `csrfSecret` 미설정 시 생성 시점에 throw 하던 것을 제거. 승인 범위는 "상태 변경 요청 403 fail-closed" 이고, 그 가드(`page/admin/csrf.ts`)는 그대로 동작한다. `BETTER_AUTH_SECRET` 이 optional 인 채로 전 서비스가 부팅 실패하는 장애 반경 확대를 막는다.
2. mail 이동(`compose/mail.ts moveMessages`) — uidMap 이 없는 항목에 대해 대상 폴더의 같은 UID 행(IMAP 에서는 다른 메시지)을 지우던 로직을 제거. 새 규칙: uidMap 이 있으면 대상 폴더의 같은 새 UID 행만 정리 후 folderId·remoteMessageId·uid 를 한 UPDATE 로 갱신, 없으면 대상 폴더에 같은 UID 행이 있을 때 **옮기던 행(로컬 사본)** 을 지우고 대상 행은 보존(그 메시지는 다음 동기화에서 대상 폴더 UID 로 다시 들어온다). 항목별 순차 처리라 배치 내부 UID 충돌도 unique 위반 없이 처리된다. Gmail 은 계정 단위 1행이라 충돌이 없고 HEAD 와 같이 folderId 만 갱신된다.
3. font-loader 실패 캐시(5분) 제거 — HEAD 는 실패 시 매 요청 재시도했으므로 그대로 둔다. 캐시 상한·fetch timeout 만 유지.

리뷰가 승인으로 분류했으나 운영상 인지할 변경: CalDAV REPORT href 접두사가 요청 컬렉션과 일치하도록 바뀜(Apple 클라이언트는 재동기화로 흡수), DST 타임존은 VTIMEZONE 블록 생략, Gmail/IMAP 증분 sync 의 `added` 집합과 커서 값이 달라짐(누락 버그 수정 결과), 배지 아이콘 URL 에 DNS 검사 추가(사설 IP 로 해석되는 호스트는 아이콘 생략).

린트 훅이 편집 중 지적한 기존 코드 2건은 이번 범위 밖이라 유지: `compose/mail.ts:17` 의 `throw new Error('MAIL_ENCRYPTION_KEY …')`(부트스트랩 검증), `service/shared/font-loader.ts`·`icon-loader.ts` 의 `process.env.VERCEL`.

## 2026-09-07 브랜치·커밋 운영 (사용자 지시)

- 1차 배치는 `fix/audit-batch1-data-loss-security` 브랜치에 도메인별 16개 Conventional Commit 으로 나눠 커밋·푸시했다(AI 트레일러 없음, git.md §6.1). dev 에는 머지하지 않았다.
- 2차는 그 브랜치에서 딴 `fix/audit-batch2-immediate-errors` 에서 진행한다. 이후 배치도 같은 방식(직전 배치 브랜치에서 분기)으로 쌓는다.
- 2차 착수 전에 두 그룹(mail·drive)이 공용으로 쓰는 `lib/db-helper.ts` 의 `isDuplicateKeyError`(mysql2 `ER_DUP_ENTRY`, drizzle `DrizzleQueryError.cause` 포함)를 조정자가 먼저 추가했다.

## 2026-09-07 2차 배치 독립 회귀 리뷰 결과와 조치

리뷰어 6(bblog-resume·mail-calendar-ai·storage-upload·weather-spotify-metrics·admin-manage·cross-cutting). 승인 목록 밖의 차이 4건을 조정자가 HEAD 의미로 되돌렸다.

1. Gmail 본문 파트 선택 — 같은 MIME 파트가 여러 개일 때 첫 파트 고정(`??=`)으로 바뀐 것을 HEAD 의 마지막 파트 우선으로 원복. `message/rfc822` 하위 재귀 차단(E-20)만 유지.
2. 드라이브 다운로드 — L3(gdrive) 다운로드 예외를 삼키고 L1 로 폴백하던 것을 제거. HEAD 처럼 예외를 전파하고, 폴백은 gdrive 저장소가 구성되지 않았거나 L3 사본이 없을 때만(E-18 승인 범위).
3. 어드민 Ban 만료일 — `parseDateEnd`(그날 23:59:59.999) 로 값이 바뀌던 것을 HEAD 의 `new Date(입력)` 으로 원복. 무효 날짜만 validation flash.
4. 어드민 quota — 비정수·누락 입력을 거부하던 것을 HEAD 의 `parseIntOr(…, 0)` 으로 원복. 음수만 거부.

리뷰가 승인으로 분류했으나 운영상 인지할 사항:
- 공개 GET `/api/blog/posts`·`/:id` 응답이 admin 쿠키 유무에 따라 달라지는데 `Vary: Cookie` 는 없다. bblog 가 admin 세션으로 ISR 재검증을 하면 초안 포함 목록이 공개 캐시에 남을 수 있다(HEAD 에서도 admin 이 `?isPublished=false` 로 보던 것과 같은 성격). 이 두 엔드포인트에 요청당 세션 조회 1회가 추가된다.
- `POST /api/drive/assets/prepare` 는 validator 가 앞에 붙어 "미인증 + 무효 바디" 가 401 대신 400 이다(Storage 는 `success` 만 확인).
- caldav-proxy 가 `content-length` 를 제거하므로 CalDAV 응답 프레이밍이 청크 기반으로 바뀐다. Apple 캘린더 실기기 확인 권장.
- Spotify `isActive` 토글이 이제 즉시 집행되어 비활성 계정의 위젯 임베드는 깨진 이미지가 된다(A-4 승인 의도).

## 2026-09-07 3차 배치 착수 결정 (조정자 판단, 이견 시 되돌림)

- R-01 fire-and-forget: `@vercel/functions` 의존성을 새로 들이지 않고 **응답 전에 `await`** 한다(오류 로그·키 사용 시각·weather 요청 로그·AI 사용 로그). mail 상세 조회의 원격 읽음 반영만은 IMAP 왕복이 커서 로컬 DB 갱신만 await 하고 원격 호출은 비동기로 둔다.
- R-02 rate limiter: 계약(헤더·429)은 그대로 두고 `setInterval` 을 `unref`, 공유 카운터 스토어(Redis, `REDIS_URL` 있을 때만)를 주입 가능하게 만든다. 배선은 그룹 완료 후 조정자가 한다.
- R-04 DB 풀: `connectionLimit` 은 처리량 변화를 피하기 위해 20 유지, `maxIdle`·`idleTimeout`·`enableKeepAlive` 만 추가. `timezone` 은 A-8 결정대로 건드리지 않는다.
- R-06 mail 동기화 상호배제: 같은 계정 동기화가 진행 중이면 409 를 내지 않고 `{ added:0, updated:0, deleted:0, durationMs }` 로 즉시 성공 응답(mail 클라이언트가 자동 동기화와 수동 동기화를 겹쳐 호출하므로 toast 를 유발하지 않기 위함). 락은 5분 후 자동 해제.
- R-07(업로드 4.5MB 우회)·R-08(maxDuration)·R-22(request-logger 장착)·R-32 의 멀티파트 스트리밍은 계약·비용 영향으로 보류. R-05 는 env 확인 사항으로 남긴다.
- R-25 는 `calendar_subscription.user_id` unique 추가로 **db:push 대상이 하나 더 늘어난다**.
- S-16: badge 는 IP 기준 분당 60회 + `width*height` 2,000,000 px 상한(400), spotify playing 은 토큰+IP 기준 분당 60회. S-17: reply/forward 에 send 와 같은 발송 한도 적용(X-RateLimit 헤더 추가).

## 2026-09-07 3차 배치 조정자 후속 조치 (워크플로 최종 검증 지적 + 배선)

1. Discord 알림은 **HEAD 와 같이 fire-and-forget** 으로 되돌렸다. 워크플로가 R-01 의 "응답 전 await" 원칙을 알림에도 적용해 `ingest`·`ingestBatch`·`captureServerError` 가 웹훅 완료를 기다렸는데, 최종 검증자가 로그 수집 응답(ESP32·mail 클라이언트가 호출)에 Discord 왕복(최대 3초 timeout)이 얹히는 지연을 지적했다. 알림 실패는 `service/domain/logs/log-event.ts` 의 `maybeAlert` 가 `captureException` 으로 삼킨다. R-11 의 예산·throttle 상한·`allowed_mentions`·timeout 은 유지. 서버리스에서 응답 후 웹훅이 끊길 수 있는 성질은 HEAD 와 동일하며, 필요해지면 `@vercel/functions` 의 `waitUntil` 도입을 별도 결정한다.
2. Redis 공유 rate limit 스토어 배선 — `compose/index.ts` 가 `REDIS_URL` 이 있을 때만 `createRedisRateLimitStore` 1개를 만들어 `composeMail`·`composeAi` 에 주입한다(`ComposeMailArgs`·`ComposeAiArgs` 의 선택 필드 `rateLimitStore`). `route/mail/message.ts`·`sync.ts` 의 `checkLimit` 타입은 `withRateLimit` 에서 유도해 동기·비동기 판정을 모두 받는다. 공개 경로(badge·spotify playing) 리미터는 인메모리 그대로다(IP 키라 인스턴스 분산 시 한도가 느슨해질 뿐 소비자 영향 없음).
3. `service/shared/redis-client.ts` 신설 — 3차의 `redis-cache.ts`(R-03)와 `rate-limit-store.ts`(R-02)가 각자 `lazyConnect: true` + `enableOfflineQueue: false` 로 클라이언트를 만들었는데, ioredis 는 이 조합에서 **첫 명령을 연결이 준비되기 전에 즉시 거부**한다(`Redis.sendCommand` 의 offline queue 분기 — 공식 문서·`node_modules/ioredis/built/Redis.js` 확인). 콜드 스타트마다 첫 캐시 조회·첫 rate limit 판정이 실패하고 Sentry 에 기록되는 결함이라, 공용 클라이언트가 첫 명령 전에 `connect()` 완료를 기다리도록 했다(`ensureConnected`). 연결 이후 장애는 offline queue 없이 즉시 실패해 인메모리 폴백으로 넘어가고, ioredis 가 백그라운드에서 재연결하면 `ready` 상태에서 자동 복귀한다. 두 모듈이 프로세스당 연결 1개를 공유한다.
4. 린트 훅 지적 중 유지한 것: `tests/service/shared/redis-cache.test.ts` 의 `process.env` 조작은 `getEnv()` 를 테스트하기 위한 기존 패턴(`tests/lib/env.test.ts` 와 동일)이라 그대로 둔다. 테스트의 `throw new Error` 는 `createAppError` 로 바꿨다.

## 2026-09-07 3차 배치 독립 회귀 리뷰 결과와 조치

리뷰어 7(bblog-resume·mail-calendar-ai·storage-upload·weather-spotify-metrics·admin-manage·core-runtime·cross-cutting) 중 6이 완료됐고, mail-calendar-ai 는 권한 프롬프트 폭주(전역 `blockReadsOutsideWorkingDirectories`) 때문에 워크플로를 중단해 조정자가 diff 를 직접 검토했다. 승인 목록 밖의 차이 3건을 HEAD 의미로 되돌렸다.

1. `GET /admin/login/logout` — R-14 구현이 GET 을 세션 종료 없는 303 안내로 바꿔 기존 링크·북마크로는 로그아웃이 되지 않았다. HEAD 의 `signOut` + 302 를 GET 에 복원하고, CSRF 폼용 `POST /admin/login/logout` 은 같은 핸들러로 병행 유지한다.
2. `/api/logs/purge` — R-12 크론 서브라우트가 GET·POST 를 모두 받으면서 기존 admin POST 앞에 마운트돼, `Authorization` 헤더를 실은 POST 가 크론 분기로 흡수됐다. Vercel 크론은 GET 으로 호출하므로 크론 라우트를 GET 전용으로 좁혀 POST 는 HEAD 대로 admin 핸들러만 처리한다.
3. `/admin/*`·`/manage/*` 미매칭 경로 — R-15 가 대시보드·오버뷰의 `app.use('*', guard)` 를 인라인 가드로 바꿔 미매칭 경로가 303(로그인 유도)/403 대신 404 가 됐다. `use('*')` 를 복원했다. 세션은 요청 컨텍스트에 캐시되므로 `getSession` 은 여전히 요청당 1회다.

리뷰가 승인으로 분류했으나 운영상 인지할 사항:
- `POST /api/logs/purge` 의 등급별 삭제 건수가 LIMIT 1000 × 50회 = 50,000 에서 캡된다(그 이상이면 다음 실행에서 이어서 지움).
- 동기화 진행 중에는 `mail_accounts.lastSyncStatus` 가 `'running'` 으로 조회된다(GET /api/mail/accounts). mail 클라이언트는 `'error'`·`'success'` 만 구분하므로 그 사이엔 중립 배지로 보인다.
- drive 자산 삭제가 실물 삭제 → 행 삭제 순서라, 행 삭제가 실패하는 드문 경우 실물만 사라진 행이 남을 수 있다(R-20 승인 방향).
- REDIS_URL 이 설정된 배포에서 프로세스의 첫 Redis 연결이 실패하면 ioredis 가 `end` 상태가 되어 그 프로세스는 계속 인메모리로 동작한다(응답 불변, Sentry 에 기록).
- `@fontsource` 가 dependencies 로 이동해 프로덕션 badge·썸네일이 실제 폰트로 렌더된다(HEAD 프로덕션은 폰트 로드 실패 폴백이었을 수 있음).
- `initSentry` 가 처음으로 실제 호출되어 SENTRY_DSN 이 있으면 아웃바운드 fetch 에 `sentry-trace`/`baggage` 헤더가 붙는다.
- badge·spotify playing 의 새 429 는 계약 문서상 런타임 소비자가 없어 실영향이 확인되지 않았다.

## 2026-09-07 4차 배치 착수 결정 (조정자 판단, 이견 시 되돌림)

전제는 그대로다: 성공 응답은 바이트 단위로 동일해야 하고, 상태 코드·헤더 추가는 계약 대조 결과에서 "호환" 으로 분류된 것(P-15·P-17 헤더 추가, P-18 ICS ETag/304)만 허용한다. 브랜치는 `fix/audit-batch3-serverless` 에서 딴 `fix/audit-batch4-performance`.

| 그룹 | 파일 | 반영 | 제외(이유) |
|------|------|------|------|
| blog | compose/blog.ts, service/domain/blog/post.ts | P-01 count/select 병렬, P-14 tagsSubquery 상관 서브쿼리·message_images IN·재select 제거·존재 확인 경량 쿼리 | description 제외(A-10 미적용), getAll* LIMIT(응답 변화) |
| drive | compose/drive.ts, service/domain/drive/drive-folder.ts | P-01, P-19 getById 의 mediumblob 컬럼 분리·폴더 N+1 배치 | `LIKE '%L1%'` → `'L1%'`(의미 변화) |
| ai | compose/ai.ts, service/domain/ai/{ai-chat,ai-attachment,ai-connection,ai-session}.ts | P-01, P-20 직렬 await 병렬화·R2 병렬·UPDATE 병합·resolveClient 재사용 | — |
| logs-metrics | compose/logs.ts, compose/metrics.ts, service/domain/metrics/log.ts, middleware/require-metrics-token.ts | P-01, P-21 device upsert bulkWrite | countDocuments 캐시(일일 한도 정확성) |
| admin | page/admin/db.ts | P-01 32쌍 + counts() 병렬, P-22 토글 단일문 | getMessageLikes LIMIT(렌더 변화) |
| shared | lib/credential-crypto.ts, service/shared/api-token.ts, service/domain/metrics/token.ts, service/shared/cache.ts, lib/external-api.ts, compose/shared.ts | P-06 scrypt 키 캐시, P-07 lastUsedAt 5분 경과 시만 UPDATE, P-08 LRU Map 순서, P-23 dead code 삭제, P-05 gdrive access token 만료까지 캐시 | — |
| mail | compose/mail.ts, service/domain/mail/{mail-sync,mail-message}.ts, service/domain/mail/providers/gmail-provider.ts | P-05 토큰 만료 시각 기반 선제 갱신, P-09 배치 upsert + inArray, P-12 GROUP BY·단일 UPDATE·SUM, P-13 그룹당 provider 재사용 | P-10·P-11 IMAP/Gmail 프로토콜 변경(1차 데이터 손실 수정 직후라 사용자 결정 필요), P-13 의 SMTP 전 IMAP 로그인 생략(자격 검증 경로 변화) |
| spotify-weather-badge | compose/spotify.ts, service/domain/spotify/{spotify-data,spotify-widget}.ts, service/domain/weather/{weather-api-key,kma-api}.ts, route/weather/location.ts, route/badge.ts, route/blog/thumbnail.ts, service/domain/badge/badge.ts | P-05 spotify 만료 기반 선제 갱신, P-16 2쿼리 JOIN, P-17 요청당 DB 왕복 축소·base time/TTL 경계 일치·/locations ETag·Cache-Control, P-15 badge CDN-Cache-Control·썸네일 렌더 캐시·그리드 상수화·Promise.all | P-16 이미지 축소·3~5초 캐시(SVG 바이트·now-playing 지연), P-17 Redis INCR(한도 의미 변화) |
| calendar | route/calendar/{ics,caldav}.ts, service/domain/calendar/calendar.ts, compose/calendar.ts | P-18 ICS ETag/304·multiget inArray·uid 조회 or(), P-07 구독 lastAccessedAt 5분 경과 시만 | P-18 timeRange 적용(REPORT 결과 변화) |
| schema-index | db/schema.ts | P-02 인덱스 8종 추가 + 중복 인덱스(calendar_event.uid, subscription token/icsToken) 제거 → **db:push 대상 3번째** | — |

- P-03(sharp/satori/resvg 지연 import)은 `bun build` 단일 번들 + Vercel 런타임에서만 검증 가능하므로 preview 배포로 확인한 뒤 별도 진행한다. P-04 는 A-9 결정대로 미적용.
- 병렬 작업(구현·회귀 리뷰·문서 갱신)은 사용자 지시(2026-09-07 "이후로 병렬 등은 workflow + opus 로")대로 단일 Agent 호출이 아니라 Workflow + opus 로 실행한다.

## 2026-09-07 4차 배치 독립 회귀 리뷰 결과와 조정자 후속 조치

리뷰어 7(bblog-resume·mail-calendar-ai·storage-upload·weather-spotify-metrics·admin-manage·core-runtime·cross-cutting) 전원 완료. 미승인 차이로 보고된 것은 1건뿐이고 재검증자가 반박했다(원복 없음).

- cross-cutting 이 지적한 `GET /api/metrics/logs` 의 count/select 병렬화 + Mongo 재연결 경합(두 호출이 같은 stale 클라이언트로 실패해 `resetMongo` 를 두 번 부르면 두 번째가 새 클라이언트를 닫을 수 있음)은 승인 항목(P-01) 범위이고 실제 도달이 어렵다고 재검증됐다. 다만 보강 비용이 거의 없어 조정자가 `db/mongo.ts` 의 `resetMongo(stale?)` 를 "넘긴 인스턴스가 현재 인스턴스일 때만 교체" 로 바꾸고 `compose/metrics.ts` 의 `runMongo` 가 자기가 쓴 인스턴스를 넘기도록 했다(`tests/db/mongo.test.ts`).
- bblog 리뷰어 권고 반영: P-02 인덱스가 적용되면 `comments`(postId, created_at)·`messages`(userId, deleted_at, created_at) 목록이 filesort 대신 인덱스 순 스캔이 되어 같은 초에 저장된 행의 상대 순서가 바뀔 수 있다. HEAD 도 동점 순서는 미정의였으므로 `compose/blog.ts` 의 두 목록에 `desc(commentId)`·`desc(id)` 타이브레이크를 추가해 결정적으로 고정했다(동점이 아닌 행의 순서는 불변).
- schema-index 그룹이 보고만 한 중복 인덱스 2건(`idx_subscription_user`·`idx_mail_sync_logs_account`)은 조정자가 제거했다가 **프로덕션 push 실측 후 유지로 되돌렸다.** 두 컬럼 모두 FK 라 MySQL 이 인덱스를 요구하는데, drizzle-kit push 는 새 unique·복합 인덱스 CREATE 보다 DROP INDEX 를 먼저 실행해 `ER_DROP_INDEX_FK` 로 중단됐다(2026-09-07). **db:push 대상은 P-02 인덱스 8종 추가 + 중복 3종 제거**(`idx_calendar_event_uid`·`idx_subscription_token`·`idx_subscription_ics_token`).

리뷰가 승인으로 분류했으나 운영상 인지할 사항:
- 썸네일 렌더 캐시(LRU 20·1시간)의 키는 제목·카테고리·첫 태그라 게시글 수정 시 갱신되지만, 폰트 가용성은 키에 없어 두 웨이트 중 하나만 로드된 렌더가 최대 1시간 캐시될 수 있다(전량 실패 시엔 캐시하지 않음).
- `api_token`·`metrics_token` 의 lastUsedAt, 캘린더 구독 lastAccessedAt 은 5분 단위로만 갱신된다(어드민·manage 화면의 표시 정밀도).
- mail 메시지 upsert 가 건별에서 배치(identity SELECT 1회 → 신규 INSERT → 재조회 → 기존 UPDATE)로 바뀌었고, 원격 플래그 반영은 계정당 1회 연결 후 폴더를 순회한다. added/updated 집계·identityScope·moveMessages 규칙은 그대로다.
- Gmail·Spotify access token 은 만료 5분 전이면 선제 갱신하며, 선제 갱신 실패는 삼키고 기존 401 후 갱신 경로로 떨어진다(최종 오류 매핑 동일). gdrive access token 은 프로세스 내에서 만료 60초 전까지 캐시된다.
- P-03(지연 import)은 preview 배포 검증 전이라 미적용, P-10·P-11(IMAP/Gmail 프로토콜 호출 축소)은 사용자 결정 대기.

## 2026-09-07 배포 준비 확인 (사용자 보고 기준)

- Vercel Production 환경변수는 코드가 읽는 항목 전부 존재(`DATABASE_URL`·R2 4종·`UPLOAD_SERVER_SECRET`/`URL`·`KMA_API_KEY`·`MONGODB_URI`·`AI_ENCRYPTION_KEY`·`MAIL_ENCRYPTION_KEY`·`REDIS_URL`·OAuth 3쌍·`BETTER_AUTH_SECRET`·`TRUSTED_ORIGINS`·`BASE_URL`·`GDRIVE_ROOT_FOLDER_ID`·`R2_CUSTOME_DOMAIN`·`CRON_SECRET`). `SENTRY_DSN`·`DISCORD_WEBHOOK_URL` 은 선택이라 사용자 결정으로 보류. `GDRIVE_SERVICE_ACCOUNT_KEY`·`GDRIVE_OWNER_EMAIL` 은 코드 미사용(삭제 가능).
- **Vercel 크론은 사용자가 비활성화한 상태다(2026-09-07).** 따라서 drive evict-r2·auto-promote, metrics archive, logs purge 가 돌지 않아 R2 L1 정리·Mongo 핫 보관 아카이브·`log_events`/`weather_api_log`/`mail_sync_logs` 보존 삭제가 누적된다. 다시 켤 때는 Vercel 이 보내는 `CRON_SECRET` 과 코드가 비교하는 `UPLOAD_SERVER_SECRET` 값이 같아야 하거나, 코드가 `CRON_SECRET` 을 직접 읽도록 수정(A안)해야 한다.
- 워크플로 에이전트의 도구 규칙: 파일 읽기는 Read·검색은 Grep·Glob, Bash 는 `bun test <경로>`·`bunx prettier --write <파일>`·`bunx tsc --noEmit`·`git diff HEAD -- <경로>`·`git status --short` 만(권한 프롬프트 방지, 2026-09-07 확정 원인은 전역 `blockReadsOutsideWorkingDirectories`).
