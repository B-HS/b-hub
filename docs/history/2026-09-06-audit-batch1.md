# 2026-09-06 전수 감사 1차 수정 배치 (D·S + C-15 + 일부 E)

> 기준: 2026-09-06, `dev` @ `6e6fed2` + 워킹트리 미커밋 변경. 발견 목록 정본: [../quality-assurance/2026-09-06-audit-findings.md](../quality-assurance/2026-09-06-audit-findings.md) · 합의·소비자 판정: [../acknowledge/2026-09-06-consumer-repos-and-compat.md](../acknowledge/2026-09-06-consumer-repos-and-compat.md) · 소비자 계약: [../reference/consumer-contracts.md](../reference/consumer-contracts.md) · 진행 체크리스트: [../PROCESS.md](../PROCESS.md)

## 전제

- 사용자 전제: **요청/응답 계약 불변 + 현재 돌아가는 소비자 동작 100% 보장.** 계약 대조에서 "불변" 으로 분류된 항목만 이번 배치에 넣었다.
- 상태 코드·검증 표면이 바뀌는 항목(A-1~A-10)과 소비자 측 결함(K-1~K-9)은 이번 배치에서 제외했다.

## 진행 방식

| 단계 | 수행 | 결과 |
|------|------|------|
| e. 1차 수정 | 워크플로 **26 에이전트**, 관심사 **9개 그룹**(drive lifecycle·drive 업로드 게이트·mail 동기화·mail 메시지 조작·calendar ICS/CalDAV·logs 디바이스 키·admin 보안·공유 로더/URL 검증·트랜잭션) | D-01~D-22, S-01~S-15, C-15 구현 |
| e2. 후속 | 워크플로 **13 에이전트**(독립 검증자 지적 반영) | F-1 이동 원자성, F-2 증분 폴더 카운트 생략, F-3 status 콜백 s3Key 대조, F-4 로그 배치 사전 검사 원복, F-5 라우터 env 게이트(E-26), F-7 Gmail 식별자 범위 유지 |
| e3-1. 회귀 리뷰 | 소비자 그룹 **6 리뷰어 + 횡단 1** | 미승인 차이 3건을 조정자가 직접 수정(부트스트랩 throw 제거·mail 이동 오삭제·font 실패 캐시 제거) |
| e3-2. 문서 갱신 | 이 문서 포함 | 아래 [문서 갱신](#문서-갱신) |

## 반영 범위

- **D-01~D-22 전부**(데이터 손실·손상). drive lifecycle cron GET 수신·축출 후보 조건·유일 티어 가드·승격 조회 조건, mail unique 3열화와 폴더 스코프 upsert/삭제·mailbox lock·uidMap 재매핑·증분 폴더 목록 갱신·`__local_` 폴더 제외·Gmail historyId 선확보·IMAP 오름차순 배치, calendar VALARM/RECURRENCE-ID·TZID·VTIMEZONE 오프셋·exdate·href 단일화·BYDAY, metrics 아카이브 키 파트화, 어드민 삭제 3종 스토리지 삭제, 메시지·tombstone·AI 메시지 쌍 트랜잭션.
- **S-01~S-15**(보안). S-01 은 hub status 콜백 게이트 + `s3Key` 대조까지 반영한 **부분 해결**(upload-server 자체의 요청 인증은 미도입). 나머지는 완료 — assetId/s3Key 검증, CSRF fail-closed·hex 검사, upload-server·blog HMAC fail-closed, 시크릿 상수 시간 비교, 디바이스 로그 식별자 강제, weather 로그 절단, Ban 세션 회수, resume/gdrive admin 우선 선택, URL 검증 강화, icon-loader 상한·MIME 허용목록, 캘린더 color 렌더 제한.
- **C-15**(`/status`·`/complete` upload-server 시크릿 검사), **E-22·E-26·E-27·E-29·E-30**.
- **R-13 부분** — font-loader 캐시 상한·fetch timeout 만. negative cache 와 `@fontsource` 의존성 이동은 미적용(회귀 리뷰에서 실패 캐시는 HEAD 동작 유지로 되돌림).

## 스킵 항목과 사유

| 항목 | 사유 |
|------|------|
| S-16(공개 경로 rate limit)·S-17(reply/forward rate limit) | 리미터 자체가 인스턴스별 인메모리라 R-02(3차 서버리스 적합성)와 함께 다뤄야 함 → 3차로 이동 |
| A-6(calendar range 800일) | Calendar FE 의 AI 컨텍스트 절단·`res.ok` 검사와 한 묶음 → 보류 |
| A-7(mail `isInline` 수용) | 적용 시 10~25MB·HEIC/SVG 가 새로 거부되는 동작 축소 → 미적용. `route/mail/upload.ts` 는 현행대로 `inline` 만 읽는다 |
| A-8(DB `timezone: 'Z'`)·A-9(cookieCache) | 미적용. A-8 은 raw `sql` 의 Date 비교를 drizzle 연산자로 바꾸는 E-09 로 대체(1차에서는 `getStaleL1Assets` 만 반영), A-9 는 R-15 로 대체 |
| A-10(목록 `description` 제거) | 응답 필드 삭제 = 계약 변경 → 미적용 |
| E 계열 대부분·R·P | 2차(즉시 500)·3차(서버리스 적합성)·4차(성능) 배치로 이월 |
| 부트스트랩 throw | `createAdminRoute`/`createManageRoute` 의 `csrfSecret` 미설정 throw 는 승인 범위(요청 403 fail-closed) 밖이라 제거 |

## 검증

- `bunx tsc --noEmit` — **0 오류**.
- `bun test` — **2864 pass, 0 fail**(e2 독립 검증 및 e3-1 재검증 기준). 감사 시점 베이스라인이던 `tests/route/index.test.ts` 의 `DATABASE_URL` 의존 실패는 E-26(라우터 env 게이트)으로 해소.
- `prettier` — 통과.
- 변경 규모(문서 갱신 시점): 미커밋 수정 98 파일(소스 49 · 테스트 32 · 문서 17) + 신규 테스트 12 파일(`tests/compose/*` 5, `tests/deploy/upload-server.test.ts`, `tests/lib/cron-auth.test.ts`, `tests/middleware/require-device-key.test.ts`, `tests/page/admin/db-storage.test.ts`, `tests/route/drive/lifecycle.test.ts`, `tests/route/logs/log-event.test.ts`, `tests/service/domain/logs/device-key.test.ts`).

## 배포 전 필수 조치

- **`bun run db:push` 가 필요하다.** `db/schema.ts` 의 `mail_messages` unique 가 `(account_id, remote_message_id)` → **`(account_id, folder_id, remote_message_id)`** 로 바뀌었다(제약명 `uq_mail_messages_account_remote` 유지). push 전에는 폴더 스코프 upsert 가 기대대로 동작하지 않는다. 마이그레이션 파일은 없다(`drizzle/` gitignored).
- 프로덕션 env 전제: `UPLOAD_SERVER_SECRET`(drive `status`·`complete`·`gdrive-token` 게이트 + lifecycle cron), `BETTER_AUTH_SECRET`(어드민 CSRF)이 없으면 해당 경로가 **503/403 으로 막히는 것이 의도된 동작**이다.
- 운영상 인지할 변경: CalDAV REPORT href 접두사가 요청 컬렉션과 일치하도록 바뀜(클라이언트 재동기화로 흡수), DST 타임존은 VTIMEZONE 블록 생략, Gmail·IMAP 증분 동기화의 `added` 집합과 커서 값이 달라짐(누락 버그 수정 결과), 배지 아이콘 URL 에 DNS 검사 추가(사설 IP 로 해석되는 호스트는 아이콘 생략).

## 문서 갱신

| 문서 | 반영 |
|------|------|
| [../domains/drive.md](../domains/drive.md) | lifecycle GET·POST, 축출 후보 조건·유일 티어 가드, 승격 `viewedAfter`, `status`·`complete` 게이트와 `s3Key` 응답, 상수 시간 비교 |
| [../domains/mail.md](../domains/mail.md) | unique 3열(+`db:push` 미반영 표기), identityScope, upsert/삭제 스코프, 이동 트랜잭션, 폴더 목록 갱신·`__local_` 제외, Gmail historyId 선확보, IMAP 배치 정렬 |
| [../domains/calendar.md](../domains/calendar.md) | ICS 파싱(VALARM·RECURRENCE-ID·TZID·BYDAY), ICS 생성(VTIMEZONE·종일 UNTIL), CalDAV href·free-busy, 삭제 트랜잭션, ETag |
| [../domains/blog.md](../domains/blog.md) · [ai.md](../domains/ai.md) · [metrics.md](../domains/metrics.md) · [resume.md](../domains/resume.md) · [weather.md](../domains/weather.md) | 메시지·AI 메시지 쌍 트랜잭션, 토큰 시크릿 fail-closed, 아카이브 키, web 이력서 admin 우선, 요청 로그 절단 |
| [../logging.md](../logging.md) · [../firmware-logging-contract.md](../firmware-logging-contract.md) | 저장 `deviceId` 를 키 식별자로 강제, 한도 집계 기준 |
| [../admin-features.md](../admin-features.md) | CSRF fail-closed, Ban 세션 회수, 삭제 3종 스토리지 삭제, color 렌더 |
| [../deploy.md](../deploy.md) | upload-server status 게이트·assetId/s3Key 검증, lifecycle cron GET |
| [../reference/](../reference/) | `api-endpoints.md`(lifecycle 메서드·status 응답), `db-schema.md`(unique), `shared-services.md`(gdrive 선택 규칙·로더 상한), `lib-utilities.md`(cron-auth·url-validator·ics), `consumer-contracts.md` §1.5 |
