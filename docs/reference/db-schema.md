# DB 스키마 전수 레퍼런스

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 다루는 코드: `db/schema.ts`, `db/index.ts`, `drizzle.config.ts`, `compose/*`, `service/shared/api-token.ts`, `service/domain/weather/weather-api-key.ts`, `service/domain/logs/device-key.ts`, `middleware/request-logger.ts`, `service/shared/auth-provider.ts`, `page/admin/db.ts`, `.gitignore`

## 개요

- 스키마는 단일 파일 `db/schema.ts`(`drizzle-orm/mysql-core`)에 정의된다. 물리 테이블 **총 49개**.
- 클라이언트는 `db/index.ts` 의 `getDb()` 싱글톤 — `mysql2` 풀(`connectionLimit: 20`, `queueLimit: 0`, `uri: DATABASE_URL`) 위에 `drizzle(pool, { schema, mode: 'default' })`. `Database = ReturnType<typeof getDb>`, `closeDb()` 로 풀 종료.
- Drizzle 쿼리는 계층 규칙상 `compose/*`(ServiceDb 인라인 구현)에 둔다. 예외적으로 직접 접근하는 파일: `service/shared/api-token.ts`, `service/domain/weather/weather-api-key.ts`, `service/domain/logs/device-key.ts`, `middleware/request-logger.ts`, 그리고 어드민 읽기 계층 `page/admin/db.ts`. `user`/`session`/`account`/`verification` 은 better-auth(`service/shared/auth-provider.ts` 의 `drizzleAdapter` + `admin` 플러그인)가 관리한다.
- 이 문서는 테이블 인벤토리(물리명·export·컬럼수·인덱스·관계·사용처)만 다룬다. 도메인 로직/엔드포인트는 [../domains/](../domains/), 아키텍처·명령은 [../architecture.md](../architecture.md), 불변 규칙은 [../memory/stack-and-invariants.md](../memory/stack-and-invariants.md) 참조.

## 공통 규칙

### 물리명 ↔ TS 필드 네이밍

- **신규 계열**(better-auth, mail, spotify, calendar, drive, logs, weather, resume, `image_assets`)은 물리 컬럼 **snake_case** ↔ TS 필드 **camelCase**. 예: `r2_key`→`r2Key`, `user_id`→`userId`, `size_bytes`→`sizeBytes`.
- **레거시 블로그 계열**(`posts`, `comments`, `tags`, `categories`, `post_tags`, `images`, `messages`, `message_images`, `message_likes`, `message_bookmarks`, `follows`)은 **물리 컬럼명 자체가 camelCase** 라 TS 필드와 동일하다. 예: `posts.postId`(물리 `postId`), `posts.isPublished`(물리 `isPublished`), `images.fileName`(물리 `fileName`). 단 `created_at`/`updated_at`/`deleted_at` 만 snake_case.
- 같은 블로그 클러스터라도 `image_assets` 는 예외적으로 snake_case(`r2_key`, `mime_type`, `uploaded_by`)를 쓴다.

### 타입 유도

- 셀렉트/인서트 타입은 손으로 적지 않고 `typeof X.$inferSelect` / `$inferInsert` 로 유도한다. 스키마 하단에서 필요분을 export(예: `User`, `Post`, `Comment`, `MailMessage`, `CalendarEvent`, `LogEvent`, `CloudAsset` 등, insert 계열은 `New*`). 전체 목록은 `db/schema.ts` 하단 참조.

### 컬럼 타입·기본값 관례

- **시각 컬럼**: 대부분 `timestamp(col, { fsp: 3 })` + `.defaultNow().notNull()`, `updatedAt` 은 추가로 `.$onUpdate(() => new Date())`. 레거시 블로그 계열과 `calendar_event.dtstart/dtend/dtstamp`·`calendar_subscription.last_accessed_at` 은 `datetime`(기본값 없음 — 앱이 값 설정). `weather_current`/`weather_ultra`/`weather_short`/`weather_api_log` 는 `timestamp`(fsp 없음), `log_events.occurred_at/resolved_at` 은 `datetime({ fsp: 3 })`.
- **PK 타입**: better-auth 4테이블·`image_assets`·`messages`·calendar 4테이블·`drive_folders`·`ai_sessions` 는 `varchar(36)`(UUID). 대부분의 도메인 테이블은 `int().autoincrement()`. `log_events`·`ai_messages` 는 `bigint({ mode: 'number' }).autoincrement()`. 순수 조인 테이블(`post_tags`, `message_images`, `message_likes`, `message_bookmarks`, `follows`)은 PK 없이 조합 unique 만 둔다.
- **특수 타입**: `json().$type<...>()`(mail 주소 4컬럼, `calendar_event.rrule/exdate/categories`, `log_events.details`, `ai_models.metadata`, `ai_sessions.prompt_ids`), 타입 미지정 plain `json()`(`resumes.data`), `mysqlEnum`(`calendar_event.status`/`transp`), `longtext`(`mail_messages.body_html/body_text`, `ai_messages.content`), `customType` 정의 `mediumblob`(`cloud_assets.thumbnail_blob`), `bigint({ mode: 'number' })`(`user.storage_quota_bytes`, `cloud_assets.size_bytes`, `log_events.id`, `ai_messages.id`, `ai_attachments.message_id`), `tinyint`(`calendar_event.priority`/`sequence`), `smallint`(`log_events.severity`/`retry_count`).

### 관계(FK) 관례

- FK 는 `.references(() => X.y, { onDelete })` 로 선언. `onDelete` 는 사용자·소유 계층 자식이면 `cascade`(예: `*.user_id → user.id`, `mail_accounts→folders→messages→attachments`), nullable 참조/로그면 `set null`(`weather_api_log.key_id/user_id`, `image_assets.uploaded_by`, `calendar_event.group_id`, `ai_sessions.provider_id`).
- **DB 제약 없는 소프트 참조**(컬럼만 존재, `.references` 없음): `messages.replyToId`/`retweetOfId`(self), `mail_folders.parentId`(self), `mail_sync_logs.folderId`, `mail_sync_sessions.folderId`, `drive_folders.parentId`(self), `cloud_assets.folderId`(→`drive_folders`), `mail_accounts.betterAuthAccountId`·`spotify_accounts.betterAuthAccountId`(→ better-auth `account.id`), `ai_attachments.messageId`(→`ai_messages.id`).

## 마이그레이션 없음 — `db:push` 워크플로

- **마이그레이션 파일이 없다.** 스키마 변경은 `db/schema.ts` 수정 → `bun run db:push`(= `drizzle-kit push`)로 실 DB 에 직접 반영한다.
- `drizzle.config.ts`: `schema: './db/schema.ts'`, `out: './drizzle'`, `dialect: 'mysql'`, `dbCredentials.url: DATABASE_URL`.
- `out` 디렉터리 `drizzle/` 와 `drizzle-kit generate` 산출물은 `.gitignore` 됨(로컬 DDL 확인용). `db:studio`(`drizzle-kit studio`)로 브라우징 가능.
- 절차 상세: [../guidelines/db-schema-change.md](../guidelines/db-schema-change.md). db:push 규칙은 [../memory/stack-and-invariants.md](../memory/stack-and-invariants.md), 명령 표는 [../architecture.md](../architecture.md).

## 도메인별 그룹

| 그룹 | 테이블 수 | 물리 테이블 |
|------|:---:|------|
| [auth·공통](#auth공통-6) | 6 | `user`, `session`, `account`, `verification`, `api_token`, `api_request_log` |
| [블로그·마이크로블로그](#블로그마이크로블로그-12) | 12 | `posts`, `comments`, `tags`, `categories`, `post_tags`, `images`, `image_assets`, `messages`, `message_images`, `message_likes`, `message_bookmarks`, `follows` |
| [weather](#weather-5) | 5 | `weather_current`, `weather_ultra`, `weather_short`, `weather_api_key`, `weather_api_log` |
| [mail](#mail-7) | 7 | `mail_accounts`, `mail_folders`, `mail_messages`, `mail_attachments`, `mail_sync_logs`, `mail_sync_sessions`, `mail_uploads` |
| [spotify](#spotify-3) | 3 | `spotify_accounts`, `spotify_api_keys`, `spotify_widget_tokens` |
| [resume](#resume-1) | 1 | `resumes` |
| [calendar](#calendar-4) | 4 | `calendar_group`, `calendar_event`, `deleted_calendar_event`, `calendar_subscription` |
| [drive](#drive-3) | 3 | `drive_folders`, `cloud_assets`, `storage_lifecycle_logs` |
| [logs](#logs-2) | 2 | `log_events`, `device_key` |
| [ai](#ai-6) | 6 | `ai_providers`, `ai_models`, `ai_prompts`, `ai_sessions`, `ai_messages`, `ai_attachments` |
| **합계** | **49** | |

각 인벤토리 표의 컬럼: 물리 테이블 / TS export / 핵심 컬럼(총 컬럼 수) / 인덱스·유니크 / FK·관계(onDelete) / Drizzle 소유·사용 파일.

## auth·공통 (6)

| 물리 테이블 | TS export | 핵심 컬럼 (총) | 인덱스·유니크 | FK·관계 | Drizzle 소유·사용 |
|------|------|------|------|------|------|
| `user` | `user` | `id`(PK varchar36), `email`, `role`·`banned`·`ban_reason`·`ban_expires`(admin 플러그인), `timezone`(기본 `Asia/Seoul`), `storage_quota_bytes`(bigint, 기본 10 MiB) (13) | `email` unique | 다수 자식이 `user.id` 참조 | better-auth (`service/shared/auth-provider.ts`); 읽기 광범위 |
| `session` | `session` | `id`(PK), `token`, `user_id`, `expires_at`, `impersonated_by`(admin) (9) | `token` unique | `user_id → user.id` (cascade) | better-auth |
| `account` | `account` | `id`(PK), `account_id`, `provider_id`, `user_id`, `access_token`/`refresh_token`/`id_token`, `scope`, `password` (13) | — | `user_id → user.id` (cascade) | better-auth; OAuth 토큰 재사용 읽기: `compose/mail.ts`·`compose/spotify.ts`·`compose/shared.ts`(gdrive refresh) |
| `verification` | `verification` | `id`(PK), `identifier`, `value`, `expires_at` (6) | — | — | better-auth 전용(앱 코드 미참조) |
| `api_token` | `apiToken` | `id`(PK int), `user_id`, `token`(64), `name`, `expires_at`, `last_used_at` (7) | `token` unique; `idx_api_token_user`(user_id) | `user_id → user.id` (cascade) | `service/shared/api-token.ts` |
| `api_request_log` | `apiRequestLog` | `id`(PK int), `method`, `path`, `status_code`, `user_id`(제약 없음), `ip`, `duration_ms`, `error_code` (10) | `idx_request_log_user`(user_id), `idx_request_log_created`(created_at) | `user_id` 컬럼만(FK 없음) | write: `middleware/request-logger.ts`; read: `page/admin/db.ts` |

## 블로그·마이크로블로그 (12)

> 이 클러스터의 물리 컬럼명은 대체로 camelCase(위 [공통 규칙](#물리명--ts-필드-네이밍)). `image_assets` 만 snake_case.

| 물리 테이블 | TS export | 핵심 컬럼 (총) | 인덱스·유니크 | FK·관계 | Drizzle 소유·사용 |
|------|------|------|------|------|------|
| `posts` | `posts` | `postId`(PK int), `categoryId`, `title`, `description`, `views`, `isPublished`/`isHide`/`isNotice`/`isComment` (11) | — | `categoryId → categories.categoryId` (onDelete 미지정) | `compose/blog.ts` |
| `comments` | `comments` | `commentId`(PK), `postId`, `userId`, `comment`, `isHide` (7) | — | `postId → posts.postId`; `userId → user.id` (cascade) | `compose/blog.ts` |
| `tags` | `tags` | `tagId`(PK), `tag` (2) | — | — | `compose/blog.ts` |
| `categories` | `categories` | `categoryId`(PK), `category`, `isHide` (3) | — | — | `compose/blog.ts` |
| `post_tags` | `postTags` | `postId`, `tagId` (PK 없음) (2) | unique(`postId`,`tagId`) | `postId → posts.postId` (cascade), `tagId → tags.tagId` (cascade) | `compose/blog.ts` |
| `images` | `images` | `imageId`(PK), `userId`, `fileName`, `url`, `mimeType`, `fileSize`, `width`/`height` (11) | — | `userId → user.id` (cascade) | **쿼리 경로 없음(레거시)** — `schema.images` 참조처 0. 이미지 저장은 `image_assets` 사용 |
| `image_assets` | `imageAssets` | `id`(PK varchar36), `r2_key`, `bucket`, `mime_type`, `size_bytes`, `checksum`, `uploaded_by` (11) | `r2_key` unique | `uploaded_by → user.id` (set null) | `compose/blog.ts`(메시지 첨부 이미지) |
| `messages` | `messages` | `id`(PK varchar36), `userId`, `body`, `replyToId`·`retweetOfId`(소프트 self-ref), `deletedAt`(소프트 삭제) (8) | — | `userId → user.id` (cascade) | `compose/blog.ts`(마이크로블로그) |
| `message_images` | `messageImages` | `messageId`, `imageId`, `order` (PK 없음) (4) | unique(`messageId`,`imageId`) | `messageId → messages.id` (cascade), `imageId → image_assets.id` (cascade) | `compose/blog.ts` |
| `message_likes` | `messageLikes` | `messageId`, `userId` (PK 없음) (3) | unique(`messageId`,`userId`) | 둘 다 cascade(→`messages.id`, `user.id`) | **정의·어드민 조회만**(`page/admin/db.ts`), CRUD 경로 없음 |
| `message_bookmarks` | `messageBookmarks` | `messageId`, `userId` (PK 없음) (3) | unique(`messageId`,`userId`) | 둘 다 cascade | **정의·어드민 조회만**, CRUD 경로 없음 |
| `follows` | `follows` | `followerId`, `followingId` (PK 없음) (3) | unique(`followerId`,`followingId`) | 둘 다 `user.id` (cascade) | `compose/blog.ts` |

## weather (5)

| 물리 테이블 | TS export | 핵심 컬럼 (총) | 인덱스·유니크 | FK·관계 | Drizzle 소유·사용 |
|------|------|------|------|------|------|
| `weather_current` | `weatherCurrent` | `id`(PK), `nx`/`ny`/`base_date`/`base_time`(격자·시각), `category`, `obsr_value` (8) | `idx_weather_current_grid`(nx,ny,base_date,base_time) | — | **정의·런타임 적재 없음** — 실경로는 Redis 캐싱, `page/admin/db.ts` 카운트/조회·그리드 삭제만 |
| `weather_ultra` | `weatherUltra` | `id`(PK), 격자·시각 + `fcst_date`/`fcst_time`/`fcst_value`, `category` (10) | `idx_weather_ultra_grid` | — | 동상(정의·미기록) |
| `weather_short` | `weatherShort` | `weather_ultra` 와 동일 컬럼 구성 (10) | `idx_weather_short_grid` | — | 동상(정의·미기록) |
| `weather_api_key` | `weatherApiKey` | `id`(PK), `user_id`, `token`(64), `daily_limit`(기본 100), `expires_at`, `last_used_at` (8) | `token` unique; `idx_weather_api_key_user` | `user_id → user.id` (cascade) | `service/domain/weather/weather-api-key.ts` |
| `weather_api_log` | `weatherApiLog` | `id`(PK), `key_id`, `user_id`, `endpoint`, `nx`/`ny`(항상 null 기록), `status_code` (12) | `idx_weather_api_log_user`(user_id), `idx_weather_api_log_key_created`(key_id,created_at) | `key_id → weather_api_key.id` (set null), `user_id → user.id` (set null) | `service/domain/weather/weather-api-key.ts` |

## mail (7)

> IMAP threadId 규칙은 [../bug/mail-imap-thread-id.md](../bug/mail-imap-thread-id.md) 참조.

| 물리 테이블 | TS export | 핵심 컬럼 (총) | 인덱스·유니크 | FK·관계 | Drizzle 소유·사용 |
|------|------|------|------|------|------|
| `mail_accounts` | `mailAccounts` | `id`(PK), `user_id`, `provider`, `email`, `display_name`, `signature`(text, nullable — 계정별 서명), `credentials`, `imap_*`/`smtp_*`, `is_active`, `last_sync_at`, `sync_cursor`, `better_auth_account_id`(소프트) (20) | uq(`user_id`,`email`); `idx_mail_accounts_user` | `user_id → user.id` (cascade) | `compose/mail.ts` (+ `scripts/backfill-thread-id.ts`) |
| `mail_folders` | `mailFolders` | `id`(PK), `account_id`, `remote_folder_id`, `name`, `type`(기본 `custom`), `parent_id`(소프트 self), `uid_validity`, `sync_cursor` (12) | uq(`account_id`,`remote_folder_id`); `idx_mail_folders_account` | `account_id → mail_accounts.id` (cascade) | `compose/mail.ts` |
| `mail_messages` | `mailMessages` | `id`(PK), `account_id`, `folder_id`, `remote_message_id`, `message_id_header`, `thread_id`, `in_reply_to`, `references_header`, `from/to/cc/bcc`(json), `body_html`/`body_text`(longtext), `is_read`/`is_starred`/`is_draft`/`has_attachments`, `uid` (25) | uq(`account_id`,`remote_message_id`); 인덱스 6개(`folder`, `sent_at`, `thread`, `account_read`, `account_folder_received`, `account_received`) + **스키마 밖 FULLTEXT** `ft_mail_messages_subject_body`(`subject`,`body_text`) `WITH PARSER ngram` — drizzle 0.45.2 미표현이라 `db/schema.ts` 에 없고 `scripts/mail-fulltext-index.ts`(raw DDL, 멱등)로 적용, `db:push` 미관리 | `account_id`·`folder_id` cascade | `compose/mail.ts` |
| `mail_attachments` | `mailAttachments` | `id`(PK), `message_id`, `remote_attachment_id`, `filename`, `mime_type`, `size_bytes`, `content_id`, `is_inline`, `r2_key` (10) | uq(`message_id`,`remote_attachment_id`); `idx_mail_attachments_message` | `message_id → mail_messages.id` (cascade) | `compose/mail.ts` |
| `mail_sync_logs` | `mailSyncLogs` | `id`(PK), `account_id`, `sync_type`, `status`, `folder_id`(제약 없음), `messages_added`/`updated`/`deleted`, `duration_ms`, `error_message` (13) | `idx_mail_sync_logs_account` | `account_id → mail_accounts.id` (cascade) | `compose/mail.ts` |
| `mail_sync_sessions` | `mailSyncSessions` | `id`(PK), `account_id`, `folder_id`(제약 없음), `sync_type`, `status`, `total_estimate`, `synced_count`, `cursor` (12) | `idx_mail_sync_sessions_account_status`(account_id,status) | `account_id → mail_accounts.id` (cascade) | `compose/mail.ts` |
| `mail_uploads` | `mailUploads` | `id`(PK), `user_id`, `filename`, `mime_type`, `size_bytes`, `r2_key`, `is_inline` (8) | `r2_key` unique; `idx_mail_uploads_user` | `user_id → user.id` (cascade) | `compose/mail.ts` |

## spotify (3)

| 물리 테이블 | TS export | 핵심 컬럼 (총) | 인덱스·유니크 | FK·관계 | Drizzle 소유·사용 |
|------|------|------|------|------|------|
| `spotify_accounts` | `spotifyAccounts` | `id`(PK), `user_id`, `spotify_user_id`, `display_name`, `email`, `better_auth_account_id`(소프트), `is_active` (9) | uq(`user_id`,`spotify_user_id`); `idx_spotify_accounts_user` | `user_id → user.id` (cascade) | `compose/spotify.ts` |
| `spotify_api_keys` | `spotifyApiKeys` | `id`(PK), `user_id`, `spotify_account_id`, `token`(64), `name`, `expires_at`, `last_used_at` (8) | `token` unique; `idx`(user), `idx`(account) | `user_id → user.id` (cascade), `spotify_account_id → spotify_accounts.id` (cascade) | `compose/spotify.ts` |
| `spotify_widget_tokens` | `spotifyWidgetTokens` | `id`(PK), `user_id`, `spotify_account_id`, `token`(64), `name`, `is_active` (8) | `token` unique; `idx`(user), `idx`(account) | `user_id → user.id` (cascade), `spotify_account_id → spotify_accounts.id` (cascade) | `compose/spotify.ts` |

## resume (1)

| 물리 테이블 | TS export | 핵심 컬럼 (총) | 인덱스·유니크 | FK·관계 | Drizzle 소유·사용 |
|------|------|------|------|------|------|
| `resumes` | `resumes` | `id`(PK), `user_id`, `type`, `title`, `data`(json), `is_public` (8) | `idx_resumes_user` | `user_id → user.id` (cascade) | `compose/resume.ts` |

## calendar (4)

> 데이터 모델 요약과 사용 맥락은 [../domains/calendar.md](../domains/calendar.md) 참조.

| 물리 테이블 | TS export | 핵심 컬럼 (총) | 인덱스·유니크 | FK·관계 | Drizzle 소유·사용 |
|------|------|------|------|------|------|
| `calendar_group` | `calendarGroup` | `id`(PK varchar36), `user_id`, `name`, `color`, `sort_order`(기본 0), `is_visible`(기본 true) (8) | `idx_calendar_group_user` | `user_id → user.id` (cascade) | `compose/calendar.ts` |
| `calendar_event` | `calendarEvent` | `id`(PK varchar36), `user_id`, `uid`, `summary`, `dtstart`/`dtend`(datetime), `is_all_day`, `rrule`(json `RRuleType`), `exdate`(json), `status`(enum 기본 `CONFIRMED`), `transp`(enum 기본 `OPAQUE`), `priority`(tinyint), `categories`(json), `group_id`, `sequence`, `dtstamp` (21) | `uid` unique; 인덱스 4개(`user`, `user_dtstart`, `uid`, `group`) | `user_id → user.id` (cascade), `group_id → calendar_group.id` (set null) | `compose/calendar.ts` |
| `deleted_calendar_event` | `deletedCalendarEvent` | `id`(PK), `user_id`, `uid`, `deleted_at`, `sync_token` (5) | `idx_deleted_event_user_sync`(user_id,sync_token) | `user_id → user.id` (cascade) | `compose/calendar.ts` (CalDAV sync-collection tombstone) |
| `calendar_subscription` | `calendarSubscription` | `id`(PK), `user_id`, `token`(64), `ics_token`(64), `name`, `is_active`, `ctag`(기본 `'0'`), `last_accessed_at` (10) | `token`·`ics_token` unique; 인덱스 3개(`token`, `ics_token`, `user`) | `user_id → user.id` (cascade) | `compose/calendar.ts` |

## drive (3)

| 물리 테이블 | TS export | 핵심 컬럼 (총) | 인덱스·유니크 | FK·관계 | Drizzle 소유·사용 |
|------|------|------|------|------|------|
| `drive_folders` | `driveFolders` | `id`(PK varchar36), `user_id`, `parent_id`(소프트 self), `name` (6) | `idx`(user), `idx`(user_parent) | `user_id → user.id` (cascade) | `compose/drive.ts` |
| `cloud_assets` | `cloudAssets` | `id`(PK int), `user_id`, `s3_key`, `original_name`, `mime_type`, `size_bytes`(bigint), `file_hash`, `folder_id`(소프트), `thumbnail_blob`(mediumblob), `is_public`, `upload_status`(기본 `ready`), `upload_token`, `local_path`, `gdrive_file_id`, `storage_tiers`(기본 `L1`), `access_count`, `last_viewed_at` (19) | `s3_key` unique; uq(`user_id`,`file_hash`)(중복 업로드 방지); 인덱스 5개(`user`, `user_created`, `folder`, `storage_tiers`, `access_count`) | `user_id → user.id` (cascade) | `compose/drive.ts` |
| `storage_lifecycle_logs` | `storageLifecycleLogs` | `id`(PK), `asset_id`, `action`, `from_tier`, `to_tier`, `reason` (7) | `idx_storage_lifecycle_logs_asset` | `asset_id → cloud_assets.id` (cascade) | `compose/drive.ts` (write 트리거: `service/shared/storage-lifecycle.ts` via ServiceDb) |

## logs (2)

> 로깅 계약·수집 흐름은 [../logging.md](../logging.md), [../firmware-logging-contract.md](../firmware-logging-contract.md), 도입 이력은 [../history/2026-06-logging-system.md](../history/2026-06-logging-system.md) 참조.

| 물리 테이블 | TS export | 핵심 컬럼 (총) | 인덱스·유니크 | FK·관계 | Drizzle 소유·사용 |
|------|------|------|------|------|------|
| `log_events` | `logEvents` | `id`(PK bigint), `service`, `error_code`, `severity`(smallint 기본 20), `category`, `device_id`, `firmware_version`, `source`, `correlation_id`, `session_id`, `occurred_at`/`resolved_at`(datetime fsp3), `details`(json), `ingest_ip` (17) | 인덱스 4개(`service_created`, `device_created`, `code_resolved`, `severity_created`) | 없음(user FK 없음) | `compose/logs.ts`; rate-limit 카운트 읽기: `service/domain/logs/device-key.ts` |
| `device_key` | `deviceKey` | `id`(PK), `token`(64), `device_id`, `label`, `daily_limit`(기본 2000), `last_used_at`, `revoked_at` (8) | `token` unique; `idx_device_key_device`(device_id) | 없음 | `service/domain/logs/device-key.ts` |

## ai (6)

> 데이터 모델·흐름·함정은 [../domains/ai.md](../domains/ai.md). 자격증명은 `ai_providers.credentials` 한 컬럼에 AES-256-GCM 암호화 JSON 으로만 저장(평문·해시 별도 컬럼 없음).

| 물리 테이블 | TS export | 핵심 컬럼 (총) | 인덱스·유니크 | FK·관계 | Drizzle 소유·사용 |
|------|------|------|------|------|------|
| `ai_providers` | `aiProviders` | `id`(PK int), `user_id`, `provider`, `auth_type`, `credentials`(암호화 text), `status`(기본 active), `status_detail`, `display_name`, `last_used_at`, `last_refreshed_at`, `models_fetched_at` (13) | uq(`user_id`,`provider`); `idx_ai_providers_user` | `user_id → user.id` (cascade) | `compose/ai.ts` |
| `ai_models` | `aiModels` | `id`(PK int), `provider_id`, `model_id`, `display_name`, `metadata`(json), `fetched_at` (7) | uq(`provider_id`,`model_id`); `idx_ai_models_provider` | `provider_id → ai_providers.id` (cascade) | `compose/ai.ts` |
| `ai_prompts` | `aiPrompts` | `id`(PK int), `user_id`, `name`, `description`, `stage`(기본 system), `content`(text), `feature_key`, `sort_order`, `is_active` (11) | `idx_ai_prompts_user`, `idx_ai_prompts_user_feature`(user_id,feature_key) | `user_id → user.id` (cascade) | `compose/ai.ts` |
| `ai_sessions` | `aiSessions` | `id`(PK varchar36), `user_id`, `provider_id`(nullable), `provider`, `model_id`, `title`, `feature_key`, `prompt_ids`(json), `last_message_at` (11) | `idx_ai_sessions_user`, `idx_ai_sessions_user_last`(user_id,last_message_at) | `user_id → user.id` (cascade); `provider_id → ai_providers.id` (set null) | `compose/ai.ts` |
| `ai_messages` | `aiMessages` | `id`(PK bigint), `session_id`, `role`, `content`(longtext), `model_id`, `input_tokens`, `output_tokens`, `duration_ms` (9) | `idx_ai_messages_session_created`(session_id,created_at) | `session_id → ai_sessions.id` (cascade) | `compose/ai.ts` |
| `ai_attachments` | `aiAttachments` | `id`(PK int), `user_id`, `message_id`(bigint 소프트), `filename`, `mime_type`, `size_bytes`, `r2_key` (8) | `r2_key` unique; `idx_ai_attachments_user`, `idx_ai_attachments_message` | `user_id → user.id` (cascade) | `compose/ai.ts` |

## 정의됐으나 런타임 쓰기/CRUD 경로 없는 테이블

- `images` — `schema.images` 참조처 0. 블로그 이미지 저장은 `image_assets` 로 대체됨(레거시 잔존).
- `weather_current`·`weather_ultra`·`weather_short` — KMA 응답은 Redis 로 캐싱(`service/domain/weather/kma-api.ts`)하고 이 세 테이블엔 **INSERT(적재) 경로가 없다**. `page/admin/db.ts` 가 카운트·조회(`weatherCacheSummary`/`weatherCacheGrids`)와 그리드 삭제(`deleteWeatherCacheGrid`)만 수행([../domains/weather.md](../domains/weather.md)).
- `message_likes`·`message_bookmarks` — 스키마·어드민 조회(`page/admin/db.ts`)에만 존재. 좋아요/북마크 CRUD 경로가 `compose/blog.ts` 에 없음.
- `verification` — better-auth 가 내부적으로 관리, 앱 코드 참조 없음.
