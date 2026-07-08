# 합의 — Vercel 배포 계약 + Web Analytics 미도입 (2026-07-09)

## 배포 계약: "자가 번들 단일 함수" 고정

2026-07-09 production 장애([bug/2026-07-09-vercel-hono-detection-crash.md](../bug/2026-07-09-vercel-hono-detection-crash.md)) 수습 과정에서 확정한 계약. 근거와 금지 사항은 [memory/stack-and-invariants.md](../memory/stack-and-invariants.md) 불변 규칙에 등재.

- `vercel.json` `"framework": null` + 커밋 셔임 `api/index.js`(`export { default } from './hub.js'`) + 번들 출력 `api/hub.js`(gitignored) — 세 가지가 한 세트, 제거·변경 금지.
- Vercel 의 hono 프레임워크 프리셋(비번들 함수 + NFT 트레이싱)으로는 전환하지 않는다. 전환 검토 시 exports `node` 조건 트레이싱 문제 해소를 fresh-clone 로컬 빌드로 먼저 검증한다.

## @vercel/analytics — 도입하지 않음 (사용자 결정)

- 검토 결과: 적용 자체는 가능(plain HTML script 방식 페이지뷰 + Pro 플랜 서버 `track()`). 그러나 b-hub 는 API 서버라 브라우저 페이지뷰 대상이 홈·policy·admin 뿐이고, **API 트래픽은 Web Analytics 로 잡히지 않으며**, 서버 요청·에러 분석은 이미 `log_events` 중앙 로깅이 담당한다.
- **결정: b-hub 에는 붙이지 않는다.** 방문자 분석이 필요해지면 blog.gumyo.net(별도 프로젝트) 쪽에서 검토한다.
- 참고 제약(재검토 시): admin 은 "SSR 전용·클라이언트 JS 금지" 불변 규칙이라 스크립트 삽입 시 정책 충돌. Deployment Protection 배포에서 서버 `track()` 은 401 → Protection Bypass 시크릿 필요.
