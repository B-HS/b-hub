# 배포·운영(Deploy & Ops)

> 기준: 2026-09-07 (fix/audit-batch4-performance @ 4차 배치 반영) 코드 검증. 다루는 코드: `vercel.json`, `api/index.js`, `package.json`, `index.ts`, `bunfig.toml`, `drizzle.config.ts`, `.gitignore`, `lib/env.ts`, `lib/cron-auth.ts`, `db/index.ts`, `route/drive/lifecycle.ts`, `route/drive/asset.ts`, `route/logs/purge.ts`, `route/metrics/archive.ts`, `route/blog/image.ts`, `service/domain/blog/blog-image.ts`, `service/shared/redis-client.ts`, `service/shared/rate-limit-store.ts`, `compose/blog.ts`, `compose/drive.ts`, `compose/index.ts`, `deploy/caldav-proxy/*`, `deploy/upload-server/*`

## 개요

배포 대상은 3개다. 메인 앱은 Vercel 단일 서버리스 함수이고, `deploy/` 하위에 독립 실행되는 Docker 서비스 2개(caldav-proxy·upload-server)가 별도로 붙는다.

| 대상 | 실행 방식 | 포트 | 소스 | 소유 문서 |
|------|-----------|:---:|------|-----------|
| 메인 앱 | Vercel 서버리스 단일 함수 | 플랫폼 관리(로컬 기본 9999) | 루트(`index.ts` → 번들 `api/hub.js`, 커밋 셔임 `api/index.js`) | 이 문서 §1~3 |
| caldav-proxy | Docker(Bun) 리버스 프록시 | 4000 | `deploy/caldav-proxy/` | 이 문서 §4 |
| upload-server | Docker(Bun) 별도 서비스(자체 `package.json`) | 4100 | `deploy/upload-server/` | 이 문서 §5 |

- 빌드·실행 명령 전체 표와 `vercel.json` 키 표는 [architecture.md](./architecture.md) §8 이 정본이다. 이 문서는 그 §8 이 위임한 **배포 파이프라인·`deploy/` Docker 서비스**만 다룬다.
- 환경변수 키 목록은 §6 에 서비스별로 모았다(값은 기재하지 않음).

---

## 1. Vercel 메인 앱

### 파이프라인

- `vercel.json` 이 배포를 정의한다. `buildCommand` = `bun run vercel-build`, `bunVersion` = `1.x`, **`framework` = `null`(필수, 제거 금지)**.
- **`"framework": null` 은 Vercel 빌더의 hono 프레임워크 자동 감지를 차단한다.** 빌더 CLI 54.19.0 부터 hono 감지 시 자가 번들 함수와 별개로 루트 `index.ts` 기반 **비번들 함수**(`λ index`, NFT 트레이싱 node_modules)를 추가 생성하는데, 트레이서(exports `default` 조건 파일 포함)와 Bun 런타임(exports `node` 조건 resolve)의 불일치로 better-auth 1.6 분리 패키지가 누락되어 `/` 콜드스타트가 크래시했다(2026-07-09 production 장애). 상세 경위·재현·진단 절차: [bug/2026-07-09-vercel-hono-detection-crash.md](./bug/2026-07-09-vercel-hono-detection-crash.md)
- `vercel-build` 는 `bun build ./index.ts --outfile ./api/hub.js --target bun --format esm` 로 진입점 `index.ts` 를 **단일 파일 `api/hub.js`** 로 번들한다. `api/hub.js` 는 `.gitignore` 에 있어 커밋되지 않고 빌드 시 생성된다.
- **`api/index.js` 는 커밋되는 함수 엔트리 셔임이다(제거·변경 금지).** 내용은 `export { default } from './hub.js'` 한 줄. 새 빌더(CLI 54.21.1+)는 함수를 **클론 시점 소스 트리에서 열거**하므로 gitignored 번들만으로는 함수가 생성되지 않는다(전 경로 404). 셔임이 클론 시점에 존재해 함수로 열거되고, 함수 빌드가 buildCommand 이후 실행되며 `./hub.js`(번들)를 가리켜 최종 핸들러 = 자가 번들이 된다. **`.ts` 로 바꾸면 안 되고**(빌더 tsc 가 `./hub.js` 류 지정자를 `.ts` 로 매핑해 타입에러), **소스(`../index.ts`)를 가리켜도 안 된다**(원시 그래프 트레이싱으로 아래 크래시를 다시 밟음). 경위: [bug/2026-07-09-vercel-hono-detection-crash.md](./bug/2026-07-09-vercel-hono-detection-crash.md)
- `rewrites`: `/(.*)` → `/api`. **모든 경로가 하나의 서버리스 함수(셔임 `api/index.js` → 번들 `api/hub.js`)로 유입**되고, `/api`·`/caldav`·어드민 페이지 분기는 앱 내부 Hono 라우터(`index.ts`)가 담당한다.

### `--external` 플래그

- `build` 와 `vercel-build` 의 유일한 차이는 `--external @google/genai --external cheerio` 다.
- `--external` 은 지정 패키지를 번들에 인라인하지 않고 런타임 `import` 로 남긴다(번들러가 정적 분석·인라인하지 않음). 두 패키지(`@google/genai`, `cheerio`)는 무거운 의존성이라 번들에서 제외한다(의도는 [architecture.md](./architecture.md) §8 "무거운 의존성 외부화" 로 기재됨).
- 현재 트리에서 두 패키지는 앱 진입 그래프(`index.ts`)에서 **직접 import 되지 않는다**(`git grep` 무결과). 즉 이 플래그는 전이 의존(transitive `require`) 대비·방어 목적이다.

### 크론(`vercel.json` `crons`)

크론은 **4개**다.

| path | 스케줄(UTC) | 핸들러 | 동작 |
|------|--------|--------|------|
| `/api/drive/lifecycle/evict-r2` | `0 3 * * *` | `route/drive/lifecycle.ts` `evict-r2` | `storageLifecycleService.evictR2Stale()` |
| `/api/metrics/archive` | `20 4 * * *` | `route/metrics/archive.ts` | `archiveOldLogs()` — 핫 7일 경과 로그를 R2 로(실행당 최대 3일·200초, [domains/metrics.md](./domains/metrics.md)) |
| `/api/logs/purge` | `40 4 * * *` | `route/logs/purge.ts` | `purgeByPolicy()` + `purgeRetention()` — 로그 등급별 정리 + `weather_api_log`·`mail_sync_logs`·완료 `mail_sync_sessions` 보존 삭제([logging.md](./logging.md) §5) |
| `/api/drive/lifecycle/auto-promote` | `0 5 * * *` | `route/drive/lifecycle.ts` `auto-promote` | `storageLifecycleService.autoPromote()` |

- `route/drive/lifecycle.ts` 에는 엔드포인트가 3개(`evict-r2`·`evict-local`·`auto-promote`) 있으나, `vercel.json` 크론으로 등록된 것은 위 2개뿐이다. `evict-local` 은 스케줄 없이 수동 호출용으로만 존재(동일 인증).
- lifecycle 3종·metrics archive 는 `route.on(['GET','POST'], ...)` 로 **GET·POST 를 모두 수신**한다. **`/api/logs/purge` 의 크론 라우트만 GET 전용**이다 — 같은 경로에 어드민 `POST /api/logs/purge`(세션 admin)가 이미 있어, 크론 라우트가 POST 도 받으면 `Authorization` 헤더를 실은 어드민 POST 가 크론 분기로 흡수되기 때문이다(Vercel 크론은 GET 으로 호출하므로 기능 손실 없음).
- 네 경로 모두 `verifyCronAuth` 로 보호된다: `Authorization: Bearer <secret>` 또는 `x-cron-secret: <secret>` 헤더가 `UPLOAD_SERVER_SECRET` 와 일치해야 하며, 아니면 `UNAUTHORIZED`. drive·metrics 는 `compose` → `route/index.ts` 로 시크릿을 주입받고, logs purge 는 주입값이 없으면 `getEnv().UPLOAD_SERVER_SECRET` 으로 폴백한다. 비교는 `lib/cron-auth.ts` 의 `isSecretMatch`(sha256 + `timingSafeEqual`) 상수 시간 비교다.
- Vercel 크론은 `Authorization: Bearer $CRON_SECRET` 를 붙여 호출하므로, **Vercel 의 `CRON_SECRET` 값을 `UPLOAD_SERVER_SECRET` 와 동일하게** 설정해야 크론 인증이 통과한다. (스토리지 계층 의미·`evictR2Stale`/`autoPromote` 로직은 [domains/drive.md](./domains/drive.md).)

### 4차(성능) 배치가 배포에 주는 영향

- `GET /api/badge/image` 200 응답에 **`CDN-Cache-Control`** 이 붙는다(값은 기존 `Cache-Control` 과 동일한 `public, max-age=31536000, immutable`). Vercel 엣지 캐시가 이 헤더를 우선 해석하므로 배지 PNG 의 CDN 보관 기간이 명시적으로 고정된다. 브라우저용 `Cache-Control` 은 그대로다.
- `GET /api/weather/locations`·`GET /api/calendar/:icsToken` 이 `ETag` 를 내보내고 `If-None-Match` 일치 시 **304**(본문 없음)를 반환한다. 두 경로 모두 성공 200 본문은 불변이다.
- `deploy/upload-server` 는 4차에서 변경이 없다(재빌드 불필요). 다만 hub 의 `POST /api/drive/assets/:id/gdrive-token` 은 이제 Google access token 을 **프로세스 내에서 만료 60초 전까지 캐시**해 응답하므로, 같은 함수 인스턴스가 연속 업로드를 처리하면 Google 토큰 교환 왕복이 줄어든다(응답 본문 불변).
- 인덱스 `db:push` 는 위 §3 의 순서 주의를 따른다.

### 진입점(`index.ts`) 노출

- 포트: `port: process.env.PORT || 9999` (Vercel 에서는 플랫폼이 관리, 로컬 기본 9999).
- `/docs`(OpenAPI 스펙 JSON)·`/swagger`(Swagger UI)는 `NODE_ENV !== 'production'` 일 때만 등록된다. 프로덕션 미노출.
- 일반 정적 파일 미들웨어(`serveStatic` 등)는 없다. 정적 서빙은 페이지 핸들러가 개별 처리한다(예: `page/home.tsx` 가 `Bun.file(../public/favicon.ico)` 로 favicon 반환).
- 미들웨어 설정(`allowedDomains`, `securityExcludePaths` 등)·인증 체계는 [architecture.md](./architecture.md) §7, [domains/auth.md](./domains/auth.md).

---

## 2. 로컬 개발

- `bun run dev` = `bun run --hot index.ts` (핫리로드). 기본 포트 9999, `PORT` 로 변경.
- 런타임은 Bun 고정(npm/node 우회 금지). 타입체크 `bunx tsc --noEmit`, 테스트 `bun test`(루트 `./tests` — `bunfig.toml` 의 `[test] root = "./tests"`).
- 필요 환경변수: `getEnv()`(`lib/env.ts`)가 Zod `safeParse` 로 검증하며 **`DATABASE_URL` 만 필수**, 나머지는 전부 `optional`. 특정 도메인을 켜려면 해당 그룹 키가 있어야 한다(§6).
- 로컬에서는 `/swagger` 로 API 문서를 확인할 수 있다(비프로덕션 전용).

---

## 3. DB 반영

- 스키마 반영은 마이그레이션 파일이 아니라 `bun run db:push`(`drizzle-kit push`)로 `db/schema.ts` 를 대상 DB 에 직접 반영한다.
- **미반영 대기 중인 변경 3건**(전수 감사 배치에서 추가된 제약·인덱스. 배포 전 `db:push` 필요):

| 대상 | 변경 | 도입 | 주의 |
|------|------|------|------|
| `mail_messages` | unique `(account_id, folder_id, remote_message_id)`(제약명 `uq_mail_messages_account_remote` 유지) | 1차 배치(D-05) | push 전에는 폴더 스코프 upsert 가 기대대로 동작하지 않는다([domains/mail.md](./domains/mail.md)) |
| `calendar_subscription` | unique `uq_calendar_subscription_user`(`user_id`) | 3차 배치(R-25) | push 전에 `user_id` 중복 행이 남아 있으면 제약 생성이 실패한다 — 먼저 정리할 것([domains/calendar.md](./domains/calendar.md)) |
| 8테이블 | 인덱스 **8종 추가 + 중복 4종 제거**(목록: [reference/db-schema.md](./reference/db-schema.md) "미반영 대기 중인 제약·인덱스") | 4차 배치(P-02) | 인덱스만 바뀌므로 응답 계약은 불변이다. **적용 후 동점 정렬 순서가 바뀔 수 있다** — `comments`(postId, created_at)·`messages`(userId, deleted_at, created_at) 목록이 filesort 대신 인덱스 순 스캔이 되어 같은 초에 저장된 행의 상대 순서가 달라진다. 코드에는 이미 `commentId` desc·`id` desc 타이브레이크를 넣어 결정적으로 고정했으므로, **인덱스 push 는 4차 코드가 배포된 뒤에** 한다 |
- **마이그레이션 파일 없음**: `drizzle.config.ts` 의 `out: './drizzle'` 은 `.gitignore` 에 포함되어 커밋되지 않는다. `db:generate` 는 `db:push` 전 DDL 미리보기·검증 용도([guidelines/db-schema-change.md](./guidelines/db-schema-change.md)), `db:studio` 는 브라우징 용도다.
- `drizzle.config.ts`: `schema: './db/schema.ts'`, `dialect: 'mysql'`, `dbCredentials.url: DATABASE_URL`. `db:push` 실행 시 `DATABASE_URL` 필요.
- 명령 표 상세는 [architecture.md](./architecture.md) §8.

---

## 4. `deploy/caldav-proxy`

### 무엇이며 왜 별도인가

- 메인 앱의 CalDAV 경로(`/caldav/*` = `route/calendar/caldav.ts`, `/.well-known/caldav` = `page/well-known.ts`)를 별도 호스트에서 받아 `https://api.gumyo.net` 으로 그대로 전달하는 **얇은 리버스 프록시**다(`deploy/caldav-proxy/proxy.ts`).
- `proxy.ts` 구조: 포워딩 로직은 `createProxyFetch({ target, targetHost, fetchImpl })` 팩토리로 분리돼 export 되고(테스트 주입 가능), `Bun.serve` 기동은 `if (import.meta.main)` 블록 안에서만 일어난다. `TARGET`(`https://api.gumyo.net`)·`TARGET_HOST`·`PORT` 는 그 블록에서 주입한다.
- 요청 방향: `path + query` 보존하여 `TARGET` 으로 포워딩(method·body 그대로). 요청 헤더의 `Host` 를 `api.gumyo.net` 으로 고정하고, **`Accept-Encoding: identity` 를 세워** 오리진이 압축하지 않은 본문을 보내게 하며, `cf-connecting-ip`·`cf-ray`(Cloudflare 주입 헤더)를 삭제하고 `redirect: 'manual'` 로 3xx 를 변형 없이 전달한다.
- 응답 방향: 오리진 응답 헤더를 복사하되 **`content-encoding`·`content-length` 를 제거**한 뒤 body 를 그대로 흘린다. `fetch` 가 이미 압축을 푼 본문을 주는데 원본 헤더가 `gzip`·원본 길이를 그대로 달고 나가면 CalDAV 클라이언트가 본문을 해석하지 못해 동기화가 깨진다.
- 목적: CalDAV 클라이언트(Apple 캘린더 등)에 안정적인 전용 오리진을 제공하고, 오리진(`api.gumyo.net`)으로 넘어가는 요청에서 Cloudflare 계열 헤더를 정리해 전달한다. `TARGET` 은 코드 상수(env 아님).

### Docker

- `Dockerfile`: `oven/bun:1-alpine`, `proxy.ts` 복사, `EXPOSE 4000`, `CMD ["bun", "run", "proxy.ts"]`.
- `compose.yml`: `build: .`, `restart: unless-stopped`, 포트 `4000:4000`, env `PORT=4000`.
- 기동: `docker compose up -d --build caldav-proxy`(`compose.yml` 주석).
- 이 프록시는 `:4000` 에서 HTTP 로 수신한다. TLS 종단은 이 컨테이너 밖(외부 리버스 프록시/터널)에서 처리한다.

---

## 5. `deploy/upload-server`

### 무엇인가

- 메인 앱과 **분리된 독립 Bun 서비스**다. 자체 `package.json`(`name: "upload-server"`, `start: bun run index.ts`, deps: `@aws-sdk/client-s3`·`hono`·`ioredis`·`sharp`)을 가진다. 루트 앱의 의존성과 공유하지 않는다.
- 존재 이유: 대용량 파일 업로드를 서버리스(메인 앱) 밖의 상시 컨테이너에서 디스크 스트리밍으로 처리하기 위함. `index.ts` 의 `maxRequestBodySize` = `MAX_UPLOAD_SIZE_BYTES`(기본 10 GiB).

### 엔드포인트(`deploy/upload-server/index.ts`)

| method·path | 용도 |
|-------------|------|
| `GET /health` | 헬스체크(`{ status, timestamp }`) |
| `POST /upload` | 드라이브 자산 업로드(`upload-handler.ts`). 실패 응답은 hub 콜백 게이트 거부면 **401**, 그 외 500 |
| `POST /upload-blog-image` | 블로그 이미지 업로드(`blog-image-handler.ts`) |

- CORS: `ALLOWED_ORIGINS`(기본 `https://gumyo.net,https://hyns.dev`) 및 그 서브도메인만 허용, `credentials: true`.

### 스토리지 클라이언트

| 파일 | 대상 | 상태 |
|------|------|------|
| `r2-client.ts` | Cloudflare R2(S3 호환, `@aws-sdk/client-s3`) — `upload`/`uploadBuffer` | 사용 |
| `gdrive-client.ts` | Google Drive(멀티파트 스트리밍 업로드, 폴더 캐시 — `createBoundedLruCache(500)` LRU) | 사용 |
| `local-client.ts` | Mac Studio(L2) HTTP 스트리밍 | **미구현(항상 실패 반환)** |

### 핸들러 역할

- `upload-handler.ts`(`createUploadHandler`): **입력 검증 → hub status 콜백 게이트 → 디스크 저장** 순서다.
  1. `isValidUploadKey(s3Key)` — `users/` 로 시작하고 `\` 를 포함하지 않으며 `/` 로 나눈 세그먼트가 정확히 **4개**(`users/<userId>/<id>/<name>`), 각 세그먼트가 빈 문자열·`.`·`..` 가 아니어야 한다. 실패 시 저장 없이 거부.
  2. hub `POST /api/drive/assets/:id/status` 콜백을 **먼저** 호출하고, (a) 응답이 2xx 이고 (b) 본문 `success === true` 이며 (c) 응답 `data.s3Key` 가 있으면 요청의 `s3Key` 와 **일치**할 때에만 통과시킨다. 하나라도 어긋나면 `{ unauthorized: true }` 로 반환해 **파일을 디스크에 쓰지 않고** 중단한다(라우트가 401 로 응답).
  3. 통과 후 실제 저장 키는 hub 가 돌려준 `data.s3Key`(없으면 요청 값)를 쓰며, R2·Google Drive·local 업로드가 모두 이 키를 사용한다.
  4. 그 다음 `/tmp/uploads` 디스크 저장 → **`statSync(tmpPath).size` 로 실제 크기 측정** → SHA-256 해시 → 이미지면 100x100 WebP 썸네일(base64) → **R2(L1, `l1MaxFileSize`=100MB 이하)·Google Drive(L3)·local(L2)** 분산 업로드 → 성공 tier 를 CSV 로 집계(tier 명 정렬 후 결합, `L1,L3` 등). 전 tier 실패 시 실패 반환. 처리 후 임시 파일 삭제.
  5. R2 업로드 여부 판정(`<= l1MaxFileSize`)과 hub `complete` 콜백 본문의 `sizeBytes` 는 모두 이 **실측 크기**를 쓴다(멀티파트 `file.size` 가 아니다). hub 는 이 값을 `prepare` 때 신고된 크기와 대조해 쿼터를 재검증한다([domains/drive.md](./domains/drive.md) §2).
- `isValidAssetId`(`upload-handler.ts` export): `^[A-Za-z0-9_-]+$` 만 허용. `/upload` 는 폼의 `assetId` **원문 문자열**을 이 검사에 통과시킨 뒤에야 `Number()` 결과를 쓰고, `/upload-blog-image` 는 라우트와 `blog-image-handler.ts` 양쪽에서 같은 검사를 한다. 불합격은 400.
- `blog-image-handler.ts`(`createBlogImageHandler`): `isValidAssetId` → mime/크기(≤10MB) 검증 → `s3Key === '{assetId}.webp'` 강제 → 원본을 WebP 변환(`sharp`) → R2 업로드 → 메타(width/height/sizeBytes) 수집.

### 메인 앱과의 계약

- **호출 방향(누가 호출하나)**: 클라이언트(블로그/스토리지 FE)가 먼저 메인 앱(hub)에서 업로드 준비를 받고, 파일 본문은 upload-server 로 직접 올린다. 그 뒤 upload-server 가 hub 로 콜백한다.
  - hub `POST /api/drive/assets/prepare` → `{ assetId, s3Key, uploadToken }` 발급(`route/drive/asset.ts`). 블로그는 `blogImageService.prepare` 가 `{ assetId, s3Key, uploadToken, uploadUrl: UPLOAD_SERVER_URL }` 반환(`service/domain/blog/blog-image.ts`, `compose/blog.ts`). 즉 FE 가 향하는 업로드 URL 은 `UPLOAD_SERVER_URL` 이다.
  - upload-server → hub 콜백(모두 `HUB_BASE_URL` 기준):
    | 콜백 | hub 라우트 | 목적 |
    |------|-----------|------|
    | `POST /api/drive/assets/:id/status` | `route/drive/asset.ts` | `uploading` 상태 갱신 |
    | `POST /api/drive/assets/:id/gdrive-token` | `route/drive/asset.ts` | Google Drive access token + rootFolderId 발급(upload-server 전용) |
    | `POST /api/drive/assets/:id/complete` | `route/drive/asset.ts` | 해시·tier·gdriveFileId·썸네일·**실측 `sizeBytes`** 확정. hub 가 쿼터 재검증(초과 시 `DRIVE_QUOTA_EXCEEDED` 413, 해시 중복이면 `DRIVE_DUPLICATE_FILE` 409 로 거절하고 올린 실물을 정리) |
    | `POST /api/blog/images/complete` | `route/blog/image.ts` | 블로그 이미지 메타 저장, `url` 반환 |
- **인증 방식**: upload-server 는 들어오는 요청 자체를 세션 검증하지 않는다. 매 요청에 실린 `uploadToken`(hub 가 prepare 시 발급)을 hub 콜백이 자산 소유·유효성으로 검증한다(드라이브는 자산 행에 저장된 토큰 대조, 블로그는 서명 토큰). 즉 upload-server 는 상태 없는 중계자이고, 신뢰 경계는 hub 콜백 + CORS 오리진 허용이다.
- **status 콜백은 게이트다**: `/upload` 는 status 콜백의 성공(2xx + `success` + `s3Key` 일치)을 확인한 뒤에만 파일을 저장·업로드한다. 콜백 실패·네트워크 오류·키 불일치는 전부 401 거부다. 콜백 요청은 `Authorization: Bearer ${UPLOAD_SERVER_SECRET}` 를 싣고, hub 쪽 `status`·`complete`·`gdrive-token` 은 `requireUploadServer` 로 같은 시크릿을 요구한다(hub 에 미설정 시 503).
- `auth.ts`(`createAuthClient.verifySession` → hub `/api/auth/get-session`)는 정의되어 있으나 `index.ts` 에 **와이어되지 않는다**(미사용, `plan.md` 의 WebDAV Basic Auth 용 예약).

### Docker

- `Dockerfile`: `oven/bun:1-alpine`, `bun install --production`, `EXPOSE 4100`, `CMD ["bun", "run", "index.ts"]`.
- `compose.yml`: `container_name: upload-server`, `restart: unless-stopped`, 포트 `4100:4100`, `env_file: .env`, 외부 도커 네트워크 `gumyo`(`external: true`)에 연결.

### 후속 계획

- `plan.md` 참조: WebDAV 서버(Finder/Explorer 마운트)·WebDAV 토큰 시스템(`webdav_tokens`)·Mac Studio L2(`local-client.ts` 실구현)·`nginx(webdav.hyns.dev)` 설정 등이 미구현 계획으로 정리돼 있다. 현재 코드에는 미반영.

---

## 6. 서비스별 환경변수(키만)

### 메인 앱 — `lib/env.ts`

`DATABASE_URL` 만 필수, 나머지는 모두 `optional`. `NODE_ENV` 기본 `development`.

| 그룹 | 키 |
|------|----|
| 코어/런타임 | `DATABASE_URL`(필수), `SITE_URL`, `BASE_URL`, `NODE_ENV`, `VERCEL`, `PORT` |
| 인증·OAuth | `BETTER_AUTH_SECRET`, `TRUSTED_ORIGINS`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Spotify | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` |
| R2 스토리지 | `R2_END_POINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_CUSTOM_DOMAIN`, `R2_CUSTOME_DOMAIN` |
| 메일 | `MAIL_ENCRYPTION_KEY`(min 32) |
| AI | `AI_ENCRYPTION_KEY`(min 32) |
| 드라이브/upload-server 연동 | `GDRIVE_ROOT_FOLDER_ID`, `UPLOAD_SERVER_URL`, `UPLOAD_SERVER_SECRET` |
| 날씨 | `KMA_API_KEY` |
| 캐시·공유 카운터 | `REDIS_URL` |
| 관측/알림 | `SENTRY_DSN`, `DISCORD_WEBHOOK_URL` |

- `R2_CUSTOM_DOMAIN` 과 오탈자형 `R2_CUSTOME_DOMAIN` 이 스키마에 **둘 다** 선언돼 있다.
- `UPLOAD_SERVER_SECRET` 은 크론 인증(§1)에도 재사용된다 — 네 크론 경로 전부 이 값으로 대조한다.
- Vercel 크론 인증용 `CRON_SECRET` 은 `lib/env.ts` 스키마에 없다(Vercel 플랫폼이 헤더로 주입, 앱은 `UPLOAD_SERVER_SECRET` 로 대조 — §1).
- **`REDIS_URL` 은 두 용도다.** ① 날씨 등 응답 캐시(`service/shared/redis-cache.ts`), ② **rate limit 공유 카운터**(`service/shared/rate-limit-store.ts` — mail·ai 리미터에만 주입). 미설정이면 두 기능 모두 프로세스 인메모리로 폴백하며 응답 계약은 동일하다. 접근은 `getEnv()` 경유이고, 클라이언트는 `service/shared/redis-client.ts` 가 프로세스당 1개를 지연 생성한다. 공개 경로(badge·spotify playing) 리미터는 Redis 를 쓰지 않는다.
- **`SENTRY_DSN` 은 이번 배치부터 실제로 쓰인다.** `index.ts` 가 부트스트랩에서 `initSentry(getEnv().SENTRY_DSN)` 를 호출하므로, 값이 있으면 `captureException` 이 실제 전송되고 아웃바운드 fetch 에 `sentry-trace`/`baggage` 헤더가 붙는다. 없으면 종전처럼 no-op 이다.

### caldav-proxy — `deploy/caldav-proxy/`

| 키 | 비고 |
|----|------|
| `PORT` | 기본 4000. `compose.yml` 에서 `PORT=4000` |

- 대상 오리진 `api.gumyo.net` 은 `proxy.ts` 상수(env 아님).

### upload-server — `deploy/upload-server/index.ts`(`env_file: .env`)

| 그룹 | 키 | 기본값(코드) |
|------|----|------|
| 서버 | `PORT` | 4100 |
| hub 연동 | `HUB_BASE_URL` | `https://api.gumyo.net` |
| CORS | `ALLOWED_ORIGINS` | `https://gumyo.net,https://hyns.dev` |
| 업로드 한도 | `MAX_UPLOAD_SIZE_BYTES` | 10 GiB |
| R2 | `R2_END_POINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | `R2_BUCKET` 기본 `blog-cloud` |

- upload-server `index.ts` 가 읽는 env 는 위가 전부다. `ioredis` 는 `package.json` 에 선언돼 있으나 소스에서 사용하지 않는다. Google Drive 접근 토큰·rootFolderId 는 env 가 아니라 hub 콜백(`/gdrive-token`)으로 받는다.
