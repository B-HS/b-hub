# 2026-07-02 — AI Provider 시스템

> 브랜치 `feat/ai-provider`. 결정 정본: [../acknowledge/2026-07-02-ai-provider-decisions.md](../acknowledge/2026-07-02-ai-provider-decisions.md) · 도메인 문서: [../domains/ai.md](../domains/ai.md)

## 무엇을 했나

사용자별 AI 프로바이더(codex OAuth · anthropic API key · ollama cloud API key)를 저장·자동갱신하고, 어느 기능에도 붙을 수 있는 공용 AI 호출 추상화를 추가했다.

- **DB 6테이블**: `ai_providers`·`ai_models`·`ai_prompts`·`ai_sessions`·`ai_messages`·`ai_attachments` (db:push 반영 완료).
- **프로바이더 추상화**: `AiProviderClient`(listModels/complete/verify) + anthropic/ollama/codex(SSE 파싱) 구현 + factory(복호화·codex OAuth 만료 임박 시 자동 갱신·회전 저장·갱신 불가 시 reauth_required 마킹·`createFromStored` 등록검증용).
- **보안**: 자격증명은 `AI_ENCRYPTION_KEY` 로 AES-256-GCM 암호화(`lib/credential-crypto.ts` 공용 승격, mail 키와 분리). API 응답·어드민 어디에도 `credentials` 미노출(화이트리스트 select).
- **서비스**: connection(verify ping·accountId 보강)·model(fetch·replace 캐시)·prompt(사용자별 CRUD)·session(세션·메시지)·attachment(이미지 R2 영구화·vision base64)·chat(프롬프트 stage 주입 + provider 호출 + usage 로깅 + 세션 저장, ephemeral `complete` 는 도메인 융합 진입점).
- **라우트 19개**(전 세션 인증, chat 2개 레이트리밋) + **어드민 SSR**(providers 토글·삭제, sessions·prompts 조회).
- **사용기록**: `log_events`(`service='b-hub-ai'`) 성공 20/실패 40, 프롬프트 원문·자격증명 미포함.
- **문서**: `domains/ai.md` + reference 전수(테이블 49·라우트 167·env 29·에러코드 101)·admin-features·AGENTS.md·index.md 갱신.

## 검증

- `bunx tsc --noEmit` 0 errors · `bun test` 2260 pass / 0 fail(신규 183, 서브에이전트 3묶음 Opus max 병렬 작성) · prettier 통과.
- `bun run db:push` 로 6테이블 실 DB 반영 확인(각 0 rows, 기존 데이터 무영향).
- 커밋 `feat(ai): AI Provider 시스템 — codex/anthropic/ollama 멀티 프로바이더`(author 단독, co-author 없음, parent 1).

## 취합 중 발견·수정

- **verify 실패 사유 소실**: 세 프로바이더 `verify()` catch 가 `error instanceof Error ? error.message : 'unknown'` 인데 `createAppError` 는 plain object(≠Error)라 실패 사유가 항상 `'unknown'` 으로 소실됐다. `service/domain/ai/ai-provider.ts` 에 `providerErrorMessage`(Error·AppError 덕타이핑 모두 message 추출) 헬퍼를 추가해 3프로바이더에 반영.

## 알려진 제약 / 후속

- **codex `/responses` 는 SSE 전용**(비스트리밍 불가) — 현재 서버가 SSE 를 취합해 단일 응답 반환. SSE 스트리밍을 클라까지 흘리는 건 후속.
- **codex 미확인 3종**(구현 시 실응답으로 확정 대기): `/responses` `OpenAI-Beta` 헤더 필요 여부, access_token 정확한 TTL, ollama cloud `/v1/*` 지원 — [domains/ai.md](../domains/ai.md) "미확인".
- **런타임 활성화 전제**: `.env` 에 32자+ `AI_ENCRYPTION_KEY` 필요. 미설정 시 AI 라우트만 503(앱은 정상).
- **도메인 융합 예시**(메일 답변 생성기 등) 실제 배선은 후속 — `aiChatService.complete` 주입 진입점만 준비됨.
