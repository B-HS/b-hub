# 스택·불변 사실 (장기 기억)

> 기준: 2026-07-02. 이 파일은 세션·에이전트가 바뀌어도 변하지 않는 이 레포의 전제를 모은다. 어길 수 없는 규칙은 굵게.

## 스택

| 항목 | 값 |
|------|-----|
| 런타임 / 패키지매니저 | **Bun** (`bun run`, `bunx`) — npm/node/pnpm 사용 금지 |
| 서버 프레임워크 | Hono 4 (`hono-openapi` 1 + `@hono/standard-validator`, Swagger UI) — 검증 스키마는 zod 4 |
| DB | MySQL + Drizzle ORM (`mysql2` 풀) |
| 인증 | better-auth (OAuth) + API 토큰 + 도메인별 키(디바이스 키·weather key·spotify widget token) |
| 어드민 UI | Hono JSX **SSR 전용** (`jsxImportSource: 'hono/jsx'`), **CSR/클라이언트 JS 금지**, 폼 POST → 303 |
| 배포 | Vercel 단일 함수(`bun run vercel-build` → `api/index.js`, `vercel.json` rewrite) + `deploy/` 하위 별도 Docker 서비스 2개(caldav-proxy, upload-server) |
| 테스트 | `bun test` (bun:test), tests/ 는 소스 미러 구조, describe/test 한국어 |
| 포맷 | prettier — `feconfig-bhs` 확장 (4-space, no semi, single quote, printWidth 150) |

## 불변 규칙

- **DB 마이그레이션 파일 없음.** 스키마 변경은 `db/schema.ts` 수정 → `bun run db:push` 로 실 DB 반영. `drizzle/` 산출물은 gitignored (DDL 검증용 `drizzle-kit generate` 는 로컬 확인용으로만). → [guidelines/db-schema-change.md](../guidelines/db-schema-change.md)
- **계층 경계**: Drizzle 쿼리는 `compose/` 에서만(ServiceDb 인라인 구현). `service/` 는 HTTP·Drizzle 를 모른다. Route 만 HTTP 경계(검증·인증·에러 throw).
- **에러는 3파일 체계**(`lib/error-code.ts` · `lib/error-message.ts` · `lib/error.ts`)로만. `throw createAppError('CODE')`, `new Error` 직접 throw 금지.
- **응답은 헬퍼로만**: `successResponse` / `paginatedResponse` / `errorResponse` (`lib/api-response.ts`).
- **모든 4xx·5xx 는 `log_events` 로 자동 캡처**된다(`middleware/log-capture.ts`). → [logging.md](../logging.md)
- **환경변수는 `getEnv()`(lib/env.ts) 로만 접근.** 시크릿 하드코딩·문서 기재 금지.
- 커밋: Conventional Commits(type 영어·설명 한국어), **author 사용자 단독, Co-Authored-By/Claude 트레일러 금지, 요청 전 commit/push 금지.**
- 코드 컨벤션: arrow function only · 반환 타입 미명시 · any/unknown 금지 · **코드 주석 금지(JSDoc 영어만 예외)** · named export. 정본: `~/.claude/convention/*`.

## 관련 소비자 (이 서버의 클라이언트)

- 블로그 프론트 `blog.gumyo.net` (디자인 정본: [DESIGN.md](../DESIGN.md)) — blog 도메인 API 소비.
- ESP32 weather 펌웨어(별도 레포) — weather API + 로그 수집([firmware-logging-contract.md](../firmware-logging-contract.md)).
- 신뢰 오리진: `*.gumyo.net` · `*.hyns.dev` · `*.seok.dev` 서브도메인 (커밋 `ae06204`).
