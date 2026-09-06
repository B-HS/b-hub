# 소비자 계약 인벤토리 (정본)

> 기준: 2026-09-06, b-hub `dev` @ `6e6fed2`. 소비자 레포 지도와 전제는 [../acknowledge/2026-09-06-consumer-repos-and-compat.md](../acknowledge/2026-09-06-consumer-repos-and-compat.md), 수정 대상 목록은 [../quality-assurance/2026-09-06-audit-findings.md](../quality-assurance/2026-09-06-audit-findings.md).
> 용도: b-hub 의 엔드포인트·응답·상태 코드·헤더·SSE 를 바꾸는 모든 변경은 이 문서의 해당 소비자 행을 먼저 대조한다. 각 절은 소비자 레포를 직접 정독한 에이전트 보고서 원문이며, 줄번호는 작성 시점 기준이다.

## 목차

1. [mail · Calendar](#1-mail--calendar) — mail, ai, calendar, CalDAV, auth
2. [bblog · RESUME](#2-bblog--resume) — blog, upload-server(블로그 이미지), resume public/web, auth
3. [Storage · Rirekisyo · hn-alert · Banga · nextjs-portfolio](#3-storage--rirekisyo--hn-alert--banga--nextjs-portfolio) — drive, upload-server(드라이브), resume, ai, auth
4. [weather 웹 · ESP32 펌웨어 2종](#4-weather-웹--esp32-펌웨어-2종) — weather, logs(잠재)
5. [dashboard(machboard)](#5-dashboardmachboard) — metrics

## 전 소비자 공통 불변 조건 (요약)

- 성공 봉투 `{ success: true, data }`, 목록 `{ success, data[], pagination{page,limit,total,totalPages} }`, 오류 봉투 `{ success: false, error: { code, message } }`. Zod 검증 실패는 현재 `{ data, error: issues[], success: false }` 400 이며, 봉투로 통일하는 변경은 호환(개선)이지만 **400 상태는 유지**한다.
- `GET /api/auth/get-session` 은 better-auth 원시 응답(세션 없음 = 200 `null`) 그대로. 세션 쿠키 `__Secure-better-auth.session_token`, 프로덕션 `Domain=.gumyo.net`. CORS 는 `gumyo.net`·`hyns.dev` 서브도메인 반사 + `credentials: true`.
- `/api/mail/*`, `/api/ai/*` 는 204 나 비JSON 응답 금지(mail 클라이언트가 항상 `res.json()`). `/api/calendar/*` DELETE 는 204 빈 본문 유지.
- `/api/metrics/*`, `/api/weather/*` 는 리다이렉트 금지. 펌웨어는 200 만 성공, dashboard 는 상태 코드(401/403/413/429/5xx)로 재시도 정책을 결정한다.
- weather 응답의 정수 필드(`sky`, `pty`, `pop`, `windDirection`, `humidity`(short-term), `gridX`, `gridY`)는 JSON 정수 유지, `fcstDate/fcstTime/baseDate/baseTime` 은 `YYYYMMDD`/`HHMM` 문자열 유지, 한국어 텍스트 테이블 불변.
- SSE: `Content-Type: text/event-stream`, `\n\n` 구분, 이벤트 `delta{text}` / `done{content,...}` / `error{code,message}`, 스트림 전 오류는 JSON 봉투.
- 상한(길이·개수·크기)은 내리지 않는다: metrics `deviceId ≤64`·`os ≤64`·payload 65536·batch 50·`intervalSec 1..86400`, mail `messageIds ≤100`·`context ≤100000`, ai `messages ≤100`, weather 키 `dailyLimit`(ESP32 는 24h 350 이상 필요).

---

## 1. mail · Calendar

# b-hub Consumer Contract Inventory — `mail` and `Calendar`

Scope: every dependency the two Next.js consumers have on b-hub (`/Users/hyunseokbyun/development/b-hub`, prod `https://api.gumyo.net`).
Consumers read-only: `/Users/hyunseokbyun/development/mail` (branch `vercel`) and `/Users/hyunseokbyun/development/Calendar` (branch `vercel`).
All paths below are relative to the respective repo root; b-hub paths are prefixed `b-hub/` only where ambiguous.

---

## 0. Cross-cutting facts (apply to both consumers)

### 0.1 b-hub response envelope (must be preserved byte-for-byte in shape)
- Success: `{ success: true, data }` — `lib/api-response.ts:30-33`
- Paginated: `{ success: true, data: T[], pagination: { page, limit, total, totalPages } }` — `lib/api-response.ts:35-42` (`totalPages = ceil(total/limit)`)
- Error: `{ success: false, error: { code, message, details? } }` — `lib/api-response.ts:44-51` (`details` only when `NODE_ENV !== 'production'`)
- Status codes come from `STATUS_MAP` in `lib/error.ts:11-130`; unknown code → 500 (`:132`). Unhandled exceptions → `INTERNAL_ERROR` 500 (`lib/with-error-handling.ts:13-24`, `middleware/error-handler.ts:7-24`).
- Every `withAuth` route → `UNAUTHORIZED` 401 JSON when no session (`lib/with-auth.ts:10-14`).
- Rate-limited routes set `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` and throw `RATE_LIMIT_EXCEEDED` (429) (`lib/with-rate-limit.ts:9-19`). No `Retry-After`. Limits: mail 20 req/min per `mail:<userId>:<path>` (`compose/mail.ts:811-812`), AI 30 req/min per `ai:<userId>:<pathKey>` (`compose/ai.ts:281-282`), in-memory window (`lib/rate-limit.ts:32-54`).

### 0.2 Auth transport
- better-auth mounted at `/api/auth/*` (`route/index.ts:78`, `route/auth/oauth.ts:11`). Config `service/shared/auth-provider.ts`: `baseURL = env.BASE_URL` (`compose/shared.ts:25`), `trustedOrigins = ['*.gumyo.net','*.hyns.dev','*.seok.dev', ...env.TRUSTED_ORIGINS]` (`:18,52`), `crossSubDomainCookies { enabled: isProduction, domain: '.gumyo.net' }` (`:53-58`), Google scopes include `gmail.modify`, `gmail.send`, `drive.file` with `accessType: 'offline'`, `prompt: 'consent'` (`:31-44`), `admin` plugin default role `user` (`:46-51`).
- Normalized session adapter `getSession(c)` → `{ user: { id, name, email, role, image } }` (`compose/shared.ts:35-47`).
- CORS: only `/api/*`, origin hostname equal to or ending with `gumyo.net` / `hyns.dev` (`index.ts:24`, `middleware/index.ts:17-28,31-37`), `credentials: true`; `localhost` allowed only when `NODE_ENV !== 'production'`. `/caldav/*` has no CORS (not needed: non-browser clients).
- Both consumers authenticate **only with the better-auth session cookie** (`credentials: 'include'` in browser, `Cookie:` header forwarded server-side). Neither consumer sends `Authorization`, `X-API-Token`, or any custom auth header.
- Both consumers call `GET /api/auth/get-session` and depend on the raw better-auth response shape: mail requires `body.user` truthy (`mail/shared/auth/session.ts:31`), Calendar requires `body.session` truthy (`Calendar/proxy.ts:27`, `Calendar/entities/calendar/api.ts:32`).

### 0.3 Mount table (b-hub `route/index.ts`) for consumed prefixes
| Prefix | Factory | Line |
|---|---|---|
| `/api/auth` | `createOAuthRoute` | 78 |
| `/api/mail/accounts` | `createMailAccountRoute` (+ `mailOAuthConnect`, `baseUrl`) | 187-195 |
| `/api/mail/folders` | `createMailFolderRoute` | 196-203 |
| `/api/mail/messages` | `createMailMessageRoute` (`checkLimit: mailCheckLimit`) | 204-211 |
| `/api/mail/drafts` | `createMailDraftRoute` | 212-218 |
| `/api/mail/sync` | `createMailSyncRoute` (`checkLimit: mailCheckLimit`) | 219-226 |
| `/api/mail/uploads` | `createMailUploadRoute` | 227-233 |
| `/api/calendar/events` | `createCalendarEventRoute` | 286-292 |
| `/api/calendar/groups` | `createCalendarGroupRoute` | 293-299 |
| `/api/calendar/subscription` | `createCalendarSubscriptionRoute` (`baseUrl`) | 300-307 |
| `/api/calendar` (ICS `/:icsToken`) | `createCalendarIcsRoute` | 308-313 |
| `/api/ai/providers` | `createAiConnectionRoute` | 384-390 |
| `/api/ai/sessions` | `createAiSessionRoute` | 406-414 |
| `/api/ai` (chat: `/sessions/:id/messages[/stream]`, `/completions[/stream]`) | `createAiChatRoute` (`checkLimit: aiCheckLimit`) | 415-422 |
| `/api/ai` (models: `/:provider/models[/refresh]`) | `createAiModelRoute` | 423-429 |
| `/caldav` | `createCalendarCaldavRoute` | 433 (mounted `index.ts:65`) |

`baseUrl` used for OAuth redirects / subscription URLs = `env.BASE_URL ?? ''` (`compose/index.ts:50`).

---

## 1. Consumer: `mail` (Next.js, `/Users/hyunseokbyun/development/mail`)

### 1.1 Base URL, transport, envelope handling
| Item | Evidence |
|---|---|
| Env var | `NEXT_PUBLIC_API_BASE_URL` (`shared/lib/api.ts:16-17`, `shared/auth/auth-client.ts:6`, `shared/auth/session.ts:4`, `features/account-management/gmail-oauth-button.tsx:6`, `features/detail/attachment-list.tsx:51`, `next.config.ts:7` for CSP `connect-src`). Tests default `http://localhost:9999` (`tests/setup.ts:24-25`). |
| No rewrites/proxy | `next.config.ts:31-47` has only `headers()`; `proxy.ts:1-8` is next-intl middleware with matcher excluding `api`. All API calls go browser → b-hub cross-origin. |
| `apiFetch(path, init)` | `shared/lib/api.ts:32-43`: URL `${base}/api${path}` (`:33`), `credentials: 'include'` (`:35`), `signal: init.signal ?? AbortSignal.timeout(30_000)` (`:36`), always sends `Content-Type: application/json` (`:37-40`). |
| `parseResponse` | `shared/lib/api.ts:21-30`: **always** `await res.json()` (`:22`); if `!res.ok || !json.success` throws `ApiRequestError(json.error?.code ?? 'UNKNOWN_ERROR', json.error?.message ?? 'An unknown error occurred', res.status)` (`:24-27`). Non-JSON bodies (HTML 502 etc.) surface as `SyntaxError`. A 2xx without `success: true` is treated as failure. |
| `apiStream(path, body, {signal})` | `shared/lib/api.ts:45-56`: POST, `credentials: 'include'`, **no timeout**, headers `Content-Type: application/json`, `Accept: text/event-stream`. |
| `apiFetchFormData(path, formData)` | `shared/lib/api.ts:58-66`: POST multipart, `credentials: 'include'`, 30 s timeout (`:62`), no explicit Content-Type. |
| `serverFetch` | `shared/lib/api.ts:68-83` — defined, **no call sites** (grep). Uses `${base}${path}` (no `/api` prefix), forwards `Cookie`, `cache: 'no-store'`. |
| Global mutation error UI | `shared/lib/query-provider.tsx:15-20`: every mutation error → `toast.error(error.message)` when `ApiRequestError` (i.e. **server `error.message` text is shown verbatim**), unless `mutation.meta.suppressErrorToast`. Query defaults `staleTime: 60_000`, `refetchOnWindowFocus: false` (`:23-24`). |
| HTTP status branching | Only `res.ok` (`shared/lib/api.ts:24`, `features/detail/attachment-list.tsx:61,97`, `shared/auth/session.ts:28`, `entities/ai/use-chat-stream.ts:98`). No 401 redirect on the client; no 429 handling; no retry on 5xx (TanStack default retry 3 for queries applies except where `retry: false`). |
| Response headers read | Only `content-type` (`entities/ai/use-chat-stream.ts:96`). `Content-Disposition`, `Content-Length`, `X-RateLimit-*`, `ETag` are never read. |

Consumer types (`shared/lib/types.ts`): `EmailAddress {name, address}` (1-4), `MailAccount` (6-17), `MailFolder` (19-27), `MailMessage` (29-43), `Attachment` (45-51), `MailMessageDetail` (53-62), `UploadResult` (64-71), `ApiResponse<T> {success:true,data}` (73-76), `ApiError` (78-84), `Pagination {page,limit,total,totalPages}` (86-91), `PaginatedResponse<T>` (93-97). Param types in `shared/lib/types-params.ts` (cited per endpoint below).

### 1.2 Auth endpoints (better-auth)
| Method + path | Call site | Request | Response fields read | Notes |
|---|---|---|---|---|
| `GET /api/auth/get-session` (browser) | `entities/auth/use-session.ts:10-11` via `authClient.getSession()` | cookie | `data.user`, `data.user.email` (`features/account-management/gmail-connect-card.tsx:28,43`) | staleTime 5 min, `refetchOnWindowFocus: true` (`use-session.ts:13-14`) |
| `GET /api/auth/get-session` (server) | `shared/auth/session.ts:23-33` | header `Cookie: <all cookies>`, `cache: 'no-store'` | requires `res.ok` and `body.user` truthy; cast to `{ user: { id, name, email, role, image } }` (`:6-14`) | Used by `app/[locale]/mail/layout.tsx:9-13` and `app/[locale]/mail/settings/page.tsx:11-15` → `redirect('/login')` when null. Any fetch error → null. |
| `POST /api/auth/sign-in/social` | `app/[locale]/login/page.tsx:27` `signIn.social({ provider: 'github', callbackURL: `${origin}/mail` })` | better-auth body | redirect URL handled by SDK | `callbackURL` origin must be in `trustedOrigins` (`b-hub/service/shared/auth-provider.ts:52`). |
| `POST /api/auth/sign-out` | `widgets/header/mail-header.tsx:108-111` via `authClient.signOut()` (wrapped `shared/auth/auth-client.ts:14-22`, clears PWA cache) | cookie | none | then `router.push('/login')` |
| `GET /api/auth/list-accounts` | `features/account-management/gmail-connect-card.tsx:29-31` `authClient.listAccounts()` | cookie | `res.data[]` → `.providerId === 'google'` (`:34`), `.id` used as `betterAuthAccountId` (`:44`) | Type `LinkedAccount {id, providerId, accountId}` (`:13-17`) |

### 1.3 `/api/mail/accounts` (`entities/account/queries.ts`; server `route/mail/account.ts`)
| Method + path | Call site | Request (as sent) | Response read by consumer | Server actual | Errors consumer sees |
|---|---|---|---|---|---|
| `GET /api/mail/accounts` | `queries.ts:17-23` (`:20`) | none | `data[]` → `MailAccount`: `id`, `email`, `displayName`, `provider` (`'gmail'|'naver'|'daum'|'imap'`), `isActive`, `signature`, `lastSyncAt` (ISO string or null; `=== null` means "never synced" `app/[locale]/mail/page.tsx:87`; rendered `widgets/account-settings/account-list.tsx:151`, `widgets/header/mail-header.tsx:288-290`), `lastSyncStatus` (`'error'`/`'success'` compared `account-list.tsx:47-49,155`, `features/sidebar/account-tree-nav.tsx:136`) | `formatAccount` `route/mail/account.ts:22-44`: exactly `{id, provider, email, displayName, signature, isActive, lastSyncAt (ISO|null), lastSyncStatus, createdAt, updatedAt}`; DB default `lastSyncStatus = 'pending'` (`db/schema.ts:389`) | `UNAUTHORIZED` |
| `POST /api/mail/accounts` | `queries.ts:25-37` (`:29-32`); callers `widgets/account-settings/account-manager.tsx:58-66`, `gmail-connect-card.tsx:39-54` | JSON `CreateAccountParams` (`types-params.ts:60-79`): IMAP variant `{provider:'naver'|'daum'|'imap', email, displayName?, credentials:{username?, password}, imapHost?, imapPort?(number), imapTls?, smtpHost?, smtpPort?, smtpTls?}` built at `features/account-management/account-form.tsx:85-89`; Gmail variant `{provider:'gmail', email: session.user.email, betterAuthAccountId}` (`gmail-connect-card.tsx:41-45`) | **`res.data.id`** (`account-manager.tsx:63`, `gmail-connect-card.tsx:49` → `router.push('/mail?accountId=<id>')`). Typed as `MailAccount` but only `id` read. | `mailAccountCreateSchema` `dto/mail/account.ts:9-27` (email `z.email()`, hosts blocked for private ranges, `signature` accepted but consumer never sends it). Returns `successResponse({ id })` (`route:109-110`, `service/domain/mail/mail-account.ts:74-90`). | `MAIL_ACCOUNT_LIMIT_EXCEEDED` (400, max 10 `mail-account.ts:7`), `MAIL_OAUTH_ACCOUNT_MISMATCH`, `VALIDATION_ERROR`, `MAIL_CREDENTIALS_INVALID`; toast shows `err.message` (`account-manager.tsx:65`, `gmail-connect-card.tsx:51`) |
| `PATCH /api/mail/accounts/:accountId` | `queries.ts:39-51` (`:43-46`) | JSON `UpdateAccountParams` `{displayName?, isActive?, signature?: string|null}` (`types-params.ts:81-85`) | nothing (invalidates list). Typed `ApiResponse<MailAccount>`. | `mailAccountUpdateSchema` `dto/mail/account.ts:29-33`; returns `{ updated: true }` (`route:132`) | `MAIL_ACCOUNT_NOT_FOUND` 404 |
| `DELETE /api/mail/accounts/:accountId` | `queries.ts:53-64` (`:57-59`) | none | nothing. Typed `{ success: boolean }`. | returns `{ deleted: true }` (`route:152`) | `MAIL_ACCOUNT_NOT_FOUND` |
| `POST /api/mail/accounts/:accountId/test` | `queries.ts:66-74` (`:69-72`); `account-manager.tsx:69-76` | none | **`res.data.success` (boolean), `res.data.error` (string, optional)** (`account-manager.tsx:73,76`) | returns provider `testConnection()` → `{ success: boolean; error?: string }` (`route:171-172`, `service/domain/mail/mail-provider.ts:91`) | `MAIL_ACCOUNT_NOT_FOUND`, `MAIL_CONNECTION_FAILED` |
| `GET /api/mail/accounts/connect/google?redirect=<encodeURIComponent(location.href)>` | browser navigation `features/account-management/gmail-oauth-button.tsx:32-35` | query `redirect`, cookie | expects 302 chain: b-hub → Google → `/connect/google/callback` → 302 back to `redirect` with **`?success=true&email=<enc>`** or **`?error=<code>`** | `route/mail/account.ts:177-189` (302 to Google; requires session else JSON 401 rendered in browser), callback `:191-221` (`?error=oauth_denied` `:206`; `?success=true&email=` `:212`; `?error=<err.code|'unknown'>` `:217`). `redirect` must pass `isAllowedRedirect` (`lib/url-validator.ts:26-38`: relative path or host `gumyo.net`/`hyns.dev` or subdomain) else falls back to `baseUrl`. | Consumer parses on settings page `widgets/account-settings/account-manager.tsx:31-56`: `success==='true'` + `email`; `error` mapped for `oauth_denied`, `MAIL_OAUTH_STATE_INVALID`, `MAIL_OAUTH_EXCHANGE_FAILED`, `UNAUTHORIZED`, `SERVICE_NOT_CONFIGURED` (`:43-49`), anything else → generic toast; then `history.replaceState` strips params (`:53-55`). |

Unused by consumer: `GET /api/mail/accounts/:accountId` (`route:72-93`).

### 1.4 `/api/mail/folders` (`entities/folder/queries.ts`; server `route/mail/folder.ts`)
| Method + path | Call site | Request | Response read | Server actual |
|---|---|---|---|---|
| `GET /api/mail/folders?accountId=<n>` | `queries.ts:12-19` (`:15`, enabled when accountId truthy) and `useAllAccountsFolders` `queries.ts:21-40` (`:26`, one request per account, combined) | query `accountId` | `data[]` → `MailFolder {id, accountId, name, type, parentId, messageCount, unreadCount}` (`types.ts:19-27`). Read: `type` (`'inbox'` lookup `app/[locale]/mail/page.tsx:156`, `'archive'` `widgets/list/list.tsx:60`, sidebar icons/ordering `features/sidebar/*`), `name` (`page.tsx:157`), `id`, `accountId` + `unreadCount` (summed `page.tsx:151-153`; **optimistically patched in cache** `entities/message/mutations.ts:79-131` assuming cache shape `{success, data: MailFolder[]}` i.e. the raw envelope) | `route/mail/folder.ts:34-58`: validates `accountId` (`dto/mail/folder.ts:3-5`), ownership via `mailAccountService.getById`, returns **full `mail_folders` rows** (`compose/mail.ts:204-206`): extra fields `remoteFolderId, uidValidity, syncCursor, createdAt, updatedAt` (`db/schema.ts:401-426`). `type` values produced by providers: `'inbox'|'sent'|'drafts'|'trash'|'spam'|'archive'|'custom'` (`service/domain/mail/mail-provider.ts:9`, draft folder `'drafts'` `mail-draft.ts:75`). Consumer type union additionally lists `'starred'` (`types.ts:23`) which is a virtual client-side view (`page.tsx:155`). Errors: `UNAUTHORIZED`, `MAIL_ACCOUNT_NOT_FOUND`. |

### 1.5 `/api/mail/messages` (`entities/message/queries.ts`, `entities/message/mutations.ts`, `entities/send/queries.ts`; server `route/mail/message.ts`, `dto/mail/message.ts`)

Summary row consumed (`MailMessage`, `types.ts:29-43`): `id, accountId, folderId, subject, snippet, fromAddress {name,address}|null, toAddresses[], isRead, isStarred, isDraft, hasAttachments, sentAt (ISO|null), receivedAt (ISO|null)`. Rendered/used fields (grep across widgets/features): `isStarred`(12), `fromAddress`(9), `subject`(4), `snippet`(4), `sentAt`(4), `receivedAt`(4), `isRead`(4), `toAddresses`(3), `hasAttachments`(2), `isDraft`(1), `folderId` (`mutations.ts:71,100,142`), `accountId` (`mutations.ts:142`), `id` (virtualizer key `widgets/list/list.tsx:74`).

Server summary rows = `mailMessageListColumns` (`compose/mail.ts:381-405`): all of the above **plus** `remoteMessageId, messageIdHeader, threadId, inReplyTo, referencesHeader, ccAddresses, bccAddresses, uid, createdAt, updatedAt` (Dates → ISO via `c.json`). Consumer ignores extras.

| Method + path | Call site | Request (exact) | Response read | Server DTO / behaviour | Errors |
|---|---|---|---|---|---|
| `GET /api/mail/messages?accountId&folderId&isRead&isStarred&page&limit` | `useInfiniteMessages` `queries.ts:55-78` (`:58-67`); enabled when `folderId || accountId` (`:76`); also `useSenderDomainMessages` `queries.ts:88-111` (`:93-105`: `limit=100`, pages 1..50 **sequentially** until `pagination.page >= totalPages`), `widgets/ai-chat/use-mail-context.ts:42` (`limit=20`) | `accountId`, `folderId` only when truthy; `isRead`/`isStarred` as `'true'`/`'false'` only when defined; `page` (starts 1); `limit` only when set | `PaginatedResponse<MailMessage>`: `data[]`, **`pagination.page`, `pagination.totalPages`** (`:70-75`, `:104`) | `mailMessageListQuerySchema` `dto/mail/message.ts:8-21` (`page` default 1, `limit` 1..100 default 20, `isRead`/`isStarred` enum `'true'|'false'`); `route:36-51` → `paginatedResponse(data, {page, limit, total})`; ordered `receivedAt DESC` (`compose/mail.ts:449`) | `UNAUTHORIZED` |
| `GET /api/mail/messages/search?…` | `useInfiniteSearchMessages` `queries.ts:137-163` (`:140-157`); params from `widgets/search/search-panel.tsx:49-60` | `q` (trimmed), `accountId`, `folderId`, `fromAddress`, `toAddress`, `hasAttachment`/`isRead`/`isStarred` as `'true'|'false'`, `dateFrom`=`YYYY-MM-DDT00:00:00.000Z`, `dateTo`=`YYYY-MM-DDT23:59:59.999Z` (`search-panel.tsx:25-26,57-58`), `excludeJunk='false'` only when includeJunk (`queries.ts:153`), `page`, `limit` (default 20 `queries.ts:10`) | `data[]`, `pagination.page/totalPages` (`:160`), **`pagination.total`** (`search-panel.tsx:77`) | `mailMessageSearchQuerySchema` `dto/mail/message.ts:23-49` (`q` 1..500, `dateFrom/dateTo` `z.coerce.date()`, `excludeJunk` default `'true'`); `route:53-68` | `UNAUTHORIZED` |
| `GET /api/mail/messages/senders` | `useSenders` `queries.ts:113-120` (`:116`), staleTime 5 min | none | `data[]` → `EmailAddress {name, address}` | `mailSenderListQuerySchema` `dto:56-59` (`limit` default 10000); `route:87-102` returns `{address, name}[]` (`compose/mail.ts:623-…`) | `UNAUTHORIZED` |
| `GET /api/mail/messages/thread?accountId=<n>&threadId=<s>` | `useThreadMessages` `queries.ts:122-135` (`:126-130`); `widgets/detail/detail.tsx:45`, `use-mail-context.ts:26` | `accountId`, `threadId` (URLSearchParams) | `data[]` → `MailMessage[]` (thread ordering as returned) | `mailThreadQuerySchema` `dto:51-54`; `route:70-85`; rows `mailMessageListColumns` ordered `sentAt ASC` (`compose/mail.ts:466-472`); ownership check | `MAIL_ACCOUNT_NOT_FOUND` |
| `GET /api/mail/messages/:messageId` | `messageDetailQueryOptions` `queries.ts:49-53` (`:52`), `useMessage` `:80-86`; `widgets/detail/detail.tsx:40`, `use-mail-context.ts:21,53-59` (bulk detail fetch for every context id) | path param | `data` → `MailMessageDetail` (`types.ts:53-62`): summary fields + `bodyHtml`, `bodyText`, `ccAddresses`, `bccAddresses`, `threadId`, `messageIdHeader`, `inReplyTo`, `attachments[] {id, filename, mimeType, sizeBytes, isInline}`. Rendered: `bodyHtml`/`bodyText` (`features/detail/detail-body.tsx`, `widgets/ai-chat/ai-prompt.ts:24`), `ccAddresses`, `attachments` (`features/detail/attachment-list.tsx:53` filters `!isInline`, renders `filename`, `sizeBytes`, `mimeType`), `threadId` (`detail.tsx:45`, `use-mail-context.ts:24`), `isRead` (`detail.tsx:122`) | `route:104-119` → `successResponse(rawRow + attachments)` (`compose/mail.ts:460-465`): includes extras `remoteMessageId, referencesHeader, uid, createdAt, updatedAt`, attachments extras `remoteAttachmentId, contentId, r2Key, createdAt` (`db/schema.ts:476-496`). **Side effect:** unread message is marked read on GET (`service/domain/mail/mail-message.ts:136-138`, fire-and-forget). | `MAIL_MESSAGE_NOT_FOUND` 404 (also for other users' messages `mail-message.ts:133-134`) |
| `GET /api/mail/messages/:messageId/attachments/:attachmentId` | raw `fetch(url, { credentials: 'include' })` `features/detail/attachment-list.tsx:55,60,96` (download + image preview) | path params, cookie | `res.ok` only, then `res.blob()`; filename taken from the detail row (`:66`), **not** from `Content-Disposition` | `route:303-325`: binary `Response` with `Content-Type` (sanitized), `Content-Disposition: attachment; filename="<encodeURIComponent>"`, `Content-Length`, `X-Content-Type-Options: nosniff`. Has no explicit CORS-expose header; consumer does not read headers. | `MAIL_ATTACHMENT_NOT_FOUND` 404, `MAIL_ATTACHMENT_DOWNLOAD_FAILED` 502 → consumer generic toast (`:72,104`) |
| `POST /api/mail/messages/mark-read` | `useMarkRead` `mutations.ts:160-182` (`:163-167`); `widgets/list/list.tsx:119,150`, `widgets/detail/detail.tsx:121-126` (auto on open if `!isRead`) | JSON `{ messageIds: number[] }` | nothing (typed `{success:boolean}`); optimistic list/folder patch (`:168-175`), rollback on error (`:176`), invalidate `refetchType:'none'` | `mailMessageIdsSchema` `dto:61-63` (**1..100 ids**); returns `{ updated: true }` (`route:133`) | `MAIL_MESSAGE_NOT_FOUND` if any id not owned (`mail-message.ts:149-150`), `VALIDATION_ERROR` if >100 |
| `POST /api/mail/messages/mark-unread` | `mutations.ts:184-206` (`:187-191`) | `{ messageIds }` | nothing; optimistic | `{ updated: true }` (`route:167`) | same |
| `POST /api/mail/messages/star` | `mutations.ts:208-228` (`:211-215`) | `{ messageIds }` | nothing; optimistic (`:216-221`) | `{ updated: true }` (`route:184`) | same |
| `POST /api/mail/messages/unstar` | `mutations.ts:230-250` (`:233-237`) | `{ messageIds }` | nothing; optimistic (removes from `isStarred:true` lists `:30-47`) | `{ updated: true }` (`route:201`) | same |
| `POST /api/mail/messages/mark-all-read` | `useMarkAllRead` `mutations.ts:252-274` (`:255-259`) | `{ accountId?: number, folderId?: number }` | nothing (typed `{ updated: number }`); optimistic zero unread (`:260-267`) | `mailMarkAllReadSchema` `dto:70-77` (one of the two required); returns `{ updated: <count> }` (`mail-message.ts:211,245`) | `MAIL_ACCOUNT_NOT_FOUND`, `MAIL_FOLDER_NOT_FOUND` |
| `POST /api/mail/messages/move` | `useMoveMessages` `mutations.ts:276-301` (`:279-283`) | `{ messageIds: number[], targetFolderId: number }` | nothing; optimistic remove + unread transfer (`:284-294`) | `mailMoveSchema` `dto:65-68`; `{ updated: true }` (`route:218`) | `MAIL_MESSAGE_NOT_FOUND` |
| `POST /api/mail/messages/delete` | `useDeleteMessages` `mutations.ts:303-325` (`:306-310`) | `{ messageIds }` | nothing (typed `{success}`); optimistic | `{ deleted: true }` (`route:235`) | `MAIL_MESSAGE_NOT_FOUND` |
| `POST /api/mail/messages/send` | `useSendMail` `entities/send/queries.ts:9-22` (`:13-16`); payload built `features/compose/compose-form.tsx:99` | JSON `SendMailParams` (`types-params.ts:33-42`): `{ accountId, to: EmailAddress[], cc?, bcc?, subject, bodyHtml, bodyText?, attachmentIds?: number[] }` (`attachmentIds` = upload ids from `features/compose/use-attachments.ts`) | nothing (typed `{ messageId: string }`); invalidates messages + folders | `mailComposeSchema` `dto:79-91` (`to` min 1, `subject` ≤1000 no CRLF, bodies ≤1e6, addresses `z.email()`); **rate limited** 20/min (`route:240-263`); returns provider `{ messageId }` (`mail-message.ts:419-437`, `mail-provider.ts:108`) | `MAIL_SEND_FAILED` 502 (message masked), `RATE_LIMIT_EXCEEDED` 429, `MAIL_UPLOAD_NOT_FOUND` |
| `POST /api/mail/messages/:messageId/reply` | `useReplyMail` `send/queries.ts:24-37` (`:28-31`); `widgets/reply/reply-section.tsx:80` | JSON `ReplyParams` `{ bodyHtml, to?, cc?, bcc?, attachmentIds? }` (`types-params.ts:44-50`) | nothing | `mailReplySchema` `dto:93-100`; `to` defaults to original sender (`mail-message.ts:453`); **not rate limited** | `MAIL_MESSAGE_NOT_FOUND`, `MAIL_SEND_FAILED` |
| `POST /api/mail/messages/:messageId/forward` | `useForwardMail` `send/queries.ts:39-52` (`:43-46`); `reply-section.tsx:68` | JSON `ForwardParams` `{ to, cc?, bcc?, bodyHtml?, attachmentIds? }` (`types-params.ts:52-58`) | nothing | `mailForwardSchema` `dto:102-108`; server prepends forwarded header block (`mail-message.ts:483-484`) | same |

### 1.6 `/api/mail/drafts` (`entities/draft/mutations.ts`, `widgets/compose/use-draft-autosave.ts`; server `route/mail/draft.ts`)
All three mutations use `meta.suppressErrorToast` (`mutations.ts:10`).
| Method + path | Call site | Request | Response read | Server |
|---|---|---|---|---|
| `POST /api/mail/drafts` | `mutations.ts:12-26` (`:17-20`); payload `use-draft-autosave.ts:29-36` | `{ accountId, to, cc, bcc, subject, bodyHtml }` (recipients pre-filtered by regex `:27`; `CreateDraftParams` also allows `bodyText, inReplyTo, references, replyToMessageId` (`entities/draft/types.ts:3-14`) but they are never sent) | **`res.data.id`** (`use-draft-autosave.ts:77`) | `mailDraftCreateSchema` `dto/mail/draft.ts:10-21`; returns `formatDraft(row)` (`route:18-40`) = `DraftObject` shape (`draft/types.ts:27-35`) incl. `references`; errors `MAIL_ACCOUNT_NOT_FOUND`, `MAIL_MESSAGE_NOT_FOUND` |
| `PUT /api/mail/drafts/:id` | `mutations.ts:28-42` (`:33-36`); payload `use-draft-autosave.ts:38-44` | `{ to, cc, bcc, subject, bodyHtml }` | nothing | `mailDraftUpdateSchema` `dto:23-32`; `route:68-91` |
| `DELETE /api/mail/drafts/:id` | `mutations.ts:44-57` (`:49-51`); `use-draft-autosave.ts:113-123` after send | none | nothing (typed `{ deleted: true }`) | returns `{ deleted: true }` (`service/domain/mail/mail-draft.ts:200-205`) |
Timing: autosave debounce 2000 ms (`use-draft-autosave.ts:9`), serialized via promise chain (`:88-91`).

### 1.7 `/api/mail/sync` (`entities/sync/queries.ts`, `entities/sync/use-historical-sync.ts`, `entities/sync/use-background-sync.ts`; server `route/mail/sync.ts`, `service/domain/mail/mail-sync.ts`)
| Method + path | Call site | Request | Response read | Server |
|---|---|---|---|---|
| `GET /api/mail/sync/status?accountId=<n>` | `useSyncStatus` `queries.ts:17-25` (`:21`), enabled when accountId defined; **`refetchInterval` 3000 ms while `data.historicalSync?.status === 'running'`** (`:23`, `:10`) | query `accountId` | `data.historicalSync` → `.status` compared to `'running'`/`'paused'` (`use-historical-sync.ts:36-38`), `.syncedCount`, `.totalEstimate` (`:121`). Type `SyncStatus` (`types-params.ts:20-31`): `lastSyncAt`, `lastSyncStatus`, `historicalSync {status: 'running'|'paused'|'completed'|'error', totalEstimate: number, syncedCount: number, progressPercent: number, startedAt: string} | null`, `latestLog: unknown` | `mailSyncStatusQuerySchema` `dto/mail/sync.ts:15-17`; `route:70-88`; returns (`mail-sync.ts:418-436`) `{ accountId, lastSyncAt, lastSyncStatus, historicalSync: { status, totalEstimate (int|null), syncedCount, progressPercent (number|**null**), startedAt } | null, latestLog: {...}|null }`; stale sessions (> `SESSION_STALE_MS`) are flipped to `'error'` on read (`:397-404`) |
| `POST /api/mail/sync` | `useSyncIncremental` `queries.ts:27-43` (`:32-35`, `meta.suppressErrorToast`); callers `app/[locale]/mail/page.tsx:97-113,118-142` (all accounts in parallel via `Promise.allSettled`), `widgets/list/list.tsx:80` (pull-to-refresh), `widgets/account-settings/account-manager.tsx:27` | JSON `{ accountId, folderId? }` (`folderId` always `undefined` from page) | **`res.data.added`** (`page.tsx:104,129` → toast count). Type `SyncResult {added, updated, deleted, durationMs}` (`types-params.ts:3-8`) | `mailSyncTriggerSchema` `dto:3-6`; **rate limited** 20/min per user (`route:22-48`); returns `{ added, updated, deleted, durationMs }` (`mail-sync.ts:263`); errors `MAIL_ACCOUNT_NOT_FOUND`, `MAIL_PROVIDER_ERROR` 502, `RATE_LIMIT_EXCEEDED`. Any failure → consumer toast `syncFailed` (`page.tsx:106,140`). **Client aborts after 30 s** (`shared/lib/api.ts:36`). |
| `POST /api/mail/sync/historical` | `useSyncHistorical` `queries.ts:45-54` (`:49-52`, suppress toast); loop in `use-historical-sync.ts:45-99` | JSON `{ accountId, batchSize: undefined, cursor?: string }` (`batchSize` never set → server default) | `data.cursor` (`:65,78`), `data.syncedSoFar`, `data.totalEstimate` (`:66`), `data.hasMore` (`:71`). Loop rules: stop when `!hasMore`; `'stalled'` if next cursor equals previous (`:79-81`); max 10 000 batches (`:19,83`); invalidate lists every 5 batches (`:18,69`). Auto-resume on mount when server status is `running` or `paused` (`:112-116`) with **no cursor** (server resumes its own). | `mailHistoricalSyncSchema` `dto:8-13` (`batchSize` 10..500 default 100, `cursor` ≤500 chars); `route:50-68`; returns `{ synced, totalEstimate (int|null), syncedSoFar, cursor (string|undefined), hasMore, folderId, sessionId }` (`mail-sync.ts:370-378`). If an existing session is `'running'` it is marked `'error'` and a fresh session starts (`:293-296`); `'paused'` resumes `session.cursor` when no cursor supplied (`:329`). Errors `MAIL_FOLDER_NOT_FOUND`, `MAIL_PROVIDER_ERROR`. 30 s client abort applies. |
Background timing: Web-Worker interval `AUTOSYNC_OPTIONS = ['off','1','2','5','15']` minutes, default `'2'` (`entities/sync/autosync-setting.ts:2-5`, `use-background-sync.ts:17-24`); on tab visible after ≥ 60 000 ms (`use-background-sync.ts:6,26-33`) → `syncAll` (N parallel `POST /mail/sync`).

### 1.8 `/api/mail/uploads` (`entities/upload/mutations.ts`; server `route/mail/upload.ts`, `service/domain/mail/mail-upload.ts`)
| Method + path | Call site | Request | Response read | Server |
|---|---|---|---|---|
| `POST /api/mail/uploads` (multipart) | `useUploadFile` `mutations.ts:7-16` (`:10-13`); `features/compose/use-attachments.ts:29` (`isInline:false`), `:44` (`isInline:true`) | `FormData`: `file`, **`isInline` = `'true'`/`'false'`** | `res.data.url` (`features/compose/compose-form.tsx:72`, `features/compose/reply-form.tsx:54`, `use-attachments.ts:63` substring match in bodyHtml), `res.data.id` (→ `attachmentIds`). Type `UploadResult {id, url, filename, mimeType, sizeBytes, isInline}` (`types.ts:64-71`) | `route:17-40`: session check, `formData.get('file')`, **`formData.get('inline') === 'true'`** (`:35`) — consumer's `isInline` key is never read; returns `{ id, url, filename, mimeType, sizeBytes, isInline }` (`mail-upload.ts:121-128`). Limits: attachment 25 MB (`:60`), inline 10 MB + image mime + magic bytes (`:35-36,96-104`); errors `MAIL_UPLOAD_TOO_LARGE` 413, `MAIL_UPLOAD_INVALID_TYPE` 422, `MAIL_UPLOAD_BLOCKED_EXTENSION` (no STATUS_MAP entry → 500). 30 s client abort. |
| `DELETE /api/mail/uploads/:uploadId` | `useDeleteUpload` `mutations.ts:18-25` (`:21-23`) | none | nothing (typed `ApiResponse<null>`) | returns `{ deleted: true }` (`route:60`); `MAIL_UPLOAD_NOT_FOUND` |

### 1.9 `/api/ai/*` (`entities/ai/queries.ts`, `entities/ai/types.ts`, `entities/ai/use-chat-stream.ts`, `widgets/ai-chat/*`)
`AI_FEATURE_KEY = 'mail'` (`widgets/ai-chat/ai-chat-widget.tsx:33`), session title ≤ 60 chars (`:34,110`). `AI_STALE_TIME_MS` 5 min, list limit 50, message limit 100 (`queries.ts:8-10`).

| Method + path | Call site | Request | Response read | Server |
|---|---|---|---|---|
| `GET /api/ai/providers` | `useAiProviders` `queries.ts:19-27` (`:22`, `retry: false`); `widgets/header/mail-header.tsx:94-95`, `ai-chat-widget.tsx:53-55` | none | `data[]` → `AiProviderConnection {id, provider, status, displayName}` (`types.ts:7-12`); read `status === 'active'`, `provider` (must be `'codex'|'anthropic'|'ollama'` `types.ts:1-3`), `displayName` (rendered) | `route/ai/connection.ts:34-47` → `toResponse` (`:17-29`): `{ id (number), provider, authType, status, statusDetail, displayName (string|null), lastUsedAt, lastRefreshedAt, modelsFetchedAt, createdAt, updatedAt }`. Consumer types `id: string` (unused). |
| `GET /api/ai/:provider/models` | `useAiModels` `queries.ts:29-38` (`:32`, `retry:false`, enabled when provider) | path `provider` | `data[]` → `AiModel {modelId, displayName}` (`types.ts:14-17`); `modelId` used as `models[0]?.modelId` default (`ai-chat-widget.tsx:59`), `displayName` rendered; `isSuccess && length === 0` → "empty" UI (`:73`) | `route/ai/model.ts:34-48` → `{ id, providerId, modelId, displayName (string|null), metadata, fetchedAt }` (`:16-23`); provider name parsed by `aiProviderNameSchema` else `AI_PROVIDER_NOT_FOUND`; `resolveClient` may throw `AI_REAUTH_REQUIRED` 401 |
| `POST /api/ai/:provider/models/refresh` | `useRefreshAiModels` `queries.ts:40-48` (`:43`) | none | nothing (invalidates models) | `route/ai/model.ts:50-67`; `AI_MODEL_FETCH_FAILED` 502 |
| `GET /api/ai/sessions?featureKey=mail&limit=50` | `useAiSessions` `queries.ts:50-58` (`:54`) | query `featureKey`, `limit` | `data[]` → `AiSession` (`types.ts:32-42`): `id`, `title`, `lastMessageAt`, `createdAt` rendered in history; `pagination` ignored | `aiSessionListQuerySchema` `dto/ai/session.ts:18-22` (limit ≤100); `route/ai/session.ts:49-64` → `paginatedResponse(toSessionResponse[])` (`:22-32`: `id, provider, modelId, title, featureKey, promptIds, lastMessageAt, createdAt, updatedAt`) |
| `GET /api/ai/sessions/:sessionId/messages?limit=100` | `aiSessionMessagesQueryOptions` `queries.ts:60-64` (`:63`); fetched imperatively `ai-chat-widget.tsx:89-90` → `hydrate(res.data)` | query `limit` | `data[]` → `AiSessionMessage` (`types.ts:44-54`): only `role` (`'user'|'assistant'`) and `content` used (`use-chat-stream.ts:79`) | `aiMessageListQuerySchema` `dto/ai/chat.ts:28-31` (limit ≤100, default 50); `route:119-135` → `toMessageResponse` (`:34-44`) |
| `POST /api/ai/sessions` | `useCreateAiSession` `queries.ts:66-75` (`:69-70`); `ai-chat-widget.tsx:106-113` | `{ provider, modelId, featureKey: 'mail', title }` | **`res.data.id`** (`ai-chat-widget.tsx:112`), `res.data.featureKey ?? ''` (`queries.ts:72`) | `aiSessionCreateSchema` `dto/ai/session.ts:4-10`; `route:66-83` validates connection (`AI_PROVIDER_NOT_FOUND`, `AI_REAUTH_REQUIRED`) |
| `PATCH /api/ai/sessions/:sessionId` | `useUpdateAiSession` `queries.ts:77-86` (`:80-81`); rename `ai-chat-widget.tsx:98-100` | `{ title }` (type also allows `modelId`) | `res.data.featureKey` (`:83`) | `aiSessionUpdateSchema` `dto:12-16`; `AI_SESSION_NOT_FOUND` |
| `DELETE /api/ai/sessions/:sessionId` | `useDeleteAiSession` `queries.ts:88-96` (`:91`) | none | nothing (typed `{ deleted: boolean }`) | `{ deleted: true }` (`route:115`) |
| `POST /api/ai/sessions/:sessionId/messages/stream` (SSE) | `useAiChatStream.send` `use-chat-stream.ts:84-165` via `apiStream` (`:95`); `ai-chat-widget.tsx:115` | JSON `{ content, context, modelId }`; `context` = system prompt + `<MAIL_CONTEXT>…</MAIL_CONTEXT>` of every selected mail's From/To/Date/Subject/Body (`widgets/ai-chat/ai-prompt.ts:21-43`; sources: thread, ≤50×100 same-domain messages, or first 20 folder messages `use-mail-context.ts:10,42,45-51`). No client-side length cap. `Accept: text/event-stream`. | See SSE contract below | `aiChatSendSchema` `dto/ai/chat.ts:4-11` (`content` 1..100 000, **`context` ≤ 100 000**, `modelId` ≤100); **rate limited** 30/min pathKey `ai:chat:send` (`route/ai/chat.ts:51-52,74-92`); handler `relayChatSse` (`:33-46`) |

**SSE contract as consumed (`use-chat-stream.ts`)**
- Pre-stream check (`:96-102`): requires `res.ok` **and** `content-type` containing `text/event-stream`; otherwise body parsed as JSON error envelope → `ApiRequestError(json.error.code ?? 'AI_CHAT_FAILED', json.error.message ?? 'AI chat failed', status)`; `res.body` must exist.
- Parser (`:27-40`, `:114-121`): normalizes CRLF→LF, splits on `\n\n`; per block reads `event:` and `data:` lines (multiple `data:` joined by `\n`); comments (`:`) ignored; default event name `message` (ignored).
- Events: `delta` → `JSON.parse(data).text` appended (`:123-128`); `done` → `JSON.parse(data).content` replaces accumulated text if non-empty string (`:129-136`) then stream considered finished; `error` → `JSON.parse(data)` as `{code, message}` → status `'error'`, `error = message` (`:137-141,146-149`). Any other event name ignored.
- Stream EOF without `done` → treated as success (`:111-113,150-152`). Abort (stop/reset/hydrate/unmount `:64-82,179`) → status `'idle'`, no error.
- On success invalidates `['ai','sessions','mail']` (`:152`). No timeout, no reconnect, `retry()` replays last args (`:167-177`).
- Server emits exactly: `event: delta` `data: {"text"}` and `event: done` `data: {id, content, modelId, inputTokens, outputTokens, durationMs}` (`route/ai/chat.ts:37-38`, `service/domain/ai/ai-chat.ts:235-245`), `event: error` `data: {code, message}` where `code` = AppError code or `AI_COMPLETION_FAILED` (`:40-45`). Consumer test fixture mirrors this (`tests/entities/ai/use-chat-stream.test.tsx:22-23`).

### 1.10 Error codes / literals referenced in `mail`
- Client-only fallbacks: `'UNKNOWN_ERROR'` (`shared/lib/api.ts:26`), `'AI_CHAT_FAILED'` (`entities/ai/use-chat-stream.ts:11`).
- Server codes matched **only** via OAuth redirect query param (`widgets/account-settings/account-manager.tsx:43-49`): `oauth_denied`, `MAIL_OAUTH_STATE_INVALID`, `MAIL_OAUTH_EXCHANGE_FAILED`, `UNAUTHORIZED`, `SERVICE_NOT_CONFIGURED`.
- `error.code` is otherwise never branched on; **`error.message` text is displayed** (`shared/lib/query-provider.tsx:18`, `account-manager.tsx:65,76`, `gmail-connect-card.tsx:51`, `entities/ai/use-chat-stream.ts:148,159`).
- Local status literals compared from server data: folder `type` `'inbox'`/`'archive'`; account `lastSyncStatus` `'error'`/`'success'`; `historicalSync.status` `'running'`/`'paused'`; AI provider `status` `'active'`; AI provider names `'codex'|'anthropic'|'ollama'`.

### 1.11 Timing assumptions (mail)
- 30 s `AbortSignal.timeout` on every JSON call incl. `POST /mail/sync`, `/mail/sync/historical`, `/mail/messages/send`, `/mail/uploads` (`shared/lib/api.ts:36,62`). SSE has none.
- Sync status poll 3 s (`entities/sync/queries.ts:10`); autosync 1/2/5/15 min (default 2) via Worker; visibility resume 60 s.
- Draft autosave debounce 2 s. Query staleTime 60 s default; AI 5 min; senders 5 min; session 5 min.
- Sender-domain context: up to 50 sequential `GET /mail/messages?limit=100` (`entities/message/queries.ts:8-9,93`) followed by one `GET /mail/messages/:id` per collected message (`use-mail-context.ts:53-59`).
- No `Cache-Control`/`ETag` usage; `getServerSession` forces `cache: 'no-store'`.

---

## 2. Consumer: `Calendar` (Next.js, `/Users/hyunseokbyun/development/Calendar`)

### 2.1 Base URL, transport
Two distinct paths to b-hub:
1. **Server-side (Next server actions + proxy)** — env `API_URL` (server-only), default `http://localhost:9999` (`entities/calendar/api.ts:19`, `proxy.ts:4`). `entities/calendar/api.ts` is `'use server'` (`:1`).
   - `serverFetch` (`api.ts:47-62`): `verifyCsrf()` (Origin host must equal Host, `:37-45`) → `requireAuth()` (**`GET ${API_URL}/api/auth/get-session` with `Cookie` header; requires `res.ok` and `body.session` truthy, else `throw new Error('Unauthorized')`**, `:21-35`) → `fetch(${API_URL}${path}, { ...init, headers: { 'Content-Type': 'application/json', Cookie, ...init.headers } })`; **`res.status === 204` → `undefined`; otherwise `res.json()` with no `res.ok` check** (`:59-61`). No timeout / AbortSignal.
   - `proxy.ts:6-35` (matcher `/calendar/:path*` `:37-39`): no cookie → redirect `/login`; `GET /api/auth/get-session` with Cookie; `!res.ok` or `!body.session` or throw → redirect `/login`.
2. **Browser-side** — env `NEXT_PUBLIC_API_URL`, default `http://localhost:9999` (`shared/constant/ai.ts:1`, `shared/lib/auth-client.ts:3-5`). Used for AI endpoints (`entities/ai/api.ts`, `credentials: 'include'`) and better-auth (`signIn.social` `widgets/login/login-widget.tsx:11-13` with `callbackURL = ${origin}/calendar` for `github` and `google`; `useSession()` `widgets/home/home-widget.tsx:16-17` truthiness only).
- No rewrites (`next.config.mjs:1-22`); `cacheComponents: true`; page uses `connection()` then server actions (`app/(app)/calendar/page.tsx:8-17`).
- Query client: `staleTime` 60 s, `gcTime` 5 min, **`retry: 1`** (`shared/constant/query.ts:1-3`, `shared/lib/query-provider.tsx:10-17`).
- Paths centralised in `shared/constant/api.ts:1-21` and `shared/constant/ai.ts:3-8`.

Consumer types: `CalendarEvent` (`entities/calendar/types.ts:3-16`), `CalendarGroup` (`:18-23`), `CalendarEventResponse` (`:157-184`), `CalendarGroupResponse` (`:186-192`), `SubscriptionResponse` (`:194-200`), `ApiResponse<T>` union (`:202`), mappers `toCalendarEvent` (`:204-217`), `toCalendarGroup` (`:219-224`).

### 2.2 `/api/calendar/events` (server actions `entities/calendar/api.ts`; hooks `entities/calendar/query.ts`; server `route/calendar/event.ts`, `dto/calendar-event-mapper.ts`)
| Method + path | Call site | Request (exact) | Response read | Server | Errors |
|---|---|---|---|---|---|
| `GET /api/calendar/events/range?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` | `getEventsAction` `api.ts:64-69`; hook `useCalendarEvents` `query.ts:30-34`; callers `app/(app)/calendar/page.tsx:12-14` (month grid), `widgets/calendar/calendar-widget.tsx:36,41`, **`widgets/ai-chat/ai-chat-widget.tsx:34-36` (today −12 months … +12 months, `shared/constant/ai.ts:12-13`)** | query only; client pre-validates with `dateRangeSchema` (`validate.ts:64-67`) | `res.success` else `throw new Error(res.error.message)` (`:67`); `res.data[]` → `toCalendarEvent`: `id`, `title`, `startDate`, `endDate`, `startTime ?? undefined`, `endTime ?? undefined`, `isAllDay`, `groupId ?? ''`, `description`, `location`, `status` (cast, expected lowercase `'confirmed'|'tentative'|'cancelled'` `types.ts:1`), `color`; all-day `endDate` is shifted −1 day for display (`api.ts:12,14-17`). Fields rendered (grep): `id, startDate, groupId, endDate, title, startTime, isAllDay, location, description, status, endTime, color`. | `route/calendar/event.ts:66-90`: `dateRangeQuerySchema` (`dto/calendar-event.ts:50-54`, optional `groupId`), `startDate > endDate` or **span > 366 days → `CALENDAR_INVALID_DATE_RANGE` 400** (`:17,77-80`); response `toEventResponse` (`dto/calendar-event-mapper.ts:129-158`): `{ id: uid, uid, title, startDate, endDate (exclusive for all-day), startTime|undefined, endTime|undefined, isAllDay, groupId|null, description, location, status (lowercased), transp, priority, categories, color, rrule?, sequence }` | `UNAUTHORIZED`, `CALENDAR_INVALID_DATE_RANGE`, `CALENDAR_GROUP_NOT_FOUND` → surfaced as query error (retry 1) → `events` falls back to `initialEvents` / `[]` |
| `POST /api/calendar/events/create` | `createEventAction` `api.ts:71-92`; `useCreateEvent` `query.ts:48-58` | JSON `{ title, startDate, endDate (all-day: +1 day `:11,76`), startTime, endTime, isAllDay, groupId (`'' → null` `:80`), description, location, status: UPPERCASE (`:83`), color }` (undefined keys dropped by JSON) ; client pre-validates `eventFormSchema` (`validate.ts:5-40`: title ≤100, description ≤500, location ≤200) | `res.success` else throw `Error(res.error.message)`; `toClientEvent(res.data)` | `route:144-157` `createEventBodySchema` (`mapper:5-27`: title ≤500, `groupId` nullable, `status` enum `CONFIRMED|TENTATIVE|CANCELLED`); responds **201** + envelope (consumer ignores status) | `VALIDATION_ERROR` → toast `eventCreationFailed(message)` (`query.ts:53`) |
| `PATCH /api/calendar/events/:uid` | `updateEventAction` `api.ts:94-110`; `useUpdateEvent` `query.ts:60-84` (optimistic merge + rollback) ; callers `calendar-widget.tsx:54-56,69-71` | JSON = `{ ...input }` spread (may include `id`, `title`, …) with `endDate` (+1 day **only if `input.isAllDay` is present and true** `:97-100`), `groupId` (`undefined` untouched, `'' → null` `:101`; test `tests/entities/calendar/api.test.ts:50-66`), `status` UPPERCASE; `uid` pre-validated by `uidSchema` (`validate.ts:56-63`, regex `^[A-Za-z0-9._@-]+$`) | `res.success` else throw; `toClientEvent(res.data)` | `route:207-224`: `patchEventBodySchema = createEventBodySchema.partial()` (`mapper:29`; unknown keys such as `id` are stripped), merge via `toEventPatch` (`mapper:80-127`), returns `toEventResponse` | `CALENDAR_EVENT_NOT_FOUND` 404, `VALIDATION_ERROR` → toast `eventUpdateFailed(message)` + rollback |
| `DELETE /api/calendar/events/:uid` | `deleteEventAction` `api.ts:112-115`; `useDeleteEvent` `query.ts:86-109` (optimistic remove) | none | **expects HTTP 204** (`serverFetch:59`); any other response is `res.json()`-ed and discarded — no `success` check | `route:226-236` → `c.body(null, 204)`; service may throw `CALENDAR_EVENT_NOT_FOUND` (JSON 404) | error JSON silently ignored → `toast.success(eventDeleted)` (`query.ts:98`); refetch restores |
Unused server routes: `GET /api/calendar/events?year&month` (`route:53-65`), `POST /api/calendar/events` (`:106-142`), `PUT /:uid` (`:159-205`), `GET /detail/:uid` (`:92-104`; consumer constant `shared/constant/api.ts:4` defined but never called).

### 2.3 `/api/calendar/groups` (`api.ts`, `query.ts`; server `route/calendar/group.ts`, `dto/calendar-group.ts`, `service/domain/calendar/calendar.ts:409-441`)
| Method + path | Call site | Request | Response read | Server | Errors |
|---|---|---|---|---|---|
| `GET /api/calendar/groups` | `getGroupsAction` `api.ts:117-121`; `useCalendarGroups` `query.ts:36-40`; `page.tsx:14` | none | `res.success`; `res.data[]` → `toCalendarGroup`: `id`, `name`, `color`, `isVisible` → `visible` (`types.ts:219-224`). Rendered `id, name, color, visible`. | `route:18-27` → `successResponse(rows)`; rows are `CalendarGroupRow {id, userId, name, color, sortOrder, isVisible, createdAt, updatedAt}` (`calendar.ts:78-87`) | `UNAUTHORIZED` |
| `POST /api/calendar/groups` | `createGroupAction` `api.ts:123-131`; `useCreateGroup` `query.ts:111-121` | `{ name, color }` (client `groupFormSchema` name 1..50 `validate.ts:44-47`) | `res.success`; `toCalendarGroup(res.data)` | `createGroupSchema` `dto/calendar-group.ts:3-6` (name ≤255, color ≤50); **201** + `{ id, userId, name, color, sortOrder: 0, isVisible: true }` (`calendar.ts:417-423`) | `VALIDATION_ERROR` → toast `groupCreationFailed(message)` |
| `PATCH /api/calendar/groups/:id` | `updateGroupAction` `api.ts:133-142`; `useUpdateGroup` `query.ts:123-146` (optimistic `visible`); callers `calendar-widget.tsx:62-66` (`{ isVisible }`), `:77-79` (`{ name?, color? }`) | `{ name?, color?, sortOrder?, isVisible? }` (client `groupUpdateSchema` `validate.ts:49-54`); `id` pre-validated by `uidSchema` | `res.success`; `toCalendarGroup(res.data)` | `updateGroupSchema` `dto:8-13`; `route:43-57` updates then returns `getGroupById` (**may be `null`**) | `CALENDAR_GROUP_NOT_FOUND` 404 → toast + rollback |
| `DELETE /api/calendar/groups/:id` | `deleteGroupAction` `api.ts:144-147`; `useDeleteGroup` `query.ts:148-158` | none | expects **204**; other responses parsed and discarded (no success check) | `route:59-70` → 204; service throws `CALENDAR_GROUP_NOT_FOUND` 404 or **`CALENDAR_GROUP_HAS_EVENTS` 409** (`calendar.ts:435-441`) | error JSON ignored → `toast.success(groupDeleted)`; list refetch restores |

### 2.4 `/api/calendar/subscription` + ICS + CalDAV (`api.ts:149-179`, `query.ts:42-46,160-182`; server `route/calendar/subscription.ts`, `route/calendar/ics.ts`, `route/calendar/caldav.ts`)
| Method + path | Call site | Request | Response read | Server |
|---|---|---|---|---|
| `GET /api/calendar/subscription` | `getSubscriptionAction` `api.ts:149-158`; `useCalendarSubscription` `query.ts:42-46`; `calendar-widget.tsx:43,104-112` | none | `res.success`; **if `res.error.code === 'CALENDAR_SUBSCRIPTION_NOT_FOUND'` → auto-calls create** (`:152-154`, constant `shared/constant/api.ts:23-25`); `res.data` → `SubscriptionResponse {token, icsToken, name, caldavUrl, icsUrl}`; used: `icsUrl`, `caldavUrl`, `token`, `name` (`calendar-widget.tsx:106-112`) | `route:24-45`: `{ token, icsToken, name (string|null), caldavUrl: `${baseUrl}/caldav/${token}/`, icsUrl: `${baseUrl}/api/calendar/${icsToken}` }`; `baseUrl` = `env.BASE_URL` or `X-Forwarded-Proto/Host` fallback (`:13-19`) |
| `POST /api/calendar/subscription` | `createSubscriptionAction` `api.ts:160-167` | `{ name }` (`name` undefined → `{}`) | same shape | `route:47-68`; body read with `c.req.json().catch(() => ({}))` (no Zod) |
| `POST /api/calendar/subscription/regenerate` | `regenerateTokenAction` `api.ts:169-173`; `useRegenerateToken` `query.ts:160-170` | none | `res.data.token` | `route:70-79` → `{ token }` |
| `POST /api/calendar/subscription/regenerate-ics` | `regenerateIcsTokenAction` `api.ts:175-179`; `useRegenerateIcsToken` `query.ts:172-182` | none | `res.data.icsToken` | `route:81-90` → `{ icsToken }` |
| `GET /api/calendar/:icsToken` (browser navigation) | `features/calendar/calendar-export.tsx:34-40`: `<a href={icsUrl} download='calendar.ics'>` | none (public token) | file download; cross-origin so the `download` attribute is ignored — **server `Content-Disposition: attachment` is load-bearing** | `route/calendar/ics.ts:14-37`: `text/calendar`, `Content-Disposition: attachment; filename="<name>.ics"`, `Cache-Control: no-cache, no-store, must-revalidate`; `CALENDAR_SUBSCRIPTION_NOT_FOUND` |
| `/caldav/:token/…` (Apple CalDAV clients via `.mobileconfig`) | `features/calendar/caldav-profile-dialog.tsx:119-140`: host of `caldavUrl` replaced by `CALDAV_PROXY_HOST = 'caldav.hyns.dev'` (`shared/constant/caldav.ts:10`, `:122`), `CalDAVPrincipalURL` = pathname (`/caldav/<token>/`, `:52,67-68`), `CalDAVUseSSL` from scheme, username `'user'` (`caldav.ts:6`), password = `token` (`:137`), port 443 default (`caldav.ts:7`) | CalDAV verbs from Apple Calendar | n/a | `route/calendar/caldav.ts`: `OPTIONS /:token[/*]` (`:44-47`, `DAV` + `Allow` headers `:16-19`), `PROPFIND /:token[/]`, `/:token/default[/]` (`:133-136`, 207 XML, `Depth` header), `REPORT` (`:242-245`: `calendar-multiget`, `calendar-query`, `sync-collection`, `free-busy-query`), `PROPPATCH` (`:261-263`), `MKCALENDAR /:token/*` (`:267`, 201), `GET /:token[/default][/]` full ICS (`:285-288`), `GET/PUT/DELETE /:token/default/:uid` and `/:token/:uid` (`:290-342,403-405`; `ETag` header, 201/204), errors as JSON envelope or `text/plain` 500 (`:26-35`). Auth = token in path only; uid handling strips `.ics` and `@domain`. **Path scheme `/caldav/<token>/` is baked into installed profiles.** |

### 2.5 `/api/ai/*` (browser; `entities/ai/api.ts`, `entities/ai/types.ts`, `entities/ai/query.ts`, `widgets/ai-chat/ai-chat-widget.tsx`)
`AI_FEATURE_KEY = 'calendar'` (`shared/constant/ai.ts:10`). All requests `credentials: 'include'`.
| Method + path | Call site | Request | Response handling | Server |
|---|---|---|---|---|
| `GET /api/ai/providers` | `getAiProviders` `api.ts:33-41`; `useAiProviders` `query.ts:14-19` (`retry:false`); `calendar-widget.tsx:39-40` (`hasAi = some(status==='active')`), `ai-chat-widget.tsx:33,40-44` | header `Accept: application/json` | `!res.ok` → `AiChatError('AI_PROVIDERS_FAILED')`; body → `parseAiProviders` (`types.ts:26`): unwrap `{success:true,data}` if present (`:19-24`) then **strict `z.array(z.object({ provider: enum['codex','anthropic','ollama'], status: enum['active','reauth_required','disabled'], displayName: z.string() }))`** (`:6-10`) — any extra value or `null` `displayName` throws | `route/ai/connection.ts:34-47`; `displayName` is `string|null` (`dto/ai/provider.ts:48`, `db/schema.ts` `aiProviders.displayName` nullable, `service/domain/ai/ai-connection.ts:95`) |
| `GET /api/ai/:provider/models` | `getAiModels` `api.ts:43-51`; `useAiModels` `query.ts:21-26` (`skipToken` when no provider) | `Accept: application/json` | `!res.ok` → `AI_MODELS_FAILED`; `parseAiModels` (`types.ts:28`): strict `{ modelId: string, displayName: z.string() }` (`:13-17`) | `route/ai/model.ts:34-48`; `displayName` `string|null` (`dto/ai/model.ts:7`; `providers/anthropic-provider.ts:109`, `codex-provider.ts:120` use `?? null`) |
| `POST /api/ai/:provider/models/refresh` | `refreshAiModels` `api.ts:53-60`; `useRefreshAiModels` `query.ts:28-37` | `Accept: application/json`, no body | `!res.ok` → `AI_MODELS_REFRESH_FAILED` → `toast.error(message)`; body ignored | `route/ai/model.ts:50-67` |
| `POST /api/ai/completions/stream` (SSE) | `streamAiChat` `api.ts:74-118`; `useAiChatStream.send` `query.ts:47-67` (aborts previous, `AbortController`); `ai-chat-widget.tsx:62-80` | JSON `{ provider, modelId, messages: [{role:'system', content: AI_SYSTEM_PROMPT}, {role:'system', content: AI_CONTEXT_INTRO + context}, ...history], featureKey: 'calendar' }` (`entities/ai/context.ts:42-46`; context text `:34-40` lists groups + all events in range); headers `Content-Type: application/json`, `Accept: text/event-stream` | **Does not check `res.ok`**: if `content-type` lacks `text/event-stream` → body text parsed against `{ success:false, error:{code,message} }` (`types.ts:32-35`) → `AiChatError(code, message)` else `AI_REQUEST_FAILED` (`:83-88`); `!res.body` → `AI_NO_STREAM`. Frames split on `\n\n` (`:100-101`); `parseSseFrame` (`:21-31`) reads `event:` (trimmed) and `data:` lines, **frames without `data:` are ignored**; `done` → return (payload ignored) (`:105`); `error` → `{code,message}` → throw, else `AI_STREAM_ERROR` (`:106-111`); `delta` → `{text}` → `onDelta` (`:112-115`). EOF without `done` → normal return. Widget: `AbortError` swallowed, other errors → drop empty assistant + `toast.error(error.message)` (`ai-chat-widget.tsx:75-79`). | `route/ai/chat.ts:113-130`; `aiCompletionSchema` `dto/ai/chat.ts:18-26` (**`messages` 1..100, each `content` 1..100 000**, `featureKey` ≤50, `provider` enum); system messages merged server-side (`service/domain/ai/ai-chat.ts:72-85`); rate limit 30/min pathKey `ai:chat:completion`; SSE events identical to §1.9 (`done` data lacks `id`, `ai-chat.ts:297-306`) |

### 2.6 Error codes / literals referenced in `Calendar`
- Server code compared: `CALENDAR_SUBSCRIPTION_NOT_FOUND` (`shared/constant/api.ts:24`, `entities/calendar/api.ts:152`).
- Client-only codes: `AI_PROVIDERS_FAILED`, `AI_MODELS_FAILED`, `AI_MODELS_REFRESH_FAILED`, `AI_REQUEST_FAILED`, `AI_NO_STREAM`, `AI_STREAM_ERROR` (`entities/ai/api.ts:38,48,59,87,90,110`).
- Status handling: `res.ok` (`api.ts:30`, `proxy.ts:22`, `ai/api.ts:38,48,59`), `status === 204` (`api.ts:59`). No 401/429 special-casing; server `error.message` rendered in toasts (`query.ts:53,78,103,116,140,153,165,177`).
- Literal values compared from server data: provider `status === 'active'`, event `status` lowercase set, `groupId` null/''.

### 2.7 Timing assumptions (Calendar)
- Every server action = `GET /api/auth/get-session` + the actual call (`api.ts:47-50`); proxy adds one more `get-session` per `/calendar` navigation. No client timeouts.
- Queries retry once; mutations optimistic for event update/delete and group update.
- Initial page: `getEventsAction(monthGridRange)` + `getGroupsAction()` in parallel (`page.tsx:14`).
- AI chat: `useCalendarEvents(today−12mo, today+12mo)` on panel open.
- No `Cache-Control`/`ETag` use except the ICS `download` link.

---

## 3. Mismatches / fragile dependencies (ordered by impact)

1. **[HIGH][mail] Upload inline flag field name mismatch.** Consumer sends multipart field `isInline` (`mail/entities/upload/mutations.ts:12`); server reads `formData.get('inline')` (`b-hub/route/mail/upload.ts:35`). Result: every upload is processed as a regular attachment (attachment mime/extension rules, 25 MB limit, `isInline: false` in response, sent as a normal attachment by `resolveForSend` `service/domain/mail/mail-upload.ts:141-163`). Inline images still display because the consumer embeds `result.url`. A refactor must keep accepting `inline` (or add `isInline`) — do not "fix" to `isInline` only.
2. **[HIGH][Calendar] AI context date range exceeds server cap.** Consumer requests `GET /api/calendar/events/range` for today −12 … +12 months (`Calendar/widgets/ai-chat/ai-chat-widget.tsx:34-36`, `shared/constant/ai.ts:12-13`, ≈ 25 months) while server rejects spans > 366 days with `CALENDAR_INVALID_DATE_RANGE` (`b-hub/route/calendar/event.ts:17,79-80`). The query errors (retry 1) and the AI context falls back to `[]`/"(일정 없음)". Currently broken; any refactor must not lower the cap further.
3. **[HIGH][Calendar] Strict AI zod schemas vs nullable/extensible server fields.** `aiProviderSchema.displayName: z.string()` and `aiModelSchema.displayName: z.string()` (`Calendar/entities/ai/types.ts:9,15`) but b-hub returns `displayName: string | null` (`dto/ai/provider.ts:48`, `dto/ai/model.ts:7`, `service/domain/ai/ai-connection.ts:95`, `providers/anthropic-provider.ts:109`, `providers/codex-provider.ts:120`). A single `null` makes the whole array parse throw → AI toggle hidden / model list empty. Same for the `provider`/`status` enums: adding a new provider or status value on the server breaks the Calendar AI panel entirely.
4. **[MED][Calendar] DELETE responses are not validated.** `serverFetch` returns `undefined` only for 204 and otherwise `res.json()`s without checking `success` (`entities/calendar/api.ts:59-61`); `deleteEventAction`/`deleteGroupAction` (`:112-115,144-147`) discard the body. Server errors `CALENDAR_EVENT_NOT_FOUND` (404) and `CALENDAR_GROUP_HAS_EVENTS` (409, `service/domain/calendar/calendar.ts:439`) are swallowed → success toast, optimistic removal, then refetch restores. Contract to keep: **204 with empty body on success**; a 200 with an empty body would make `res.json()` throw.
5. **[MED][mail] 30 s client timeout on long-running mutations.** `apiFetch`/`apiFetchFormData` abort after 30 000 ms (`mail/shared/lib/api.ts:36,62`), including `POST /mail/sync`, `POST /mail/sync/historical`, `POST /mail/messages/send`, `POST /mail/uploads`. Server keeps working after the abort; consumer reports failure (`app/[locale]/mail/page.tsx:106,140`). Refactors that add latency (extra provider round-trips, serial folder syncs) will surface as user-visible sync failures.
6. **[MED][mail] Unbounded `context` in chat stream.** Consumer builds `context` from up to 20 folder messages or up to 5 000 same-domain messages' full bodies with no truncation (`widgets/ai-chat/ai-prompt.ts:21-43`, `use-mail-context.ts:10,45-51`); server caps `context` at 100 000 chars (`dto/ai/chat.ts:6`) → `VALIDATION_ERROR` 400 before streaming, shown as error text. Keep the cap ≥ 100 000 and keep the pre-stream error as the JSON envelope (consumer parses it, `use-chat-stream.ts:98-101`).
7. **[MED][both] SSE wire format is load-bearing.** Both parsers require `Content-Type: text/event-stream`, `\n\n` frame delimiter, event names exactly `delta` / `done` / `error`, `delta` data `{ "text": string }`, `error` data `{ "code": string, "message": string }` (`mail/entities/ai/use-chat-stream.ts:96-141`; `Calendar/entities/ai/api.ts:83-116`). mail additionally uses `done.content` when non-empty to overwrite the accumulated text (`:130-134`); Calendar ignores `done` data. Calendar drops frames that have no `data:` line (`api.ts:29`), so a bare `event: done` without data would never end its loop until EOF. Pre-stream failures must be JSON envelopes; a 200 non-SSE response is treated as an error by Calendar (no `res.ok` check) and by mail (`content-type` check).
8. **[MED][mail] Bulk message actions vs server id cap.** Consumer sends selected ids un-chunked (`widgets/list/list.tsx:150` etc.); server `mailMessageIdsSchema` caps at 100 (`dto/mail/message.ts:62`). >100 → 400 → optimistic rollback + toast. Keep cap ≥ 100 (raising is safe).
9. **[LOW][mail] Response-type drift the consumer tolerates today (do not regress the parts actually read):** `POST /mail/accounts` typed `MailAccount` but only **`id` is read** (`account-manager.tsx:63`, `gmail-connect-card.tsx:49`) — server returns `{ id }` only; `PATCH /mail/accounts/:id` typed `MailAccount`, server `{ updated: true }`; `DELETE /mail/accounts/:id`, `mark-read/unread/star/unstar/move/delete`, `DELETE /mail/uploads/:id` typed `{ success }`/`null`, server `{ updated: true }`/`{ deleted: true }` — none read. `mark-all-read` `{ updated: number }` matches. `POST /mail/messages/send` `{ messageId }` matches but is unread.
10. **[LOW][mail] Double mark-read on open.** Server marks a message read as a side effect of `GET /mail/messages/:id` (`service/domain/mail/mail-message.ts:136-138`) and the consumer also `POST`s `mark-read` when `!isRead` (`widgets/detail/detail.tsx:121-126`) with optimistic unread decrement. Removing either path alone is safe; changing the GET to return already-`isRead:true` would make the consumer skip its POST (still fine).
11. **[LOW][mail] Extra fields returned beyond consumer types** (safe to drop, unsafe to rename): list/thread/search rows include `remoteMessageId, messageIdHeader, threadId, inReplyTo, referencesHeader, ccAddresses, bccAddresses, uid, createdAt, updatedAt` (`compose/mail.ts:381-405`); detail includes the full row + attachments with `remoteAttachmentId, contentId, r2Key, createdAt`; folders include `remoteFolderId, uidValidity, syncCursor, createdAt, updatedAt`; sync status includes `accountId`, `latestLog`; AI providers include `id (number), authType, statusDetail, lastUsedAt, lastRefreshedAt, modelsFetchedAt, createdAt, updatedAt`; AI models include `id, providerId, metadata, fetchedAt`; calendar groups include `userId, createdAt, updatedAt`; calendar events include `uid, transp, priority, categories, rrule, sequence`.
12. **[LOW][mail] Enumerated string values are contract:** folder `type` (`'inbox'`, `'archive'`, plus `'sent'|'drafts'|'trash'|'spam'|'custom'`; consumer's `'starred'` is virtual), account `lastSyncStatus` (`'error'`, `'success'`; DB default `'pending'` is treated as "neither"), `historicalSync.status` (`'running'|'paused'|'completed'|'error'`), account `provider` (`'gmail'|'naver'|'daum'|'imap'`), AI `status === 'active'`, AI provider names.
13. **[LOW][mail] OAuth redirect query contract.** `?success=true&email=` / `?error=<code>` (`b-hub/route/mail/account.ts:206,212,217`) with consumer mapping for `oauth_denied`, `MAIL_OAUTH_STATE_INVALID`, `MAIL_OAUTH_EXCHANGE_FAILED`, `UNAUTHORIZED`, `SERVICE_NOT_CONFIGURED` (`widgets/account-settings/account-manager.tsx:43-49`); other server codes (`MAIL_OAUTH_ACCOUNT_MISMATCH`, `MAIL_ACCOUNT_ALREADY_EXISTS`, `MAIL_ACCOUNT_LIMIT_EXCEEDED`, `'unknown'`) fall to a generic toast. `redirect` must satisfy `isAllowedRedirect` (`lib/url-validator.ts:26-38`). Note that an unauthenticated hit on `/connect/google` returns a JSON 401 page rather than a redirect.
14. **[LOW][mail] `SyncStatus` type drift:** consumer types `historicalSync.progressPercent: number`, `totalEstimate: number`, `startedAt: string` (`shared/lib/types-params.ts:23-29`) while server sends `progressPercent: number | null`, `totalEstimate: number | null` (`mail-sync.ts:409-413`); `HistoricalSyncResult.totalEstimate` likewise nullable (`:354,372`). Only `status`, `syncedCount`, `totalEstimate` are read; `null` flows into progress state.
15. **[LOW][mail] Historical sync state machine coupling.** Consumer auto-resumes when server status is `running`/`paused` without sending a cursor (`use-historical-sync.ts:112-116`); server discards a `running` session (marks `error`, starts fresh `mail-sync.ts:293-296`) and resumes a `paused` one from its stored cursor (`:329`). Consumer detects "stalled" when `cursor` does not advance between batches (`:79-81`) — server must advance/clear the cursor each batch and set `hasMore=false` exactly when `cursor` is absent (`:374-375`).
16. **[LOW][Calendar] `updateEventAction` all-day end-date shift depends on `isAllDay` being present in the same partial** (`entities/calendar/api.ts:97-100`). Partial updates carrying `endDate` but not `isAllDay` for an all-day event send an inclusive date; server stores it as-is (`toEventPatch` `dto/calendar-event-mapper.ts:90-95`). Server must keep the exclusive-end convention in `toEventResponse` (`:133-134`) for all-day events; changing it breaks the consumer's −1 day display shift (`api.ts:12,14-17`).
17. **[LOW][Calendar] `PATCH /api/calendar/groups/:id` may return `data: null`** (`route/calendar/group.ts:54-55` returns `getGroupById` result) → `toCalendarGroup(null)` throws in the consumer (`api.ts:141`). Only reachable in a delete/update race; keep returning the row.
18. **[LOW][Calendar] `SubscriptionResponse.name` typed `string`, server `string | null`** (`types.ts:197` vs `service/domain/calendar/calendar.ts:43`, `route/calendar/subscription.ts:39`). Consumer handles it via `defaultName ?? CALDAV_DEFAULT_NAME` (`caldav-profile-dialog.tsx:133`).
19. **[LOW][both] `/api/auth/get-session` raw shape.** mail requires `body.user` (`mail/shared/auth/session.ts:31`), Calendar requires `body.session` (`Calendar/proxy.ts:27`, `entities/calendar/api.ts:32`); Calendar's client `useSession` is truthiness-only. The route is better-auth's own handler (`route/auth/oauth.ts:11`) — keep it unwrapped (no `{success,data}` envelope). Calendar issues this call before **every** server action (`api.ts:47-50`).
20. **[LOW][both] Server `error.message` strings are user-visible** (`mail/shared/lib/query-provider.tsx:18`; `Calendar/entities/calendar/query.ts:53,78,103,116,140,153,165,177`; `Calendar/widgets/ai-chat/ai-chat-widget.tsx:78`). Rewording `lib/error-message.ts` is visible to users, not breaking. Neither consumer reads `details`.
21. **[LOW][both] Hosting / cookie coupling.** Production cookies are scoped to `.gumyo.net` (`service/shared/auth-provider.ts:53-58`) and CORS allows only `gumyo.net`/`hyns.dev` (sub)domains (`index.ts:24`); Calendar's `SITE_URL` is `https://calendar.gumyo.net` (`Calendar/app/layout.tsx:10`). `signIn.social` `callbackURL`s (`${origin}/mail`, `${origin}/calendar`) must remain trusted origins. The CalDAV proxy host `caldav.hyns.dev` (`Calendar/shared/constant/caldav.ts:10`) must keep forwarding `/caldav/<token>/…` unchanged; `/caldav/:token/` and `/caldav/:token/default/` are embedded in installed Apple profiles.
22. **[LOW][mail] `AI_CHAT_FAILED` fallback code is never emitted by the server** (SSE `error` uses `AI_COMPLETION_FAILED` or the AppError code, `route/ai/chat.ts:42`); server only logs `AI_CHAT_FAILED` internally (`service/domain/ai/ai-chat.ts:90`). Cosmetic.
23. **[LOW][Calendar] Empty assistant turn can reach the server.** After an aborted stream the widget keeps the trailing `{role:'assistant', content:''}` (`ai-chat-widget.tsx:76` returns before `dropTrailingEmptyAssistant`), so the next send violates `content.min(1)` (`dto/ai/chat.ts:15`) → 400 shown as toast. History is also unbounded vs `messages.max(100)` (`:21`).
24. **[LOW][mail] Rate-limit exposure.** `handleSyncAll` fires one `POST /mail/sync` per account in parallel every ≥ 1 min plus manual/pull-to-refresh (`app/[locale]/mail/page.tsx:118-142`, `widgets/list/list.tsx:80`); limit is 20/min per user per path (`compose/mail.ts:811`) and accounts are capped at 10 (`mail-account.ts:7`). Consumer ignores `X-RateLimit-*` and has no backoff on 429 (shows generic "sync failed").
25. **[LOW][mail] `apiFetch` requires a JSON body on every response** (`shared/lib/api.ts:22`), including DELETEs and 2xx; a 204 or non-JSON error page (e.g. platform 502 HTML) becomes a `SyntaxError`. All currently consumed mail/AI routes return JSON envelopes — keep it that way (no 204s in `/api/mail/*` or `/api/ai/*`).
26. **[INFO] Dead/unused surface.** Consumer-side: `mail/shared/lib/api.ts:68-83 serverFetch` (no callers), `Calendar/shared/constant/api.ts:4 EVENTS.DETAIL` (no callers), `CreateDraftParams.replyToMessageId/inReplyTo/references` never sent, `AiSession.promptIds` never used. Server-side routes not touched by these two consumers: `GET /api/mail/accounts/:id`, `GET /api/calendar/events` (month), `POST /api/calendar/events` (`createEventSchema`), `PUT /api/calendar/events/:uid`, `GET /api/calendar/events/detail/:uid`, `POST /api/ai/sessions/:id/messages` (non-stream), `POST /api/ai/completions` (non-stream), `/api/ai/prompts/*`, `/api/ai/attachments/*`, AI `PATCH/DELETE /api/ai/providers/:id`, `POST /api/ai/providers`.

---

## 2. bblog · RESUME

# Consumer contract inventory — bblog · RESUME → b-hub

기준: 2026-09-06 실제 파일 (bblog `7e65fa7`, RESUME `555e05f`, b-hub `6e6fed2`).
경로 접두: `BB` = /Users/hyunseokbyun/development/bblog, `RS` = /Users/hyunseokbyun/development/RESUME, `HUB` = /Users/hyunseokbyun/development/b-hub, `UP` = `HUB/deploy/upload-server`.

---

## 0. 공통 전제 — 두 소비자가 모두 기대는 b-hub 불변 조건

| 항목 | 현재 동작 | 위치 |
|---|---|---|
| 마운트 | `/api` 하위. blog: `/blog/posts`(post **와** thumbnail 이중 마운트, post 먼저) · `/blog/comments` · `/blog/categories` · `/blog/tags` · `/blog/messages` · `/blog/images`; resume: `/resume` | `HUB/index.ts:64`, `HUB/route/index.ts:127-186, 278-285` |
| CORS | `/api/*` 만. Origin 호스트가 `gumyo.net`/`hyns.dev` 자신 또는 서브도메인(비프로덕션은 localhost 추가)이면 그 Origin 을 echo, `credentials: true`. hono `cors` 기본 allowMethods 에 GET/HEAD/PUT/POST/DELETE/PATCH 포함 | `HUB/middleware/index.ts:17-37`, `HUB/index.ts:24` |
| 성공 봉투 | `{ success: true, data }` / 목록 `{ success: true, data: T[], pagination: { page, limit, total, totalPages } }` | `HUB/lib/api-response.ts:30-42` |
| 에러 봉투 | `{ success: false, error: { code, message, details? } }` — `details` 는 비프로덕션만. AppError 는 `STATUS_MAP` 상태코드, 그 외 500 `INTERNAL_ERROR` | `HUB/lib/api-response.ts:44-51`, `HUB/lib/with-error-handling.ts:9-26`, `HUB/lib/error.ts:11-132` |
| **Zod 검증 실패 응답은 봉투가 아님** | `hono-openapi@1.3.0` `validator` → `@hono/standard-validator@0.2.3` 이 `withErrorHandling` 앞단에서 `{ data, error: <issues[]>, success: false }` **400** 을 직접 반환. `error.code`/`error.message` 문자열 없음 | `HUB/node_modules/hono-openapi/dist/index.js:509-518`, `HUB/node_modules/@hono/standard-validator/dist/index.mjs:113-140` |
| 세션 정규화 | `auth.api.getSession({ headers })` → `{ user: { id, name, email, role: string \| null, image } }` 또는 null. admin = `role === 'admin'` | `HUB/compose/shared.ts:35-47` |
| `GET /api/auth/get-session` | better-auth 1.6.23: 세션 없으면 **200 + body `null`**, 있으면 `{ session, user }`(user 에 admin 플러그인 `role`) | `HUB/node_modules/better-auth/dist/api/routes/session.mjs:189, 198-201`, `HUB/route/auth/oauth.ts:11` |
| 쿠키 도메인 | 프로덕션에서 `crossSubDomainCookies` `.gumyo.net`; trustedOrigins `*.gumyo.net`·`*.hyns.dev`·`*.seok.dev` + `TRUSTED_ORIGINS` | `HUB/service/shared/auth-provider.ts:18, 52-58` |
| 날짜 직렬화 | blog 테이블 `created_at/updated_at` 은 `datetime`, `resumes.updated_at` 은 `timestamp(fsp 3)` → Drizzle `Date` → `c.json` 으로 ISO 8601 문자열 | `HUB/db/schema.ts:133-134, 151-152, 208-209, 220-221, 635-638` |
| 이미지 공개 URL | `storageService.getUrl(key)` = `${R2_CUSTOM_DOMAIN ?? R2_CUSTOME_DOMAIN ?? 'https://blogimg.gumyo.net'}/${key}`; 메시지 이미지는 `https://blogimg.gumyo.net/${r2Key}` 하드코딩 | `HUB/compose/shared.ts:60-64`, `HUB/service/shared/storage.ts:48`, `HUB/compose/blog.ts:327, 423` |

---

## 1. bblog (blog.gumyo.net)

### 1.1 기반 설정

| 항목 | 내용 | 위치 |
|---|---|---|
| API base | `process.env.NEXT_PUBLIC_API_URL \|\| 'https://hub.gumyo.net'` — **폴백 호스트가 `api.gumyo.net` 이 아님** | `BB/lib/api/client-fetch.ts:3`, `BB/lib/api/client.ts:4`, `BB/lib/auth/session.ts:4`, `BB/entities/image.client.ts:8` |
| 썸네일 URL | `${process.env.NEXT_PUBLIC_API_URL}/api/blog/posts/${id}/thumbnail` — 폴백 없음 | `BB/app/(blog)/article/[id]/page.tsx:20`, `BB/app/sitemap.ts:13` |
| 클라 fetch | `clientFetch<T>(path, init)`: `${API_URL}${path}`, **항상 `credentials: 'include'`**, `!res.ok` → `res.json().error.message ?? 'API Error: {status}'` 로 `Error` throw, 성공 시 `json.data` 반환. `clientFetchRaw` 는 미사용 | `BB/lib/api/client-fetch.ts:18-54` |
| 서버 fetch | `serverFetchData` / `serverFetchPaginated`: `cookies().toString()` 을 `Cookie` 헤더로 전달, `next: { revalidate, tags }` + `cache`, `!res.ok` 면 throw(→ `notFound()` 로 연결되지 않음), `json.data` / `json.pagination` 읽음 | `BB/lib/api/client.ts:12-17, 27-75` |
| 서버 세션 | `GET {API}/api/auth/get-session` + `Cookie`, `cache: 'no-store'`; `!ok` 또는 `!data.user` → null; 타입 `user.{id, name, email, role, image}` | `BB/lib/auth/session.ts:6-39` |
| 클라 auth | `createAuthClient()` baseURL 없음 → same-origin `/api/auth/*` → **Next rewrite 로 hub 프록시** (`/api/auth/:path*` → `${NEXT_PUBLIC_API_URL}/api/auth/:path*`) | `BB/lib/auth/auth-client.ts:3`, `BB/next.config.ts:14-21` |
| next/image | `remotePatterns` `https://*.gumyo.net` (blogimg.gumyo.net 포함) | `BB/next.config.ts:6-13` |
| 캐시 태그 / 쿼리 키 | `CACHE_TAG` = categoryList · tagList · mainPostLists; `QUERY_KEY` | `BB/lib/constants.ts:13-49` |
| TanStack staleTime | 60_000 | `BB/lib/providers/tanstack-query-provider.tsx:6` |
| 로그 사용자 | `LOG_USER_ID = 'qvYQiIyr480ya9GMqUhuxENjnfLBrvxS'` (메시지 API 경로에 박힘) | `BB/lib/constants.ts:116` |

### 1.2 Posts

| 엔드포인트 | 호출 위치 | 인증 | 요청 | 소비자가 읽는 응답 | 캐시 | 에러 처리 | b-hub 구현 |
|---|---|---|---|---|---|---|---|
| `GET /api/blog/posts?limit=100&isPublished=true&isHide=false` | `BB/entities/post.ts:32-38` `getAllPosts` ← `BB/app/sitemap.ts:5` | 없음 | 쿼리 고정 | `data[].postId`, `data[].updatedAt`(sitemap `lastModified`, 문자열) | `revalidate 86400`, tag `mainPostLists` | `!ok` → throw (sitemap 생성 실패) | `HUB/route/blog/post.ts:19-38`; `dto/blog/post.ts:4-5` limit `max(100)` |
| `GET /api/blog/posts?page&limit[&keyword][&categoryId][&tagId]&isPublished&isHide&isNotice` | `BB/entities/post.ts:40-67` `getPostList` ← `BB/app/(blog)/page.tsx:8` (limit 3 + `isNotice=true` / limit 6), `BB/app/(blog)/article/page.tsx:32` (URL `searchParams` 를 그대로 spread, limit 기본 12) | 없음 | `page = floor(offset/limit)+1`(50); boolean 은 `String(bool)` → `'true'/'false'`(57-59); keyword/categoryId/tagId 는 truthy 일 때만 | `data[]` → PostCard: `postId, isNotice, isHide, categoryName, updatedAt, title, tags[]{tagId, tag}` (`BB/widgets/post/post-card.tsx:17-40`, `post-tag-list.tsx:16-31`); `pagination.total`(66) → `totalPages = ceil(total/12)` (`article/page.tsx:34`) | `revalidate 60`, tag `mainPostLists` | throw | `HUB/route/blog/post.ts:19-38` → `service/domain/blog/post.ts:60-78` → `compose/blog.ts:13-72` (title LIKE, category/tag/isPublished/isHide/isNotice eq, createdAt·postId desc). boolean 쿼리는 `z.enum(['true','false'])` (`dto/blog/post.ts:9-20`), 그 외 값 400 |
| `GET /api/blog/posts/:id` (서버) | `BB/entities/post.ts:69-75` `getPost` ← `BB/app/(blog)/article/[id]/page.tsx:16` (generateMetadata), `:66` (page) | 없음 | path id | `data.post.{title(25,74), description(22,70), tags[].tag(21,77), categoryName(58,74), createdAt(74), postId(81)}` | `revalidate 2592000` + tag `mainPostLists`; 페이지 `export const revalidate = 2592000`(12) | `!post → notFound()`(18, 68) — **hub 404 는 `serverFetchData` 가 throw 하므로 notFound 미도달** | `HUB/route/blog/post.ts:40-59` (404 `BLOG_POST_NOT_FOUND`); `service/domain/blog/post.ts:80-85` **호출마다 `views +1`**; `isHide/isPublished` 무필터 |
| `GET /api/blog/posts/:id` (클라) | `BB/entities/post.client.ts:10-19` `useGetPost` ← `BB/app/(editor)/edit/[id]/page.tsx:19` | 없음(쿠키는 전송) | | `data.post.{title, description, categoryId, tags[].tagId}` (42-46) | TanStack | `isLoading` 만 | 동일 (편집 진입도 views +1) |
| `POST /api/blog/posts` | `BB/entities/post.client.ts:21-45` ← `BB/app/(editor)/write/page.tsx:16-29` | admin 세션 쿠키 | JSON `{ title: string, description: string, categoryId: number, tagIds: number[], isPublished: boolean }` | 무시 (hub `{ postId }`) | 성공 후 same-origin `/api/revalidate` [`mainPostLists`], `router.push('/article')` | `!ok` → toast '포스트 생성에 실패했습니다' | `HUB/route/blog/post.ts:61-81` 401/403; `dto/blog/post.ts:27-33` (title 1..255, description min 1, categoryId positive int, tagIds default [], isPublished default false) |
| `PUT /api/blog/posts/:id` | `BB/entities/post.client.ts:47-80` ← `BB/app/(editor)/edit/[id]/page.tsx:20-33` | admin | 동일 5 필드 (항상 전부 전송) | 무시 (`{ postId }`) | 성공 후 `/api/revalidate` + `/api/revalidate/path` `/article/{id}`, push | toast | `HUB/route/blog/post.ts:83-108` 401/403/404; `dto/blog/post.ts:35-44` 전부 optional (`isHide/isNotice/isComment` 도 받으나 bblog 미전송); `compose/blog.ts:133-155` `tagIds` 있으면 전체 재설정 |

### 1.3 Thumbnail (OG 이미지)

| 엔드포인트 | 호출자 | 기대 | b-hub 구현 |
|---|---|---|---|
| `GET /api/blog/posts/:id/thumbnail` | bblog 코드가 fetch 하지 않음. **크롤러/브라우저**가 메타데이터 URL 로 요청: `openGraph.images[{ url, width: 1200, height: 630 }]`, `twitter.images{ url, alt }` (`BB/app/(blog)/article/[id]/page.tsx:20, 38-51`), sitemap `images[]` (`BB/app/sitemap.ts:13`) | 인증 없음, `Content-Type: image/png`, 1200x630, 장기 캐시 | `HUB/route/blog/thumbnail.ts:33-46` `getById`(→ **views +1**, `service/domain/blog/post.ts:83`) → satori/resvg → `Content-Type: image/png`, `Cache-Control: public, max-age=2592000, immutable` (182-187). 없는 id → JSON 404 `BLOG_POST_NOT_FOUND` (이미지 아님). bblog 는 `views` 를 렌더하지 않음(타입만 `BB/entities/post.ts:13`) |

### 1.4 Categories / Tags

| 엔드포인트 | 호출 위치 | 인증 | 요청 | 읽는 응답 | 캐시 | b-hub 구현 |
|---|---|---|---|---|---|---|
| `GET /api/blog/categories` (서버) | `BB/entities/category.ts:11-17` ← `BB/app/(blog)/article/page.tsx:20, 31` | 없음 | | `data.categories[].{categoryId, category}` (`isHide` 는 타입만) → generateMetadata `==` 비교(22), ArticleFilter (`BB/widgets/post/article-filter.tsx:11, 52-58`) | `revalidate 2592000`, tag `categoryList` | `HUB/route/blog/category.ts:34-45`; `compose/blog.ts:498-501` **`isHide=false` 만** |
| `GET /api/blog/categories` (클라) | `BB/entities/category.client.ts:8-17` ← `BB/widgets/category/category-select.tsx:16`, `BB/widgets/post/post-form.tsx:43` | 없음 | | `categoryId, category` | TanStack | 동일 |
| `POST /api/blog/categories` | `BB/entities/category.client.ts:19-40` ← `category-select.tsx:26-34` | admin | JSON `{ category: string }` | **`data.categoryId`** (`category-select.tsx:29`) — hub 는 row 전체 `{ categoryId, category, isHide }` | 성공 후 `/api/revalidate` [`categoryList`] + invalidate | `HUB/route/blog/category.ts:47-64` 401/403; `dto/blog/category.ts:3-5` 1..255; `compose/blog.ts:502-505` |
| `GET /api/blog/tags` (서버) | `BB/entities/tag.ts:10-16` ← `article/page.tsx:20, 31` | 없음 | | `data.tags[].{tagId, tag}` | `revalidate 2592000`, tag `tagList` | `HUB/route/blog/tag.ts:33-44`; `compose/blog.ts:510-512` 전체 |
| `GET /api/blog/tags` (클라) | `BB/entities/tag.client.ts:8-17` ← `BB/widgets/tag/tag-select.tsx:17`, `post-form.tsx:42` | 없음 | | `tagId, tag` | TanStack | 동일 |
| `POST /api/blog/tags` | `BB/entities/tag.client.ts:19-40` ← `tag-select.tsx:35-42` | admin | JSON `{ tag: string }` | **`data.tagId`** (`tag-select.tsx:38`) | `/api/revalidate` [`tagList`] | `HUB/route/blog/tag.ts:46-63`; `dto/blog/tag.ts:3-5`; `compose/blog.ts:513-516` row 전체 |

### 1.5 Comments

| 엔드포인트 | 호출 위치 | 인증 | 요청 | 읽는 응답 | 에러 처리 | b-hub 구현 |
|---|---|---|---|---|---|---|
| `GET /api/blog/comments?postId={n}` (클라) | `BB/entities/comment.client.ts:8-29` ← `BB/widgets/comment/comment-section.tsx:16` (IntersectionObserver 로 `enabled`) | 없음(쿠키 전송) | query `postId` (숫자) | `data.comments[]` → `commentId, postId, userId, comment, isHide, userName, userImage, createdAt` (`BB/widgets/comment/comment-item.tsx:37-38, 42, 47, 56, 68-75, 118-119`), `comments.length` (`comment-section.tsx:39`). `comment` falsy → '비밀글입니다.'(119) | `isLoading` | `HUB/route/blog/comment.ts:19-32`; `dto/blog/comment.ts:3-5` postId positive int 필수; `compose/blog.ts:173-197` **isHide 댓글 본문 `''` 마스킹**, `userName ?? ''`, createdAt desc |
| (서버) 동일 | `BB/entities/comment.ts:16-21` (`cache: 'no-store'`) | | | 타입 `CommentWithUser` 만 사용 | | **호출처 없음** (휴면) |
| `POST /api/blog/comments` | `BB/entities/comment.client.ts:39-58` ← `BB/widgets/comment/comment-form.tsx:24-35` | 로그인 세션(역할 무관) | JSON `{ postId: number, comment: string, isHide: boolean }` | 무시 (`{ commentId }`) | 성공: same-origin `/api/revalidate/path` `/article/{postId}` + invalidate + toast; 실패 toast | `HUB/route/blog/comment.ts:34-53` 401; `dto/blog/comment.ts:11-15` comment 1..5000, isHide default false |
| `PATCH /api/blog/comments/:id` | `BB/entities/comment.client.ts:60-79` ← `comment-item.tsx:44-52` | 로그인 + 작성자 | JSON `{ comment, isHide }` (undefined 는 JSON 에서 탈락) | 무시 (`{ success: true }`) | toast | `HUB/route/blog/comment.ts:55-79`; 비소유자/없음 → 404 `BLOG_COMMENT_NOT_FOUND` (`service/domain/blog/comment.ts:41-47`); `dto 17-20` 둘 다 optional |
| `DELETE /api/blog/comments/:id` | `BB/entities/comment.client.ts:81-98` ← `comment-item.tsx:54-57` | 로그인 + 작성자 | 바디 없음 | 무시 | toast | `HUB/route/blog/comment.ts:81-103` |

UI 노출 조건은 클라이언트 세션 `session.user.id === comment.userId` (`comment-item.tsx:42`) — 서버 소유권 검사와 이중.

### 1.6 Images — 업로드 3단계 (prepare → upload-server multipart → complete)

1. **prepare** — `POST {API}/api/blog/images/prepare` (`BB/entities/image.client.ts:41-46`): raw `fetch`, `credentials: 'include'`, 헤더·바디 없음. `!ok` → `Error('Failed to prepare image upload')`. 읽음 `json.data.{ assetId, s3Key, uploadToken, uploadUrl }` (48-54; `expiresAt` 는 타입만, 미사용).
   - hub `HUB/route/blog/image.ts:39-57` admin 401/403 → `service/domain/blog/blog-image.ts:99-105`: `assetId = uuid`, `s3Key = ${assetId}.webp`, `uploadToken = ${expiresAt}.${base64url(userId)}.${HMAC-SHA256(secret, assetId.s3Key.userId.expiresAt)}` (65-70, TTL 10분 63), **`uploadUrl = env.UPLOAD_SERVER_URL ?? ''`** (`HUB/compose/blog.ts:495`), `expiresAt` epoch ms. 응답 스키마 `dto/blog/image.ts:3-9`.
2. **upload-server** — `POST {uploadUrl}` (`BB/entities/image.client.ts:48-57`): `FormData` 필드 **`file`, `assetId`, `s3Key`, `uploadToken`**; `credentials` 없음, 커스텀 헤더 없음. `!ok` → `Error('Failed to upload image')`. 읽음 **`json.url`** (59-61).
   - `UP/index.ts:82-106` 라우트는 `/upload-blog-image` (즉 `UPLOAD_SERVER_URL` 은 이 경로까지 포함한 전체 URL 이어야 함). 필드 누락 → 400 `{ success: false, error }`. `UP/blog-image-handler.ts:40-48`: mime allowlist `image/jpeg|png|gif|webp` (`UP/index.ts:46`), 10MB (`UP/index.ts:45`), `s3Key === ${assetId}.webp`. webp 변환(56) → `getMetadata` (`UP/index.ts:39-42`, 실패 시 `width/height = 0`) → R2 put (59) → **`POST {HUB_BASE_URL}/api/blog/images/complete`** JSON `{ assetId, s3Key, uploadToken, sizeBytes, width, height }` (64-75; Authorization 없음; `HUB_BASE_URL` 기본 `https://api.gumyo.net` `UP/index.ts:12`) → `completeData.data?.url` (83-84) → 응답 **`{ success: true, url }`** (`UP/index.ts:105`); 처리 실패 500 `{ success: false, error }` (103). CORS `UP/index.ts:72-78` (`ALLOWED_ORIGINS` 기본 `https://gumyo.net,https://hyns.dev` + 서브도메인, credentials true).
3. **complete** — hub `HUB/route/blog/image.ts:80-96`: 세션 없음, `validator('json', imageCompleteRequestSchema)` (`dto/blog/image.ts:11-18`: `assetId: z.uuid()`, `s3Key`, `uploadToken`, `sizeBytes` positive int, `width/height` positive int **nullable**) → `blog-image.ts:107-141` 토큰 상수시간 검증(실패 401 `UNAUTHORIZED`), `s3Key !== ${assetId}.webp` → 400 `VALIDATION_ERROR`, `image_assets` insert(mimeType `image/webp`, uploadedBy = 토큰의 userId) → `{ id, url: storage.getUrl(s3Key), mimeType, sizeBytes, width, height }`.

**결과 URL 사용**: mutation 반환 `{ id: assetId, url }` (`image.client.ts:61`) →
- 에디터: `![file.name](url)` 마크다운 삽입 (`BB/features/editor/hooks/use-image-upload.ts:81-95`; 자체 제한 `image/*`·10MB 47-56)
- 로그 폼: `imageIds` 에 `id`, 미리보기에 `url` (`BB/widgets/log/log-message-form.tsx:41-49, 72`)
- 갤러리: 클릭 시 `![](url)` 클립보드 복사 (`BB/widgets/post/post-images.tsx:37-40, 59`)

| 엔드포인트 | 호출 위치 | 인증 | 읽는 응답 | b-hub 구현 |
|---|---|---|---|---|
| `GET /api/blog/images` (클라) | `BB/entities/image.client.ts:26-35` ← `post-images.tsx:11` | admin | `data.images[].{id, url}` (57-60); 타입 `BB/entities/image.ts:4-13` 는 `r2Key, mimeType, sizeBytes, width, height, createdAt: string` 도 선언 | `HUB/route/blog/image.ts:19-37` 401/403; `compose/blog.ts:463-489` **메시지 미첨부 에셋만**, `url = getUrl(r2Key)`, `createdAt` ISO |
| (서버) 동일 | `BB/entities/image.ts:15-20` (`no-store`) | | | **호출처 없음** |
| `DELETE {API}/api/blog/images/:id` | `BB/entities/image.client.ts:69-84` ← `post-images.tsx:29-35` | admin (raw fetch, credentials) | 무시 (`{ id }`) | `HUB/route/blog/image.ts:59-78` → `blog-image.ts:147-155` 404 `NOT_FOUND`, r2Key 가 `${id}.webp`/`blog/${id}.webp` 아니면 403 |

### 1.7 Messages (`/log`)

| 엔드포인트 | 호출 위치 | 인증 | 요청 | 읽는 응답 | b-hub 구현 |
|---|---|---|---|---|---|
| `GET /api/blog/messages/user/{LOG_USER_ID}?page={n}&size=10` | `BB/entities/message.client.ts:9-18` `useInfiniteQuery` ← `BB/widgets/log/log-message-list.tsx:30` | 없음 | `page` = `pageParam`(초기 1), `size` 10 | `data.content[]`, **`data.next`** (`getNextPageParam`, 17). 항목: `id, user.name, createdAt, images[].{id, url}, body` (`log-message-list.tsx:32, 68-116`). ImageModal 은 `url.replaceAll('/thumbnail.webp', '/pc.webp')` (`BB/widgets/log/image-modal.tsx:42`) | `HUB/route/blog/message.ts:19-33`; `dto/blog/message.ts:3-7` page ≥ 1, size 1..100 기본 20; `compose/blog.ts:270-347` `{ content, totalElements, totalPages, prev, next }`, 항목 `{ id, userId, body, replyToId, retweetOfId, createdAt, updatedAt, deletedAt, images[]{ id, url(하드코딩 blogimg), mimeType, width, height }, user{ id, name, image } }` |
| (서버) 동일 | `BB/entities/message.ts:99-103` (`no-store`) | | | | **호출처 없음** |
| `GET /api/blog/messages/user/:userId/profile` | `BB/entities/message.ts:93-97` (`revalidate 3600`) ← `BB/widgets/log/log-page-info.tsx:10` | 없음 | | `image, name, email, createdAt` (21-30) | **`LogPageInfo` 는 어떤 라우트에도 렌더되지 않음** (`BB/app/(blog)/log/page.tsx` 는 `LogPageHeader`). hub `route/blog/message.ts:35-51`, `compose/blog.ts:253-268` `{ id, name, email, image, followersCount, followingCount }` — `createdAt` 없음 |
| `POST /api/blog/messages` | `BB/entities/message.client.ts:20-38` ← `log-message-form.tsx:66-82` | admin | JSON `{ body: string, imageIds: string[] }` (`replyToId/retweetOfId` 타입만) | 무시 (`{ id }`) | `HUB/route/blog/message.ts:53-73` 401/403; `dto/blog/message.ts:13-18` body 1..10000, imageIds default [] |
| `DELETE /api/blog/messages/:id` | `BB/entities/message.client.ts:40-56` ← `log-message-list.tsx:47-52` | admin + 작성자 | | 무시 (`{ success: true, id }`) | `HUB/route/blog/message.ts:75-96`; 비작성자/없음 → 404 `NOT_FOUND`; 소프트 삭제 (`compose/blog.ts:373-377`) |

### 1.8 Auth

| 호출 | 위치 | 읽는 값 / 동작 |
|---|---|---|
| 서버 `GET /api/auth/get-session` (Cookie 전달, no-store) | `BB/lib/auth/session.ts:23-28` | `data.user` 존재 여부; `user.role !== 'admin' → notFound()` (`BB/app/(editor)/layout.tsx:8`); `session.user` 존재만 (`BB/app/api/revalidate/route.ts:9-13`, `BB/app/api/revalidate/path/route.ts:8-12`) |
| 클라 `authClient.getSession()` (rewrite → hub) | `BB/entities/auth.client.ts:9-20` (staleTime 5분, refetchOnWindowFocus) | `session.data.user.{id, role, name, email}` — `BB/widgets/layout/auth-nav.tsx:14, 18`, `BB/widgets/comment/comment-form.tsx:19-22`, `comment-item.tsx:35, 42`, `BB/widgets/log/log-page-header.tsx:13-14, 27-31, 38`, `log-message-list.tsx:28-29, 83` |
| 클라 `signIn.social({ provider: 'github', callbackURL })` | `BB/app/login/page.tsx:15`, `comment-form.tsx:38-41` | POST `/api/auth/sign-in/social` → hub. 요청 Origin/Referer 는 `blog.gumyo.net` → hub trustedOrigins `*.gumyo.net` 필요 (`HUB/service/shared/auth-provider.ts:18`) |
| 클라 `signOut()` | `BB/widgets/layout/auth-nav.tsx:15` | POST `/api/auth/sign-out` |

### 1.9 bblog 자체 ISR 무효화 (hub 계약 아님, 트리거 관계만)

`POST /api/revalidate` (tags ⊂ `CACHE_TAG`) · `POST /api/revalidate/path` (`/article/*` 만) — same-origin, `getServerSession` 통과 필요 (`BB/app/api/revalidate/route.ts:8-41`, `BB/app/api/revalidate/path/route.ts:5-28`). 트리거: post create/update (`post.client.ts:32-36, 58-70`), category/tag create (`category.client.ts:31-36`, `tag.client.ts:31-36`), comment CUD (`comment.client.ts:31-37`).

---

## 2. RESUME (resume.gumyo.net)

### 2.1 기반 설정

| 항목 | 내용 | 위치 |
|---|---|---|
| API base | `process.env.NEXT_PUBLIC_API_URL ?? 'https://api.gumyo.net'` | `RS/shared/constants/api.ts:1` |
| 캐시 | tag `web-resume`, `revalidate 60` | `RS/shared/constants/api.ts:3-5`, `RS/entities/web-resume/web-resume.api.ts:9` |
| fetch | `apiFetch(path, init)`: `fetch(API+path, init)` → `response.json()` → Zod 봉투 union(`{ success: true, data: unknown }` \| `{ success: false, error: { code, message } }`) `.parse` → false 면 `Error('CODE: message')`, true 면 `data` 반환. 상태코드는 보지 않음 | `RS/shared/lib/fetch.ts:4-14` |
| next.config | rewrites·images 없음, `reactCompiler` | `RS/next.config.ts:3-5` |
| 정적 생성 | `dynamicParams = false`, `generateStaticParams` ko/en/jp → 빌드 시 hub 호출, 이후 ISR 60초 | `RS/app/[lang]/layout.tsx:26-28` |
| QueryClient staleTime | 60_000 | `RS/app/tanstack-query-provider.tsx:6-8` |
| OG 이미지 | 자체 생성 (`next/og`) — hub 의존 없음 | `RS/app/[lang]/opengraph-image.tsx` |

### 2.2 엔드포인트

| 엔드포인트 | 호출 위치 | 인증 | 요청 | 읽는 응답 | 에러 처리 | b-hub 구현 |
|---|---|---|---|---|---|---|
| `GET /api/resume/public/web` | `RS/entities/web-resume/web-resume.api.ts:7-10` `fetchWebResume` ← 서버 `RS/app/[lang]/page.tsx:27-28` (`queryClient.fetchQuery` + `HydrationBoundary`), `RS/app/[lang]/layout.tsx:35` (generateMetadata), `RS/app/sitemap.ts:6`; 클라 `useSuspenseQuery` (`web-resume.query.ts:8`) — 하이드레이션 후 stale 시 브라우저가 직접 재조회(credentials 없음, CORS) | 없음 | `next: { revalidate: 60, tags: ['web-resume'] }` | `data.webResume` 전체를 `webResumeDataSchema` 로 parse, **`data.updatedAt: string`** (`RS/entities/web-resume/web-resume.type.ts:76-79`). 사용: `seo.title[lang]`, `seo.description[lang]` (`layout.tsx:36-37`, `page.tsx:45-46`), `profile.email` (`page.tsx:56`), `updatedAt` → JSON-LD `dateModified` (`page.tsx:48`), sitemap `lastModified` (`sitemap.ts:10`); 나머지 전 필드는 `RS/widgets/resume.tsx:47-108` 렌더 | 봉투 `success: false` → throw, Zod 실패 → ZodError throw. `notFound()` 분기 없음 → 빌드/ISR 실패 | `HUB/route/resume/resume.ts:20-35` `successResponse({ webResume: resume.data, updatedAt: resume.updatedAt })`; 없으면 404 `RESUME_NOT_FOUND`; `compose/resume.ts:34-42` `type='web'` **updatedAt desc 1건, `isPublic` 무시** |
| `PATCH /api/resume/web` | `RS/entities/web-resume/web-resume.api.ts:18-24` `updateWebResume` ← `web-resume.query.ts:10-20` ← `RS/widgets/resume.tsx:40-43, 119-126` | **`.gumyo.net` 공유 세션 쿠키 + `role === 'admin'`** (`credentials: 'include'`) | `Content-Type: application/json`, body = `WebResumeData` 전체 (draft, `structuredClone` 후 편집) | `data` 무시 (`{ success: true }`) | `success: false`/ZodError → `toast.error`; 성공 → `invalidateQueries(WEB_RESUME.DETAIL)` + toast | `HUB/route/resume/resume.ts:37-59`: **`validator('json', webResumeDataSchema)`(47) → 401 → 403 → 404** 순. 검증 실패면 미인증이어도 400. `service/domain/resume/resume.ts:37-42` 최신 web 행 `data` 갱신 |
| `GET /api/auth/get-session` | `RS/entities/session/session.api.ts:5-9` ← `session.query.ts:5` ← `RS/widgets/resume.tsx:23` | `credentials: 'include'` | | `!ok → null`; parse `{ user: { id: string, email: string, role?: string \| null } } \| null` (`session.type.ts:3-11`); `session?.user.role === 'admin'` (`resume.tsx:26`) | 파싱 실패 → 쿼리 error(편집 UI 미노출) | better-auth (§0). 클라 전용, 프리페치 없음 |
| `GET /api/resume/public/cv` | **RESUME 코드에 참조 없음** (grep `api/` 결과: `web-resume.api.ts:9, 19`, `session.api.ts:6` 뿐) | | | | | hub 에도 라우트 없음 (`HUB/route/resume/resume.ts` 전체). 폐기 완료 |

### 2.3 스키마 비교 — `RS/entities/web-resume/web-resume.type.ts` vs `HUB/dto/resume/resume-data.ts` `webResumeDataSchema`

| 스키마 | RESUME (줄) | b-hub (줄) | 정의 | 차이 |
|---|---|---|---|---|
| `localizedText` | 3-7 | 79-83 | `{ ko, en, jp: string }` | 없음 |
| `project` | 9-14 | 85-90 | `{ title: L, description: L[], skills: string[], site?: string }` | 없음 |
| `company` | 16-22 | 92-98 | `{ name, period, location, role: L, projects: project[] }` | 없음 |
| `skillGroup` | 24-27 | 100-103 | `{ name: L, items: string[] }` | 없음 |
| `additionalExperience` | 29-32 | 105-108 | `{ period, description: L }` | 없음 |
| `customSection` | 34-37 | 110-113 | `{ label: L, items: additionalExperience[] }` | 없음 |
| `profile` | 39-51 | 115-127 | `{ firstName, lastName: string; firstNameReading, lastNameReading, jobTitle, birthday, location: L; email, github, blog: string; introduce: L[] }` | 없음 |
| `seo` | 53-56 | 129-132 | `{ title, description: L }` | 없음 |
| `labels` | 58-63 | 134-139 | `{ workExperience, projects, skills, etc: L }` | 없음 |
| root `webResumeData` | 65-74 | 141-150 | `{ profile, seo, labels, workExperiences: company[], personalProjects: company, skillGroups: skillGroup[], additionalExperiences: additionalExperience[], customSections: customSection[].default([]) }` | 없음 |
| 응답 래퍼 | 76-79 `{ webResume, updatedAt: z.string() }` | `route/resume/resume.ts:33` `{ webResume: data, updatedAt: Date }` | | hub 는 `Date` → JSON 직렬화로 ISO 문자열. 정합 |

- 필드·타입·optional/default 전부 동형. 양쪽 zod 4 `z.object` 라 미지 키는 strip (PATCH 로 넘긴 여분 키는 조용히 버려짐).
- `customSections.default([])`: hub 는 PATCH 바디에 없어도 허용; RESUME 은 parse 결과(항상 배열)를 그대로 보냄.
- `site`: RESUME 편집 시 `value || undefined` (`RS/features/resume/section.tsx:67`) → JSON 에서 키 탈락 → hub `optional` 과 정합.
- RESUME 의 `WebResumeData` 는 `z.infer`(output) 이므로 `customSections` 필수 배열 — PATCH 바디 형태와 일치.

---

## 3. Mismatches / fragile dependencies

우선순위: **[H]** 리팩토링 시 반드시 유지해야 깨지지 않음 · **[M]** 현재도 어긋나 있거나 우연히 동작 · **[L]** 휴면/참고.

1. **[H] 검증 실패 응답 형태가 봉투와 다름** — `@hono/standard-validator` 가 `{ data, error: issues[], success: false }` 400 을 반환 (`HUB/node_modules/@hono/standard-validator/dist/index.mjs:131-138`). bblog 는 `error.error.message` 가 없어 `'API Error: 400'` 로 폴백 (`BB/lib/api/client-fetch.ts:31-32`); RESUME 은 봉투 Zod parse 자체가 실패해 ZodError 를 던짐 (`RS/shared/lib/fetch.ts:11`) — 둘 다 결국 실패 토스트로 흡수되므로 **상태 400 만 유지**하면 됨. 봉투(`VALIDATION_ERROR`)로 통일하는 변경은 두 소비자에 호환(개선)이지만, 400 이외 상태로 바꾸면 안 됨.

2. **[H] bblog 게시글 상세 404 → `notFound()` 미도달** — `serverFetchData` 가 `!res.ok` 에서 throw (`BB/lib/api/client.ts:46-50`) 하므로 `BB/app/(blog)/article/[id]/page.tsx:16-18, 66-68` 의 `if (!post) notFound()` 는 hub 가 200 + `data.post` falsy 를 줄 때만 동작. 현재 hub 는 없는 글에 404 JSON (`HUB/route/blog/post.ts:52-55`) → Next 에러 페이지(500). 리팩토링으로 "200 + null" 로 바꾸면 오히려 bblog 동작이 바뀜(404 페이지로). **현 동작(404 JSON) 유지**가 무변경.

3. **[H] 썸네일 조회수 부작용** — `GET /:id/thumbnail` 이 `getById` 경유로 `views +1` (`HUB/route/blog/thumbnail.ts:44`, `service/domain/blog/post.ts:80-85`). bblog 는 `views` 를 어디서도 렌더하지 않음(타입만). 부작용 제거는 소비자 비호환 없음. 단 `Content-Type: image/png` + `Cache-Control: public, max-age=2592000, immutable` (182-187) 은 크롤러 계약 — 유지.

4. **[H] `uploadUrl` 은 전체 URL** — bblog 는 `prep.data.uploadUrl` 에 그대로 POST (`BB/entities/image.client.ts:54`). upload-server 라우트는 `/upload-blog-image` (`UP/index.ts:82`) 이므로 `UPLOAD_SERVER_URL` 은 경로 포함 값이어야 하며, hub 는 값을 가공하지 않음 (`HUB/compose/blog.ts:495`). `HUB/docs/reference/env.md:75` 는 "base URL" 로 기술 — 문서와 실제 요구가 어긋남. 리팩토링 시 `uploadUrl` 조립 로직을 추가(경로 append)하면 이중 경로 위험.

5. **[H] 업로드 multipart 필드명·응답 키** — 요청 `file / assetId / s3Key / uploadToken` (`BB/entities/image.client.ts:48-53` ↔ `UP/index.ts:87-94`), 응답 최상위 **`url`** (`image.client.ts:59-61` ↔ `UP/index.ts:105`; 봉투 `data.url` 이 아님). complete 콜백 바디 `{ assetId, s3Key, uploadToken, sizeBytes, width, height }` (`UP/blog-image-handler.ts:64-75` ↔ `HUB/dto/blog/image.ts:11-18`), 세션 없이 토큰만 (`HUB/route/blog/image.ts:80-96`). 세 곳 동시 변경 필요.

6. **[M] complete `width/height` 0 → 400** — upload-server `getMetadata` 가 크기를 못 읽으면 `0` 을 보내는데 (`UP/index.ts:39-42`) hub 스키마는 `positive().nullable()` (`HUB/dto/blog/image.ts:16-17`) → 400 → 업로드 전체 실패(`UP/blog-image-handler.ts:77-81`). `null` 로 보내거나 hub 가 0 을 허용해야 정합.

7. **[M] bblog `NEXT_PUBLIC_API_URL` 폴백 불일치** — 미설정 시 bblog 는 `https://hub.gumyo.net` (`BB/lib/api/client-fetch.ts:3` 외 3곳), RESUME·upload-server 는 `https://api.gumyo.net` (`RS/shared/constants/api.ts:1`, `UP/index.ts:12`). 썸네일/sitemap URL 은 폴백 자체가 없음 (`BB/app/(blog)/article/[id]/page.tsx:20`, `BB/app/sitemap.ts:13`). 배포 env 에 의존.

8. **[M] 공개 목록 필터가 URL 로 노출됨** — `BB/app/(blog)/article/page.tsx:32` 가 `searchParams` 를 통째로 `getPostList` 에 spread 하므로 `?isPublished=false` / `?isHide=true` 가 그대로 hub 로 전달되고 hub 는 인증 없이 그 필터를 적용 (`HUB/compose/blog.ts:55-57`). 미발행·숨김 글이 목록에 노출(`[Deleted]` 접두, `post-card.tsx:37`). 또 `?isHide=1` 같은 값은 hub 400 → 페이지 에러. 리팩토링에서 공개 목록에 강제 필터를 넣으면 admin 이 이 URL 로 초안을 보던 우회 경로가 사라짐 — 의도 확인 필요.

9. **[M] `GET /api/blog/posts/:id` 에 공개 필터 없음** — id 만 알면 숨김·미발행 글 200 (`HUB/service/domain/blog/post.ts:80-85`). bblog 편집 페이지(`BB/app/(editor)/edit/[id]/page.tsx:19`)가 초안 로드에 이 공개 엔드포인트를 사용 → 리팩토링에서 비공개 글을 admin 전용으로 막으면 편집이 깨짐(쿠키는 전송되므로 세션 기반 분기는 가능).

10. **[M] sitemap 100건 상한** — `getAllPosts` 가 `limit=100` 단일 호출 (`BB/entities/post.ts:33`) 이고 hub `limit max 100` (`HUB/dto/blog/post.ts:5`) → 101번째 글부터 sitemap 누락(무증상).

11. **[M] 댓글 숨김 = 본문 `''` 마스킹에 의존** — bblog 는 `comment.comment || '비밀글입니다.'` (`BB/widgets/comment/comment-item.tsx:119`)로 falsy 판정. hub 가 `null` 이나 원문을 주면 UI 의미가 바뀜 (`HUB/compose/blog.ts:192-197`). 작성자 본인도 자기 비밀글 원문을 못 봄(서버가 무조건 마스킹).

12. **[M] 응답 필드 초과 선언(읽지 않음)** — bblog 타입이 hub 가 안 주는 필드를 선언: 메시지 `replyTo/retweetOf/replyCount/retweetCount/isRetweeted`, `images[].r2Key/bucket/sizeBytes/checksum/uploadedBy/createdAt/updatedAt`, `user.email` (`BB/entities/message.ts:18-77`); 프로필 `emailVerified/createdAt/updatedAt/isFollowing/isFollowedBy` (`BB/entities/message.ts:4-16`). 런타임 참조는 없음(§1.7). 계약에 포함하지 않아도 됨.

13. **[M] Date 타입 선언 vs ISO 문자열** — bblog `PostDetail.updatedAt/createdAt`, `CommentWithUser.*At`, 메시지 `createdAt` 이 `Date` 로 선언되나 실제는 문자열; 소비는 전부 `dayjs(...)` 경유 (`post-card.tsx:31`, `comment-item.tsx:75`, `log-message-list.tsx:79`, `post-header.tsx:35`) 와 sitemap `lastModified`(문자열 허용). ISO 8601 문자열 형식 유지 필수.

14. **[M] RESUME PATCH 검증이 인증보다 먼저** — `HUB/route/resume/resume.ts:47-51` 순서상 잘못된 바디는 미인증에도 400. RESUME 은 모든 실패를 동일 토스트로 처리하므로 현재는 무해. 순서를 바꿔도 소비자 호환.

15. **[M] RESUME 공개 조회는 `isPublic` 무시 + 최신 1건** — `HUB/compose/resume.ts:34-42`. `/manage/resume` 에서 `type='web'` 행을 하나 더 만들면 사이트 콘텐츠가 즉시 바뀜(RESUME 은 `docs/acknowledge/2026-08-29-cv-db-and-query.md:2` 에서 이 동작을 합의로 기록). `isPublic` 필터를 추가하면 현재 행의 플래그에 따라 404 → RESUME 빌드 실패(§2.2, `notFound` 없음).

16. **[M] RESUME 는 `updatedAt` 을 문자열로 강제** — `z.string()` (`RS/entities/web-resume/web-resume.type.ts:78`). hub 가 숫자(epoch) 나 객체로 바꾸면 parse 실패 → 사이트 전체 빌드/ISR 실패.

17. **[L] CORS + credentials** — bblog `clientFetch` 는 공개 GET 에도 `credentials: 'include'` (`BB/lib/api/client-fetch.ts:24`), RESUME 도 세션·PATCH 에 include. hub CORS 가 Origin echo + `Access-Control-Allow-Credentials: true` 를 유지해야 함 (`HUB/middleware/index.ts:31-37`); `*` 로 바꾸면 전부 실패. PATCH/PUT/DELETE 프리플라이트 허용 유지.

18. **[L] 세션 쿠키 도메인·rewrite 프록시** — bblog OAuth/세션은 Next rewrite 로 hub 에 프록시 (`BB/next.config.ts:14-21`) → 요청 Origin `blog.gumyo.net`, 쿠키 `.gumyo.net` (`HUB/service/shared/auth-provider.ts:52-58`). RESUME 은 hub 로 직접 cross-origin. trustedOrigins `*.gumyo.net` 과 `crossSubDomainCookies` 는 두 소비자 모두의 전제. `get-session` 의 "세션 없음 = 200 `null`" 도 계약(bblog `data?.user` 체크, RESUME `.nullable()`).

19. **[L] 카테고리·태그 생성 응답은 row 전체** — bblog 는 `categoryId`/`tagId` 만 읽음 (`BB/widgets/category/category-select.tsx:29`, `BB/widgets/tag/tag-select.tsx:38`). `{ categoryId }` 만 반환해도 호환. 카테고리 목록의 `isHide=false` 필터(`HUB/compose/blog.ts:498-501`)는 bblog 가 `isHide` 를 읽지 않으므로 서버 필터 유지 필요.

20. **[L] 이미지 목록의 "메시지 미첨부만" 규칙** — `HUB/compose/blog.ts:463-478`. bblog PostImages 갤러리가 이 결과를 그대로 렌더 (`BB/widgets/post/post-images.tsx:55`). 규칙 변경 시 갤러리 노출 범위가 바뀜(계약 위반은 아님).

21. **[L] 메시지 이미지 URL 하드코딩** — `https://blogimg.gumyo.net/${r2Key}` (`HUB/compose/blog.ts:327, 423`) vs 에셋 목록의 `getUrl` (482). bblog `remotePatterns` 가 `*.gumyo.net` 이라 도메인 차이는 흡수. `image-modal.tsx:42` 의 `/thumbnail.webp → /pc.webp` 치환은 현재 키(`<uuid>.webp`)에 무효한 레거시.

22. **[L] 휴면 서버 함수(호출처 없음)** — `BB/entities/comment.ts:16-21` `getCommentList`, `BB/entities/image.ts:15-20` `getImageList`, `BB/entities/message.ts:99-103` `getMessagesByUserId`, `BB/entities/message.ts:93-97` `getUserProfile`(← `LogPageInfo` 미렌더). 계약에서 제외 가능하나 타입은 위젯이 import 중.

23. **[L] 썸네일 30일 immutable vs 편집** — 글 제목/카테고리/첫 태그 변경 후에도 크롤러·CDN 은 최대 30일 이전 OG 이미지 유지 (`HUB/route/blog/thumbnail.ts:185`); bblog 페이지 `revalidate 2592000` 과 동일 주기. 현행 유지 시 문제 없음.

24. **[L] `/api/resume/public/cv`** — RESUME·hub 어디에도 참조 없음. 되살릴 필요 없음.

---

## 3. Storage · Rirekisyo · hn-alert · Banga · nextjs-portfolio

# b-hub 소비자 계약 인벤토리 — Storage · Rirekisyo · hn-alert · Banga · nextjs-portfolio

> 작성 기준일 2026-09-06. 소비자 레포는 읽기만 했고 수정하지 않았다. 모든 근거는 `파일:라인` 으로 표기한다. 소비자 경로는 각 레포 루트 기준, b-hub 경로는 `/Users/hyunseokbyun/development/b-hub` 기준이다.
>
> 판정 요약: **Storage = 런타임 소비자(drive · auth · upload-server)**, **Rirekisyo = 런타임 소비자(resume · ai · auth)**, **hn-alert = 런타임 소비자이나 대상 도메인(`/api/hn/*`)이 b-hub 에서 삭제되어 현재 전면 고장**, **Banga = 런타임 소비자(auth 만)**, **nextjs-portfolio = b-hub 비소비(docs-only; 런타임 의존은 별도 서비스 badge.hyns.dev)**.

---

## 0. 소비자 공통 전제 (b-hub 측 계약)

| 항목 | 현재 값 | 근거 |
|------|---------|------|
| API 마운트 | `/api/<domain>` (`app.route('/api', api)`) | `index.ts:64`, `route/index.ts:73-435` |
| 성공 봉투 | `{ success: true, data }` / 목록 `{ success: true, data: T[], pagination: { page, limit, total, totalPages } }` | `lib/api-response.ts:30-42` |
| 에러 봉투(AppError) | `{ success: false, error: { code, message, details? } }` — `details` 는 비프로덕션에서만 | `lib/api-response.ts:44-51`, `lib/with-error-handling.ts:9-26` |
| **Zod 검증 실패 봉투** | `validator()` 실패 시 **`{ data, error: <issue 배열>, success: false }` + 400** — `error.code`/`error.message` 가 없다 | hono-openapi 1.3.0 `validator` → `@hono/standard-validator` 0.2.3 `dist/index.mjs:131-138` |
| HTTP 상태 | `STATUS_MAP` — VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, RATE_LIMIT_EXCEEDED 429, RESUME_NOT_FOUND 404, DRIVE_* 400~500, AI_* 401~502 | `lib/error.ts:11-130` |
| CORS(`/api/*`) | origin 이 `gumyo.net`·`hyns.dev` 또는 그 서브도메인일 때 반사, 비프로덕션은 `localhost` 허용, `credentials: true` | `middleware/index.ts:17-37`, `index.ts:24` |
| 세션 쿠키 | better-auth 1.6.23, baseURL `env.BASE_URL`(프로덕션 https) → 이름 **`__Secure-better-auth.session_token`**, `Secure; HttpOnly; SameSite=Lax; Path=/`, 프로덕션에서 **`Domain=.gumyo.net`**(crossSubDomainCookies) | `service/shared/auth-provider.ts:54-58`, `compose/shared.ts:25,32`, `node_modules/better-auth/dist/cookies/index.mjs:21-40,47` |
| better-auth 신뢰 오리진 | `*.gumyo.net`, `*.hyns.dev`, `*.seok.dev` + `TRUSTED_ORIGINS` env | `service/shared/auth-provider.ts:18,52` |
| `GET /api/auth/get-session` | 쿠키 없으면 **200 + JSON `null`**; 있으면 `{ session, user }`(user 에 admin 플러그인 `role` 포함) | `node_modules/better-auth/dist/api/routes/session.mjs:17-27`, `service/shared/auth-provider.ts:47-51` |
| `POST /api/auth/sign-out` | **POST 전용** | `node_modules/better-auth/dist/api/routes/sign-out.mjs:4-5` |
| 정규화 세션 | 라우트가 쓰는 `getSession` 은 `{ user: { id, name, email, role, image } }` 로 정규화 | `compose/shared.ts:35-47` |
| AI rate limit | 사용자·pathKey 당 60초 30회, 초과 시 `RATE_LIMIT_EXCEEDED`(429), 응답 헤더 `X-RateLimit-Limit/Remaining/Reset` | `compose/ai.ts:281-282`, `lib/with-rate-limit.ts:14-17` |

---

## 1. Storage (`~/development/Storage`, branch `vercel`, Next.js 16 · better-auth 1.6.23)

### 1.1 설정 · 자격 전달

| 항목 | 값 | 근거 |
|------|----|------|
| API base | `NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:9999'` (프로덕션은 `https://api.gumyo.net` 로 추정 — 레포에 .env 없음) | `shared/constant/api.ts:1` |
| upload-server base | `NEXT_PUBLIC_UPLOAD_SERVER_URL ?? API_BASE_URL` | `shared/constant/api.ts:2` |
| 경로 상수 | `/api/drive/folders`, `/api/drive/folders/:id`, `/api/drive/assets`, `/api/drive/assets/:id`, `/api/drive/quota`, `/api/auth/get-session`, `/api/auth/sign-out` | `shared/constant/api.ts:4-15` |
| 서버 fetch(RSC/Server Action) | `cookies().toString()` 을 `Cookie` 헤더로 전달 + `Content-Type: application/json` + `credentials: 'include'`; `res.ok` 는 보지 않고 `json.success` 만 검사, 실패 시 **응답 JSON 객체를 그대로 throw** | `shared/api/fetch.ts:10-29` |
| 브라우저 fetch | `credentials: 'include'` (prepare, 상세 조회) | `entities/drive/upload.ts:53`, `entities/drive/download.ts:4` |
| better-auth 클라이언트 | `createAuthClient({ baseURL: API_BASE_URL })` → `signIn`, `signOut`, `useSession`, `updateUser` | `entities/auth/auth-client.ts:4-8` |
| 소비 오리진 | `https://storage.gumyo.net` | `app/sitemap.ts:5` |
| CSP connect-src | API base + upload-server + `blogimg.gumyo.net` + `*.r2.cloudflarestorage.com` | `proxy.ts:17-21` |
| 재활용 헤더 없음 | `Authorization`/`X-API-Token`/`X-Weather-Key`/`EventSource` 사용 없음 | grep 결과(`credentials` 3곳만) |

### 1.2 Auth 엔드포인트 (`/api/auth/*`, b-hub `route/auth/oauth.ts:11` pass-through)

| 호출 | 소비자 위치 | 요청 | 소비자가 읽는 응답 | 분기 |
|------|-------------|------|--------------------|------|
| `GET /api/auth/get-session` (서버) | `entities/auth/api.ts:12-21` | Cookie 전달 | `data.user.{id,name,email,image}` (`entities/auth/type.ts:1-6`) | `!res.ok` → null; JSON `null` 이면 `data.user` 접근 TypeError → catch → null |
| `GET /api/auth/get-session` (클라이언트, `useSession`) | `shared/provider/auth-provider.tsx:19-25` | better-auth client, credentials include | `session.user.{id,name,email,image}`, `isPending` | 없음 |
| `POST /api/auth/sign-in/social` | `features/auth/login-form.tsx:11-14` | `{ provider: 'github' \| 'google', callbackURL: origin + '/storage' }` | better-auth 표준(`url`, `redirect`) | callbackURL 이 trustedOrigins(`*.gumyo.net`) 안이어야 함 |
| `GET /api/auth/callback/:provider` | 브라우저 리다이렉트 | — | Set-Cookie(`Domain=.gumyo.net`) 후 callbackURL 로 302 | — |
| `POST /api/auth/sign-out` | `shared/provider/auth-provider.tsx:29` (client) / `entities/auth/api.ts:23-25` (server, **호출처 없음**) | credentials include | 없음 | 실패 시 `toast(errorUnknown)` |
| `POST /api/auth/update-user` | `features/mypage/profile-card.tsx:30` | `{ name }` | 없음(성공 toast) | catch → errorUnknown |

### 1.3 Drive 폴더 (`/api/drive/folders`, b-hub `route/drive/folder.ts`, `dto/drive/folder.ts`)

| 메서드·경로 | 소비자 위치 | 요청 | 소비자가 읽는 응답 필드 | b-hub 실제 응답 | 비고 |
|-------------|-------------|------|--------------------------|-----------------|------|
| `POST /api/drive/folders` | `entities/drive/api.ts:18-23`, 호출 `widgets/storage/storage-layout.tsx:250-252` | `{ name: string, parentId: string \| null }` (`type.ts:19-22`) | 없음(성공 시 folders 쿼리 무효화만, `entities/drive/query.ts:55-62`); 타입은 `DriveFolder{id,userId,parentId,name,createdAt,updatedAt}`(`type.ts:1-8`) | **201** + `{ id, userId, parentId, name }` — createdAt/updatedAt 없음 (`service/domain/drive/drive-folder.ts:66-81`, `route/drive/folder.ts:36`) | dto `name 1..255`, `parentId nullable optional` (`dto/drive/folder.ts:3-6`) |
| `GET /api/drive/folders[?parentId=]` | `api.ts:25-30`; 루트는 **parentId 생략**; 호출 `storage-layout.tsx:108,111`, `features/storage/file-tree/tree-node.tsx:27` | query `parentId?` | `data[]` 의 `id,name,parentId`(+`createdAt/updatedAt` 타입만) | Drizzle row 배열(Date→ISO), 이름순 (`drive-folder.ts:83-90`, `compose/drive.ts:19-31`) | 부모가 남의 것이면 `DRIVE_FOLDER_NOT_FOUND` |
| `GET /api/drive/folders/:folderId` | `api.ts:32-34`; 호출 `storage-layout.tsx:120,173` | — | **`breadcrumb[]{id,name}`** 만 실사용 | `{ id, name, parentId, breadcrumb, createdAt, updatedAt }` (`drive-folder.ts:92-107`) | |
| `PATCH /api/drive/folders/:folderId` | `api.ts:36-41`; rename `features/storage/rename-dialog.tsx:26`(`{name}`), move `storage-layout.tsx:104`(`{parentId}`) | `{ name?: string, parentId?: string \| null }` | 없음(무효화만) | `{ id }` (`drive-folder.ts:143`) | 순환 `DRIVE_FOLDER_CIRCULAR_REF`, 중복 `DRIVE_FOLDER_NAME_DUPLICATE` |
| `DELETE /api/drive/folders/:folderId` | `api.ts:43-45`; 호출 `storage-layout.tsx:156`(순차 루프) | — | 없음 | `{ id }` (`drive-folder.ts:170`) — 하위 폴더·에셋 재귀 삭제 | |

### 1.4 Drive 에셋 (`/api/drive/assets*`, `/api/drive/quota`, b-hub `route/drive/asset.ts`, `dto/drive/asset.ts`, `service/domain/drive/drive-asset.ts`)

| 메서드·경로 | 소비자 위치 | 요청 | 소비자가 읽는 응답 필드 | b-hub 실제 응답 | 비고 |
|-------------|-------------|------|--------------------------|-----------------|------|
| `GET /api/drive/assets` | `api.ts:56-67`; 호출 3종 — 트리 `storage-layout.tsx:109` `{folderId:'root'\|<id>, page:1, limit:100, sort:'name', order:'asc'}` / 콘텐츠 `:112-119` `{folderId: currentFolderId ?? 'root', page, limit:20, sort, order, mimeType?}` / 프리페치 `features/storage/storage-content.tsx:17` `{folderId:'root',page:1,limit:100,sort:'created',order:'desc'}`; 트리 하위 `tree-node.tsx:28` | query `folderId`(**루트는 문자열 `'root'`**), `page`, `limit`, `sort ∈ created\|name\|size`, `order ∈ asc\|desc`, `mimeType`(접두 필터) | `data[]`: `id, originalName, mimeType, sizeBytes, folderId, isPublic, uploadStatus('preparing'\|'uploading'\|'ready'\|'failed'), thumbnail(data URI\|null), createdAt, updatedAt` (`type.ts:31-43`; 사용처 `file-card.tsx:31,34,87`, `file-list-row.tsx:31,56,75`, `file-detail-panel.tsx:33,74-80,90`); `pagination.{page,limit,total}` (`fetch.ts:7`, `file-grid.tsx:25`) | `paginatedResponse(items, {page,limit,total})`; item = `id, originalName, mimeType, sizeBytes, folderId, isPublic, storageTiers, uploadStatus, thumbnail, createdAt, updatedAt` (`drive-asset.ts:403-418`); `folderId==='root'` → `folder_id IS NULL` (`compose/drive.ts:157-163`); `mimeType` 은 `LIKE 'x%'` (`:154-156`); 10분 지난 `preparing/failed` 행 숨김 (`:149-153`) | dto: `page≥1 기본1`, `limit 1..100 기본20`, `sort 기본 created`, `order 기본 desc` (`dto/drive/asset.ts:3-10`); `totalPages` 는 소비자가 무시 |
| `GET /api/drive/assets/:assetId` | 상세(이미지일 때만) `storage-layout.tsx:125-126`, 미리보기 `features/storage/image-preview.tsx:15-19,32`, 다운로드 `entities/drive/download.ts:4-14` | credentials include | **`url`**, `originalName`, (`id` 비교) ; 타입 `DriveAssetDetail = DriveAsset & {fileHash,url,lastViewedAt}` (`type.ts:45-49`) | `id, originalName, mimeType, sizeBytes, folderId, isPublic, fileHash, storageTiers, uploadStatus, url, thumbnail, lastViewedAt, createdAt, updatedAt` (`drive-asset.ts:436-451`); **`url` 규칙**: L1 보유 시 public→CDN URL / private→R2 presigned **300초** ; L1 없으면 상대경로 **`/api/drive/assets/:id/download`** (`:428-434`); 호출마다 `accessCount+1`, `lastViewedAt` 갱신 (`:425`) | 남의 에셋 → `DRIVE_ASSET_NOT_FOUND`(404) |
| `PATCH /api/drive/assets/:assetId` | `api.ts:73-78`; rename `rename-dialog.tsx:27` `{originalName}` / 공개토글 `storage-layout.tsx:133` `{isPublic}` / 이동 `entities/drive/query.ts:93` `{folderId}` | `{ originalName?, isPublic?, folderId?: string \| null }` (`type.ts:63-67`) | 없음(무효화) | `{ id, ...적용필드 }` (`drive-asset.ts:496`); `originalName` 은 `sanitizeFilename` 적용 (`:489`, `lib/mail-utils.ts:179-191`) | dto `originalName 1..255` (`dto/drive/asset.ts:16-20`) |
| `DELETE /api/drive/assets/:assetId` | `api.ts:80-82`; 호출 `storage-layout.tsx:157` | — | 없음 | `{ id }` (`drive-asset.ts:521`); R2·GDrive 정리는 best-effort | |
| `GET /api/drive/quota` | `api.ts:84-86`; 사용 `features/storage/file-tree/quota-bar.tsx:10,23` | — | `used`, `total` (`remaining` 타입만) | `{ used, total, remaining }` (`drive-asset.ts:524-532`); `total` = `user.storage_quota_bytes` **없으면 10 MiB** (`compose/drive.ts:221-228`) | |
| `POST /api/drive/assets` (multipart 직접) | **사용 없음** | — | — | `route/drive/asset.ts:28-50` | Storage 는 2단계 업로드만 사용 |
| `GET /api/drive/assets/:assetId/download` | 직접 호출 없음 — 상세 `url` 이 이 경로일 때 `<a href>` 로 내비게이션 (`download.ts:16-22`) | 쿠키(top-level navigation) | 바이너리 | `Content-Type`, **`Content-Disposition: attachment; filename="<encodeURIComponent(originalName)>"`**, `Content-Length` (`route/drive/asset.ts:245-251`); L3(GDrive) 만 지원, 아니면 `DRIVE_ALL_TIERS_FAILED`(500) (`drive-asset.ts:454-475`) | `filename*` 미사용 |

### 1.5 업로드 생명주기 (Storage ↔ b-hub ↔ upload-server)

```
[브라우저] validateBeforeUpload → SHA-256 → POST hub /api/drive/assets/prepare
        → XHR POST upload-server /upload (multipart)
[upload-server] POST hub /assets/:id/status(uploading) — 성공(2xx+success+s3Key 일치)해야 디스크 저장 진행 → 해시/썸네일 → POST hub /assets/:id/gdrive-token
        → GDrive 업로드(L3) → R2 업로드(L1, ≤100MiB) → (L2 항상 실패) → POST hub /assets/:id/complete
[브라우저] 2xx & json.success → assets/quota 쿼리 무효화
```

| 단계 | 호출자 → 대상 | 요청 | 응답(읽는 필드) | 근거 |
|------|---------------|------|-----------------|------|
| 0. 클라이언트 사전검증 | Storage | 크기 > `NEXT_PUBLIC_MAX_UPLOAD_SIZE_BYTES ?? 100 GiB` → `DRIVE_FILE_TOO_LARGE`, 0바이트 → `DRIVE_FILE_EMPTY`, 차단 확장자 17종 → `DRIVE_BLOCKED_EXTENSION`(전부 로컬 코드) | — | `entities/drive/upload.ts:4-32`, `storage-layout.tsx:206-216` |
| 1. prepare | Storage → b-hub `POST /api/drive/assets/prepare` | JSON `{ originalName: file.name, mimeType: file.type, sizeBytes: file.size, folderId: string \| null, fileHash: sha256hex }`, credentials include | `!res.ok \|\| !json.success` → JSON 그대로 throw; 성공 시 `data.{assetId, s3Key, uploadToken}` (`uploadStatus` 는 타입만) | `upload.ts:34-68`; b-hub `route/drive/asset.ts:52-76`(**Zod validator 없음**, `body.*` 직접 사용) → `drive-asset.ts:278-335`: `sanitizeFilename`, MIME 정규식·차단 MIME·차단 확장자(`:149-164` → `DRIVE_INVALID_MIME_TYPE`), 폴더 소유 검사, `fileHash` 중복 → 기존이 preparing/failed 면 삭제 후 진행, 아니면 `DRIVE_DUPLICATE_FILE`(409) (`:290-300`), 쿼터 `DRIVE_QUOTA_EXCEEDED`(413) (`:301-305`), 반환 `{ assetId, s3Key: users/<userId>/<uuid>/<safeName>, uploadToken(64 hex), uploadStatus: 'preparing' }` (`:329-334`) |
| 2. 업로드 | Storage → upload-server `POST ${UPLOAD_SERVER_URL}/upload` | **multipart 필드명 `file`, `assetId`, `s3Key`, `uploadToken`**; XHR, `withCredentials` 없음, 타임아웃 없음, 진행률 `xhr.upload.onprogress` | 2xx: `JSON.parse` → `{ success, error? }`, `success` 아니면 `error` 메시지; 비2xx: `{ error }` 파싱 → `UPLOAD_FAILED`; 파싱 실패 → `PARSE_ERROR`; 네트워크 → `NETWORK_ERROR` | `upload.ts:74-105`; upload-server `deploy/upload-server/index.ts`: 400 `{success:false,error:'No file provided'\|'Missing assetId, s3Key, or uploadToken'\|'Invalid assetId'}`(`assetId` 는 `^[A-Za-z0-9_-]+$` 만 허용), **401 `{success:false,error:'Upload not authorized'}`(status 콜백 게이트 거부)**, 잘못된 `s3Key`(`users/<userId>/<id>/<name>` 4세그먼트·`..` 금지) 는 500 `Invalid s3Key`, **413 `{success:false,error:'File too large'}`(> `MAX_UPLOAD_SIZE_BYTES` 기본 10 GiB, `:15,119-122,148`)**, 500 `{success:false,error:<message>}`, 200 `{success:true,message:'Uploaded to L1,L3'}`; CORS 허용 오리진 `ALLOWED_ORIGINS`(기본 `https://gumyo.net,https://hyns.dev` + 서브도메인) `:14,72-78` |
| 3. status 콜백 | upload-server → b-hub `POST /api/drive/assets/:assetId/status` | JSON `{ uploadToken, status: 'uploading' }` + `Authorization: Bearer <UPLOAD_SERVER_SECRET>` — **게이트다. fire-and-forget 아님** | 2xx + 본문 `success === true` + (`data.s3Key` 가 있으면) 요청 `s3Key` 와 일치해야 통과. 하나라도 어긋나면 파일을 디스크에 쓰지 않고 `{ unauthorized: true }` → 라우트가 **401**. 통과 시 이후 저장 키는 hub 가 준 `data.s3Key`(없으면 요청 값) | `deploy/upload-server/upload-handler.ts`(2026-09-06 수정); b-hub `route/drive/asset.ts:79-90`: **`requireUploadServer` 게이트 추가**(`UPLOAD_SERVER_SECRET` 미설정 시 `SERVICE_NOT_CONFIGURED` 503) 후 `uploadToken` 검사 → `drive-asset.ts` `updateUploadStatus`: status 가 `'uploading'` 아니면 `VALIDATION_ERROR`, 토큰 불일치 `UNAUTHORIZED`(상수 시간 비교 `isSecretMatch`), 현재 상태가 preparing 아니면 `DRIVE_UPLOAD_EVENT_FAILED`; **응답 `{ id, uploadStatus, s3Key }`**(`s3Key` 추가) |
| 4. gdrive-token | upload-server → b-hub `POST /api/drive/assets/:assetId/gdrive-token` | JSON `{ uploadToken }` + Bearer secret | `tokenRes.ok && json.success` → `data.{accessToken, rootFolderId}`; 아니면 GDrive 생략 | `upload-handler.ts:100-131`; b-hub `route/drive/asset.ts:115-139`: `requireUploadServer`(`Authorization: Bearer` 또는 `x-upload-server-secret`, `:19-23`) → 토큰·상태(preparing/uploading) 검사(`drive-asset.ts:346-352`) → refresh token 으로 access token 발급(`compose/shared.ts:114-131`), 실패 시 `DRIVE_L3_UPLOAD_FAILED`(500) |
| 5. 계층 저장 | upload-server | GDrive(재시도 2, `s3Key` 경로를 폴더 트리로 생성 `gdrive-client.ts:44-116`) → `L3`; R2 는 `file.size ≤ 100 MiB` 일 때만(`index.ts:23`, `upload-handler.ts:133-148`) → `L1`; `local-client` 는 항상 실패(`local-client.ts:4-8`) | — | 썸네일: `image/*` 이고 ≤20 MiB 면 100x100 webp q60 base64 (`upload-handler.ts:82-94`) |
| 6. complete | upload-server → b-hub `POST /api/drive/assets/:assetId/complete` | JSON `{ uploadToken, fileHash(sha256 재계산), storageTiers: 'L1,L3' 등 정렬 CSV(빈 문자열 가능), gdriveFileId \| null, localPath \| null, thumbnailBase64 \| null }` + Bearer secret | `!ok` → 업로드 실패 처리; 본문 미사용 | `upload-handler.ts`; b-hub `route/drive/asset.ts:91-117`(**`requireUploadServer` 게이트 추가** — 미설정 시 503) → `drive-asset.ts` `completeUpload`: 토큰 불일치 `UNAUTHORIZED`, 상태 preparing/uploading 아니면 `DRIVE_UPLOAD_EVENT_FAILED`, **`storageTiers` 비면 `uploadStatus='failed'`** 아니면 `'ready'`, `uploadToken` null 화, 응답 `{ id, uploadStatus }` |
| 7. 결과 | upload-server → Storage | tiers 가 비면 complete 호출 후에도 **500 `All storage tiers failed`** (`upload-handler.ts:183-186`) | Storage: `.then` → `done` + assets/quota 무효화, `.catch` → `error` + `getDriveErrorMessage` + assets 무효화 (`storage-layout.tsx:228-238`) | 동시 업로드 최대 5개 큐(`storage-layout.tsx:193-202`) |

- upload-server 의 `auth.ts`(`verifySession` → `GET hub /api/auth/get-session` with Cookie, `deploy/upload-server/auth.ts:11-27`)는 **`index.ts` 에서 import 되지 않아 미사용**. 업로드 승인은 오직 `uploadToken` 이 담당한다.
- upload-server `HUB_BASE_URL` 기본 `https://api.gumyo.net` (`index.ts:12`), 도메인은 `upload.hyns.dev` (b-hub 커밋 388f33a 메시지).

### 1.6 소비자가 분기하는 에러 코드 · 상태

| 소비자 위치 | 읽는 것 | 값 |
|-------------|---------|-----|
| `entities/drive/error.ts:6-18` (`ERROR_MESSAGE_MAP`) | `error.error.code` | `DRIVE_FILE_TOO_LARGE`, `DRIVE_QUOTA_EXCEEDED`, `DRIVE_DUPLICATE_FILE`, `DRIVE_FOLDER_NAME_DUPLICATE`, `DRIVE_FOLDER_CIRCULAR_REF`, `DRIVE_ASSET_NOT_FOUND`, `DRIVE_FOLDER_NOT_FOUND`, `DRIVE_INVALID_MIME_TYPE`, `DRIVE_ALL_TIERS_FAILED`, `DRIVE_UPLOAD_EVENT_FAILED`, `UNAUTHORIZED` — 그 외 코드는 `error.error.message` 를 그대로 표시 (`:23-33`) |
| `entities/drive/error.ts:35-37`, `entities/drive/query.ts:31` | `error.error.code === 'UNAUTHORIZED'` | `/login` 으로 push |
| `entities/drive/type.ts:80-91` | `DriveErrorCode` 유니온 | 위와 동일 11개 |
| HTTP 상태 | `res.ok` 만 — prepare(`upload.ts:64`), 상세(`download.ts:5`), get-session(`entities/auth/api.ts:15`) | 상태 코드 값 자체엔 분기 없음 |
| 응답 헤더 | 읽지 않음 (`Content-Disposition`·`ETag`·`X-RateLimit-*` 미사용) | — |

주의(소비자 측 결함, b-hub 계약과 무관): 폴더·에셋 뮤테이션은 Server Action 경유라 프로덕션에서 throw 된 JSON 이 제네릭 Error 로 치환되어 `getDriveErrorMessage`·`isUnauthorizedError` 가 동작하지 않는다 — `docs/security-audit-2026-07-10.md:21`. 실제로 코드 분기가 살아있는 경로는 **prepare(브라우저 fetch)** 와 upload-server 응답뿐이다.

### 1.7 타이밍 가정

- 쿼리 staleTime: 폴더/에셋 30초, 쿼터 60초 (`entities/drive/query-options.ts:16-49`). 폴링 없음.
- 업로드 XHR 타임아웃 없음; upload-server 는 R2·GDrive 업로드를 **동기 처리 후** 응답(수 분 가능).
- presigned URL 유효 300초 — 상세 조회 직후 즉시 내비게이션 (`download.ts:14-22`). 미리보기 `useQuery` 캐시(기본 staleTime 이후 재조회) 동안 URL 만료 가능.
- b-hub 목록은 10분 지난 preparing/failed 행을 숨김 → 실패 표기는 최대 10분 노출.

---

## 2. Rirekisyo (`~/development/Rirekisyo`, branch `dev`, Next.js 16 · better-auth react client)

### 2.1 설정 · 자격 전달

| 항목 | 값 | 근거 |
|------|----|------|
| API base | `NEXT_PUBLIC_API_URL ?? 'http://localhost:9999/api'` — **`/api` 접미 포함**, 프로덕션 `https://api.gumyo.net/api` (`resume-api.md:3`) | `src/lib/api-client.ts:1` |
| auth base | `NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:9999'` (접미 없음, 별도 env) | `src/features/auth/auth-client.ts:3-5` |
| `clientFetch` | `credentials: 'include'`, `Content-Type: application/json`(GET/DELETE 포함), **`res.ok` 미검사**, `res.json()` 후 `!json.success` → `throw new Error(json.error.message)`, 반환 `json.data` (**pagination 버림**) | `src/lib/api-client.ts:3-12` |
| 세션 게이트 | `authClient.useSession()` → null 이면 `/login` (클라이언트 전용, 서버 미들웨어 없음) | `src/features/auth/use-session.ts:5-7`, `auth-guard.tsx:9-16` |
| 로그인 | `signIn.social({ provider: 'github' \| 'google', callbackURL: window.location.origin })` | `src/app/(auth)/login/page.tsx:9,13` |
| 소비 오리진 | 레포에 미기재(사이트 URL 상수 없음). CORS·trustedOrigins 상 `*.gumyo.net`/`*.hyns.dev` 여야 함 | grep 결과 |

### 2.2 Resume 엔드포인트 (`/api/resume`, b-hub `route/resume/resume.ts`, `dto/resume/*`)

| 메서드·경로 | 소비자 위치 | 요청 | 소비자가 읽는 응답 | b-hub 실제 | 비고 |
|-------------|-------------|------|--------------------|------------|------|
| `GET /api/resume[?type=resume\|cv]` | `src/entities/resume/api.ts:10-14,23`; 사이드바 `src/widgets/sidebar/app-sidebar.tsx:41-42`; AI 컨텍스트(**type 없이**) `src/widgets/ai-chat/ai-chat-sheet.tsx:48` | query `type` 만, `page/limit` 미전송 | `data[]`: `id, title, type`(`app-sidebar.tsx:85-92`); AI: `id, type, title, data`(`ai-chat-sheet.tsx:21-29`) | `paginatedResponse(rows, {page:1, limit:20, total})` — **기본 20건만** (`route/resume/resume.ts:61-80`, `dto/resume/resume.ts:34-38` limit 1..50); `type` enum 은 **`resume \| cv \| web`** (`dto/resume/resume.ts:4`) | 소비자 `Resume.type` 은 `'resume' \| 'cv'` (`src/entities/resume/types.ts:81`) |
| `GET /api/resume/:id` | `api.ts:16-21,25`; 페이지 `src/app/(main)/resume/[id]/page.tsx:11,29-33`, `edit/page.tsx:12,47-69` | — (`id > 0` 일 때만 enabled) | `type`, `data`, `id`, `title`, `isPublic` | `successResponse(row)` = `{ id, userId, type, title, data, isPublic, createdAt, updatedAt }`; `isNaN` → `RESUME_NOT_FOUND`; **소유자 아니면도 `RESUME_NOT_FOUND`(404)** (`resume.ts:82-104`, `service/domain/resume/resume.ts:44-49`) | `resume-api.md:537` 의 `RESUME_NOT_OWNER 403` 은 b-hub 에 없음 |
| `POST /api/resume` | `api.ts:27-45`; `src/app/(main)/resume/new/page.tsx:14-30` | `{ type: 'resume' \| 'cv', title, data, isPublic }` — `data` 는 소비자 `ResumeData`(`types.ts:15-37`) / `CvData`(`types.ts:67-74`) | `data.id` → `router.push('/resume/{id}')` | `resumeCreateSchema` 판별 유니온 + `title 1..255`, `isPublic 기본 false` (`dto/resume/resume.ts:21-26`); 응답 `{ id }` (`resume.ts:106-125`) | 스키마 불일치 → §6 M15 |
| `PATCH /api/resume/:id` | `api.ts:47-63`; `edit/page.tsx:31-45` | `{ title, data, isPublic }` (전체 교체) | 없음(무효화 `['resume']`) | `resumeUpdateSchema` — `data` 는 `resume \| cv \| web` 스키마 union (`dto/resume/resume.ts:28-32`); 응답 `{ success: true }`; 미소유 → 404 | |
| `DELETE /api/resume/:id` | `api.ts:65-79`; `app-sidebar.tsx:43-50` | — | 없음 → `/` 로 push | `{ success: true }` (`resume.ts:153-175`) | |
| `GET /api/resume/public/web`, `PATCH /api/resume/web` | **사용 없음** (resume.gumyo.net 전용) | | | `resume.ts:20-59` | |

데이터 스키마 대조 (소비자 `src/entities/resume/types.ts` / b-hub `dto/resume/resume-data.ts`):

| 필드 | Rirekisyo | b-hub | 판정 |
|------|-----------|-------|------|
| `ResumeData.commuting_time` | 있음 (`types.ts:29`, `constants.ts:41`, 폼 `resume-form.tsx:168`) | **없음** | 소비자만 전송 → b-hub 가 strip |
| `ResumeData.commuting_hours`, `commuting_minutes` | **없음** | **필수 `z.string()`** (`resume-data.ts:31-32`, 최초 커밋 d792203 2026-03-12 부터) | **b-hub 검증 실패(400)** → M15 |
| 그 외 `ResumeData` 필드 | `name_furigana … creation_day` 동일 | 동일 | 일치 |
| `CvData` | `name, kana, summary, experience{5}, overview[]{4}, jobs[]{10}` | 동일 (`resume-data.ts:70-77`) | 일치 (`resume-api.md:118-129` 문서만 stale) |
| `type='web'` | 모름 | 있음 (`webResumeDataSchema`, `resume-data.ts:141-150`) | M16 |

### 2.3 AI 엔드포인트 (`/api/ai/*`, b-hub `route/ai/{connection,model,chat}.ts`, `dto/ai/*`)

| 메서드·경로 | 소비자 위치 | 요청 | 소비자가 읽는 응답(Zod) | b-hub 실제 | 비고 |
|-------------|-------------|------|--------------------------|------------|------|
| `GET /api/ai/providers` | `src/entities/ai/api.ts:23-32`; 게이트 `src/widgets/ai-chat/ai-chat-panel.tsx:7-11`(`status === 'active'` 만) | — | `aiProviderListSchema = [{ provider: 'codex'\|'anthropic'\|'ollama', status: 'active'\|'reauth_required'\|'disabled', displayName: z.string() }]` (`schema.ts:4-10`, `constants.ts:1-6`) — 파싱 실패 시 쿼리 에러 → 패널 숨김 | `[{ id, provider, authType, status, statusDetail, displayName: string\|**null**, lastUsedAt, lastRefreshedAt, modelsFetchedAt, createdAt, updatedAt }]` (`route/ai/connection.ts:17-29,34-47`; null 원인 `service/domain/ai/ai-connection.ts:95`, `/manage` 빈 입력 `page/manage/pages/ai.tsx:158`) | UI 표시 `info.displayName` (`ai-chat-sheet.tsx:139`) → M19 |
| `GET /api/ai/:provider/models` | `api.ts:34-43`; `ai-chat-sheet.tsx:46,50-51` | — (패널 열릴 때만) | `[{ modelId: z.string(), displayName: z.string() }]` (`schema.ts:12-17`) | `[{ id, providerId, modelId, displayName: string\|**null**, metadata, fetchedAt }]` (`route/ai/model.ts:16-23,34-48`); 프로바이더 문자열 무효 → `AI_PROVIDER_NOT_FOUND`(404), 연결 없음/disabled → 404, reauth → `AI_REAUTH_REQUIRED`(401) (`ai-connection.ts:113-118`) | anthropic 모델은 `display_name ?? null` (`providers/anthropic-provider.ts:109`) → M19 |
| `POST /api/ai/:provider/models/refresh` | `api.ts:45-57`; `ai-chat-sheet.tsx:159-168`(모델 0개일 때 버튼) | **본문 없음** + `Content-Type: application/json` | 무시(성공 시 models 무효화) | 새 목록 반환 (`route/ai/model.ts:50-67`); 실패 `AI_MODEL_FETCH_FAILED`(502) | b-hub 에 `validator('json')` 을 붙이면 빈 본문 400 → M23 |
| `POST /api/ai/completions/stream` | `api.ts:100-131`; `ai-chat-sheet.tsx:75-93` | JSON `{ provider, modelId, messages: [{role:'system',content:AI_SYSTEM_PROMPT},{role:'system',content:'<resume_context>'+JSON(전체 이력서)+'</resume_context>'},…history,{role:'user',content}], featureKey: 'resume' }`, credentials include, `AbortSignal` | 1) `content-type` 에 `application/json` 포함 → `{ success:false, error:{code,message} }` 파싱(`schema.ts:36-39`) 후 `message` throw (`api.ts:109-113`); 2) `!ok \|\| !body` → 고정 메시지; 3) SSE 프레임(`\n\n` 구분, `event:`/`data:` 필드, `:` 주석 무시, `\r` 제거 `api.ts:59-75`) — `delta` → `{ text }`(`schema.ts:19-21`) 누적, `done` → `{ content, modelId, inputTokens: z.number(), outputTokens: z.number(), durationMs }`(`schema.ts:23-29`; safeParse 실패 시 null 반환 → 누적 텍스트 유지 `ai-chat-sheet.tsx:94`), `error` → `{ code, message }` throw (`schema.ts:31-34`) | `aiCompletionSchema`: `provider` enum, `modelId 1..100`, `messages 1..100` 각 `role ∈ system\|user\|assistant`, **`content 1..100000`**, `promptIds?`, `featureKey ≤50`, `maxTokens?`, `temperature?` (`dto/ai/chat.ts:13-26`); system 역할 메시지는 `system` 으로 합쳐짐 (`service/domain/ai/ai-chat.ts:73-86`); SSE: `event: delta` `data: {"text"}`, `event: done` `data: { content, modelId, inputTokens: number\|**null**, outputTokens: number\|**null**, durationMs }`, `event: error` `data: { code, message }` (`route/ai/chat.ts:33-46`, `ai-chat.ts:15-22,297-307`); 스트림 전 에러(401/404/429/502)는 JSON 봉투 | 토큰 null 은 anthropic/ollama/codex 모두 가능 (`providers/*.ts`) → M20 |
| `/api/ai/sessions*`, `/api/ai/prompts*`, `/api/ai/attachments*`, `/api/ai/completions`(비스트림) | **사용 없음** | | | | |

### 2.4 b-hub 가 아닌 로컬 경로 (혼동 방지)

- `POST /api/resume/:id/pdf` — Rirekisyo 자체 Next Route Handler (`src/app/api/resume/[id]/pdf/route.ts`), 호출 `src/features/resume-view/resume-view.tsx:21`, `view-toolbar.tsx:30`(credentials 없음, 상대경로). b-hub 와 무관.

### 2.5 타이밍 가정

- 폴링 없음. 스트림은 사용자 중단(`AbortController`)만, 타임아웃 없음.
- TanStack 기본 staleTime(프로젝트 provider 설정 `src/lib/query-provider.tsx`) 외 별도 가정 없음.

---

## 3. hn-alert (`~/development/hn-alert`, branch `dev`, Hono SSR on Vercel)

판정: **런타임 소비자이지만 대상 도메인이 b-hub 에 없다.** b-hub 는 커밋 `c0f8fdb`(2026-04-03 22:04 KST) 에서 `route/hn`·`dto/hn`·`service/domain/hn`·`compose/hn.ts`·HN 테이블 7개를 전부 삭제했고 `route/index.ts:73-435` 에 `/hn` 마운트가 없다. hn-alert 마지막 커밋은 2026-02-25(`a6e21f0`), README 는 "(paused) api 수리중". 현재 모든 페이지는 `apiFetch` 가 `API error: 404` 를 throw → `app.onError` 500 (`app.ts:8-11`, `/subscribe` 정적 페이지 제외). 아래는 **복구 시 지켜야 할 계약**으로 기록한다.

| 항목 | 값 | 근거 |
|------|----|------|
| base | `HUB_API_URL ?? 'https://api.gumyo.net'` + `/api/hn` | `config/env.ts:2`, `lib/api-client.ts:3,11` |
| 자격 | 없음(서버측 `fetch`, 쿠키/헤더 없음); `!res.ok` → throw; `json.data` 언랩 | `lib/api-client.ts:10-15` |

| 메서드·경로 | 호출 | 쿼리 | 읽는 `data` 필드 |
|-------------|------|------|------------------|
| `GET /api/hn/stories?page&limit[&type]` | `lib/api-client.ts:17-21`; 홈 `routes/pages.tsx:27-28` (`type ∈ top\|new\|best`, `limit=100`) | `page`, `limit`, `type` | `stories: StoryWithSummary[]`(`types/hn.ts:1-25,69-71` — `id, title, titleKo, url, by, score, descendants, time, tags, storyText(Ko), contentSummary(Ko), summary{summary,tags}`), `page`, `limit` |
| `GET /api/hn/stories/counts` | `api-client.ts:27-29`; `pages.tsx:29,33-35` | — | `counts: [{ type, count }]` |
| `GET /api/hn/stories/:id` | `api-client.ts:23-25`; `pages.tsx:94-97,112-162` | — | `story`(위 필드), `summary \| null`(`summary`, `tags`), `comments[]`(`types/hn.ts:27-38`: `id, parentId, by, commentText, time, depth, dead, deleted`) |
| `GET /api/hn/digests?type&limit` | `api-client.ts:31-34`; `pages.tsx:30`(daily 1), `:186`(daily 30), `:248`(weekly 12), `:311`(monthly 12) | `type`, `limit` | `digests[]`(`types/hn.ts:51-59`: `id, digestType, digestKey, title, content, storyIds`) |
| `GET /api/hn/digests/:type/:key` | `api-client.ts:36-38`; `pages.tsx:212,274,337` | — | `digest{title, content}`, `stories[]`(summary 포함) |
| `GET /api/hn/tags` | `api-client.ts:40-42`; `pages.tsx:396,402-408` | — | `tags[]`(`types/hn.ts:61-67`: `id, name, usageCount`) |
| `GET /api/hn/tags/:name/stories?page&limit` | `api-client.ts:44-49`; `pages.tsx:376-377`(limit 50) | `page`, `limit`, 경로 `encodeURIComponent(name)` | `stories[]`, `summaries[]`(`storyId` 로 매핑) |
| `GET /api/hn/search?q&limit` | `api-client.ts:51-54` | — | 정의만, 페이지 호출 없음 |
| `POST /api/hn/webhooks/public/register` | 브라우저 인라인 스크립트 `routes/pages.tsx:505,515-531` | JSON `{ url, digestTypes: ('daily'\|'weekly'\|'monthly')[] }` | `res.ok` 분기; 실패 시 `data.error?.message` |
| `POST /api/hn/webhooks/public/unregister` | `pages.tsx:587-600` | JSON `{ url }` | 동일 |

- 웹훅 2개는 브라우저 → api.gumyo.net 직접 호출이므로 hn-alert 오리진의 CORS 허용이 필요하다(오리진은 레포에 없음).
- `drizzle/` 잔재(`drizzle/meta/*`)는 8f07276 "Update project to using api instead of drizzle" 이전 흔적이며 런타임 미사용.

---

## 4. Banga (`~/development/Banga`, branch `vercel`, Next.js 16 · better-auth 1.4.20)

판정: **auth 전용 런타임 소비자.** 다른 b-hub 도메인 호출 없음(`grep fetch(` 결과 3곳: 세션 확인, 이미지 프록시, 자체 `/api/search`).

| 항목 | 값 | 근거 |
|------|----|------|
| 리라이트 프록시 | Next `rewrites`: `/api/auth/:path*` → `https://api.gumyo.net/api/auth/:path*` (개발 `http://localhost:9999`) — 브라우저는 Banga 오리진만 본다 | `app/www/next.config.ts:23-30` |
| 클라이언트 | `createAuthClient()` **baseURL 없음** → 동일 오리진 `/api/auth/*` → 리라이트 | `app/www/src/lib/auth/auth-client.ts:1-3` |
| 로그인 | `signIn.social({ provider: 'github' \| 'google', callbackURL: window.location.origin })` | `app/www/src/app/(auth)/login/page.tsx:8,19,27` |
| 서버 세션 | `cookies().toString()` 비면 null; `GET ${API_URL}/api/auth/get-session` 헤더 `Cookie: <전체 쿠키>`, `cache: 'no-store'`; `!res.ok` → null; `!data?.user` → null; 반환 `data as { user: { id, name, email, role, image } }` | `app/www/src/lib/auth/session.ts:4-39` |
| 인가 | `session.user.role !== 'admin'` → `/login` 리다이렉트; 표시 `session.user.name` | `app/www/src/app/(protected)/layout.tsx:10-12,29` |
| 로그아웃 | `<a href='/api/auth/sign-out'>` — **GET** | `layout.tsx:32` |
| 소비 오리진 | 레포에 없음(`robots.ts` 전체 disallow) | `app/www/src/app/robots.ts` |

b-hub 측 의존 요소:

1. `GET /api/auth/get-session` 응답 최상위 `user` 객체와 그 안의 **`role`**(admin 플러그인, `service/shared/auth-provider.ts:47-51`), `name`. `session` 객체는 타입만.
2. 쿠키: `__Secure-better-auth.session_token`, `Domain=.gumyo.net`(프로덕션), `SameSite=Lax`. 리라이트는 upstream `Set-Cookie` 를 그대로 전달하므로 **Banga 호스트가 `*.gumyo.net` 이어야** 브라우저가 쿠키를 수락한다. 개발은 `localhost:9999` 직결(쿠키 `Domain` 없음, `__Secure-` 접두 없음).
3. `callbackURL` = Banga 오리진 → better-auth `trustedOrigins`(`*.gumyo.net`/`*.hyns.dev`/`*.seok.dev`) 안이어야 함. OAuth 콜백은 b-hub `baseURL` 기준 `https://api.gumyo.net/api/auth/callback/:provider` 로 돌아온 뒤 callbackURL 로 302.
4. 에러 코드·응답 헤더·타이밍 가정 없음.

---

## 5. nextjs-portfolio (`~/development/nextjs-portfolio`, branch `dev`)

판정: **b-hub docs-only.** `api.gumyo.net` 호출 코드 없음(`grep fetch(` 0건). 근거 정리:

| 항목 | 내용 | 근거 |
|------|------|------|
| `X-Weather-Key` | 마크다운 설명문에만 등장 | `toy/ja/09-esp32-weather.md:31,88` (ko 도 동일) |
| 런타임 외부 의존 | `https://badge.hyns.dev/api/image?width&height&text&font=JetBrains Mono&fontSize=32&fontWeight=600&color&backgroundColor&iconSize=28&tailwind=rounded gap-2 antialiased tracking-tighter[&icon\|&iconUrl]` 를 `next/image unoptimized` 로 렌더 | `entities/project/stack-tokens.ts:100-119`, `features/a4/a4-page.tsx:51-59`, `next.config.ts:17` |
| 마크다운 내 배지 | `toy/**/*.md` 의 `<img src="https://badge.hyns.dev/api/image?...">` 를 `rehype-raw` 로 그대로 출력 | `entities/content/content.api.ts:49-61` |
| badge.hyns.dev 정체 | 별도 레포 `B-HS/Badge`(이전 세대, 비소비자 판정 `b-hub docs/acknowledge/2026-09-06-consumer-repos-and-compat.md:26`); 포트폴리오도 소스를 B-HS/Badge 로 명시 | `content/projects/03-badge/01.json:10-11` |
| b-hub 배지 경로 | `/api/badge/image`, `/api/badge/fonts` — `/api/image` 경로는 b-hub 에 없음 | `route/index.ts:86-92`, `route/badge.ts:24-25,119-120` |

참고: 두 서비스의 쿼리 파라미터 이름(`width,height,text,font,fontSize,fontWeight,color,backgroundColor,icon,iconUrl,iconSize,tailwind`)이 b-hub `badgeImageQuerySchema`(`dto/badge.ts:163-189`)와 일치한다. badge.hyns.dev 를 b-hub 로 옮길 계획이 있다면 `/api/image → /api/badge/image` 리라이트와 파라미터 의미 보존이 계약이 된다. 현 시점 b-hub 리팩토링과는 무관.

---

## 6. Mismatches / fragile dependencies

심각도: **H**(현재 동작 불가 또는 리팩토링 시 즉시 파손) / **M**(부분 오동작·오표시) / **L**(타입·문서 불일치, 동작 영향 없음).

### 공통

- **M1 [H] Zod 검증 실패 봉투가 문서화된 에러 봉투와 다름.** `validator()` 실패는 `{ data, error: issues[], success: false }`(400) — `@hono/standard-validator dist/index.mjs:131-138`. Storage `entities/drive/error.ts:26-32` 는 `error.error.code`→undefined→`error.error.message`→undefined 를 toast; Rirekisyo `src/lib/api-client.ts:10` 는 `new Error(undefined)`(빈 메시지), `src/entities/ai/schema.ts:36-39` 봉투 파싱 실패→고정 문구. 리팩토링에서 이를 `{ code:'VALIDATION_ERROR', message }` 로 통일하면 소비자 표시가 **좋아지는 방향**이므로 안전하나, 400 상태와 `success:false` 는 유지해야 한다.
- **M33 [H] 세션 쿠키 계약.** `__Secure-better-auth.session_token` · `Domain=.gumyo.net` · `SameSite=Lax` · `Path=/` (`better-auth cookies/index.mjs:21-40`, `service/shared/auth-provider.ts:54-58`). Storage 서버 fetch(`shared/api/fetch.ts:11-18`), Banga(`session.ts:17-25`), upload-server(`auth.ts:14-16`, 미사용)가 쿠키 문자열 전체를 전달한다. `cookiePrefix`·`crossSubDomainCookies`·`BASE_URL` 프로토콜 변경은 전 소비자 파손.
- **M34 [H] CORS + credentials.** Storage(`storage.gumyo.net`), Rirekisyo(오리진 미상, `*.gumyo.net`/`*.hyns.dev` 여야 함)는 `credentials: 'include'` 로 직접 호출(`upload.ts:53`, `download.ts:4`, `api-client.ts:6`, `entities/ai/api.ts:89`). `middleware/index.ts:17-37` 의 allowlist·`credentials: true` 유지 필요. Banga 는 리라이트라 CORS 불필요.
- **M13 [L] `get-session` 무세션 응답 = 200 + `null`.** Storage(`entities/auth/api.ts:16-17`, TypeError→catch→null)·Banga(`session.ts:33`)·upload-server 모두 `null`/`!ok` 를 처리한다. 200+`{}` 로 바꿔도 falsy 처리되나, 200+`{ user: null }` 이외의 형태(예: `{ success:false }`)로 감싸면 안 된다.

### Storage

- **M5 [H] 루트 폴더 센티널 `folderId='root'`.** Storage 가 문자열 `'root'` 를 보냄(`storage-layout.tsx:109,113`, `storage-content.tsx:17`); b-hub 는 `compose/drive.ts:157-163` 에서 리터럴 비교. `dto/drive/asset.ts:7` 에 `z.string()` 만 있어 Zod 로 표현되지 않은 계약. 반면 폴더 목록의 루트는 `parentId` **생략**(`api.ts:27`)으로 비대칭.
- **M3 [M] 크기 상한 3중 불일치.** Storage 클라이언트 100 GiB(`upload.ts:4`) vs upload-server 10 GiB 413(`index.ts:15,119-122,148`) vs b-hub `prepare` 크기 검사 없음(쿼터만) vs L1 100 MiB(`index.ts:23`). 100 MiB 초과는 L3 전용 → 상세 `url` 이 상대경로 `/api/drive/assets/:id/download`(`drive-asset.ts:433`) — 다운로드는 `download.ts:16-17` 이 처리하지만 **이미지 미리보기·상세 패널은 상대경로를 `next/image` 에 그대로 넣어 Storage 오리진 404**(`image-preview.tsx:32`, `file-detail-panel.tsx:34`). `url` 의 절대/상대 규칙을 바꾸면 `download.ts:16` 의 `startsWith('/api/')` 분기가 깨진다.
- **M2 [M] 기본 쿼터 10 MiB.** `user.storage_quota_bytes`(nullable, `db/schema.ts:40`) 가 없으면 `compose/drive.ts:227` 이 10 MiB 로 폴백 → `prepare` 가 `DRIVE_QUOTA_EXCEEDED`. Storage 는 `quota.total` 을 그대로 표시(`quota-bar.tsx:10,23`).
- **M7 [M] `/status`·`/complete` 는 secret 검사 없음, `/gdrive-token` 만 검사**(`route/drive/asset.ts:78-113` vs `:127`). upload-server 는 세 호출 모두 `Authorization: Bearer <secret>` 을 보냄(`upload-handler.ts:60,75,102,165`)이라 검사를 추가해도 통과하나, `/status` 는 fire-and-forget(`:77`)이라 실패가 숨는다. `uploadToken` 검증 순서(토큰→상태)와 에러 코드(`UNAUTHORIZED`/`DRIVE_UPLOAD_EVENT_FAILED`/`VALIDATION_ERROR`)는 upload-server 가 분기하지 않으므로 상태 코드만 2xx/비2xx 로 유지하면 된다.
- **M8 [L] `prepare` 무검증 본문.** `route/drive/asset.ts:66-73` 은 `body.originalName` 등을 직접 사용(`sizeBytes` 는 `Number()`). Storage 는 5개 필드를 항상 보낸다(`upload.ts:54-60`). validator 추가 시 M1 봉투로 바뀌지만 Storage 는 `!json.success` → throw 라 동작은 동일.
- **M9 [M] 전 계층 실패 시퀀스.** upload-server 는 `storageTiers=''` 로 `complete` 를 먼저 호출(b-hub 가 `failed` 로 마킹, `drive-asset.ts:380`)한 뒤 500 을 돌려준다(`upload-handler.ts:162-186`). Storage 는 실패 toast 후 목록 무효화(`storage-layout.tsx:234-238`) → "업로드 실패" 행이 최대 10분 보임(`compose/drive.ts:149-153`). 스테일 필터 시간을 바꾸면 UI 노출 시간이 바뀐다.
- **M4 [L] 반환 필드 축소.** `POST /folders` → `{id,userId,parentId,name}`(`drive-folder.ts:80`, 타입은 `DriveFolder` 6필드 `type.ts:1-8`), `PATCH /folders/:id` → `{id}`(`:143`), `PATCH /assets/:id` → `{id,...}`(`drive-asset.ts:496`, 소비자 타입 void), `DELETE` → `{id}`. Storage 는 전부 무효화만 하므로 동작 영향 없음. 단 `POST /folders` 의 **201** 은 Storage 가 상태를 안 보므로 200 으로 바꿔도 무방.
- **M11 [L] 다운로드 헤더.** `Content-Disposition: attachment; filename="<percent-encoded>"`(`asset.ts:248`) — `filename*` 없음 → 비ASCII 파일명이 인코딩된 채 저장될 수 있음. Storage 의 `a.download`(`download.ts:21`)는 cross-origin 이라 무시됨. `Content-Length`·`Content-Type` 은 Storage 가 읽지 않는다.
- **M12 [L]** Storage 는 `pagination.totalPages` 를 읽지 않고 `total/limit` 로 계산(`file-grid.tsx:25`, `file-list.tsx:22`). `page,limit,total` 3개만 유지하면 된다.
- **M35 [H] 에러 코드 문자열 고정.** `entities/drive/type.ts:80-91` 의 11개 코드 값(특히 `UNAUTHORIZED` — `/login` 리다이렉트 트리거 `query.ts:31`). 상태 코드 변경은 Storage 에 영향 없음(prepare/상세는 `res.ok` 만).
- **M6 [L, 소비자 결함]** Server Action 경유 뮤테이션은 에러 shape 를 잃는다(`docs/security-audit-2026-07-10.md:21`). b-hub 가 어떤 코드를 내려도 폴더/에셋 뮤테이션은 `errorUnknown` 만 표시된다 — 계약 검증 시 "동작 확인" 대상은 prepare·upload-server·상세 조회로 한정.
- **M10 [L]** upload-server CORS 는 `gumyo.net`/`hyns.dev` 서브도메인만(`index.ts:14,72-78`); Storage XHR 은 credentials 를 안 쓰므로 `credentials:true` 는 불필요하나 무해.
- **M14 [L]** `entities/auth/api.ts:23-25` 의 서버측 `signOut` 은 호출처 없음(`storage-content.tsx:4` 는 `getSession` 만 import). 실제 로그아웃은 better-auth 클라이언트 POST.

### Rirekisyo

- **M15 [H] 履歴書 스키마 필드명 불일치 — 현재 생성/수정이 400 으로 실패.** 소비자 `commuting_time`(`src/entities/resume/types.ts:29`, `constants.ts:41`, 폼 `resume-form.tsx:168`, 커밋 bab26d7 2026-03-12 01:10) vs b-hub 필수 `commuting_hours`+`commuting_minutes`(`dto/resume/resume-data.ts:31-32`, 최초 커밋 d792203 2026-03-12 01:15 이후 불변). `POST /api/resume`(type resume)·`PATCH /api/resume/:id`(data 포함) 모두 `resumeDataSchema` 실패 → M1 봉투 → 빈 toast. `resume-api.md:71-72` 는 b-hub 이름을 문서화하고 있어 문서-코드 불일치. 해결은 소비자 수정 또는 b-hub 가 두 필드를 optional 로 완화하는 것(후자는 다른 소비자 /manage JSON 편집기와 호환 확인 필요).
- **M16 [H] `type='web'` 미인지.** b-hub 가 2026-08-29(`2572781`) 에 `web` 타입을 추가(`dto/resume/resume.ts:4`). `GET /api/resume`(type 없음)가 web 행을 돌려주면 사이드바는 "CV" 로 라벨(`app-sidebar.tsx:92`), 상세 페이지는 `CvView` 에 web 데이터를 넣어 `data.experience.environments` 접근에서 **렌더 크래시**(`[id]/page.tsx:29-33`, `cv-view.tsx:81`), AI 컨텍스트에 web JSON 이 그대로 섞임(`ai-chat-sheet.tsx:21-29,48`). 영향 범위는 web 행을 가진 사용자(어드민 계정)뿐. b-hub 가 `type` 필터 없는 목록에서 web 을 제외하면 완화되지만 이는 계약 변경(RESUME 레포 확인 필요).
- **M17 [M] 페이지네이션 무시.** `clientFetch` 가 `json.data` 만 반환(`api-client.ts:11`) → 이력서 20건 초과분 미표시(`dto/resume/resume.ts:37` 기본 limit). 기본 limit 을 줄이면 표시 개수가 줄어든다.
- **M19 [H] AI `displayName` null.** b-hub 프로바이더/모델 응답의 `displayName` 은 nullable(`route/ai/connection.ts:23`, `ai-connection.ts:95`, `page/manage/pages/ai.tsx:158`; 모델 `providers/anthropic-provider.ts:109`) vs 소비자 `z.string()`(`src/entities/ai/schema.ts:7,14`). null 이면 Zod 실패 → providers 쿼리 에러 → **AI 패널 전체 숨김**, 모델이면 목록 0개. b-hub 가 null 대신 `provider`/`modelId` 로 폴백해 주면 소비자 무수정 호환.
- **M20 [M] SSE `done` 토큰 null.** `inputTokens/outputTokens: number|null`(`ai-chat.ts:19-20`, 각 provider) vs 소비자 `z.number()`(`schema.ts:26-27`). 실패 시 `streamAiChat` 이 null 을 반환해 누적 delta 텍스트를 유지하므로 치명적이진 않으나 `result.content` 치환이 생략된다.
- **M21 [M] system 역할 메시지 + 크기 상한.** 소비자는 system 메시지 2개를 `messages` 안에 넣는다(`ai-chat-sheet.tsx:75-77`); b-hub 는 이를 `system` 으로 병합(`ai-chat.ts:76-84`). `content ≤ 100000`(`dto/ai/chat.ts:15`) 초과 시 400(M1 봉투). 이력서 JSON 전체(사진은 resume 타입만 제거)가 들어가므로 상한을 낮추면 파손.
- **M23 [L]** `POST /api/ai/:provider/models/refresh` 는 본문 없이 `Content-Type: application/json` 으로 호출됨(`api-client.ts:7`). b-hub 라우트에 `validator('json')` 을 붙이면 빈 본문 400.
- **M22 [L]** API base 는 `/api` 접미 포함(`api-client.ts:1`), auth base 는 미포함(`auth-client.ts:4`) — env 2개 별도.
- **M24 [L]** rate limit 30/min(`compose/ai.ts:281`) 초과 시 429 JSON 봉투 → 소비자가 `message` 표시. `X-RateLimit-*` 미사용.
- **M25 [L]** `res.ok` 미검사 + 무조건 `res.json()`(`api-client.ts:9`) — 비JSON 응답(플랫폼 502 페이지 등)은 SyntaxError toast. 모든 에러 경로를 JSON 으로 유지해야 한다.
- **M18 [L]** 미소유 조회는 `RESUME_NOT_FOUND`(404)(`resume.ts:99-100`); `resume-api.md:537` 의 `RESUME_NOT_OWNER 403` 은 b-hub `ERROR_CODE` 에 없음(문서 stale). 소비자는 코드 분기 없음.

### hn-alert

- **M26 [H] 소비 대상 부재.** `/api/hn/*` 전체가 b-hub 에서 삭제됨(§3). 현재 hn-alert 는 `/subscribe` 외 전 페이지 500. 리팩토링에서 보존할 것은 없으며, HN 도메인을 복구할 경우에만 §3 표(특히 `data` 언랩·`stories/summaries/digests/tags/counts` 키·`types/hn.ts` 필드명·`page/limit` 쿼리)가 계약이 된다.
- **M27 [M]** 웹훅 등록/해제는 브라우저 직접 호출(`pages.tsx:505-600`)이라 복구 시 hn-alert 오리진 CORS 허용과 `{ error: { message } }` 봉투가 필요.

### Banga

- **M28 [M, 소비자 결함]** 로그아웃이 `GET /api/auth/sign-out`(`layout.tsx:32`) — better-auth 는 POST 전용(`sign-out.mjs:4-5`) → 404. b-hub 리팩토링과 무관하지만, b-hub 에 GET 핸들러를 추가하지 않는 한 계속 고장.
- **M29 [H]** `role` 필드 의존(`session.ts:11`, `layout.tsx:12`) — admin 플러그인 제거·`role` 이름 변경·`get-session` 응답 최상위 `user` 형태 변경 시 파손. `compose/shared.ts:35-47` 의 정규화는 Banga 에 영향 없음(원시 better-auth 응답 소비).
- **M31 [M]** Banga 호스트가 `*.gumyo.net` 이 아니면 `Domain=.gumyo.net` 쿠키가 거부되어 로그인 루프. 오리진은 레포에 없어 확인 필요.
- **M30 [L]** 클라이언트 better-auth 1.4.20(`app/www/package.json:13`) vs 서버 1.6.23 — social sign-in/get-session 은 호환.

### nextjs-portfolio

- **M32 [L]** b-hub 런타임 의존 없음. `badge.hyns.dev/api/image` 는 별도 서비스. b-hub 로 이전 시에만 `/api/image` 리라이트와 `dto/badge.ts:163-189` 파라미터 의미 보존이 계약.

---

## 7. 소비자별 "반드시 불변" 요약 (리팩토링 체크리스트용)

| 소비자 | 불변 항목 |
|--------|-----------|
| Storage | `/api/drive/{folders,assets,quota}` 경로·메서드; 목록 쿼리 키(`folderId='root'` 센티널, `page/limit/sort/order/mimeType`); 목록 item 11필드·상세 14필드(특히 `url` 절대/상대 규칙, `thumbnail` data URI, `uploadStatus` 4값); `pagination.{page,limit,total}`; prepare 요청 5필드·응답 `{assetId,s3Key,uploadToken}`; upload-server `/upload` multipart 필드명 4개와 `{success,error}` 응답; 콜백 3종의 본문 필드; `DriveErrorCode` 11개 문자열; 성공 봉투 `success/data`; 세션 쿠키·CORS |
| Rirekisyo | `/api/resume` 5개 라우트, `data` 언랩 가능한 봉투, `type` 값 `resume/cv`(+web 처리 결정 필요), `resumeDataSchema`/`cvDataSchema` 필드(현재 resume 는 M15 로 이미 불일치), `POST` 응답 `{id}`; `/api/ai/providers`(`provider,status,displayName`), `/api/ai/:provider/models`(`modelId,displayName`), `/api/ai/:provider/models/refresh`(본문 없음), `/api/ai/completions/stream` 요청 4필드 + SSE `delta{text}`/`done{content,modelId,inputTokens,outputTokens,durationMs}`/`error{code,message}` + 스트림 전 에러는 JSON 봉투(`content-type: application/json`); 세션 쿠키·CORS |
| hn-alert | (현재 없음) 복구 시 §3 |
| Banga | `/api/auth/*` 경로 전체(리라이트 대상), `get-session` 의 `user.{id,name,email,role,image}`, 쿠키 이름/도메인 |
| nextjs-portfolio | 없음 |

---

## 4. weather 웹 · ESP32 펌웨어 2종

# Consumer contract inventory — b-hub `weather` + `logs` (weather consumers)

Scope: three consumers of `https://api.gumyo.net/api/weather/*` (and, by task premise, `/api/logs*`). All paths below are absolute; line numbers are from the working trees as read on 2026-09-06. No consumer file was modified.

Repos and states read:

| Consumer | Path | Branch @ HEAD | Last commit date | Working tree |
|---|---|---|---|---|
| weather web client | `/Users/hyunseokbyun/development/weather` | `vercel` @ `206a775` | 2026-07-10 | clean |
| ESP32-Weather-API (firmware, newer) | `/Users/hyunseokbyun/development/ESP32-Weather-API` | `dev` @ `b1a5ff3` | 2026-05-26 | clean |
| ESP32-weather (firmware, older) | `/Users/hyunseokbyun/development/ESP32-weather` | `main` @ `efc1fe0` | 2026-04-23 | clean |
| b-hub (server) | `/Users/hyunseokbyun/development/b-hub` | `dev` @ `6e6fed2` | — | clean |

## 0. Headline facts (read these first)

1. **The two firmware repos have byte-identical `src/` trees** (`diff -rq ESP32-Weather-API/src ESP32-weather/src` → no output) and identical `CONTEXT.md` / `platformio.ini`. The on-device HTTP/JSON contract is therefore the same whichever repo the device was flashed from. Differences are non-code: the newer repo adds `.env.example`, `README.md`, and gitignores `include/secrets.h`; the older repo **tracks `include/secrets.h` in git** (`git ls-files include/secrets.h` → tracked; added in `e3b17f9`). Macro names there are `WEATHER_API_URL` and `WEATHER_API_KEY` (`ESP32-weather/include/secrets.h:4-5`); values were deliberately not read into this report. If that repo is or ever becomes public, the weather key must be rotated.
2. **Neither firmware repo contains any `/api/logs` client code.** `grep -rn 'X-Device-Key|/api/logs|LOG_ERR|severity|DEVICE_KEY|logs/batch'` over `*.cpp/*.hpp/*.h/*.ini/*.md` hits only `ESP32-weather/B-HUB_LOGGING-SYSTEM.md` (a design proposal). No `X-Device-Key` header is sent by any consumer today. The `/api/logs` contract below is documented as **latent** (what a future firmware client would have to match) and the design doc's divergences from the real server are listed in §4.
3. **Firmware calls exactly three endpoints**: `GET /weather/current`, `GET /weather/short-term`, `GET /weather/locations/{keyword}` (`ESP32-Weather-API/src/net_weather.cpp:65,89,132`). It does **not** call `/weather/ultra-short` even though `CONTEXT.md:166` lists it.
4. **The "web client" is not Next.js.** It is a Hono JSX SSR app bundled by esbuild for a Vercel Node function (`weather/package.json:5`, `weather/vercel.json:2-6`, `weather/docs/PROCESS.md:4`). All b-hub calls are **server-to-server** from the Vercel function, so browser CORS never applies (`weather/docs/PROCESS.md:37`).
5. Every consumer authenticates with the `X-Weather-Key` header and reads only the `{ success, data }` envelope. **No consumer reads `error.code`**; the web client keys off `res.ok`, the firmware off `code == 200` and `success == true`.
6. **Firmware integer fields must stay JSON integers.** ArduinoJson's `variant | intDefault` returns the default when the JSON value is a float (documented: "Floats are no longer implicitly converted to integers", ArduinoJson 6.11 release notes; `platformio.ini:17` pins `bblanchon/ArduinoJson @ ^7.0.0`). Affected fields: `windDirection`, `humidity` (short-term), `sky`, `pty`, `pop`, `gridX`, `gridY`. A refactor that emits `270.0`-style floats through a different serializer would silently zero these on-device.

---

## 1. b-hub server-side contract (reference for cross-checks)

### 1.1 Mounting, auth, envelope, error order

| Item | Value | Evidence |
|---|---|---|
| API prefix | `/api` | `index.ts:64` `app.route('/api', api)` |
| Weather mounts | `/weather/keys`, `/weather/mock` (non-prod only), `/weather`, `/weather/locations` | `route/index.ts:95-126` (mock gate at `:101`) |
| Logs mounts | `/logs/device-keys`, `/logs` | `route/index.ts:341-355` |
| Weather auth | `requireWeatherKey` on every `/weather` and `/weather/locations` route (`route.use('*')`) | `route/weather/weather.ts:47`, `route/weather/location.ts:22` |
| Header read | `c.req.header('X-Weather-Key')`; missing → `WEATHER_KEY_INVALID`; unknown/expired → `WEATHER_KEY_INVALID`; over quota → `WEATHER_KEY_RATE_LIMIT` | `middleware/require-weather-key.ts:10-17`, expiry at `service/domain/weather/weather-api-key.ts:31` |
| Quota | rolling 24 h `COUNT(*)` of `weather_api_log` rows for the key `< dailyLimit`; default `dailyLimit = 100` | `service/domain/weather/weather-api-key.ts:42-50`, `db/schema.ts:340` |
| Request logging | after `next()`: endpoint, status, ip, user-agent, duration, errorCode → `weather_api_log` (counts toward quota, including 400/404/502 responses; 401/429 thrown before logging do not count) | `middleware/require-weather-key.ts:23-44` |
| Success envelope | `{ success: true, data }` | `lib/api-response.ts:30-33` |
| Domain error envelope | `{ success: false, error: { code, message[, details non-prod] } }` | `lib/api-response.ts:44-51`; emitted by `middleware/error-handler.ts:11-13` (middleware throws) and `lib/with-error-handling.ts:13-15` (handler throws) |
| Validator 400 envelope (different shape) | `{ data: <echoed input>, error: [ issue, ... ], success: false }` with HTTP 400 | `node_modules/@hono/standard-validator/dist/index.mjs:131-138`, wrapped by `node_modules/hono-openapi/dist/index.js:509-518`; measured example in `docs/quality-assurance/fe-deps-impact-check.md:16-58` |
| Check order on `/weather/current|ultra-short|short-term` | key (401/429) → zod query validation (400, array-shape) → coordinate resolution (400 `WEATHER_INVALID_GRID`, envelope-shape) → KMA (502 `WEATHER_KMA_API_ERROR` / 404 `WEATHER_DATA_NOT_FOUND`) | `route/weather/weather.ts:47,71-85` |
| Global middleware | CORS on `/api/*` for `gumyo.net`, `hyns.dev` (+localhost non-prod); security headers; `logCapture` (records 4xx/5xx except `/api/logs`); `errorHandler` | `middleware/index.ts:31-47`, `index.ts:23-29`, `middleware/log-capture.ts:27-28` |
| No body-size / compression middleware | none registered | `middleware/index.ts` (whole file) |

Error code → status → message:

| Code | HTTP | Message | Evidence |
|---|---|---|---|
| `WEATHER_KMA_API_ERROR` | 502 | 기상청 API 호출에 실패했습니다 | `lib/error.ts:41`, `lib/error-message.ts:33` |
| `WEATHER_INVALID_GRID` | 400 | 유효하지 않은 격자 좌표입니다 | `lib/error.ts:42`, `lib/error-message.ts:34` |
| `WEATHER_DATA_NOT_FOUND` | 404 | 기상 데이터를 찾을 수 없습니다 (KMA resultCode `03`) | `lib/error.ts:43`, `service/domain/weather/kma-api.ts:138` |
| `WEATHER_KEY_INVALID` | 401 | 날씨 API 키가 유효하지 않습니다 | `lib/error.ts:44` |
| `WEATHER_KEY_RATE_LIMIT` | 429 | 날씨 API 일일 요청 한도를 초과했습니다 | `lib/error.ts:45` |
| `VALIDATION_ERROR` | 400 | 요청 데이터가 유효하지 않습니다 (keyword > 100 chars) | `lib/error.ts:12`, `route/weather/location.ts:134` |
| `LOG_DEVICE_KEY_INVALID` / `LOG_DEVICE_KEY_RATE_LIMIT` / `LOG_BATCH_TOO_LARGE` | 401 / 429 / 413 | — | `lib/error.ts:101-104` |
| `SERVICE_NOT_CONFIGURED` | 503 | when a compose dep is missing (stub proxy) | `route/index.ts:57-66`, `lib/error.ts:30` |

### 1.2 Query schemas

- `coordinatesQuerySchema`: `nx` int 1..149 optional, `ny` int 1..253 optional, `location` string optional (`dto/weather/weather.ts:3-7`). Coordinates resolve as `nx`+`ny` first, else first `location` search hit, else `WEATHER_INVALID_GRID` (`route/weather/weather.ts:29-42`).
- `/weather/locations/convert` reads `lat`,`lon`,`gridX`,`gridY` raw via `c.req.query` (no zod): `lat&lon` → `{ gridX, gridY, nearestLocation }`; `gridX&gridY` → `{ latitude, longitude, location }`; anything else / NaN → 400 `WEATHER_INVALID_GRID` (`route/weather/location.ts:62-107`). Route is declared before `/:keyword` (`:52` vs `:112`), so the literal keyword `convert` is not searchable.
- `/weather/locations/:keyword`: `keyword.length > 100` → 400 `VALIDATION_ERROR`; search is case-insensitive substring over `level1|level2|level3`; returns full array, **no limit/pagination** (`route/weather/location.ts:133-136`, `service/domain/weather/location.ts:27-32`).

### 1.3 Response data shapes actually emitted (with KMA source category and JS type)

`GET /api/weather/current` — `route/weather/weather.ts:93-101` spreads `parseCurrentWeather` (`service/domain/weather/weather-data.ts:40-61`):

| key | JS type | source | notes |
|---|---|---|---|
| `gridX`, `gridY` | int | resolved coords | |
| `baseDate` | string `YYYYMMDD` | **server-local `new Date()`** (`weather.ts:88-89`) | NOT the KMA base time; on a UTC host this is UTC date — documented pitfall `docs/domains/weather.md:173-174` |
| `baseTime` | string `HH00` | server-local hour (`weather.ts:90`) | same caveat |
| `temperature` | float | `T1H` `parseFloat` | |
| `humidity` | int | `REH` `parseInt` | |
| `rainfall` | float | `RN1` `parseFloat` | |
| `windDirection` | int | `VEC` `parseInt` | |
| `windSpeed` | float | `WSD` `parseFloat` | |
| `windU`, `windV` | float | `UUU`, `VVV` | |
| `pty` | int | `PTY` | **emitted but absent from `currentWeatherResponseSchema`** (`dto/weather/weather.ts:15-29`) and from every consumer type; all consumers ignore it |
| `windDirectionText` | string (16-point `N`..`NNW`) | `getWindDirectionText` (`weather-data.ts:34-38`) | |
| `ptyText` | string | `PTY_CODES` `0:없음 1:비 2:비/눈 3:눈 5:빗방울 6:빗방울눈날림 7:눈날림`, else `알수없음` (`weather-data.ts:9-17,30`) | |

`GET /api/weather/ultra-short` — `{ gridX, gridY, forecasts: [] }` (`weather.ts:146-151`), items from `parseUltraForecasts` (`weather-data.ts:63-92`): `fcstDate` str, `fcstTime` str, `temperature` float (`T1H`), `humidity` int (`REH`), `sky` int (`SKY`, default 1), `pty` int (`PTY`), `rainfall` float (`RN1`), `lightning` float (`LGT`), `windDirection` int (`VEC`), `windSpeed` float (`WSD`), `skyText` (`1:맑음 3:구름많음 4:흐림`, else `알수없음`; `weather-data.ts:3-7,29`), `ptyText` (ultra set), `windDirectionText`. **No nulls** (all `|| 0`).

`GET /api/weather/short-term` — `{ gridX, gridY, forecasts: [] }` (`weather.ts:196-201`), items from `parseShortForecasts` (`weather-data.ts:94-128`):

| key | JS type | source |
|---|---|---|
| `fcstDate`, `fcstTime` | string | |
| `temperature` | float \| **null** | `TMP` |
| `tempMin`, `tempMax` | float \| **null** | `TMN`, `TMX` (only on the 0600/1500 slots) |
| `humidity` | int \| **null** | `REH` |
| `sky` | int (default 1) | `SKY` |
| `pty` | int (default 0) | `PTY` |
| `pop` | int \| **null** | `POP` |
| `rainfall`, `snowfall` | string \| **null** | `PCP`, `SNO` raw KMA text (e.g. `강수없음`, `1.0mm`) |
| `windDirection` | int | `VEC` |
| `windSpeed` | float | `WSD` |
| `skyText` | string | as above |
| `ptyText` | string | **short set** `0:없음 1:비 2:비/눈 3:눈 4:소나기` (`weather-data.ts:19-25,31`) |
| `windDirectionText` | string | |
| `rainfallText`, `snowfallText` | string | `PCP`/`SNO` or `강수없음`/`적설없음` |

Schema declared at `dto/weather/weather.ts:53-78` matches the above nullability exactly.

`GET /api/weather/locations/:keyword` and `GET /api/weather/locations` — `data: LocationData[]`, item = `{ code: string, level1: string, level2: string|null, level3: string|null, gridX: int, gridY: int, longitude: float, latitude: float }` (`dto/weather/location.ts:3-12`), straight from `masterdata/locations.json`. Measured: 3,834 items; `level2` null in 19, `level3` null in 271, no empty strings.

`GET /api/weather/locations/convert?gridX&gridY` — `{ latitude: float, longitude: float, location: LocationData|null }` (`route/weather/location.ts:98-104`, schema `dto/weather/location.ts:29-33`).

`GET /api/weather/version?ftype=ODAM|VSRT|SHRT` — `{ filetype, version }` (`weather.ts:227-239`). **Unused by all three consumers.**

### 1.4 Upstream/caching behaviour visible to consumers

- KMA fetch: 3 attempts, delay `1000ms × attempt` (`service/domain/weather/kma-api.ts:4-5,156-208`), so a failing upstream can hold a `/short-term` request for roughly 3 s + 3 upstream timeouts before 502.
- Cache: Redis + 30 s in-memory; TTL to next KMA boundary (ncst `:10`, fcst `:45`, vilage next base +10 min), min 30 s; **only successes cached** (`kma-api.ts:7-45,210-220`, `service/shared/redis-cache.ts:24,33`). Consumers polling every 10 min will mostly hit cache.
- `numOfRows`: ncst 10, fcst 60, vilage 1000 (`kma-api.ts:229,248,267`) — vilage drives the ~60 KB `/short-term` body the firmware notes (`ESP32-Weather-API/src/net_weather.cpp:91`).

### 1.5 `/api/logs` device contract (latent — no consumer implements it)

| Item | Value | Evidence |
|---|---|---|
| `POST /api/logs` | header `X-Device-Key`; body = one event; 200 `{ success: true, data: { id } }` | `route/logs/log-event.ts:30-51` |
| `POST /api/logs/batch` | `{ events: [1..50] }`; empty array → 400 (schema `min(1)`); `> 50` → 413 `LOG_BATCH_TOO_LARGE`; 200 `{ success: true, data: { count } }` | `route/logs/log-event.ts:53-77` (`:72`), `dto/logs/log-event.ts:26-28` |
| Auth order | device key (401 `LOG_DEVICE_KEY_INVALID` / 429 `LOG_DEVICE_KEY_RATE_LIMIT`) → body validation (400, array-shape) → batch size (413) | `middleware/require-device-key.ts:10-17`; validator precedes handler at `log-event.ts:68-70` |
| Quota | rolling 24 h count of `log_events` for the key's `deviceId` `< dailyLimit` (default 2000); **key without `deviceId` is unlimited** | `service/domain/logs/device-key.ts:39-48` (`:40`), `docs/reference/db-schema.md:155` |
| Event fields (camelCase) | `service` (1..64, req), `errorCode` (1..64, req), `errorDescription` (≤2000), `severity` (`DEBUG|INFO|WARN|ERROR|FATAL` or int 0..100, default 20; names map `10/20/30/40/50`), `category` (≤64), `deviceId` (≤64), `firmwareVersion` (≤32), `source` (≤32), `correlationId` (≤36), `sessionId` (≤36), `retryCount` (int ≥0), `occurredAt` (coerced date), `details` (object) | `dto/logs/log-event.ts:3-24` |
| Docs | `docs/firmware-logging-contract.md:12-43` matches the code above | |

---

## 2. Consumer A — weather web client (`/Users/hyunseokbyun/development/weather`, branch `vercel`)

### 2.1 Runtime, configuration, transport

| Item | Value | Evidence |
|---|---|---|
| Framework | Hono JSX SSR; esbuild `--platform=node --target=node20`; Vercel single function, `rewrites /(.*) → /api`, `bunVersion 1.x` | `package.json:5`, `vercel.json:2-6` |
| Base URL | `process.env.WEATHER_API_BASE_URL ?? 'https://api.gumyo.net/api'` | `src/pages/index.tsx:99` |
| Key | `process.env.WEATHER_API_KEY ?? ''` → header `X-Weather-Key` on every request (empty string sent if env missing → server 401) | `src/pages/index.tsx:99`, `src/lib/weather-api.ts:18` |
| Fetch | Node `fetch` with `AbortSignal.timeout(8000)`; `!res.ok` → `{ success: false, data: null }` **without reading the body**; any throw (timeout, non-JSON) → same; `res.ok` → `await res.json()` returned as-is | `src/lib/weather-api.ts:5-15` |
| Retry / backoff | none | `src/lib/weather-api.ts` |
| Caching / polling | none. Every page render issues 4 requests in parallel via `Promise.allSettled`; search page issues 1 | `src/pages/index.tsx:40-45,111` |
| Error UX | per-section fallback text; error codes never inspected | `src/pages/index.tsx:69-87,125-130` |
| Location state | cookies `wx`/`wy` (1 year, httpOnly); defaults `nx=60, ny=127` | `src/pages/index.tsx:24-34,102-105,154-155` |
| Env followUps | `getEnv()`/Zod not yet applied; CORS check pending (server-to-server so N/A) | `docs/PROCESS.md:37-38` |

Requests per page view against quota: `GET /` and `GET /weather/:nx/:ny` = 4 key-authenticated calls; with the server default `dailyLimit=100` that is ~25 page views per rolling 24 h.

### 2.2 Endpoint table

| # | Request (exact) | Response fields read (runtime) | Semantics relied on | Evidence |
|---|---|---|---|---|
| A1 | `GET {base}/weather/current?nx={nx}&ny={ny}` | `data.temperature`, `data.ptyText`, `data.humidity`, `data.windSpeed`, `data.windDirectionText`, `data.rainfall`, `data.baseDate`, `data.baseTime` | `ptyText === '없음'` → shown as `맑음` and icon selection by exact strings `눈`, `눈날림`, `비/눈`, `빗방울눈날림` (else rain); `baseDate` compared to KST `YYYYMMDD` for "오늘"; `baseTime` sliced `HH:MM` | `src/lib/weather-api.ts:20`; `src/components/weather/current-weather.tsx:136-138,177-189,196-200`; `src/components/weather/weather-icon.tsx:69-78`; `src/lib/date.ts:23,25` |
| A2 | `GET {base}/weather/ultra-short?nx={nx}&ny={ny}` | `data.forecasts[]`: `fcstDate`, `fcstTime`, `temperature`, `skyText`, `ptyText`, `lightning`, `rainfall` | filter `Number(fcstDate)*10000+Number(fcstTime) >= now`, first 6; `lightning > 0` badge; `rainfall > 0` → `Nmm` | `src/lib/weather-api.ts:22-23`; `src/components/weather/ultra-short-forecast.tsx:18,24-28,45-53`; `src/lib/date.ts:53` |
| A3 | `GET {base}/weather/short-term?nx={nx}&ny={ny}` | `data.forecasts[]`: `fcstDate`, `fcstTime`, `temperature` (null ok), `tempMin`/`tempMax` (null ok), `humidity` (null ok), `pop` (null ok), `skyText`, `ptyText`, `windDirection` (number, 8-arrow bucket), `windSpeed`; also `forecasts.length > 0` gate | `Number(fcstTime) < 1200` AM/PM split; `skyText` majority vote; `ptyText !== '없음'`; `skyText === '구름많음' | '흐림'` for icons; groups by `fcstDate` | `src/lib/weather-api.ts:25-26`; `src/pages/index.tsx:53`; `current-weather.tsx:44-58,64-121`; `daily-forecast.tsx:27-83`; `hourly-forecast.tsx:62-69,100,212-221`; `weather-icon.tsx:69-78` |
| A4 | `GET {base}/weather/locations/{encodeURIComponent(q)}` | `data[]`: `code` (React key), `level1`, `level2`, `level3` (null ok), `gridX`, `gridY` | builds `/weather/{gridX}/{gridY}` links; empty array → "검색 결과가 없습니다" | `src/lib/weather-api.ts:28`; `src/components/weather/location-list.tsx:9-23` |
| A5 | `GET {base}/weather/locations/convert?gridX={nx}&gridY={ny}` | `data.location` (nullable `LocationItem`) | used only for page title; `null` → `(nx, ny)` | `src/lib/weather-api.ts:30-35`; `src/pages/index.tsx:36-37,44,52` |

Declared TS types (superset of runtime reads, used for compile-time only): `src/types/weather.ts:1-12` envelope (`ApiErrorResponse` declared but never used), `:14-28` current (includes `windDirection`, `windU`, `windV`, `gridX`, `gridY`), `:30-50` ultra, `:52-77` short (nullable exactly as server), `:79-88` location.

### 2.3 Test-encoded expectations (`tests/`)

- MSW base `https://api.gumyo.net/api`; auth check on header `X-Weather-Key`, failure body `{ success:false, error:{ code:'WEATHER_KEY_INVALID', message } }` status 401 (`tests/mocks/weather-handlers.ts:3-12`).
- Exact mock bodies that `toEqual` assertions pass through unchanged: current `:14-28`, ultra `:30-65`, short (16 items, `tempMin/tempMax` null except first slot per day, `rainfall:'강수없음'`, `snowfall:'적설없음'`) `:67-110`, locations (`level3: null` case) `:112-133`, convert `{ latitude, longitude, location }` `:154-165`. Handlers `:135-172`.
- `tests/lib/weather-api.test.ts:17-23,26-34,36-44` assert `result.data` deep-equals the mocks (client passes body through untouched); `:46-53` wrong key → `success:false`.
- `tests/pages/weather.test.ts:26,59` expect `12.5°` rendered from `temperature: 12.5`; `:47-49` expect `서울특별시`, `종로구`, `/weather/60/127` from the locations mock.

Unused by the web client: `/weather/version`, `/weather/locations` (all), `/weather/locations/convert?lat&lon`, `/weather/mock/*`, `/api/logs*` (`docs/PROCESS.md:24`).

---

## 3. Consumer B — ESP32-Weather-API (`/Users/hyunseokbyun/development/ESP32-Weather-API`, branch `dev`, **current firmware source**)

### 3.1 Build, libraries, config

| Item | Value | Evidence |
|---|---|---|
| Platform | `espressif32` / `esp32dev` / Arduino framework | `platformio.ini:5-7` |
| JSON lib | `bblanchon/ArduinoJson @ ^7.0.0` (elastic `JsonDocument`, no `StaticJsonDocument` capacity) | `platformio.ini:17`, `src/net_weather.cpp:66,92,107,133` |
| Config macros | `WEATHER_API_URL`, `WEATHER_API_KEY` from `include/secrets.h` (gitignored here; template `.env.example:4-5`) | `src/net_weather.cpp:2,42,65` ; `.gitignore` "Secrets" block |
| Expected `WEATHER_API_URL` | must be `https://api.gumyo.net/api` (code appends `/weather/...`; docs say endpoints are `https://api.gumyo.net/api/weather/{...}`) | `src/net_weather.cpp:65,89,132`, `CONTEXT.md:166` |
| Device | single CYD board, MAC `14:08:08:9f:74:7c` | `CONTEXT.md:24` |

### 3.2 HTTP client behaviour (`src/net_weather.cpp:32-61`, function `httpsGetJson`)

| Aspect | Behaviour | Line |
|---|---|---|
| TLS | `WiFiClientSecure::setInsecure()` — no CA pinning; any valid or invalid cert accepted | `:34` |
| Timeouts | socket `client.setTimeout(10)` (s) and `https.setTimeout(10000)` (ms) → 10 s per request | `:35,37` |
| Headers sent | `X-Weather-Key: <WEATHER_API_KEY>` plus ESP32 `HTTPClient` defaults (not overridden anywhere: no `setUserAgent`, no other `addHeader`) — library defaults are `User-Agent: ESP32HTTPClient`, `Accept-Encoding: identity;q=1,chunked;q=0.1,*;q=0`, `Connection: keep-alive`, `Host` | `:42` |
| Method | `GET` only | `:43` |
| Status handling | **only `200` is success**; any other value (2xx other than 200, 3xx, 4xx, 5xx, negative transport error) → `return false`; the body is never read; no distinction between 401/429/502 | `:44-48` |
| Redirects | library default = do not follow → any 3xx is a failure | `:44` |
| Body | whole body buffered via `https.getString()` (needed because chunked streaming parse produced `InvalidInput`), then `deserializeJson` (optionally with a filter document) | `:50-54`, `CONTEXT.md:185` |
| Parse failure | any `DeserializationError` (incl. `NoMemory`) → `false` | `:55-58` |
| Retry / backoff | **none inside the client**. Callers: boot fetch; link-up refetch; 15-min WiFi reconnect refetch; 10-min auto-refresh; settings-return refetch | `src/main.cpp:600-614,683-691,695-711,740-743` |
| Heap budget | steady free ≈235 KB, min ≈144 KB during a fetch (body `String` + `JsonDocument` + TLS) | `CONTEXT.md:184` |

### 3.3 Endpoint table

**B1 — `GET {WEATHER_API_URL}/weather/current?nx={nx}&ny={ny}`** (`src/net_weather.cpp:64-83`; URL `:65`, no filter `:66-67`)

| JSON path read | ArduinoJson expression | C++ type | Default if missing/wrong type | Line |
|---|---|---|---|---|
| `success` | `doc["success"].as<bool>()` must be `true` else fail | bool | — | `:68-71` |
| `data.temperature` | `d["temperature"] \| 0.0f` | float (int accepted) | 0.0 | `:73` |
| `data.humidity` | `d["humidity"] \| 0.0f` | float (server sends int; ok) | 0.0 | `:74` |
| `data.rainfall` | `d["rainfall"] \| 0.0f` | float | 0.0 | `:75` |
| `data.windDirection` | `d["windDirection"] \| 0` | **int — a JSON float yields 0** | 0 | `:76` |
| `data.windSpeed` | `d["windSpeed"] \| 0.0f` | float | 0.0 | `:77` |
| `data.baseDate` | `(const char*)(d["baseDate"] \| "")` | String | "" | `:78` |
| `data.baseTime` | same | String | "" | `:79` |
| `data.ptyText` | same | String | "" | `:80` |
| `data.windDirectionText` | same | String | "" | `:81` |

Consumption (`src/main.cpp`): `temperature` printed `%.1f` (`:453`); `humidity` `%.0f%%` (`:470`); `windSpeed` `%.1f` (`:471`); `rainfall` `%.0fmm` (`:472`) and `rainfall > 0` forces the rain icon (`:439`); `windDirection` → 16-point compass computed **on-device** (`compass16`, `:252-260,477`) and arrow (`:510`). **`baseDate`, `baseTime`, `ptyText`, `windDirectionText` are stored but never rendered** (no reference in `main.cpp`). Struct: `src/net_weather.hpp:8-18`.

**B2 — `GET {WEATHER_API_URL}/weather/short-term?nx={nx}&ny={ny}`** (`src/net_weather.cpp:85-125`; URL `:89`)

Filter document (`:92-105`) keeps only `success`, `data.forecasts[*].{fcstDate,fcstTime,temperature,humidity,sky,pty,pop}` — every other key is discarded at parse time, so adding fields is memory-safe here.

| JSON path read | Expression | C++ type | Default | Line |
|---|---|---|---|---|
| `success` | `.as<bool>()` true | bool | — | `:109` |
| `data.forecasts` | `.as<JsonArray>()`; iterated in order; **stops after `maxN = WEATHER_HOURLY_MAX = 48`** | array | empty → 0 items but still `true` | `:111-113`, `src/net_weather.hpp:30` |
| `[].fcstDate` | string | String | "" | `:115` |
| `[].fcstTime` | string | String | "" | `:116` |
| `[].temperature` | `\| 0.0f` | float (**null → 0.0**) | 0.0 | `:117` |
| `[].humidity` | `\| 0` | **int** (null → 0) | 0 | `:118` |
| `[].sky` | `\| 0` | **int** | 0 | `:119` |
| `[].pty` | `\| 0` | **int** | 0 | `:120` |
| `[].pop` | `\| 0` | **int** (null → 0) | 0 | `:121` |

Consumption (`src/main.cpp`): start index = first item whose `fcstDate+fcstTime` string compares `>=` `"%04d%02d%02d%02d00"` of NTP-KST now (`:338-347`) — requires `fcstDate` = `YYYYMMDD`, `fcstTime` = `HHMM`, ascending order; today's low/high = min/max of `temperature` over items with `fcstDate == today` (`:349-364`; null-coerced 0.0 would pollute); 14 cells drawn from the start index (`:523-547`); `fcstTime == "0000"` → label `MM/DD` from `fcstDate` chars 4..7 (`:535-538`); otherwise label = `fcstTime` chars 0..1 (`:540-541`); `fcstTime.substring(0,2).toInt()` for day/night icon (`:544`); `sky`/`pty` → glyph (`src/ui_icons.cpp:3-18`: `pty 1|5` rain, `3|7` snow, `2|6` sleet; `sky 1` clear, `3` cloudy, `4` overcast, other → clear; **`pty 4` (소나기, short-term-only code) is not handled and falls through to sky**); `pop` and `humidity` printed `%d%%` (`:301-302`); current-card icon uses `g_hourly[start].sky/pty` (`:437-441`). Both requests must succeed or the previous data is kept ("all-or-nothing", `:366-379`).

**B3 — `GET {WEATHER_API_URL}/weather/locations/{percent-encoded keyword}`** (`src/net_weather.cpp:127-149`; URL `:132`)

- Keyword: trimmed keyboard text, max 24 chars, Hangul mode (`src/ui_location_search.cpp:155,198-203`); empty → no request (`net_weather.cpp:130`); percent-encoding leaves `A-Za-z0-9-_.~` and encodes every other byte, so Korean is sent as UTF-8 `%XX` (`:11-26`).
- **No filter document** → the entire body is materialised in `String` and in `JsonDocument` (`:133-134`).

| JSON path read | Expression | C++ type | Default | Line |
|---|---|---|---|---|
| `success` | `.as<bool>()` true | bool | — | `:135` |
| `data` | `.as<JsonArray>()`; **stops after `LOCATION_SEARCH_MAX = 30`** | array | | `:137-139`, `src/net_weather.hpp:40` |
| `[].gridX`, `[].gridY` | `\| 0` | **int** | 0 | `:141-142` |
| `[].level1/level2/level3` | `(const char*)(… \| "")` | String (**JSON `null` → ""**) | "" | `:143-145` |

Consumption: display name = `level1 [level2] [level3]` joined by spaces (`src/ui_location_search.cpp:51-56`); selecting saves `gridX`,`gridY`,name to NVS (`:239`); `n == 0` → "No results" (`:163-166`); NVS load requires `nx > 0 && ny > 0` (`src/data_prefs.cpp:62-71`), default Seoul 60/127 (`src/main.cpp:69-70`). `code`, `longitude`, `latitude` are never read.

### 3.4 Polling, quota, and lifecycle

| Item | Value | Evidence |
|---|---|---|
| Auto-refresh | every `WEATHER_REFRESH_MS = 10 min` while WiFi is up; each refresh = **2 requests** (`/current` then `/short-term`) | `src/main.cpp:49,366-375,740-743` |
| Extra fetches | boot; every WiFi link-up; reconnect attempts every 15 min while down; returning from settings after a change | `src/main.cpp:600-614,683-711` |
| Scheduled reboots | 00:00 and 12:00 KST → 2 extra boot fetches/day | `src/main.cpp:726-734` |
| Clock | NTP `configTime(9*3600, …)` (KST) before fetch; if NTP fails the start index/low-high are skipped | `src/main.cpp:329,381-386,608` |
| Minimum quota need | 6 refreshes/h × 2 = 288 req/day + 4 (reboots) + reconnects/searches ≈ **300+ per rolling 24 h**. Server default `dailyLimit = 100` (`db/schema.ts:340`) would return 429 after ~8 h, which the firmware renders as "Connected stale" and keeps retrying every 10 min (`src/main.cpp:405,582`). The provisioned key must have a raised limit; the actual value is not visible in any repo. |
| Location search | on demand only; synchronous; 10 s timeout | `src/ui_location_search.cpp:159-175` |
| Logs | **no `/api/logs` client; no `X-Device-Key`** | grep (see §0.2) |

### 3.5 Doc/code drift inside the firmware repo (for awareness)

- `CONTEXT.md:166` lists `ultra-short` among called endpoints; code never calls it.
- `CONTEXT.md:200` says "Data source = KMA direct (HTTP)… b-hub used only for /location/{keyword}" — stale; code uses b-hub for all three.
- `src/net_weather.hpp:4` comment gives base `https://api.gumyo.net/api/weather`; the macro must actually be `…/api` (code appends `/weather/...`).
- `CONTEXT.md:167` records a server fix the firmware relied on (`getBaseDateTime` shifted to KST) — present in b-hub `service/domain/weather/kma-api.ts:86-129`.

---

## 4. Consumer C — ESP32-weather (`/Users/hyunseokbyun/development/ESP32-weather`, branch `main`, older)

### 4.1 Relationship to the current firmware

- `src/**` is byte-identical to ESP32-Weather-API (§0.1). Everything in §3 applies verbatim, same file names and line numbers (`src/net_weather.cpp`, `src/net_weather.hpp`, `src/main.cpp`, `src/ui_icons.cpp`, `src/ui_location_search.cpp`, `src/data_prefs.cpp`).
- History of the API client in this repo: `e3b17f9` (first `net_weather.cpp`) → `f621edf` → `efc1fe0`. The endpoint set was already `/weather/current`, `/weather/short-term`, `/weather/locations/{kw}` at `e3b17f9` (`git show e3b17f9:src/net_weather.cpp` lines 1640,1671,1721 of the diff); the only later change was the `httpsGet(String&)` → `httpsGetJson(JsonDocument&, filter)` refactor; **no JSON key was added/removed across history**. `f728377` (initial) had no network code (demo UI). So any binary ever flashed from either repo speaks the same contract.
- Which one is on the device cannot be determined from the repos (same MAC/serial port in both `CONTEXT.md:24-25`; no version string is compiled in; no OTA/version endpoint). It does not matter for compatibility because the wire contract is identical.

### 4.2 Secrets exposure

- `include/secrets.h` is tracked (`git ls-files`), `.gitignore` has only `.pio/`, `.vscode/`, `.DS_Store`, `backup/*.bin`. Contains `#define WEATHER_API_URL …` and `#define WEATHER_API_KEY …` (`include/secrets.h:4-5`, values not reproduced). Comment at `:3` states the repo is private.

### 4.3 `B-HUB_LOGGING-SYSTEM.md` (design doc only) vs the real `/api/logs` server contract

No code implements this. If a firmware logging client is ever written from this doc, these are the divergences it would hit:

| Design doc says | Server actually requires | Evidence |
|---|---|---|
| Auth: reuse `X-Weather-Key` "(or `X-Device-Key`)", rate limit via `requireWeatherKey` (`B-HUB_LOGGING-SYSTEM.md:65`) | **`X-Device-Key` only**, separate device-key table and rolling-24h quota keyed by `deviceId` | `middleware/require-device-key.ts:10`, `service/domain/logs/device-key.ts:39-48` |
| Body fields **snake_case**: `error_code`, `error_description`, `occurred_at`, `device_id`, `firmware_version`, `session_id`, `correlation_id`, `retry_count` (`:68-84`) | **camelCase**: `errorCode`, `errorDescription`, `occurredAt`, `deviceId`, `firmwareVersion`, `sessionId`, `correlationId`, `retryCount`; unknown snake_case keys are ignored and the required `errorCode` would be missing → **400** | `dto/logs/log-event.ts:7-24` |
| `service: "weather-device"` (`:70`) | any 1..64 chars accepted; server docs suggest `esp32-weather` | `dto/logs/log-event.ts:8`, `docs/firmware-logging-contract.md:29` |
| `firmware_version: "esp32-weather@0.11.0"` or git SHA (`:29,77`) | ≤ 32 chars (full 40-char SHA → 400) | `dto/logs/log-event.ts:17`, `docs/firmware-logging-contract.md:35` |
| batch "about 50" (`:88`) | exactly ≤ 50, else **413 `LOG_BATCH_TOO_LARGE`**; empty → 400 | `route/logs/log-event.ts:72`, `dto/logs/log-event.ts:27` |
| `PATCH /api/logs/:id/resolve` from device (`:94-96`) | admin session only (`withAdmin`) — devices cannot call it | `route/logs/log-event.ts:141-163` |
| severity numeric 10..50 (`:26`) | numeric 0..100 or names accepted; default 20 | `dto/logs/log-event.ts:11-14` |
| Client policy: send `severity >= 30`, ring buffer 32, flush on WiFi recovery (`:113-117`) | consistent with `docs/firmware-logging-contract.md:47-51`; server additionally advises: never re-enqueue on 400, halve batch on 413 | `docs/firmware-logging-contract.md:21,50` |
| 400 body assumed `{success:false, error:{code,message}}` | 400 from validation is `{ data, error: [issues], success:false }` (array), only 401/413/429 use the code/message envelope | `docs/firmware-logging-contract.md:21`, `@hono/standard-validator …/index.mjs:131-138` |

---

## 5. Mismatches / fragile dependencies

Severity: **H** = would break a consumer if changed; **M** = degrades silently; **L** = informational.

1. **[H] Integer-typed JSON numbers (firmware).** `windDirection` (current), `humidity`/`sky`/`pty`/`pop` (short-term), `gridX`/`gridY` (locations) are read with an `int` default; ArduinoJson returns the default (0) for a JSON float. Server currently guarantees ints via `parseInt` (`service/domain/weather/weather-data.ts:47,114-117,120`) and masterdata ints. Any refactor must keep these as integers (no `.toFixed`, no `Number(x).toFixed(1)`, no float rounding). `sky=0` on device maps to the "clear" default glyph; `pop=0` prints `0%`.

2. **[H] Top-level envelope and key names are consumed verbatim by all three consumers**: `success` (JSON boolean), `data`, `data.forecasts` (array, ascending time order), `data.temperature/humidity/rainfall/windDirection/windSpeed/baseDate/baseTime/ptyText/windDirectionText`, `forecasts[].fcstDate/fcstTime/temperature/humidity/sky/pty/pop/tempMin/tempMax/skyText/ptyText/windDirection/windSpeed/lightning/rainfall`, `data[].code/level1/level2/level3/gridX/gridY`, `data.location` (convert). Renaming, nesting, or wrapping in pagination breaks the firmware (no code path to adapt) and the web client. Adding keys is safe for every consumer (firmware without filter just uses more heap on `/current` and `/locations`).

3. **[H] Only HTTP 200 is success for the firmware** (`src/net_weather.cpp:44`); 3xx are not followed. Do not introduce redirects (trailing-slash canonicalisation, `/api` → `/v1`, HTTP→HTTPS is moot), 204/203, or non-200 success codes. The web client accepts any 2xx (`src/lib/weather-api.ts:10`).

4. **[H] `fcstDate`/`fcstTime` and `baseDate`/`baseTime` string formats.** Firmware string-compares `fcstDate+fcstTime` against `YYYYMMDDHH00` and slices characters by index (`src/main.cpp:340-344,535-544`); web client does `Number(fcstDate)*10000+Number(fcstTime)` and `.slice()` (`src/lib/date.ts:23,25,53`). Must remain zero-padded `YYYYMMDD` and `HHMM` strings, not ISO, not numbers. `fcstTime` for a midnight slot must be exactly `"0000"`.

5. **[H] Korean enumeration strings are matched exactly by the web client**: `ptyText` `'없음'`, `'눈'`, `'눈날림'`, `'비/눈'`, `'빗방울눈날림'`; `skyText` `'구름많음'`, `'흐림'` (`weather/src/components/weather/weather-icon.tsx:69-78`, `current-weather.tsx:95,138,159,165`). Changing the code→text tables in `service/domain/weather/weather-data.ts:3-25` (including the unknown fallback `'알수없음'`) changes rendering. Firmware ignores the text fields (uses numeric `sky`/`pty`).

6. **[H] Auth header name `X-Weather-Key` and 401/429 semantics.** Both consumers send only this header. Firmware treats 401/429 identically to any failure and keeps polling every 10 min, so an accidental key invalidation causes an indefinite 6-req/h retry storm per device (also logged to `log_events` by `middleware/log-capture.ts`). Header must stay; a rename would strand the device until reflashed.

7. **[M] Rolling-24h quota vs firmware cadence.** Firmware needs ~300 requests / 24 h (§3.4); default `dailyLimit` is 100 (`db/schema.ts:340`). Whatever key is provisioned must keep a limit ≥ ~350, and the counting semantics (rolling window, counted from `weather_api_log` rows incl. 4xx/5xx after auth) must not tighten. If the refactor changes what `logRequest` records (e.g. skips cached responses or counts per endpoint differently), quota exhaustion behaviour changes.

8. **[M] Unbounded `/weather/locations/:keyword` payload vs firmware heap.** Firmware parses the whole search body with no filter and only truncates to 30 rows after parsing (`src/net_weather.cpp:133-139`), with ~144–235 KB free heap (`CONTEXT.md:184`). Measured server bodies: `서울` → 453 rows / 67,111 bytes (OK), `구` → 1,779 rows / 261,390 bytes, `동` → 2,297 rows / 337,108 bytes (would exceed the largest free block → `getString()`/`deserializeJson` failure → "Search failed"). Pre-existing, but the refactor must not make bodies larger (e.g. adding fields to `LocationData` inflates every search). Capping results server-side is a safe, backward-compatible improvement only if the array shape is unchanged.

9. **[M] `/short-term` body size (~60 KB, `src/net_weather.cpp:91`) and item count.** Firmware caps at 48 items (`src/net_weather.hpp:30`) and reads them in server order; `numOfRows=1000` (`kma-api.ts:267`) and the `Map` insertion order in `parseShortForecasts` (`weather-data.ts:95-107`) define that order (KMA returns ascending). Re-sorting descending or grouping by day would break the start-index selection (`src/main.cpp:338-347`).

10. **[M] Nullable short-term fields are coerced to 0 on the firmware.** `temperature: null` → `0.0` pollutes today's low/high (`src/main.cpp:349-364`); `pop`/`humidity: null` → `0%`. Server today emits `null` only when KMA omits a category (`weather-data.ts:111-117`). Do not start emitting `null` for slots that currently carry values (e.g. by filtering categories) — and conversely do not replace `null` with strings.

11. **[M] Response `baseDate`/`baseTime` on `/current` are server-local wall clock, not KST and not the KMA base time** (`route/weather/weather.ts:87-90`; pitfall documented at `docs/domains/weather.md:173-174`). Web client renders it in the footer and compares `baseDate` to KST today (`current-weather.tsx:196-200`) — currently wrong on a UTC host. Fixing to KST is safe for the format contract (must stay `YYYYMMDD`/`HH00` strings); the firmware does not use these fields.

12. **[L] Undocumented extra field `pty` on `/current`** (`weather-data.ts:57` spread at `weather.ts:99`) is not in `currentWeatherResponseSchema` (`dto/weather/weather.ts:15-29`) nor in any consumer type. Removing it is safe for all three consumers; keeping it is also safe.

13. **[L] Validation-400 body shape differs from the domain-error envelope** (`{ data, error: [ … ], success:false }`; `@hono/standard-validator/dist/index.mjs:131-138`). No consumer parses it (web: `!res.ok` only; firmware: status only), so it is not a compatibility risk today, but consumers that later read `error.code` would find an array.

14. **[L] Firmware TLS has no pinning** (`setInsecure`, `src/net_weather.cpp:34`) and sends `Accept-Encoding: identity` (HTTPClient default). Certificate rotation is safe. Enabling forced gzip/brotli on responses (e.g. a `compress()` middleware ignoring `Accept-Encoding`) would break parsing; today no compression middleware exists (`middleware/index.ts`).

15. **[L] Chunked transfer encoding is what the firmware was tuned against** (`CONTEXT.md:185`, `src/net_weather.cpp:28-31`); both chunked and `Content-Length` bodies work with `getString()`. Switching to HTTP/2-only or streaming with trailers would not (HTTPClient is HTTP/1.1).

16. **[L] `/weather/ultra-short` is used only by the web client** (fields in A2). `/weather/version`, `/weather/locations` (all), `/weather/locations/convert?lat&lon`, `/weather/mock/*` have **no consumer** among the three; they can change freely with respect to these consumers (other b-hub clients not audited here).

17. **[L] The `/api/logs` device contract has no firmware consumer** (§0.2). The only artefact, `ESP32-weather/B-HUB_LOGGING-SYSTEM.md`, is inconsistent with the server on auth header, field casing, and resolve permissions (§4.3). Any change to `/api/logs` breaks nothing in these three repos today; keep `docs/firmware-logging-contract.md` as the source of truth for a future client.

18. **[L] Old repo tracks `include/secrets.h`** (§4.2) — a security finding, not a contract issue; rotate the key if exposure is possible.

---

## 6. Must-keep list for the b-hub refactor (derived from §2–§5)

- `GET /api/weather/current|short-term|ultra-short?nx=&ny=` and `GET /api/weather/locations/{keyword}`, `GET /api/weather/locations/convert?gridX=&gridY=`: same paths, same query names, `X-Weather-Key` header, HTTP 200 on success, no redirects.
- Body: `{ "success": true, "data": … }` with the exact key names in §1.3; `data.forecasts` ascending; `data` for search is a bare array.
- Types: ints stay ints (`windDirection`, `humidity` in short-term, `sky`, `pty`, `pop`, `gridX`, `gridY`); floats may be int-valued; strings `YYYYMMDD` / `HHMM`; `level2`/`level3` may be `null`; short-term nullables exactly as today; Korean text tables unchanged.
- Errors: 401 `WEATHER_KEY_INVALID`, 429 `WEATHER_KEY_RATE_LIMIT`, 400 `WEATHER_INVALID_GRID`, 502 `WEATHER_KMA_API_ERROR`, 404 `WEATHER_DATA_NOT_FOUND` (status codes matter more than codes for these consumers).
- Quota semantics and the device key's raised `dailyLimit` (≥ ~350/rolling 24 h) must survive any `weather_api_log` / rate-limit refactor.
- Keep `/short-term` at or below today's size and `/locations/{keyword}` no larger per item.

---

## 5. dashboard(machboard)

# 소비자 계약 인벤토리 — dashboard (machboard) → b-hub metrics

> 기준: 2026-09-06 실제 파일 검증. 소비자 레포 `/Users/hyunseokbyun/development/dashboard`(branch `dev`, 단일 커밋 `f3c7a33`), 서버 레포 `/Users/hyunseokbyun/development/b-hub`(branch `dev`).
> 표기: `D/` = dashboard 루트, `B/` = b-hub 루트. 모든 주장에 `파일:라인` 을 붙였다.
> 핵심 정정: 이 소비자는 **`X-Metrics-Token` 헤더를 쓰지 않는다.** 수집·조회 모두 `Authorization: Bearer <token>` 이다(`D/crates/core/src/sender.rs:252,257`, `D/crates/core/src/api.rs:218,236,250`). b-hub 는 Bearer 를 먼저 읽고 없을 때만 `X-Metrics-Token` 을 본다(`B/middleware/require-metrics-token.ts:16-17`).

---

## 0. 호출 경로 요약

| 호출 주체 | 코드 | b-hub 엔드포인트 |
|---|---|---|
| 에이전트 루프(desktop tray·agentd 공용) | `D/crates/core/src/agent.rs:129-159` → `Sender::flush` (`sender.rs:213-219`) → `Sender::post` (`sender.rs:247-276`) | `POST /api/metrics/ingest`(1건) / `POST /api/metrics/ingest/batch`(2건 이상) |
| desktop "연결 테스트"/"지금 전송" | `D/apps/desktop/src-tauri/src/commands.rs:112-151` (`send_now`, 실제 이벤트 1건 전송 — `D/docs/desktop.md:137`) | `POST /api/metrics/ingest` |
| desktop 어드민 탭 | `D/apps/desktop/src-tauri/src/commands.rs:153-235` → `AdminClient` (`api.rs:128-258`) | `GET /api/metrics/devices`·`/logs`·`/series`, `GET/POST /api/metrics/tokens`, `DELETE /api/metrics/tokens/:id` |
| 웹뷰(React) | b-hub 를 **직접 fetch 하지 않음**. 전부 Tauri IPC → Rust reqwest (`D/docs/design.md:97`, `D/docs/desktop.md:21`, `D/apps/desktop/src/entities/admin/admin.api.ts:13-29`) | — (CORS 무관) |

agentd(headless)는 admin 을 쓰지 않고 수집만 한다(`D/apps/agentd/src/main.rs:60-84`, `D/docs/design.md:74`).

---

## 1. Config (설정·전송 파라미터)

| 항목 | 값 | 근거 |
|---|---|---|
| 서버 base URL 기본값 | `https://api.gumyo.net` (TOML `server_url`, UI 에서 변경 가능) | `D/crates/core/src/config.rs:15,39`, `D/apps/desktop/src/widgets/settings-form/settings-form-fields.tsx:86-92` |
| base URL 결합 | 끝 `/` 제거 후 상수 경로 접합 (`{base}/api/metrics/...`) | `sender.rs:248-258`, `api.rs:211,232,246` |
| 엔드포인트 경로 (컴파일 타임 상수) | `/api/metrics/ingest`, `/api/metrics/ingest/batch`, `/api/metrics/devices`, `/api/metrics/logs`, `/api/metrics/series`, `/api/metrics/tokens` | `sender.rs:21-22`, `api.rs:9-12` |
| 인증 헤더 | `Authorization: Bearer <token>` (reqwest `bearer_auth`). 수집 = client 토큰(TOML `token`), 어드민 = admin 토큰(TOML `[admin] token`) | `sender.rs:252,257`, `api.rs:218,236,250`, `config.rs:26-33,91-108` |
| Content-Type | `application/json` (reqwest `.json()`), 요청 압축 없음 | `sender.rs:253,258`, `api.rs:251` |
| HTTP 클라이언트 | reqwest **0.13.4**, `default-features=false`, features `rustls`·`json`·`query` 만 → 응답 자동 압축해제 없음, `http2` feature 미포함(HTTP/1.1) | `D/crates/core/Cargo.toml:12`, `D/Cargo.lock:3411-3412` |
| 타임아웃 | **없음**(`Client::builder().build()` 그대로; reqwest 기본 `timeout: None`, `connect_timeout: None`) | `sender.rs:116`, `api.rs:131`; reqwest 0.12.28 vendored `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/reqwest-0.12.28/src/async_impl/client.rs:299,313-314` (0.13.4 는 로컬 미보유, 기본값 동일 문서화) |
| 리다이렉트 | reqwest 기본 정책 = 최대 10회 자동 추종 | reqwest `src/redirect.rs:160-164`, `client.rs:310` |
| User-Agent | 미설정(reqwest 기본은 UA 없음, `.user_agent()` 호출 없음) | `sender.rs:116`, `api.rs:131` |
| 전송 주기 | TOML `interval_sec`, 기본 60. UI 선택지 10/30/60/120/300/600 초. 루프 ticker 는 최소 1초로 clamp(**전송값은 clamp 안 함** — §5-2 참조) | `config.rs:16,42`, `D/apps/desktop/src/shared/lib/constants.ts:26`, `agent.rs:15,123,221-223` |
| 배치 크기 | 1건이면 단건 엔드포인트, 2건 이상이면 batch, 50건씩 청크 | `sender.rs:12,148-151,249-259` |
| payload 크기 자체검사 | 직렬화 **바이트** > 65536 이면 전송 전 스킵 | `sender.rs:14,44-53`, `agent.rs:146-149`, `commands.rs:140-142` |
| 오프라인 큐 | 메모리 `VecDeque` 상한 1000(초과 시 가장 오래된 것 drop) + 디스크 스필 `<data_dir>/machboard/queue.jsonl`(Event JSON 1줄 = 1건, 시작 시 복원·큐 변경마다 재기록) | `sender.rs:16,135-142,278-285,359-386`, `agent.rs:16,225-228` |
| 백오프 | 5s × 2^(연속실패-1), 상한 15분. 성공·drop 시 리셋. `flush()` 는 창 안이면 전송 시도 없음 | `sender.rs:18-19,213-216,300-313` |
| 전송 이력 | 링버퍼 50건(`SendLog{at,ok,status,count,message}`) → UI 표·팝업 | `sender.rs:17,58-65,287-298` |
| 설정 파일 위치 | `<config_dir>/machboard/config.toml` | `config.rs:11-12,85-88` |
| device_id 자동생성 | `<hostname>-<6자리 소문자 영숫자>` 를 `[a-z0-9_-]` 로 sanitize, ≤64자, 빈값이면 `device` | `config.rs:13-14,17,140-170` |
| 연결 테스트 스필 | `<temp_dir>/machboard-connection-test.jsonl` (전후 삭제) | `commands.rs:13,144-149` |
| agentd 서비스 | systemd user unit `Restart=on-failure`, `RestartSec=10` | `D/apps/agentd/src/service.rs:79-99` |

---

## 2. Ingest 계약 (수집)

### 2.1 요청

| 항목 | 클라이언트가 보내는 것 | b-hub 가 요구/처리하는 것 | 일치 |
|---|---|---|---|
| Method/Path (단건) | `POST {base}/api/metrics/ingest`, body = Event 객체 | `route.post('/')` on `/metrics/ingest` → `/api/metrics/ingest` | O (`sender.rs:249-253`; `B/route/metrics/ingest.ts:34-57`, `B/route/index.ts:356-361`, `B/index.ts:64`) |
| Method/Path (배치) | `POST {base}/api/metrics/ingest/batch`, body = `{ "events": [Event, ...] }` (2~50건) | `route.post('/batch')`, `events` 1~50 (`min(1)`, 50 초과 413) | O (`sender.rs:255-258`; `B/route/metrics/ingest.ts:59-89`, `B/dto/metrics/ingest.ts:16-18`, `ingest.ts:84`) |
| 헤더 | `Authorization: Bearer <client token>` | Bearer 우선, 없으면 `X-Metrics-Token` | O (`sender.rs:252`; `B/middleware/require-metrics-token.ts:13-18`) |
| scope | client 토큰 | client scope 요구(admin 토큰도 통과) + rate limit | O (`B/route/metrics/ingest.ts:49,80`, `require-metrics-token.ts:22-29`) |
| 압축/UA/Origin | 없음/없음/없음 | 요구 없음 | O |

### 2.2 Event 바디 (serde `#[serde(rename_all = "camelCase")]`, `sender.rs:25-40`)

직렬화 키 순서는 선언 순서(`deviceId, hostname, os, arch, agentVersion, intervalSec, payload`) — 프로브 출력 `scratchpad/payload-probe/probe-output.txt` 로 확인.

| JSON 키 | Rust 타입 | 값 출처 | 생략 조건 | b-hub Zod (`B/dto/metrics/ingest.ts:6-14`) | 일치 |
|---|---|---|---|---|---|
| `deviceId` | `String` (필수) | `config.device_id` (`agent.rs:200`, `commands.rs:132`) | 없음 | `z.string().min(1).max(64)` | △ 자동생성은 ≤64 보장, **UI 수기 입력은 무검증**(§5-3) |
| `hostname` | `Option<String>` | `sysinfo::System::host_name()` (`agent.rs:201`, `commands.rs:133`) | `None` 이면 키 자체 생략(`skip_serializing_if`) | `z.string().max(255).optional()` | O |
| `os` | `Option<String>` | `System::long_os_version()` 예 `macOS 26.0 Tahoe` (`agent.rs:202`) | 동상 | `z.string().max(64).optional()` | △ 64자 상한은 **절대 낮추면 안 됨**(§5-4) |
| `arch` | `Option<String>` | `Some(System::cpu_arch())` 예 `aarch64` (`agent.rs:203`) | 사실상 항상 존재 | `z.string().max(32).optional()` | O |
| `agentVersion` | `Option<String>` | `"machboard@<CARGO_PKG_VERSION>"` = `machboard@0.1.0` (`agent.rs:19-21,204`, `D/Cargo.toml:3-4`) | 항상 존재 | `z.string().max(64).optional()` | O |
| `intervalSec` | `Option<u64>` | `config.interval_sec` **원값**(clamp 없음) (`agent.rs:205`, `commands.rs:137`) | 항상 존재 | `z.coerce.number().int().positive().max(86400).optional()` | △ 0 또는 >86400 이면 400(§5-2) |
| `payload` | `serde_json::Value` (Object) | `Collector::collect(enabled)` (`metrics.rs:130-183`) | 없음. 켜진 메트릭이 0개면 `{}` | `z.record(z.string(), z.unknown())` (객체 필수) | O |

- `payload` 객체의 키는 serde_json `Map`(BTreeMap) 이라 **알파벳순** 으로 직렬화된다(프로브 출력: `battery, cpu, disk, load, memory, network, process, system, temperature`). 실수는 `json!` 매크로가 f32 를 f64 로 승격해 긴 자릿수(`29.383886337280273`)로 나간다.
- 서버는 `payload` 내부를 검증하지 않고 그대로 Mongo 에 저장한다(`B/service/domain/metrics/log.ts:60-71`, `B/compose/metrics.ts:47-51`). `receivedAt` 은 **서버 시각**(`log.ts:59`) — 클라이언트에 수집 시각 필드가 없어 오프라인 큐 재전송분은 재전송 시각으로 기록된다.

### 2.3 `payload` 구조 (`D/crates/core/src/metrics.rs`)

메트릭 키는 `MetricKind` `snake_case` 문자열 9종(`metrics.rs:18-30,49-61`); 켜진 것만 포함(`metrics.rs:140-181`). 가용성: `load` 는 Windows 제외, `temperature`/`battery` 는 런타임 감지(`metrics.rs:68-97`).

| 키 | 구조 (모든 수치는 JSON number) | 근거 |
|---|---|---|
| `cpu` | `{ usage: f32, core_count: usize, cores: [{ name: str, usage: f32, frequency_mhz: u64 }] }` | `metrics.rs:185-204` |
| `memory` | `{ used, total, available, free, swap_used, swap_total }` (u64 bytes) | `metrics.rs:206-216` |
| `disk` | `{ mounts: [{ mount_point, name, file_system: str, total, available, used: u64, removable: bool }] }` | `metrics.rs:218-239` |
| `network` | `{ interfaces: [{ name: str, rx_total, tx_total, rx_delta, tx_delta: u64 }] }` | `metrics.rs:241-258` |
| `system` | `{ hostname: str\|null, os: str\|null, os_version: str\|null, kernel_version: str\|null, name: str\|null, arch: str, uptime_sec: u64, boot_time: u64 }` | `metrics.rs:325-336` |
| `process` | `{ total: usize, top_cpu: [5×{ pid: u32, name: str, cpu: f32, memory: u64 }], top_memory: [5×동일] }` | `metrics.rs:12,260-289,316-323` |
| `load` | `{ one, five, fifteen: f64 }` | `metrics.rs:338-345` |
| `temperature` | `{ sensors: [{ label: str, celsius: f32 }] }` | `metrics.rs:291-307` |
| `battery` | `{ percent: f32, state: "charging"\|"discharging"\|"empty"\|"full"\|"unknown" }` (배터리 없으면 키 생략) | `metrics.rs:347-362,176-180` |

실측 크기(이 Mac, 18코어, 9종 전부 on, 스크래치 프로브 `scratchpad/payload-probe/probe-output.txt:1-11`): **payload 5,987 B, Event 전체 6,151 B**. 섹션별 network 2,007 / temperature 1,253 / cpu 1,065 / process 832 / disk 329 / system 178 / memory 131 / load 62 / battery 38. 64KB 상한 대비 약 9%. 최악 배치(50 × 64KB) ≈ 3.2MB 로 Vercel 함수 바디 상한(4.5MB) 이내.

### 2.4 응답 처리 (ingest)

| 서버 응답 | 클라이언트 분류 | 큐/백오프 | UI 표기 | 근거 |
|---|---|---|---|---|
| **2xx** (`status.is_success()`) — 바디 **읽지 않음**(`{count}` 미사용) | `Delivered` | 큐 제거, 백오프 리셋, `last_send` 갱신 | `성공`, 상태코드 | `sender.rs:267-269,155-160`, `agent.rs:153-155` |
| 401 / 403 | `Drop{auth:true}` → `last_auth_error` 세팅 | 폐기, 백오프 리셋 | `인증 오류` 배지·빨간 상태점 | `sender.rs:324-328,161-173`, `send-log-view.tsx:79`, `popup-panel.tsx:63-68` |
| 413 (코드 무관) | `TooLarge` → 청크 2건 이상이면 **절반 분할 즉시 재시도**, 1건이면 drop | — / 폐기 | `payload too large, dropped` | `sender.rs:329,174-191` |
| 429 | `Retry` | 청크+남은 청크 전부 큐 앞으로 재인큐, 백오프 증가, 루프 중단 | `백오프 재시도 대기` | `sender.rs:330-333,192-203`, `send-log-view.tsx:16-17,50-55` |
| 5xx (≥500, 503 `SERVICE_NOT_CONFIGURED` 포함) | `Retry` | 동상 | 동상 | `sender.rs:334-337` |
| 네트워크 오류(연결 실패·DNS·TLS·타임아웃 없음) | `Retry{status:None}` | 동상 | 상태 `-` | `sender.rs:262-265` |
| **그 외 전부**(400, 404, 405, 415, 422, 추종되지 않은 3xx 등) | `Drop{auth:false}` — 조용히 폐기 | 폐기, 백오프 리셋 | `실패` + 메시지 | `sender.rs:338-342` |

- 에러 바디 파싱: `error` 가 객체면 `"{status} {error.code} {error.message}"`, 아니면 `"http {status}"` (`sender.rs:346-357`). 400 은 b-hub 가 `{ data, error: [issues], success:false }` 배열 봉투를 주므로(`B/node_modules/@hono/standard-validator/dist/index.mjs:131-137`, `B/docs/metrics-client-contract.md:54`) 메시지는 `http 400` 이 된다. 한국어 `ERROR_MESSAGE`(`B/lib/error-message.ts:101-108`)가 desktop 로그 표에 그대로 노출된다(`send-log-view.tsx:110`).
- 서버측 검사 순서: 토큰(401) → rate limit(429) → 바디 Zod(400) → 크기(413) (`B/route/metrics/ingest.ts:49-53,80-85`, `require-metrics-token.ts:18-29`).
- 테스트가 고정하는 wire 형식: `D/crates/core/tests/sender.rs:19-43`(200+`{success,data:{count}}`), `:45-65`(400 배열 봉투 → drop), `:67-87`(401 `METRICS_TOKEN_INVALID` → drop+auth), `:89-123`(batch 413 `METRICS_BATCH_TOO_LARGE` → 분할 후 단건 200), `:125-141`(네트워크 오류 → 재인큐+스필).

---

## 3. Query 계약 (어드민 조회·토큰)

공통: `Authorization: Bearer <admin token>`; 응답은 `parse_envelope` 가 **`success === true` 이고 `data` 키가 존재**할 때만 `data` 를 역직렬화, 아니면 `CoreError::Api{code,message}` (`api.rs:271-291`). 비-2xx 이면서 JSON 이 아니면 `HTTP_<status>` + 바디 500자(`api.rs:272-281,314-316`). **2xx 인데 JSON 이 아니면(예: 204 빈 바디) `CoreError::Json` 으로 실패.** serde 는 `deny_unknown_fields` 가 없어 **필드 추가는 안전**, 나열된 non-Option 필드 **삭제/개명은 전체 호출 실패**.

| 호출 | 요청 | 쿼리/바디 (클라이언트 실제값) | 서버 스키마 | 클라이언트가 읽는 응답 필드 (필수 = non-Option) | 근거 |
|---|---|---|---|---|---|
| devices | `GET /api/metrics/devices` | 없음 | admin scope | `data: [ Device ]` — 필수 `deviceId:str`, `tokenId:i64`, `tokenAlias:str`, `firstSeenAt:str`, `lastSeenAt:str`, `online:bool`; nullable `hostname`,`os`,`arch`,`agentVersion:str`, `intervalSec:u64` | `api.rs:33-47,140-142`; `B/route/metrics/query.ts:23-56`; UI `device-card.tsx:30-46`, `device-list.tsx:17-20`(10s refetch) |
| admin 토큰 검증 | 위 devices 호출을 그대로 사용 | — | — | 200 이면 성공, 403 `METRICS_TOKEN_FORBIDDEN`/401 이면 등록 롤백 | `commands.rs:218-223`, `admin-register.tsx:20-29`, `tests/api.rs:38-57` |
| logs | `GET /api/metrics/logs` | `deviceId=<선택 디바이스>&limit=30` (`tokenId`,`from`,`to`,`offset` 은 코드상 지원하나 UI 미사용; `from/to` 는 chrono `to_rfc3339()`) | `deviceId ≤64 opt`, `tokenId`, `from/to z.coerce.date`, `limit 1..200 def 50`, `offset ≥0` | `data: [ LogEntry ]` — 필수 `tokenId:i64`,`tokenAlias`,`deviceId`,`payload:Value`,`receivedAt:str`; nullable `hostname`,`os`,`arch`,`agentVersion`. `pagination` 은 **무시** | `api.rs:50-62,145-166`; `admin.query.ts:18-22`, `constants.ts:44`; `B/dto/metrics/query.ts:3-10`, `B/route/metrics/query.ts:58-91`(paginatedResponse) |
| series | `GET /api/metrics/series` | `deviceId&field=<dot-path>&from=<now-1h/6h/24h/7d>&to=<now>&limit=500` (30s refetch) | `deviceId 1..64`, `field ≤128 regex ^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$`, `from/to`, `limit 1..2000 def 500` | `data.points: [ { t:str, v:f64 } ]` — **`v` 필수·숫자**. 디바이스 없으면 404 `METRICS_DEVICE_NOT_FOUND` | `api.rs:65-74,169-183`; `device-detail.tsx:24-25,46-56`, `constants.ts:28-33,41,43`, `payload.ts:1-13`; `B/dto/metrics/query.ts:12-22`, `B/route/metrics/query.ts:93-124`, `B/compose/metrics.ts:90-108` |
| tokens list | `GET /api/metrics/tokens` | 없음 | admin scope | `data: [ TokenInfo ]` — 필수 `id:i64`,`alias`,`scope:str`,`dailyLimit:u64`,`createdAt:str`; nullable `expiresAt`,`lastUsedAt`,`revokedAt` | `api.rs:77-88,186-188`; `B/route/metrics/token.ts:20-50`, `B/dto/metrics/token.ts:17-26`; UI `token-manager.tsx:24-29,139-172` |
| token create | `POST /api/metrics/tokens` | `{ alias, scope: "client"\|"admin", expiresInDays?: u32, dailyLimit?: u64 }` (camelCase, None 은 키 생략) | `alias 1..100`, `scope enum def client`, `expiresInDays 1..3650`, `dailyLimit 1..1000000` | `data: { id:i64, token:str }` | `api.rs:191-205,260-269`, `dto.rs:302-316`; `token-manager.tsx:64-72`; `B/route/metrics/token.ts:52-76`, `B/dto/metrics/token.ts:10-15` |
| token revoke | `DELETE /api/metrics/tokens/{id}` | path 에 i64 | `parseInt`, NaN→400, 없으면 404 `METRICS_TOKEN_NOT_FOUND` | `data` 존재 여부만(`{revoked:true}`). **바디 없는 204 로 바꾸면 실패** | `api.rs:208-225`; `B/route/metrics/token.ts:78-96` |

- 시계열 필드 후보는 **최신 로그 payload 의 모든 number 리프 경로**를 자동 추출(배열 인덱스 포함: `cpu.cores.0.usage`, `disk.mounts.0.used`, `network.interfaces.3.rx_delta`, `temperature.sensors.12.celsius`)하며 기본 선택은 `cpu.usage` (`payload.ts:1-13`, `device-detail.tsx:25,36-42`). 클라이언트는 `limit=500`, `logs limit=30` 을 고정 전송하므로 서버 상한(2000/200)을 그 아래로 내리면 400 이 난다.
- 날짜 문자열은 Rust 에서 파싱하지 않고 FE `dayjs` 로만 파싱(`format.ts:10-15`) — ISO 8601 이면 된다.

---

## 4. 에러 처리 요약 (클라이언트가 의존하는 상태코드·코드)

| b-hub 코드 | 상태 | ingest 경로 동작 | admin 경로 동작 | 근거 |
|---|---|---|---|---|
| `METRICS_TOKEN_INVALID` | 401 | drop + 인증오류 표시 | `CoreError::Api{code}` → toast | `B/lib/error.ts:106`, `sender.rs:324-328`, `api.rs:293-306` |
| `METRICS_TOKEN_FORBIDDEN` | 403 | drop + 인증오류 표시 | admin 등록 실패·롤백 | `error.ts:107`, `commands.rs:221`, `admin-register.tsx:23-28` |
| `METRICS_TOKEN_RATE_LIMIT` | 429 | 재인큐 + 백오프 | (해당 없음) | `error.ts:109`, `sender.rs:330-333` |
| `METRICS_PAYLOAD_TOO_LARGE` / `METRICS_BATCH_TOO_LARGE` | 413 | 절반 분할 / 단건 drop | — | `error.ts:110-111`, `sender.rs:329,174-191` |
| `METRICS_DEVICE_NOT_FOUND` / `METRICS_TOKEN_NOT_FOUND` | 404 | drop(코드 미표시) | `CoreError::Api{code}` | `error.ts:108,112` |
| `VALIDATION_ERROR` (Zod 400, 배열 봉투) | 400 | drop, 메시지 `http 400` | `HTTP_400` | `error.ts:12`, `standard-validator/dist/index.mjs:131-137`, `sender.rs:346-357`, `api.rs:308-311` |
| `INTERNAL_ERROR` / `SERVICE_NOT_CONFIGURED` | 500 / 503 | 재인큐 + 백오프 | `Api{code}` | `B/middleware/error-handler.ts:22`, `B/lib/with-error-handling.ts:24`, `error.ts:30`, `sender.rs:334-337` |
| `METRICS_INGEST_FAILED` | 500 | (정의만 있고 throw 하는 코드 없음) | — | `B/lib/error-code.ts:106`; 사용처 grep 0건 |

클라이언트 UI 는 `status` 숫자만으로 "재시도 중" 을 판정한다: `null \|\| 429 \|\| ≥500` (`send-log-view.tsx:16-17,50-55`). 코드 문자열은 표시용일 뿐 분기에 쓰지 않는다(`sender.rs:322-344` 는 status 만 본다).

---

## 5. MISMATCH · 리팩토링 시 고정해야 할 지점

### 5-1. 헤더 전제 정정 (문서 vs 실제)
- 요청 프롬프트·b-hub 문서(`B/docs/PROCESS.md:62`, `B/docs/domains/metrics.md:42`)는 이 소비자를 `X-Metrics-Token` 사용자로 기술하지만 **실제 코드는 100% `Authorization: Bearer`** 다(`sender.rs:252,257`, `api.rs:218,236,250`). 리팩토링 시 `/api/metrics/*` 에서 `Authorization` 헤더를 다른 인증(better-auth 세션, `withAuth`, `requireApiToken`)이 가로채지 않도록 유지해야 한다. `X-Metrics-Token` 만 남기고 Bearer 를 제거하면 이 소비자 전부 401 → 이벤트 전량 drop.

### 5-2. `intervalSec` 범위 — 클라이언트는 clamp 하지 않고 원값 전송
- 루프 ticker 는 `max(interval_sec, 1)` 로 보정하지만(`agent.rs:221-223`) Event 의 `intervalSec` 는 `config.interval_sec` 원값이다(`agent.rs:205`, `commands.rs:137`). 서버는 `positive().max(86400)` (`B/dto/metrics/ingest.ts:12`). TOML 을 손으로 `interval_sec = 0` 또는 `> 86400` 으로 쓴 agentd 는 **모든 이벤트가 400 → 영구 drop** 되며 UI 에는 `http 400` 만 남는다. desktop UI 는 10~600 만 제공(`constants.ts:26`)해 안전.
- 고정 규칙: 서버가 `intervalSec` 하한을 1 초과로 올리거나(예: `min(10)`) 상한을 낮추면 기존 설정 파일이 깨진다. **현 범위(1..86400, coerce 허용) 유지.**

### 5-3. `deviceId` — UI 수기 입력 무검증
- 설정 화면은 `deviceId.trim()` 만 하고 길이·문자 검증이 없다(`settings-form-fields.tsx:72-73,99-103`). 자동생성값만 `[a-z0-9_-]`·≤64 로 sanitize 된다(`config.rs:151-170`). 사용자가 65자 이상·빈 문자열을 넣으면 400 drop.
- 고정 규칙: 서버 `z.string().min(1).max(64)` 에 **문자 집합 regex 를 추가하지 말 것**(공백·유니코드 ID 가 이미 등록돼 있을 수 있음). `max(64)` 도 내리면 안 됨.

### 5-4. 메타 문자열 상한 — 낮추면 영구 drop
- `os` = `System::long_os_version()` 은 배포판/버전 문자열에 따라 길어질 수 있다(이 Mac `macOS 26.0 Tahoe`). 서버 `os ≤64`, `hostname ≤255`, `arch ≤32`, `agentVersion ≤64` (`B/dto/metrics/ingest.ts:8-11`). 초과 시 400 → 클라이언트는 **메타를 바꿀 수단이 없어** 그 기기는 영원히 전송 실패. 상한은 유지하거나 올리기만 한다.

### 5-5. 크기 검사 의미 차이 (안전 방향이지만 상수 고정 필요)
- 클라이언트: `serde_json::to_vec(payload).len() > 65536` **바이트**(`sender.rs:45-46`). 서버: `JSON.stringify(payload).length > 65536` **UTF-16 코드유닛**, 파싱 후 재직렬화 기준(`B/route/metrics/ingest.ts:22-23`, `B/dto/metrics/ingest.ts:3`). 비ASCII 는 바이트 ≥ 코드유닛, 실수 `95.0`→`95` 로 재직렬화가 더 짧아지므로 클라이언트 검사가 항상 더 엄격 → 현재 불일치 없음.
- 고정 규칙: `METRICS_PAYLOAD_MAX_BYTES` 를 65536 미만으로 내리거나 `>=` 로 바꾸면 클라이언트가 통과시킨 이벤트가 413 이 된다(단건이면 drop, 배치면 무의미한 분할 반복).

### 5-6. 배치 상한 50 과 `min(1)`
- 클라이언트 청크 = 50(`sender.rs:12,149`), 서버 `METRICS_BATCH_MAX = 50`(`B/dto/metrics/ingest.ts:4`, `ingest.ts:84`). 서버 상한을 50 미만으로 내리면 매 flush 마다 413 → 분할 → 추가 왕복. 빈 배치는 클라이언트가 만들지 않는다(`sender.rs:214`).

### 5-7. 상태코드가 곧 재시도 정책 — 코드 변경 = 계약 변경
- 클라이언트는 `error.code` 문자열이 아니라 **HTTP 상태만으로** 분기한다(`sender.rs:322-344`). 따라서
  - 429 를 400/403 등으로 바꾸면 rate-limit 중 이벤트가 **재시도 대신 폐기**된다.
  - 401/403 을 400/404 로 바꾸면 인증 오류 배지가 안 뜨고 조용히 drop 된다.
  - 413 을 400/422 로 바꾸면 배치 분할 로직이 동작하지 않고 50건이 통째로 drop 된다.
  - 5xx/503 은 유지해야 재시도가 된다(`SERVICE_NOT_CONFIGURED` 503 은 현재 올바르게 재시도됨).
  - 새로 3xx 를 내면(경로 정규화·trailing slash 리다이렉트 등) reqwest 가 최대 10회 추종하고, 추종 불가 3xx 는 drop 으로 분류된다. `/api/metrics/*` 는 절대 리다이렉트하지 말 것. `B/vercel.json:5` 의 `/(.*) → /api` rewrite 는 내부 rewrite 라 무관.
- 이는 `B/docs/acknowledge/2026-09-06-consumer-repos-and-compat.md:33` 의 "상태코드 변경 = 계약 변경" 규칙과 정확히 일치한다.

### 5-8. 어드민 응답 봉투·필드 — 삭제/개명 금지, 204 금지
- `parse_envelope` 는 `success:true` + `data` 키를 요구(`api.rs:283-288`). `DELETE /tokens/:id` 를 204 무바디로 바꾸면 `CoreError::Json` 으로 폐기 실패 표시(`api.rs:222-224,272-281`).
- `Device`/`LogEntry`/`TokenInfo`/`SeriesPoint` 의 non-Option 필드(§3 표)는 하나라도 빠지면 **목록 전체가 실패**한다(serde missing field). `dailyLimit` 은 `u64` 라 음수·소수 불가(`api.rs:83`; MySQL `int default 20000` `B/db/schema.ts:1051`), `intervalSec` 는 `Option<u64>` 라 `null` 또는 비음수 정수만(`api.rs:43`).
- `logs` 는 `paginatedResponse` 의 `pagination` 을 무시하므로 `successResponse` 로 바꿔도 깨지지 않지만, `data` 가 배열이어야 한다.

### 5-9. series 배열 인덱스 dot-path — 서버측 잠재 결함 (실행 미검증)
- 클라이언트는 `cpu.cores.0.usage` 같은 **배열 인덱스 경로**를 후보로 제시하고(`payload.ts:4-6`, `device-detail.tsx:37`), 서버 regex 는 숫자 세그먼트를 허용한다(`B/dto/metrics/query.ts:14-18`). Mongo `$match` 의 dot-notation 은 숫자 인덱스를 지원해 문서가 매치되지만, `$project: { v: '$payload.cpu.cores.0.usage' }` (`B/compose/metrics.ts:103`) 는 aggregation 필드 경로에서 숫자를 배열 인덱스로 해석하지 않아 `v` 가 `[]`/missing 으로 나올 가능성이 높다. 그러면 route 가 `v: undefined` 를 직렬화(`query.ts:122`) → Rust `SeriesPoint.v: f64` 역직렬화 실패(`api.rs:65-69`) → 전체 series 호출 실패 → UI 는 "선택한 기간에 데이터가 없습니다"(`device-detail.tsx:113-114`).
- 스칼라 경로(`cpu.usage`, `memory.used`, `load.one`, `battery.percent`, `process.total`, `system.uptime_sec`, `cpu.core_count`)는 정상. Mongo 접속 없이 실행 검증은 못 했으므로 **리팩토링 전 실 쿼리로 확인** 권장. 고치더라도 응답 형식 `{ points:[{t,v}] }` 와 `v` 숫자 필수는 유지.

### 5-10. 타임아웃·UA 부재 — 서버측 운영 변경에 취약
- reqwest 타임아웃이 없어(§1) 서버가 응답을 붙들면 에이전트 루프(`agent.rs:152` 의 `flush().await` 가 `select!` 안)와 IPC 명령(pause/status)이 그 요청이 끝날 때까지 멈춘다. Vercel 함수 maxDuration 이 상한이다. 응답을 오래 붙드는 변경(동기 아카이브·대량 upsert 등)을 ingest 경로에 넣지 말 것.
- User-Agent 헤더가 없다. Vercel Firewall bot-management 나 UA 필수 규칙을 `/api/metrics/*` 에 걸면 전부 차단된다.

### 5-11. 스필 큐 재전송 = 과거 스키마가 계속 들어온다
- `queue.jsonl` 은 Event JSON 을 그대로 저장·재전송한다(`sender.rs:359-386`, `agent.rs:225-228`). 큐 상한 1000건·백오프 15분 조합으로 수 시간~수일 전 이벤트가 나중에 도착할 수 있다. 서버가 새 필수 필드를 추가하면 재전송분이 400 으로 전량 drop 된다. **새 필드는 전부 optional.**

### 5-12. rate limit 산정 기준
- 서버는 Mongo `metrics_logs` 의 rolling 24h 저장 건수 < `dailyLimit`(기본 20000) (`B/service/domain/metrics/token.ts:46-49`, `B/compose/metrics.ts:43`, `B/db/schema.ts:1051`). 10초 주기 = 8,640/일로 안전하지만 agentd 를 1초로 두면 86,400/일 → 429 → 최대 15분 백오프 반복 + 큐 1000 초과분 drop. 아카이브 크론(`B/vercel.json:9`, 7일 핫 보관 `log.ts:8`)은 24h 창 안 문서를 지우지 않으므로 카운트에 영향 없음 — 이 불변식(핫 보관 ≥ 24h)을 유지해야 rate limit 이 갑자기 풀리지 않는다.

### 5-13. 마운트 순서
- `/metrics/ingest` → `/metrics/tokens` → `/metrics`(query) → `/metrics`(archive) 순(`B/route/index.ts:356-381`). 라우터 재구성 시 `/api/metrics/ingest`·`/api/metrics/ingest/batch`·`/api/metrics/tokens/:id`(DELETE) 가 그대로 해석되는지 `B/tests/route/metrics/*.test.ts` 로 확인.

---

## 6. 릴리스·업데이트 상태 (계약 동결 강도 판단)

| 관찰 | 근거 |
|---|---|
| 레포는 단일 커밋 `f3c7a33 feat: machboard 초기 구축`, 태그 없음, CI 워크플로 없음(`.github` 부재) | `git tag`/`git log --all` 출력, `ls .github` 없음 |
| 로컬 빌드 산출물 없음: `target/`·`apps/desktop/dist/`·`bundle/` 부재(전부 gitignore) | `D/.gitignore:1,7-8`, `ls target` 없음 |
| 버전 `0.1.0` (workspace·tauri.conf·package.json 동일), 식별자 `net.gumyo.machboard` | `D/Cargo.toml:3-4`, `D/apps/desktop/src-tauri/tauri.conf.json:3-5`, `D/apps/desktop/package.json:5` |
| 자동 업데이트 없음: `tauri-plugin-updater` 미의존 | `D/apps/desktop/src-tauri/Cargo.toml:19-31` |
| 문서상 "라이브(GUI 실행·`tauri build` 번들) 미검증", "설치/배포 가이드 미완" | `D/docs/desktop.md:131`, `D/docs/PROCESS.md:23-24` |
| b-hub 측 합의: 데스크톱·펌웨어는 "배포된 바이너리 갱신이 어려우므로 요청/응답 필드·타입·크기 상한을 가장 엄격하게 고정" | `B/docs/acknowledge/2026-09-06-consumer-repos-and-compat.md:34` |

판단: 레포 증거만으로는 **배포된 바이너리가 존재한다는 흔적이 없다**(태그·번들·업데이터·릴리스 노트 전무). 다만 (a) agentd 가 systemd 로 headless 서버에 설치돼 있을 가능성은 레포로 확인 불가하고, (b) 스필 큐 재전송(§5-11)과 업데이터 부재 때문에 설령 재빌드하더라도 구버전 이벤트가 계속 도착하며, (c) 사용자 합의(위 acknowledge:34)가 명시적으로 엄격 동결을 요구한다. 따라서 **ingest 계약(§2 전체 + §5-2~5-7)은 동결**로 취급하고, 어드민 조회 계약(§3, §5-8)은 "필드 추가만 허용·삭제/개명/204 금지" 로 고정하는 것이 맞다.

---

## 7. 검증 메모

- 실행한 것: Rust 소스·테스트 정독, b-hub 라우트/DTO/미들웨어/서비스/compose 정독, 스크래치 프로브(`scratchpad/payload-probe`, `machboard-core` 를 path 의존으로 빌드) 로 실제 payload 크기·직렬화 형식 확인. 소비자 레포는 수정하지 않았다.
- 실행하지 못한 것: Mongo 실쿼리(§5-9), reqwest 0.13.4 소스(로컬엔 0.12.28 만 있어 기본값을 그 버전 소스로 인용), 실제 b-hub 서버로의 전송.
