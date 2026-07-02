# 합의 — docs/ 구조 전면 개편 (2026-07-02)

## 결정

- docs/ 를 다음 구조로 확정한다. 신규 문서는 이 분류에 따라 배치한다(판단 기준: [guidelines/docs-maintenance.md](../guidelines/docs-maintenance.md)).

| 위치 | 용도 |
|------|------|
| `docs/index.md` | 진입점 — 문서 지도·읽기 순서 |
| `docs/PROCESS.md` | 현재 작업 체크리스트(완료 시 `history/` 이관) |
| `docs/architecture.md` · `deploy.md` · `testing.md` | 횡단 핵심 문서 |
| `docs/domains/*.md` | 도메인별 문서(파일 맵·모델·엔드포인트·흐름·함정) |
| `docs/reference/*.md` | 전수 인벤토리(db-schema · api-endpoints · env · lib-utilities · shared-services) |
| `docs/guidelines/*.md` | 작업 지침서(절차 체크리스트) |
| `docs/quality-assurance/*.md` | 검증 체크리스트(pre-merge · endpoint QA) |
| `docs/memory/` `history/` `bug/` `acknowledge/` `feedback/` `utils/` | ai-process §9 분류 저장소 |

- 기존 문서 처리: `mail-imap-thread-id.md` → `bug/` 이관(버그 리포트 성격), 완료된 로깅 PROCESS → `history/2026-06-logging-system.md` 이관. `DESIGN.md`(블로그 프론트 디자인 시스템)·`logging.md`·`firmware-logging-contract.md`·`admin-features.md`·`hono-reference.md` 는 위치 유지.
- 루트에 `CLAUDE.md` / `AGENTS.md` 진입점을 두어 어떤 코딩 하네스든 `docs/index.md` 로 유도한다.
- 문서 스타일: 한국어 개조식 · 코드로 확인한 사실만 · 문서 상단 `> 기준: <날짜> 코드 검증` 인용 블록 · 표 중심 · 문서 간 중복 금지(상호 링크).

## 이유

- 사용자 요구: "어떤 코딩 하네스/LLM 이 와도 일관적으로 인지·숙지"가 가능하도록 docs/ 를 극한 고도화 + 폴더·파일별 지침서·체크리스트.
- `~/.claude/convention/ai-process.md` §1·§9 가 docs/ 기반 작업·분류 저장을 이미 규정 — 그 구조를 이 레포에 실체화한 것.
