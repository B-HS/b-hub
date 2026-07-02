# 합의 — 의존성 최신화 (2026-07-02, 브랜치 `chore/deps-update`)

> **완료됨** — 보류 3종 포함 전부 반영. 결과·커밋·대응 상세는 [../history/2026-07-deps-upgrade.md](../history/2026-07-deps-upgrade.md). 원계획과의 차이: `zod-openapi`·`@hono/zod-validator` 는 직접 사용 0(구 hono-openapi 의 내부 의존)으로 실측되어 업그레이드 대신 **제거**(hono-openapi 1 은 `@hono/standard-validator` 경로).

## 완료분 (안전 최신화 + 보안)

tsc 0 · `bun test` 2268 pass 로 검증하며 아래를 올렸다.

| 구분 | 패키지 |
|------|--------|
| 보안(dependabot high) | `nodemailer` 8→**9**(raw 옵션 파일접근/SSRF 우회 취약점, 패치 9.0.1. imap-provider 는 raw 미사용이나 예방 반영) |
| 저위험 major | `@sentry/bun` 10 · `@google/genai` 2 · `icojs` 1 · `@hono/swagger-ui` 0.6 · `sharp` 0.35 · `satori` 0.26 · `typescript` 6 · `@types/nodemailer` 8 |
| minor/patch | `@aws-sdk/*` 3.1078 · `cheerio` 1.2 · `dayjs` 1.11.21 · `hono-openapi` 0.4.8 · `imapflow` 1.4.3 · `ioredis` 5.11.1 · `mailparser` 3.9.12 · `mysql2` 3.22.5 · `zod` 3.25.76 · `zod-openapi` 4.2.4 · 등 |

- docs 버전 참조 갱신: [../reference/shared-services.md](../reference/shared-services.md)(better-auth·ioredis·sharp·satori·@google/genai).

## 유지(보류)한 3개 — breaking, 새 세션에서 진행

| 패키지 | breaking | 규모(실측) |
|--------|----------|-----------|
| `hono` 4.11.9→**4.12** | `c.req.param(key)` 반환 타입이 `string \| undefined` 로 엄격화 | route **40+ 지점** tsc 에러(AI 외 기존 route 전반) |
| `better-auth` 1.4.18→**1.6** | 내부 `zod v4` 의존으로 `compose/index`·`compose/shared`·`auth-provider` 의 추론 타입 portability(TS2742) 깨짐 | 3 지점 |
| `zod` 3.25→**4** (+ `zod-openapi` 6 · `@hono/zod-validator` 0.8 · `hono-openapi` 1) | zod 4 API 변경 연쇄 | **37 tsc 에러** + 런타임 API 변경(dto·route 전반) |

## 이유

- 사용자 요구: "의존성 최신화 + 깨지는 것 없이 정확히 확인". 안전·보안분은 검증 완료해 반영, breaking 3개는 코드 대량 수정이 필요해 별도 세션으로 분리.
- 유지 3개도 사실상 최신 계열(hono 4.x·zod 3.25·better-auth 1.4)이라 보안 노출은 없음(취약점은 nodemailer 뿐, 해결됨).

## 새 세션 프롬프트

아래를 새 세션에 그대로 붙여 진행한다(현재 `chore/deps-update` 브랜치 이어받음).

```
b-hub 레포에서 보류했던 breaking major 3개를 업그레이드한다. 브랜치는 chore/deps-update(안전 최신화 + nodemailer 9 보안 반영 완료). 각 단계마다 bunx tsc --noEmit + bun test 로 검증하고, 통과할 때마다 별도 커밋(chore:, author 사용자 단독, Co-Authored-By 금지). 공식 마이그레이션 가이드는 context7 로 먼저 확인한다.

배경(docs/acknowledge/2026-07-02-deps-upgrade.md 참조):
- hono 4.12: c.req.param(key) 타입이 string|undefined 로 엄격화 → route 40+ 지점 tsc 에러. 해결 시 주의: 기존 `Number(c.req.param('id'))` 는 undefined→NaN→isNaN 가드로 안전했다. `?? ''` 로 바꾸면 Number('')=0 이 되어 0 을 유효 id 로 오인하는 버그가 생기니 금지. non-null(`!`) 또는 명시 undefined 체크로 처리하고, 각 param 이 라우트 경로상 필수인지 확인한다.
- better-auth 1.6: compose/index·compose/shared·service/shared/auth-provider 의 createAuthProvider/composeShared/compose 반환 타입이 better-auth 내부 zod v4 를 참조해 TS2742(portable 아님). 해결: 해당 export 에 명시적 타입 annotation 부여(ReturnType 유도가 안 되면 최소 인터페이스 정의). skipLibCheck 우회는 지양.
- zod 4 생태계(zod 4 + zod-openapi 6 + @hono/zod-validator 0.8 + hono-openapi 1.0): 함께 올려야 한다(개별은 peer 충돌). zod 4 breaking: z.string().email()→z.email() 계열, z.record() 인자 필수화, errorMap/message API, z.coerce 동작 등 — dto/** 전수 점검. hono-openapi 1.0 은 describeRoute/validator/resolver API 가 바뀌었을 수 있어 route/** 전수 점검. dto/error-response.ts(resolver)·dto/common.ts 부터. 37 tsc 에러가 시작점이나 런타임 변경도 있으니 테스트로 확인.

순서(권장): ① better-auth 1.6(3지점, 작음) → ② hono 4.12(40지점, 기계적) → ③ zod 4 생태계(대규모). 각각 독립 커밋.

각 단계 후: docs 갱신(reference/shared-services.md 버전, hono/zod major 언급 있으면 memory/stack-and-invariants.md·architecture.md, testing 카운트 무관). 완료 시 docs/history 에 이력 이관하고 docs↔코드 정합을 재검증(카운트·엔드포인트·에러코드). 마지막 전체 bun test + bunx tsc --noEmit + prettier(변경파일) 통과 확인 후 사용자에게 커밋·병합 여부 확인.

주의: .env 는 세션 셸에서 접근 안 될 수 있음(db:push 는 사용자 실행). 스키마 변경 없으니 이번엔 db:push 불필요.
```

## 이유(결정 근거)

- breaking 3개는 서로 독립적이라 별도 커밋으로 분리 가능(better-auth→hono→zod 순). zod 4 가 가장 크고 위험해 마지막.
