# 2026-07-02 — docs/ 전면 고도화

## 무엇을 했나

- docs/ 를 "어떤 코딩 에이전트/LLM 이 와도 일관되게 인지·작업" 가능한 상태로 재구축. 모든 신규 문서는 코드 통독 기반 집필 후 문서별 적대적 사실 검증(주장→코드 대조)을 거침 — 총 62개 서브에이전트(집필 31 + 검증 31, Opus 4.8 max), 문서당 26~200개 주장 검증.
- 신규: `index.md`(진입점) · `architecture.md` · `deploy.md` · `testing.md` · `domains/` 10종 · `reference/` 5종(api-endpoints·db-schema·env·lib-utilities·shared-services) · `guidelines/` 8종 · `quality-assurance/` 2종.
- 기존 문서 코드 대조 갱신: `admin-features.md`(수치 정정+파일 맵 추가) · `logging.md`+`firmware-logging-contract.md` · `hono-reference.md`.
- 구조 재편: `mail-imap-thread-id.md`→`bug/`, 완료된 로깅 PROCESS→`history/2026-06-logging-system.md`, ai-process §9 폴더(memory/history/bug/acknowledge/feedback/utils) 실체화, 루트 `AGENTS.md`·`CLAUDE.md` 진입점 신설.
- 표준화: 전 문서 `> 기준: 2026-07-02 (dev @ f20afcf) 코드 검증` 헤더 통일, 상호 링크 무결성 검사.

## 검증 과정에서 발견된 코드 관찰 (문서에 기록됨, 코드는 미수정)

- `route/logs/log-event.ts` GET `/` 의 OpenAPI 응답 선언이 `z.array(...)` 이나 실제 응답은 `paginatedResponse` (문서는 런타임 기준으로 기술).
- `lib/xml.ts` 가 쓰는 `fast-xml-parser` 는 package.json 직접 의존성 미선언(전이 의존으로만 존재).
- 정의만 있고 미배선: `middleware/request-logger.ts`, `middleware/require-admin.ts`, `middleware/require-api-token.ts`·`withApiToken`, `initSentry`(호출부 없음 — Sentry 사실상 비활성), `service/shared/ai.ts`·`markdown.ts`·`notification.ts`(소비처 없음).
- `mail_accounts.sync_cursor` 는 읽기만 있고 채우는 경로 없음(사실상 dormant).

## 관련 문서

- 구조 합의: [../acknowledge/2026-07-02-docs-structure.md](../acknowledge/2026-07-02-docs-structure.md)
- 유지보수 계약: [../guidelines/docs-maintenance.md](../guidelines/docs-maintenance.md)
