# 엔드포인트 QA 체크리스트 (신규/변경 라우트)

> 기준: 2026-07-02 (dev @ `f6c65f3`) 코드 검증. 다루는 코드: `route/logs/log-event.ts`, `route/health.ts`, `route/badge.ts`, `route/mail/sync.ts`, `route/mail/message.ts`, `lib/with-error-handling.ts`, `lib/with-auth.ts`, `lib/with-rate-limit.ts`, `lib/rate-limit.ts`, `lib/api-response.ts`, `lib/error.ts`, `lib/error-code.ts`, `lib/error-message.ts`, `lib/log-service-name.ts`, `dto/error-response.ts`, `middleware/index.ts`, `middleware/log-capture.ts`, `middleware/error-handler.ts`, `middleware/require-device-key.ts`, `tests/route/health.test.ts`, `package.json`, `index.ts`

## 범위

- HTTP 라우트를 새로 추가하거나 기존 라우트의 시그니처·인증·응답을 바꿀 때 머지 전에 확인할 항목을 소유한다.
- 정본 예시는 `route/logs/log-event.ts`(수집 2개는 `requireDeviceKey` 미들웨어, 어드민 3개는 `withAdmin` HOF). 각 항목의 근거 코드를 병기한다.
- 라우트별 인증·경로 전수 인벤토리는 이 문서가 소유하지 않는다 — [../reference/api-endpoints.md](../reference/api-endpoints.md). 에러/응답 헬퍼 상세는 [../reference/lib-utilities.md](../reference/lib-utilities.md), 로그 캡처 설계는 [../logging.md](../logging.md), 테스트 규약은 [../testing.md](../testing.md) 가 소유한다.

## 체크리스트

| # | 항목 | 확인 방법 | 근거 |
|---|------|-----------|------|
| 1 | zod validator 적용·경계 검증 | 입력이 있으면 `validator('json'\|'query'\|'param', schema)` 가 핸들러 앞에 붙었는가. path param 은 스키마 밖이므로 핸들러 내 수동 검증 | `route/logs/log-event.ts`, `dto/error-response.ts` |
| 2 | 올바른 인증(미들웨어·HOF) | 인증이 필요하면 `withAuth`/`withAdmin`(HOF) 또는 `require*`(미들웨어) 적용. 공개면 사유를 라우트 주변·이 표에 명시 | `lib/with-auth.ts`, `middleware/require-device-key.ts` |
| 3 | `withErrorHandling` 래핑 | 모든 핸들러가 `withErrorHandling(...)` 로 감싸졌는가. 인증 HOF 와 합성 시 `withErrorHandling` 이 바깥 | `lib/with-error-handling.ts` |
| 4 | 응답 봉투 | JSON 성공 응답은 `successResponse`/`paginatedResponse` 로만. `c.json` 에 임의 구조 금지(바이너리·리다이렉트·헬스는 예외) | `lib/api-response.ts` |
| 5 | OpenAPI 선언 | `describeRoute({ tags, summary, responses })` + 발생 가능한 에러를 `...errorResponses([...])` 로 선언 | `route/logs/log-event.ts`, `dto/error-response.ts` |
| 6 | 에러코드 3파일 등록 | 새 `createAppError('X')` 코드는 `error-code.ts`·`error-message.ts`·`error.ts`(STATUS_MAP) 3곳 모두 등록 | `lib/error-code.ts`, `lib/error-message.ts`, `lib/error.ts` |
| 7 | rate limit 필요성 | 비용 큰/외부호출/발송성 엔드포인트면 `withRateLimit` 검토. 현재 적용처는 mail 2개(send·sync) + ai 3개(chat send·completion·attachment upload) | `lib/with-rate-limit.ts`, `route/mail/*`, `route/ai/{chat,attachment}.ts` |
| 8 | 4xx·5xx log-capture 기록 | 에러 시 `throw createAppError(...)` 로 반환해 `errorCode` 컨텍스트 변수가 설정되는가. `/api/logs/*` 는 캡처 제외 | `middleware/log-capture.ts`, `lib/with-error-handling.ts` |
| 9 | 테스트 존재(route+service) | `tests/route/<도메인>/*.test.ts`(HTTP)·`tests/service/domain/<도메인>/*.test.ts`(로직) 미러 추가 | `tests/route/health.test.ts` |
| 10 | 인벤토리 반영 | `docs/reference/api-endpoints.md` 표·파일 카운트·합계 갱신 | [../reference/api-endpoints.md](../reference/api-endpoints.md) |

복사용:

```
- [ ] 1. zod validator 적용 + 경계(param 수동검증 포함)
- [ ] 2. 인증 HOF/미들웨어 적용(공개면 사유 명시)
- [ ] 3. withErrorHandling 래핑(인증 HOF 바깥)
- [ ] 4. successResponse / paginatedResponse 봉투
- [ ] 5. describeRoute + errorResponses OpenAPI 선언
- [ ] 6. 새 에러코드 3파일(code·message·error) 등록
- [ ] 7. rate limit 필요성 판단
- [ ] 8. 4xx·5xx 시 createAppError 로 errorCode 세팅(log-capture)
- [ ] 9. route + service 테스트 추가
- [ ] 10. docs/reference/api-endpoints.md 반영
```

## 항목별 상세

### 1. zod validator·경계 검증

- 요청 바디/쿼리는 `dto/<도메인>/*.ts` 의 Zod 스키마 + `validator('json'|'query', schema)` 로 핸들러 앞단에서 검증한다. 값은 `c.req.valid('json' as never) as z.infer<typeof schema>` 로 꺼낸다.
- validator 실패는 프레임워크가 400 으로 반환하므로 responses 에 `VALIDATION_ERROR` 를 함께 선언한다(항목 5).
- **path param 은 validator 대상이 아니다.** `route/logs/log-event.ts` 의 `PATCH /:id/resolve` 처럼 `parseInt(c.req.param('id'),10)` 후 `isNaN` 이면 `throw createAppError('VALIDATION_ERROR')` 로 직접 막는다.

### 2. 인증 — HOF / 미들웨어 / 공개

- HOF 방식: `withErrorHandling(withAuth({ getSession })(handler))`, 어드민은 `withAdmin`. `withAuth` 는 세션 없으면 `UNAUTHORIZED`(401), `withAdmin` 은 추가로 `role!=='admin'` 이면 `FORBIDDEN`(403)(`lib/with-auth.ts`).
- 미들웨어 방식: `requireDeviceKey`(`X-Device-Key`) 등 `require*` 를 핸들러 앞에 배치. 실패 시 도메인 에러코드(`LOG_DEVICE_KEY_INVALID` 401 등).
- **공개 엔드포인트면 사유를 남긴다.** 예: `route/health.ts`(헬스체크·비밀 없음), `route/badge.ts`(공개 뱃지 생성), `GET /api/blog/posts`(공개 게시글 조회). 인증 래퍼가 없다는 사실만으로 공개이므로, 의도된 공개인지 리뷰에서 확인한다.
- `withApiToken`(`X-API-Token`)은 정의·테스트만 있고 **어떤 라우트에도 연결돼 있지 않다** — 신규 라우트에 임의로 붙이지 말고 세션/도메인 키 방식을 따른다.

### 3. withErrorHandling 래핑

- 모든 핸들러는 `withErrorHandling(...)` 으로 감싼다(`lib/with-error-handling.ts`). `isAppError` 면 `c.set('errorCode', code)` 후 해당 statusCode 로 `errorResponse` 반환, 그 외는 `errorDetail` 설정 + `captureException` + `INTERNAL_ERROR`(500).
- 인증/레이트리밋 HOF 와 합성 순서는 **바깥→안쪽** = `withErrorHandling → withAuth/withAdmin → withRateLimit`(`route/mail/sync.ts`, `route/mail/message.ts`). 인증 실패의 401 도 에러 핸들러가 봉투로 감싸도록 `withErrorHandling` 이 최상단이어야 한다.
- 전역 `errorHandler` 미들웨어(`middleware/error-handler.ts`)가 동일 로직으로 한 겹 더 감싸지만, 라우트 레벨 래핑을 생략하지 않는다(둘 다 `errorCode`/`errorDetail` 를 세팅).

### 4. 응답 봉투

- 성공 JSON 은 `successResponse(data)` → `{ success:true, data }`, 목록은 `paginatedResponse(data,{page,limit,total})` → `{ success:true, data, pagination:{page,limit,total,totalPages} }`(`totalPages` 는 `Math.ceil` 자동, `lib/api-response.ts`).
- 에러는 핸들러가 직접 만들지 않는다 — `throw createAppError(...)` → `withErrorHandling` 이 `errorResponse` 로 반환한다. `details` 는 **비프로덕션에서만** 직렬화된다.
- 예외(봉투 미적용 정당): 바이너리(뱃지·썸네일 PNG), 리다이렉트(OAuth 302), ICS/SVG 등 non-JSON, 그리고 `route/health.ts` 같은 계약 고정 응답.

### 5. OpenAPI 선언 (describeRoute·errorResponses)

- `describeRoute({ tags:[도메인], summary, responses:{ 200:{...}, ...errorResponses([...ErrorCode]) } })` 를 validator 앞에 둔다.
- `errorResponses(codes)`(`dto/error-response.ts`)는 코드들을 `getStatusCode` 로 상태별 그룹핑해 OpenAPI responses 를 만든다. **핸들러에서 실제로 throw 하는 코드와 선언이 일치**해야 한다(validator 있으면 `VALIDATION_ERROR`, 인증 있으면 `UNAUTHORIZED`/`FORBIDDEN` 포함).
- `/docs`(OpenAPI JSON)·`/swagger` 는 비프로덕션에서만 등록된다(`index.ts`).

### 6. 에러코드 3파일 등록

- 새 에러는 **3파일 모두** 추가한다: `lib/error-code.ts`(`ERROR_CODE` 상수 + `ErrorCode` union) → `lib/error-message.ts`(`ERROR_MESSAGE` 한국어) → `lib/error.ts`(`STATUS_MAP` 상태코드).
- `STATUS_MAP` 누락 시 `getStatusCode` 가 500 fallback 이므로, 4xx 로 의도한 코드는 반드시 매핑을 추가한다.
- 도메인 접두사 네이밍을 따른다(`BLOG_*`·`MAIL_*`·`DRIVE_*`·`LOG_*`, 공통은 `VALIDATION_ERROR`·`UNAUTHORIZED`·`FORBIDDEN`·`NOT_FOUND`·`RATE_LIMIT_EXCEEDED` 등).

### 7. rate limit 필요성

- 레이트리밋은 `createRateLimiter({windowMs,maxRequests})`(`lib/rate-limit.ts`, 인메모리 `Map`) + `withRateLimit({checkLimit})`(`lib/with-rate-limit.ts`) 로 건다. 초과 시 `X-RateLimit-*` 헤더와 함께 `RATE_LIMIT_EXCEEDED`(429).
- 현재 실제 연결처는 **5개**: mail 2개(`POST /api/mail/messages/send`·`POST /api/mail/sync`, 키 `mail:{userId}:{path}`) + ai 3개(`POST /api/ai/sessions/:id/messages`·`POST /api/ai/completions`·`POST /api/ai/attachments`, `compose/ai.ts` 가 사용자당 고정 키 `ai:chat:send`·`ai:chat:completion`·`ai:attachment:upload` 로 주입). `compose/mail.ts`·`compose/ai.ts` 둘 다 `windowMs:60_000, maxRequests:20`(mail)·`30`(ai). 라우트는 `deps.checkLimit` 유무로 분기(미주입 시 무제한).
- 판단 기준: 외부 API 호출·발송·업로드처럼 남용 시 비용/차단 위험이 있으면 검토. **저장소가 인메모리라 인스턴스 간 공유되지 않는다** — 서버리스 다중 인스턴스에선 인스턴스 국소 제한임을 감안한다.

### 8. 4xx·5xx log-capture 기록

- `logCapture`(`middleware/log-capture.ts`)는 응답 후 전역 미들웨어로, `status >= 400` 이고 `path` 가 `/api/logs` 로 시작하지 않을 때만 `logEventService.captureServerError` 를 fire-and-forget 호출한다(재귀 방지 위해 `/api/logs/*` 는 제외).
- 기록되는 `errorCode` 는 `withErrorHandling`/`errorHandler` 가 `c.set('errorCode', ...)` 로 넣은 값을 읽고, 없으면 `errorCodeFromStatus(status)` 로 fallback 한다(`lib/log-service-name.ts`). **따라서 정확한 코드로 남기려면 raw `c.json(x, 4xx)` 대신 `throw createAppError(...)` 로 반환한다.**
- severity 는 5xx=40 / 4xx=30, `service` 는 경로에서 `b-hub-*` 로 파생, `details` 에 `{path,method,status,durationMs}` 를 담는다. 캡처는 전역이라 신규 엔드포인트도 자동 대상 — 별도 코드 불필요, 다만 에러 반환 방식(throw)만 지킨다.

### 9. 테스트 존재 (route + service)

- 테스트는 `bun test`(부분: `bun test tests/route/<도메인>/<파일>.test.ts`). 소스 미러 구조: HTTP 는 `tests/route/**`, 도메인 로직은 `tests/service/domain/**`, 스키마는 `tests/dto/**`.
- route 테스트는 `new Hono()` 에 대상 라우트를 마운트하고 `app.request(path)` 로 상태/봉투를 검증한다(`tests/route/health.test.ts`).
- 신규 엔드포인트는 **route 테스트(인증 분기·validator 400·성공 봉투)와 service 테스트(도메인 로직)를 함께** 추가한다. 상세 규약은 [../testing.md](../testing.md).

### 10. api-endpoints.md 반영

- `docs/reference/api-endpoints.md` 의 도메인 표에 Method·전체 Path·인증·설명·핸들러 파일을 추가하고, 파일별 카운트·하단 합계(자기검증)를 갱신한다.
- 도메인 상세(요청/응답 스키마·서비스 흐름)는 [../domains/](../domains/) 해당 문서에 반영한다.

## 로컬 curl 검증

- 개발 서버: `bun run dev`(= `bun run --hot index.ts`), 기본 포트 **9999**(`process.env.PORT || 9999`, `index.ts`).

성공(봉투 미적용 계약 응답 — `route/health.ts`):

```bash
curl -i http://localhost:9999/api/health
# 200 {"status":"ok","timestamp":"2026-...Z"}
```

성공(페이지네이션 봉투 — 공개 `GET /api/blog/posts`):

```bash
curl -s http://localhost:9999/api/blog/posts
# {"success":true,"data":[...],"pagination":{"page":1,"limit":...,"total":...,"totalPages":...}}
```

인증 실패(에러 봉투 + log-capture 대상 — 세션 없이 `GET /api/mail/accounts`):

```bash
curl -i http://localhost:9999/api/mail/accounts
# 401 {"success":false,"error":{"code":"UNAUTHORIZED","message":"인증이 필요합니다"}}
# status>=400 이고 /api/logs 경로가 아니므로 logCapture 가 captureServerError 로 기록한다.
```
