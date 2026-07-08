# PROCESS — 현재/누적 작업 상태

> 베이스 룰: `CLAUDE.md` + `~/.claude/convention/*`(arrow only, 반환타입 추론, any/unknown 금지, 코드 주석 금지, named export, Factory DI + ServiceDb, `z.infer`/`ReturnType` 유도, 응답 헬퍼, 에러 3파일).
> 문서 진입점: [index.md](./index.md) · 완료 작업 이력: [history/](./history/)

## 현재 진행 중 작업

### Vercel production 크래시 원인 규명 (2026-07-09) — 상세: [bug/2026-07-09-vercel-hono-detection-crash.md](./bug/2026-07-09-vercel-hono-detection-crash.md)

- [x] 원인 규명 — Vercel 빌더 54.19.0 의 hono 자동 감지가 비번들 `λ index` 를 추가 생성 + better-auth 1.6 분리 패키지(`@better-auth/telemetry`·`@better-auth/utils`)의 exports `node`/`default` 조건 불일치로 트레이싱 누락 → `/` 콜드스타트 크래시(`Requested module is not instantiated yet` 는 2차 증상).
- [x] 1차 수정 — `vercel.json` `"framework": null`(커밋 `e26ab62`). 단, 클라우드(빌더 54.21.1)에서 **함수 0개·전 경로 404** 재발견: 새 파이프라인은 함수를 클론 시점 소스에서 열거 → gitignored 산출물 `api/index.js` 가 함수로 안 잡힘.
- [x] 2차 수정 — `.ts` 셔임(`c005003`, 배포 `b-r4alz145p`): 동작·스모크 통과했으나 빌더 tsc 의 `.js`→`.ts` 매핑으로 non-fatal `TS2303` 로그 잔존(잠재 폭탄).
- [x] 최종 수정 — **JS 셔임 `api/index.js`(커밋, `export { default } from './hub.js'`) + 번들 출력 `api/hub.js` 분리**(build·vercel-build outfile 변경, `.gitignore` = `api/hub.js`). fresh-clone 시뮬레이션(`rm api/hub.js` 후 `bunx vercel@54.21.1 build`)으로 함수 생성·TS 단계 부재·링킹 완주 검증. tsc 0 · 2278 pass.
- [x] docs 상세화 — bug 문서 전면 확장(실패 모드 3종·배제 가설·재현 절차·재발 방지 7항) + deploy.md·architecture.md 계약 기재 + memory/stack-and-invariants.md 불변 규칙("framework null + JS 셔임 = 한 세트").
- [ ] production 재배포 후 `/`·`/api/health`·`/admin` 스모크 확인 + api.gumyo.net 도메인 재지정(rollback 해제) 확인.

### 의존성 최신화 (2026-07-02, 브랜치 `chore/deps-update`) — 결정: [acknowledge/2026-07-02-deps-upgrade.md](./acknowledge/2026-07-02-deps-upgrade.md) · 이력: [history/2026-07-deps-upgrade.md](./history/2026-07-deps-upgrade.md)

- [x] 안전 최신화 + breaking major 3종(better-auth 1.6 · hono 4.12 · zod 4+hono-openapi 1) — 상세는 history 문서. 커밋 `c70b372`·`c3adc1f`·`b04e93f`·`5887a60`.
- [x] docs 갱신 + history 이관 + docs↔코드 정합 재검증.
- [x] FE 소비자 영향 검수 매뉴얼 작성 — [quality-assurance/fe-deps-impact-check.md](./quality-assurance/fe-deps-impact-check.md). FE 프로젝트별 검수는 사용자가 직접 수행.
- [x] push 완료(커밋 7개, `ed87433` 까지). `zod-openapi`·`@hono/zod-validator` 제거 결정 사용자 승인.
- [x] docs/ 전수 감사·고도화(2026-07-02) — 살아있는 문서 36개 문서당 1 에이전트(Opus max) + 커버리지·교차 일관성 2단계. 정정 109건·갭 보강 72건(전부 코드 실측 기반), 기준 헤더 `ed87433` 통일, 링크 무결성 0건 깨짐, 공유 수치(에러코드 101·STATUS_MAP 98·API 167·CalDAV 24·테스트 2268/182) 문서 간 정합 확인. DESIGN.md 는 외부 소비자 자산 계약대로 무수정. tsc 0 · 2268 pass 재확인.
- [x] 감사 발견 코드 갭 수정(사용자 승인) — `serviceNameFromPath` 에 `/api/ai` 분기 추가(AI 자동 캡처 에러 라벨 `b-hub-api`→`b-hub-ai`) + 테스트 + logging.md·lib-utilities.md 재정리.
- [ ] dev 병합 — FE 검수 후 사용자 지시 대기.

## 완료 작업 (이력)

- [history/2026-07-deps-upgrade.md](./history/2026-07-deps-upgrade.md) — 의존성 최신화(안전분+보안 nodemailer 9, better-auth 1.6·hono 4.12·zod 4+hono-openapi 1, 미사용 zod-openapi·zod-validator 제거). 단계별 tsc 0·2268 pass.
- [history/2026-07-ai-provider-system.md](./history/2026-07-ai-provider-system.md) — AI Provider 시스템(codex/anthropic/ollama 멀티 프로바이더, 채팅·프롬프트·첨부, 자격증명 암호화, 사용기록). db:push 반영·커밋 완료. 후속 자체 감사(7렌즈×적대적 검증) 확정 32건 보완(쿼터·토큰레이스·고아메시지·레이트리밋 등) + docs 정합 9건, 2268 tests pass.
- [history/2026-07-docs-overhaul.md](./history/2026-07-docs-overhaul.md) — docs/ 전면 고도화.
- [history/2026-06-logging-system.md](./history/2026-06-logging-system.md) — `log_events` 중앙 로깅/에러-이벤트 시스템 (배포 완료, 2051 tests pass).
