# 신규 도메인 추가 지침

> 기준: 2026-07-02 (dev @ `f6c65f3`) 코드 검증. 다루는 코드: `db/schema.ts`, `lib/error-code.ts`·`lib/error-message.ts`·`lib/error.ts`, `dto/logs/log-event.ts`·`dto/logs/device-key.ts`, `service/domain/logs/log-event.ts`·`service/domain/logs/device-key.ts`, `compose/logs.ts`·`compose/types.ts`·`compose/index.ts`, `route/logs/log-event.ts`·`route/logs/device-key.ts`·`route/index.ts`, `middleware/require-device-key.ts`, `tests/dto/logs/log-event.test.ts`·`tests/service/domain/logs/log-event.test.ts`, `index.ts`, `drizzle.config.ts`, `package.json`

## 목적 / 적용 시점

- **소유 범위**: b-hub 에 **새 도메인 하나**(= 새 테이블군 + `route`/`service/domain`/`dto`/`compose` 4곳에 같은 이름의 슬라이스)를 추가하는 전 계층 절차. 각 계층의 세부 규약은 중복 서술하지 않고 [architecture.md](../architecture.md)·[reference/](../reference/) 로 링크한다.
- **정본 예시**: 이 문서의 모든 예시 경로는 **logs 도메인**이다. logs 는 수집(디바이스 인증)·어드민 CRUD·서비스 mock 테스트를 포함하면서도 전 계층이 최소 형태라 신규 도메인의 뼈대로 삼기 좋다. 완전형은 blog, 도메인 키 인증형은 weather 를 함께 참고한다.
- **적용 시점**

  | 상황 | 이 문서 | 대신 볼 문서 |
  |------|:---:|------|
  | 새 도메인(새 테이블 + 새 route/service/dto/compose 슬라이스) | O | — |
  | 기존 도메인에 엔드포인트만 추가 | X | [엔드포인트 추가 지침](./add-endpoint.md) |
  | 기존 테이블 컬럼/인덱스만 변경 | X | [DB 변경 지침](./db-schema-change.md) |
  | 어드민 SSR 화면만 추가 | X | [admin-page.md](./admin-page.md) |

## 사전 파악 (읽기 순서)

착수 전 아래를 읽어 계층 경계·네이밍·불변 규칙을 확인한다. 추측으로 컨벤션을 만들지 않는다.

- [ ] [architecture.md](../architecture.md) — 부트스트랩 순서(§1), 계층 책임(§2), compose DI(§3), 미들웨어·HOF 합성(§4), 에러 3파일 흐름(§5), 인증 총람(§7).
- [ ] [reference/db-schema.md](../reference/db-schema.md) — 물리명(snake_case)↔TS(camelCase) 네이밍, PK/시각/특수 타입 관례, `db:push` 워크플로, 도메인별 그룹 표.
- [ ] [reference/api-endpoints.md](../reference/api-endpoints.md) — 마운트 합성 규칙(전체 Path = 마운트 접두사 + 라우트 내부 경로), 인증 표기 범례.
- [ ] [reference/lib-utilities.md](../reference/lib-utilities.md) — 에러 3파일 세트, 도메인별 에러코드 prefix 규칙, 중복 구현 금지 인벤토리.
- [ ] 유사 도메인 실물 — [domains/logs.md](../domains/logs.md)(최소형) + `route/logs/*`·`service/domain/logs/*`·`compose/logs.ts`, 필요 시 [domains/blog.md](../domains/blog.md)(완전형)·[domains/weather.md](../domains/weather.md)(도메인 키 인증).
- [ ] [memory/stack-and-invariants.md](../memory/stack-and-invariants.md) — 절대 규칙(Bun 전용, arrow only, 주석 금지, 계층 경계 등).

## 계층 산출물 한눈에

한 도메인은 아래 파일들로 흩어진다. `<domain>` 을 신규 도메인명(kebab-case)으로 치환한다.

| 순서 | 계층 | 신규/수정 위치 | logs 정본 파일 |
|:---:|------|------|------|
| ① | DB 스키마 | `db/schema.ts` (테이블 + `$inferSelect`/`$inferInsert` export 추가) | `db/schema.ts:858-905` |
| ② | 에러 3파일 | `lib/error-code.ts`·`lib/error-message.ts`·`lib/error.ts` (코드·메시지·상태 각각 추가) | 동 3파일 `LOG_*` |
| ③ | DTO | `dto/<domain>/*.ts` (Zod 스키마 + `z.infer` 타입) | `dto/logs/log-event.ts`·`dto/logs/device-key.ts` |
| ④ | 서비스 | `service/domain/<domain>/*.ts` (`*ServiceDb` 타입 + `create*Service` 팩토리) | `service/domain/logs/log-event.ts` |
| ⑤ | compose | `compose/<domain>.ts` 신규 + `compose/types.ts`·`compose/index.ts` 수정 | `compose/logs.ts`·`compose/types.ts:27`·`compose/index.ts:21,32` |
| ⑥ | 라우트 | `route/<domain>/*.ts` 신규 + `route/index.ts` 수정 | `route/logs/log-event.ts`·`route/index.ts:318-332` |
| ⑦ | 미들웨어(선택) | `middleware/require-*.ts` (+ 필요 시 `middleware/index.ts`) | `middleware/require-device-key.ts` |
| ⑧ | 테스트 | `tests/dto/<domain>/`·`tests/service/domain/<domain>/`·`tests/route/<domain>/` | `tests/dto/logs/`·`tests/service/domain/logs/` |
| ⑨ | 어드민(선택) | `page/admin/*` → [admin-page.md](./admin-page.md) | — |
| ⑩ | 문서 | `docs/domains/<domain>.md` 신규 + `docs/reference/*` 갱신 | `docs/domains/logs.md` |

---

## 단계별 절차

### ① DB 스키마 — `db/schema.ts`

- **정본 예시**: `db/schema.ts:858-905` (`log_events`·`device_key`).
- [ ] `db/schema.ts` 에 `mysqlTable('<physical_snake>', { ... }, (table) => [ ... ])` 로 테이블을 추가한다. 물리 컬럼은 **snake_case**, TS 필드는 **camelCase**(예: `error_code`→`errorCode`). 인덱스는 3번째 인자 배열에서 `index('idx_...').on(table.col, ...)` 로 선언한다.
- [ ] 타입 관례를 따른다: PK 는 `int('id').autoincrement().primaryKey()` 기본(대용량이면 `bigint('id', { mode: 'number' })` — `log_events` 가 그렇다), 시각은 `timestamp(col, { fsp: 3 }).defaultNow().notNull()`, JSON 은 `json('col').$type<Record<string, unknown>>()`. 상세 관례는 [reference/db-schema.md](../reference/db-schema.md) "컬럼 타입·기본값 관례".
- [ ] 스키마 하단에 select/insert 타입을 **손으로 적지 말고 유도**해 export 한다: `export type X = typeof x.$inferSelect` / `export type NewX = typeof x.$inferInsert` (정본: `LogEvent`/`NewLogEvent`·`DeviceKey`/`NewDeviceKey`, `db/schema.ts:902-905`).
- [ ] **DDL 검증**: `bun run db:generate`(= `drizzle-kit generate`)로 `./drizzle/*.sql` 에 DDL 을 생성해 눈으로 확인한다(`drizzle/` 은 gitignored, 커밋하지 않는다). 실제 반영은 마이그레이션 파일이 아니라 ⑩ 이후 `bun run db:push` 로 한다(`drizzle.config.ts`: `schema: './db/schema.ts'`, `dialect: 'mysql'`).

### ② 에러 3파일 — `lib/error-code.ts` · `lib/error-message.ts` · `lib/error.ts`

- **정본 예시**: `LOG_EVENT_NOT_FOUND`(404)·`LOG_BATCH_TOO_LARGE`(413)·`LOG_INGEST_FAILED`(500)·`LOG_DEVICE_KEY_INVALID`(401)·`LOG_DEVICE_KEY_RATE_LIMIT`(429).
- [ ] `lib/error-code.ts` 의 `ERROR_CODE` 에 **도메인 접두**(`<DOMAIN>_*`) 코드를 추가한다. `ErrorCode` union 은 `(typeof ERROR_CODE)[keyof typeof ERROR_CODE]` 로 자동 확장된다.
- [ ] `lib/error-message.ts` 의 `ERROR_MESSAGE` 에 한국어 메시지를 추가한다. 타입이 `Record<ErrorCode, string>` 이라 코드를 빠뜨리면 **컴파일 에러**로 잡힌다.
- [ ] `lib/error.ts` 의 `STATUS_MAP` 에 HTTP 상태를 추가한다. **주의**: `STATUS_MAP` 은 `Record<string, number>`(≠`Record<ErrorCode, …>`)라 누락을 컴파일러가 못 잡고 `getStatusCode` 의 `?? 500` fallback 으로 조용히 500 이 된다(현재 미매핑 3종 존재 — [reference/lib-utilities.md](../reference/lib-utilities.md) "STATUS_MAP 누락"). 세 파일 정합을 수동 확인한다.
- [ ] 던질 때는 `throw createAppError('<DOMAIN>_CODE'[, details])` 만 쓴다. `new Error()` 직접 throw 금지. prefix 규칙은 [reference/lib-utilities.md](../reference/lib-utilities.md) "도메인별 에러코드 prefix 규칙".

### ③ DTO — `dto/<domain>/`

- **정본 예시**: `dto/logs/log-event.ts`(입력·목록쿼리·응답 스키마), `dto/logs/device-key.ts`(생성·응답 스키마).
- [ ] `dto/<domain>/*.ts` 에 **Zod 스키마만** 둔다(별도 validator 클래스 금지). 접미사 관례: 입력 `*Schema`(예: `logEventIngestSchema`), 목록 쿼리 `*ListQuerySchema`, 응답 `*ResponseSchema`.
- [ ] 쿼리/숫자 입력은 `z.coerce.number()...` + `.default(...)` 로 문자열을 안전 변환한다(정본: `logEventListQuerySchema` 의 `limit`/`offset`, `dto/logs/log-event.ts:34-49`).
- [ ] 타입은 손으로 적지 말고 `export type X = z.infer<typeof xSchema>` 로 유도한다(`dto/logs/log-event.ts:71-76`).
- [ ] 도메인 상수(예: `SEVERITY`)를 DTO 에 두면 서비스가 이를 import 해 쓴다(`service/domain/logs/log-event.ts:1` 가 `dto/logs/log-event.ts` 의 `SEVERITY` 를 import). DTO 는 서비스·라우트가 공유하는 데이터 계약 계층으로 취급한다.

### ④ 서비스 — `service/domain/<domain>/`

- **정본 예시**: `service/domain/logs/log-event.ts`.
- [ ] **`<Domain>ServiceDb` 타입**을 정의한다 — 범용 CRUD 가 아니라 도메인 동작 단위 메서드 집합(정본: `LogEventServiceDb = { insertEvent, insertEvents, resolveById, listEvents, getById, deleteOlderThan }`, `service/domain/logs/log-event.ts:36-43`). 실제 Drizzle 구현은 여기 두지 않고 ⑤ compose 가 주입한다.
- [ ] **`create<Domain>Service(deps)` 팩토리**를 arrow 로 작성해 도메인 메서드 객체를 반환하고, `export type <Domain>Service = ReturnType<typeof create<Domain>Service>` 로 타입을 유도한다(`service/domain/logs/log-event.ts:52-133`).
- [ ] 서비스는 **HTTP·Drizzle 을 모른다.** 입력은 DTO 타입, "없음"은 `null` 반환으로 표현하고 `throw`(에러 변환)는 ⑥ 라우트가 담당한다.
- [ ] **예외 주의**: `service/domain/logs/device-key.ts` 는 `db: Database`(Drizzle)를 서비스에 직접 받는 패턴으로, 계층 규칙(쿼리는 compose 에만)에서 **벗어난 문서화된 예외**다([reference/db-schema.md](../reference/db-schema.md) 개요의 "직접 접근" 목록). 신규 도메인은 이 예외가 아니라 `log-event` 의 **ServiceDb 주입 패턴**을 따른다.

### ⑤ compose 배선 — `compose/<domain>.ts` + `compose/types.ts` + `compose/index.ts`

- **정본 예시**: `compose/logs.ts`, `compose/types.ts:27`, `compose/index.ts:21,32`.
- [ ] `compose/<domain>.ts` 신규: `compose<Domain>({ db, env }: Compose<Domain>Args)` 가 `<Domain>ServiceDb` 를 **Drizzle 로 인라인 구현**(`db.select/insert/update/delete(...)`)해 `create<Domain>Service({ db: <domain>Db, ... })` 에 주입하고, 도메인 서비스 객체를 반환한다(`compose/logs.ts:10-66`).
- [ ] `compose/types.ts` 에 조립 인자 타입을 추가한다: core 만 필요하면 `export type Compose<Domain>Args = ComposeCoreArgs`(정본 `ComposeLogsArgs`, `compose/types.ts:27`). 공용 서비스(storage 등)가 더 필요하면 `ComposeBlogArgs`/`ComposeMailArgs` 처럼 `ComposeCoreArgs & { ... }` 로 계약한다.
- [ ] `compose/index.ts` 에 배선한다: `import { compose<Domain> } ...` → **core → shared → domain** 순서 안에서 `const <domain> = compose<Domain>(core)`(shared 산출물이 필요하면 `{ ...core, storageService: shared.storageService }` 주입) → return 객체에 `...<domain>` 스프레드 병합(`compose/index.ts:6,21,32`). 병합 결과는 `composed.<serviceName>` 처럼 도메인 접두 없이 평탄한 키로 노출된다.

### ⑥ 라우트 배선 — `route/<domain>/` + `route/index.ts`

- **정본 예시**: `route/logs/log-event.ts`·`route/logs/device-key.ts`, `route/index.ts:318-332`.
- [ ] `route/<domain>/*.ts` 신규: `create<Domain>Route(deps)` 팩토리가 `new Hono<AuthContext>()` 를 반환한다(`route/logs/log-event.ts:27-28`). 세션 의존은 `getSession: Parameters<typeof withAuth>[0]['getSession']` 로 타입을 유도한다(`route/logs/log-event.ts:24`).
- [ ] 각 핸들러 = `describeRoute({ tags, summary, responses: { 200: {...}, ...errorResponses([...codes]) } })` + `validator('json'|'query', <schema>)` + HOF 합성. 값은 `c.req.valid('json' as never) as z.infer<typeof <schema>>` 로 꺼낸다.
- [ ] **HOF 합성 순서**: 바깥 `withErrorHandling` → 안쪽 인증(`withAdmin`/`withAuth`). 예: `withErrorHandling(withAdmin({ getSession: deps.getSession })(async (c) => { ... }))`(`route/logs/log-event.ts:95-120`). 디바이스/도메인 키 미들웨어는 핸들러 앞 체인에 둔다(`describeRoute, requireDeviceKey({...}), validator, withErrorHandling(...)`, `route/logs/log-event.ts:30-45`).
- [ ] "없음"은 서비스가 준 `null` 을 라우트가 `throw createAppError('...')` 로 변환한다. 응답은 봉투 헬퍼로만: `successResponse(data)` / `paginatedResponse(data, { page, limit, total })`. 목록은 row → 응답 shape 매핑 시 `Date` 를 `?.toISOString() ?? null` 로 직렬화한다(`route/logs/log-event.ts:99-118`).
- [ ] `route/index.ts` 의 `createRouter` 에 마운트한다: `import { create<Domain>Route } ...` → `router.route('/<domain>', create<Domain>Route({ <service>: stub(deps.<service>), getSession: stubFn(deps.getSession) as never }))`. 각 의존성은 `stub()`/`stubFn()` 로 감싸 미주입 시 `SERVICE_NOT_CONFIGURED`(503) 를 던지게 한다(`route/index.ts:44-59,318-332`). 더 구체적인 접두사를 먼저 등록한다(정본은 `/logs/device-keys` 를 `/logs` 앞에 등록, `route/index.ts:318,325`). `index.ts` 가 이 라우터를 `app.route('/api', api)` 로 마운트하므로 최종 경로는 `/api/<domain>/...` 이다.

### ⑦ 미들웨어 (필요 시)

- **정본 예시**: `middleware/require-device-key.ts`(라우트가 직접 다는 도메인 키 가드).
- [ ] 라우트 단위 가드가 필요하면 `middleware/require-<x>.ts` 에 `require<X>(deps) => async (c, next) => { ... }` 를 만든다. 헤더 검증 후 실패 시 `throw createAppError('...')`, 임시 컨텍스트 변수는 `c.set('<var>' as never, <val> as never)` 로 세팅하고 `await next()`(`middleware/require-device-key.ts:9-23`). 라우트 인증의 기본은 미들웨어가 아니라 ⑥ 의 HOF 임에 유의한다.
- [ ] 전역 체인(모든 요청)에 걸어야 하면 `middleware/index.ts` 의 `createMiddleware` 등록 순서를 수정한다. 현재 전역 체인은 `cors`(`/api/*`) → `securityHeaders` → `logCapture` → `errorHandler` 뿐이다(상세: [architecture.md](../architecture.md) §4). 대부분의 도메인은 전역 미들웨어 추가가 필요 없다.

### ⑧ 테스트 — dto · service · route

- **정본 예시**: `tests/dto/logs/log-event.test.ts`, `tests/service/domain/logs/log-event.test.ts`.
- [ ] 테스트는 **소스 미러 구조**로 둔다: `tests/dto/<domain>/`, `tests/service/domain/<domain>/`, `tests/route/<domain>/`. `bun:test`(`describe`/`test`), 설명은 한국어.
- [ ] **DTO 테스트**: 스키마 `parse` 로 기본값·강제변환·실패를 검증한다(`tests/dto/logs/log-event.test.ts` — `severity` 기본 20·이름→숫자, `limit` 최대 500 초과 실패 등).
- [ ] **서비스 테스트**: `<Domain>ServiceDb` 를 `mock(async ...)` 로 만들어 `create<Domain>Service({ db: db as never, ... })` 에 주입하고 호출 인자를 단언한다(`tests/service/domain/logs/log-event.test.ts:5-12`).
- [ ] **라우트 테스트**: Hono 요청 주입 방식으로 작성한다. logs 는 현재 라우트 테스트가 없으므로 정본 패턴은 [testing.md](../testing.md) §4.3 과 `tests/route/blog/*.test.ts` 를 따른다. 작성 위치 판단은 [testing.md](../testing.md) §6.

### ⑨ 어드민 페이지 (필요 시)

- 어드민 SSR 조회/조작 화면이 필요하면 `page/admin/*` 에 추가한다. **SSR JSX 전용(CSR 금지), 폼 POST → 303** 규약을 따른다. 절차·정본은 [admin-page.md](./admin-page.md), 기존 화면 목록은 [admin-features.md](../admin-features.md).

### ⑩ 문서 갱신

- **도메인 문서 신규**: `docs/domains/<domain>.md` 를 [domains/logs.md](../domains/logs.md) 형식으로 작성한다 — 기준 인용줄 / 개요 / 파일 맵(표) / API 엔드포인트(표) / 핵심 흐름 / 관련 문서. 설계 상세가 별도 문서에 있으면 중복 서술하지 말고 링크한다.
- **reference 갱신** (아래 표):

  | 문서 | 갱신 내용 | 조건 |
  |------|------|------|
  | [reference/db-schema.md](../reference/db-schema.md) | "도메인별 그룹" 표 합계(현재 **49**) + 새 `## <domain>` 인벤토리 섹션 + 개요의 "물리 테이블 총 49개" 수치 | 테이블 추가 시 필수 |
  | [reference/api-endpoints.md](../reference/api-endpoints.md) | 새 `## <domain>` 라우트 섹션 + "파일별 라우트 카운트(자기검증)" 표 행 + API 합계(현재 **167**) | 라우트 추가 시 필수 |
  | [reference/lib-utilities.md](../reference/lib-utilities.md) | 에러코드 "**101종**"/`STATUS_MAP`"98" 카운트 + "도메인별 에러코드 prefix 규칙" 에 새 prefix | 에러코드 추가 시 필수 |
  | [reference/env.md](../reference/env.md) | "변수 인벤토리" 표 + ".env.example ↔ lib/env.ts 차집합" | 새 환경변수 시 |
  | [reference/shared-services.md](../reference/shared-services.md) | "인벤토리" + "조립·주입 관계" | 새 공용 서비스(`service/shared/*`) 추가 시 |

- **트리거 표 준수**: 코드 변경 → 문서 갱신 대응은 [docs-maintenance.md](./docs-maintenance.md) 의 트리거 표를 따른다.

---

## 검증

각 스텝 후, 그리고 머지 전 아래를 통과시킨다(머지 체크리스트: [quality-assurance/pre-merge-checklist.md](../quality-assurance/pre-merge-checklist.md)).

| 목적 | 명령 | 비고 |
|------|------|------|
| 타입체크 | `bunx tsc --noEmit` (= `bun run typecheck`) | 에러 3파일 정합·타입 유도 확인 |
| 테스트 | `bun test` (부분: `bun test tests/<경로>`) | dto·service·route |
| DDL 미리보기 | `bun run db:generate` | `./drizzle/*.sql` 육안 확인(커밋 안 함) |
| 스키마 반영 | `bun run db:push` | 마이그레이션 파일 없이 직접 반영(`drizzle/` gitignored) |

## 관련 문서

- [architecture.md](../architecture.md) — 부트스트랩·계층·compose·에러·인증 전역 골격.
- [reference/db-schema.md](../reference/db-schema.md) · [reference/api-endpoints.md](../reference/api-endpoints.md) · [reference/lib-utilities.md](../reference/lib-utilities.md) · [reference/env.md](../reference/env.md) · [reference/shared-services.md](../reference/shared-services.md) — 전수 인벤토리(갱신 대상).
- [domains/logs.md](../domains/logs.md) — 이 문서의 정본 예시 도메인.
- [testing.md](../testing.md) — 테스트 구조·패턴·작성 위치.
- [admin-page.md](./admin-page.md) · [docs-maintenance.md](./docs-maintenance.md) — 어드민 화면 / 문서 갱신 트리거.
- [memory/stack-and-invariants.md](../memory/stack-and-invariants.md) — 절대 규칙.
