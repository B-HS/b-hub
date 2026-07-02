# b-hub (hyun-hub) — 에이전트 온보딩

> 모든 코딩 에이전트/LLM 의 단일 진입점. **작업 전 [docs/index.md](./docs/index.md) 의 읽기 순서를 따른다.** 이 파일은 요약만 담는다 — 상세는 전부 docs/ 에 있고, docs/ 가 정본이다.

## 무엇인가

Bun + Hono 로 만든 개인 허브 백엔드 단일 서비스. 도메인: blog(블로그 API) · mail(멀티계정 메일) · calendar(일정+CalDAV) · drive(개인 클라우드) · spotify · weather(KMA+ESP32) · resume · badge(동적 이미지) · logs(중앙 로깅) · ai(멀티 프로바이더 AI — codex/anthropic/ollama) + Hono JSX SSR 어드민. MySQL(Drizzle) · better-auth · Vercel 단일 함수 배포 + `deploy/` 하위 Docker 서비스 2개.

## 명령어

| 작업 | 명령 |
|------|------|
| 개발 서버 | `bun run dev` |
| 타입체크 | `bunx tsc --noEmit` |
| 테스트 | `bun test` (부분: `bun test <경로>`) |
| DB 반영 | `bun run db:push` (**마이그레이션 파일 없음**, `drizzle/` gitignored) |
| 빌드(Vercel) | `bun run vercel-build` |

## 절대 규칙 (요약 — 정본: [docs/memory/stack-and-invariants.md](./docs/memory/stack-and-invariants.md))

- 런타임은 **Bun 만** (npm/node 우회 금지). 코드: arrow function only · 반환타입 미명시 · any/unknown 금지 · **코드 주석 금지**(JSDoc 영어만 예외) · named export.
- 계층 경계: Drizzle 쿼리는 `compose/` 에서만(ServiceDb 구현). `service/` 는 HTTP·DB 구현을 모른다. Route 가 HTTP 경계.
- 에러는 `lib/error-code.ts`·`error-message.ts`·`error.ts` 3파일 + `createAppError` 로만. 응답은 `lib/api-response.ts` 헬퍼로만.
- 어드민(`page/`)은 **SSR JSX 전용, CSR 금지**, 폼 POST → 303.
- 시크릿은 `.env` + `getEnv()`(`lib/env.ts`) 로만. 커밋은 Conventional Commits, **사용자 요청 전 commit/push 금지, Co-Authored-By 트레일러 금지**.

## 작업 방식

1. [docs/PROCESS.md](./docs/PROCESS.md) 에 체크리스트를 만들고 진행 상태를 갱신한다.
2. 작업 유형별 지침을 따른다: [docs/guidelines/](./docs/guidelines/) (도메인 추가 · 엔드포인트 추가 · DB 변경 · 어드민 페이지 · 외부 API 연동 · 에러/로깅 · 폴더별 지침).
3. 머지 전 [docs/quality-assurance/pre-merge-checklist.md](./docs/quality-assurance/pre-merge-checklist.md) 를 통과시킨다.
4. 코드를 바꾸면 [docs/guidelines/docs-maintenance.md](./docs/guidelines/docs-maintenance.md) 의 트리거 표에 따라 문서를 갱신한다.

## 문서 지도

- 진입점·읽기 순서: [docs/index.md](./docs/index.md)
- 아키텍처: [docs/architecture.md](./docs/architecture.md) · 배포: [docs/deploy.md](./docs/deploy.md) · 테스트: [docs/testing.md](./docs/testing.md)
- 도메인별: [docs/domains/](./docs/domains/) · 전수 레퍼런스(스키마·엔드포인트·env·lib·shared): [docs/reference/](./docs/reference/)
- 어드민 기능: [docs/admin-features.md](./docs/admin-features.md) · 로깅: [docs/logging.md](./docs/logging.md) · 펌웨어 계약: [docs/firmware-logging-contract.md](./docs/firmware-logging-contract.md)
- 기록: memory(불변 사실) · history(완료 이력) · bug · acknowledge(합의) · feedback(교정) · utils — 전부 docs/ 하위.
