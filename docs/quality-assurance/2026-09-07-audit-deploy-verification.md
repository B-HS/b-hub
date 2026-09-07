# 2026-09-06 전수 감사 수정(1~4차) 배포 전·후 검증 체크리스트

> 대상 브랜치 스택: `fix/audit-batch1-data-loss-security` → `fix/audit-batch2-immediate-errors` → `fix/audit-batch3-serverless` → `fix/audit-batch4-performance`(끝). dev 머지·배포 순서는 이 스택을 한 번에 올리는 것을 전제로 한다. 각 배치의 상세는 [../history/2026-09-06-audit-batch1.md](../history/2026-09-06-audit-batch1.md) · [../history/2026-09-07-audit-batch2.md](../history/2026-09-07-audit-batch2.md) · [../history/2026-09-07-audit-batch3.md](../history/2026-09-07-audit-batch3.md) · [../history/2026-09-07-audit-batch4.md](../history/2026-09-07-audit-batch4.md). 소비자 계약: [../reference/consumer-contracts.md](../reference/consumer-contracts.md).
>
> 사용법: 항목마다 확인 방법과 기대 결과가 적혀 있다. 확인이 끝나면 체크박스를 채운다. 기대와 다르면 해당 배치 history 의 "소비자 영향" 절과 대조한 뒤 [../bug/](../bug/) 에 기록한다.

## 1. 배포 전 (한 번만)

- [x] **스키마 반영** (2026-09-07 완료 — 1차 실행은 `ER_DROP_INDEX_FK` 로 중단, FK 인덱스 2종 유지 후 재실행, `No changes detected` 확인) — `bun run db:push` 를 프로덕션 DB 에 실행한다. 대기 중인 변경 3건이 한 번에 적용된다.
  - `mail_messages` unique → `(account_id, folder_id, remote_message_id)` (1차 F-7). 적용 전 같은 계정·폴더에 `remote_message_id` 중복 행이 있으면 push 가 실패한다. 실패하면 중복 행을 먼저 정리한다(가장 낮은 id 만 남김).
  - `calendar_subscription.user_id` unique (3차 R-25). 사용자당 구독 행이 2개 이상이면 실패한다.
  - 조회용 인덱스 8종 추가 + 중복 인덱스 3종 제거 (4차 P-02). FK 컬럼의 단일 인덱스(`idx_subscription_user`·`idx_mail_sync_logs_account`)는 유지한다. 큰 테이블(`log_events`·`weather_api_log`·`mail_sync_logs`)은 인덱스 생성에 수십 초가 걸릴 수 있다.
  - 기대: `drizzle-kit push` 가 오류 없이 끝나고, 이후 `bun run db:push` 재실행 시 "No changes detected".
- [x] **환경변수 확인** (2026-09-07 완료 — 코드가 읽는 항목 전부 존재, `SENTRY_DSN`·`DISCORD_WEBHOOK_URL` 은 선택으로 보류)
  - `UPLOAD_SERVER_SECRET` — upload-server 콜백 인증(1차 S-01)과 크론 시크릿 폴백(`/api/drive/lifecycle/*`·`/api/metrics/archive`·`/api/logs/purge`)에 쓰인다. 미설정이면 콜백은 503, 크론은 401 로 fail-closed.
  - `BETTER_AUTH_SECRET` — `/admin`·`/manage` CSRF 시크릿. 미설정이면 상태 변경 POST 가 403.
  - `MONGODB_URI`·`MAIL_ENCRYPTION_KEY`·`AI_ENCRYPTION_KEY` — 기존과 동일.
  - `REDIS_URL`(선택) — 있으면 mail·ai rate limit 카운터가 인스턴스 간 공유되고 weather 캐시가 Redis 를 쓴다. 없으면 인메모리(이전과 동일).
  - `SENTRY_DSN`(선택) — 3차부터 부트스트랩에서 실제로 초기화된다. 설정돼 있으면 이벤트가 처음으로 들어오기 시작하므로 쿼터를 확인한다.
- [x] **Vercel 크론 수** — 해당 없음: 사용자가 2026-09-07 크론을 비활성화했다. 다시 켤 때 `CRON_SECRET` 과 `UPLOAD_SERVER_SECRET` 값이 같아야 하며, 4개(`evict-r2`·`auto-promote`·`metrics/archive`·`logs/purge`)가 플랜 한도 안인지 확인한다.
- [x] **별도 Docker 서비스 재배포** (2026-09-07 완료) — 서버(`~/server`)에서 두 경로가 다르다.
  - upload-server: `cd ~/server/b-hub/deploy/upload-server && git pull && docker compose up -d --build` (compose 프로젝트 `upload-server`, `.env` 는 그 디렉터리 것).
  - caldav-proxy: `~/server/compose.yml` 의 서비스(`build: ./caldav-proxy`, `gumyo` 네트워크)라 **`~/server/caldav-proxy/` 사본을 먼저 덮어써야** 한다: `cp b-hub/deploy/caldav-proxy/{proxy.ts,Dockerfile} caldav-proxy/ && docker compose up -d --build caldav-proxy`. `deploy/caldav-proxy` 에서 직접 `up` 하면 포트 4000 충돌로 실패한다.
- [ ] **롤백 준비** — 문제가 생기면 Vercel 에서 직전 배포로 promote 한다. 스키마는 unique·인덱스 추가만이라 롤백 코드와도 호환된다(unique 위반이 생길 수 있는 경로는 1차 이전 코드의 중복 upsert 뿐).

## 2. 배포 직후 스모크 (5분)

- [x] `GET /api/health` → 200. (2026-09-07 11:52 UTC 확인)
- [x] `GET /admin` → 303 `/admin/login?next=%2Fadmin`, `GET /admin/login/logout` → 302 `/admin/login` + 세션 쿠키 무효화 `Set-Cookie`(3차 원복 확인). 로그인 후 대시보드 200 은 사용자 확인 필요.
- [x] `GET /api/blog/posts?limit=1` → 200, 필드 순서 `postId … tags`, `tags` 배열, `pagination.total` 정상.
- [ ] `GET /api/weather/locations` → 키 없이 401(정책 불변) 확인. ETag·304 는 weather 키로 사용자 확인 필요.
- [x] `GET /api/badge/image?v=<ts>` → 200 + `CDN-Cache-Control` + `X-RateLimit-Limit: 60`, 기존 `Cache-Control` 값 동일. `GET /api/spotify/playing/<무효 토큰>` → 404 + `X-RateLimit-Limit: 60`.
- [x] `GET /api/logs/purge` 시크릿 없이 → 401 `{ success:false, error:{ code:'UNAUTHORIZED' } }` 봉투(3차 신규 라우트 반영 지표). `POST /api/metrics/ingest` 토큰 없이 → 401.
- [ ] Vercel 함수 로그에 `MongoTopologyClosedError`·`ER_DUP_ENTRY`·`Unknown column` 이 없다(사용자 확인).

## 3. 소비자별 실동작 확인 (배포 당일)

> 2026-09-07 사용자 확인: bblog·RESUME·mail·Calendar·Storage 정상. weather 웹·ESP32, ESP32 로그·dashboard, Spotify 위젯, /manage 는 추후 확인(사용자 결정).

| 소비자 | 확인 | 기대 결과 |
|------|------|------|
| bblog | 목록·상세·태그 필터·댓글 작성·글 수정/삭제·이미지 3단계 업로드 | 전부 이전과 동일. 존재하지 않는 글에 댓글 → 404, 댓글 닫힌 글 → 403(3차 R-16). 방명록 피드의 다중 이미지 순서가 `imageId` 오름차순 |
| RESUME | `GET /api/resume/public/web`·인라인 편집 PATCH | 변경 없음 |
| mail | 계정 연결, 수동 동기화 2회 연속 클릭, 메일 열기(읽음 처리), 답장·전달, 첨부 다운로드 | 동시 동기화는 두 번째가 `{ added:0, updated:0, deleted:0 }` 즉시 성공(3차 R-06). 답장·전달 응답에 `X-RateLimit-*` 헤더. 동기화 중 계정 목록의 `lastSyncStatus` 가 잠시 `running` |
| Calendar | 이벤트 생성·수정, ICS 구독 URL 재요청, Apple 캘린더 동기화 | 남의 그룹 id → 404, 종료 < 시작 → 400(3차 R-26). ICS 재요청 시 304. Apple 캘린더는 재동기화로 흡수(1차 href 정리·2차 프록시 헤더) |
| Storage | 업로드(prepare→upload-server→complete)·다운로드·폴더 삭제 | 해시 중복 → 409 `DRIVE_DUPLICATE_FILE`, 쿼터 초과 → 413(2차). 다운로드 헤더 동일 |
| weather 웹 · ESP32 | `/current`·`/ultra-short`·`/short-term` 을 키로 호출 | 정수 필드·문자열 형식 동일. `baseDate`/`baseTime` 이 KST 기준(2차 E-08). 429 는 일일 한도 초과 시에만 |
| ESP32 로그 · dashboard | `POST /api/logs`, `POST /api/metrics/ingest`(단건·배치) | 상태 코드 순서 401→429→400→413 유지. 정상 payload 는 새 본문 상한(1MB / 128KB / 4MB)에 걸리지 않음 |
| Spotify 위젯 | 공개 위젯 SVG/HTML/JSON | 바이트 동일 + `X-RateLimit-*` 헤더. 비활성 계정은 404(2차 A-4) |
| /manage | 토큰·weather 키·spotify 키 발급 | 발급 후 303 → 목록에서 평문 1회 표시 후 새로고침하면 사라짐(3차 R-14) |

## 4. 배포 후 24시간 관측

- [ ] `04:40 UTC` 크론 `GET /api/logs/purge` 가 200 을 냈고 응답에 `weatherApiLogDeleted`·`mailSyncLogDeleted`·`mailSyncSessionDeleted` 가 있다.
- [ ] Sentry(설정 시)에 `redis-client`·`rate-limit-store` 관련 반복 오류가 없다. 있으면 `REDIS_URL` 접속 상태를 확인한다(첫 연결 실패 시 그 인스턴스는 인메모리로 계속 동작).
- [ ] Discord 알림이 분당 20건 예산 안에서 오고, 같은 `service:errorCode` 는 1분에 한 번만 온다.
- [ ] 어드민 `/admin/logs` 에서 `MAIL_PROVIDER_ERROR`·`WEATHER_KMA_API_ERROR` 급증이 없다(KMA 8초 timeout·4xx 즉시 502 는 3차 의도).

## 5. 후속 결정 대기 (사용자)

- P-03 sharp/satori/resvg 지연 import — preview 배포로 badge·썸네일 렌더를 확인한 뒤 적용 여부 결정.
- P-10·P-11 IMAP/Gmail 호출 축소 — 프로토콜 동작 변경이라 별도 승인 후 진행.
- Rirekisyo K-1/K-2, A-6(calendar range 800일)·A-7·A-8·A-9·A-10 — 보류 상태 유지(acknowledge 참조).
