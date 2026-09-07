# ai 도메인

> 기준: 2026-09-07 (fix/audit-batch4-performance @ 4차 배치 커밋 완료, 비교 기준 `bab14e8`) 코드 검증. **구현 완료**(db:push 반영·커밋 완료). 파일 맵·데이터 모델·엔드포인트·흐름·함정 반영됨. 결정 정본: [../acknowledge/2026-07-02-ai-provider-decisions.md](../acknowledge/2026-07-02-ai-provider-decisions.md) · 작업 이력: [../history/2026-07-ai-provider-system.md](../history/2026-07-ai-provider-system.md)

## 외부 프로바이더 API 계약 (2026-07 조사 확정)

> 출처: `github.com/openai/codex`(codex-rs 소스), platform.claude.com, docs.ollama.com. 조사 에이전트 검증 완료. "미확인" 표기 항목은 구현 시 실응답으로 확정한다.

### codex (OpenAI ChatGPT OAuth — auth.json 등록 방식 + access token 단독)

- **auth.json 구조**: `{ "OPENAI_API_KEY": null, "tokens": { "id_token", "access_token", "refresh_token", "account_id" }, "last_refresh": "<RFC3339>" }` (+선택 `auth_mode`). 등록 시 `tokens` 3종 + `account_id` 를 받는다.
- **access token 단독(2026-07-10 조사 확정)**: codex 공식(codex-rs)이 refresh 없는 access token 인증을 지원한다 — (a) personal access token(`at-` 접두사, opaque, `codex login --with-access-token`·`CODEX_ACCESS_TOKEN`, 만료 1~90일 또는 무기한, refresh 불가), (b) OAuth access_token(JWT) 단독. JWT access_token 에도 `https://api.openai.com/auth`.chatgpt_account_id claim 이 있어 account_id 파싱이 가능하고, opaque 토큰은 codex-rs 가 `GET https://auth.openai.com/api/accounts/v1/user-auth-credential/whoami`(Bearer) 로 메타데이터(chatgpt_account_id 포함)를 조회한다(본 서버는 whoami 미연동 — 등록 시 accountId 입력으로 대체). 챗/모델 호출은 두 방식 모두 동일 헤더(Bearer + ChatGPT-Account-Id).
- **account_id**: 최초 로그인 id_token 의 JWT claim `payload["https://api.openai.com/auth"]["chatgpt_account_id"]`. **refresh 후 access_token 에는 빠질 수 있으므로 등록 시점에 영구 저장**해 재사용한다. 누락 시 백엔드 401/403.
- **토큰 갱신**: `POST https://auth.openai.com/oauth/token`, `Content-Type: application/json`, body `{ "client_id": "app_EMoamEEZ73f0CkXaXp7hrann", "grant_type": "refresh_token", "refresh_token": "<rt>" }` (scope 없음). 응답 `{ id_token?, access_token?, refresh_token? }` — **회전형: 새 refresh_token 이 오면 반드시 교체 저장**(옛 토큰 재사용 시 `refresh_token_reused` 영구 실패). 영구 실패(`refresh_token_expired`/`reused`/`invalidated`, 401) → `reauth_required` 마킹 + 재등록 안내. 갱신 트리거: access_token JWT `exp` − 5분 경과 또는 `last_refresh` + 8일.
- **챗**: `POST https://chatgpt.com/backend-api/codex/responses`. 헤더: `Authorization: Bearer <access_token>` · `ChatGPT-Account-ID: <account_id>` · `originator: codex_cli_rs` · `session_id: <uuid>` · UA. body 는 Responses API 형태 `{ model, instructions, input[], store:false, stream:true, tool_choice:'auto', include:[] }`. **SSE 전용(stream:true 강제)** — 서버가 SSE 를 소비해 `response.output_text.delta` 누적, `response.completed` 의 `usage.input_tokens`/`output_tokens` 취합, `response.failed`/`incomplete` 는 에러.
- **모델 목록**: `GET https://chatgpt.com/backend-api/codex/models?client_version=<ver>` (챗과 동일 인증 헤더, ETag 지원). 응답 `{ models: [{ slug, display_name, description, context_window, ... }] }`. 하드코딩 프리셋 없음 — API 가 정본, 실패 대비 fallback 으로 현행 Codex 라인업 전체(gpt-5.6-sol/terra/luna·gpt-5.5·gpt-5.4·gpt-5.4-mini·gpt-5.3-codex-spark, ChatGPT 로그인 deprecated 인 gpt-5.2·gpt-5.3-codex 제외)를 상수화. **`client_version` 은 백엔드가 모델 가용성을 가르는 기준**이라 구버전을 보내면 구세대 모델만 내려온다 — `DEFAULT_CLIENT_VERSION` 을 최신 Codex CLI 릴리스(2026-07-10 기준 `0.144.1`, github.com/openai/codex releases)로 유지한다.

### anthropic (API key)

- 공통 헤더: `x-api-key: <key>` + `anthropic-version: 2023-06-01`.
- **모델 목록**: `GET https://api.anthropic.com/v1/models` — cursor 페이지네이션(`limit` 1–1000 기본 20, `after_id`/`before_id`, 응답 `has_more`/`first_id`/`last_id`). `data[]` = `{ type:'model', id, display_name, created_at, capabilities?, max_input_tokens?, max_tokens? }`. **키 검증은 이 호출로 충분**(무과금, 무효 키 401).
- **챗**: `POST /v1/messages` — **`max_tokens` 필수**, `system`(string), `messages[{ role:'user'|'assistant', content: string | blocks }]`, `temperature` 0–1. 이미지 입력 block: `{ type:'image', source:{ type:'base64', media_type, data } }`. 응답: `content[]` 중 `type==='text'` 의 `text`, `stop_reason`, `usage.input_tokens`/`output_tokens`.
- 에러 envelope: `{ type:'error', error:{ type, message } }` (401 `authentication_error`, 429 `rate_limit_error`, 529 `overloaded_error` 재시도 대상).

### ollama cloud (API key)

- 인증: `Authorization: Bearer <key>` (발급: `ollama.com/settings/keys`). 네이티브 `/api/*` 경로 사용(`/v1/*` 의 cloud 지원 미확인).
- **모델 목록**: `GET https://ollama.com/api/tags` → `{ models: [{ name, model, modified_at, size, digest, details:{ family, parameter_size, ... } }] }` (공유 카탈로그).
- **챗**: `POST https://ollama.com/api/chat` — `{ model, messages[{ role:'system'|'user'|'assistant', content, images?: [base64...] }], stream:false, options? }`. **`stream:false` 지원**(단일 JSON). 응답: `message.content`, 토큰 수 `prompt_eval_count`(입력)/`eval_count`(출력), `done_reason`.
- 에러: `{ "error": "<message>" }` + HTTP 상태.

### 미확인(구현 시 실응답으로 확정)

1. codex HTTP `/responses` 에 `OpenAI-Beta` 헤더 필요 여부(현 codex-rs 소스는 미설정 — 불필요 추정).
2. codex access_token 정확한 TTL(런타임에 JWT `exp` 로 판단).
3. ollama cloud `/v1/*` 지원 여부·401 body 세부 스키마.

## 개요

사용자별로 AI 프로바이더(codex OAuth · anthropic API key · ollama cloud API key)를 연결·저장하고, 그 자격증명으로 채팅 세션·단발 completion·모델 조회를 수행하는 도메인. 어느 기능에도 붙을 수 있도록 `AiProviderClient` 인터페이스로 프로바이더를 추상화하고, `compose/ai.ts` 가 `aiChatService.complete`(세션 없는 단발)를 노출해 다른 도메인(예: 메일 답변 생성기)이 주입받아 융합할 수 있다. 자격증명은 `AI_ENCRYPTION_KEY` 로 AES-256-GCM 암호화 저장하고, codex OAuth 토큰은 만료 임박 시 자동 갱신(회전형)하며 갱신 불가 시 `reauth_required` 로 마킹한다. 이미지는 R2(`storageService`)로 영구화해 vision 입력에 쓰고, 모든 호출은 `log_events`(`service='b-hub-ai'`)에 사용기록으로 남는다.

## 파일 맵

| 파일 | 역할 |
|------|------|
| `dto/ai/provider.ts` | provider 등록(discriminated union: codex=oauth 3종 또는 accessToken 단독 union / anthropic·ollama=apiKey)·수정·응답 스키마, `AI_PROVIDER`·`AI_PROVIDER_STATUS` 상수 |
| `dto/ai/model.ts`·`prompt.ts`·`session.ts`·`chat.ts`·`attachment.ts` | 모델·프롬프트(stage)·세션·챗(send/completion)·첨부 Zod 스키마 |
| `service/domain/ai/ai-provider.ts` | `AiProviderClient` 인터페이스(`listModels`/`complete`/`completeStream`/`verify`) + 메시지·이미지·완성·스트림 이벤트 타입 |
| `service/domain/ai/ai-sse.ts` | 스트림 파서 — 블록 SSE `parseSseBlock`·`iterateSseEvents`(anthropic) + 라인 `iterateStreamLines`(codex data 라인·ollama NDJSON) |
| `service/domain/ai/providers/anthropic-provider.ts` | Anthropic 구현(`/v1/models`·`/v1/messages`, 이미지 base64 block, `completeStream`=stream:true SSE) |
| `service/domain/ai/providers/ollama-provider.ts` | Ollama Cloud 구현(`/api/tags`·`/api/chat`, images 배열, `completeStream`=stream:true NDJSON) |
| `service/domain/ai/providers/codex-provider.ts` | Codex 구현(`/models`·`/responses` **SSE 파싱**, fallback 모델. `complete` 는 `completeStream` 드레인) |
| `service/domain/ai/ai-provider-factory.ts` | 복호화 + provider별 client 생성. codex oauth 자동 갱신(회전 저장·reauth 마킹) / token 단독은 refresh skip + 만료·401 시 reauth 마킹, `createFromStored`(등록 검증용), `getCodexAccountId`(id_token·access_token claim) |
| `service/domain/ai/ai-connection.ts` | 연결 CRUD — 등록 전 `verify()` ping, codex accountId 보강(oauth=id_token, token=access_token claim), authType(oauth/token/apikey) 확정·재등록 시 갱신, 소유권, `resolveClient`(status 가드) |
| `service/domain/ai/ai-model.ts` | 모델 fetch·캐시 replace(새로고침 시 전체 교체)·`modelsFetchedAt` 기록. `listCached` 는 캐시 전용(자동 갱신 없음 — 갱신은 refresh 엔드포인트로만, 2026-07-10 사용자 결정) |
| `service/domain/ai/ai-prompt.ts` | 사용자별 프롬프트 템플릿 CRUD + `resolveOwned`(챗 조립용) |
| `service/domain/ai/ai-session.ts` | 세션·메시지 CRUD, `listRecentMessages`(history) |
| `service/domain/ai/ai-attachment.ts` | 이미지 업로드(MIME·magic bytes·20MB)·R2 영구화·`resolveImages`(vision base64)·메시지 연결 |
| `service/domain/ai/ai-chat.ts` | 오케스트레이션 — 프롬프트 stage 조립 + history + 이미지 → `client.complete`/`completeStream` → 메시지 저장·usage 로깅. `send`/`sendStream`(세션) / `complete`/`completeStream`(ephemeral, 도메인 융합) |
| `compose/ai.ts` | ServiceDb Drizzle 인라인 구현 + factory 조립(codex refresh HTTP)·usage logger·rate limiter. **`AI_ENCRYPTION_KEY` 없으면 `{}` 반환(graceful)** |
| `lib/credential-crypto.ts` | AES-256-GCM(v2 scrypt) 공용 crypto(mail 과 공유, 키 분리) |
| `lib/jwt-decode.ts` | 서명 미검증 JWT payload 디코드 + exp 추출(codex 토큰 만료 판단·account_id) |
| `route/ai/*` | HTTP 경계 6종(아래 엔드포인트) |
| `page/admin/pages/ai.tsx` | 어드민 SSR — providers(상태 토글·삭제)·sessions·prompts 조회 |

## 데이터 모델

`db/schema.ts` AI 테이블 6개. 컬럼 전수는 [../reference/db-schema.md](../reference/db-schema.md).

| 테이블 | 핵심 컬럼 | 인덱스·제약 | 관계 |
|--------|-----------|-------------|------|
| `ai_providers` | `provider`·`auth_type`·`credentials`(암호화 text)·`status`(active/reauth_required/disabled)·`status_detail`·`last_refreshed_at`·`models_fetched_at` | idx(user), **unique(user_id, provider)** | `user_id`→`user`(cascade) |
| `ai_models` | `model_id`·`display_name`·`metadata`(json)·`fetched_at` | idx(provider), unique(provider_id, model_id) | `provider_id`→`ai_providers`(cascade) |
| `ai_prompts` | `name`·`stage`(system/context/user/assistant)·`content`·`feature_key`·`sort_order`·`is_active` | idx(user), idx(user, feature_key) | `user_id`→`user`(cascade) |
| `ai_sessions` | `id`(uuid PK)·`provider`·`model_id`·`title`·`feature_key`·`prompt_ids`(json)·`last_message_at` | idx(user), idx(user, last_message_at) | `user_id`→`user`(cascade), `provider_id`→`ai_providers`(set null) |
| `ai_messages` | `id`(bigint PK)·`role`·`content`(longtext)·`model_id`·`input_tokens`·`output_tokens`·`duration_ms` | idx(session_id, created_at) | `session_id`→`ai_sessions`(cascade) |
| `ai_attachments` | `message_id`(bigint 소프트)·`filename`·`mime_type`·`size_bytes`·`r2_key`(unique) | idx(user), idx(message) | `user_id`→`user`(cascade) |

- **자격증명은 `credentials` 컬럼 하나에 암호화 JSON**으로만 저장한다(codex oauth=`{idToken,accessToken,refreshToken,accountId,lastRefresh}` · codex token 단독=`{accessToken,accountId}` · apikey=`{apiKey}`). `auth_type` 이 방식을 표시한다(`oauth`/`token`/`apikey`, 재등록 시 함께 갱신). 평문·해시 별도 컬럼 없음. 어드민 조회·API 응답 어디에도 노출하지 않는다(select 에서 컬럼 제외).

## API 엔드포인트

`route/index.ts` 마운트 + `index.ts` `app.route('/api', api)`. **전 경로 세션 인증**(`withAuth` 또는 핸들러 내 `getSession`).

| Method | 전체 Path | 인증 | 설명 |
|--------|-----------|------|------|
| GET | `/api/ai/providers` | 세션 | 연결 목록(자격증명 제외) |
| POST | `/api/ai/providers` | 세션 | 연결(등록·재인증) — 저장 전 `verify()` 검증, 있으면 자격 갱신 |
| PATCH | `/api/ai/providers/:providerId` | 세션 | displayName/status(active·disabled) 수정 |
| DELETE | `/api/ai/providers/:providerId` | 세션 | 연결 삭제 |
| GET | `/api/ai/:provider/models` | 세션 | 캐시된 모델 목록(캐시 전용, 자동 갱신 없음) |
| POST | `/api/ai/:provider/models/refresh` | 세션 | 모델 fetch 후 캐시 교체(실패 시 `AI_MODEL_FETCH_FAILED`) |
| GET | `/api/ai/prompts` | 세션 | 프롬프트 목록(featureKey/stage 필터) |
| POST | `/api/ai/prompts` | 세션 | 프롬프트 생성 |
| PATCH | `/api/ai/prompts/:promptId` | 세션 | 프롬프트 수정 |
| DELETE | `/api/ai/prompts/:promptId` | 세션 | 프롬프트 삭제 |
| GET | `/api/ai/sessions` | 세션 | 세션 목록(페이지네이션) |
| POST | `/api/ai/sessions` | 세션 | 세션 생성(연결 검증 포함) |
| PATCH | `/api/ai/sessions/:sessionId` | 세션 | 세션 수정 |
| DELETE | `/api/ai/sessions/:sessionId` | 세션 | 세션 삭제 |
| GET | `/api/ai/sessions/:sessionId/messages` | 세션 | 세션 메시지 목록 |
| POST | `/api/ai/sessions/:sessionId/messages` | 세션 + rate limit | 메시지 전송·응답 생성 |
| POST | `/api/ai/sessions/:sessionId/messages/stream` | 세션 + rate limit | 메시지 전송·SSE 스트리밍 응답(delta/done/error) |
| POST | `/api/ai/completions` | 세션 + rate limit | 세션 없는 단발 completion(도메인 융합) |
| POST | `/api/ai/completions/stream` | 세션 + rate limit | 단발 completion SSE 스트리밍(delta/done/error) |
| POST | `/api/ai/attachments` | 세션 + rate limit | 이미지 업로드(vision, R2). 본문 21MB 초과 시 413 `AI_ATTACHMENT_TOO_LARGE` |
| DELETE | `/api/ai/attachments/:attachmentId` | 세션 | 이미지 삭제 |

- rate limit: `compose/ai.ts` `createRateLimiter({ windowMs: 60_000, maxRequests: 30 }, rateLimitStore)`. **사용자당** 고정 키(`ai:chat:send`·`ai:chat:completion`·`ai:attachment:upload`)로 chat send·completion·attachment 업로드에 적용(세션당 우회 방지). `REDIS_URL` 이 있으면 `compose/index.ts` 가 만든 공유 카운터 스토어가 주입돼 인스턴스 간 한도를 공유한다(헤더·429 계약 불변).
- **업로드 본문 상한**: `POST /api/ai/attachments` 는 라우트 앞단에 `bodyLimit`(20MB 첨부 + 멀티파트 여유 1MB = 21MB)을 둔다. 초과 시 서비스 검증에 닿기 전에 413 `AI_ATTACHMENT_TOO_LARGE` 를 `errorResponse` 봉투로 반환한다(서비스 단 20MB 검증은 그대로 유지).

## 핵심 흐름

### 연결 등록·검증 (`ai-connection.connect`)
1. DTO discriminated union 으로 provider별 자격 검증. codex credentials 는 union — oauth 3필드(`idToken`+`accessToken`+`refreshToken`) 또는 accessToken 단독(`accessToken`+선택 `accountId`). `buildStored` 가 accountId 를 입력값 ?? JWT claim(`https://api.openai.com/auth`.chatgpt_account_id — oauth 는 idToken 에서, token 단독은 accessToken 에서)으로 확정하고 authType(`oauth`/`token`)을 결정 — accountId 확정 불가면 `AI_CREDENTIALS_INVALID`(opaque `at-` 토큰은 accountId 입력 필수).
2. `factory.createFromStored(provider, stored).verify()` 로 실제 프로바이더에 ping(anthropic/ollama=모델 목록 GET, codex=`/models`). 실패 시 `AI_CREDENTIALS_INVALID`(에러는 `maskProviderError` 마스킹).
3. 검증 통과분만 `crypto.encrypt(JSON)` 로 `credentials` 저장. 같은 provider 연결이 이미 있으면 자격 갱신 + `status=active` 복구(재인증 흐름) — 없으면 insert.
- **재등록은 UPDATE 1회**다: `db.updateOnReconnect(id, { credentials, authType, status: 'active', statusDetail: null, displayName? })`(`ai-connection.ts`·`compose/ai.ts`)가 이전의 `updateCredentials` + `updateStatus` + (조건부)`updateDisplayName` 3개 UPDATE 를 하나로 합친다. `displayName` 은 입력에 있을 때만 set 에 포함돼, 미지정 시 기존 값이 유지되는 동작이 같다. 부분 실패로 자격만 바뀌고 status 가 `reauth_required` 로 남는 창도 사라진다.

### codex OAuth 자동 갱신 (`ai-provider-factory`) — refreshToken 이 있을 때만
- 매 codex 호출 전 `getAccessToken()` 이 access_token JWT `exp` 를 확인해 **5분 이내 만료면** `refreshCodexToken`(`compose/ai.ts` 가 `POST https://auth.openai.com/oauth/token`, client_id `app_EMoamEEZ73f0CkXaXp7hrann`) 호출.
- **회전 처리**: 응답에 새 refresh_token 이 오면 교체, 안 오면 기존 유지. 갱신분을 재암호화해 `persistCodexCredentials`(DB `credentials`+`last_refreshed_at`) 저장.
- **single-flight 는 persist 까지 포함한다**(`ai-provider-factory.ts:56-68`). `refreshWithLock` 이 감싸는 `run()` 은 `refreshCodexToken` → `persist(refreshed)` 순으로 실행하고, `refreshInFlight` Map 의 항목은 그 `run()` 이 끝난 뒤(`finally`) 제거된다. 대기하던 동시 요청은 **DB 저장이 끝난 토큰**을 받는다. 이전에는 refresh HTTP 응답만 공유하고 persist 는 락 밖에서 돌아, 저장 전 토큰으로 진행한 요청이 정상 계정을 `reauth_required` 로 마킹할 수 있었다.
- **갱신 실패는 원인을 가려 처리한다**: `compose/ai.ts` 의 refresh 가 비2xx 응답 본문에서 OAuth `error` 코드를 뽑아 `AI_TOKEN_REFRESH_FAILED` 의 `details.error` 에 싣고, `ai-provider-factory.ts` 의 `isReauthRefreshError` 가 그 값이 `invalid_grant` 이거나 `refresh_token` 으로 시작할 때에만 `markReauthRequired`(status `reauth_required`+detail) 후 `AI_REAUTH_REQUIRED`(401) 로 올린다. 그 외(네트워크 오류·5xx·rate limit 등 일시 장애)는 상태를 바꾸지 않고 `AI_TOKEN_REFRESH_FAILED`(502)로 통과시킨다 — 일시 장애 한 번에 정상 계정이 영구 `reauth_required` 로 마킹되던 경로를 막는다. 사용자는 진짜 만료·재사용일 때만 auth.json 재등록으로 복구한다.

### codex access token 단독 (`ai-provider-factory`) — refreshToken 이 없을 때
- refresh 를 시도하지 않고 저장된 accessToken 을 그대로 쓴다. accountId 는 저장값 ?? idToken claim ?? accessToken claim 순으로 확정(없으면 `AI_CREDENTIALS_INVALID`).
- **만료 처리**: accessToken 이 JWT 이고 `exp` 가 지났으면 호출 전에 `markReauthRequired` 후 `AI_REAUTH_REQUIRED`. opaque(`at-`) 토큰은 exp 를 알 수 없어 선판정 없이 호출한다.
- **업스트림 401**: listModels/complete/completeStream 이 status 401 인 `AppError` 로 실패하면 `markReauthRequired` 후 `AI_REAUTH_REQUIRED` 로 변환(새 토큰 재등록으로 복구). 401 외 실패는 기존 에러 그대로. `verify()` 는 변환하지 않는다(등록 검증은 `AI_CREDENTIALS_INVALID` 로 수렴).

### 채팅 (`ai-chat.send`)
1. 세션 소유권 확인 후, **서로 독립인 4가지 준비 작업을 병렬로 실행**한다(`prepareSend` 의 `Promise.allSettled`): `resolveClient`(status reauth/disabled 가드) · 프롬프트 해석(`session.promptIds` 있을 때) · `listRecentMessages`(최근 50) · 첨부 이미지 해석(`attachmentIds` 있을 때). 이전에는 네 단계를 순차 `await` 했다. `complete`(ephemeral)의 `prepareCompletion` 도 `resolveClient` + 프롬프트 해석 2가지를 같은 방식으로 병렬화한다.
2. 결과는 `unwrapSettled` 로 **client → prompts → history → images 순서로 꺼내며**, 실패가 있으면 그 순서에서 먼저 걸린 오류를 그대로 던진다(직렬 실행 때와 같은 오류가 표면화된다). 프롬프트는 stage system/context → system 텍스트, user/assistant → seed 메시지로 조립하고, messages 는 **메모리에서만** 만든다(seed → history → 이번 user 메시지). 이 시점엔 DB 에 아무것도 저장하지 않는다.
3. `client.complete` 호출(시간 측정). **실패 시 `logUsage`(severity 40 → Discord 알림) 후 재-throw — 메시지는 저장하지 않는다(고아 user 메시지 방지, f6c65f3).** 성공한 경우에만 `insertMessagePair` 로 **user·assistant 두 행을 한 트랜잭션에서** 저장하고(반환값은 두 PK), 이어서 첨부 연결(user 메시지 PK 기준)·`touchLastMessage`·`touchUsed` 를 **`Promise.all` 로 함께**(각각 `settleQuietly` 로 실패를 삼킨다) 실행한 뒤 `logUsage`(severity 20).
- `complete`(ephemeral)는 세션 없이 동일 조립으로 completion 만 반환 — 다른 도메인이 `aiChatService.complete(userId, {...})` 로 융합 호출.

### SSE 스트리밍 (`ai-chat.sendStream` · `ai-chat.completeStream`)
- provider client 의 `completeStream(request)` 이 upstream(codex Responses SSE · anthropic `/v1/messages` `stream:true` SSE · ollama `/api/chat` `stream:true` NDJSON)을 `AsyncIterable<{type:'delta',text}|{type:'done',result}>` 로 노출. 파서는 `service/domain/ai/ai-sse.ts`(블록 SSE `iterateSseEvents`, 라인 `iterateStreamLines`). codex 의 `complete` 는 `completeStream` 을 드레인해 동일 결과를 반환한다.
- 서비스 스트림 변형은 **조립·후처리를 send/complete 와 공유**한다: delta 를 그대로 relay 하며 content·usage 를 누적하고, 스트림이 정상 종료(`done`)한 경우에만 세션 메시지 저장(sendStream)·`touchUsed`·`logUsage`(severity 20) 를 수행한다. 중간 실패는 저장 없이 `logUsage`(severity 40) 후 재-throw(고아 방지 동일).
- 라우트는 `hono/streaming` 의 `streamSSE` 로 relay: `event: delta` `data: {"text":"..."}` (증분), `event: done` `data: {content,modelId,inputTokens,outputTokens,durationMs}`(세션 스트림은 `id` 포함, 어시스턴트 메시지 PK), `event: error` `data: {code,message}`. **스트림 시작 전 오류**(세션/키 미존재·reauth·rate limit·업스트림 연결 실패)는 기존과 동일한 JSON `errorResponse` 로 반환된다.
- **클라이언트 중단은 업스트림까지 전파된다**(`route/ai/chat.ts:33-35`·`88-90`·`127-129`). 라우트가 요청마다 `new AbortController()` 를 만들어 `sendStream`/`completeStream` 에 `signal` 로 넘기고, `streamSSE` 의 `sse.onAbort(() => controller.abort())` 로 연결이 끊기면 abort 한다. `signal` 은 `AiCompletionRequest.signal`(`ai-provider.ts:18`)을 타고 세 프로바이더의 `fetch` 옵션까지 내려간다(anthropic `complete`·`completeStream`, codex `/responses`, ollama `complete`·`completeStream`).
- 파서도 스트림을 닫는다: `iterateSseEvents`·`iterateStreamLines` 의 `finally` 가 `releaseLock()` 전에 `await reader.cancel().catch(() => {})` 를 호출한다(`ai-sse.ts:50`·`70`). 소비자가 중간에 빠져나가도 업스트림 body 가 열린 채 남아 토큰이 계속 생성·과금되지 않는다.

### 사용기록
- `logUsage` → `logEventService.ingest({ service:'b-hub-ai', errorCode:'AI_CHAT_COMPLETED'|'AI_CHAT_FAILED'|'AI_COMPLETION_*', severity, category:'ai', details:{ provider, model, inputTokens, outputTokens, durationMs, featureKey } })`. **프롬프트 원문·자격증명은 details 에 넣지 않는다.** 실패(severity 40)는 [../logging.md](../logging.md) 규칙으로 Discord 알림 대상.
- **기록은 응답 전에 `await`** 한다(`AiUsageLogger` 반환 타입이 `Promise<void>`, `compose/ai.ts` 의 `logUsage` 가 `ingest` 를 await 하고 실패만 `captureException` 으로 삼킨다). 서버리스에서 응답 후 실행이 끊겨 사용기록이 유실되던 경로를 막는다. 알림(Discord) 자체는 여전히 응답을 기다리지 않는다(→ [../logging.md](../logging.md)).

## 환경변수

| 변수 | 필수 | 용도 |
|------|:---:|------|
| `AI_ENCRYPTION_KEY` | 선택(min 32) | 자격증명 AES-256-GCM 암호화 키. **미설정 시 AI 도메인 전체 비활성**(`compose/ai.ts` 가 `{}` 반환 → `SERVICE_NOT_CONFIGURED` 503). mail 키와 분리 |

- codex refresh 는 공개 client_id(`app_EMoamEEZ73f0CkXaXp7hrann`) 상수 사용(시크릿 아님). anthropic/ollama 앱 자격은 사용자 API key 라 env 없음.

## 에러 코드

`lib/error-code.ts`·`error-message.ts`·`error.ts` 의 AI 프로바이더 도메인 에러 15종(별개로 `AI_SUMMARIZE_FAILED`(502)는 미배선 shared 코드로 이 목록과 무관): `AI_PROVIDER_NOT_FOUND`(404)·`AI_PROVIDER_ALREADY_EXISTS`(409)·`AI_CREDENTIALS_INVALID`(401)·`AI_REAUTH_REQUIRED`(401)·`AI_TOKEN_REFRESH_FAILED`(502)·`AI_PROVIDER_ERROR`(502)·`AI_MODEL_FETCH_FAILED`(502)·`AI_MODEL_NOT_FOUND`(404)·`AI_SESSION_NOT_FOUND`(404)·`AI_MESSAGE_NOT_FOUND`(404)·`AI_PROMPT_NOT_FOUND`(404)·`AI_ATTACHMENT_NOT_FOUND`(404)·`AI_ATTACHMENT_TOO_LARGE`(413)·`AI_ATTACHMENT_INVALID_TYPE`(422)·`AI_COMPLETION_FAILED`(502).

## 주의사항 / 함정

- **codex 는 SSE 전용**: `/responses` 는 `stream:true` 고정이라 서버가 SSE 를 소비해 `response.output_text.delta` 누적 + `response.completed.usage` 취합 후 단일 응답으로 반환한다. 비스트리밍 JSON 을 기대하지 말 것.
- **codex refresh_token 회전**: 갱신 응답의 새 refresh_token 을 저장하지 않으면 다음 갱신이 `refresh_token_reused` 로 영구 실패한다. `persistCodexCredentials` 가 원자적으로 교체 저장.
- **codex 두 인증 방식 병행(2026-07-10)**: 저장 credentials 의 `refreshToken` 존재 여부가 분기 기준이다(있으면 oauth 자동 갱신, 없으면 token 단독). token 단독은 만료·401 시 자동 복구가 없고 `reauth_required` 로만 마킹되므로 사용자가 새 토큰을 재등록해야 한다. 만료된 토큰은 등록 시 `verify()` 실패로 거부된다. opaque `at-` 토큰은 accountId 입력이 필수(JWT claim 파싱 불가, whoami 미연동).
- **연결은 사용자당 provider 1개**(unique). 재등록(재인증)은 기존 행 자격 갱신 + status 복구로 처리(`AI_PROVIDER_ALREADY_EXISTS` 는 예약, 현재 throw 안 함).
- **자격증명 비노출**: API 응답 매핑(`toResponse`)·어드민 select 모두 `credentials` 를 제외한다. 신규 조회 경로 추가 시 이 컬럼을 넣지 말 것.
- **모델 새로고침은 전체 교체**: `replaceForProvider` 가 트랜잭션으로 delete-then-insert 한다(캐시 스냅샷). 부분 병합 아님.
- **codex `client_version` 이 모델 세대를 결정(2026-07-10)**: 구버전 client_version 으로 `/models` 를 부르면 최신 모델(gpt-5.6 계열)이 목록에서 빠진다. 신모델 출시에도 목록이 갱신되지 않으면 `DEFAULT_CLIENT_VERSION`(codex-provider.ts) 을 최신 Codex CLI 릴리스 버전으로 올릴 것. 모델 캐시는 자동 갱신되지 않으므로(사용자 결정: [../acknowledge/2026-07-10-ai-model-cache-decision.md](../acknowledge/2026-07-10-ai-model-cache-decision.md)) 버전 상향 배포 후 refresh 엔드포인트(프론트 "모델 새로고침")로 캐시를 교체해야 반영된다.
- **첨부는 이미지 전용**(vision): MIME 화이트리스트 + magic bytes + 20MB. 텍스트/기타 파일은 거부.
- **AI_ENCRYPTION_KEY graceful**: mail(fail-fast)과 달리 AI 는 키 없으면 앱은 정상 부팅하고 AI 라우트만 503. → [../acknowledge/2026-07-02-ai-provider-decisions.md](../acknowledge/2026-07-02-ai-provider-decisions.md)
- **codex 는 temperature/maxTokens 미적용**: `/responses` body 에 이 두 파라미터를 넣지 않는다(Responses API 지원 필드 미확정). anthropic/ollama 세션에선 반영되지만 codex 세션에선 사용자 설정이 무시된다. anthropic 은 temperature 를 0–1 로 클램프(DTO 는 0–2 허용).
- **codex 동시 refresh single-flight**: 같은 provider 의 동시 만료 요청은 `ai-provider-factory` 의 `refreshInFlight` Map 으로 refresh 를 1회로 합쳐 회전 토큰 재사용(`refresh_token_reused`) 영구 실패를 막는다. **락은 DB persist 까지 끝난 뒤 풀린다** — 대기하던 요청이 미저장 토큰을 쓰는 창이 없다. 단 **서버리스 다중 인스턴스 간에는 공유되지 않는다**(인메모리 `Map`. 레이트리밋은 `REDIS_URL` 로 공유 가능해졌지만 refresh 락은 여전히 프로세스 단위다). 회전 토큰 저장 실패 시 이번 요청은 진행하되 `reauth_required` 로 마킹해 다음 요청부터 재등록을 유도한다.
- **`displayName` 은 응답에서 절대 `null` 이 아니다**: 프로바이더 목록은 `row.displayName ?? row.provider`(`route/ai/connection.ts:23`), 모델 목록은 `row.displayName ?? row.modelId`(`route/ai/model.ts:20`)로 폴백한다. DTO 도 `z.string()`(nullable 제거 — `dto/ai/provider.ts:48`·`dto/ai/model.ts:7`)이다. DB 컬럼은 여전히 nullable 이고 폴백은 응답 매핑 단계에서만 일어난다. 소비자(Calendar·Rirekisyo)의 strict `z.string()` 파싱이 깨져 AI 패널이 통째로 숨겨지던 문제(C-04)를 막는다.
- **중단된 스트림은 기록도 남지 않는다**: SSE 연결이 끊기면 `AbortSignal` 로 업스트림 fetch 를 취소하고 reader 도 cancel 한다(위 §SSE 스트리밍). 다만 중단 시 `done` 에 도달하지 않으므로 **메시지 저장·`logUsage` 도 수행되지 않는다** — 중단 시점까지의 토큰 사용량은 `log_events` 에 남지 않는다.
- **user 메시지는 completion 성공 후에만 저장(고아 메시지 방지, f6c65f3)**: `send` 는 `client.complete` 를 먼저 호출하고, 성공한 경우에만 user·assistant 메시지를 insert 한다. 프로바이더 호출이 실패하면 아무 메시지도 남기지 않는다. ephemeral `complete` 는 애초에 메시지를 저장하지 않는다.
- **메시지 쌍은 트랜잭션**: 저장은 `AiMessagePairInserter`(`service/domain/ai/ai-chat.ts` 타입, 구현은 `compose/ai.ts` 의 `insertMessagePair`)가 담당하고 `db.transaction` 안에서 user → assistant 순으로 insert 한 뒤 `$returningId()` 로 두 PK 를 돌려준다. 중간 실패로 user 메시지만 남는 경우가 없다. `ai-chat.ts` 는 이제 `sessionService.insertMessage` 를 직접 호출하지 않는다(주입된 inserter 만 사용).
- **연결 등록 verify 실패는 원인 불문 `AI_CREDENTIALS_INVALID`(401)** 로 수렴한다(마스킹된 원인은 응답 `details` 에 포함). 즉 프로바이더의 429/5xx/네트워크 장애도 등록 시엔 자격 무효로 표면화될 수 있으니, 일시 장애면 재시도한다. 검증 실패 시 자격증명은 저장되지 않는다.
- **첨부 쿼터**: 업로드는 `user.storage_quota_bytes` 게이트를 강제한다(초과 시 `AI_ATTACHMENT_TOO_LARGE`). 단 이 사용량은 `ai_attachments` 만 합산하며 drive(`cloud_assets`)와는 별도로 카운트된다. 업로드 엔드포인트도 사용자당 레이트리밋(`ai:attachment:upload`)과 본문 `bodyLimit`(21MB) 대상이다.
- **첨부 R2 정리 순서**: 업로드는 R2 put 후 DB insert 인데, **insert 가 실패하면 방금 올린 오브젝트를 지우고 예외를 다시 던진다**(고아 오브젝트 방지). 삭제(`remove`)는 반대로 **DB 행을 먼저 지우고 R2 오브젝트를 지운다** — 스토리지 삭제가 실패해도 사용자에겐 삭제된 것으로 보이고, 실패는 스토리지 서비스가 `captureException` 으로 보고한다.
- **메시지 정렬은 `created_at` + `id` 2차 키**다(`compose/ai.ts` 의 목록·`listRecentMessages`). 같은 밀리초에 저장된 user·assistant 쌍의 순서가 뒤집혀 대화 맥락이 어긋나던 문제를 막는다. history 조립도 이 정렬을 그대로 쓴다.
- **목록의 `count`·행 조회는 병렬**이다: `listSessions`·`listMessages`(`compose/ai.ts`)가 `count(*)` 와 페이지 select 를 `Promise.all` 로 함께 던진다. 페이지네이션 응답 값은 불변이다.
- **준비 단계 병렬화의 부작용**: `prepareSend` 는 `resolveClient` 가 실패할 상황(reauth·disabled)에서도 프롬프트·history·첨부 조회가 이미 시작된 뒤다. 던지는 오류는 직렬 실행 때와 같지만, 실패 요청에서도 이 읽기 쿼리·R2 다운로드가 한 번씩 수행된다(쓰기는 없다). `resolveClient` 자체를 요청 간에 재사용하는 캐시는 두지 않았다 — 자격 복호화·status 가드는 호출마다 다시 수행된다.
- **첨부 이미지 다운로드는 병렬**이다: `resolveImages`(`ai-attachment.ts`)가 소유 검증된 레코드들의 R2 `download` 를 `Promise.allSettled` 로 동시에 받고, 결과를 **레코드 순서대로** 검사해 거부는 그대로 재-throw, 본문이 없으면 `AI_ATTACHMENT_NOT_FOUND` 를 던진다. vision 입력에 실리는 이미지 순서와 오류 종류는 순차 다운로드 때와 같다.

## 관련 문서

- 결정: [../acknowledge/2026-07-02-ai-provider-decisions.md](../acknowledge/2026-07-02-ai-provider-decisions.md)
- 작업 체크리스트: [../PROCESS.md](../PROCESS.md)
- 전수 스키마: [../reference/db-schema.md](../reference/db-schema.md) · 엔드포인트: [../reference/api-endpoints.md](../reference/api-endpoints.md) · 환경변수: [../reference/env.md](../reference/env.md)
- 중앙 로깅: [../logging.md](../logging.md) · 외부 API 연동 패턴: [../guidelines/external-api-integration.md](../guidelines/external-api-integration.md)
