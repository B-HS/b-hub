# 2026-07-02 — 의존성 최신화 (안전분 + breaking major 3종)

> 브랜치 `chore/deps-update`. 결정 정본: [../acknowledge/2026-07-02-deps-upgrade.md](../acknowledge/2026-07-02-deps-upgrade.md). 매 단계 `bunx tsc --noEmit` 0 + `bun test` 2268 pass 로 검증하고 독립 커밋.

## 커밋 단위

| 커밋      | 내용                                                                                                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c70b372` | 안전 최신화 — minor/patch 전부 + 저위험 major 7(`@sentry/bun` 10 · `@google/genai` 2 · `icojs` 1 · `@hono/swagger-ui` 0.6 · `sharp` 0.35 · `satori` 0.26 · `typescript` 6) + 보안 `nodemailer` 9(raw 옵션 파일접근/SSRF, dependabot high) |
| `c3adc1f` | `better-auth` 1.4.18→**1.6.23**                                                                                                                                                                                                           |
| `b04e93f` | `hono` 4.11.9→**4.12.27**                                                                                                                                                                                                                 |
| `5887a60` | `zod` 3.25.76→**4.3.6** + `hono-openapi` 0.4.8→**1.3.0** + `@hono/standard-validator` 0.2.3 추가, `zod-openapi`·`@hono/zod-validator` 제거                                                                                                |
| `ed87433` | 범위 내 패치 후속 반영 — `nodemailer` 9.0.3 · `zod` 4.4.3                                                                                                                                                                                 |

## breaking 대응 상세

### better-auth 1.6 (`c3adc1f`)

- 증상: 내부 zod v4 참조로 `createAuthProvider`·`composeShared`·`compose` 추론 반환 타입이 non-portable(TS2883).
- 해결: leaf 인 `createAuthProvider` 만 옵션을 `BetterAuthOptions` 로 타입하고 반환을 명시 `Auth`(기본 제네릭) 로 annotation → compose 2곳은 연쇄 해소. 캐스팅(`as`) 없음. admin 플러그인 전용 API 타입은 코드 미사용(사용 API 는 `handler`·`getSession`·`signInSocial`·`signOut` 뿐)이라 손실 없음.
- 부수 정리: `process.env.NODE_ENV` 직접 접근을 `isProduction` deps 주입으로 교체(lint 훅 지적).
- 런타임: 1.5/1.6 은 core `betterAuth()`/`getSession`/세션·쿠키/drizzle 어댑터 무변경. 참고 거리 — 1.6 의 `freshAge` 기준 변경(createdAt), 1.5 의 sign-in 레이트리밋 강화(3/10s)·CSRF/origin 분리는 이 레포 사용 표면(관리자 소셜 로그인)에 실영향 없음. `baseURL` 은 항상 명시 주입이라 `VERCEL_URL` 자동감지 영향 없음.

### hono 4.12 (`b04e93f`)

- 증상: 4.12.5(PR #4723)부터 path 제네릭이 소실된 핸들러(`withErrorHandling` 등 HOF 래핑)에서 `c.req.param(key)` 가 `string | undefined` → 35지점/18파일 tsc 에러.
- 해결: 전 지점에서 해당 param 이 라우트 경로 리터럴의 **필수** param 임을 확인 후 할당 지점 non-null(`!`) 처리. `?? ''` 류 기본값 대입 0건(`Number('') === 0` 오인 버그 방지 — acknowledge 결정), 기존 `isNaN` 가드 전부 보존. 시맨틱 변화 없음.
- 참고: `Number(c.req.param('id'))` 처럼 `Number()` 에 바로 넣는 형제 지점은 tsc 에러가 아니어서(undefined→NaN→가드) 미변경.
- 4.11.9→4.12.27 구간에 JSX SSR 보안 픽스 다수(attr/tag 검증, per-request context 격리, css `cx()` escaping) 포함 — 어드민 SSR 은 전체 테스트로 확인.

### zod 4 + hono-openapi 1 (`5887a60`)

- 패키지 결정: `zod-openapi`·`@hono/zod-validator` 는 **직접 사용 0**(구 hono-openapi 0.4 의 내부 의존)으로 실측 확인 → 업그레이드 대신 **제거**. hono-openapi 1 은 Standard Schema 기반이라 zod 4 를 네이티브 소비(`@hono/standard-validator` 만 추가).
- import 재작성: `hono-openapi/zod` 서브패스 제거 → 32파일의 `resolver`/`validator` import 를 루트 `hono-openapi` 로 병합.
- zod 4 마이그레이션(공식 changelog 기준): `z.record` 2인자 필수화 5곳 · `z.string().email()`→`z.email()` 2곳 · `.uuid()`→`z.uuid()` 1곳 · `.url()`→`z.url()` 5곳(lib/env.ts) · `.datetime()`→`z.iso.datetime()` 3곳 · refine `message:`→`error:` 6곳. `.default().transform()` 체인(logs severity)은 v4 시맨틱에서도 동작 동일 확인.
- 타입 portability: `errorResponses`(dto/error-response.ts) 반환에 `ResponsesWithResolver`(hono-openapi export) 명시 annotation(TS4023 해소).
- 스모크(합성 env 부팅): `/docs` 200 — OpenAPI **3.1.0**(구 3.0.3), 107 paths, 응답 JSON 스키마 278개 전부 비어있지 않음. `/swagger` 200. validator 400 바디는 standard-validator 형식 `{ data, error: issues[], success: false }` 로 변경(구 zod-validator 는 ZodError 직렬화) — 프로젝트 에러 봉투 미경유는 종전과 동일, 테스트는 status 만 단언해 무영향.

## 행동 변화 요약 (소비자 관점)

> FE 프로젝트별 검수 절차: [../quality-assurance/fe-deps-impact-check.md](../quality-assurance/fe-deps-impact-check.md)

- OpenAPI 문서 버전 3.0.3 → 3.1.0 (스키마는 zod 4 네이티브 `toJSONSchema` 산출).
- 검증 실패(400) 응답 바디 형태 변경 (위 참조).
- `z.email()` 은 v3 `.email()` 보다 엄격한 기본 정규식.
- 나머지 API 계약(경로·성공 봉투·에러코드) 무변경, 스키마 변경 없음(db:push 불필요).
