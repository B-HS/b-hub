# Admin Features — 어드민 페이지 기능 맵

> 기준: 2026-07-02 (dev @ `f20afcf`) 코드 검증. 다루는 코드: `page/admin/**`, `page/index.ts`, `db/schema.ts`

`db/schema.ts` 테이블 43개를 도메인별로 묶어 `page/admin/` 어드민 페이지로 매핑한다. 모든 페이지는 **SSR(Hono JSX) + 폼 POST → 303 리다이렉트** 패턴이다(CSR 없음). 어드민은 `service/`·`route/` 계층을 거치지 않고 전용 `page/admin/db.ts`(`AdminDb`) 어댑터로 Drizzle 을 직접 조회·변경한다.

- 스키마 전수: [reference/db-schema.md](./reference/db-schema.md) · API 엔드포인트 전수: [reference/api-endpoints.md](./reference/api-endpoints.md) (중복 서술하지 않고 이 문서는 어드민 UI 만 다룬다).
- 참고 수치(2026-07-02): `service/domain/` 서비스 팩토리 26개 + KMA mock 1개(9개 도메인), `route/` 라우트 팩토리 36개 / 라우트 파일 38개.

사이드바 그룹(`nav.ts` `NAV`): Overview · Identity · Blog · Social · Weather · Mail · Spotify · Observability · Other.

---

## 0. Dashboard (`/admin`) — `dashboard.tsx`

- **Stat 카드 14개**(`counts()`): Users, Active Sessions(`session`), API Tokens(`apiToken`), Requests (24h)[delta `errors N`], Posts, Comments, Messages, Mail Accounts, Spotify Accounts, Calendar Events, Weather Logs(`weatherApiLog`), Log Errors (24h)[delta `events N`], Resumes, Drive Assets[delta `storageBytes` = `cloudAssets.size_bytes` 합].
    - `requests24h`/`errors24h` = `apiRequestLog` 최근 24h(에러 = `status_code >= 400`). `logErrors24h`/`logEvents24h` = `logEvents` 최근 24h(에러 = `severity >= 40`).
- **테이블 4개**: 최근 가입 사용자(5), 최근 API 요청(10, `apiRequestLog`), 최근 에러(5, `errorCode` not null), 최근 로그 이벤트 ERROR+(5, `logEvents` `severity >= 40`).
- 액션 없음(읽기 전용).

---

## 1. Users (`/admin/users`) — `user`, `session`, `account`, `apiRequestLog`

- **List**: Email(→상세) / Name / Role(badge) / Banned(badge) / TZ(`timezone`) / Quota(`storageQuotaBytes`) / Joined(`createdAt`). (이미지 썸네일 컬럼 없음)
- **Filter**: `q`(email·name), `role`(admin / user·null), `banned`(y=banned only / n=unbanned only), `size`.
- **Detail (`/:id`)**: 프로필 카드 + 인라인 폼 3개(Role 변경 · Ban 상태 reason/expires + Ban/Unban · Storage Quota bytes) + 연결된 계정(`account`: providerId/accountId/연결일) + 활성 세션(`session`: IP/UA/Created/Expires + 강제 만료, 하단 "모든 세션 강제 만료") + 최근 API 요청 20건(`apiRequestLog`).
- **Actions** (form POST → 303, `?flash=ok`):
    - `/admin/users/:id/role` — role(admin/user)
    - `/admin/users/:id/ban` — action=ban/unban + reason + expires
    - `/admin/users/:id/quota` — bytes
    - `/admin/users/:id/sessions/:sid/revoke` — 세션 단건 만료
    - `/admin/users/:id/sessions/revoke-all` — 해당 사용자 전체 세션 만료

---

## 2. Sessions (`/admin/sessions`) — `session`

- **List**: User(→상세, `userEmail`) / IP / User Agent / Created / Expires + 강제 만료 / 전체 만료.
- **Filter**: `q`(email), `size`.
- **Actions**: `/admin/sessions/:id/revoke`, `/admin/sessions/user/:userId/revoke-all`.

---

## 3. API Tokens (`/admin/api/tokens`) — `apiToken`

- **List**: User(→상세) / Name / Token(`maskToken`) / Expires / Last used / Created + 취소.
- **Filter**: `q`(email·token name), `size`.
- **Action**: `/admin/api/tokens/:id/revoke`.

## 4. Request Logs (`/admin/api/logs`) — `apiRequestLog`

- **List**: Time / Method / Path / Status(badge: ≥500 dest, ≥400 outline, else success) / User(→상세, id 8자) / IP / ms(`durationMs`) / Error(`errorCode`). (읽기 전용)
- **Filter**: `path`, `status`, `userId`, `from`, `to`, `size`.

---

## 5. Log Events (`/admin/logs`) — `logEvents`

b-hub 통합 에러·이벤트 로그(서버 4xx·5xx 자동 캡처 + 디바이스 수집). 상세는 [logging.md](./logging.md).

- **List**: Time / Severity(badge: DEBUG/INFO/WARN/ERROR/FATAL, 임계 20/30/40/50) / Service / Error Code / Description(`errorDescription`) / Device(`deviceId`) / Resolved(`resolvedAt`) + 해소(미해소 행만).
- **Filter**: `service`, Min severity(`severity`: WARN+ 30 / ERROR+ 40 / FATAL 50), `deviceId`, Resolved(`unresolved`: All / Unresolved(y) / Resolved(n)), `from`, `to`, `size`.
- **Action**: `/admin/logs/:id/resolve` — `resolved_at` 기록(`?flash=ok`, "해소 처리되었습니다.").
- **Device keys**(`deviceKey`)는 어드민 페이지 없이 API(`/api/logs/device-keys`)로 관리.

---

## 6. Blog

### 6-1. Posts (`/admin/blog/posts`) — `posts`, `categories`, `postTags`
- **List**: ID / Title / Category(badge, `categoryName`) / Views / Flags(published·draft / hidden / notice / no-comment) / Created.
- **Filter**: `q`(title·body), `categoryId`, `tagId`, `published`(y/n), `hidden`(y/n), `notice`(y/n), `size`.
- **Actions** (각 row): `/posts/:id/publish` · `/hide` · `/notice` · `/comments`(토글 `isPublished`/`isHide`/`isNotice`/`isComment`) · `/posts/:id/delete`.

### 6-2. Comments (`/admin/blog/comments`) — `comments`
- **List**: ID / Post(title 또는 `#postId`) / User(email 또는 id) / Comment / State(hidden/visible) / Created.
- **Filter**: `q`(본문), `postId`, `userId`, `hidden`(y/n), `size`.
- **Actions**: `/comments/:id/hide`(토글), `/comments/:id/delete`.

### 6-3. Categories (`/admin/blog/categories`) — `categories`
- **List**: ID / Name / Hidden + hide 토글. 상단에 새 카테고리 폼.
- **Actions**: `POST /admin/blog/categories`(생성, `name`), `POST /admin/blog/categories/:id/hide`(토글).

### 6-4. Tags (`/admin/blog/tags`) — `tags`
- **List**: ID / Tag + delete. 상단에 새 태그 폼.
- **Actions**: `POST /admin/blog/tags`(생성, `tag`), `POST /admin/blog/tags/:id/delete`.

### 6-5. Image Assets (`/admin/blog/images`) — `imageAssets`
- **List**: ID(8자) / R2 key / Bucket / MIME / Size / WxH(`width`×`height`) / Uploaded by(→user) / Created + delete.
- **Filter**: `q`(r2Key), `size`.
- **Action**: `/admin/blog/images/:id/delete`.
- 레거시 `images` 테이블은 어드민에 미노출(`imageAssets` 만 조회).

---

## 7. Social

### 7-1. Messages (`/admin/messages`) — `messages`, `messageImages`, `messageLikes`, `messageBookmarks`
- **List**: Time / User(email 또는 id) / Body(→상세) / Kind(reply / retweet / post) / Likes(`likesCount`) / Bookmarks(`bookmarksCount`) / State(deleted/live) + 액션.
- **Filter**: `q`(본문), `userId`, `includeDeleted`(y=포함), `size`.
- **Detail (`/:id`)**: 본문 카드(ID/User/Kind/State/Created + body) + 첨부 이미지(`messageImages`: order/r2Key/mime) + 좋아요(`messageLikes`) + 북마크(`messageBookmarks`).
- **Actions**: `/messages/:id/delete`(soft delete), `/messages/:id/restore`.

### 7-2. Follows (`/admin/messages/follows`) — `follows`
- **List**: Follower(→user) / Following(→user) / Since. (읽기 전용)

---

## 8. Weather (`/admin/weather`) — `weatherApiKey`, `weatherApiLog`, `weatherCurrent`, `weatherUltra`, `weatherShort`

### 8-1. API Keys (`/admin/weather/keys`)
- **List**: User(→상세) / Name / Token(`maskToken`) / Daily limit(`dailyLimit`) / Last used / Expires + 취소.
- **Filter**: `q`, `size`. **Action**: `/admin/weather/keys/:id/revoke`.

### 8-2. Request Logs (`/admin/weather/logs`)
- **List**: Time / Endpoint / Grid(`nx,ny`) / Status(badge) / ms / Error.
- **Filter**: `endpoint`, `status`, `userId`, `from`, `to`, `size`.

### 8-3. Forecast Cache (`/admin/weather/cache`)
- **Stat**: Current / Ultra / Short rows(`weatherCacheSummary`).
- **Grid table**: Grid(`nx, ny`) / Last base date / Last base time / Rows + drop.
- **Action**: `/admin/weather/cache/:nx/:ny/drop` — 격자 캐시 삭제.

---

## 9. Mail (`/admin/mail`) — `mailAccounts`, `mailMessages`, `mailSyncLogs`, `mailSyncSessions`, `mailUploads`

사이드바 순서: Accounts · Sync Sessions · Sync Logs · Messages · Uploads.

### 9-1. Accounts (`/admin/mail/accounts`)
- **List**: User(→상세) / Provider(badge) / Email / Active / Last sync(`lastSyncAt`) / Status(`lastSyncStatus`) / Connected + 활성·비활성 토글 · 동기화.
- **Filter**: `q`(email), `size`.
- **Actions**: `/accounts/:id/toggle`, `/accounts/:id/sync`(`triggerMailSync` 호출; 실패 시 `?flash=err`).

### 9-2. Sync Logs (`/admin/mail/sync-logs`)
- **List**: Time / Account / Type(`syncType`) / Status(badge: completed/failed/기타) / Added / Updated / Deleted / ms / Error(`errorMessage`).
- **Filter**: `accountId`, `status`, `size`.

### 9-3. Sync Sessions (`/admin/mail/sync-sessions`)
- **List**: Started / Account / Folder(`folderId`) / Type / Status(badge) / Progress(`syncedCount`/`totalEstimate`) / Last batch(`lastBatchAt`). (cursor 컬럼 없음)
- **Filter**: `status`, `size`.

### 9-4. Messages (`/admin/mail/messages`)
- **List**: Received / Account / Folder / Subject / From(`fromAddress` name<address>) / Flags(read·unread / attach). (읽기 전용)
- **Filter**: `accountId`, `q`(subject), `folderId`, `isRead`(y/n), `hasAttachments`(y/n), `size`.

### 9-5. Uploads (`/admin/mail/uploads`) — `mailUploads`
- **List**: User(→상세) / Filename / MIME / Size / R2 key / Inline(`isInline`) / Created + delete.
- **Filter**: `q`(filename), `size`. **Action**: `/mail/uploads/:id/delete`.

---

## 10. Spotify (`/admin/spotify`) — `spotifyAccounts`, `spotifyApiKeys`, `spotifyWidgetTokens`

- **Accounts (`/admin/spotify/accounts`)**: User(→상세) / Spotify ID / Display Name / Spotify email / Active / Connected. (읽기 전용, filter `q`·`size`)
- **API Keys (`/admin/spotify/keys`)**: User(id 12자→상세) / Spotify Acc(`spotifyAccountId`) / Name / Expires / Last used + 취소. Action `/spotify/keys/:id/revoke`.
- **Widget Tokens (`/admin/spotify/widget-tokens`)**: ID / User ID(→상세) / Spotify Acc / Name / Token(`maskToken`) / Active + 활성·비활성 토글. Action `/spotify/widget-tokens/:id/toggle`.

---

## 11. Resumes (`/admin/resumes`) — `resumes`

- **List**: ID(→상세) / User(→상세) / Type(badge) / Title / Visibility(public/private) / 작성일 + 공개 토글 · delete.
- **Filter**: `q`(title), `size`.
- **Detail (`/:id`)**: 메타 카드(ID/User/Type/Public/Created/Updated) + Data(`JSON.stringify` pretty view).
- **Actions**: `/resumes/:id/visibility`(`isPublic` 토글), `/resumes/:id/delete`.

---

## 12. Calendar (`/admin/calendar`) — `calendarGroup`, `calendarEvent`, `calendarSubscription`, `deletedCalendarEvent`

- **Events (`/admin/calendar/events`)**: User(→상세) / Summary / Start(`dtstart`) / End(`dtend`) / All day(`isAllDay`) / Group(`groupName`) / Status(badge: CANCELLED/TENTATIVE/기타). Filter `q`(summary)·`userId`·`from`·`to`·`size`. (읽기 전용)
- **Groups (`/admin/calendar/groups`)**: ID(8자) / User(→상세) / Name / Color(swatch+hex) / Order(`sortOrder`) / Visible / Created. (읽기 전용)
- **Subscriptions (`/admin/calendar/subscriptions`)**: User(→상세) / Name / Token(`maskToken`) / Active / Last access(`lastAccessedAt`) / CTag / Created + 취소(활성 행만). Action `/calendar/subscriptions/:id/revoke`.
- **Tombstones (`/admin/calendar/deleted`)**: User(→상세) / UID / Sync token(12자) / Deleted(`deletedAt`). 동기화 충돌 추적, 읽기 전용.

---

## 13. Drive (`/admin/drive`) — `cloudAssets`, `driveFolders`, `storageLifecycleLogs`

- **Assets (`/admin/drive/assets`)**: ID / User(→상세) / Original name / MIME / Size / Tier(`storageTiers` badge) / Status(`uploadStatus` badge) / Access(`accessCount`) / Last viewed / Created + delete. Filter `q`(filename)·`userId`·`tier`(L1/L2/L3)·`status`(ready/uploading/failed)·`size`. Action `/drive/assets/:id/delete`.
- **Folders (`/admin/drive/folders`)**: ID(8자) / User(→상세) / Parent(`parentId` 8자) / Name / Created. (읽기 전용)
- **Lifecycle Logs (`/admin/drive/lifecycle-logs`)**: Time / Asset(`assetId`) / Action(badge) / Tier(`fromTier` → `toTier`) / Reason. Filter `assetId`·`size`.

---

## 14. 인증 · 정적 라우트

- **Guard**: `page/admin/guard.ts` `requireAdminPage(getSession)`. 각 도메인 라우트가 `app.use('*', requireAdminPage(...))` 로 게이팅. 미인증 → `/admin/login?next=...`(303), `role !== 'admin'` → 403 HTML(`renderForbidden`). `getSession` 은 compose 의 `composed.getSession`(better-auth 세션 정규화).
- **Login (`/admin/login`)** — `login.tsx`:
    - `GET /admin/login` — 관리자면 `next` 로 303, 아니면 로그인 카드(Google/GitHub) 또는 비관리자 안내(로그아웃 링크).
    - `GET /admin/login/social/:provider`(`google`|`github`) — better-auth `signInSocial`, set-cookie 포워딩 후 302.
    - `GET /admin/login/logout` — `signOut`.
- **Static**: `GET /admin/styles.css` — `ADMIN_DESIGN_TOKENS_CSS`(`styles.ts`) + 캐시 헤더. guard 밖.
- 루트 배선(`index.ts`): `createPage({ admin: { getSession, db, auth, triggerMailSync } })`, `securityHtmlPaths: ['/admin']`.

---

## 15. 라우트 구조 요약

```
GET  /admin/styles.css                     → 디자인 토큰 CSS (guard 밖)
GET  /admin/login                          → 로그인/비관리자 안내
GET  /admin/login/social/:provider         → google|github OAuth 시작
GET  /admin/login/logout                   → 로그아웃
GET  /admin                                → dashboard
     /admin/users                          → list
       /:id                                → detail
       /:id/role                           → POST
       /:id/ban                            → POST
       /:id/quota                          → POST
       /:id/sessions/:sid/revoke           → POST
       /:id/sessions/revoke-all            → POST
     /admin/sessions                       → list
       /:id/revoke                         → POST
       /user/:userId/revoke-all            → POST
     /admin/api/tokens                     → list ( /:id/revoke POST )
     /admin/api/logs                       → list
     /admin/logs                           → list ( /:id/resolve POST )
     /admin/blog/posts                     → list ( /:id/publish|hide|notice|comments|delete POST )
     /admin/blog/comments                  → list ( /:id/hide|delete POST )
     /admin/blog/categories                → list + create(POST /) + /:id/hide POST
     /admin/blog/tags                       → list + create(POST /) + /:id/delete POST
     /admin/blog/images                    → list ( /:id/delete POST )
     /admin/messages                       → list ( /:id/delete|restore POST )
       /:id                                → detail
     /admin/messages/follows               → list
     /admin/weather/keys                   → list ( /:id/revoke POST )
     /admin/weather/logs                   → list
     /admin/weather/cache                  → list ( /:nx/:ny/drop POST )
     /admin/mail/accounts                  → list ( /:id/toggle|sync POST )
     /admin/mail/sync-logs                 → list
     /admin/mail/sync-sessions             → list
     /admin/mail/messages                  → list
     /admin/mail/uploads                   → list ( /:id/delete POST )
     /admin/spotify/accounts               → list
     /admin/spotify/keys                   → list ( /:id/revoke POST )
     /admin/spotify/widget-tokens          → list ( /:id/toggle POST )
     /admin/resumes                        → list ( /:id/visibility|delete POST )
       /:id                                → detail (JSON view)
     /admin/calendar/groups                → list
     /admin/calendar/events                → list
     /admin/calendar/deleted               → list
     /admin/calendar/subscriptions         → list ( /:id/revoke POST )
     /admin/drive/assets                   → list ( /:id/delete POST )
     /admin/drive/folders                  → list
     /admin/drive/lifecycle-logs           → list
```

- 페이지 사이즈: `size` 쿼리(기본 20 또는 30, 도메인별 5~100/5~200 클램프). 페이지네이션은 `page` 쿼리.
- 대부분 액션은 처리 후 `returnTo`(또는 기본 경로)에 `?flash=ok` 를 붙여 303 → 페이지가 배너 렌더. mail sync 실패만 `?flash=err`.

---

## 16. 데이터 액세스 정책

- 어드민 전용 어댑터 `page/admin/db.ts`(`AdminDb = ReturnType<typeof createAdminDb>`). `getDb()` Drizzle 인스턴스로 `select`/`update`/`delete` 직접 실행, **사용자 범위 필터 없음**(전 사용자 데이터 조회). 계층상 `service/`·`route/` 를 우회하는 유일한 예외.
- 인가는 미들웨어가 아니라 페이지 그룹별 `requireAdminPage` 게이트(`guard.ts`). `middleware/require-admin.ts` 의 `requireAdmin` 은 JSON 에러(`createAppError`)를 던지는 API용 어드민 게이트로 어드민 페이지 게이트와는 별개다(현재 라우터엔 미배선 — 정의·테스트만 존재. `route/blog/*` admin 엔드포인트는 각자 인라인 `requireAdmin` 헬퍼를 씀).
- 어드민 응답은 HTML 이라 JSON `errorHandler` 대신 `renderForbidden`(403 HTML) 로 권한 거부를 처리한다.

---

## 17. 공통 컴포넌트 (`components.tsx`)

| 컴포넌트 | 역할 |
|---|---|
| `AdminShell` | 외곽(사이드바 `NAV` + 토바 + breadcrumbs + flash 배너). props: `title`·`subtitle`·`user`·`currentPath`·`breadcrumbs`·`flash`. |
| `DataTable<T>` | 도메인 무관 list(`columns`·`rows`·`rowKey`·`empty`). |
| `Pagination` | `page`·`pageSize`·`total`·`baseQuery`·`basePath` — query 보존 이전/다음. |
| `FilterBar` | `action`·`fields`(text/select/number/date)·`hidden` — query string ↔ GET 폼. |
| `Badge` | 상태 표시. kind: `default`/`secondary`/`outline`/`success`/`muted`/`destructive`(→ [DESIGN.md](./DESIGN.md) 토큰). |
| `RowAction` | 단건 POST 폼(`action`·`label`·`variant`·`confirmText`·`hidden`·`returnTo`). |
| `Stat` | 대시보드 카드(`label`·`value`·`delta`). |

---

## 18. 파일 맵 (`page/admin/`)

| 파일 | 역할 |
|---|---|
| `index.ts` | `createAdminRoute` — `styles.css`·`login`·각 도메인 라우트 마운트. `adminDb`(없으면 `db` 로 `createAdminDb`) 조립, `triggerMailSync` 주입. |
| `nav.ts` | 사이드바 `NAV`(9개 그룹) + `isActivePath`. |
| `guard.ts` | `requireAdminPage` 게이트, `AdminSessionUser`/`AdminGetSession`/`AdminContext` 타입, `renderForbidden`. |
| `db.ts` | `AdminDb` 어댑터 — 전 도메인 list/get/count/toggle/delete/revoke Drizzle 쿼리(전수). |
| `components.tsx` | 공통 JSX 컴포넌트(§17). |
| `dashboard.tsx` | `createDashboardRoute` — Stat 14 + 최근 4 테이블. |
| `styles.ts` | `ADMIN_DESIGN_TOKENS_CSS` + `ADMIN_DESIGN_TOKENS_CACHE_HEADERS`. |
| `format.ts` | `formatDate`·`formatDateShort`·`formatBytes`·`maskToken`·`truncate`·`ynLabel`·`parseIntOr`·`parseDateStart`·`parseDateEnd`·`clampPage`. |
| `login.tsx` | `createLoginRoute` — social 로그인/로그아웃, set-cookie 포워딩. |
| `pages/users.tsx` | Users list/detail + role·ban·quota·session revoke(all). |
| `pages/sessions.tsx` | 전 사용자 세션 list + revoke / revoke-all. |
| `pages/api.tsx` | `createApiTokensRoute`(tokens list + revoke) · `createApiLogsRoute`(request logs). |
| `pages/logs.tsx` | Log Events list + resolve(severity 라벨/badge 헬퍼). |
| `pages/blog.tsx` | Posts·Comments·Categories·Tags·Images 전체. |
| `pages/messages.tsx` | Messages list/detail + delete/restore, Follows list. |
| `pages/weather.tsx` | Keys·Logs·Cache(+drop). |
| `pages/mail.tsx` | Accounts(toggle/sync)·Sync Logs·Sync Sessions·Messages·Uploads. `TriggerMailSync` 타입. |
| `pages/spotify.tsx` | Accounts·Keys·Widget Tokens. |
| `pages/resumes.tsx` | Resumes list/detail + visibility/delete. |
| `pages/calendar.tsx` | Groups·Events·Subscriptions(revoke)·Deleted. |
| `pages/drive.tsx` | Assets(delete)·Folders·Lifecycle Logs. |

### 어드민 페이지가 없는 테이블
`verification`(better-auth), `postTags`(`tagId` 필터 조인만), `images`(레거시), `mailFolders`(`folderId` 필터만), `mailAttachments`(`hasAttachments` 플래그만), `deviceKey`(API `/api/logs/device-keys` 로 관리) — 전용 뷰 없음.
