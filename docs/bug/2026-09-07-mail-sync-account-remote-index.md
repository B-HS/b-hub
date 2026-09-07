# 2026-09-07 배포 후 Gmail 동기화 실패 — (account_id, remote_message_id) 인덱스 소실

## 증상

- 프로덕션 배포(감사 수정 1~4차) 직후 mail 클라이언트의 Gmail 수동 동기화가 30초에서 클라이언트 측 취소(네트워크 탭 canceled)되고, 계정 아이콘이 오류 상태로 표시됨. Gmail 연결 테스트는 성공.
- `/admin/logs`: 21:22 `INTERNAL_ERROR "Failed query: update mail_sync_logs set status, duration_ms …"`, 이후 `MAIL_PROVIDER_ERROR "메일 서버 연결에 실패했습니다 (Failed query: delete from mail_messages where (account_id = ? and remote_message_id in …"`.

## 원인

1. 1차 배치(D-05)에서 `mail_messages` 의 unique 를 `(account_id, remote_message_id)` → `(account_id, folder_id, remote_message_id)` 로 바꿨다. 그 unique 가 Gmail(identityScope `account`) 경로의 유일한 `(account_id, remote_message_id)` 접근 경로였는데, 새 unique 는 두 번째 컬럼이 `folder_id` 라 `folder_id` 없이 `remote_message_id` 로 찾는 쿼리(계정 단위 identity SELECT, `deleteMessagesByRemoteIds`)를 커버하지 못한다.
2. 그 결과 Gmail 동기화의 DELETE 가 계정의 전체 행(약 5만)을 인덱스 범위로 훑으며 next-key 락을 잡고, 라벨별로 병렬 실행되는 동기화들이 서로 lock wait 에 걸려 30초를 넘기고 실패했다.
3. 실패의 원문이 보이지 않았던 이유 둘: (a) 동기화 catch 경로가 DrizzleQueryError 전문(쿼리 + 파라미터, 메일 본문 포함)을 `mail_sync_logs.error_message`(text, 64KB) 에 그대로 쓰다가 그 UPDATE 마저 실패해 `INTERNAL_ERROR` 로 덮임, (b) AppError 는 `errorDetail` 을 세팅하지 않아 `/admin/logs` 에 일반 메시지만 남음.

## 해결

| 커밋 | 내용 |
|------|------|
| `04a8ce3` fix(mail) | 실패 메시지 2000자 절단, 로그 기록 실패가 원인을 덮지 않게 try/catch, 첨부 `message_id` null 방지 |
| `48268a8` fix(logs) | `describeAppError` — AppError 의 `details.detail`/`message` 를 오류 로그 설명에 기록 |
| `fe0fab8` fix(mail) | `idx_mail_messages_account_remote (account_id, remote_message_id)` 인덱스 복원(**db:push 필요**), `describeThrownError` 로 DrizzleQueryError 의 cause(MySQL 사유)를 원문 앞에 기록 |

## 재발 방지

- unique 제약의 컬럼 순서를 바꿀 때는 그 unique 가 제공하던 **접근 경로(선행 컬럼 조합)** 를 쓰는 쿼리가 있는지 확인하고, 필요하면 별도 인덱스로 보존한다.
- 진단용 유틸: [../utils/check-audit-recent-errors.ts](../utils/check-audit-recent-errors.ts)(동기화 로그·오류 로그·날씨 로그 조회), [../utils/check-audit-indexes.ts](../utils/check-audit-indexes.ts)(인덱스 실측).

## 같은 시각의 다른 보고

- weather `WEATHER_KMA_API_ERROR (HTTP 401)`: KMA 는 `serviceKey` 가 비어 있으면 401, 잘못된 키면 403 을 돌려준다(실측). 코드의 키 주입 경로(`compose/weather.ts` → `env.KMA_API_KEY`)는 감사 전후 동일하므로 Vercel 의 `KMA_API_KEY` 값 문제로 보인다. 사용자 결정으로 보류.
- mail 클라이언트 콘솔의 `Blocked script execution … sandboxed` 는 메일 본문 iframe 의 의도된 보안 동작이라 조치 대상이 아니다.
