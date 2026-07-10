# 합의 — AI 모델 목록 캐시는 수동 갱신 전용 (2026-07-10)

## 결정

`GET /api/ai/:provider/models`(`aiModelService.listCached`) 는 **DB 캐시만 반환**한다. TTL 기반 자동 갱신을 넣지 않는다.

- 갱신 경로는 `POST /api/ai/:provider/models/refresh` 하나뿐이다 (프론트 "모델 새로고침" 버튼).
- 배경: 2026-07-10 codex 모델 최신화 작업에서 24h TTL 자동 갱신을 함께 도입했으나, 사용자가 목록 조회에 숨은 upstream 호출이 생기는 것을 원치 않아 제거를 지시함.

## 적용

- `service/domain/ai/ai-model.ts` — `listCached` 는 `resolveClient` 후 `listByProvider` 만 호출.
- 신모델 출시로 캐시가 낡으면: `DEFAULT_CLIENT_VERSION`(codex-provider.ts) 상향 배포 → 사용자가 refresh 실행. [../domains/ai.md](../domains/ai.md) 함정 항목 참조.
