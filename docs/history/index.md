# history/ — 완료 작업 이력

> 작업 1건 = 1파일(`YYYY-MM-<kebab-요약>.md`). PROCESS.md 의 작업이 완료되면 그 체크리스트·결정 요약을 이곳으로 이관한다.

## 목록

| 파일 | 기간 | 요약 |
|------|------|------|
| [2026-09-07-audit-batch4.md](./2026-09-07-audit-batch4.md) | 2026-09-07 | 전수 감사 4차 수정 배치 — P-01·P-02·P-05~P-09·P-12~P-23 의 응답 불변 범위(쿼리 병렬화·인덱스·배치 upsert·토큰 선제 갱신·캐시). 워크플로 10그룹 + 회귀 리뷰 7(원복 없음, 조정자 보강 3건). tsc 0 · 3427 pass. 브랜치 `fix/audit-batch4-performance`. **`db:push` 대상 3번째**(인덱스 8종 추가·중복 3종 제거), 헤더 추가 3곳(badge `CDN-Cache-Control` · weather `/locations` ETag · ICS ETag) |
| [2026-09-07-audit-batch3.md](./2026-09-07-audit-batch3.md) | 2026-09-07 | 전수 감사 3차 수정 배치 — R-01~R-04·R-06·R-09~R-16·R-18~R-21·R-23~R-31 + S-16·S-17 + E-09. 서버리스 적합성(응답 전 await · rate limit 공유 스토어 · DB 풀 · Sentry 부트스트랩)과 공개 경로 rate limit. tsc 0 · 3198 pass. 브랜치 `fix/audit-batch3-serverless`. **`db:push` 대상 추가**(calendar_subscription user unique), 크론 4번째(`/api/logs/purge`) |
| [2026-09-07-audit-batch2.md](./2026-09-07-audit-batch2.md) | 2026-09-07 | 전수 감사 2차 수정 배치 — E-01~E-08·E-10~E-12·E-14~E-21·E-23~E-25·E-28 + 승인 A-1~A-5 + C-01·C-04·C-10·C-11. 워크플로 27 에이전트 · 비겹침 10그룹. tsc 0 · 3010 pass. 브랜치 `fix/audit-batch2-immediate-errors`. 상태 코드 변경 3종(mail 409 · drive 409/413 · spotify 502/404) |
| [2026-09-06-audit-batch1.md](./2026-09-06-audit-batch1.md) | 2026-09-06 | 전수 감사 1차 수정 배치 — D-01~D-22 · S-01~S-15 · C-15 + E-22/26/27/29/30 반영(계약 불변 범위). 워크플로 26+13 에이전트 + 회귀 리뷰 7. tsc 0 · 2864 pass. **`db:push` 필요**(mail_messages unique 3열) |
| [2026-07-10-local-remote-harmonize.md](./2026-07-10-local-remote-harmonize.md) | 2026-07-10 | 로컬 17커밋 ↔ 원격 21커밋 조화 — 원격 base 채택, 보안 재적용(badge SSRF·로그 마스킹·drive gdrive-token 게이트·weather mock 게이트)·calendar rrule/overlap·admin UI·`/manage` 페이지 재적용, AI SSE 스트리밍·codex access token 단독 인증 추가. typecheck 0 |
| [2026-07-ai-provider-system.md](./2026-07-ai-provider-system.md) | 2026-07-02 | AI Provider 시스템 — codex/anthropic/ollama 멀티 프로바이더, 프로바이더 추상화·OAuth 자동갱신, 채팅 세션·프롬프트·이미지, 자격증명 암호화, log_events 사용기록. db:push·커밋 완료, 2260 tests |
| [2026-06-logging-system.md](./2026-06-logging-system.md) | 2026-06 | `log_events` 중앙 로깅/에러-이벤트 시스템 — 서버 전 엔드포인트 4xx·5xx 캡처 + 디바이스 수집 + 어드민 + Discord 알림 + 리텐션. dev 배포 완료 |
| [2026-07-docs-overhaul.md](./2026-07-docs-overhaul.md) | 2026-07-02 | docs/ 전면 고도화 — 아키텍처·도메인·레퍼런스·지침서·QA 체크리스트 신설, §9 분류 폴더 실체화 |
| [2026-07-deps-upgrade.md](./2026-07-deps-upgrade.md) | 2026-07-02 | 의존성 최신화 — 안전분+nodemailer 9 보안, breaking major 3종(better-auth 1.6 · hono 4.12 · zod 4+hono-openapi 1, 미사용 zod-openapi·zod-validator 제거). 단계별 tsc 0·2268 pass·독립 커밋 5개(패치 후속 포함) |
