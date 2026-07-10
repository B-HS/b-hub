# PROCESS — 현재/누적 작업 상태

> 베이스 룰: `CLAUDE.md` + `~/.claude/convention/*`(arrow only, 반환타입 추론, any/unknown 금지, 코드 주석 금지, named export, Factory DI + ServiceDb, `z.infer`/`ReturnType` 유도, 응답 헬퍼, 에러 3파일).
> 문서 진입점: [index.md](./index.md) · 완료 작업 이력: [history/](./history/)

## 현재 진행 중 작업

- **레포 내 진행 중 작업 없음.** 아래 2026-07-10 세션 작업은 전부 완료(검증 통과)됐다.
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
