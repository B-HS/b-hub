# 에러 처리·로깅 작업 지침

> 기준: 2026-07-02 (dev @ `f20afcf`) 코드 검증. 다루는 코드: `lib/error-code.ts`, `lib/error-message.ts`, `lib/error.ts`, `lib/with-error-handling.ts`, `lib/with-auth.ts`, `lib/api-response.ts`, `lib/sensitive-filter.ts`, `lib/discord.ts`, `lib/sentry.ts`, `lib/hono-types.ts`, `lib/log-service-name.ts`, `dto/error-response.ts`, `dto/logs/log-event.ts`, `middleware/error-handler.ts`, `middleware/log-capture.ts`, `middleware/index.ts`, `service/domain/logs/log-event.ts`, `compose/logs.ts`.

> "에러를 어떻게 던지고, 그 에러가 응답·로그·알림으로 어떻게 흐르는가"의 **작업 규칙**만 다룬다.
> `log_events` 데이터 모델·수집 API·리텐션·어드민은 [../logging.md](../logging.md), 계층·부트스트랩 개요는 [../architecture.md](../architecture.md) 가 소유한다 — 중복 없이 링크한다.

---

## 1. 새 에러코드 추가 절차

**3파일을 동시에** 수정한다. 한 파일이라도 빠지면 아래 표의 결과가 난다.

| 순서 | 파일 | 추가할 것 | 빠뜨리면 |
|------|------|-----------|----------|
| 1 | `lib/error-code.ts` | `ERROR_CODE` 객체에 `NEW_CODE: 'NEW_CODE'` | `ErrorCode` union 에 없어 이후 참조가 타입 에러 |
| 2 | `lib/error-message.ts` | `ERROR_MESSAGE` 에 `NEW_CODE: '한국어 메시지'` | `ERROR_MESSAGE` 는 `Record<ErrorCode, string>` → **`tsc` 가 누락을 강제로 잡음** |
| 3 | `lib/error.ts` | `STATUS_MAP` 에 `NEW_CODE: <status>` | `STATUS_MAP` 은 `Record<string, number>` → **`tsc` 가 못 잡음**, `getStatusCode` 가 `?? 500` 으로 **조용히 500 fallback** |

- `ERROR_CODE` 는 `as const` → `ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE]` 로 union 이 자동 확장된다. 코드 문자열은 키와 동일하게 적는다.
- **prefix 규칙(도메인 접두)**: `BLOG_*`, `MAIL_*`, `WEATHER_*`, `SPOTIFY_*`, `CALENDAR_*`, `DRIVE_*`, `RESUME_*`, `BADGE_*`, `LOG_*`. 공통은 접두 없음(`VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMIT_EXCEEDED`, `INTERNAL_ERROR`, `EXTERNAL_API_ERROR`), 인프라 횡단은 `STORAGE_*`/`IMAGE_*`/`FONT_*`/`ICON_*`/`NOTIFICATION_*`/`AI_*`/`API_TOKEN_*`/`SERVICE_NOT_CONFIGURED`.

### 상태코드 매핑 규칙 (`STATUS_MAP` 실물)

- `STATUS_MAP` 은 `lib/error.ts` 안의 `Record<string, number>` 이고, `getStatusCode(code) = STATUS_MAP[code] ?? 500` 이다. **명시하지 않은 코드는 모두 500** 이 된다.
- 상태코드는 의미에 맞춘다(실물 예): 조회 실패 `404`, 검증/입력 `400`, 인증 `401`, 권한 `403`, 충돌 `409`, 용량초과 `413`, 처리불가 `422`, 레이트리밋 `429`, 외부 API 실패 `502`, 미구성 `503`, 서버 내부 `500`.
- **현재 미매핑 3종(주의)**: `MAIL_UPLOAD_BLOCKED_EXTENSION`, `MAIL_BLOCKED_HOST`, `MAIL_OAUTH_ACCOUNT_MISMATCH` 는 `error-code`/`error-message` 에는 있으나 `STATUS_MAP` 에 없어 **현재 500 으로 응답**된다. 4xx 의도라면 `STATUS_MAP` 항목을 추가해야 한다. (상태코드는 severity·Discord 알림까지 좌우 — §5)

### (선택) 라우트 OpenAPI 노출

- 라우트가 반환할 수 있는 코드는 `dto/error-response.ts` 의 `errorResponses([...codes])` 에 넣어 `describeRoute({ responses: { ..., ...errorResponses([...]) } })` 로 병합한다.
- `errorResponses` 는 `getStatusCode` 로 코드를 status 별로 묶으므로, **`STATUS_MAP` 을 먼저 채운 뒤** 사용한다.

**검증**: `bunx tsc --noEmit` (message 누락·union 참조 오류를 잡는다). status 는 tsc 로 안 잡히니 §1 표대로 직접 확인.

---

## 2. throw 규칙

- **도메인 서비스·라우트 경계에서는 `throw createAppError('CODE'[, details])` 만** 쓴다. 저장소 전체에서 `throw createAppError` 280여 곳이 표준이다.
- `createAppError(code, details?)` 결과: `message = ERROR_MESSAGE[code]`, `statusCode = getStatusCode(code)`. `details` 는 **비프로덕션 응답 봉투에만** 실리고 **로그에는 실리지 않는다**(§4·§6).
- Service 는 "없음"을 `null` 로 반환하고 `throw` 변환은 Route 가 한다 — 계층 규칙은 [../architecture.md](../architecture.md) §5.
- `isAppError` 는 구조 검사(`code`·`message`·`statusCode` 보유)로 AppError 여부를 판정한다. 일반 `Error` 는 미처리 예외로 분류된다.

### 코드에 존재하는 `new Error` 예외

컨벤션은 `new Error` 를 금지하지만, 아래 **저수준·부트스트랩 계층**에는 실제 `new Error` 가 있다. 도메인/라우트 코드에는 두지 않는다.

| 성격 | 위치(실물) | 처리 |
|------|-----------|------|
| 부트스트랩/설정 검증 | `lib/env.ts`, `compose/mail.ts`(암호화 키), `compose/spotify.ts`, `page/admin/index.ts` | 앱 기동 시 throw, 요청 경로가 아님 |
| 저수준/프로바이더 | `service/domain/mail/providers/imap-provider.ts`·`gmail-provider.ts`, `service/domain/weather/kma-api.ts`, `lib/external-api.ts`, `lib/hmac-state.ts` | raw `Error`. `withErrorHandling`/`errorHandler` 에 도달하면 `INTERNAL_ERROR`(500) 로 변환되고 **`error.message` 가 `errorDetail` 로 복사되어 로그에 남는다**(→ §6 유출 주의) |

---

## 3. HOF 합성 순서

라우트 핸들러는 **바깥 `withErrorHandling` → 안쪽 인증 HOF** 순으로 감싼다.

```
withErrorHandling(
    withAuth({ getSession })(async (c, user) => { ... }),
)
```

- **이유**: 인증 HOF 는 실패 시 `createAppError` 를 throw 한다(`withAuth`→`UNAUTHORIZED`, `withAdmin`→role 불일치 시 `FORBIDDEN`, `withApiToken`→`API_TOKEN_INVALID`). 이 throw 를 바깥 `withErrorHandling` 이 잡아 응답 봉투로 변환하고 `errorCode` 컨텍스트를 세팅해야 `logCapture` 가 캡처한다(§4). 순서를 뒤집으면 인증 실패가 잡히지 않는다.
- 인증 HOF 는 성공 시 `user` 를 **핸들러의 2번째 인자**(`(c, user)`)로 넘긴다(컨텍스트 세팅 아님).
- `validator(...)`(hono-openapi, 내부 `@hono/standard-validator`)는 HOF 바깥의 별도 미들웨어로 핸들러보다 먼저 실행된다 → 검증 실패 시 `throw` 없이 `validator` 자체가 400 JSON(`{ data, error: issues[], success: false }`)으로 직접 응답한다(`withErrorHandling`/`errorHandler` 미경유). 이때 `errorCode` 컨텍스트가 없어 `logCapture` 는 status 폴백으로 코드를 정한다(§4-2).
- 도메인 키·디바이스 인증(`require-weather-key`·`require-device-key`)은 HOF 가 아니라 라우트가 직접 다는 미들웨어다. 상세는 [../architecture.md](../architecture.md) §7.

---

## 4. 4xx/5xx 자동 캡처 경로 (코드 수정 없이 적재)

미들웨어 전역 체인(등록 순, `middleware/index.ts`): `cors → securityHeaders → logCapture → errorHandler`. **`logCapture` 가 `errorHandler` 바깥에 등록**되어, 응답이 확정된 뒤 최종 status 를 읽는다.

### 4-1. 에러 → 컨텍스트 변수 세팅 (캐치 2지점)

동일 로직이 두 곳에 있다 — `withErrorHandling`(핸들러 래퍼, `lib/with-error-handling.ts`)과 `errorHandler`(전역 미들웨어). 전자는 감싼 핸들러의 에러를, 후자는 그 밖(미래핑·미들웨어)의 에러를 잡는 이중 안전망이다.

| 입력 | 세팅하는 컨텍스트 | 응답 |
|------|-------------------|------|
| `isAppError` | `c.set('errorCode', error.code)` | `errorResponse(code, message, details)` @ `statusCode` |
| 미처리 예외 | `c.set('errorDetail', error instanceof Error ? error.message : 'Unknown error')` (+ dev 모드 `console.error`, `captureException`) | `errorResponse('INTERNAL_ERROR', …)` @ `500` |

- AppError 는 `errorDetail` 을 세팅하지 않는다 → 로그 설명은 정적 `ERROR_MESSAGE` 가 된다(§6).
- `errorResponse` 의 `details` 는 `NODE_ENV !== 'production'` 일 때만 직렬화된다(`lib/api-response.ts`).

### 4-2. `logCapture` insert 시점 (`middleware/log-capture.ts`)

`next()` 반환 후 아래 순서로 동작한다.

1. `c.res.status < 400` 이면 return(적재 안 함). `c.req.path` 가 `/api/logs` 로 시작하면 return(자기참조 차단).
2. `errorCode = c.get('errorCode') ?? errorCodeFromStatus(status)` — 컨텍스트 변수가 없으면(예: validator 400) status 에서 코드 폴백.
3. `errorDetail = c.get('errorDetail')`, `description = errorDetail ?? ERROR_MESSAGE[errorCode] ?? errorCode`.
4. `logEventService.captureServerError({ service: serviceNameFromPath(path), errorCode, severity: severityFromStatus(status), errorDescription: description(≤2000자), correlationId: 'x-correlation-id' 헤더, ingestIp: 'x-forwarded-for'/'x-real-ip', source: 'server', details: { path, method, status, durationMs } })` 를 **fire-and-forget**(`.catch(captureException)`)으로 호출.
5. `next()` 이후 캡처 로직만 `try/catch` 로 감싸여(에러는 `captureException` 으로 삼킴) 응답을 절대 차단하지 않는다. `next()` 자체의 에러는 안쪽 `errorHandler` 가 이미 응답으로 변환하므로 여기로 전파되지 않는다.

- `captureServerError` 는 `db.insertEvent(row)` 후 `maybeAlert(row)`(§5)를 호출한다.
- **Sentry 주의**: `captureException` 은 `initSentry(SENTRY_DSN)` 가 호출돼야 동작하는데 현재 부트스트랩에서 호출되지 않아(테스트에서만) **사실상 no-op** 이다. 실질 캡처 창구는 `log_events` 다.
- 단일 적재·재귀 없음·응답 비차단 불변식은 [../logging.md](../logging.md) §2 참조.

---

## 5. severity 선택 기준과 Discord 알림 조건

`SEVERITY`(`dto/logs/log-event.ts`): `DEBUG 10 / INFO 20 / WARN 30 / ERROR 40 / FATAL 50`.

| 경로 | severity 결정 |
|------|---------------|
| 서버 자동 캡처 | `severityFromStatus(status)` = **5xx → 40(ERROR)**, **그 외(4xx) → 30(WARN)** |
| 디바이스 수집(`ingest`/`ingestBatch`) | 호출자(펌웨어)가 보낸 값. 디폴트 20(INFO) — [../firmware-logging-contract.md](../firmware-logging-contract.md) 소유 |

### Discord 알림 조건 (실측)

- `maybeAlert` 는 `alerter && severity >= SEVERITY.ERROR`(=40) 일 때만 `alerter` 를 호출한다. → **서버 자동 캡처는 5xx(40)만 알림**, **4xx(30)는 로그만 남고 알림 없음**. 디바이스 로그는 ERROR/FATAL 을 보낸 경우 알림.
- `alerter` 는 `env.DISCORD_WEBHOOK_URL` 이 설정된 경우에만 존재(`compose/logs.ts`). 미설정 시 알림 off.
- **60초 throttle**: `service:errorCode` 키로 60_000ms 내 중복 알림 억제(인메모리 `Map`). 메시지 본문은 1900자 컷(`lib/discord.ts`).
- 알림 상세는 [../logging.md](../logging.md) §4 참조.

### 새 실패의 severity·알림을 정하는 법

- severity 는 **코드 자체가 아니라 HTTP status(= `STATUS_MAP` 매핑)** 로 결정된다. **5xx 로 매핑하면 자동으로 Discord 알림 대상**이 된다.
- 사용자에게 알려야 하는 서버측/외부 API 실패는 `500`/`502`(알림 O), 사용자 입력·권한·조회 실패는 4xx(알림 X)로 매핑한다.

---

## 6. 민감정보 규칙

### `lib/sensitive-filter.ts` 실물

- `SENSITIVE_KEYS`(17개): `password`, `passwd`, `pwd`, `secret`, `token`, `apitoken`, `api_token`, `authtoken`, `auth_token`, `authorization`, `key`, `apikey`, `api_key`, `access_token`, `refresh_token`, `credential`, `private`.
- `isSensitiveKey(key)` = 소문자 변환 후 위 문자열을 **부분 문자열로 포함**하면 true. `filterSensitiveData(data)` = 해당 키의 값을 `'[REDACTED]'` 로 치환.
- **중요**: 이 유틸은 현재 **프로덕션 경로 어디에도 연결돼 있지 않다**(자체 테스트만 import). 즉 로그 `details` 를 자동으로 마스킹하지 않는다. 키/값 데이터를 로그에 넣는 새 경로를 만들 때 **직접 호출**해야 한다.

### 자동 캡처가 실제 저장하는 값

- `details` = `{ path, method, status, durationMs }` 고정 — **요청 본문·쿼리·헤더는 포함하지 않는다**(이 경로로는 비밀이 흘러들지 않음).
- `errorDescription` = AppError 는 정적 `ERROR_MESSAGE`(안전), **미처리 예외는 `error.message` 원문**(유출 벡터).
- AppError 의 `details` 인자는 **로그에 저장되지 않는다**(비프로덕션 응답에만).

### 로그에 넣으면 안 되는 것

| 대상 | 규칙 |
|------|------|
| `error.message`(`new Error` 포함) | 토큰·비밀번호·키·PII 를 문자열에 넣지 않는다 → `errorDetail` 로 그대로 로그된다(§2 저수준 계층 특히 주의) |
| `createAppError` `details` 인자 | message 는 정적이라 안전하나, `details` 에 비밀 금지(비프로덕션 응답 노출) |
| `captureServerError`/`ingest` 의 `details`·`errorDescription` | 비밀·PII 금지 |
| 디바이스 `details`(json) | verbatim 저장 → 펌웨어 측에서 마스킹([../firmware-logging-contract.md](../firmware-logging-contract.md)) |

---

## 7. 체크박스 요약

- [ ] 새 에러코드: `error-code.ts` + `error-message.ts` + `error.ts`(`STATUS_MAP`) **3파일 동시**, 도메인 prefix 준수, `STATUS_MAP` 미매핑=500 확인(현재 미매핑 3종 인지).
- [ ] 던질 때 도메인/라우트는 `createAppError('CODE')` 만. `new Error` 는 부트스트랩·저수준 계층에만.
- [ ] 라우트 HOF: `withErrorHandling`(바깥) → 인증 HOF(안쪽) 순서.
- [ ] 4xx·5xx 는 `logCapture` 가 자동 적재(코드 수정 불필요), `/api/logs` 제외.
- [ ] 5xx=severity 40=Discord 알림 대상 / 4xx=30=로그만 — `STATUS_MAP` 상태코드로 조절.
- [ ] `error.message`·`details`·디바이스 `details` 에 비밀·PII 금지(`sensitive-filter` 는 자동 적용 아님).
- [ ] `bunx tsc --noEmit` 로 message 누락·union 참조를 검증(상태코드는 수동 확인).
