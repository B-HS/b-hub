# PROCESS — 현재/누적 작업 상태

> 베이스 룰: `CLAUDE.md` + `~/.claude/convention/*`(arrow only, 반환타입 추론, any/unknown 금지, 코드 주석 금지, named export, Factory DI + ServiceDb, `z.infer`/`ReturnType` 유도, 응답 헬퍼, 에러 3파일).
> 문서 진입점: [index.md](./index.md) · 완료 작업 이력: [history/](./history/)

## 현재 진행 중 작업

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
