# utils/ — 보조 스크립트·툴 기록

> 작업에 사용한 일회성/운영 스크립트를 기록한다. (`~/.claude/convention/ai-process.md` §9)

## 레포 내 스크립트 (`scripts/`)

| 스크립트 | 용도 | 실행 |
|----------|------|------|
| `scripts/backfill-thread-id.ts` | IMAP 메일의 `thread_id` 백필 — 계정별 전체 메시지를 스캔해 `computeThreadIds`(`lib/mail-thread.ts`)로 References 기반 threadId 를 계산, `thread_id` 가 NULL 인 행만 갱신 | `bun run scripts/backfill-thread-id.ts` (`--dry-run` 지원) |

배경: [bug/mail-imap-thread-id.md](../bug/mail-imap-thread-id.md)

## 규칙

- 새 스크립트는 `scripts/` 에 두고 이 표에 1행 추가한다(용도·실행법·`--dry-run` 지원 여부).
- 실 DB 를 변경하는 스크립트는 반드시 dry-run 모드를 먼저 제공·실행한다.
