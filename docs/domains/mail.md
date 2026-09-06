# mail 도메인

> 기준: 2026-09-07 (fix/audit-batch3-serverless @ 워킹트리 미커밋 변경) 코드 검증. 다루는 코드: `dto/mail/*`, `route/mail/*`, `service/domain/mail/**`, `compose/mail.ts`, `lib/mail-utils.ts`, `lib/mail-thread.ts`, `lib/credential-crypto.ts`(자격증명 암복호화 공용 구현), `lib/rate-limit.ts`, `scripts/backfill-thread-id.ts`, `db/schema.ts`(mail_* 테이블)

## 개요

- 멀티계정 메일 백엔드. 계정 연결 → 폴더/메시지 동기화 → 조회·검색·스레드 묶기 → 읽음/별표/이동/삭제 → 발송(작성·답장·전달)·첨부 업로드까지 담당한다.
- 프로바이더는 두 갈래다. Gmail 은 Gmail REST API(`https://gmail.googleapis.com/gmail/v1`)를 OAuth 토큰으로 호출하고, 그 외(naver/daum/imap)는 `imapflow`(IMAP) + `nodemailer`(SMTP) + `mailparser`(본문 파싱)로 표준 프로토콜을 쓴다. 두 구현은 `service/domain/mail/mail-provider.ts` 의 `MailProvider` 인터페이스 하나로 추상화된다.
- 외부 의존: Gmail OAuth(`accounts.google.com`, `oauth2.googleapis.com`), Gmail API, 각 메일 서버의 IMAP/SMTP, 그리고 첨부/업로드 저장을 위한 오브젝트 스토리지(`service/shared/storage.ts`, r2/S3 호환). IMAP 계정 자격증명은 AES-256-GCM 으로 암호화해 DB 에 저장한다(`mail-crypto.ts`).

## 파일 맵

| 파일 | 역할 |
|------|------|
| `dto/mail/account.ts` | 계정 생성/수정/응답/파라미터 Zod 스키마. `safeHost`(SSRF 차단 `isBlockedHost`), provider enum(`gmail`/`naver`/`daum`/`imap`) |
| `dto/mail/folder.ts` | 폴더 목록 쿼리(`accountId`)·응답 스키마 |
| `dto/mail/message.ts` | 목록/검색/스레드/발신자 쿼리, 읽음·별표·이동·삭제 바디, 작성/답장/전달 바디, 메시지 응답·상세 응답 스키마 |
| `dto/mail/draft.ts` | 임시보관 생성/수정 바디, `id` 파라미터, 임시보관 응답 스키마 |
| `dto/mail/attachment.ts` | 첨부 다운로드 파라미터(`messageId`·`attachmentId`) |
| `dto/mail/sync.ts` | incremental 트리거·historical 배치·상태조회 쿼리 스키마 |
| `route/mail/account.ts` | 계정 CRUD·연결테스트·Gmail OAuth connect/callback |
| `route/mail/folder.ts` | 폴더 목록 조회 |
| `route/mail/message.ts` | 목록·검색·스레드·발신자·상세·플래그·이동·삭제·발송·답장·전달·첨부 다운로드 |
| `route/mail/draft.ts` | 임시보관(Drafts) 생성·수정·삭제 (로컬 전용) |
| `route/mail/sync.ts` | incremental/historical 동기화·상태 |
| `route/mail/upload.ts` | 첨부/인라인 업로드·삭제 |
| `service/domain/mail/mail-provider.ts` | `MailProvider` 인터페이스 + Provider* 타입(메시지·폴더·첨부·동기화 결과·작성 데이터) |
| `service/domain/mail/mail-provider-factory.ts` | `MailAccount` → gmail/imap provider 생성. naver/daum IMAP 프리셋, 자격증명 복호화 |
| `service/domain/mail/providers/gmail-provider.ts` | Gmail API 구현(토큰 리프레시, history/list 동기화, MIME 발송) |
| `service/domain/mail/providers/gmail-helpers.ts` | Gmail payload 파서(주소·헤더·본문·첨부) |
| `service/domain/mail/providers/imap-provider.ts` | IMAP/SMTP 구현(UID 커서, References 헤더 fetch, mailbox lock) |
| `service/domain/mail/mail-account.ts` | 계정 소유권 검증·CRUD·provider 획득·동기화 상태 갱신 |
| `service/domain/mail/mail-oauth-connect.ts` | Gmail OAuth authURL 생성·콜백 처리(토큰 교환·userinfo·better-auth account upsert·mail 계정 연결) |
| `service/domain/mail/mail-crypto.ts` | 공용 `lib/credential-crypto.ts` 를 감싸는 얇은 래퍼(`createMailCrypto = createCredentialCrypto`). 실제 암복호화 구현은 아래 lib 파일 |
| `service/domain/mail/mail-sync.ts` | incremental/historical 동기화 오케스트레이션, sync log/session 관리 |
| `service/domain/mail/mail-message.ts` | 조회·검색·스레드·플래그(별표 thread 전파)·이동·삭제·첨부 다운로드·발송/답장/전달 |
| `service/domain/mail/mail-draft.ts` | 임시보관 생성/수정/삭제(로컬 전용). drafts 폴더 find-or-create, 소유권 검증, 스레딩 헤더 도출 |
| `service/domain/mail/mail-upload.ts` | 업로드 검증(MIME·magic bytes·확장자·크기)·저장·발송용 resolve |
| `compose/mail.ts` | ServiceDb(Drizzle) 구현·의존성 조립. provider factory, OAuth 토큰 getter/refresher, rate limiter, storage adapter |
| `lib/mail-utils.ts` | 헤더 sanitize, MIME encoded-word, 주소 포맷, `isBlockedHost`, `maskProviderError`, `extractMessageIdTokens`, `deriveThreadId`, `sanitizeFilename` |
| `lib/mail-thread.ts` | `computeThreadIds`(union-find 스레드 그룹핑, 백필용) |
| `lib/credential-crypto.ts` | 자격증명 암복호화 구현(AES-256-GCM, v2=scrypt / v1=legacy). mail·ai 도메인이 공유(mail=`MAIL_ENCRYPTION_KEY`, ai=`AI_ENCRYPTION_KEY`) |
| `scripts/backfill-thread-id.ts` | 기존 메일 `thread_id` 일괄 백필 CLI |
| `scripts/mail-fulltext-index.ts` | `mail_messages(subject, body_text)` FULLTEXT ngram 인덱스 생성 CLI(멱등). drizzle 0.45.2 가 FULLTEXT/`WITH PARSER` 를 표현 못 해 raw DDL 로 관리 |
| `tests/…/mail*` | dto·route·service·provider·lib 테스트(하단 테스트 섹션) |

## 데이터 모델

`db/schema.ts` 의 mail_* 테이블 7개. 컬럼 상세는 [../reference/db-schema.md](../reference/db-schema.md) 참조.

| 테이블(물리명) | 핵심 컬럼 | 인덱스/제약 | 관계 |
|---|---|---|---|
| `mail_accounts` | `provider`, `email`, `display_name`, `signature`(text, nullable — 계정별 서명), `credentials`(암호화 text), `imap_host/port/tls`, `smtp_host/port/tls`, `last_sync_at/status`, `sync_cursor`, `better_auth_account_id` | idx(`user_id`), unique(`user_id`,`email`) | `user_id`→`user`(cascade) |
| `mail_folders` | `remote_folder_id`, `name`, `type`, `parent_id`, `message_count`, `unread_count`, `uid_validity`, `sync_cursor` | idx(`account_id`), unique(`account_id`,`remote_folder_id`) | `account_id`→`mail_accounts`(cascade) |
| `mail_messages` | `remote_message_id`, `message_id_header`, `thread_id`, `in_reply_to`, `references_header`, `from/to/cc/bcc_address`(json), `subject`, `body_html/text`(longtext), `snippet`, `is_read/starred/draft`, `has_attachments`, `sent_at`, `received_at`, `uid` | **unique(`account_id`,`folder_id`,`remote_message_id`)**(제약명은 `uq_mail_messages_account_remote` 유지); idx(`folder_id`),(`sent_at`),(`thread_id`),(`account_id`,`is_read`),(`account_id`,`folder_id`,`received_at`),(`account_id`,`received_at`) | `account_id`→`mail_accounts`, `folder_id`→`mail_folders`(cascade) |
| `mail_attachments` | `remote_attachment_id`, `filename`, `mime_type`, `size_bytes`, `content_id`, `is_inline`, `r2_key`(캐시 키) | idx(`message_id`), unique(`message_id`,`remote_attachment_id`) | `message_id`→`mail_messages`(cascade) |
| `mail_sync_logs` | `sync_type`, `status`, `folder_id`, `messages_added/updated/deleted`, `duration_ms`, `error_message`, `started_at`, `completed_at` | idx(`account_id`) | `account_id`→`mail_accounts`(cascade) |
| `mail_sync_sessions` | `sync_type`, `status`, `total_estimate`, `synced_count`, `cursor`, `started_at`, `last_batch_at`, `completed_at` | idx(`account_id`,`status`) | `account_id`→`mail_accounts`(cascade) |
| `mail_uploads` | `filename`, `mime_type`, `size_bytes`, `r2_key`(unique), `is_inline` | idx(`user_id`) | `user_id`→`user`(cascade) |

- 모든 PK 는 `int autoincrement`. 원격 식별자(`remote_message_id`·`remote_folder_id`·`remote_attachment_id`)는 provider 별 의미가 다르다(Gmail=API id / IMAP=UID·part id).
- **`mail_messages` unique 는 `(account_id, folder_id, remote_message_id)` 3열이다**(`db/schema.ts:465`). IMAP UID 는 mailbox 단위로만 유일해 서로 다른 폴더가 같은 UID 를 갖는 충돌을 계정 단위 unique 가 막지 못했기 때문이다. **아직 DB 에 반영되지 않았다 — `bun run db:push` 가 필요하다**(마이그레이션 파일 없음, `drizzle/` gitignored).
- **로컬 임시보관(Drafts)**은 새 테이블 없이 기존 스키마를 재사용한다: `mail_folders` 에 `type='drafts'`·`remote_folder_id='__local_drafts__'` 로컬 폴더 1행 + `mail_messages` 에 `is_draft=true`·`remote_message_id='local-draft:{uuid}'` 행. (→ 아래 "핵심 흐름 › 임시보관(Drafts)" 절)

## API 엔드포인트

전체 mount: `route/index.ts` 가 `/mail/*` 에 라우터를 얹고, `index.ts` 가 `app.route('/api', api)` 로 마운트 → 실제 경로는 `/api/mail/*`. 모든 엔드포인트는 better-auth **세션 인증**(`withAuth`, upload 는 `getSession` 직접 확인)을 요구한다.

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/mail/accounts` | 세션 | 계정 목록 |
| GET | `/api/mail/accounts/:accountId` | 세션 | 계정 상세 |
| POST | `/api/mail/accounts` | 세션 | 계정 연결(IMAP 수동/프리셋; body=`mailAccountCreateSchema`) |
| PATCH | `/api/mail/accounts/:accountId` | 세션 | 계정 수정(`displayName`/`signature`/`isActive`) |
| DELETE | `/api/mail/accounts/:accountId` | 세션 | 계정 삭제 |
| POST | `/api/mail/accounts/:accountId/test` | 세션 | 연결 테스트(`provider.testConnection`) |
| GET | `/api/mail/accounts/connect/google` | 세션 | Gmail OAuth 시작 → Google 로 302 |
| GET | `/api/mail/accounts/connect/google/callback` | 세션 | OAuth 콜백 → 계정 생성/연결 후 redirect |
| GET | `/api/mail/folders?accountId=` | 세션 | 폴더 목록 |
| GET | `/api/mail/messages` | 세션 | 메시지 목록(페이지네이션, `accountId`/`folderId`/`isRead`/`isStarred` 필터) |
| GET | `/api/mail/messages/search` | 세션 | 제목·본문 검색 + 구조화 필터(`q` optional, `accountId`·`folderId`·`fromAddress`·`toAddress`·`hasAttachment`·`isRead`·`isStarred`·`dateFrom`·`dateTo`·`excludeJunk` 기본 true). q 있으면 관련도(FULLTEXT) 정렬, 없으면 `received_at` desc |
| GET | `/api/mail/messages/thread?accountId=&threadId=` | 세션 | 같은 thread 메시지(sent_at 오름차순) |
| GET | `/api/mail/messages/senders` | 세션 | 발신자 목록(주소→이름) |
| GET | `/api/mail/messages/:messageId` | 세션 | 상세 + 첨부. 안읽음이면 백그라운드 읽음처리 |
| POST | `/api/mail/messages/mark-read` | 세션 | 읽음 |
| POST | `/api/mail/messages/mark-all-read` | 세션 | 폴더/계정 전체 읽음(`accountId` 또는 `folderId`) |
| POST | `/api/mail/messages/mark-unread` | 세션 | 안읽음 |
| POST | `/api/mail/messages/star` | 세션 | 별표(**같은 thread 전체 전파**) |
| POST | `/api/mail/messages/unstar` | 세션 | 별표 해제(**thread 전체 전파**) |
| POST | `/api/mail/messages/move` | 세션 | 폴더 이동(`targetFolderId`) |
| POST | `/api/mail/messages/delete` | 세션 | 삭제 |
| POST | `/api/mail/messages/send` | 세션 + rate limit | 신규 발송 |
| POST | `/api/mail/messages/:messageId/reply` | 세션 + rate limit | 답장(In-Reply-To/References 자동) |
| POST | `/api/mail/messages/:messageId/forward` | 세션 + rate limit | 전달 |
| GET | `/api/mail/messages/:messageId/attachments/:attachmentId` | 세션 | 첨부 다운로드(바이너리 Response) |
| POST | `/api/mail/drafts` | 세션 | 임시보관 생성(로컬 전용, `isDraft=true`, drafts 폴더 저장) |
| PUT | `/api/mail/drafts/:id` | 세션 | 임시보관 수정(부분 업데이트) |
| DELETE | `/api/mail/drafts/:id` | 세션 | 임시보관 삭제(발송 후 정리 포함) |
| POST | `/api/mail/sync` | 세션 + rate limit | incremental 동기화 |
| POST | `/api/mail/sync/historical` | 세션 | historical 배치 동기화 |
| GET | `/api/mail/sync/status?accountId=` | 세션 | 최신 로그 + 진행 세션 상태 |
| POST | `/api/mail/uploads` | 세션 | 첨부/인라인 업로드(multipart `file`, `inline` 플래그) |
| DELETE | `/api/mail/uploads/:uploadId` | 세션 | 업로드 삭제 |

- rate limit: `compose/mail.ts` 의 `createRateLimiter({ windowMs: 60_000, maxRequests: 20 }, rateLimitStore)`, 키 `mail:{userId}:{path}`. `checkLimit` 이 주입될 때만 적용되며 대상은 `sync` 와 **발송 3종(`send`·`reply`·`forward`)** 이다. 발송 3종은 `pathKey: 'mail:messages:send'` 로 묶여 **하나의 분당 20회 예산을 공유**한다(`route/mail/message.ts` 의 `withSendRateLimit`). 응답에는 `X-RateLimit-Limit`/`-Remaining`/`-Reset` 헤더가 붙고 초과 시 429 `RATE_LIMIT_EXCEEDED`.
- **카운터 저장소**: `REDIS_URL` 이 설정돼 있으면 `compose/index.ts` 가 만든 공유 스토어(`service/shared/rate-limit-store.ts`)가 주입돼 인스턴스 간 카운터를 공유하고, 없으면 프로세스 인메모리다. 어느 쪽이든 헤더·429 계약은 같다(→ [../reference/lib-utilities.md](../reference/lib-utilities.md), [../reference/shared-services.md](../reference/shared-services.md)).

## 핵심 흐름

### 계정 연결 — 2경로

1. **Gmail OAuth(`mail-oauth-connect.ts`)**: `GET connect/google` → `generateAuthUrl`(scope: `openid email profile gmail.modify gmail.send`, `access_type=offline`, `prompt=consent`, HMAC state=userId+redirect, TTL 10분) → Google 동의 → `callback` 에서 `handleCallback`: state 검증(userId 일치) → code→토큰 교환 → userinfo 조회 → better-auth `account`(providerId=`google`) upsert → 같은 이메일 mail 계정이 있으면 `better_auth_account_id` 링크, 없으면 provider=`gmail` 로 mail 계정 생성. 자격증명(`credentials`)은 저장하지 않고 better-auth account 의 토큰을 재사용한다.
2. **IMAP 수동(`POST /api/mail/accounts`)**: provider=`naver`/`daum`(프리셋) 또는 `imap`(host/port 직접). `credentials.password` 필수. `mail-account.ts create` 가 `crypto.encrypt(JSON.stringify(credentials))` 로 암호화해 `credentials` 컬럼에 저장. 계정 수 상한 `MAX_ACCOUNTS_PER_USER=10`.

- **중복 계정은 409 `MAIL_ACCOUNT_ALREADY_EXISTS`**: `mail_accounts` 에 `unique(user_id, email)`(`uq_mail_accounts_user_email`, `db/schema.ts:398`)이 걸려 있다. `compose/mail.ts` 의 `insert` 는 INSERT 를 try/catch 로 감싸 `isDuplicateKeyError`(`lib/db-helper.ts`)면 `null` 을 돌려주고, 서비스가 `null` 을 받으면 `MAIL_ACCOUNT_ALREADY_EXISTS`(409)를 던진다(`service/domain/mail/mail-account.ts:89`). 이전에는 드라이버 `ER_DUP_ENTRY` 가 그대로 올라와 `INTERNAL_ERROR`(500)였다. `POST /api/mail/accounts` 의 OpenAPI 응답 선언에도 이 코드가 포함된다(`route/mail/account.ts:102`).

### provider 추상화 (`mail-provider-factory.ts`)

- `create(account)`: provider=`gmail` 이면 `betterAuthAccountId` 필수(없으면 `MAIL_CREDENTIALS_INVALID`), OAuth 토큰 getter/refresher 를 넘겨 `createGmailProvider`. 그 외는 `credentials` 복호화 → `IMAP_PRESETS`(naver/daum) 또는 account 의 host/port 로 `createImapProvider`. 두 구현 모두 `MailProvider` 를 만족하므로 상위 서비스는 provider 종류를 모른다.
- Gmail: `gmailFetch` 가 401 시 refresh token 으로 재발급(단일 `refreshPromise` 로 중복 방지), 429 시 점증 대기(1·2·3초, `(4-retries)*1000`) 최대 3회 재시도. 폴더=Gmail label(일부 시스템 label skip), 메시지 id=API message id.
- IMAP: 폴더=mailbox path, 메시지 id=UID 문자열. `getMailboxLock` 으로 mailbox 열고 fetch. 본문은 `simpleParser`(mailparser)로 파싱.

### 동기화 (`mail-sync.ts`)

- **계정 단위 동기화 락(상호배제)**: `syncAccount` 는 다른 작업보다 먼저 `tryAcquireSyncLock(accountId, 5분)` 으로 락을 잡는다. 구현은 `mail_accounts` 의 조건부 UPDATE 다 — `last_sync_status` 가 `'running'` 이 아니거나(또는 null), `last_sync_at` 이 없거나 5분보다 오래됐을 때만 `last_sync_status='running'`·`last_sync_at=now` 로 갱신하고 `affectedRows > 0` 이면 획득으로 본다(`compose/mail.ts`). **획득에 실패하면 오류가 아니라 `{ added: 0, updated: 0, deleted: 0, durationMs }` 로 즉시 성공 응답**한다(mail 클라이언트가 자동 동기화와 수동 동기화를 겹쳐 호출하므로 toast 를 띄우지 않기 위함 — 409 를 쓰지 않는다). 락은 바깥 `finally` 에서 해제하며, 해제는 `'running'` 인 행만 `'error'` 로 되돌린다(정상 종료 경로는 그 전에 `updateSyncStatus('success'/'error')` 로 이미 상태를 확정한다). 5분이 지난 락은 다음 호출이 탈취할 수 있어 중단된 프로세스가 계정을 영구 잠그지 않는다.
- **incremental(`syncAccount`)**: 락 획득 → 활성 세션이 `running` 이면 error 로 정리 → provider connect → 기존 폴더 중 `sync_cursor` 가 하나라도 있으면 incremental, 아니면 초기 동기화. **폴더 목록은 incremental 에서도 매번 `fetchFolders` 로 갱신**하며, 초기 동기화만 `includeCounts: true`(폴더별 카운트까지 조회)로 부르고 incremental 은 `includeCounts: false` 로 불러 provider 왕복을 줄인다(카운트는 동기화 후 DB 집계로 갱신). incremental 은 폴더 병렬, 초기는 순차. 폴더별 `syncFolder`: `fetchMessages({folderId, cursor, batchSize:100})` → `upsertMessagesFromProvider`(메시지·첨부 upsert, 10건마다 이벤트루프 yield) → 삭제 반영 → `sync_cursor` 갱신 → 폴더 카운트 재계산. `mail_sync_logs` 기록, 실패 시 `MAIL_PROVIDER_ERROR`(메시지 마스킹). 성공·실패와 무관하게 `finally` 에서 `provider.disconnect()` 한다(실패는 `captureException`).
- **폴더 병렬 처리는 `Promise.allSettled`** 다. 한 폴더가 실패해도 성공한 폴더의 `added`/`updated`/`deleted` 는 집계하고 커서도 그 폴더에 반영된 뒤, 첫 실패 사유를 다시 던져 로그·응답을 error 로 마감한다. 이전에는 `Promise.all` 이라 먼저 끝난 폴더의 결과가 통째로 버려졌다.
- **헤더 유래 값은 컬럼 길이로 절단**해 저장한다(`mail-sync.ts`): `message_id_header`·`in_reply_to` 500자, `remote_folder_id` 255자, 첨부의 `filename` 255자·`mime_type` 100자·`content_id` 255자. 비정상적으로 긴 헤더가 온 메일 때문에 배치 전체가 INSERT 실패하던 경로를 막는다(`references_header` 는 text 라 절단하지 않는다).
- **로컬 폴더 제외**: `remote_folder_id` 가 `__local_` 로 시작하는 폴더(`lib/mail-utils.ts` 의 `isLocalMailFolder`)는 동기화 대상에서 제외한다. 로컬 임시보관 폴더(`__local_drafts__`)를 원격에 fetch 하려다 실패하는 것을 막는다. historical 동기화도 대상 선정·`folderId` 지정 모두에서 같은 필터를 적용해, 로컬 폴더를 지정하면 `MAIL_FOLDER_NOT_FOUND` 다.
- **메시지 동일성 판정(identityScope)**: `account.provider === 'gmail'` 이면 `account`(계정+remoteMessageId), 그 외(IMAP 계열)는 `folder`(계정+폴더+remoteMessageId) 스코프로 upsert·삭제 대상을 찾는다(`mail-sync.ts` → `compose/mail.ts` `upsertMessage`/`deleteMessagesByRemoteIds`). Gmail 은 message id 가 계정 전역에서 유일하고 라벨(폴더)이 바뀌어도 같은 메일이며, IMAP UID 는 mailbox 안에서만 유일하기 때문이다.
- **upsert 동작**: 식별자로 기존 행을 찾으면 가변 필드(`subject`·`bodyHtml`·`bodyText`·`snippet`·`isRead`·`isStarred`·`isDraft`·`hasAttachments`·`threadId`·`messageIdHeader`·`inReplyTo`·`referencesHeader`)만 UPDATE 하고 폴더·원격 id 는 건드리지 않는다. 없으면 INSERT(+`onDuplicateKeyUpdate` 로 같은 가변 필드 갱신). account 스코프에서는 INSERT 후 같은 식별자의 행을 `id` 오름차순으로 모아 **가장 오래된 1건만 남기고 나머지를 삭제**해, 라벨 이동으로 생긴 중복 행을 정리한다.
- **historical(`syncHistorical`)**: `mail_sync_sessions` 기반 과거 메일 역방향 배치. 대상 폴더=지정 folderId 또는 inbox. `fetchMessages({direction:'backward', batchSize, cursor})` → 세션 `synced_count`/`cursor`/`total_estimate` 갱신, 남은 커서 있으면 `paused` 없으면 `completed`. 응답에 `hasMore`·`cursor`·진행 수치 포함.
- **historical 의 폴더 소유·세션 커서 규칙**(`mail-sync.ts:338·340`): ① 대상 폴더는 `folder.accountId !== accountId` 면 `MAIL_FOLDER_NOT_FOUND` 다 — 다른 계정의 folderId 를 넘겨 남의 폴더를 동기화 대상으로 삼을 수 없다(로컬 폴더·미존재도 같은 코드). ② 재개할 활성 세션이 있어도 `session.folderId !== targetFolderId` 면 그 세션을 무시하고(`session = null`) 새 세션을 만든다. 폴더 A 의 UID 커서를 폴더 B 배치에 그대로 물려 엉뚱한 구간을 읽던 경로를 막는다.
- **커서 의미**: Gmail=incremental 은 History API `historyId`, backward 는 messages.list `pageToken`. IMAP=UID 숫자(forward `UID+1:*`, backward `1:UID-1`). 커서는 폴더별 `mail_folders.sync_cursor` 가 1차, `mail_accounts.sync_cursor` 는 fallback.
- **Gmail backward 커서는 목록 조회 전에 확보**한다(`gmail-provider.ts`). `/profile` 의 `historyId` 를 `messages.list` **이전에** 읽어 그 값을 `newSyncCursor` 로 돌려주므로, 조회 도중 도착한 메일이 다음 incremental 에서 누락되지 않는다.
- **IMAP 배치 정렬**: `${lastUid + 1}:*` 범위는 새 메일이 없어도 최신 1건을 돌려주므로, fetch 결과를 커서 기준(`forward` 는 `uid > lastUid`, `backward` 는 `uid < lastUid`)으로 한 번 더 거른다. 걸러진 후보는 **forward incremental 이면 UID 오름차순**(오래된 새 메일부터 처리해 커서가 건너뛰지 않도록), 그 외(초기·backward)는 내림차순으로 정렬해 `batchSize` 만큼 자른다. backward 의 `hasMore` 판정도 걸러진 후보 수 기준이다.

### 메시지 조회·thread 묶기

- 목록/검색/발신자/스레드는 모두 `compose/mail.ts` 의 Drizzle 쿼리(`mailMessageDb`)에서 사용자 소유 계정 id 로 스코프를 걸어(단건이면 소유 확인 후 `accountId` 고정, 없으면 사용자 전체 계정) 소유권을 검증한다(스레드는 서비스단 `accountService.getById` 로 선검증). 상세(`getById`)는 첨부 포함, 안읽음이면 `applyFlagAction(markRead, { remoteSync: 'background' })` 를 부른다 — **로컬 `mail_messages.is_read` 갱신은 응답 전에 `await`** 하고, provider 원격 반영(IMAP `\\Seen`·Gmail label)만 비동기로 남긴다. 서버리스에서 응답 후 실행이 끊겨 읽음 상태가 유실되던 경로를 막되, IMAP 왕복 지연은 응답에 얹지 않는다.
- **thread_id 산출**: Gmail 은 native `raw.threadId` 를 그대로 사용. IMAP 은 native thread 가 없어 `deriveThreadId({references, inReplyTo, messageIdHeader})` 로 도출(References 첫 토큰 > In-Reply-To > Message-ID 우선순위). IMAP envelope 에는 References 가 없어 fetch 쿼리에 `headers:['references']` 를 추가하고 `parseReferencesHeader` 로 파싱한다. 상세는 [../bug/mail-imap-thread-id.md](../bug/mail-imap-thread-id.md).
- `getThread(accountId, threadId)` 는 `mail_messages.thread_id` 가 같은 행을 `sent_at` 순으로 반환한다.

### 검색(`search`) — 본문·필터·정렬

- `search` 는 소유 계정 스코프 위에 구조화 필터(`fromAddress`/`toAddress` JSON 부분일치, `hasAttachment`/`isRead`/`isStarred`, `dateFrom`/`dateTo` = `received_at` 범위, `folderId`, `excludeJunk`)를 AND 로 얹는다. `excludeJunk`(기본 true)는 `type IN ('trash','spam')` 폴더의 메시지를 서브쿼리로 제외한다 — 정크 폴더 안에서 검색하려면 클라이언트가 `excludeJunk=false` 를 보낸다(`folderId` 와 독립).
- **본문 검색·정렬은 FULLTEXT ngram 인덱스 유무에 따라 갈린다.** `compose/mail.ts` 가 부팅 후 1회 `information_schema` 로 `ft_mail_messages_subject_body` 존재를 프로브(프로세스당 메모이즈)한다. **프로브 자체가 실패하면(일시적 DB 오류 등) 메모이즈를 되돌리고 `captureException` 한 뒤 `false` 를 반환**하므로, 다음 검색 요청에서 다시 프로브한다 — 한 번의 일시 오류로 프로세스 수명 내내 LIKE 폴백에 고착되지 않는다. 있으면 q 질의는 `MATCH(subject, body_text) AGAINST(q IN NATURAL LANGUAGE MODE)` + 관련도 desc·`received_at` desc 정렬. 없으면 `subject`/`body_text`/`snippet` 3열 `LIKE` + `received_at` desc 로 **안전 폴백**(500 없음). q 가 없으면 필터만으로 `received_at` desc.
- **인덱스는 drizzle 스키마 밖에서 관리한다**: drizzle 0.45.2 는 FULLTEXT·`WITH PARSER ngram` 을 표현 못 해 `db/schema.ts` 에 없다. `bun run scripts/mail-fulltext-index.ts`(멱등) 로 적용하면 다음 부팅부터 MATCH 경로로 승격. ngram 은 한국어 등 CJK 토크나이징에 필요(기본 파서는 공백 분절이라 한국어 미검색). `db:push` 는 이 인덱스를 관리하지 않으며, push 후 드롭될 수 있으면 스크립트를 재실행하고 앱을 재기동한다(재기동 시 프로브가 다시 감지).

### 별표 thread 전파 (커밋 f20afcf)

- `markStarred`/`unmarkStarred` 는 먼저 `expandToThreadMessageIds(messageIds, userId)` 로 대상을 확장한다. 확장 규칙: 소유권(userId) 검증된 메시지 집합에 대해, `thread_id` 가 있는 것은 같은 `(account_id, thread_id)` 의 모든 메일을 추가하고, `thread_id` 가 null 인 메일은 자기 자신만 유지. 확장된 id 로 `applyFlagAction` 실행(provider 플래그: IMAP `\\Flagged`, Gmail `STARRED` label + DB `is_starred`).
- 읽음/안읽음/이동/삭제 등 다른 플래그 동작은 thread 확장을 하지 않는다(개별 대상만).

### 첨부 다운로드

- `downloadAttachment(userId, messageId, attachmentId)`: 메시지 소유권 확인 → 첨부가 해당 메시지 소속인지 확인 → `r2_key` 캐시가 있으면 스토리지에서 먼저 시도(실패 시 provider 재요청) → provider 다운로드 → 성공분을 `mail/attachments/{messageId}/{attachmentId}/{filename}` 로 캐시 업로드 후 `r2_key` 저장.
- **IMAP 폴더 open 선행**: provider 에 `folder?.remoteFolderId` 를 넘기면 `imap.getMailboxLock(folderId)` 로 mailbox 를 연 뒤 `imap.download(uid, part)` 로 part 를 받는다(열지 않으면 UID 접근 불가).
- **응답 헤더(보안)**: 다운로드 라우트는 `Content-Disposition: attachment`(항상 다운로드 강제) + `X-Content-Type-Options: nosniff`(MIME 스니핑 차단)를 붙인다. HTML/SVG 첨부가 브라우저에서 인라인 실행되지 않도록 하기 위함.
- **stale Gmail attachment id 복구**: Gmail attachmentId 는 재조회 시 바뀔 수 있다. `downloadAttachmentViaProvider` 는 1차 다운로드 실패 시 `fetchMessageDetail` 로 현재 첨부 목록을 받아 `contentId`→`filename`→`size` 순으로 매칭(`matchAttachmentRef`)하고, 다른 remote id 를 찾으면 그 id 로 재시도한다.

### 발송·업로드

- **업로드(`mail-upload.ts`)**: MIME 정규식 검증. inline 은 이미지 MIME 화이트리스트 + magic bytes + 10MB 제한, 일반 첨부는 위험 MIME/확장자 차단 + 25MB 제한. `mail/uploads/{userId}/{uuid}/{filename}` 로 저장하고 `mail_uploads` 기록. `resolveForSend(ids, userId)` 가 발송 시 스토리지에서 내용을 내려받아 `ComposeAttachment[]` 로 만든다.
- **발송(`send`/`reply`/`forward`)**: `attachmentIds` 가 있으면 `resolveForSend` 로 첨부 해석 후 `provider.sendMessage`. Gmail 은 raw MIME(멀티파트, base64url)을 `/messages/send` 로, IMAP 은 nodemailer SMTP 로 전송. `reply` 는 원본 `messageIdHeader`→In-Reply-To, `referencesHeader`+`messageIdHeader`→References 를 세팅하고 제목 `Re:`. `reply` 는 `to`/`cc` 배열을 그대로 받아 발송하므로 프론트가 원문 From/To/Cc 로 reply-all 대상을 계산해 넘길 수 있다(미지정 시 `to`=원문 발신자). `forward` 는 원문 인용 + 제목 `Fwd:`.
- **plain-text 대체본(multipart/alternative)**: `bodyText` 미지정 시 `bodyHtml` 을 `htmlToPlainText`(`lib/mail-utils.ts`)로 변환해 text 파트를 자동 생성한다. Gmail 은 `multipart/alternative`(text/plain + text/html, 첨부 동반 시 `multipart/mixed` 로 래핑), IMAP 은 nodemailer `text`+`html` 로 전송. 따라서 프론트는 `bodyHtml` 만 보내도 되고, `bodyText` 를 명시하면 그 값이 text 파트로 쓰인다.

### 임시보관(Drafts) — 로컬 전용 (`mail-draft.ts`)

- **v1 은 로컬 전용**이다. IMAP `APPEND`/Gmail draft API 로 원격 동기화하지 않고, `mail_messages` 에 `is_draft=true` 행으로만 저장한다. 별도 draft 테이블·컬럼은 없다(기존 메시지 스키마 재사용).
- **drafts 폴더 find-or-create**: 계정의 `type='drafts'` 폴더(가장 낮은 `id`)를 찾고, 없으면 로컬 drafts 폴더를 생성한다(`remote_folder_id='__local_drafts__'`, `name='Drafts'`, `type='drafts'`, `onDuplicateKeyUpdate` 로 경합 방어). 이후 실제 동기화가 provider 의 drafts 폴더(다른 `remote_folder_id`)를 별도로 만들 수 있어 계정당 drafts 폴더가 2개 공존할 수 있다(로컬 draft 는 항상 `__local_drafts__` 쪽).
- **생성(`createDraft`)**: 계정 소유권 검증(`accountService.getById`) → drafts 폴더 확보 → `remote_message_id='local-draft:{uuid}'`(계정 내 unique), `from`=계정 이메일, `is_read=true`·`is_starred=false`·`is_draft=true`·`has_attachments=false`, `received_at=now`(목록 정렬용), `sent_at=null`. `snippet` 은 `bodyText`(없으면 `htmlToPlainText(bodyHtml)`) 200자로 자동 생성. 폴더 카운트 재계산.
- **스레딩**: `inReplyTo`/`references` 를 직접 받거나 `replyToMessageId` 로 원본에서 도출(원본 소유권 검증, `in_reply_to`=원본 Message-ID, `references`=원본 References+Message-ID, `thread_id`=원본 thread). 명시 값이 도출 값보다 우선.
- **조회·재편집**: 별도 조회 엔드포인트 없음 — 기존 `GET /api/mail/messages`(폴더/계정 필터, `is_draft` 미필터라 자연 포함)·`GET /api/mail/messages/:id`(recipients·body 포함 상세)로 목록·재편집한다.
- **수정(`updateDraft`)/삭제(`deleteDraft`)**: 대상이 `is_draft=true` 이고 사용자 소유일 때만(아니면 `MAIL_MESSAGE_NOT_FOUND`). 수정은 전달된 필드만 부분 반영(body 변경 시 snippet 재계산). 삭제 후 폴더 카운트 재계산.
- **발송 후 정리**: 발송은 프론트가 기존 `POST /api/mail/messages/send`(신규 draft) 또는 reply 엔드포인트로 하고, 발송 성공 후 `DELETE /api/mail/drafts/:id` 로 임시보관을 지운다. **주의**: `send` 바디(`mailComposeSchema`)는 `inReplyTo`/`references` 를 받지 않으므로, 답장 draft 를 send 로 보내면 스레딩 헤더가 유실된다 — 스레딩 유지가 필요하면 원본 기준 reply 엔드포인트를 쓴다(기존 send 계약은 미변경).

### 계정 서명(signature)

- `mail_accounts.signature`(text, nullable) = 계정별 서명. `mailAccountCreateSchema`/`mailAccountUpdateSchema` 로 입력(최대 10000자, update 는 `null` 로 초기화 가능), 계정 응답(`formatAccount`)에 `signature` 필드로 노출. 서버는 저장·노출만 하고 발송 본문에 자동 합성하지는 않는다(합성은 프론트 담당).

### 자격증명 암호화 (`lib/credential-crypto.ts`)

- 실제 구현은 공용 `lib/credential-crypto.ts` 의 `createCredentialCrypto` 에 있고, `mail-crypto.ts` 의 `createMailCrypto` 는 이를 그대로 감싼다(ai 도메인도 `AI_ENCRYPTION_KEY` 로 같은 구현을 재사용).
- `encrypt` 는 항상 v2: 랜덤 salt(16)로 `scrypt`(N=16384, r=8, p=1) 키 파생 → AES-256-GCM(iv 12, tag 16) → `v2:` + base64(salt|iv|tag|ct).
- `decrypt` 는 `v2:` 접두면 위 역순, 없으면 v1 legacy(키=encryptionKey 를 32바이트로 pad/truncate, base64 iv|tag|ct)로 복호화 → 구버전 데이터 호환.

### thread_id 백필 (`scripts/backfill-thread-id.ts`)

- 목적: `deriveThreadId`/onDuplicateKeyUpdate 도입 이전에 저장된(주로 IMAP) `thread_id=null` 메일을 채운다.
- 동작: 계정별 전 메일을 읽어 `lib/mail-thread.ts` 의 `computeThreadIds`(Message-ID/In-Reply-To/References 토큰 union-find 로 대화 그룹핑, root=가장 오래된 멤버의 Message-ID)로 thread_id 를 계산 → 기존 `thread_id` 가 없는 행만 500건 청크로 UPDATE. `--dry-run` 은 갱신 없이 대상 수만 출력. 실행: `bun run scripts/backfill-thread-id.ts [--dry-run]`.

## 환경변수

이 도메인이 쓰는 것만(상세·전체는 [../reference/env.md](../reference/env.md)).

| 변수 | 용도 | 비고 |
|---|---|---|
| `MAIL_ENCRYPTION_KEY` | 자격증명 암복호화 키 | `composeMail` 이 없으면 throw. `z.string().min(32).optional()` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Gmail OAuth 인가·토큰 교환/리프레시 | optional(미설정 시 OAuth 미동작) |
| `BETTER_AUTH_SECRET` | OAuth state HMAC 서명(`mail-oauth-connect`) | optional |
| `BASE_URL` | OAuth 콜백 URL(`{BASE_URL}/api/mail/accounts/connect/google/callback`) 구성 | `compose/index.ts` 에서 `baseUrl` 로 주입 |

## 에러 코드

`lib/error-code.ts` 의 `MAIL_*`(+ OAuth). 메시지는 `lib/error-message.ts`.

| 코드 | 소스에서 throw | 위치/비고 |
|---|---|---|
| `MAIL_ACCOUNT_NOT_FOUND` | O | 소유권 검증 실패 |
| `MAIL_ACCOUNT_LIMIT_EXCEEDED` | O | 계정 10개 초과 |
| `MAIL_FOLDER_NOT_FOUND` | O | 대상 폴더 없음 |
| `MAIL_MESSAGE_NOT_FOUND` | O | 메시지 없음/소유 불일치 |
| `MAIL_ATTACHMENT_NOT_FOUND` | O | 첨부 없음/불일치 |
| `MAIL_ATTACHMENT_DOWNLOAD_FAILED` | O | `mail-message.ts`(마스킹) |
| `MAIL_PROVIDER_ERROR` | O | `mail-sync.ts` 동기화 실패(마스킹) |
| `MAIL_SEND_FAILED` | O | `mail-message.ts` 발송 실패(마스킹) |
| `MAIL_CREDENTIALS_INVALID` | O | `mail-provider-factory.ts` 복호화/토큰 부재 |
| `MAIL_OAUTH_ACCOUNT_MISMATCH` | O | `mail-account.ts` better-auth 소유권 불일치 |
| `MAIL_OAUTH_STATE_INVALID` | O | state 검증/userId 불일치 |
| `MAIL_OAUTH_EXCHANGE_FAILED` | O | 토큰 교환/userinfo 실패 |
| `MAIL_UPLOAD_TOO_LARGE` | O | 크기 초과 |
| `MAIL_UPLOAD_INVALID_TYPE` | O | MIME/magic bytes 불허 |
| `MAIL_UPLOAD_BLOCKED_EXTENSION` | O | 위험 확장자 |
| `MAIL_UPLOAD_NOT_FOUND` | O | 업로드 레코드 없음/소유 불일치 |
| `MAIL_CONNECTION_FAILED` | 미(OpenAPI 응답 선언만) | test 엔드포인트 문서용 |
| `MAIL_SYNC_IN_PROGRESS` | 미 | 코드/메시지만 정의 |
| `MAIL_ACCOUNT_ALREADY_EXISTS` | O | `mail-account.ts` create — `unique(user_id, email)` 위반(409) |
| `MAIL_BLOCKED_HOST` | 미 | host 차단은 DTO `safeHost` refine → `VALIDATION_ERROR` 로 표면화 |

## 테스트

`bun test`(부분: `bun test <경로>`). 관련 파일:

- dto: `tests/dto/mail/account.test.ts`(+signature), `message.test.ts`, `draft.test.ts`, `folder.test.ts`, `sync.test.ts`, `attachment.test.ts`
- route: `tests/route/mail/account.test.ts`(+signature), `message.test.ts`, `draft.test.ts`, `folder.test.ts`, `sync.test.ts`, `upload.test.ts`
- service: `tests/service/domain/mail/mail-account.test.ts`(+signature), `mail-message.test.ts`, `mail-draft.test.ts`, `mail-oauth-connect.test.ts`, `mail-provider-factory.test.ts`, `mail-sync.test.ts`, `mail-upload.test.ts`, `mail-crypto.test.ts`
- provider: `tests/service/domain/mail/providers/imap-provider.test.ts`, `gmail-provider.test.ts`, `gmail-helpers.test.ts`
- lib: `tests/lib/mail-utils.test.ts`, `tests/lib/mail-thread.test.ts`
- 어드민: `tests/page/admin/mail.test.ts`

## 주의사항 / 함정

- **incremental 판정은 폴더의 `sync_cursor` 존재로 한다**(`mail-sync.ts`). 커서가 없으면 초기 동기화로 간주한다. 폴더 목록 fetch·upsert 자체는 두 경우 모두 수행하고, 초기 동기화에서만 폴더 카운트(`includeCounts`)를 함께 받는다.
- **`mail_messages` unique 변경은 DB 에 아직 반영되지 않았다.** `db/schema.ts` 는 `(account_id, folder_id, remote_message_id)` 이지만 실제 DB 는 `bun run db:push` 전까지 이전 2열 unique 다. push 전에는 폴더 스코프 upsert 가 기대대로 동작하지 않을 수 있다.
- **IMAP thread 는 References 헤더가 있어야 안정적으로 묶인다.** envelope 에 References 가 없어 별도 fetch(`headers:['references']`)가 필요하고, `upsertMessage` 의 `onDuplicateKeyUpdate` set 에 `threadId`/`messageIdHeader`/`inReplyTo`/`referencesHeader` 가 포함되어야 재동기화 시 backfill 된다(과거 누락으로 인한 버그 이력: [../bug/mail-imap-thread-id.md](../bug/mail-imap-thread-id.md)).
- **Gmail attachmentId 는 불안정**하다. 캐시 miss 후 다운로드 실패 시 메시지 재조회로 remote id 를 다시 매칭(`downloadAttachmentViaProvider`)한다. IMAP 은 UID 안정적이나 다운로드 전 mailbox lock(폴더 open)이 선행되어야 한다.
- **provider 부작용은 best-effort**다. 플래그/이동/삭제 시 provider 호출을 `try/catch` 로 감싸 원격 실패해도 DB 상태는 갱신한다(로컬-원격 불일치 가능). 다만 삼키지 않고 `lib/sentry.ts` 의 `captureException` 으로 보고하며, provider 연결은 `finally` 에서 반드시 `disconnect()` 한다. 별표만 `expandToThreadMessageIds` 로 thread 전파한다.
- **삭제는 캐시된 첨부 오브젝트를 먼저 지운다.** `compose/mail.ts` 의 `deleteMessages` 는 대상 메시지의 `mail_attachments.r2_key` 가 있는 행을 모아 스토리지에서 삭제한 뒤(`storageService.del`, 실패는 `captureException`) `mail_messages` 행을 지운다. FK cascade 로 첨부 행이 함께 사라져 R2 오브젝트가 고아로 남던 경로를 막는다.
- **플래그·이동·삭제는 계정+폴더 단위로 그룹핑**한다(`groupByAccountFolder`). IMAP 은 UID 조작 전에 해당 mailbox 를 열어야 하므로, 각 그룹의 `remote_folder_id` 를 provider 에 넘겨 `runInMailbox`(`getMailboxLock` → 작업 → `release`)로 실행한다. `deleteMessage` 도 폴더 인자를 받아 같은 방식으로 `\\Deleted` 플래그 + `messageDelete` 를 UID 범위 한 번에 수행한다.
- **이동은 원격 UID 재매핑까지 반영**한다. IMAP `messageMove` 는 대상 mailbox 의 새 UID 매핑(`uidMap`)을 돌려주므로, 서비스는 이를 받아 `moveMessages`(`compose/mail.ts:601`)에 `{ messageId, remoteMessageId, uid }` 로 넘긴다. DB 반영은 **트랜잭션 1개** 안에서 항목별 순차 처리다.
    - 재매핑이 **있는** 항목: 대상 폴더에서 같은 새 `remote_message_id` 를 가진 다른 행을 지운 뒤, 옮기는 행의 `folder_id`·`remote_message_id`·`uid` 를 한 번에 갱신한다.
    - 재매핑이 **없는** 항목: 대상 폴더에 같은 `remote_message_id` 행이 이미 있으면 **옮기던 로컬 행을 지우고 대상 행을 보존**한다(그 메시지는 다음 동기화에서 대상 폴더 UID 로 다시 들어온다). 없으면 `folder_id` 만 갱신한다.
    - Gmail 은 계정 스코프라 폴더가 달라도 행이 하나뿐이므로 충돌이 없고 `folder_id` 만 갱신된다. 순차 처리라 한 배치 안에서 UID 가 겹쳐도 새 unique(`account_id`,`folder_id`,`remote_message_id`) 를 위반하지 않는다.
- **날짜 파싱 실패는 `null` 이다**: Gmail 의 `Date` 헤더·`internalDate`, IMAP 의 `envelope.date`·`internalDate` 는 `toValidDate`(`gmail-provider.ts:24-27`, `imap-provider.ts:18-21`)를 거친다. `new Date(...)` 가 `Invalid Date` 면 `null` 을 반환해 `sent_at`/`received_at` 이 `null` 로 저장된다. 이전에는 `Invalid Date` 가 그대로 INSERT 로 흘러가 그 배치 전체가 실패했다. 목록 정렬(`received_at desc`)에서 이런 행은 뒤로 밀린다.
- **`.eml` 첨부가 본문을 덮어쓰지 않는다**: Gmail payload 트리 순회(`gmail-helpers.ts:55-68`)가 `mimeType === 'message/rfc822'` 인 파트의 하위 `parts` 로는 **재귀하지 않는다**(`:65`). 메일에 다른 메일이 첨부된 경우 첨부된 메일의 `text/html`·`text/plain` 이 실제 본문을 덮어쓰던 문제를 막는다. 같은 mimeType 파트가 여러 개면 여전히 **마지막 값이 남는다**(`html`/`text` 는 단순 대입).
- **에러 메시지는 `maskProviderError` 로 IP/내부 호스트를 마스킹**해 노출을 막는다. 계정 생성 시 host 는 `isBlockedHost`(SSRF: localhost/사설 IPv4/IPv6·metadata 엔드포인트 등)로 DTO 단에서 차단된다.
- **`composeMail` 은 `MAIL_ENCRYPTION_KEY` 없으면 부팅 시 throw** 한다(선택적 서비스 stub 이 아니라 조립 단계에서 실패).
- **동기화 중에는 `lastSyncStatus` 가 `'running'`** 으로 보인다(`GET /api/mail/accounts`). mail 클라이언트는 `'error'`·`'success'` 만 구분하므로 그 사이에는 중립 배지로 표시된다. 동기화가 이미 진행 중일 때의 재호출은 오류가 아니라 **0 결과 성공 응답**이므로, 클라이언트가 "동기화됨" 으로 오해하지 않도록 응답의 카운트를 확인해야 한다.
- **`/manage/mail/sync` 의 `batchSize` 는 서버에서 클램프**된다(`dto/mail/sync.ts` 의 10..500, 기본 100). 어드민 폼이 임의 값을 보내도 API DTO 와 같은 범위로 좁혀진다.
- 목록 정렬은 `received_at desc`, thread 조회는 `sent_at asc`. 스토리지 캐시 다운로드는 CDN public URL 이 아니라 S3 SDK 로 직접 조회한다(private 버킷 대응, `compose/mail.ts` 주석).

## 관련 문서

- [../bug/mail-imap-thread-id.md](../bug/mail-imap-thread-id.md) — IMAP thread_id derive 버그·해결
- [../reference/db-schema.md](../reference/db-schema.md) — 전체 스키마 레퍼런스
- [../reference/env.md](../reference/env.md) — 전체 환경변수
- [../hono-reference.md](../hono-reference.md) — route 팩토리·`withErrorHandling`·응답 헬퍼 패턴
- [../../AGENTS.md](../../AGENTS.md) — 계층 경계·절대 규칙 요약
