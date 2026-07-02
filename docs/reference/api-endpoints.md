# API 엔드포인트 전수 인벤토리

> 기준: 2026-07-02 (dev @ `f20afcf`) 코드 검증. 다루는 코드: `index.ts`, `route/index.ts`, `route/**`, `page/index.ts`, `page/home.tsx`, `page/policy.tsx`, `page/well-known.ts`, `page/admin/index.ts`, `middleware/index.ts`, `middleware/require-*.ts`, `lib/with-auth.ts`, `lib/with-spotify-auth.ts`, `vercel.json`

## 범위

- b-hub 단일 Hono 앱에 등록된 **모든 HTTP 라우트의 평면 인벤토리**(도메인·경로·인증·핸들러 파일)를 소유한다.
- 요청/응답 스키마·서비스 로직·에러코드 등 도메인 상세는 [../domains/](../domains/) 와 이 디렉터리의 다른 레퍼런스가 소유한다 — 여기서는 중복하지 않고 링크한다.
- 마운트 합성 규칙: `index.ts` 가 `app.route('/api', api)`(API), `app.route('/caldav', caldav)`(CalDAV), `app.route('', createPage(...))`(페이지/well-known/admin)를 마운트한다. `route/index.ts` 의 `createRouter` 가 각 라우트 팩토리를 `/api` 하위 접두사에 마운트한다. 전체 Path = 마운트 접두사 + 라우트 팩토리 내부 경로.
- 전역 미들웨어(`middleware/index.ts` `createMiddleware`)는 CORS(`/api/*`)·보안헤더·로그캡처·에러핸들러만 건다. **인증은 전역이 아니라 라우트별 HOF/미들웨어로** 강제된다.

## 인증 표기 범례

| 표기 | 의미 | 근거 |
|------|------|------|
| `없음` | 공개 (인증 HOF·미들웨어 없음) | 핸들러에 인증 래퍼 없음 |
| `세션` | better-auth 세션 | `withAuth`(`lib/with-auth.ts`) 또는 핸들러 내 `getSession` |
| `어드민` | 세션 + `role==='admin'` | `withAdmin` 또는 핸들러 내 `getSession`+role 검사(blog는 로컬 `requireAdmin` 헬퍼) |
| `weather-key` | `X-Weather-Key` 헤더 | `middleware/require-weather-key.ts`(`requireWeatherKey`/`requireWeatherKeyNoLog`) |
| `device-key` | `X-Device-Key` 헤더 | `middleware/require-device-key.ts`(`requireDeviceKey`) |
| `spotify-key\|세션` | `X-Spotify-Key` 헤더 **또는** 세션+`accountId` 쿼리 | `lib/with-spotify-auth.ts`(`withSpotifyAuth`) |
| `widget-token` | URL 경로 토큰 | `spotifyWidgetTokenService.validate(token)` |
| `구독토큰` | URL 경로 구독/ICS 토큰 | `getSubscriptionByToken`/`getSubscriptionByIcsToken` |
| `업로드토큰` | 본문 HMAC `uploadToken` | 서비스가 서명 검증(실패 시 `UNAUTHORIZED`) |
| `cron-secret` | `Authorization: Bearer`/`x-cron-secret` == `uploadServerSecret` | `route/drive/lifecycle.ts` `verifyCronAuth` |

> `X-API-Token`(`withApiToken`/`requireApiToken`)은 정의·테스트만 있고 **어떤 라우트에도 연결돼 있지 않다**(발급·관리는 세션으로). 상세: [../domains/auth.md](../domains/auth.md).

---

## 메타 / 헬스

| Method | 전체 Path | 인증 | 설명 | 핸들러 파일 |
|--------|-----------|------|------|-------------|
| GET | `/api/health` | 없음 | 헬스 체크(`{status,timestamp}`) | `route/health.ts` |
| GET | `/docs` | 없음 | OpenAPI 스펙 JSON — **비프로덕션만 등록**(`NODE_ENV!=='production'`) | `index.ts` |
| GET | `/swagger` | 없음 | Swagger UI — **비프로덕션만 등록** | `index.ts` |

파일 카운트: `route/health.ts` = 1. `index.ts` 인라인 = 2(조건부).

---

## auth (인증)

| Method | 전체 Path | 인증 | 설명 | 핸들러 파일 |
|--------|-----------|------|------|-------------|
| GET·POST | `/api/auth/*` | 없음 | better-auth OAuth·세션 핸들러 위임(`auth.handler`) | `route/auth/oauth.ts` |
| GET | `/api/auth/token` | 세션 | API 토큰 목록 조회 | `route/auth/token.ts` |
| POST | `/api/auth/token` | 세션 | API 토큰 발급 | `route/auth/token.ts` |
| DELETE | `/api/auth/token` | 세션 | API 토큰 삭제 | `route/auth/token.ts` |

파일 카운트: `route/auth/oauth.ts` = 1(`route.on(['POST','GET'],'/*')`), `route/auth/token.ts` = 3. 상세: [../domains/auth.md](../domains/auth.md).

---

## badge

| Method | 전체 Path | 인증 | 설명 | 핸들러 파일 |
|--------|-----------|------|------|-------------|
| GET | `/api/badge/image` | 없음 | 동적 뱃지 PNG 생성(쿼리 파라미터 기반) | `route/badge.ts` |
| GET | `/api/badge/fonts` | 없음 | 사용 가능한 폰트 목록 | `route/badge.ts` |

파일 카운트: `route/badge.ts` = 2. 상세: [../domains/badge.md](../domains/badge.md).

---

## weather

마운트: `/weather/keys`(key), `/weather/mock`(mock), `/weather`(weather), `/weather/locations`(location).

| Method | 전체 Path | 인증 | 설명 | 핸들러 파일 |
|--------|-----------|------|------|-------------|
| GET | `/api/weather/current` | weather-key | 현재 날씨(초단기실황) | `route/weather/weather.ts` |
| GET | `/api/weather/ultra-short` | weather-key | 초단기예보 | `route/weather/weather.ts` |
| GET | `/api/weather/short-term` | weather-key | 단기예보 | `route/weather/weather.ts` |
| GET | `/api/weather/version` | weather-key | 예보 버전 조회 | `route/weather/weather.ts` |
| GET | `/api/weather/locations` | weather-key | 전체 위치 목록 | `route/weather/location.ts` |
| GET | `/api/weather/locations/convert` | weather-key | 좌표 변환(위경도↔격자) | `route/weather/location.ts` |
| GET | `/api/weather/locations/:keyword` | weather-key | 위치 검색 | `route/weather/location.ts` |
| GET | `/api/weather/keys` | 세션 | Weather API 키 목록 | `route/weather/key.ts` |
| POST | `/api/weather/keys` | 세션 | Weather API 키 발급 | `route/weather/key.ts` |
| DELETE | `/api/weather/keys/:id` | 세션 | Weather API 키 삭제 | `route/weather/key.ts` |
| PATCH | `/api/weather/keys/:id/limit` | 어드민 | 키 일일 한도 수정 | `route/weather/key.ts` |
| GET | `/api/weather/mock/current` | weather-key | 현재 날씨 Mock(요청 로깅 없음) | `route/weather/mock.ts` |
| GET | `/api/weather/mock/ultra-short` | weather-key | 초단기예보 Mock | `route/weather/mock.ts` |
| GET | `/api/weather/mock/short-term` | weather-key | 단기예보 Mock | `route/weather/mock.ts` |
| GET | `/api/weather/mock/version` | weather-key | 예보 버전 Mock | `route/weather/mock.ts` |

파일 카운트: `weather.ts` = 4, `location.ts` = 3, `key.ts` = 4, `mock.ts` = 4. 상세: [../domains/weather.md](../domains/weather.md).

---

## blog

마운트: `/blog/posts`(post **및** thumbnail 이중 마운트), `/blog/comments`, `/blog/categories`, `/blog/tags`, `/blog/messages`, `/blog/images`, `/blog/admin`.

| Method | 전체 Path | 인증 | 설명 | 핸들러 파일 |
|--------|-----------|------|------|-------------|
| GET | `/api/blog/posts` | 없음 | 게시글 목록(페이지네이션) | `route/blog/post.ts` |
| GET | `/api/blog/posts/:id` | 없음 | 게시글 상세 | `route/blog/post.ts` |
| POST | `/api/blog/posts` | 어드민 | 게시글 생성 | `route/blog/post.ts` |
| PUT | `/api/blog/posts/:id` | 어드민 | 게시글 수정 | `route/blog/post.ts` |
| GET | `/api/blog/posts/:id/thumbnail` | 없음 | 게시글 OG 썸네일 PNG 생성 | `route/blog/thumbnail.ts` |
| GET | `/api/blog/comments` | 없음 | 댓글 목록(postId 쿼리) | `route/blog/comment.ts` |
| POST | `/api/blog/comments` | 세션 | 댓글 작성 | `route/blog/comment.ts` |
| PATCH | `/api/blog/comments/:id` | 세션 | 댓글 수정(작성자 본인) | `route/blog/comment.ts` |
| DELETE | `/api/blog/comments/:id` | 세션 | 댓글 삭제(작성자 본인) | `route/blog/comment.ts` |
| GET | `/api/blog/categories` | 없음 | 카테고리 목록 | `route/blog/category.ts` |
| POST | `/api/blog/categories` | 어드민 | 카테고리 생성 | `route/blog/category.ts` |
| GET | `/api/blog/tags` | 없음 | 태그 목록 | `route/blog/tag.ts` |
| POST | `/api/blog/tags` | 어드민 | 태그 생성 | `route/blog/tag.ts` |
| GET | `/api/blog/messages/user/:userId` | 없음 | 사용자별 메시지(소셜 피드) 조회 | `route/blog/message.ts` |
| GET | `/api/blog/messages/user/:userId/profile` | 없음 | 사용자 프로필 조회 | `route/blog/message.ts` |
| POST | `/api/blog/messages` | 어드민 | 메시지 작성 | `route/blog/message.ts` |
| DELETE | `/api/blog/messages/:id` | 어드민 | 메시지 삭제 | `route/blog/message.ts` |
| GET | `/api/blog/images` | 어드민 | 이미지 에셋 목록 | `route/blog/image.ts` |
| POST | `/api/blog/images/prepare` | 어드민 | 업로드 준비(assetId/uploadToken 발급) | `route/blog/image.ts` |
| DELETE | `/api/blog/images/:id` | 어드민 | 이미지 삭제 | `route/blog/image.ts` |
| POST | `/api/blog/images/complete` | 업로드토큰 | 업로드 완료 콜백(upload-server 전용, HMAC 검증) | `route/blog/image.ts` |
| GET | `/api/blog/admin/users` | 어드민 | 전체 사용자 조회 | `route/blog/admin.ts` |
| DELETE | `/api/blog/admin/users/:id` | 어드민 | 사용자 삭제 | `route/blog/admin.ts` |
| GET | `/api/blog/admin/posts` | 어드민 | 전체 게시글 조회 | `route/blog/admin.ts` |
| DELETE | `/api/blog/admin/posts/:id` | 어드민 | 게시글 삭제 | `route/blog/admin.ts` |
| PATCH | `/api/blog/admin/posts/:id` | 어드민 | 게시글 숨김 토글 | `route/blog/admin.ts` |
| GET | `/api/blog/admin/comments` | 어드민 | 전체 댓글 조회 | `route/blog/admin.ts` |
| DELETE | `/api/blog/admin/comments/:id` | 어드민 | 댓글 삭제 | `route/blog/admin.ts` |
| PATCH | `/api/blog/admin/comments/:id` | 어드민 | 댓글 숨김 토글 | `route/blog/admin.ts` |

파일 카운트: `post.ts` = 4, `thumbnail.ts` = 1, `comment.ts` = 4, `category.ts` = 2, `tag.ts` = 2, `message.ts` = 4, `image.ts` = 4, `admin.ts` = 8. 상세: [../domains/blog.md](../domains/blog.md).

---

## mail

마운트: `/mail/accounts`, `/mail/folders`, `/mail/messages`, `/mail/sync`, `/mail/uploads`. 전 경로 `세션`(`withAuth`).

| Method | 전체 Path | 인증 | 설명 | 핸들러 파일 |
|--------|-----------|------|------|-------------|
| GET | `/api/mail/accounts` | 세션 | 메일 계정 목록 | `route/mail/account.ts` |
| GET | `/api/mail/accounts/:accountId` | 세션 | 메일 계정 상세 | `route/mail/account.ts` |
| POST | `/api/mail/accounts` | 세션 | 메일 계정 연결 | `route/mail/account.ts` |
| PATCH | `/api/mail/accounts/:accountId` | 세션 | 메일 계정 수정 | `route/mail/account.ts` |
| DELETE | `/api/mail/accounts/:accountId` | 세션 | 메일 계정 삭제 | `route/mail/account.ts` |
| POST | `/api/mail/accounts/:accountId/test` | 세션 | 연결 테스트 | `route/mail/account.ts` |
| GET | `/api/mail/accounts/connect/google` | 세션 | Gmail OAuth 연결 시작(302 리다이렉트) | `route/mail/account.ts` |
| GET | `/api/mail/accounts/connect/google/callback` | 세션 | Gmail OAuth 콜백(302 리다이렉트) | `route/mail/account.ts` |
| GET | `/api/mail/folders` | 세션 | 폴더 목록(accountId 쿼리) | `route/mail/folder.ts` |
| GET | `/api/mail/messages` | 세션 | 메시지 목록(페이지네이션) | `route/mail/message.ts` |
| GET | `/api/mail/messages/search` | 세션 | 메일 검색 | `route/mail/message.ts` |
| GET | `/api/mail/messages/thread` | 세션 | 스레드 조회 | `route/mail/message.ts` |
| GET | `/api/mail/messages/senders` | 세션 | 발신자 목록 | `route/mail/message.ts` |
| GET | `/api/mail/messages/:messageId` | 세션 | 메시지 상세 | `route/mail/message.ts` |
| POST | `/api/mail/messages/mark-read` | 세션 | 읽음 표시 | `route/mail/message.ts` |
| POST | `/api/mail/messages/mark-all-read` | 세션 | 메일함/계정 전체 읽음 | `route/mail/message.ts` |
| POST | `/api/mail/messages/mark-unread` | 세션 | 안읽음 표시 | `route/mail/message.ts` |
| POST | `/api/mail/messages/star` | 세션 | 별표 | `route/mail/message.ts` |
| POST | `/api/mail/messages/unstar` | 세션 | 별표 해제 | `route/mail/message.ts` |
| POST | `/api/mail/messages/move` | 세션 | 폴더 이동 | `route/mail/message.ts` |
| POST | `/api/mail/messages/delete` | 세션 | 삭제 | `route/mail/message.ts` |
| POST | `/api/mail/messages/send` | 세션 | 메일 발송(rate-limit) | `route/mail/message.ts` |
| POST | `/api/mail/messages/:messageId/reply` | 세션 | 답장 | `route/mail/message.ts` |
| POST | `/api/mail/messages/:messageId/forward` | 세션 | 전달 | `route/mail/message.ts` |
| GET | `/api/mail/messages/:messageId/attachments/:attachmentId` | 세션 | 첨부파일 다운로드 | `route/mail/message.ts` |
| POST | `/api/mail/sync` | 세션 | Incremental 동기화(rate-limit) | `route/mail/sync.ts` |
| POST | `/api/mail/sync/historical` | 세션 | Historical 배치 동기화 | `route/mail/sync.ts` |
| GET | `/api/mail/sync/status` | 세션 | 동기화 상태 조회 | `route/mail/sync.ts` |
| POST | `/api/mail/uploads` | 세션 | 첨부/인라인 이미지 업로드(multipart) | `route/mail/upload.ts` |
| DELETE | `/api/mail/uploads/:uploadId` | 세션 | 업로드 파일 삭제 | `route/mail/upload.ts` |

파일 카운트: `account.ts` = 8, `folder.ts` = 1, `message.ts` = 16, `sync.ts` = 3, `upload.ts` = 2. 상세: [../domains/mail.md](../domains/mail.md).

---

## spotify

마운트: `/spotify/accounts`, `/spotify/keys`, `/spotify`(data), `/spotify/playing`, `/spotify/widget-tokens`.

| Method | 전체 Path | 인증 | 설명 | 핸들러 파일 |
|--------|-----------|------|------|-------------|
| GET | `/api/spotify/accounts` | 세션 | Spotify 계정 목록 | `route/spotify/account.ts` |
| GET | `/api/spotify/accounts/connect` | 세션 | Spotify OAuth 연결 시작(302) | `route/spotify/account.ts` |
| GET | `/api/spotify/accounts/connect/callback` | 세션 | Spotify OAuth 콜백(302) | `route/spotify/account.ts` |
| GET | `/api/spotify/accounts/:accountId` | 세션 | 계정 상세 | `route/spotify/account.ts` |
| PATCH | `/api/spotify/accounts/:accountId` | 세션 | 계정 수정 | `route/spotify/account.ts` |
| DELETE | `/api/spotify/accounts/:accountId` | 세션 | 계정 삭제 | `route/spotify/account.ts` |
| GET | `/api/spotify/keys` | 세션 | Spotify API 키 목록 | `route/spotify/key.ts` |
| POST | `/api/spotify/keys` | 세션 | Spotify API 키 발급 | `route/spotify/key.ts` |
| DELETE | `/api/spotify/keys/:id` | 세션 | Spotify API 키 삭제 | `route/spotify/key.ts` |
| GET | `/api/spotify/now-playing` | spotify-key\|세션 | 현재 재생 트랙 | `route/spotify/data.ts` |
| GET | `/api/spotify/playlists` | spotify-key\|세션 | 플레이리스트 목록 | `route/spotify/data.ts` |
| GET | `/api/spotify/playing/:token` | widget-token | 위젯 SVG(now-playing 렌더) | `route/spotify/playing.ts` |
| GET | `/api/spotify/playing/:token/widget` | widget-token | 위젯 HTML | `route/spotify/playing.ts` |
| GET | `/api/spotify/playing/:token/data` | widget-token | 위젯 데이터 JSON(CORS `*`) | `route/spotify/playing.ts` |
| GET | `/api/spotify/widget-tokens` | 세션 | 위젯 토큰 목록 | `route/spotify/widget-token.ts` |
| POST | `/api/spotify/widget-tokens` | 세션 | 위젯 토큰 발급 | `route/spotify/widget-token.ts` |
| DELETE | `/api/spotify/widget-tokens/:id` | 세션 | 위젯 토큰 삭제 | `route/spotify/widget-token.ts` |
| PATCH | `/api/spotify/widget-tokens/:id/active` | 세션 | 위젯 토큰 활성 토글 | `route/spotify/widget-token.ts` |

> `/api/spotify/playing/*` 은 `securityExcludePaths`(`index.ts`)에 포함돼 보안헤더가 제외된다.

파일 카운트: `account.ts` = 6, `key.ts` = 3, `data.ts` = 2, `playing.ts` = 3, `widget-token.ts` = 4. 상세: [../domains/spotify.md](../domains/spotify.md).

---

## resume

마운트: `/resume`. 전 경로 `세션`(핸들러 내 `getSession`).

| Method | 전체 Path | 인증 | 설명 | 핸들러 파일 |
|--------|-----------|------|------|-------------|
| GET | `/api/resume` | 세션 | 내 이력서 목록(페이지네이션) | `route/resume/resume.ts` |
| GET | `/api/resume/:id` | 세션 | 이력서 상세 | `route/resume/resume.ts` |
| POST | `/api/resume` | 세션 | 이력서 생성 | `route/resume/resume.ts` |
| PATCH | `/api/resume/:id` | 세션 | 이력서 수정 | `route/resume/resume.ts` |
| DELETE | `/api/resume/:id` | 세션 | 이력서 삭제 | `route/resume/resume.ts` |

파일 카운트: `resume.ts` = 5. 상세: [../domains/resume.md](../domains/resume.md).

---

## calendar

마운트: `/calendar/events`, `/calendar/groups`, `/calendar/subscription`, `/calendar`(ics). events/groups/subscription 은 `세션`(핸들러 내 `getSession`), ics 는 URL 토큰.

| Method | 전체 Path | 인증 | 설명 | 핸들러 파일 |
|--------|-----------|------|------|-------------|
| GET | `/api/calendar/events` | 세션 | 월별 이벤트 조회 | `route/calendar/event.ts` |
| GET | `/api/calendar/events/range` | 세션 | 기간 범위 이벤트 조회 | `route/calendar/event.ts` |
| GET | `/api/calendar/events/detail/:uid` | 세션 | 이벤트 상세 | `route/calendar/event.ts` |
| POST | `/api/calendar/events` | 세션 | 이벤트 생성(201) | `route/calendar/event.ts` |
| POST | `/api/calendar/events/create` | 세션 | 이벤트 생성(매퍼 바디, 201) | `route/calendar/event.ts` |
| PUT | `/api/calendar/events/:uid` | 세션 | 이벤트 전체 수정 | `route/calendar/event.ts` |
| PATCH | `/api/calendar/events/:uid` | 세션 | 이벤트 부분 수정 | `route/calendar/event.ts` |
| DELETE | `/api/calendar/events/:uid` | 세션 | 이벤트 삭제(204) | `route/calendar/event.ts` |
| GET | `/api/calendar/groups` | 세션 | 캘린더 그룹 목록 | `route/calendar/group.ts` |
| POST | `/api/calendar/groups` | 세션 | 그룹 생성(201) | `route/calendar/group.ts` |
| PATCH | `/api/calendar/groups/:id` | 세션 | 그룹 수정 | `route/calendar/group.ts` |
| DELETE | `/api/calendar/groups/:id` | 세션 | 그룹 삭제(204) | `route/calendar/group.ts` |
| GET | `/api/calendar/subscription` | 세션 | 구독 정보(caldav/ics URL) 조회 | `route/calendar/subscription.ts` |
| POST | `/api/calendar/subscription` | 세션 | 구독 생성 | `route/calendar/subscription.ts` |
| POST | `/api/calendar/subscription/regenerate` | 세션 | CalDAV 토큰 재발급 | `route/calendar/subscription.ts` |
| POST | `/api/calendar/subscription/regenerate-ics` | 세션 | ICS 토큰 재발급 | `route/calendar/subscription.ts` |
| GET | `/api/calendar/:icsToken` | 구독토큰 | ICS 피드 다운로드(`.ics`) | `route/calendar/ics.ts` |

파일 카운트: `event.ts` = 8, `group.ts` = 4, `subscription.ts` = 4, `ics.ts` = 1. 상세: [../domains/calendar.md](../domains/calendar.md).

### CalDAV (`/caldav`, 최상위 마운트)

`app.route('/caldav', caldav)` 로 `/api` 밖에 마운트된다. 데이터 접근 경로(PROPFIND/REPORT/GET/PUT/DELETE)는 `구독토큰`(URL `:token` → `resolveToken`→`getSubscriptionByToken`)으로 인증하지만, OPTIONS·PROPPATCH·MKCALENDAR 핸들러는 토큰을 검증하지 않고 정적/no-op 응답(capability·207 no-op·201)만 반환한다. `securityExcludePaths` 에 `/caldav/` 포함. `route.use('*', ...)` 는 전용 에러 핸들러(엔드포인트 아님). 총 **24개** 라우트 등록(`route.on`/`route.get`/`route.put`/`route.delete`).

| Method | 전체 Path | 인증 | 설명 | 핸들러 파일 |
|--------|-----------|------|------|-------------|
| OPTIONS | `/caldav/:token`, `/caldav/:token/*` | 없음(토큰 미검증) | DAV capability(`DAV`/`Allow` 헤더, 정적) | `route/calendar/caldav.ts` |
| PROPFIND | `/caldav/:token`, `/caldav/:token/` | 구독토큰 | principal PROPFIND(207) | `route/calendar/caldav.ts` |
| PROPFIND | `/caldav/:token/default`, `/caldav/:token/default/` | 구독토큰 | calendar collection PROPFIND(207) | `route/calendar/caldav.ts` |
| REPORT | `/caldav/:token`, `/caldav/:token/`, `/caldav/:token/default`, `/caldav/:token/default/` | 구독토큰 | multiget/query/sync-collection/free-busy | `route/calendar/caldav.ts` |
| PROPPATCH | `/caldav/:token`, `/caldav/:token/`, `/caldav/:token/*` | 없음(토큰 미검증) | PROPPATCH no-op(207) | `route/calendar/caldav.ts` |
| MKCALENDAR | `/caldav/:token/*` | 없음(토큰 미검증) | MKCALENDAR(201) | `route/calendar/caldav.ts` |
| GET | `/caldav/:token`, `/caldav/:token/`, `/caldav/:token/default`, `/caldav/:token/default/` | 구독토큰 | 전체 캘린더 ICS 반환 | `route/calendar/caldav.ts` |
| GET | `/caldav/:token/default/:uid` | 구독토큰 | 이벤트 단건 ICS(ETag) | `route/calendar/caldav.ts` |
| PUT | `/caldav/:token/default/:uid` | 구독토큰 | 이벤트 upsert(201/204, ICS 파싱) | `route/calendar/caldav.ts` |
| DELETE | `/caldav/:token/default/:uid` | 구독토큰 | 이벤트 삭제(204) | `route/calendar/caldav.ts` |
| GET | `/caldav/:token/:uid` | 구독토큰 | 이벤트 단건 ICS(default 없는 경로) | `route/calendar/caldav.ts` |
| PUT | `/caldav/:token/:uid` | 구독토큰 | 이벤트 upsert(default 없는 경로) | `route/calendar/caldav.ts` |
| DELETE | `/caldav/:token/:uid` | 구독토큰 | 이벤트 삭제(default 없는 경로) | `route/calendar/caldav.ts` |

> 위 표는 핸들러 단위로 경로 변형을 묶었다. 등록 수 = OPTIONS 2 + PROPFIND 4 + REPORT 4 + PROPPATCH 3 + MKCALENDAR 1 + GET 4 + (default/:uid) GET·PUT·DELETE 3 + (:token/:uid) GET·PUT·DELETE 3 = **24**.

---

## drive

마운트: `/drive`(asset), `/drive/folders`(folder), `/drive/lifecycle`(lifecycle).

| Method | 전체 Path | 인증 | 설명 | 핸들러 파일 |
|--------|-----------|------|------|-------------|
| POST | `/api/drive/assets` | 세션 | 파일 업로드(multipart, 직접) | `route/drive/asset.ts` |
| POST | `/api/drive/assets/prepare` | 세션 | 업로드 사전 등록(preparing) | `route/drive/asset.ts` |
| POST | `/api/drive/assets/:assetId/status` | 업로드토큰 | 업로드 상태 갱신(upload-server) | `route/drive/asset.ts` |
| POST | `/api/drive/assets/:assetId/complete` | 업로드토큰 | 업로드 완료 콜백(Lightsail→hyun-hub) | `route/drive/asset.ts` |
| POST | `/api/drive/assets/:assetId/gdrive-token` | 업로드토큰 | Google Drive access token 발급(upload-server) | `route/drive/asset.ts` |
| GET | `/api/drive/assets` | 세션 | 파일 목록(페이지네이션) | `route/drive/asset.ts` |
| GET | `/api/drive/assets/:assetId` | 세션 | 파일 상세 + 다운로드 URL | `route/drive/asset.ts` |
| PATCH | `/api/drive/assets/:assetId` | 세션 | 파일 수정(공개설정/폴더이동) | `route/drive/asset.ts` |
| DELETE | `/api/drive/assets/:assetId` | 세션 | 파일 삭제 | `route/drive/asset.ts` |
| GET | `/api/drive/assets/:assetId/download` | 세션 | 파일 스트림 다운로드(L2/L3 cascade) | `route/drive/asset.ts` |
| GET | `/api/drive/quota` | 세션 | 저장 공간 사용량 | `route/drive/asset.ts` |
| POST | `/api/drive/folders` | 세션 | 폴더 생성(201) | `route/drive/folder.ts` |
| GET | `/api/drive/folders` | 세션 | 폴더 목록 | `route/drive/folder.ts` |
| GET | `/api/drive/folders/:folderId` | 세션 | 폴더 상세 + breadcrumb | `route/drive/folder.ts` |
| PATCH | `/api/drive/folders/:folderId` | 세션 | 폴더 수정(이름/이동) | `route/drive/folder.ts` |
| DELETE | `/api/drive/folders/:folderId` | 세션 | 폴더 삭제 | `route/drive/folder.ts` |
| POST | `/api/drive/lifecycle/evict-r2` | cron-secret | R2 stale 축출 — **Vercel cron**(`0 3 * * *`) | `route/drive/lifecycle.ts` |
| POST | `/api/drive/lifecycle/evict-local` | cron-secret | 로컬 FIFO 축출(cron 미등록) | `route/drive/lifecycle.ts` |
| POST | `/api/drive/lifecycle/auto-promote` | cron-secret | 계층 자동 승격 — **Vercel cron**(`0 5 * * *`) | `route/drive/lifecycle.ts` |

파일 카운트: `asset.ts` = 11, `folder.ts` = 5, `lifecycle.ts` = 3. 상세: [../domains/drive.md](../domains/drive.md).

---

## logs

마운트: `/logs/device-keys`(device-key), `/logs`(log-event).

| Method | 전체 Path | 인증 | 설명 | 핸들러 파일 |
|--------|-----------|------|------|-------------|
| POST | `/api/logs` | device-key | 로그 이벤트 수집(디바이스) | `route/logs/log-event.ts` |
| POST | `/api/logs/batch` | device-key | 로그 배치 수집(최대 50건) | `route/logs/log-event.ts` |
| GET | `/api/logs` | 어드민 | 로그 이벤트 목록 조회 | `route/logs/log-event.ts` |
| POST | `/api/logs/purge` | 어드민 | 보관기간 경과 로그 정리 | `route/logs/log-event.ts` |
| PATCH | `/api/logs/:id/resolve` | 어드민 | 로그 이벤트 해소 처리 | `route/logs/log-event.ts` |
| GET | `/api/logs/device-keys` | 어드민 | 디바이스 키 목록 | `route/logs/device-key.ts` |
| POST | `/api/logs/device-keys` | 어드민 | 디바이스 키 발급 | `route/logs/device-key.ts` |
| DELETE | `/api/logs/device-keys/:id` | 어드민 | 디바이스 키 폐기 | `route/logs/device-key.ts` |

파일 카운트: `log-event.ts` = 5, `device-key.ts` = 3. 상세: [../domains/logs.md](../domains/logs.md) · [../logging.md](../logging.md).

---

## ai

마운트: `/ai/providers`(connection), `/ai/prompts`(prompt), `/ai/attachments`(attachment), `/ai/sessions`(session), `/ai`(chat), `/ai`(model). 전 경로 `세션`. chat 2개는 rate limit.

| Method | 전체 Path | 인증 | 설명 | 핸들러 파일 |
|--------|-----------|------|------|-------------|
| GET | `/api/ai/providers` | 세션 | AI 프로바이더 연결 목록(자격증명 제외) | `route/ai/connection.ts` |
| POST | `/api/ai/providers` | 세션 | 연결(등록·재인증) — 저장 전 verify | `route/ai/connection.ts` |
| PATCH | `/api/ai/providers/:providerId` | 세션 | 연결 수정(displayName/status) | `route/ai/connection.ts` |
| DELETE | `/api/ai/providers/:providerId` | 세션 | 연결 삭제 | `route/ai/connection.ts` |
| GET | `/api/ai/:provider/models` | 세션 | 캐시된 모델 목록 | `route/ai/model.ts` |
| POST | `/api/ai/:provider/models/refresh` | 세션 | 모델 fetch 후 캐시 교체 | `route/ai/model.ts` |
| GET | `/api/ai/prompts` | 세션 | 프롬프트 템플릿 목록 | `route/ai/prompt.ts` |
| POST | `/api/ai/prompts` | 세션 | 프롬프트 생성 | `route/ai/prompt.ts` |
| PATCH | `/api/ai/prompts/:promptId` | 세션 | 프롬프트 수정 | `route/ai/prompt.ts` |
| DELETE | `/api/ai/prompts/:promptId` | 세션 | 프롬프트 삭제 | `route/ai/prompt.ts` |
| GET | `/api/ai/sessions` | 세션 | 채팅 세션 목록 | `route/ai/session.ts` |
| POST | `/api/ai/sessions` | 세션 | 세션 생성(연결 검증) | `route/ai/session.ts` |
| PATCH | `/api/ai/sessions/:sessionId` | 세션 | 세션 수정 | `route/ai/session.ts` |
| DELETE | `/api/ai/sessions/:sessionId` | 세션 | 세션 삭제 | `route/ai/session.ts` |
| GET | `/api/ai/sessions/:sessionId/messages` | 세션 | 세션 메시지 목록 | `route/ai/session.ts` |
| POST | `/api/ai/sessions/:sessionId/messages` | 세션 + rate limit | 메시지 전송·응답 생성 | `route/ai/chat.ts` |
| POST | `/api/ai/completions` | 세션 + rate limit | 세션 없는 단발 completion(도메인 융합) | `route/ai/chat.ts` |
| POST | `/api/ai/attachments` | 세션 | 이미지 업로드(vision, R2) | `route/ai/attachment.ts` |
| DELETE | `/api/ai/attachments/:attachmentId` | 세션 | 이미지 삭제 | `route/ai/attachment.ts` |

파일 카운트: `connection.ts` = 4, `model.ts` = 2, `prompt.ts` = 4, `session.ts` = 5, `chat.ts` = 2, `attachment.ts` = 2. 상세: [../domains/ai.md](../domains/ai.md).

---

## 페이지 / well-known (최상위 마운트, `/api` 밖)

`app.route('', createPage(...))`. `home`·`policy`·`well-known` 은 공개. `securityExcludeExactPaths` 에 `/`·`/policy`, `securityExcludePaths` 에 `/.well-known/caldav` 포함.

| Method | 전체 Path | 인증 | 설명 | 핸들러 파일 |
|--------|-----------|------|------|-------------|
| GET | `/` | 없음 | 홈(SSR 랜딩) | `page/home.tsx` |
| GET | `/favicon.ico` | 없음 | 파비콘 | `page/home.tsx` |
| GET | `/policy` | 없음 | 개인정보처리방침·이용약관(SSR) | `page/policy.tsx` |
| GET | `/.well-known/caldav`, `/.well-known/caldav/` | 없음 | CalDAV 디스커버리 → `/caldav/{token}/` 301 | `page/well-known.ts` |
| PROPFIND | `/.well-known/caldav`, `/.well-known/caldav/` | 없음 | CalDAV 디스커버리(PROPFIND) | `page/well-known.ts` |
| PROPFIND | `/` | 없음 | Basic-auth 토큰 → caldav 301 fallback | `page/well-known.ts` |
| PROPFIND | `/principals/`, `/principals/*` | 없음 | principals PROPFIND fallback | `page/well-known.ts` |
| PROPFIND | `/calendar/dav/*` | 없음 | 클라이언트 dav 경로 fallback | `page/well-known.ts` |

파일 카운트: `home.tsx` = 2, `policy.tsx` = 1, `well-known.ts` = 8.

### 어드민 SSR (`/admin/*`)

`page/admin/index.ts` 가 `/admin` 하위로 로그인·대시보드 및 13개 도메인 페이지를 마운트한다. 각 서브앱은 `app.use('*', requireAdminPage(...))`(`page/admin/guard.ts`)로 `어드민` 게이팅, **SSR(JSX) + 폼 POST → 303** 패턴(CSR 없음). 개별 페이지·폼 POST 경로는 이 문서가 소유하지 않는다 — [../admin-features.md](../admin-features.md) 로 위임.

| 대표 경로(마운트 접두사) | 핸들러 |
|--------------------------|--------|
| `GET /admin/styles.css` | `page/admin/index.ts`(디자인토큰 CSS, 게이트 없음) |
| `/admin/login` | `page/admin/login.tsx` |
| `/admin`(대시보드) | `page/admin/dashboard.tsx` |
| `/admin/{users,sessions,api/tokens,api/logs,logs,blog,messages,weather,mail,spotify,resumes,calendar,drive}` | `page/admin/pages/*` |

---

## Vercel cron (`vercel.json`)

`vercel.json` `crons` 에 등록된 스케줄 호출 대상(경로는 `rewrites` 로 `/api` Hono 앱에 전달):

| 경로 | 스케줄 | 대응 핸들러 |
|------|--------|-------------|
| `/api/drive/lifecycle/evict-r2` | `0 3 * * *` | `route/drive/lifecycle.ts` (POST `/evict-r2`) |
| `/api/drive/lifecycle/auto-promote` | `0 5 * * *` | `route/drive/lifecycle.ts` (POST `/auto-promote`) |

---

## 파일별 라우트 카운트 (자기검증)

| 파일 | 카운트 | 파일 | 카운트 |
|------|:---:|------|:---:|
| `route/health.ts` | 1 | `route/mail/account.ts` | 8 |
| `route/auth/oauth.ts` | 1 | `route/mail/folder.ts` | 1 |
| `route/auth/token.ts` | 3 | `route/mail/message.ts` | 16 |
| `route/badge.ts` | 2 | `route/mail/sync.ts` | 3 |
| `route/weather/weather.ts` | 4 | `route/mail/upload.ts` | 2 |
| `route/weather/location.ts` | 3 | `route/spotify/account.ts` | 6 |
| `route/weather/key.ts` | 4 | `route/spotify/key.ts` | 3 |
| `route/weather/mock.ts` | 4 | `route/spotify/data.ts` | 2 |
| `route/blog/post.ts` | 4 | `route/spotify/playing.ts` | 3 |
| `route/blog/thumbnail.ts` | 1 | `route/spotify/widget-token.ts` | 4 |
| `route/blog/comment.ts` | 4 | `route/resume/resume.ts` | 5 |
| `route/blog/category.ts` | 2 | `route/calendar/event.ts` | 8 |
| `route/blog/tag.ts` | 2 | `route/calendar/group.ts` | 4 |
| `route/blog/message.ts` | 4 | `route/calendar/subscription.ts` | 4 |
| `route/blog/image.ts` | 4 | `route/calendar/ics.ts` | 1 |
| `route/blog/admin.ts` | 8 | `route/calendar/caldav.ts` | 24 |
| `route/drive/asset.ts` | 11 | `route/logs/log-event.ts` | 5 |
| `route/drive/folder.ts` | 5 | `route/logs/device-key.ts` | 3 |
| `route/drive/lifecycle.ts` | 3 | `route/ai/connection.ts` | 4 |
| `route/ai/model.ts` | 2 | `route/ai/prompt.ts` | 4 |
| `route/ai/session.ts` | 5 | `route/ai/chat.ts` | 2 |
| `route/ai/attachment.ts` | 2 | | |

- API(`/api/*`) 라우트 등록 합계 = **167**(기존 148 + ai 19). CalDAV(`/caldav/*`) = **24**. 페이지/well-known = **11**(`home` 2 + `policy` 1 + `well-known` 8). 메타(`index.ts` 인라인) = **2**(비프로덕션). 어드민(`/admin/*`)은 위임(카운트 제외).
