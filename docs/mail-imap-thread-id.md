# IMAP 메일 스레드 묶기 — threadId derive

## 대상 파일

- `lib/mail-utils.ts` (`deriveThreadId`)
- `service/domain/mail/providers/imap-provider.ts` (`parseReferencesHeader`, `fetchMessages`, `fetchMessageDetail`)
- `compose/mail.ts` (`upsertMessage` 의 `onDuplicateKeyUpdate`)

## 증상

IMAP 계정의 메일이 thread 로 묶이지 않았다. 보낸 메일(sent)과 받은 메일(inbox)이 같은 대화여도 별개로 표시된다.

## 근본 원인

`getThread(accountId, threadId)` 는 `mail_messages.thread_id` 컬럼으로 메시지를 묶는다.

- Gmail provider 는 `raw.threadId`(native thread id)를 채워서 정상 동작한다.
- IMAP provider 는 `threadId` 를 한 번도 설정하지 않아(`upsertMessage(threadId: null)`) 모든 IMAP 메일의 `thread_id` 가 null 이었고, 따라서 묶이지 않았다.

IMAP/표준 SMTP 메일에는 native thread id 가 없다. 대신 RFC 5322 의 `Message-ID` / `In-Reply-To` / `References` 헤더로 대화 체인을 복원해야 한다.

## 해결

### deriveThreadId

`(params: { references?, inReplyTo?, messageIdHeader? }) => string | null` 헬퍼를 추가했다. 우선순위:

1. `references` 가 있으면 `<...>` Message-ID 토큰들을 추출해 **첫 번째 토큰**(대화 root)을 반환.
2. 없으면 `inReplyTo`(정규화) 반환.
3. 그것도 없으면 `messageIdHeader`(자기 자신이 root) 반환.
4. 모두 없으면 null.

모든 토큰은 앞뒤 공백 제거 후 `<...>` 형태로 일관 정규화한다.

#### References 첫 토큰을 root 로 쓰는 이유

답장 체인이 3단계 이상이면 `In-Reply-To` 는 **직전 메일**만 가리켜 메시지마다 다른 값이 되어 root 가 흔들린다. `References` 헤더의 첫 토큰은 항상 **대화 시작 메일**이라 같은 대화의 모든 메일에서 안정적으로 동일하다. 보낸 메일은 받은 메일의 Message-ID 를 References/In-Reply-To 에 포함하므로, 같은 대화의 sent/inbox 가 같은 threadId 로 묶인다.

### imap-provider — References 헤더 fetch

ImapFlow 의 envelope(`MessageEnvelopeObject`)에는 `messageId` 와 `inReplyTo` 만 있고 **`references` 는 없다**. References 는 fetch 쿼리에 `headers: ['references']` 를 추가해 가져온다. 결과는 `FetchMessageObject.headers?: Buffer`(요청한 헤더의 raw 바이트)로 온다. 이를 `parseReferencesHeader` 로 파싱한다.

근거: `node_modules/imapflow/lib/imap-flow.d.ts` 의 `FetchQueryObject.headers?: boolean | string[]` ("array of header keys then includes only headers listed") / `FetchMessageObject.headers?: Buffer`, 그리고 context7 ImapFlow 공식 문서(`headers: ['subject', 'from']` 예시).

`fetchMessages` / `fetchMessageDetail` 둘 다에서 references 를 추출하고 `deriveThreadId(...)` 로 각 ProviderMessage 의 `threadId` 를 설정한다. 기존 동작(envelope/flags/본문/첨부)은 그대로 유지한다.

### backfill — upsertMessage onDuplicateKeyUpdate

`compose/mail.ts` 의 `upsertMessage` 는 기존 메시지 재동기화 시 `onDuplicateKeyUpdate` set 에 `threadId` 등을 포함하지 않아, 이미 저장된 IMAP 메일(`thread_id=null`)이 backfill 되지 않았다. set 에 `threadId`, `messageIdHeader`, `inReplyTo`, `referencesHeader` 를 추가해 재동기화 시 채워지게 했다.

### Gmail provider

변경하지 않았다. native `raw.threadId` 우선 정책을 유지한다.

## 검증

- `bun test` 전체 통과 (2064 pass / 0 fail).
- `bun run typecheck` (tsc --noEmit) 에러 없음.
- 추가 테스트: `tests/lib/mail-utils.test.ts`(deriveThreadId 케이스), `tests/service/domain/mail/providers/imap-provider.test.ts`(References → threadId 매핑, fetch 쿼리 headers 요청 확인).
