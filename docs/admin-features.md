# Admin Features — DB 전수검사 & 기능 리스트

`db/schema.ts` 38개 테이블 / `service/domain/*` 22개 서비스 / `route/**` 38개 라우트를 도메인별로 묶어 어드민 페이지 기능으로 매핑한다. 모든 페이지는 **SSR(JSX) + 폼 POST → 303 리다이렉트** 패턴으로 작성한다. (CSR 없음)

---

## 0. Dashboard (`/admin`)

- 전체 카운트 요약: users, posts, comments, messages, mail accounts, spotify accounts, drive assets, calendar events, weather logs, api requests (최근 24h).
- 최근 활동 5건 (apiRequestLog), 최근 가입 사용자 5명, 디스크 사용량(cloudAssets sum), 최근 에러 5건 (errorCode 있는 로그).

---

## 1. Users (`/admin/users`) — `user`, `session`, `account`, `verification`

- **List**: 가입일 / 이메일 / 이름 / role / banned / timezone / storageQuotaBytes / image 썸네일.
- **Filter**: 이메일 검색, role(admin/user/null), banned 여부.
- **Detail (`/admin/users/:id`)**: 프로필 + 연결된 OAuth account 리스트(provider) + 활성 세션 리스트(ipAddress, userAgent, expiresAt) + 최근 apiRequestLog 20건.
- **Actions** (form POST):
    - `/admin/users/:id/role` — role 변경 (user/admin)
    - `/admin/users/:id/ban` — banned 토글 + banReason + banExpires
    - `/admin/users/:id/quota` — storageQuotaBytes 변경
    - `/admin/users/:id/sessions/:sid/revoke` — 세션 강제 만료

---

## 2. API Tokens & Logs (`/admin/api`) — `apiToken`, `apiRequestLog`

- **Tokens list**: 토큰 이름 / 사용자 / 생성일 / 만료일 / 최근 사용.
- **Logs list**: method / path / statusCode / userId / ip / durationMs / errorCode / createdAt. 페이지네이션 + statusCode/path 필터 + 기간 필터.
- **Actions**:
    - `/admin/api/tokens/:id/revoke` — 토큰 즉시 만료.

---

## 2.5. Log Events (`/admin/logs`) — `log_events`

b-hub 통합 에러·이벤트 로그(서버 전 엔드포인트 4xx·5xx 자동 캡처 + 디바이스 수집). 상세는 [logging.md](./logging.md).

- **List**: time / severity(Badge) / service / errorCode / description / device / resolved. 페이지네이션.
- **Filter**: service, min severity(WARN+/ERROR+/FATAL), device, resolved 여부, 기간.
- **Action** (form POST → 303): `/admin/logs/:id/resolve` — 해소 처리(`resolved_at` 기록).
- **Dashboard**: `Log Errors (24h)` Stat + `최근 로그 이벤트(ERROR+)` 섹션.
- **Device keys**: 발급/폐기는 API(`/api/logs/device-keys`, admin) 경유.

---

## 3. Blog (`/admin/blog`) — `posts`, `comments`, `categories`, `tags`, `postTags`, `images`, `imageAssets`

### 3-1. Posts (`/admin/blog/posts`)
- **List**: title / category / 작성일 / views / isPublished / isHide / isNotice / isComment.
- **Filter**: 키워드, category, tag, 발행/숨김/공지 플래그.
- **Actions** (각 row form POST):
    - `/admin/blog/posts/:id/publish` — isPublished 토글
    - `/admin/blog/posts/:id/hide` — isHide 토글
    - `/admin/blog/posts/:id/notice` — isNotice 토글
    - `/admin/blog/posts/:id/comments` — isComment 토글
    - `/admin/blog/posts/:id/delete` — 삭제

### 3-2. Comments (`/admin/blog/comments`)
- **List**: postId(title) / userId(email) / comment 일부 / isHide / createdAt.
- **Filter**: 키워드, postId, userId, isHide.
- **Actions**: `/admin/blog/comments/:id/hide` (토글), `/admin/blog/comments/:id/delete`.

### 3-3. Categories (`/admin/blog/categories`)
- 단순 list + isHide 토글. 추가 form (`/admin/blog/categories/new`).

### 3-4. Tags (`/admin/blog/tags`)
- List + 추가/삭제.

### 3-5. Image Assets (`/admin/blog/images`)
- imageAssets / images 두 테이블 통합 뷰. r2Key / mimeType / sizeBytes / uploadedBy / createdAt. 삭제 액션.

---

## 4. Messages — 소셜 피드 (`/admin/messages`) — `messages`, `messageImages`, `messageLikes`, `messageBookmarks`, `follows`

- **List**: 작성자 / body 일부 / replyToId 여부 / retweetOfId 여부 / 좋아요 수 / 북마크 수 / createdAt / deletedAt.
- **Filter**: userId, 키워드, deleted 포함 여부.
- **Detail**: 메시지 본문 + 첨부 이미지 + 좋아요/북마크 사용자 리스트.
- **Actions**: 소프트 딜리트(`/admin/messages/:id/delete`), 복구.
- **Follows 탭** (`/admin/messages/follows`): 팔로우 그래프 전체 리스트.

---

## 5. Weather (`/admin/weather`) — `weatherCurrent`, `weatherUltra`, `weatherShort`, `weatherApiKey`, `weatherApiLog`

### 5-1. Keys (`/admin/weather/keys`)
- 사용자별 API 키 list + dailyLimit + 만료 / 최근 사용. Revoke action.

### 5-2. Logs (`/admin/weather/logs`)
- 호출 log: endpoint / nx,ny / statusCode / durationMs / errorCode. statusCode/userId/기간 필터.

### 5-3. Cache (`/admin/weather/cache`)
- 캐시된 weatherCurrent / Ultra / Short 카운트 (격자별 최근 baseDate/baseTime). Drop 옵션 (특정 격자 캐시 삭제).

---

## 6. Mail (`/admin/mail`) — `mailAccounts`, `mailFolders`, `mailMessages`, `mailAttachments`, `mailSyncLogs`, `mailSyncSessions`, `mailUploads`

### 6-1. Accounts (`/admin/mail/accounts`)
- userId / provider / email / isActive / lastSyncAt / lastSyncStatus.
- Actions: `isActive` 토글, sync 강제(`/admin/mail/accounts/:id/sync`).

### 6-2. Sync logs (`/admin/mail/sync-logs`)
- accountId / syncType / status / 추가/수정/삭제 수 / durationMs / startedAt~completedAt.

### 6-3. Sync sessions (`/admin/mail/sync-sessions`)
- accountId / folder / status / synced/total / cursor / startedAt / lastBatchAt.

### 6-4. Messages (`/admin/mail/messages`)
- accountId 필터, folder 필터, isRead, hasAttachments. subject / from / receivedAt 표시.

### 6-5. Uploads (`/admin/mail/uploads`)
- userId / filename / mimeType / sizeBytes / r2Key. Delete.

---

## 7. Spotify (`/admin/spotify`) — `spotifyAccounts`, `spotifyApiKeys`, `spotifyWidgetTokens`

- **Accounts** (`/admin/spotify/accounts`): user / spotifyUserId / displayName / isActive.
- **API Keys** (`/admin/spotify/keys`): account / name / 만료 / 최근 사용. Revoke.
- **Widget Tokens** (`/admin/spotify/widget-tokens`): account / isActive 토글.

---

## 8. Resume (`/admin/resumes`) — `resumes`

- List: user / type / title / isPublic / 작성일.
- Detail: data(JSON) raw view.
- Actions: `/admin/resumes/:id/visibility` (isPublic 토글), 삭제.

---

## 9. Calendar (`/admin/calendar`) — `calendarGroup`, `calendarEvent`, `deletedCalendarEvent`, `calendarSubscription`

- **Groups** (`/admin/calendar/groups`): user / name / color / sortOrder / isVisible.
- **Events** (`/admin/calendar/events`): user / summary / dtstart / dtend / status / 그룹. 기간 필터.
- **Deleted events** (`/admin/calendar/deleted`): user / uid / deletedAt / syncToken — 동기화 충돌 추적.
- **Subscriptions** (`/admin/calendar/subscriptions`): user / token(masked) / isActive / lastAccessedAt / ctag. Revoke.

---

## 10. Drive (`/admin/drive`) — `driveFolders`, `cloudAssets`, `storageLifecycleLogs`

- **Assets** (`/admin/drive/assets`): user / originalName / mimeType / sizeBytes / storageTiers / uploadStatus / accessCount / lastViewedAt. 필터: user / tier / status. Delete action.
- **Folders** (`/admin/drive/folders`): user / parentId / name.
- **Lifecycle logs** (`/admin/drive/lifecycle-logs`): asset / action / fromTier→toTier / reason.

---

## 11. Auth Sessions overview (`/admin/sessions`)

- 전 사용자 활성 세션 리스트(`session` 테이블). user, ip, userAgent, createdAt, expiresAt.
- Action: revoke 단일 세션, 사용자 전체 세션 revoke.

---

## 라우트 구조 요약

```
/admin                      → dashboard
/admin/login                → 미인증/비관리자용 안내 페이지
/admin/styles.css           → 디자인 토큰 정적 CSS
/admin/users                → list
  /:id                      → detail
  /:id/role                 → POST
  /:id/ban                  → POST
  /:id/quota                → POST
  /:id/sessions/:sid/revoke → POST
/admin/api/tokens           → list
  /:id/revoke               → POST
/admin/api/logs             → list
/admin/blog/posts           → list
  /:id/publish              → POST
  /:id/hide                 → POST
  /:id/notice               → POST
  /:id/comments             → POST
  /:id/delete               → POST
/admin/blog/comments        → list (with hide/delete POST)
/admin/blog/categories      → list + create + toggle
/admin/blog/tags            → list + create + delete
/admin/blog/images          → list + delete
/admin/messages             → list (+ delete)
/admin/messages/follows     → list
/admin/weather/keys         → list + revoke
/admin/weather/logs         → list
/admin/weather/cache        → list + drop
/admin/mail/accounts        → list + toggle + sync trigger
/admin/mail/sync-logs       → list
/admin/mail/sync-sessions   → list
/admin/mail/messages        → list
/admin/mail/uploads         → list + delete
/admin/spotify/accounts     → list
/admin/spotify/keys         → list + revoke
/admin/spotify/widget-tokens→ list + toggle
/admin/resumes              → list + visibility toggle + delete
  /:id                      → detail (json view)
/admin/calendar/groups      → list
/admin/calendar/events      → list
/admin/calendar/deleted     → list
/admin/calendar/subscriptions → list + revoke
/admin/drive/assets         → list + delete
/admin/drive/folders        → list
/admin/drive/lifecycle-logs → list
/admin/sessions             → list + revoke
```

---

## 데이터 액세스 정책

기존 `service/*`는 사용자(자기 자신) 범위로 작동한다. 어드민은 **모든 사용자 데이터**를 봐야 하므로:

- 어드민 페이지 전용 DB 어댑터(`page/admin/db.ts`)를 만든다. `getDb()`에서 `drizzle` 인스턴스를 가져와 `select`/`update`/`delete` 직접 실행. 사용자 범위 필터 없음.
- 단순한 read는 raw query, write는 트랜잭션 없이 단일 update.
- `requireAdmin`은 기존 미들웨어 재사용 (`middleware/require-admin.ts`).
- 단, 어드민 페이지는 **HTML 응답**이라 기존 `errorHandler`(JSON 응답)와 충돌 — 별도 admin 전용 에러 페이지 응답.

---

## 페이지 컴포넌트 공통

- `<AdminShell title="..." breadcrumbs={[...]}>` — 모든 페이지의 외곽
- `<DataTable columns rows>` — 도메인 무관 list 렌더링
- `<Pagination page total pageSize baseUrl>` — query 보존 페이지네이션
- `<FilterBar fields>` — query string ↔ form 동기화
- `<Badge variant>` — published/hidden/banned 등 상태 표시 (DESIGN.md §10‑2 매핑)
- `<ActionForm method action confirmText>` — POST 폼 + JS 없는 확인용 새 페이지 패턴 (또는 인라인 submit)
