# PROCESS — 현재/누적 작업 상태

> 베이스 룰: `CLAUDE.md` + `~/.claude/convention/*`(arrow only, 반환타입 추론, any/unknown 금지, 코드 주석 금지, named export, Factory DI + ServiceDb, `z.infer`/`ReturnType` 유도, 응답 헬퍼, 에러 3파일).
> 문서 진입점: [index.md](./index.md) · 완료 작업 이력: [history/](./history/)

## 작업: docs/ 전면 고도화 (2026-07-02)

목표: 어떤 코딩 에이전트/LLM 이 와도 이 레포를 일관되게 인지·작업할 수 있도록 docs/ 를 코드 기준 사실로 완성하고, 폴더·파일별 작업 지침서와 체크리스트를 만든다.

- [x] a. 현황 파악 — 기존 docs 7개 통독, 전체 파일 트리·package.json·vercel.json 확인.
- [x] b. 구조 확정 — `domains/`(도메인별) · `reference/`(스키마·엔드포인트·env·lib) · `guidelines/`(작업 지침) · `quality-assurance/`(검증 체크리스트) + ai-process §9 분류 폴더(memory/history/bug/acknowledge/feedback/utils). `mail-imap-thread-id.md` → `bug/` 이관, 완료된 로깅 PROCESS → `history/2026-06-logging-system.md` 이관.
- [x] c. 집필 1차 — 아키텍처·도메인 11종·레퍼런스 5종·deploy·testing 문서를 코드 통독 기반으로 작성, 기존 문서 4종(admin-features/logging/firmware-contract/hono-reference) 사실 검증·갱신.
- [x] d. 집필 2차 — guidelines(도메인 추가·엔드포인트 추가·DB 변경·어드민 페이지·외부 API 연동·에러/로깅·폴더별 지침·문서 유지보수) + quality-assurance(pre-merge·endpoint QA) 체크리스트 작성.
- [x] e. 검증 — 각 문서의 사실 주장(엔드포인트·테이블·컬럼·함수·env)을 코드와 대조하는 적대적 검증 패스, 불일치 수정.
- [x] f. 마감 — `docs/index.md`(진입점·읽기 순서) 작성, 루트 `CLAUDE.md`/`AGENTS.md` 작성, memory/acknowledge/history 초기 콘텐츠, 링크 무결성 검사.

## 완료 작업 (이력)

- [history/2026-06-logging-system.md](./history/2026-06-logging-system.md) — `log_events` 중앙 로깅/에러-이벤트 시스템 (배포 완료, 2051 tests pass).
