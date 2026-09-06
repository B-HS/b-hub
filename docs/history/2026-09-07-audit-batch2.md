# 2026-09-07 전수 감사 2차 수정 배치 (즉시 500·잘못된 값 + 승인 항목)

> 기준: 2026-09-07, 브랜치 `fix/audit-batch2-immediate-errors` @ `af05000` + 워킹트리 미커밋 변경. 발견 목록 정본: [../quality-assurance/2026-09-06-audit-findings.md](../quality-assurance/2026-09-06-audit-findings.md) · 합의·브랜치 운영: [../acknowledge/2026-09-06-consumer-repos-and-compat.md](../acknowledge/2026-09-06-consumer-repos-and-compat.md) · 소비자 계약: [../reference/consumer-contracts.md](../reference/consumer-contracts.md) · 진행 체크리스트: [../PROCESS.md](../PROCESS.md) · 1차 배치: [2026-09-06-audit-batch1.md](./2026-09-06-audit-batch1.md)

## 전제

- 1차 배치 브랜치 `fix/audit-batch1-data-loss-security` 에서 분기했다. dev 머지는 아직 하지 않았다(사용자 지시: 배치별 브랜치를 쌓는다).
- 이번 배치는 **E 계열(즉시 500 또는 잘못된 값)** 과, 1차에서 보류했던 **사용자 승인 항목 A-1~A-5**, 소비자 대조에서 나온 **C-01·C-04·C-10·C-11** 이 대상이다.
- A-1~A-5 는 상태 코드가 바뀌는 변경이라 소비자 계약 표면이 달라진다(아래 [소비자 영향](#소비자-영향)).
- 착수 전에 두 그룹(mail·drive)이 공용으로 쓰는 `lib/db-helper.ts` 의 `isDuplicateKeyError`(mysql2 `ER_DUP_ENTRY` + drizzle `DrizzleQueryError.cause`)를 조정자가 먼저 추가했다.

## 진행 방식

| 단계 | 수행 | 결과 |
|------|------|------|
| f. 2차 수정 | 워크플로 **27 에이전트**, 파일이 겹치지 않는 **10개 그룹** | E-01~E-08 · E-10~E-12 · E-14~E-21 · E-23~E-25 · E-28 + A-1~A-5 + C-01·C-04·C-10·C-11 구현 |
| f. 문서 갱신 | 이 문서 포함 | 아래 [문서 갱신](#문서-갱신) |

## 반영 범위

도메인별로 정리한다. 괄호는 발견 ID.

| 영역 | 반영 |
|------|------|
| blog | 댓글 있는 게시글 삭제를 트랜잭션으로(comments 선삭제, E-01) · 목록·상세에 비admin 공개 필터 강제(A-5/R-17) · 썸네일이 `getByIdWithoutView` 로 조회수 미증가(E-07) · 이미지 complete 의 `width`/`height` 가 `0` 을 `null` 로 변환(C-01) |
| resume | 갱신 필드가 하나도 없으면 UPDATE 자체를 생략(빈 `set({})` 500 제거, E-02) |
| admin·manage SSR | 목록 `page` 쿼리를 공통 `readPage`(최소 1)로 정규화 — 16개 페이지 파일 32곳(E-03) · users Ban 만료일이 `Invalid Date` 면 저장하지 않고 `?flash=err&code=validation` 303, quota 는 `parseIntOr` 폴백 유지 + 음수만 거부(E-24. 독립 회귀 리뷰 후 HEAD 의미로 되돌린 결과) |
| badge·공유 이미지 생성 | resvg WASM 초기화를 Promise 메모이즈로(중복 init 500 제거, E-04) · `fontSize` 폴백을 `\|\|` 로 바꿔 `0` 을 auto 처리(E-05) · `imageGenerator.generate` 예외를 `IMAGE_GENERATE_FAILED` 로 변환(E-06) |
| weather | `/current` 의 `baseDate`/`baseTime` 을 `getKmaBaseDateTime('ncst')`(KST 고정) 결과로 교체 — UTC 배포에서 9시간 어긋나던 값 수정(E-08) |
| spotify | refresh 실패를 `SPOTIFY_API_ERROR`(502)로, 미연결·비활성 계정을 `SPOTIFY_ACCOUNT_NOT_FOUND`(404)로(E-10·A-3) · `createSpotifyProviderFactory` 를 신설해 provider 생성 지점 한 곳에서 `isActive` 집행(E-11·A-4) |
| mail | 중복 계정 409 `MAIL_ACCOUNT_ALREADY_EXISTS`(E-12·A-1) · `Invalid Date` 를 `null` 로(E-19) · `message/rfc822` 첨부가 본문을 덮지 않도록(E-20) · `syncHistorical` 의 폴더 소유 검증과 폴더 불일치 세션 무시(E-28) |
| ai | SSE 중단을 `AbortController`→`AbortSignal`→프로바이더 `fetch` 로 전파 + 파서 `reader.cancel()`(E-14) · codex refresh single-flight 락을 persist 완료까지 유지(E-15) · providers/models 응답의 `displayName` 폴백(C-04) |
| drive | `prepare` 본문 Zod 검증(E-16) · `complete` 가 upload-server 실측 `sizeBytes` 로 쿼터 재검증(E-16) · 해시 중복을 409 `DRIVE_DUPLICATE_FILE` 로 바꾸고 실패 시 자산 `failed` 마감 + 업로드된 티어 실물 정리(E-17·A-2) · L1 전용 자산 다운로드를 R2 스트리밍으로 폴백(E-18) |
| calendar | 구독 토큰 재발급이 구독 존재를 먼저 확인(E-25) · 그룹 PATCH 가 갱신 행을 못 읽으면 404(C-10) |
| metrics | payload 크기 검사를 `Buffer.byteLength` 바이트 기준으로(E-23) · series `$project` 를 배열 인덱스 dot-path 를 처리하는 표현식 빌더로 교체(C-11) |
| caldav-proxy | `Accept-Encoding: identity` 요청 + 응답의 `content-encoding`·`content-length` 제거, 포워딩 로직을 `createProxyFetch` 팩토리로 분리(E-21) |

## 스킵 항목과 사유

| 항목 | 사유 |
|------|------|
| E-09 (raw `sql` 의 JS `Date` 파라미터) | raw `sql` 비교를 drizzle 연산자(`lt`·`gte`)로 바꾸는 쿼리 정리라 **4차(PERF·쿼리) 배치**로 이월. MySQL `@@session.time_zone` 확인은 별도 운영 작업 |
| E-13 (`postsCount` 항상 0) | `posts` 테이블에 작성자 컬럼이 없어(`db/schema.ts:126-140`) 사용자별 게시글 수를 셀 수 없다. 필드 제거는 응답 계약 변경이라 **보류**하고 `0` 리터럴 유지 |
| E-22·E-26·E-27·E-29·E-30 | 1차 배치에서 이미 반영됨 |
| S-16·S-17 | 리미터가 인스턴스별 인메모리라 R-02 와 함께 다뤄야 함 → 3차 |
| A-6·A-7·A-8·A-9·A-10 | d2 심층 검토 결과대로 미적용·조건부 보류(1차 배치 문서 참조) |
| R·P 계열 전체 | 3차(서버리스 적합성)·4차(성능)로 이월 |

## 검증

- `bunx tsc --noEmit` — **0 오류**.
- `bun test` — **3010 pass, 0 fail**(233 파일). 1차 배치 종료 시점 2864 pass 대비 +146.
- 변경 규모(문서 갱신 시점, `git diff HEAD` 기준): 미커밋 수정 **123 파일**(소스 61 · 테스트 42 · 문서 20) + 신규 테스트 5 파일(`tests/compose/spotify.test.ts`, `tests/deploy/caldav-proxy.test.ts`, `tests/route/ai/model.test.ts`, `tests/route/blog/thumbnail.test.ts`, `tests/service/domain/metrics/series-pipeline.test.ts`).
- 소스 61 파일 내역: `service/` 20 · `page/` 17 · `route/` 11 · `compose/` 6 · `dto/` 4 · `deploy/` 2 · `lib/` 1.

## 소비자 영향

상태 코드·응답 값이 바뀐 지점이다. 상세 대조는 [../reference/consumer-contracts.md](../reference/consumer-contracts.md).

| 변경 | 이전 → 이후 | 소비자 |
|------|-------------|--------|
| 중복 메일 계정 연결 | 500 → **409 `MAIL_ACCOUNT_ALREADY_EXISTS`** | mail — `error.message` 만 toast 하므로 호환 |
| drive 해시 중복(complete·직접 업로드) | 500 → **409 `DRIVE_DUPLICATE_FILE`** | Storage — 이 코드를 이미 매핑. upload-server 는 `!ok` 만 봄 |
| drive complete 쿼터 초과(실측 크기 기준) | (검사 없음) → **413 `DRIVE_QUOTA_EXCEEDED`** + 자산 `failed` 마감·실물 정리 | upload-server 는 `!ok` 만 봄. 신고 크기로 쿼터를 우회하던 경로가 막힘 |
| Spotify refresh 실패 / 미연결·비활성 계정 | 500 → **502 `SPOTIFY_API_ERROR`** / **404 `SPOTIFY_ACCOUNT_NOT_FOUND`** | 소비처 미확인. `isActive=false` 토글이 이제 now-playing·playlists·공개 위젯 3경로에서 404 로 드러난다 |
| 비admin 의 게시글 목록·상세 | 미발행·숨김도 노출 → **목록 필터 강제 · 상세 404** | bblog 편집 화면은 admin 쿠키가 전달되므로 유지. 비로그인 초안 URL 열람만 차단. `/:id/thumbnail` 은 예외(필터 없음) |
| AI providers/models `displayName` | `string \| null` → **항상 `string`**(`provider`/`modelId` 폴백) | Calendar·Rirekisyo 의 strict `z.string()` 파싱이 깨지던 문제 해소(무수정 호환) |
| blog 이미지 complete `width`/`height` | `0` → 400 → **`0` 을 `null` 로 수용** | upload-server 무수정. 메타 추출 실패 시 업로드 전체가 실패하던 경로 제거 |
| calendar 그룹 PATCH | `data: null` 가능 → **404 `CALENDAR_GROUP_NOT_FOUND`** | Calendar — `toCalendarGroup(res.data)` 가 `null` 을 받던 경로 제거 |
| metrics payload 크기 상한 | UTF-16 코드유닛 → **UTF-8 바이트** | dashboard 클라이언트와 기준 일치. 멀티바이트 payload 는 이전보다 일찍 413 |
| weather `/current` `baseDate`/`baseTime` | 서버 로컬 시각 → **KMA ncst base time(KST)** | weather 웹·ESP32 는 문자열 형식(`YYYYMMDD`/`HHMM`)만 의존 — 형식 유지, 값이 실제 관측 기준으로 교정됨 |

## 배포 전 필수 조치

- 1차 배치의 **`bun run db:push`**(mail_messages unique 3열)가 여전히 선행 조건이다. 이번 배치는 추가 스키마 변경이 없다.
- upload-server(`deploy/upload-server`)와 caldav-proxy(`deploy/caldav-proxy`)는 별도 Docker 서비스라 **재빌드·재기동이 필요**하다. upload-server 는 `complete` 콜백에 `sizeBytes` 를 추가로 싣고, caldav-proxy 는 압축 헤더 처리가 바뀌었다.

## 문서 갱신

| 문서 | 반영 |
|------|------|
| [../domains/blog.md](../domains/blog.md) | 공개 가시성 강제(목록·상세), 썸네일 조회수 미증가·필터 예외, `deletePost` 트랜잭션, 이미지 complete `0 → null`, `postsCount` 가 0 인 이유 |
| [../domains/badge.md](../domains/badge.md) | `fontSize=0` auto, `IMAGE_GENERATE_FAILED` 실제 throw, WASM init Promise 메모이즈 |
| [../domains/resume.md](../domains/resume.md) | 빈 PATCH no-op(200·`updated_at` 미갱신) |
| [../domains/weather.md](../domains/weather.md) | `/current` base time 이 KMA 기준으로 교정, 남은 TTL 경계 불일치 |
| [../domains/spotify.md](../domains/spotify.md) | provider 팩토리·`isActive` 집행 지점과 영향 경로 3종, refresh 실패 502 |
| [../domains/mail.md](../domains/mail.md) | 중복 계정 409, 날짜 파싱 `null`, `message/rfc822` 본문 보호, historical 폴더 소유·세션 커서 규칙 |
| [../domains/ai.md](../domains/ai.md) | SSE abort 전파·reader cancel, refresh single-flight persist 순서, `displayName` 폴백 |
| [../domains/drive.md](../domains/drive.md) | `prepare` Zod, `complete` 크기 재검증·해시 중복 처리·티어 정리, 다운로드 L3→L1 폴백 |
| [../domains/calendar.md](../domains/calendar.md) | regenerate 404, 그룹 PATCH 행 보장 |
| [../domains/metrics.md](../domains/metrics.md) · [../metrics-client-contract.md](../metrics-client-contract.md) | 바이트 기준 크기 검사, series 배열 인덱스 경로 지원 |
| [../admin-features.md](../admin-features.md) | `readPage` 정규화, Ban 만료일·quota 검증 |
| [../deploy.md](../deploy.md) | caldav-proxy 팩토리·압축 헤더 정리, upload-server 실측 `sizeBytes` |
| [../reference/api-endpoints.md](../reference/api-endpoints.md) | blog 공개 필터·썸네일, mail 409, calendar PATCH 404, drive prepare/complete/download |
| [../reference/lib-utilities.md](../reference/lib-utilities.md) | `lib/db-helper.ts` `isDuplicateKeyError` |
| [../reference/shared-services.md](../reference/shared-services.md) | `storage.getObjectStream`, image-generator init 메모이즈 |
| [../reference/consumer-contracts.md](../reference/consumer-contracts.md) | mail 409, AI `displayName`(M19 해소), Calendar C-10, bblog §3 3·6·9번, Storage §1.5·M7·M8·M9, dashboard 5-5·5-9 |
| [../quality-assurance/2026-09-06-audit-findings.md](../quality-assurance/2026-09-06-audit-findings.md) | 2차 완료 표기, E-13 보류·E-09 4차 이월 사유 |
