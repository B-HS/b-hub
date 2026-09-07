# PROCESS — 현재/누적 작업 상태

> 베이스 룰: `CLAUDE.md` + `~/.claude/convention/*`(arrow only, 반환타입 추론, any/unknown 금지, 코드 주석 금지, named export, Factory DI + ServiceDb, `z.infer`/`ReturnType` 유도, 응답 헬퍼, 에러 3파일).
> 문서 진입점: [index.md](./index.md) · 완료 작업 이력: [history/](./history/)

## 진행 중 — 전수 감사 후속: 소비자 계약 고정 후 버그·최적화 수정 (2026-09-06)

> 배경: 2026-09-06 전수 감사(7개 도메인 에이전트 + 코어 직접 검토)로 BUG/RISK/PERF 약 150건 도출. 사용자 전제: **요청/응답 계약 불변 + 현재 돌아가는 소비자 동작 100% 보장**. 합의·레포 지도: [acknowledge/2026-09-06-consumer-repos-and-compat.md](./acknowledge/2026-09-06-consumer-repos-and-compat.md). 발견 목록: [quality-assurance/2026-09-06-audit-findings.md](./quality-assurance/2026-09-06-audit-findings.md)

- [x] a. 감사 — 도메인별 발견 목록 작성(스크래치패드 7파일 → quality-assurance 문서로 통합)
- [x] b. 소비자 레포 파악 — 로컬 2개(bblog·RESUME) + GitHub 코드 검색으로 11개 식별, 전부 `~/development/` 에 클론(사용자 승인)
- [x] c. 소비자 계약 인벤토리 — 5개 에이전트 결과를 [reference/consumer-contracts.md](./reference/consumer-contracts.md) 로 통합(1,424줄). 소비자 판정: 런타임 소비자 = bblog·RESUME·mail·Calendar·Storage·Rirekisyo·weather·ESP32 2종·dashboard·Banga(auth 만), 비소비 = nextjs-portfolio(docs), hn-alert(대상 도메인 `/api/hn` 삭제됨, 전면 고장)
- [x] d. 수정 계획 — 계약 대조 분류를 [quality-assurance/2026-09-06-audit-findings.md](./quality-assurance/2026-09-06-audit-findings.md) 말미 "계약 대조 결과" 에 기록. 사용자 결정: A-1~A-5 적용, A-6~A-9 는 심층 영향 검토 후 재결정, A-10 미적용, Rirekisyo 보류(acknowledge 참조)
- [x] d2. A-6~A-9 심층 영향 검토 — 워크플로 12 에이전트 완료. 결과: A-6 조건부(Calendar FE 선행 필요)·A-7 조건부(동작 축소)·A-8 미적용·A-9 미적용. 근거는 acknowledge 문서. 사용자 재결정 대기
- [x] e. 1차 수정(Workflow 26 에이전트) — D-01~D-22, S-01~S-15, C-15 구현. 전체 typecheck 0 오류·테스트 2828 pass(베이스라인 1건 제외)·prettier 통과. 91 파일 변경(미커밋). S-16·S-17 은 3차(R-02)로 이동
- [x] e2. 1차 후속(Workflow 13 에이전트 완료, 독립 검증 tsc 0·2864 pass·0 fail) — 검증자 지적 반영: F-7 Gmail 식별자 범위 유지(계정 단위 1행), F-1 이동 원자성(unique 충돌 방지), F-2 증분 동기화 폴더 카운트 생략, F-3 status 콜백 s3Key 대조, F-4 로그 배치 사전 검사 원복, F-5 라우터 env 게이트(E-26)
- [x] e3-1. 소비자별 독립 회귀 리뷰(워크플로 7 리뷰어) — 미승인 차이 3건(부트스트랩 throw·mail 이동 오삭제·font 실패 캐시) 조정자가 직접 수정, 재검증 tsc 0·2864 pass·prettier 통과. 상세: acknowledge 문서
- [x] e3-2. 1차 문서 갱신(에이전트, 문서 20 수정 + history 신규) — domains/{drive,mail,calendar,logs,resume}.md·reference/shared-services.md·consumer-contracts §1.5·findings 상태. **주의: `db:push` 필요(mail_messages unique 가 (accountId, folderId, remoteMessageId) 로 변경). e2 완료 전 실행 금지**
- [x] e3-3. 2차 문서 갱신 완료 — domains/{blog,badge,resume,weather,spotify,mail,ai,drive,calendar,metrics}.md · admin-features · deploy · metrics-client-contract · reference/{api-endpoints,lib-utilities,shared-services,consumer-contracts} · findings 상태 표기 + history/2026-09-07-audit-batch2.md 신규
- [x] f. 2차 수정 완료(독립 회귀 리뷰 6 리뷰어 → 미승인 차이 4건 HEAD 의미로 원복, 재검증 tsc 0·3011 pass·prettier 통과) — 브랜치 `fix/audit-batch2-immediate-errors`, 워크플로 27 에이전트 · 파일 비겹침 10그룹. E-01~E-08·E-10~E-12·E-14~E-21·E-23~E-25·E-28 + 승인 A-1~A-5 + C-01·C-04·C-10·C-11 반영. 검증 tsc 0 · 3010 pass / 0 fail. E-13 은 보류(`posts` 에 작성자 컬럼 없음), E-09 는 4차 이월. 요약: [history/2026-09-07-audit-batch2.md](./history/2026-09-07-audit-batch2.md)
- [ ] g. 3차 수정(진행 중, 브랜치 fix/audit-batch3-serverless, Workflow 8그룹) — R-01~R-04·R-06·R-09~R-16·R-18~R-21·R-23~R-31 + S-16·S-17 + E-09. 착수 결정은 acknowledge 참조
  - [x] g1. 워크플로 구현 + 최종 검증 완료(tsc 0 · 3184 pass)
  - [x] g2. 조정자 후속 — Discord 알림 await 를 HEAD 와 같은 fire-and-forget 으로 원복(검증자 지적: 응답 지연), Redis 공유 rate limit 스토어 배선(`compose/index.ts` → mail·ai), `service/shared/redis-client.ts` 공용화(lazyConnect + enableOfflineQueue:false 조합에서 첫 명령이 연결 전에 거부되던 결함 수정: 첫 명령은 연결 완료를 기다림). 재검증 tsc 0 · 3198 pass · prettier·린트 통과
  - [x] g3. 독립 회귀 리뷰(워크플로 7 리뷰어 중 6 완료, mail-calendar-ai 는 조정자 직접 검토) → 미승인 차이 3건 원복(admin GET 로그아웃 signOut 복원, purge 크론 GET 전용, 대시보드·오버뷰 use('*') 가드 복원). 재검증 tsc 0 · 3198 pass · prettier 통과. 결과: acknowledge 문서
  - [x] g4-1. 코드 커밋 — 도메인별 13개 Conventional Commit(`22d357c` core … `aa3bd28` deps), AI 트레일러 없음
  - [x] g4-2. 문서 갱신 완료 — [history/2026-09-07-audit-batch3.md](./history/2026-09-07-audit-batch3.md) 신규 + domains 10·reference 6·logging·admin/manage-features·deploy·architecture·findings·index 갱신, docs 커밋 후 `fix/audit-batch3-serverless` 푸시
  - [x] g4-3. docs 커밋 `docs: 3차 수정(서버리스 적합성·공개 rate limit) 반영 및 이력 기록` 후 `fix/audit-batch3-serverless` 푸시 완료, `fix/audit-batch4-performance` 분기 완료(미푸시)
- [ ] h. 4차 수정 — PERF. 착수 결정·그룹 구성은 acknowledge "4차 배치 착수 결정" 참조. 대상: P-01·P-02·P-05~P-09·P-12·P-13·P-15·P-17~P-23 중 응답 바이트 불변 부분만. 보류: P-03(지연 import, preview 배포 실검증 필요)·P-04(A-9)·P-10·P-11(프로바이더 프로토콜 변경)·P-14 의 description 제외·LIMIT·P-16 이미지 축소·캐시·P-17 Redis INCR·P-18 timeRange·P-21 countDocuments 캐시·P-22 LIMIT
  - [x] h1. 워크플로 구현 완료(2026-09-07, 에이전트 21, 10그룹 전부 검증 ok, 최종 tsc 0 · 3424 pass · prettier 통과, 조정자 재검증 동일). 62 파일 수정 + 신규 테스트 10. 정당한 스킵: P-09 다중행 upsert(max_allowed_packet·VALUES() deprecated)·P-12 발신자 GROUP BY(상위 N 의미 변화)·markAllRead(이미 단일 UPDATE)·P-19 blob 분리(ServiceDb 계약 확산)·breadcrumb 체인·P-21 countDocuments·P-20 resolveClient(route 파일 범위 밖)·P-16 앨범아트·P-15 썸네일 순차(캐시가 더 큰 절감)·P-17 lastUsedAt(3차 결정 유지)
  - [x] h2. 독립 회귀 리뷰 완료(워크플로 7 리뷰어, 미승인 1건은 재검증에서 반박 → 원복 없음). 조정자 후속: 중복 인덱스 2건 제거, `resetMongo(stale?)` 멱등화, comments·messages 목록 타이브레이크. 재검증 tsc 0 · prettier 통과. 상세: acknowledge "4차 배치 독립 회귀 리뷰 결과와 조정자 후속 조치"
  - [x] h3. 도메인별 커밋 12건(`704ccd0` blog … `b808236` db) → 문서 갱신 워크플로(작성자 4 + 정합성 검사·수정·재검사, 잔여 5건은 조정자 수정: resume 인덱스·lib 테스트 수·shared-services 줄 참조·history 변경 규모·auth lastUsedAt) → docs 커밋·푸시. **db:push 대상: P-02 인덱스 8종 추가 + 중복 3종 제거**(FK 컬럼의 `idx_subscription_user`·`idx_mail_sync_logs_account` 는 push 실패 실측 후 유지)
- [x] i. 검증 — 배치마다 `bunx tsc --noEmit` 0 · `bun test` 통과(1차 2864 → 2차 3011 → 3차 3198 → 4차 3427) · 소비자별 독립 회귀 리뷰(3차 7·4차 7). 배포 전·후 실동작 확인은 사용자 수행: [quality-assurance/2026-09-07-audit-deploy-verification.md](./quality-assurance/2026-09-07-audit-deploy-verification.md)
- [x] j. 배포(2026-09-07) — 프로덕션 `db:push` 완료(1차 실행은 `ER_DROP_INDEX_FK` 로 중단돼 FK 인덱스 2종을 스키마에 유지 후 재실행, `No changes detected` 확인) → 스택 4개를 dev 에 fast-forward 병합·푸시(`d226fc7`) → Vercel 프로덕션 자동 배포 완료(11:52 UTC, `/api/logs/purge` 401 로 반영 확인). 무인증 스모크 통과(health·blog 필드 순서·badge `CDN-Cache-Control`+rate limit 헤더·admin 가드 303·GET 로그아웃 302+쿠키 무효화·metrics/weather 401 정책). Docker 재배포 완료(upload-server `~/server/b-hub/deploy/upload-server` 에서 `--build`, caldav-proxy 는 `~/server/caldav-proxy` 사본 갱신 후 `~/server` 프로젝트에서 `--build`). 소비자 확인(사용자, 2026-09-07): bblog·RESUME·mail·Calendar·Storage 정상, weather/ESP32·dashboard·Spotify 위젯·/manage 는 추후. 통합 패치로그: [history/2026-09-07-audit-patch-log.md](./history/2026-09-07-audit-patch-log.md). 남은 사용자 작업: 체크리스트 4절(하루 관측), `.env.production.local` 삭제
- 후속 결정 대기: P-03 지연 import(preview 검증 후), P-10·P-11(IMAP/Gmail 호출 축소), Rirekisyo K-1/K-2, A-6~A-10 보류 유지, GitHub Dependabot high 1건(dev 푸시 시 알림, 별도 확인)

## 진행 중 — 배포 후 이슈 (2026-09-07 21시대 KST)

> 사용자 보고: Gmail 동기화 실패(연결 테스트는 성공), weather 웹 3개 예보 전부 실패. mail 클라이언트 콘솔의 sandbox iframe 스크립트 차단 메시지는 의도된 보안 동작(조치 불필요).

- [x] a. 원인 구조 파악 — `/admin/logs` 에 `INTERNAL_ERROR "Failed query: update mail_sync_logs set status, duration_ms …"`. 동기화 본문 실패 후 catch 경로가 원문(쿼리·파라미터 포함, 64KB 초과 추정)을 `error_message`(text) 에 쓰다 실패해 원인이 가려짐. weather 는 `WEATHER_KMA_API_ERROR` 가 수 초 안에 8건 → 타임아웃이 아니라 즉시 거부(KMA 는 키 오류를 HTTP 403 으로 응답, 감사 이전 코드도 4xx 는 실패). 로그에는 사유가 남지 않았음(AppError 는 `errorDetail` 미설정)
- [x] b. 수정 1 `04a8ce3` fix(mail) — 실패 메시지 2000자 절단, 로그 기록 실패가 원인을 덮지 않게 try/catch, 첨부 `message_id` null 방지(NOT NULL). 배포됨
- [x] c. 수정 2 `48268a8` fix(logs) — `describeAppError` 로 AppError 의 `details.detail`/`message` 를 오류 로그 설명에 기록(`/admin/logs` 에서 KMA HTTP 상태·메일 원문 확인 가능). 배포됨
- [x] d. 원인 확정 — 재시도 로그 `MAIL_PROVIDER_ERROR (Failed query: delete from mail_messages where (account_id = ? and remote_message_id in …)`. 1차 unique 변경으로 Gmail 계정 단위 조회·삭제의 `(account_id, remote_message_id)` 인덱스 경로가 사라져 전체 스캔 + lock wait. weather 는 KMA `HTTP 401`(= 빈 serviceKey 응답, 실측) → 사용자 결정으로 보류
- [x] e. 수정 3 `fe0fab8` fix(mail) — `idx_mail_messages_account_remote` 복원(**db:push 필요**) + `describeThrownError` 로 cause 기록. 배포됨. 기록: [bug/2026-09-07-mail-sync-account-remote-index.md](./bug/2026-09-07-mail-sync-account-remote-index.md)
- [x] f. 프로덕션 `db:push`(`idx_mail_messages_account_remote` 추가) 후 사용자 확인: **Gmail 동기화 정상**(2026-09-07). docs(bug·db-schema·deploy·mail) 반영·커밋. weather KMA 401 은 사용자 결정으로 보류
- 부수: `.claude/settings.json`(gitignored)에 읽기 전용 허용 목록 추가(사용자 요청 "자잘한 조회는 권한 안 묻기")
- 부수: `tests/route/index.test.ts` 가 `DATABASE_URL` 없는 환경에서 실패(`route/index.ts:101` 의 `getEnv()` 의존). 수정 대상에 포함

## 최근 완료 작업 — 웹 이력서(resume.gumyo.net) DB 전환: cv 슬롯 재정의 + 공개 조회 (2026-08-29)

> 배경: resume.gumyo.net(별도 레포 RESUME)의 콘텐츠를 정적 번역 파일에서 DB 로 전환. 사용자 결정으로 `resumes.type='cv'`(구 職務経歴書 스키마, 실데이터 없음 전제)를 ko/en/jp 3개 언어 웹 이력서 슬롯으로 재정의한다. 편집은 기존 `/manage/resume` JSON 편집기 그대로. 합의: [acknowledge/2026-08-29-cv-web-resume.md](./acknowledge/2026-08-29-cv-web-resume.md)

- [x] a. `dto/resume/resume-data.ts` — `cvDataSchema` 를 웹 이력서 스키마(LocalizedText 기반)로 교체
- [x] b. `service/domain/resume/resume.ts` — `getPublicCv` + `ResumeServiceDb.getLatestResumeByType`
- [x] c. `compose/resume.ts` — `getLatestResumeByType` Drizzle 구현
- [x] d. `route/resume/resume.ts` — `GET /public/cv` (인증 없음, 최신 cv 1건, `{ cv, updatedAt }`)
- [x] e. 테스트 갱신 — dto(cv 스키마)·service(getPublicCv)·route(공개 엔드포인트) — resume 3파일 44 pass
- [x] f. docs 갱신 — domains/resume.md · reference/api-endpoints.md
- [x] g. 검증 — `bunx tsc --noEmit` 0 에러 · resume 테스트 44 pass · prettier 통과 (rebase 후 신규 base 에서 재검증)
- 부수 발견: 워킹트리에 있던 우발적 노이즈 변경(`drizzle.config.ts` 말단 `O` 문법 오류, `dto/calendar-group.ts` 후행 공백, `masterdata/locations.json` 말단 개행 제거)을 `git checkout` 으로 원복함
- 원격 dev 가 force-update 로 재작성되어 있어, 본 커밋을 신규 origin/dev 위로 rebase 해 반영함

### 웹 이력서 admin 수정 엔드포인트 + customSections (2026-08-29 후속 2)

> resume.gumyo.net 인라인 편집 기능(소비자 프론트)의 백엔드. 합의: 세션 + `role==='admin'` 게이트.

- [x] a. `webResumeDataSchema` 에 `customSections`(label + period/description items, `.default([])` 하위호환) 추가
- [x] b. `PATCH /api/resume/web` — 무인증 401 · 비 admin 403 · body `webResumeDataSchema` 검증(400) · web 행 없으면 404, `updateWebResume` 서비스로 최신 web 행 data 교체
- [x] c. 테스트 — dto(customSections 기본값·파싱)·service(updateWebResume 성공/not_found)·route(admin 200/403/401/400/404), resume 3파일 59 pass
- [x] d. CORS — 기존 설정이 PATCH·credentials 허용 확인(hono cors 기본 allowMethods + `credentials: true`), 변경 불필요
- [x] e. 검증 — `bunx tsc --noEmit` 0 에러 · prettier 통과 · docs(domains/resume·reference/api-endpoints) 갱신

### 정정 — cv 실데이터 발견으로 web 타입 신설 (2026-08-29 후속)

> 배포 직후 검증에서 기존 cv 행(일본어 職務経歴書) 발견 — "cv 실데이터 없음" 전제 붕괴. `/public/cv` 가 해당 문서를 공개 서빙하는 상태였다. 사용자 결정(A안)으로 cv 원복 + `web` 타입 신설. 경위: [acknowledge/2026-08-29-cv-web-resume.md](./acknowledge/2026-08-29-cv-web-resume.md)

- [x] a. `dto/resume/resume-data.ts` — 구 `cvDataSchema`(職務経歴書) 원복, 웹 이력서 스키마는 `webResumeDataSchema` 로 개명
- [x] b. `dto/resume/resume.ts` — `RESUME_TYPE` 에 `'web'` 추가, create discriminated union·update union 확장
- [x] c. `service`·`route` — `getPublicWebResume` / `GET /public/web` (`{ webResume, updatedAt }`) 로 변경
- [x] d. `page/manage/pages/resume.tsx` — type 필터에 `web` 허용
- [x] e. 테스트 — cv(구 스키마)·web 양쪽 픽스처로 재작성, 50 pass
- [x] f. docs — domains/resume.md·reference/api-endpoints.md web 기준 정정, acknowledge 경위 기록
- [x] g. 검증 — `bunx tsc --noEmit` 0 에러 · resume 테스트 50 pass · prettier 통과

## 최근 완료 작업 — metrics 도메인 신설 (2026-07-22)

> 시스템 모니터링 대시보드의 수집 API. 클라이언트(Tauri 데스크톱/headless 데몬/ESP32)가 시스템 정보 JSON 을 주기 전송하면 MongoDB 에 저장한다. 토큰(별칭·만료일·scope) 메타는 MySQL, 로그 본문·디바이스 레지스트리는 MongoDB(`MONGODB_URI`). 클라이언트 레포: `~/machboard` (설계 정본: 그쪽 `docs/design.md`).
>
> **도메인명 변경(사용자 결정)**: 서버 도메인명은 `machboard` → **`metrics`** 로 확정(테이블 `metrics_token`, 에러 `METRICS_*`, 라우트 `/api/metrics/*`, 헤더 `X-Metrics-Token`, compose `composeMetrics`, 어드민 `/admin/metrics/tokens`). **클라이언트 프로젝트명은 `machboard` 유지**(레포·에이전트 명칭). 아래 체크리스트의 `machboard_*` 표기는 전부 `metrics_*` 로 실현됐다.
> **mongodb v6 고정**: `mongodb@^6`(6.20.x) 고정 — 7.x 의 bson 이 Bun 1.3.0 미구현 `node:v8` `startupSnapshot.isBuildingSnapshot` 을 호출해 모듈 로드가 크래시(`NotImplementedError`). v6 은 핑·인덱스 생성 실검증. 업그레이드 전 Bun 지원 확인 필요.
> **Mongo 아카이브 도입(2026-07-22 사용자 결정: R2·핫 7일·매일)**: Atlas 용량 절약을 위해 매일 cron(`/api/metrics/archive`, `20 4 * * *`)이 7일 경과 로그를 일자별 JSONL gzip 으로 R2(`metrics-archive/`) 업로드 후 삭제. 업로드 성공 후에만 삭제(유실 방지), 동일 키 덮어쓰기로 멱등. Google Drive 안은 OAuth 토큰 의존성 때문에 배제. `composeMetrics` 가 storageService 를 주입받게 됨. cron-auth 는 재공용화(`lib/cron-auth.ts`).
> **하트비트 크론+Discord 알림 제거(2026-07-22 사용자 결정)**: "대시보드 볼 때만 상태 확인하면 되고 Discord 통보 불필요" — `route/metrics/heartbeat.ts`·`checkHeartbeats`·`MetricsAlerter`·`downAlertedAt`·`lib/cron-auth.ts`(추출 원복, drive lifecycle 로컬 헬퍼 복원)·vercel 크론 제거. 온라인/오프라인은 `/api/metrics/devices` 조회 시 계산으로 유지. 아래 체크리스트 h 의 heartbeat-check·고도화 합의의 "하트비트 다운 감지 Discord 알림" 항목은 이 결정으로 폐기됨.

### 사용자 합의 (2026-07-22)

- 토큰: MySQL `machboard_token`(sha256 해시·alias·expiresAt·revokedAt) + **scope `client`(수집 전용) / `admin`(수집+조회+토큰 관리)**. 최초 admin 토큰은 `/admin` SSR 에서 발급.
- 로그 본문: MongoDB — 클라 JSON(payload)을 그대로 저장 + 메타(deviceId·hostname·os 등) + receivedAt. TTL 90일.
- 조회 UI: Tauri 어드민 탭(admin scope 토큰 등록으로 로그인, 디바이스 목록+시계열 차트). 토큰 관리 UI 는 SSR `/admin` + Tauri 둘 다.
- 고도화 포함: 오프라인 버퍼+재시도(클라), 하트비트 다운 감지 Discord 알림, 토큰별 일일 rate limit+바디 크기 제한, 로그인 시 자동 시작(클라).

### 체크리스트 (add-domain.md 절차)

- [x] a. env — `lib/env.ts` 에 `MONGODB_URI` optional 추가
- [x] b. DB — `db/schema.ts` `metrics_token` 테이블 + 타입 export(`MetricsToken`/`NewMetricsToken`), `db/mongo.ts` Mongo 싱글턴(+인덱스 보장, `db:push` 반영)
- [x] c. 에러 3파일 — `METRICS_*` 코드·메시지·상태 8종
- [x] d. DTO — `dto/metrics/`(token·ingest·query)
- [x] e. 서비스 — `service/domain/metrics/`(token·log: ServiceDb 주입 패턴)
- [x] f. compose — `compose/metrics.ts`(+types·index 배선, MONGODB_URI 없으면 graceful `{}`)
- [x] g. 미들웨어 — `middleware/require-metrics-token.ts`(Bearer/X-Metrics-Token, scope·rate limit)
- [x] h. 라우트 — `route/metrics/`(ingest 단건/배치, tokens, devices/logs/series, heartbeat-check 크론) + `route/index.ts` 마운트 + `vercel.json` 크론(`*/10 * * * *`)
- [x] i. 어드민 SSR — `/admin/metrics/tokens` 토큰 관리 페이지(admin-page.md 규약, RevealBanner 평문 1회)
- [x] j. 테스트 — dto·service·middleware·route·admin(전체 스위트 2588+ pass, HTTP E2E 로 수집→조회→시계열→하트비트→폐기 검증)
- [x] k. 검증 — `bunx tsc --noEmit`·`bun test`·`db:push` 반영 완료
- [x] l. 문서 — `docs/domains/metrics.md`·`docs/metrics-client-contract.md`·reference 4종·`admin-features.md`·`index.md` 갱신

## 직전 완료 작업

- 2026-07-10 세션 작업은 전부 완료(검증 통과)됐다.
- **후속(레포 외)**: 클라이언트 FE(mail·calendar·rirekisyo)를 원격 AI 계약(providers + `completions/stream` SSE)으로 재작업 — 이 레포가 아닌 소비자 프론트에서 진행. 배경: [history/2026-07-10-local-remote-harmonize.md](./history/2026-07-10-local-remote-harmonize.md).

## 최근 완료 작업 — 2026-07-10 세션 (상세 체크리스트)

> 조화 이력 요약: [history/2026-07-10-local-remote-harmonize.md](./history/2026-07-10-local-remote-harmonize.md) · 사용자 셀프서비스 페이지: [manage-features.md](./manage-features.md) · AI 도메인: [domains/ai.md](./domains/ai.md)

### codex 모델 목록 최신화 + 모델 캐시 TTL 자동 갱신 (2026-07-10)

> 배경: mail·bcalendar 모델 선택에 GPT-5.1 Codex 계열만 노출. 원인 2중 — ① codex `/models` 의 `client_version=0.50.0` 이 1년 이상 구버전이라 최신 모델(gpt-5.6 계열, 2026-07-09 GA)이 목록에서 제외, ② fallback 상수도 gpt-5.1 계열, ③ 캐시(`ai_models`)는 수동 refresh 전까지 영구 stale. 웹 조사로 확정: 현행 Codex 모델 = gpt-5.6-sol(기본)/terra/luna(+gpt-5.5·gpt-5.4 계열), Codex CLI 최신 = 0.144.1(2026-07-09, github.com/openai/codex releases).

- [x] a. codex-provider — `DEFAULT_CLIENT_VERSION` 0.50.0 → 0.144.1, `CODEX_FALLBACK_MODELS` gpt-5.1 계열 → 현행 Codex 라인업 전체 7종(gpt-5.6-sol/terra/luna·gpt-5.5·gpt-5.4·gpt-5.4-mini·gpt-5.3-codex-spark). 기본 조회는 API 응답 전체를 필터 없이 매핑(정본은 API)
- [x] b. ai-model — 24h TTL 자동 갱신을 도입했다가 **사용자 결정으로 제거, 캐시 전용 유지**(갱신은 refresh 로만). 결정: [acknowledge/2026-07-10-ai-model-cache-decision.md](./acknowledge/2026-07-10-ai-model-cache-decision.md)
- [x] c. 테스트 — ai-model 3건(listCached 캐시 전용·refresh 갱신·refresh 실패 throw), codex-provider fallback 기대값(7종) + 기본 client_version 어서션
- [x] d. 검증 — bunx tsc --noEmit 0 · bun test 전체 pass · prettier 통과 · docs(domains/ai·reference/api-endpoints·acknowledge) 갱신

### codex 인증 access token 단독 방식 병행 지원 (2026-07-10)

> 배경: codex 프로바이더 인증이 OAuth JSON(idToken+accessToken+refreshToken 3필드, refresh 자동 갱신)만 지원. 발급받은 access token 단독(refresh 없음)으로도 등록·사용 가능해야 한다. 공식 근거: codex-rs 가 personal access token(`at-` 접두사, refresh 없음) 인증을 지원하며, OAuth access_token JWT 에도 `https://api.openai.com/auth`.chatgpt_account_id claim 이 있다.

- [x] a. dto/ai/provider.ts — codex credentials 를 union 으로: oauth 3필드(기존) / token 단독 {accessToken, accountId?}
- [x] b. ai-provider-factory — refreshToken 없으면 refresh skip, JWT 만료 시 reauth 마킹, upstream 401 시 reauth 마킹(token 방식 한정), accountId 를 idToken→accessToken claim 순으로 파싱
- [x] c. ai-connection — buildStored 가 token 방식 저장(accountId 는 입력 ?? accessToken claim, 없으면 AI_CREDENTIALS_INVALID), authType 'token' 저장·재등록 시 갱신
- [x] d. compose/ai.ts — updateCredentials 가 authType 도 함께 갱신
- [x] e. 테스트 — dto union 파싱, factory(refresh skip·만료 reauth·401 reauth·accountId 파싱), connection(token 등록·verify·재등록 authType)
- [x] f. 검증 — bunx tsc --noEmit 0 · bun test 전체 pass · docs(domains/ai) 갱신

### AI 채팅 SSE 스트리밍 엔드포인트 추가 (2026-07-10)

> 배경: 원격 AI Provider 시스템의 chat/completions 는 upstream SSE 를 서버에서 소비·집계해 단일 JSON 반환. 클라이언트 채팅 패널의 토큰 타이핑 UX 를 위해 delta 를 SSE 로 relay 하는 엔드포인트 추가. usage 집계·세션 저장·rate limit·에러 체계는 유지.

- [x] a. SSE/NDJSON 파서 유틸 — service/domain/ai/ai-sse.ts (parseSseBlock·iterateSseEvents·iterateStreamLines)
- [x] b. provider client 에 completeStream 추가 — ai-provider.ts 타입 + codex(Responses SSE)·anthropic(/v1/messages stream:true)·ollama(/api/chat stream:true NDJSON). codex complete 는 completeStream 소비로 재구성(동작 동일)
- [x] c. ai-chat 서비스 스트리밍 변형 — sendStream(세션 저장·touch·logUsage 동일 후처리)·completeStream(touchUsed·logUsage), 공통 조립 헬퍼 추출
- [x] d. SSE 라우트 — POST /api/ai/completions/stream · POST /api/ai/sessions/:sessionId/messages/stream (streamSSE, delta/done/error 이벤트, 스트림 시작 전 오류는 JSON errorResponse)
- [x] e. 테스트 — ai-sse 파서·provider completeStream 3종·ai-chat 스트리밍 집계/저장/고아 방지·route SSE 형식/401/사전 오류 JSON
- [x] f. 검증 — bunx tsc --noEmit 0 · bun test 전체 pass (2410 유지 + 신규) · docs(api-endpoints·domains/ai) 갱신

### /manage AI 섹션을 원격 AI Provider 계약으로 재작성 (2026-07-10)

> 배경: origin/dev 위에 cherry-pick 된 /manage 커밋이 폐기된 AiService(listKeys/addKey/getStatus)를 참조해 tsc 11 에러. 원격 aiConnectionService 계약으로 재작성.

- [x] a. 원격 AI 계약 파악 — route/ai/connection.ts · service/domain/ai/ai-connection.ts · dto/ai/provider.ts · compose/ai.ts · db/schema.ts(ai_providers)
- [x] b. page/manage/pages/ai.tsx 재작성 — aiConnectionService 기반 연결 목록(자격증명 미노출·status 표시)+등록 폼(codex 3필드 / anthropic·ollama apiKey)+삭제, POST→303 (`createManageAiProvidersRoute`, `/manage/ai/providers`)
- [x] c. overview.tsx AI 요약을 원격 providers 기준(연결 수/상태)으로 변경 — 공용 `AiProviderStatusList`(components.tsx) 사용
- [x] d. page/manage/index.ts·루트 index.ts 배선을 aiConnectionService 로 교체 (ManageRouteDeps 포함)
- [x] e. admin/pages/ai.tsx RowAction confirmText→confirm(data-confirm) 계약 정합 — 파괴적 확인 동작 유지
- [x] f. nav.ts AI 항목 /manage/ai/providers·Providers 로 변경, flash(ai_credentials_invalid·ai_reauth_required)·util(errorToFlashCode AI 매핑, aiProviderStatusBadgeKind) 갱신
- [x] g. 테스트 갱신 — tests/page/manage/{helpers,ai.test,overview.test,index.test} 를 aiConnectionService 스텁 기준으로 (자격증명 미노출 어서션 포함)
- [x] h. 검증 — bunx tsc --noEmit 0 에러 · bun test 2410 pass / 0 fail (203 파일) · prettier --check 통과

## 완료 작업 — 2026-07-02 세션 (상세 체크리스트)

### 의존성 최신화 (2026-07-02, 브랜치 `chore/deps-update`) — 결정: [acknowledge/2026-07-02-deps-upgrade.md](./acknowledge/2026-07-02-deps-upgrade.md) · 이력: [history/2026-07-deps-upgrade.md](./history/2026-07-deps-upgrade.md)

- [x] 안전 최신화 + breaking major 3종(better-auth 1.6 · hono 4.12 · zod 4+hono-openapi 1) — 상세는 history 문서. 커밋 `c70b372`·`c3adc1f`·`b04e93f`·`5887a60`.
- [x] docs 갱신 + history 이관 + docs↔코드 정합 재검증.
- [x] FE 소비자 영향 검수 매뉴얼 작성 — [quality-assurance/fe-deps-impact-check.md](./quality-assurance/fe-deps-impact-check.md). FE 프로젝트별 검수는 사용자가 직접 수행.
- [x] push 완료(커밋 7개, `ed87433` 까지). `zod-openapi`·`@hono/zod-validator` 제거 결정 사용자 승인.
- [x] docs/ 전수 감사·고도화(2026-07-02) — 살아있는 문서 36개 문서당 1 에이전트(Opus max) + 커버리지·교차 일관성 2단계. 정정 109건·갭 보강 72건(전부 코드 실측 기반), 기준 헤더 `ed87433` 통일, 링크 무결성 0건 깨짐, 공유 수치(에러코드 101·STATUS_MAP 98·API 167·CalDAV 24·테스트 2268/182) 문서 간 정합 확인. DESIGN.md 는 외부 소비자 자산 계약대로 무수정. tsc 0 · 2268 pass 재확인.
- [x] 감사 발견 코드 갭 수정(사용자 승인) — `serviceNameFromPath` 에 `/api/ai` 분기 추가(AI 자동 캡처 에러 라벨 `b-hub-api`→`b-hub-ai`) + 테스트 + logging.md·lib-utilities.md 재정리.
- [x] dev 병합 — 완료(2026-07-08, `0ac4e0d` 까지 dev 반영·production 배포됨). FE 프로젝트별 검수는 [quality-assurance/fe-deps-impact-check.md](./quality-assurance/fe-deps-impact-check.md) 기준으로 사용자가 계속 수행.

## 완료 작업 (이력)

- [bug/2026-07-09-vercel-hono-detection-crash.md](./bug/2026-07-09-vercel-hono-detection-crash.md) — **Vercel production 크래시 수습(2026-07-09)**: 빌더 hono 자동 감지 + better-auth 1.6 exports 조건 불일치 → `/` 크래시. 최종 수정 = `framework: null` + JS 셔임 `api/index.js` + 번들 `api/hub.js`(커밋 `e26ab62`·`c005003`·`09e13e1`). 최종 배포 `b-a24uv1u5c` 스모크 통과, rollback 해제 후 api.gumyo.net promote 완료(사용자 수행, `/`·`/api/health` 200 확인). 배포 계약·Web Analytics 미도입 결정: [acknowledge/2026-07-09-vercel-deploy-contract.md](./acknowledge/2026-07-09-vercel-deploy-contract.md).
- [history/2026-07-deps-upgrade.md](./history/2026-07-deps-upgrade.md) — 의존성 최신화(안전분+보안 nodemailer 9, better-auth 1.6·hono 4.12·zod 4+hono-openapi 1, 미사용 zod-openapi·zod-validator 제거). 단계별 tsc 0·2268 pass.
- [history/2026-07-ai-provider-system.md](./history/2026-07-ai-provider-system.md) — AI Provider 시스템(codex/anthropic/ollama 멀티 프로바이더, 채팅·프롬프트·첨부, 자격증명 암호화, 사용기록). db:push 반영·커밋 완료. 후속 자체 감사(7렌즈×적대적 검증) 확정 32건 보완(쿼터·토큰레이스·고아메시지·레이트리밋 등) + docs 정합 9건, 2268 tests pass.
- [history/2026-07-docs-overhaul.md](./history/2026-07-docs-overhaul.md) — docs/ 전면 고도화.
- [history/2026-06-logging-system.md](./history/2026-06-logging-system.md) — `log_events` 중앙 로깅/에러-이벤트 시스템 (배포 완료, 2051 tests pass).
