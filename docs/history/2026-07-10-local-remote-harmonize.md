# 조화 이력 — 로컬 17커밋 ↔ 원격 21커밋 (2026-07-10)

## 배경
세션 시작 시 fetch 누락으로 stale base(f20afcf)에서 17커밋 작업. 그 사이 원격 dev 에 다른 곳에서 21커밋(의존성 최신화·AI Provider 시스템·Vercel 배포 개편)이 쌓임. 정밀 갭 분석(fable max 4축) 후 조화.

## 방침
origin/dev(21커밋)를 base 로 채택. 로컬 17커밋을 3분류. 백업 backup/local-dev-2026-07-10 보존.

## 폐기 (원격이 상위호환)
- 의존성 최신화(zod4·hono-openapi1·better-auth1.6·nodemailer9) — 원격이 이미 수행.
- 단순 AI 인프라(status/keys/chat, ai_provider_key 1테이블) — 원격 AI Provider 시스템(6테이블·codex/anthropic/ollama·세션·프롬프트·모델·첨부)이 압도적.

## 재적용 (원격 위 cherry-pick, 전부 클린)
- 1207d2f badge SSRF 재검증 + drive PII 로그 제거
- 2bef641 로그 경로 토큰 마스킹 + weather mock 게이트 + drive 입력검증 400
- eb4a050 drive 콜백 UPLOAD_SERVER_SECRET 게이트 (+ deploy/upload-server)
- 00da94d calendar 반복(rrule) 전개 + 범위 overlap (원격 compose/calendar 는 여전히 dtstart-in-range 버그였음)
- 5a37bec admin UI 개선 (다크모드·CSRF·페이지네이션·flash·confirm)
- ff62d1a·ccdcbe1 /manage 페이지 (골격 + mail/calendar/drive/resume/spotify 도메인)

## 재작업
- a4c3d95 /manage AI 섹션을 원격 aiConnectionService(/api/ai/providers, codex/anthropic/ollama)로 재작성
- 51c76a2 원격 AI 에 SSE 스트리밍(completions/stream·sessions/:id/messages/stream) 추가 — 사용자 요청. 집계·세션 저장·rate limit 유지, delta relay. 백업의 ai-sse 자산 재료.

## 검증
typecheck 0 · test 2450 pass (원격 2410 + SSE 40 신규).

## 후속
- 클라이언트 AI(mail·calendar·rirekisyo)를 원격 계약(providers + completions/stream SSE)으로 재작업.
- weather 배포 B안(framework null + JS 셔임 + 자가번들) 적용.
- salvage 미채택: withAuthOrApiToken HOF·OpenAI-compat(omlx) 어댑터는 원격 AI 가 세션 전용이라 지금 소비처 없음 — 백업 브랜치에 보존.
