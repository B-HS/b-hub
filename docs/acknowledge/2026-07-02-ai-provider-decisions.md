# 합의 — AI Provider 시스템 설계 결정 (2026-07-02)

## 결정

| 항목 | 결정 | 비고 |
|------|------|------|
| Codex(OpenAI) OAuth 연결 | **auth.json 붙여넣기** — 사용자가 로컬 `codex login` 후 `~/.codex/auth.json` 토큰(access/refresh)을 등록 API 로 제출, 서버는 암호화 저장 + refresh token 으로 자동 갱신 | OpenAI OAuth client 는 redirect_uri 가 `localhost:1455` 고정이라 배포 서버가 웹 콜백을 못 받음. 갱신 실패 시 `reauth_required` 상태로 마킹하고 재등록 안내 |
| 지원 provider | codex(oauth) · anthropic(api key) · ollama cloud(api key) 3종 | 사용자당 provider 별 1연결 |
| 표면 범위 | REST API 전체(provider 연결·모델 fetch/refresh·프롬프트 CRUD·채팅 세션/메시지·첨부) + **어드민 SSR 페이지** | 기본 채팅 서비스용 API 빠짐없이 구현. 메일 답변 생성기 등 도메인 융합 예시는 이번 범위 밖(후속) — 융합은 compose 주입으로 언제든 가능하게 추상화만 보장 |
| 프롬프트 템플릿 소유권 | **사용자별만** CRUD (전역/시스템 템플릿 없음) | 단계별(system 등) 주입 슬롯 지원 |
| 자격증명 암호화 | **새 `AI_ENCRYPTION_KEY`** — mail 의 AES-256-GCM(v2 scrypt) 로직을 `lib/credential-crypto.ts` 공용 crypto 로 승격해 재사용, 키는 mail 과 분리 | 키 회전·유출 영향 범위 분리. **정정: mail 은 미설정 시 부팅 실패(fail-fast)지만, AI 는 신규 선택 기능이므로 `compose/ai.ts` 가 키 미설정 시 graceful 하게 `{}` 반환 → route stub 이 `SERVICE_NOT_CONFIGURED`(503). AI 키 없어도 앱 전체는 정상 부팅** |
| 사용기록 | 기존 중앙 로깅(`log_events`)에 적재 — 호출 성공은 severity 20(INFO)·실패는 40(ERROR, Discord 알림 대상), `service='b-hub-ai'`, details 에 provider/model/토큰 수/소요시간 (비밀·프롬프트 원문 미포함) | 별도 usage 테이블 없음 |
| 이미지 | `storageService`(R2) 로 영구화, 메시지 첨부로 연결 | 입력 이미지(vision) 대상 |
| 스트리밍 | v1 은 비스트리밍(완성 응답 JSON). SSE 스트리밍은 후속 | provider 계층은 스트림 추가 가능하게 추상화 |

## 이유

- 사용자 요구: "어느 기능에도 붙을 수 있는" 독립 AI Provider + 사용자 계정별 자격증명 + OAuth 자동 갱신/재인증 안내 + 모델 자동 fetch·기록 + 보안 최우선 + log_events 사용기록 + 세션·이미지 영구화 + 단계별 프롬프트 CRUD.
- 브랜치: `feat/ai-provider` (2026-07-02 생성).
