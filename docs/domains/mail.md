# mail 도메인

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 다루는 코드: `dto/mail/*`, `route/mail/*`, `service/domain/mail/**`, `compose/mail.ts`, `lib/mail-utils.ts`, `lib/mail-thread.ts`, `lib/credential-crypto.ts`(자격증명 암복호화 공용 구현), `scripts/backfill-thread-id.ts`, `db/schema.ts`(mail_* 테이블)

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
| `dto/mail/attachment.ts` | 첨부 다운로드 파라미터(`messageId`·`attachmentId`) |
| `dto/mail/sync.ts` | incremental 트리거·historical 배치·상태조회 쿼리 스키마 |
| `route/mail/account.ts` | 계정 CRUD·연결테스트·Gmail OAuth connect/callback |
| `route/mail/folder.ts` | 폴더 목록 조회 |
| `route/mail/message.ts` | 목록·검색·스레드·발신자·상세·플래그·이동·삭제·발송·답장·전달·첨부 다운로드 |
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
| `service/domain/mail/mail-upload.ts` | 업로드 검증(MIME·magic bytes·확장자·크기)·저장·발송용 resolve |
| `compose/mail.ts` | ServiceDb(Drizzle) 구현·의존성 조립. provider factory, OAuth 토큰 getter/refresher, rate limiter, storage adapter |
| `lib/mail-utils.ts` | 헤더 sanitize, MIME encoded-word, 주소 포맷, `isBlockedHost`, `maskProviderError`, `extractMessageIdTokens`, `deriveThreadId`, `sanitizeFilename` |
| `lib/mail-thread.ts` | `computeThreadIds`(union-find 스레드 그룹핑, 백필용) |
| `lib/credential-crypto.ts` | 자격증명 암복호화 구현(AES-256-GCM, v2=scrypt / v1=legacy). mail·ai 도메인이 공유(mail=`MAIL_ENCRYPTION_KEY`, ai=`AI_ENCRYPTION_KEY`) |
| `scripts/backfill-thread-id.ts` | 기존 메일 `thread_id` 일괄 백필 CLI |
| `tests/…/mail*` | dto·route·service·provider·lib 테스트(하단 테스트 섹션) |

## 데이터 모델

`db/schema.ts` 의 mail_* 테이블 7개. 컬럼 상세는 [../reference/db-schema.md](../reference/db-schema.md) 참조.

| 테이블(물리명) | 핵심 컬럼 | 인덱스/제약 | 관계 |
|---|---|---|---|
| `mail_accounts` | `provider`, `email`, `credentials`(암호화 text), `imap_host/port/tls`, `smtp_host/port/tls`, `last_sync_at/status`, `sync_cursor`, `better_auth_account_id` | idx(`user_id`), unique(`user_id`,`email`) | `user_id`→`user`(cascade) |
| `mail_folders` | `remote_folder_id`, `name`, `type`, `parent_id`, `message_count`, `unread_count`, `uid_validity`, `sync_cursor` | idx(`account_id`), unique(`account_id`,`remote_folder_id`) | `account_id`→`mail_accounts`(cascade) |
| `mail_messages` | `remote_message_id`, `message_id_header`, `thread_id`, `in_reply_to`, `references_header`, `from/to/cc/bcc_address`(json), `subject`, `body_html/text`(longtext), `snippet`, `is_read/starred/draft`, `has_attachments`, `sent_at`, `received_at`, `uid` | unique(`account_id`,`remote_message_id`); idx(`folder_id`),(`sent_at`),(`thread_id`),(`account_id`,`is_read`),(`account_id`,`folder_id`,`received_at`),(`account_id`,`received_at`) | `account_id`→`mail_accounts`, `folder_id`→`mail_folders`(cascade) |
| `mail_attachments` | `remote_attachment_id`, `filename`, `mime_type`, `size_bytes`, `content_id`, `is_inline`, `r2_key`(캐시 키) | idx(`message_id`), unique(`message_id`,`remote_attachment_id`) | `message_id`→`mail_messages`(cascade) |
| `mail_sync_logs` | `sync_type`, `status`, `folder_id`, `messages_added/updated/deleted`, `duration_ms`, `error_message`, `started_at`, `completed_at` | idx(`account_id`) | `account_id`→`mail_accounts`(cascade) |
| `mail_sync_sessions` | `sync_type`, `status`, `total_estimate`, `synced_count`, `cursor`, `started_at`, `last_batch_at`, `completed_at` | idx(`account_id`,`status`) | `account_id`→`mail_accounts`(cascade) |
| `mail_uploads` | `filename`, `mime_type`, `size_bytes`, `r2_key`(unique), `is_inline` | idx(`user_id`) | `user_id`→`user`(cascade) |

- 모든 PK 는 `int autoincrement`. 원격 식별자(`remote_message_id`·`remote_folder_id`·`remote_attachment_id`)는 provider 별 의미가 다르다(Gmail=API id / IMAP=UID·part id).

## API 엔드포인트

전체 mount: `route/index.ts` 가 `/mail/*` 에 라우터를 얹고, `index.ts` 가 `app.route('/api', api)` 로 마운트 → 실제 경로는 `/api/mail/*`. 모든 엔드포인트는 better-auth **세션 인증**(`withAuth`, upload 는 `getSession` 직접 확인)을 요구한다.

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/mail/accounts` | 세션 | 계정 목록 |
| GET | `/api/mail/accounts/:accountId` | 세션 | 계정 상세 |
| POST | `/api/mail/accounts` | 세션 | 계정 연결(IMAP 수동/프리셋; body=`mailAccountCreateSchema`) |
| PATCH | `/api/mail/accounts/:accountId` | 세션 | 계정 수정(`displayName`/`isActive`) |
| DELETE | `/api/mail/accounts/:accountId` | 세션 | 계정 삭제 |
| POST | `/api/mail/accounts/:accountId/test` | 세션 | 연결 테스트(`provider.testConnection`) |
| GET | `/api/mail/accounts/connect/google` | 세션 | Gmail OAuth 시작 → Google 로 302 |
| GET | `/api/mail/accounts/connect/google/callback` | 세션 | OAuth 콜백 → 계정 생성/연결 후 redirect |
| GET | `/api/mail/folders?accountId=` | 세션 | 폴더 목록 |
| GET | `/api/mail/messages` | 세션 | 메시지 목록(페이지네이션, `accountId`/`folderId`/`isRead`/`isStarred` 필터) |
| GET | `/api/mail/messages/search?q=` | 세션 | 제목·snippet LIKE 검색 |
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
| POST | `/api/mail/messages/:messageId/reply` | 세션 | 답장(In-Reply-To/References 자동) |
| POST | `/api/mail/messages/:messageId/forward` | 세션 | 전달 |
| GET | `/api/mail/messages/:messageId/attachments/:attachmentId` | 세션 | 첨부 다운로드(바이너리 Response) |
| POST | `/api/mail/sync` | 세션 + rate limit | incremental 동기화 |
| POST | `/api/mail/sync/historical` | 세션 | historical 배치 동기화 |
| GET | `/api/mail/sync/status?accountId=` | 세션 | 최신 로그 + 진행 세션 상태 |
| POST | `/api/mail/uploads` | 세션 | 첨부/인라인 업로드(multipart `file`, `inline` 플래그) |
| DELETE | `/api/mail/uploads/:uploadId` | 세션 | 업로드 삭제 |

- rate limit: `compose/mail.ts` 의 `createRateLimiter({ windowMs: 60_000, maxRequests: 20 })`, 키 `mail:{key}:{path}`. `checkLimit` 이 주입될 때만 `send`·`sync` 에 적용된다.

## 핵심 흐름

### 계정 연결 — 2경로

1. **Gmail OAuth(`mail-oauth-connect.ts`)**: `GET connect/google` → `generateAuthUrl`(scope: `openid email profile gmail.modify gmail.send`, `access_type=offline`, `prompt=consent`, HMAC state=userId+redirect, TTL 10분) → Google 동의 → `callback` 에서 `handleCallback`: state 검증(userId 일치) → code→토큰 교환 → userinfo 조회 → better-auth `account`(providerId=`google`) upsert → 같은 이메일 mail 계정이 있으면 `better_auth_account_id` 링크, 없으면 provider=`gmail` 로 mail 계정 생성. 자격증명(`credentials`)은 저장하지 않고 better-auth account 의 토큰을 재사용한다.
2. **IMAP 수동(`POST /api/mail/accounts`)**: provider=`naver`/`daum`(프리셋) 또는 `imap`(host/port 직접). `credentials.password` 필수. `mail-account.ts create` 가 `crypto.encrypt(JSON.stringify(credentials))` 로 암호화해 `credentials` 컬럼에 저장. 계정 수 상한 `MAX_ACCOUNTS_PER_USER=10`.

### provider 추상화 (`mail-provider-factory.ts`)

- `create(account)`: provider=`gmail` 이면 `betterAuthAccountId` 필수(없으면 `MAIL_CREDENTIALS_INVALID`), OAuth 토큰 getter/refresher 를 넘겨 `createGmailProvider`. 그 외는 `credentials` 복호화 → `IMAP_PRESETS`(naver/daum) 또는 account 의 host/port 로 `createImapProvider`. 두 구현 모두 `MailProvider` 를 만족하므로 상위 서비스는 provider 종류를 모른다.
- Gmail: `gmailFetch` 가 401 시 refresh token 으로 재발급(단일 `refreshPromise` 로 중복 방지), 429 시 점증 대기(1·2·3초, `(4-retries)*1000`) 최대 3회 재시도. 폴더=Gmail label(일부 시스템 label skip), 메시지 id=API message id.
- IMAP: 폴더=mailbox path, 메시지 id=UID 문자열. `getMailboxLock` 으로 mailbox 열고 fetch. 본문은 `simpleParser`(mailparser)로 파싱.

### 동기화 (`mail-sync.ts`)

- **incremental(`syncAccount`)**: 활성 세션이 `running` 이면 error 로 정리 → provider connect → 폴더 중 `sync_cursor` 가 하나라도 있으면 incremental, 아니면 초기 동기화(폴더 fetch·upsert 후 폴더별 최초 배치). incremental 은 폴더 병렬, 초기는 순차. 폴더별 `syncFolder`: `fetchMessages({folderId, cursor, batchSize:100})` → `upsertMessagesFromProvider`(메시지·첨부 upsert, 10건마다 이벤트루프 yield) → 삭제 반영 → `sync_cursor` 갱신 → 폴더 카운트 재계산. `mail_sync_logs` 기록, 실패 시 `MAIL_PROVIDER_ERROR`(메시지 마스킹).
- **historical(`syncHistorical`)**: `mail_sync_sessions` 기반 과거 메일 역방향 배치. 대상 폴더=지정 folderId 또는 inbox. `fetchMessages({direction:'backward', batchSize, cursor})` → 세션 `synced_count`/`cursor`/`total_estimate` 갱신, 남은 커서 있으면 `paused` 없으면 `completed`. 응답에 `hasMore`·`cursor`·진행 수치 포함.
- **커서 의미**: Gmail=incremental 은 History API `historyId`, backward 는 messages.list `pageToken`. IMAP=UID 숫자(forward `UID+1:*`, backward `1:UID-1`). 커서는 폴더별 `mail_folders.sync_cursor` 가 1차, `mail_accounts.sync_cursor` 는 fallback.

### 메시지 조회·thread 묶기

- 목록/검색/발신자/스레드는 모두 `compose/mail.ts` 의 Drizzle 쿼리(`mailMessageDb`)에서 사용자 소유 계정 id 로 스코프를 걸어(단건이면 소유 확인 후 `accountId` 고정, 없으면 사용자 전체 계정) 소유권을 검증한다(스레드는 서비스단 `accountService.getById` 로 선검증). 상세(`getById`)는 첨부 포함, 안읽음이면 `applyFlagAction(markRead)` 를 fire-and-forget.
- **thread_id 산출**: Gmail 은 native `raw.threadId` 를 그대로 사용. IMAP 은 native thread 가 없어 `deriveThreadId({references, inReplyTo, messageIdHeader})` 로 도출(References 첫 토큰 > In-Reply-To > Message-ID 우선순위). IMAP envelope 에는 References 가 없어 fetch 쿼리에 `headers:['references']` 를 추가하고 `parseReferencesHeader` 로 파싱한다. 상세는 [../bug/mail-imap-thread-id.md](../bug/mail-imap-thread-id.md).
- `getThread(accountId, threadId)` 는 `mail_messages.thread_id` 가 같은 행을 `sent_at` 순으로 반환한다.

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
| `MAIL_ACCOUNT_ALREADY_EXISTS` | 미 | 코드/메시지만 정의 |
| `MAIL_BLOCKED_HOST` | 미 | host 차단은 DTO `safeHost` refine → `VALIDATION_ERROR` 로 표면화 |

## 테스트

`bun test`(부분: `bun test <경로>`). 관련 파일:

- dto: `tests/dto/mail/account.test.ts`, `message.test.ts`, `folder.test.ts`, `sync.test.ts`, `attachment.test.ts`
- route: `tests/route/mail/account.test.ts`, `message.test.ts`, `folder.test.ts`, `sync.test.ts`, `upload.test.ts`
- service: `tests/service/domain/mail/mail-account.test.ts`, `mail-oauth-connect.test.ts`, `mail-provider-factory.test.ts`, `mail-sync.test.ts`, `mail-message.test.ts`, `mail-upload.test.ts`, `mail-crypto.test.ts`
- provider: `tests/service/domain/mail/providers/imap-provider.test.ts`, `gmail-provider.test.ts`, `gmail-helpers.test.ts`
- lib: `tests/lib/mail-utils.test.ts`, `tests/lib/mail-thread.test.ts`
- 어드민: `tests/page/admin/mail.test.ts`

## 주의사항 / 함정

- **incremental 판정은 폴더의 `sync_cursor` 존재로 한다**(`mail-sync.ts`). 커서가 없으면 초기 동기화로 간주해 폴더를 다시 fetch·upsert 한다.
- **IMAP thread 는 References 헤더가 있어야 안정적으로 묶인다.** envelope 에 References 가 없어 별도 fetch(`headers:['references']`)가 필요하고, `upsertMessage` 의 `onDuplicateKeyUpdate` set 에 `threadId`/`messageIdHeader`/`inReplyTo`/`referencesHeader` 가 포함되어야 재동기화 시 backfill 된다(과거 누락으로 인한 버그 이력: [../bug/mail-imap-thread-id.md](../bug/mail-imap-thread-id.md)).
- **Gmail attachmentId 는 불안정**하다. 캐시 miss 후 다운로드 실패 시 메시지 재조회로 remote id 를 다시 매칭(`downloadAttachmentViaProvider`)한다. IMAP 은 UID 안정적이나 다운로드 전 mailbox lock(폴더 open)이 선행되어야 한다.
- **provider 부작용은 best-effort**다. 플래그/이동/삭제 시 provider 호출을 `try/catch{}` 로 감싸 원격 실패해도 DB 상태는 갱신한다(로컬-원격 불일치 가능). 별표만 `expandToThreadMessageIds` 로 thread 전파한다.
- **에러 메시지는 `maskProviderError` 로 IP/내부 호스트를 마스킹**해 노출을 막는다. 계정 생성 시 host 는 `isBlockedHost`(SSRF: localhost/사설 IPv4/IPv6·metadata 엔드포인트 등)로 DTO 단에서 차단된다.
- **`composeMail` 은 `MAIL_ENCRYPTION_KEY` 없으면 부팅 시 throw** 한다(선택적 서비스 stub 이 아니라 조립 단계에서 실패).
- 목록 정렬은 `received_at desc`, thread 조회는 `sent_at asc`. 스토리지 캐시 다운로드는 CDN public URL 이 아니라 S3 SDK 로 직접 조회한다(private 버킷 대응, `compose/mail.ts` 주석).

## 관련 문서

- [../bug/mail-imap-thread-id.md](../bug/mail-imap-thread-id.md) — IMAP thread_id derive 버그·해결
- [../reference/db-schema.md](../reference/db-schema.md) — 전체 스키마 레퍼런스
- [../reference/env.md](../reference/env.md) — 전체 환경변수
- [../hono-reference.md](../hono-reference.md) — route 팩토리·`withErrorHandling`·응답 헬퍼 패턴
- [../../AGENTS.md](../../AGENTS.md) — 계층 경계·절대 규칙 요약
