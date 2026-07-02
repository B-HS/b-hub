# PROCESS — 현재/누적 작업 상태

> 베이스 룰: `CLAUDE.md` + `~/.claude/convention/*`(arrow only, 반환타입 추론, any/unknown 금지, 코드 주석 금지, named export, Factory DI + ServiceDb, `z.infer`/`ReturnType` 유도, 응답 헬퍼, 에러 3파일).
> 문서 진입점: [index.md](./index.md) · 완료 작업 이력: [history/](./history/)

## 작업: AI Provider 시스템 (2026-07-02, 브랜치 `feat/ai-provider`)

목표: 사용자별 AI Provider(codex OAuth · anthropic API key · ollama cloud API key) 저장/갱신/모델 캐시 + 공용 AI 호출 추상화 + 채팅 세션·이미지 영구화 + 사용자별 프롬프트 템플릿 CRUD + 어드민 SSR + log_events 사용기록. 결정 정본: [acknowledge/2026-07-02-ai-provider-decisions.md](./acknowledge/2026-07-02-ai-provider-decisions.md)

- [x] a. 사전 조사 — provider 3종 API 사실 확정 완료(모델 목록·챗·codex 토큰 갱신·auth.json 형식 → 정리: [domains/ai.md](./domains/ai.md) "외부 프로바이더 API 계약"), 기존 패턴(mail-crypto·mail-provider-factory·compose·route·admin) 통독 완료
- [x] b. 기반 — `db/schema.ts` AI 테이블 6종(`ai_providers`·`ai_models`·`ai_prompts`·`ai_sessions`·`ai_messages`·`ai_attachments`) + `AI_ENCRYPTION_KEY` env + 에러 3파일 `AI_*` 15종 + `lib/credential-crypto.ts` 승격(mail-crypto 는 위임 래퍼로 축소). 검증: tsc 0 errors · 관련 테스트 35 pass · prettier 통과 · `db:generate` DDL 육안 확인(**db:push 미실행**)
- [x] c. DTO — `dto/ai/*` 6종(provider discriminated union·model·prompt·session·chat·attachment). tsc 통과
- [x] d. 프로바이더 — `AiProviderClient` 인터페이스 + anthropic/ollama/codex(SSE) 구현 + factory(복호화·codex OAuth 자동갱신 회전 처리·갱신 불가 시 reauth_required 마킹·createFromStored 등록검증용) + `lib/jwt-decode.ts`. tsc 통과
- [x] e. 서비스 — connection(verify ping·codex accountId 보강·소유권)/model(fetch·replace 저장)/prompt(CRUD)/session(세션·메시지)/attachment(이미지 R2 영구화·vision base64)/chat(프롬프트 stage 주입·provider 호출·usage 로깅·세션 저장 + ephemeral complete). tsc 통과
- [x] f. compose — `compose/ai.ts`(ServiceDb Drizzle 인라인·codex refresh HTTP·usage logger·rate limiter) + `types.ts`·`index.ts` 배선(storageService·logEventService 주입, **키 없으면 graceful `{}` 반환** — acknowledge 정정). tsc 통과
- [x] g. 라우트 — `route/ai/*` 6종(connection·model·prompt·session=세션인증, chat=withAuth+withRateLimit, attachment=multipart) + `route/index.ts` 배선(stub). tsc 통과
- [x] h. 어드민 — `page/admin/db.ts`(listAiProviders/setAiProviderStatus/deleteAiProvider/listAiSessions/listAiPrompts, **credentials select 제외**)·`pages/ai.tsx`(providers 토글·삭제 + sessions·prompts 조회)·`nav.ts`(AI 그룹)·`index.ts` + `tests/page/admin/helpers.ts` 스텁 확장. tsc 통과
- [~] i. 테스트 — dto/service/route/page 미러 + lib(jwt-decode·credential-crypto) *(서브에이전트 3묶음 Opus max 병렬 진행 중, 취합·전체검증 대기)*
- [~] j. 검증 — tsc 각 단계 통과·`db:generate` DDL 확인 완료. **`bun test` 전체·prettier·`db:push` 는 테스트 취합 후**
- [x] k. 문서 — `domains/ai.md`(외부 API 계약 + 파일맵·모델·엔드포인트·흐름·함정) + reference(db-schema 49·api-endpoints 167·env 29·lib-utilities 101)·admin-features·AGENTS.md·index.md·acknowledge(fail-fast→graceful 정정) 갱신 완료

## 완료 작업 (이력)

- [history/2026-07-docs-overhaul.md](./history/2026-07-docs-overhaul.md) — docs/ 전면 고도화.
- [history/2026-06-logging-system.md](./history/2026-06-logging-system.md) — `log_events` 중앙 로깅/에러-이벤트 시스템 (배포 완료, 2051 tests pass).
