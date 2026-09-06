# Manage Features — 사용자 셀프서비스 페이지 (`/manage`)

> 기준: 2026-09-07 (fix/audit-batch3-serverless @ 워킹트리 미커밋 변경) 코드 검증. 다루는 코드: `page/manage/**`, `page/admin/guard.ts`(세션 캐시·일회성 노출 쿠키 공유), `page/index.ts`(마운트), `index.ts`(루트 배선), `dto/mail/sync.ts`. 이력: [history/2026-07-10-local-remote-harmonize.md](./history/2026-07-10-local-remote-harmonize.md) · [history/2026-09-07-audit-batch3.md](./history/2026-09-07-audit-batch3.md)

`/manage` 는 **로그인한 일반 사용자**(어드민 권한 불필요)가 자기 자신의 리소스(AI 연결·API 토큰·Weather 키·메일·캘린더·드라이브·이력서·Spotify)를 직접 관리하는 SSR(Hono JSX) 페이지다. 어드민(`/admin`, [admin-features.md](./admin-features.md))과 UI·디자인 토큰을 공유하지만 **인가 모델과 데이터 접근 경로가 다르다.**

## /admin 과의 차이

| 항목 | `/admin` | `/manage` |
|------|----------|-----------|
| 인가 | `requireAdminPage`(role=admin 필수) | `requireSessionPage`(로그인 세션이면 누구나) |
| 데이터 접근 | `page/admin/db.ts`(`AdminDb`) — Drizzle 직접, **전 사용자 데이터**, service 계층 우회 | 실제 도메인 **service** 주입(aiConnection·apiToken·weatherApiKey·mail·calendar·drive·resume·spotify) — 항상 **세션 `user.id` 스코프** |
| 범위 | 전 도메인 운영·조회·강제조치 | 본인 리소스 CRUD 만 |

- 공유 자산: 디자인 토큰 CSS(`ADMIN_DESIGN_TOKENS_CSS`, `/manage/styles.css` 로 서빙), CSRF 가드(`page/admin/csrf.ts` `createAdminCsrfGuard`), 테마 쿠키 로직(`page/admin/theme.ts`), **요청당 세션 캐시(`resolveAdminSession`)와 일회성 노출 쿠키(`setRevealValue`/`takeRevealValue`)**(`page/admin/guard.ts`). 테마 쿠키만 `MANAGE_THEME_COOKIE`(path `/manage`)로 분리.

## 인증 · 가드 (`guard.ts`, `login.tsx`, `index.ts`)

- `requireSessionPage(getSession)` — 세션 없으면 `/manage/login?next=<원경로>`(303). 통과 시 `c.set('manageUser', session.user)`. 타입은 어드민과 동일(`ManageSessionUser = AdminSessionUser`). 각 리소스 라우트가 `app.use('*', ...)` 로 게이팅하므로 미매칭 경로도 404 가 아니라 로그인 유도로 처리된다.
- **세션 조회는 요청당 1회**다. 가드와 로그인 라우트가 `page/admin/guard.ts` 의 `resolveAdminSession(c, getSession)` 을 쓰고, 결과(`null` 포함)를 요청 컨텍스트에 캐시한다. CSRF 가드가 앞서 실행되며 캐시를 먼저 채운다.
- `GET /manage/login` — 로그인돼 있으면 `next` 로 303, 아니면 소셜 로그인 카드(Google/GitHub). `GET /manage/login/social/:provider`(better-auth `signInSocial`, callbackURL=`next`). `next` 는 `sanitizeNext` 로 `/manage` 접두사만 허용. `/manage` 로그아웃 라우트는 이번 범위에서 변경하지 않았다(어드민만 GET·POST 병행).
- CSRF: `app.use('*', createAdminCsrfGuard({ getSession, secret: csrfSecret }))` — 폼 POST 를 CSRF 토큰으로 보호(어드민과 동일 구현). `contextStorage()` 이후에 배선.
- `GET /manage/styles.css`·`GET /manage/theme` 는 가드 밖(정적/테마 전환).

## 라우트 맵 (`nav.ts` `MANAGE_NAV` + `index.ts` 마운트)

모든 리소스 라우트는 `app.use('*', requireSessionPage(...))` 게이트 후 **`GET /`(목록) + `POST`(생성/삭제/토글) → 303 `?flash=ok`** 패턴이며, 모든 쿼리·변경은 `manageUser.id` 로 스코프된다.

### 토큰·키 발급은 PRG + 일회성 쿠키

평문 값을 돌려주는 발급 POST 4곳 — API 토큰(`/manage/tokens`) · Weather 키(`/manage/weather/keys`) · Spotify API 키(`/manage/spotify/keys`) · Spotify 위젯 토큰(`/manage/spotify/widget-tokens`) — 은 더 이상 발급 응답에 HTML 을 직접 렌더하지 않는다. `setRevealValue(c, <발급 경로>, token)` 으로 `hub_reveal` 쿠키(Path=그 경로, maxAge 60초, httpOnly, SameSite=Lax, 프로덕션 Secure)를 세우고 **303 으로 목록으로 리다이렉트**하며, 다음 `GET` 이 `takeRevealValue` 로 값을 읽어 `RevealBanner` 에 1회 표시하고 쿠키를 삭제한다. 새로고침으로 POST 가 재실행돼 토큰이 중복 발급되던 문제가 사라진다(어드민 Metrics Tokens 도 같은 패턴 — [admin-features.md](./admin-features.md) §14).

| 그룹 | 경로 | 주입 서비스 | 비고 |
|------|------|-------------|------|
| Overview | `/manage` | aiConnection·apiToken·weatherApiKey·mailAccount | 내 계정·연동 상태 요약(읽기) |
| Mail | `/manage/mail/accounts`·`/mail/messages`·`/mail/sync` | mailAccount·mailMessage·mailSync·mailUpload·(mailFolderDb) | 계정·메시지 조회·동기화 트리거. historical `batchSize` 는 DTO 상수(`dto/mail/sync.ts` — 10..500, 기본 100)로 **서버에서 클램프**한다 |
| Calendar | `/manage/calendar/events`·`/calendar/groups`·`/calendar/subscription` | calendar | 이벤트·그룹·ICS 구독(baseUrl) |
| Drive | `/manage/drive/folders`·`/drive/assets` | driveFolder·driveAsset | 폴더·자산 |
| Resume | `/manage/resume` | resume | 이력서 |
| Spotify | `/manage/spotify/accounts`·`/spotify/keys`·`/spotify/widget-tokens` | spotifyAccount·spotifyApiKey·spotifyWidgetToken | 계정·API 키·위젯 토큰 |
| AI | `/manage/ai/providers` | aiConnection | 연결 등록(codex 3필드 또는 access token 단독 / anthropic·ollama apiKey)·삭제. **자격증명 미노출**, status 표시(→ [domains/ai.md](./domains/ai.md)) |
| Access | `/manage/tokens` | apiToken | API 토큰 발급(303 PRG + `hub_reveal` 쿠키로 평문 1회)·취소 |
| Weather | `/manage/weather/keys` | weatherApiKey | Weather 키 발급(같은 PRG 패턴)·삭제 |

- `ManageRouteDeps`(`index.ts`)의 도메인 서비스는 대부분 **optional(`?`)** 이다 — 해당 서비스가 미조립(compose 미구성)이면 그 섹션만 빠지고 나머지는 동작한다. `getSession`·`apiTokenService`·`weatherApiKeyService` 는 필수.
- 루트 배선(`index.ts`): `createPage({ manage: { getSession, aiConnectionService, apiTokenService, weatherApiKeyService, mail*·calendar·drive*·resume·spotify* 서비스, baseUrl, auth, csrfSecret: BETTER_AUTH_SECRET } })`, `securityHtmlPaths: ['/admin', '/manage']`.

## 파일 맵 (`page/manage/`)

| 파일 | 역할 |
|------|------|
| `index.ts` | `createManageRoute` — styles·theme·login + 각 리소스 라우트 마운트, `ManageRouteDeps` |
| `guard.ts` | `requireSessionPage` 세션 게이트(요청당 1회 조회 — `page/admin/guard.ts` 의 `resolveAdminSession` 재사용), `ManageGetSession`/`ManageSessionUser`/`ManageContext` |
| `login.tsx` | `createManageLoginRoute` — 소셜 로그인/로그아웃, `sanitizeNext` |
| `nav.ts` | `MANAGE_NAV` 9개 그룹 + `isActiveManagePath` |
| `theme.ts` | `MANAGE_THEME_COOKIE`·`sanitizeTheme` |
| `components.tsx` | `ManageShell` 등 공통 JSX(디자인 토큰은 admin 공유) |
| `util.ts` | flash·에러→flash 매핑·상태 배지 등 헬퍼 |
| `pages/overview.tsx` | 계정·연동 요약 |
| `pages/ai.tsx` | AI Providers 등록/삭제(원격 `aiConnectionService` 계약) |
| `pages/tokens.tsx`·`weather.tsx` | API 토큰·Weather 키 CRUD |
| `pages/mail-*.tsx`·`calendar-*.tsx`·`drive-*.tsx`·`resume.tsx`·`spotify-*.tsx` | 도메인별 셀프서비스 페이지 |

## 관련 문서

- 어드민(운영자 뷰): [admin-features.md](./admin-features.md)
- AI 연결 계약: [domains/ai.md](./domains/ai.md) · 인증 총람: [domains/auth.md](./domains/auth.md)
- 세션 조화 이력: [history/2026-07-10-local-remote-harmonize.md](./history/2026-07-10-local-remote-harmonize.md)
