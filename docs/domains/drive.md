# 드라이브(Drive) 도메인

> 기준: 2026-09-07 (fix/audit-batch4-performance @ 4차 배치 커밋 완료, 비교 기준 `bab14e8`) 코드 검증. 다루는 코드: `dto/drive/*`, `route/drive/*`, `route/index.ts`, `index.ts`, `service/domain/drive/*`, `service/shared/storage.ts`, `service/shared/gdrive-storage.ts`, `service/shared/storage-lifecycle.ts`, `compose/drive.ts`, `compose/shared.ts`, `compose/types.ts`, `db/schema.ts`, `lib/cron-auth.ts`, `lib/error-code.ts`, `lib/error-message.ts`, `lib/error.ts`, `lib/env.ts`, `vercel.json`

## 개요

개인 클라우드 스토리지 도메인. 사용자별로 파일(자산)과 폴더 트리를 관리하고, 자산을 다계층 스토리지(storage tiers)에 분산 저장한다. 파일은 SHA-256 해시로 사용자 단위 중복을 제거하고, 사용자별 용량 쿼터(`user.storage_quota_bytes`)로 총량을 제한한다. 이미지 업로드 시 100x100 WebP 썸네일을 생성해 DB(`mediumblob`)에 인라인 저장한다.

스토리지 계층은 자산 행의 `storage_tiers` 컬럼(CSV, 예: `L1`, `L1,L3`, `L3`)으로 표현되며 코드에서 확인되는 실제 매핑은 다음과 같다.

| Tier | 백엔드 | 구현 파일 | 상태 |
|------|--------|-----------|------|
| L1 | Cloudflare R2 (S3 호환) — 핫 티어, CDN/presigned 배포 | `service/shared/storage.ts` | 사용 중 |
| L2 | Mac Studio 로컬 디스크 (`local_path`) | — | 미구현(TODO) — `deploy/upload-server/plan.md` §4 |
| L3 | Google Drive — 콜드/아카이브 티어 (`gdrive_file_id`) | `service/shared/gdrive-storage.ts` | 사용 중 |

외부 의존: L1은 `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`로 R2에 접근한다(region `auto`). L3은 Google Drive API v3(`https://www.googleapis.com/drive/v3`)를 OAuth refresh token(리프레시 토큰은 better-auth `account` 테이블에서 `scope LIKE '%drive.file%'` 행으로 조회)으로 호출한다. 대용량·다계층(L1/L2/L3) 분배 업로드는 hyun-hub가 직접 처리하지 않고 메인 앱과 분리된 독립 상시 컨테이너 `deploy/upload-server`(포트 4100, `gumyo` 도커 네트워크)가 오케스트레이션하며, hyun-hub는 그 지원 엔드포인트(`prepare`/`status`/`gdrive-token`/`complete`)만 제공한다. (upload-server 자체는 Mac Studio가 아니라 상시 컨테이너에 있고, L2(Mac Studio)로의 스트리밍은 `local-client.ts` 미구현 상태다.)

## 파일 맵

| 파일 | 역할 |
|------|------|
| `dto/drive/asset.ts` | 자산 목록/파라미터/수정 Zod 스키마 (`driveAssetListQuerySchema`, `driveAssetParamSchema`, `driveAssetUpdateSchema`) |
| `dto/drive/folder.ts` | 폴더 생성/수정/목록/파라미터 Zod 스키마 (`driveFolderCreateSchema`, `driveFolderUpdateSchema`, `driveFolderListQuerySchema`, `driveFolderParamSchema`) |
| `route/drive/asset.ts` | 자산 HTTP 라우트 (`createDriveAssetRoute`) — 업로드/prepare/complete/gdrive-token/status/목록/상세/수정/삭제/다운로드/쿼터 |
| `route/drive/folder.ts` | 폴더 HTTP 라우트 (`createDriveFolderRoute`) — 생성/목록/상세/수정/삭제 |
| `route/drive/lifecycle.ts` | 스토리지 lifecycle 라우트 (`createDriveLifecycleRoute`) — evict-r2/evict-local/auto-promote, cron 시크릿 인증 |
| `service/domain/drive/drive-asset.ts` | 자산 도메인 로직 (`createDriveAssetService`) — 검증(크기/MIME/매직바이트/차단 확장자), 해시 중복, 쿼터, 썸네일, 티어별 URL/다운로드 |
| `service/domain/drive/drive-folder.ts` | 폴더 도메인 로직 (`createDriveFolderService`) — breadcrumb, 순환참조 가드, 하위 트리 일괄 삭제(`collectFolderIdsInDeleteOrder`) |
| `service/shared/storage.ts` | L1(R2) 스토리지 서비스 (`createStorageService`) — upload/del/list/getUrl/getPresignedUrl/getObject/getObjectStream |
| `service/shared/gdrive-storage.ts` | L3(Google Drive) 서비스 (`createGdriveStorageService`) — download/del, access token 캐싱 |
| `service/shared/storage-lifecycle.ts` | 티어 lifecycle 서비스 (`createStorageLifecycleService`) — evictR2Stale/evictLocalFifo/autoPromote |
| `compose/drive.ts` | Drive DI 조립 (`composeDrive`) — folderDb/assetDb/lifecycle의 Drizzle 구현, `getUserQuotaBytes` |
| `compose/shared.ts` | R2 S3 클라이언트·storageService·`initGdriveStorage`·`getGdriveAccessToken` 조립(공유) |
| `compose/types.ts` | `ComposeDriveArgs` 타입 |
| `page/admin/pages/drive.tsx` | 어드민 SSR 페이지(자산/폴더/lifecycle 로그 조회) — 상세는 [../admin-features.md](../admin-features.md) |
| `tests/dto/drive/*`, `tests/route/drive/*`, `tests/service/domain/drive/*` | 아래 [테스트](#테스트) 참조 |

## 데이터 모델

`db/schema.ts` 기준. 물리 테이블 3개 + `user` 테이블의 쿼터 컬럼 1개. 전체 컬럼 정의는 [../reference/db-schema.md](../reference/db-schema.md) 참조.

### `cloud_assets` (자산)

- PK `id` (`int`, autoincrement) — 자산 식별자는 **숫자**.
- `user_id` (varchar36, FK `user.id` ON DELETE CASCADE)
- `s3_key` (varchar500, **unique**) — L1 오브젝트 키. 형식 `users/{userId}/{uuid}/{safeName}`
- `original_name` (varchar255), `mime_type` (varchar100), `size_bytes` (`bigint`)
- `file_hash` (varchar64) — SHA-256
- `folder_id` (varchar36, nullable) — 소속 폴더. **DB FK 없음**(앱 로직으로 무결성 관리)
- `thumbnail_blob` (`mediumblob`, nullable) — 이미지 100x100 WebP
- `is_public` (bool, default false)
- `upload_status` (varchar20, default `ready`) — `preparing` | `uploading` | `ready` | `failed`
- `upload_token` (varchar64, nullable) — prepare/complete 시크릿(완료 시 null 초기화)
- `local_path` (varchar1000, nullable) — L2 경로
- `gdrive_file_id` (varchar100, nullable) — L3 파일 ID
- `storage_tiers` (varchar20, default `L1`) — 티어 CSV
- `access_count` (int, default 0), `last_viewed_at` (timestamp, nullable)
- 인덱스: `idx_cloud_assets_user`(user_id), **unique** `uq_cloud_assets_user_hash`(user_id, file_hash), `idx_cloud_assets_user_created`(user_id, created_at), `idx_cloud_assets_folder`(folder_id), `idx_cloud_assets_storage_tiers`(storage_tiers), `idx_cloud_assets_access_count`(access_count)

### `drive_folders` (폴더)

- PK `id` (varchar36) — 폴더 식별자는 **UUID 문자열**(`crypto.randomUUID()`)
- `user_id` (varchar36, FK `user.id` ON DELETE CASCADE)
- `parent_id` (varchar36, nullable) — 부모 폴더. **DB FK 없음**(재귀 트리, 앱 로직 관리)
- `name` (varchar255)
- 인덱스: `idx_drive_folders_user`(user_id), `idx_drive_folders_user_parent`(user_id, parent_id)

### `storage_lifecycle_logs` (티어 이동 감사 로그)

- PK `id` (int), `asset_id` (int, FK `cloud_assets.id` ON DELETE CASCADE)
- `action` (varchar20) — `evict_l1` | `promote_l1`
- `from_tier`, `to_tier` (varchar5), `reason` (varchar255)
- 인덱스: `idx_storage_lifecycle_logs_asset`(asset_id)

### `user.storage_quota_bytes`

- `bigint`, NOT NULL, **default `10 * 1024 * 1024`(10MB)**. 사용자별 총 저장 한도.

## API 엔드포인트

mount: `index.ts`가 `app.route('/api', api)`, `route/index.ts`가 자산을 `/drive`, 폴더를 `/drive/folders`, lifecycle을 `/drive/lifecycle`에 마운트. 전체 경로는 아래와 같다. 인증 열: **session** = `getSession`(better-auth 세션/API 토큰), **uploadToken** = 요청 body의 `uploadToken`이 자산 행의 `upload_token`과 일치, **upload-server secret** = `requireUploadServer`(`route/drive/asset.ts:20`) — `Authorization: Bearer <secret>` 또는 `x-upload-server-secret` 헤더가 `UPLOAD_SERVER_SECRET`과 일치. **`UPLOAD_SERVER_SECRET` 미설정 시 게이트를 건너뛰지 않고 `SERVICE_NOT_CONFIGURED`(503)** 로 거부한다. **cron secret** = lifecycle cron 의 `Authorization: Bearer <secret>` 또는 `x-cron-secret` 이 `UPLOAD_SERVER_SECRET`과 일치. 시크릿·`uploadToken` 비교는 모두 `lib/cron-auth.ts`의 `isSecretMatch`(sha256 다이제스트 + `timingSafeEqual`, 빈 값·길이 불일치는 즉시 false) 상수 시간 비교를 쓴다.

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| POST | `/api/drive/assets` | session | multipart 직접 업로드(→ L1 R2, `storage_tiers='L1'`, `ready`) |
| POST | `/api/drive/assets/prepare` | session | 업로드 사전 등록(메타만 저장, `preparing`, `uploadToken` 발급) |
| POST | `/api/drive/assets/:assetId/status` | upload-server secret + uploadToken | 상태를 `uploading`으로 전이(upload-server). 응답 `{ id, uploadStatus, s3Key }` — upload-server가 저장 전에 `s3Key`를 대조한다 |
| POST | `/api/drive/assets/:assetId/complete` | upload-server secret + uploadToken | 업로드 완료 콜백(티어/gdriveFileId/localPath/썸네일 반영) |
| POST | `/api/drive/assets/:assetId/gdrive-token` | upload-server secret + uploadToken | Google Drive access token + root folder ID 발급(upload-server 전용). `requireUploadServer`(UPLOAD_SERVER_SECRET) 게이트 후 body `uploadToken` 검증(status·complete 도 같은 게이트를 적용 — 2026-09-06) |
| GET | `/api/drive/assets` | session | 자산 목록(페이지네이션, mimeType/folderId 필터, 정렬) |
| GET | `/api/drive/assets/:assetId` | session | 상세 + 다운로드 URL(티어별) |
| PATCH | `/api/drive/assets/:assetId` | session | 이름/공개여부/폴더 이동 |
| DELETE | `/api/drive/assets/:assetId` | session | 자산 삭제(L1/L3 실물 포함) |
| GET | `/api/drive/assets/:assetId/download` | session | 스트림 다운로드(L3 gdrive) |
| GET | `/api/drive/quota` | session | 사용량 `{ used, total, remaining }` |
| POST | `/api/drive/folders` | session | 폴더 생성(201) |
| GET | `/api/drive/folders` | session | 폴더 목록(`parentId` 필터, 이름 오름차순) |
| GET | `/api/drive/folders/:folderId` | session | 폴더 상세 + breadcrumb |
| PATCH | `/api/drive/folders/:folderId` | session | 이름 변경/이동(순환참조 가드) |
| DELETE | `/api/drive/folders/:folderId` | session | 폴더 재귀 삭제(하위 폴더·자산 실물 포함) |
| GET·POST | `/api/drive/lifecycle/evict-r2` | cron secret | L1 stale 자산 R2에서 제거 |
| GET·POST | `/api/drive/lifecycle/evict-local` | cron secret | L2 FIFO eviction(현재 stub, 0 반환) |
| GET·POST | `/api/drive/lifecycle/auto-promote` | cron secret | 인기 자산을 L3→L1 승격 |

목록/상세 응답 형식은 `lib/api-response.ts`의 `successResponse`/`paginatedResponse` 봉투를 사용한다.

## 핵심 흐름

### 1. 직접 업로드 (`POST /api/drive/assets`, `createDriveAssetService.upload`)

1. 세션 확인 → `formData`에서 `file`(+선택 `folderId`) 추출.
2. 크기 검증: `file.size > 100MB`이면 `DRIVE_FILE_TOO_LARGE`.
3. `sanitizeFilename`(`lib/mail-utils`) → `validateMimeAndExtension`(MIME 정규식/차단 MIME/차단 확장자).
4. `folderId` 지정 시 소유자 검증(`DRIVE_FOLDER_NOT_FOUND`). 이어서 버퍼 로드 + 크기 재검증(`buffer.length > 100MB`이면 `DRIVE_FILE_TOO_LARGE`), 이미지면 `validateMagicBytes`(jpeg/png/gif/webp 시그니처).
5. SHA-256 해시 계산 → `getByUserAndHash`로 사용자 내 중복이면 `DRIVE_DUPLICATE_FILE`.
6. 쿼터 확인: `getTotalSizeByUser + file.size > getUserQuotaBytes`이면 `DRIVE_QUOTA_EXCEEDED`.
7. 이미지면 `imageProcessor.resize(100,100)`→`toWebp(60)`로 썸네일(실패 시 null).
8. `s3Key = users/{userId}/{uuid}/{safeName}` → `storage.upload`(R2). DB insert(`storage_tiers='L1'`, `uploadStatus='ready'`). **insert 실패 시 방금 올린 R2 오브젝트를 보상 삭제**(`storage.del`).
9. 응답 `url = storage.getUrl(s3Key)`(CDN URL).

### 2. upload-server 오케스트레이션 업로드 (prepare → status → gdrive-token → complete)

`deploy/upload-server`(메인 앱과 분리된 독립 상시 컨테이너)가 대용량·다계층(L1/L2/L3) 분배를 처리하며 hyun-hub는 메타데이터/토큰 교환만 담당.

1. `prepare`(session): body 는 **`driveAssetPrepareSchema` Zod 검증**을 거친다(`dto/drive/asset.ts:16-22` — `originalName` 1~255, `mimeType` 1~255, `sizeBytes` `coerce.number().int().positive()`, `folderId` nullable 기본 `null`, `fileHash` ≤64 기본 `''`). 이전에는 `c.req.json()` 을 그대로 읽어 `sizeBytes` 가 없거나 문자열이면 `NaN`·`0` 으로 흘러들어 쿼터 계산이 무너졌다. 검증 통과 후 `fileHash`로 MIME/폴더/중복/쿼터 검증, 기존 행이 `preparing`/`failed`면 삭제 후 재등록, `preparing` 행 insert + 랜덤 32바이트 `uploadToken` 발급 → `{ assetId, s3Key, uploadToken }` 반환. insert 가 `uq_cloud_assets_user_hash` 를 위반하면(동시 요청 경합) `DRIVE_DUPLICATE_FILE`(409).
2. `status`(upload-server secret + uploadToken): `requireUploadServer` 게이트 통과 후 `preparing` → `uploading` 전이. 토큰 불일치 시 `UNAUTHORIZED`, 상태 부정합 시 `DRIVE_UPLOAD_EVENT_FAILED`. 응답에 자산 행의 `s3Key`를 포함해 upload-server가 자신이 올린 키와 대조할 수 있게 한다.
3. `gdrive-token`(upload-server secret + uploadToken): 먼저 `requireUploadServer`(`UPLOAD_SERVER_SECRET` 헤더) 게이트를 통과해야 하고, 이어 `getAssetForTokenExchange`로 uploadToken·상태 검증 후 `getGdriveAccessToken()`(compose/shared) 호출 → Google access token + `GDRIVE_ROOT_FOLDER_ID` 반환. upload-server가 이 토큰으로 Google Drive에 직접 업로드. (Google access token 유출 방어를 위해 이 콜백만 시크릿 게이트를 추가로 건다 — 2026-07-10.)
4. `complete`(upload-server secret + uploadToken): `requireUploadServer` 게이트 통과 후 body의 `storageTiers`/`gdriveFileId`/`localPath`/`thumbnailBase64`/`sizeBytes`를 반영. `storageTiers`가 있으면 `ready`, 없으면 `failed`로 마감하고 `uploadToken`을 null로 초기화.
   - **크기 재검증**: upload-server 가 디스크에 받아 실측한 `sizeBytes`(`deploy/upload-server/upload-handler.ts` 의 `statSync(tmpPath).size`)를 함께 보낸다. 값이 있고 `> 0` 이며 `prepare` 때 신고한 `asset.sizeBytes` 와 다르면, 그 값으로 쿼터를 다시 계산한다(`현재 사용량 - 신고값 + 실측값 > 쿼터`). 초과하면 자산을 `failed`(+`storage_tiers` 비움)로 마감하고 이미 올라간 티어 실물(L1 R2 오브젝트·L3 gdrive 파일)을 정리한 뒤 `DRIVE_QUOTA_EXCEEDED` 를 던진다. 통과하면 `size_bytes` 를 실측값으로 갱신한다(`service/domain/drive/drive-asset.ts:407-419`).
   - **해시 중복**: `complete` 가 `fileHash` 를 갱신할 때 `uq_cloud_assets_user_hash` 를 위반하면 UPDATE 는 `null` 을 돌려주고, 서비스가 자산을 `failed` 로 마감 + 업로드된 티어 실물을 정리한 뒤 `DRIVE_DUPLICATE_FILE`(409)을 던진다(`drive-asset.ts:435-439`). 이전에는 드라이버 오류가 그대로 올라와 500 이었고 자산이 `uploading` 상태로 남았다.
   - 두 실패 경로 모두 `cleanupUploadedTiers`(`drive-asset.ts:187-200`)를 쓴다 — `storage_tiers` 에 `L1` 이 있으면 R2 오브젝트, `L3` + `gdriveFileId` 가 있으면 Google Drive 파일을 지운다(실패는 삼킴). OpenAPI 응답 선언에도 `DRIVE_DUPLICATE_FILE`·`DRIVE_QUOTA_EXCEEDED` 가 추가됐다(`route/drive/asset.ts:93-100`).

### 3. 상세/다운로드 (티어 cascade)

- **조회수 갱신은 원자적이다**: 상세·다운로드 모두 `db.touchAccess(assetId, now)` 를 호출하고, 구현은 `UPDATE cloud_assets SET last_viewed_at = ?, access_count = access_count + 1`(`compose/drive.ts`) 이다. 이전에는 조회한 행의 `accessCount + 1` 을 다시 써 동시 조회에서 증가분이 유실됐다(그래서 `DriveAssetServiceDb.update` 의 필드 목록에서 `accessCount` 가 빠졌다).
- `getDetail`(`GET /assets/:assetId`): 소유자 검증 후 `touchAccess` 로 `lastViewedAt`/`accessCount` 갱신. **L1 보유 시**: 공개면 CDN URL(`getUrl`), 비공개면 **presigned URL(만료 300초)**. **L1 미보유 시**: `url = /api/drive/assets/{assetId}/download`(프록시 경로) 반환.
- `download`(`GET /assets/:assetId/download`): `touchAccess` 후 티어 순서대로 시도한다 — ① `L3` + `gdriveFileId` 이고 gdrive 서비스가 구성돼 있으면 Google Drive 스트림, ② 그렇지 않고 `L1` 이면 `storage.getObjectStream(s3Key)`(R2, 오브젝트 없음·오류면 `null`). 둘 다 못 얻으면 `DRIVE_ALL_TIERS_FAILED`(`service/domain/drive/drive-asset.ts:517-534`). L1 전용 자산이 이 엔드포인트에서 항상 500 이던 문제가 해소됐다. L2(Mac Studio) 서빙은 여전히 미구현이다.

### 4. 폴더 (`createDriveFolderService`)

- 생성/수정 시 같은 부모 안 이름 중복은 `DRIVE_FOLDER_NAME_DUPLICATE`. 이동 시 자기 자신/자손으로의 이동은 `isDescendant`(최대 깊이 50) 검사로 `DRIVE_FOLDER_CIRCULAR_REF`.
- 상세는 부모 체인을 거슬러 `breadcrumb`(최대 깊이 50) 구성 — **부모 1건씩 `getById` 로 거슬러 올라가는 방식 그대로**다(깊이만큼 쿼리, 재귀 CTE 로 바꾸지 않았다).
- 삭제(`remove`)는 **깊이 단위 일괄 조회 + 자식 우선 순서**다(`drive-folder.ts` 의 `collectFolderIdsInDeleteOrder`).
    1. 루트에서 시작해 현재 깊이의 폴더 id 를 한꺼번에 `getByParentIds(userId, frontier)`(= `parent_id IN (...)`)로 조회하며 다음 깊이로 내려간다. 방문한 id 는 `Set` 으로 걸러 부모 순환이 있어도 무한 루프에 빠지지 않는다. 폴더 조회 횟수가 폴더 수 N 번에서 **트리 깊이 만큼**으로 줄었다.
    2. 트리의 자산은 `getAssetsByFolderIds(folderIds)`(= `folder_id IN (...)`) **1회**로 모아 폴더별로 나눈다(폴더 수만큼 조회하던 것을 대체).
    3. 삭제 순회는 여전히 자식 → 부모 순서이고, 폴더마다 자산 실물 삭제(`deleteAssetFromTiers`, 실패는 `captureException` 후 진행) → 자산 행 삭제 → 폴더 행 삭제 순서도 그대로다.

### 5. 스토리지 lifecycle (`createStorageLifecycleService`, cron)

- `evictR2Stale`(evict-r2 cron): 후보는 `getStaleL1Assets`(`compose/drive.ts`)가 뽑는다 — `storage_tiers LIKE '%L1%'` + **`gdrive_file_id` NOT NULL**(L3 사본 보유) + (`last_viewed_at < cutoff` **또는** `last_viewed_at IS NULL AND created_at < cutoff`), 최대 500건. 이 `LIKE '%L1%'` 는 인덱스를 못 타지만 **접두 `LIKE 'L1%'` 로 바꾸지 않았다** — `storage_tiers` CSV 에서 `L1` 이 항상 맨 앞에 온다는 보장이 없어 후보 집합이 달라지기 때문이다(4차 미적용). `cutoff = now - evictionDays(30일)`. 서비스는 각 후보에서 `L1`을 뺀 티어 문자열이 **빈 문자열이면 건너뛴다**(유일 티어 가드 — 마지막 사본을 지우지 않는다). 통과분만 R2 오브젝트를 삭제하고 `storage_tiers` 갱신 + `evict_l1` 로그 기록.
- `autoPromote`(auto-promote cron): 후보는 **L1 미보유** + `gdrive_file_id` 있음 + `access_count >= 5` + `size_bytes <= 100MB` + **`last_viewed_at >= now - evictionDays(30일)`**(`viewedAfter` 인자로 전달 — 오래 전에만 조회된 자산은 승격하지 않는다), 최대 50건. L3에서 내려받아 R2에 재업로드하고 `L1` 티어 추가, `promote_l1` 로그 기록.
- `evictLocalFifo`(evict-local): 현재 `return 0` **stub**(L2 미구현).

lifecycle 파라미터는 `compose/drive.ts`에서 주입: `evictionDays: 30`, `promotionThreshold: 5`, `l1MaxFileSize: 100MB`.

## 환경변수

이 도메인이 참조하는 것만. 정의는 `lib/env.ts`, 전체 설명은 [../reference/env.md](../reference/env.md) 참조. (R2/Google 자격증명은 blog·mail 등과 공유하는 `compose/shared.ts`에서 구성.)

| 변수 | 용도 |
|------|------|
| `R2_END_POINT` | R2 S3 엔드포인트(L1) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 자격증명 |
| `R2_BUCKET` | L1 버킷명(미설정 시 `blog-cloud`) |
| `R2_CUSTOM_DOMAIN` / `R2_CUSTOME_DOMAIN` | CDN 도메인(둘 다 미설정 시 `https://blogimg.gumyo.net`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | L3 Google Drive OAuth(refresh token은 `account` 테이블 조회) |
| `GDRIVE_ROOT_FOLDER_ID` | L3 업로드 대상 루트 폴더 ID(`gdrive-token` 응답에 포함) |
| `UPLOAD_SERVER_SECRET` | lifecycle cron 인증 + `status`·`complete`·`gdrive-token` 의 upload-server 게이트 시크릿(미설정 시 세 콜백은 503) |

## 에러 코드

`lib/error-code.ts`/`lib/error-message.ts`/`lib/error.ts` 기준. 상태코드는 `STATUS_MAP`.

| 코드 | 상태 | 의미 |
|------|:----:|------|
| `DRIVE_ASSET_NOT_FOUND` | 404 | 파일 없음(타 사용자 자산 접근도 이 코드로 은폐) |
| `DRIVE_FILE_TOO_LARGE` | 413 | 100MB 초과 |
| `DRIVE_INVALID_MIME_TYPE` | 422 | MIME 형식 위반/차단 MIME·확장자/매직바이트 불일치 |
| `DRIVE_DUPLICATE_FILE` | 409 | 사용자 내 동일 해시 존재 |
| `DRIVE_QUOTA_EXCEEDED` | 413 | 쿼터 초과 |
| `DRIVE_FOLDER_NOT_FOUND` | 404 | 폴더 없음/소유자 불일치 |
| `DRIVE_FOLDER_CIRCULAR_REF` | 400 | 자기/자손으로의 이동 |
| `DRIVE_FOLDER_NAME_DUPLICATE` | 409 | 같은 부모 내 이름 중복 |
| `DRIVE_L3_UPLOAD_FAILED` | 500 | gdrive access token 발급 실패(`gdrive-token`) |
| `DRIVE_L3_DOWNLOAD_FAILED` | 502 | Google Drive 토큰/다운로드 실패 |
| `DRIVE_ALL_TIERS_FAILED` | 500 | 모든 티어에서 스트림 실패 |
| `DRIVE_UPLOAD_EVENT_FAILED` | 500 | 업로드 상태 전이 부정합 |
| `DRIVE_L2_UPLOAD_FAILED` | 500 | (정의됨, 미사용 — L2 미구현) |
| `DRIVE_L2_DOWNLOAD_FAILED` | 502 | (정의됨, 미사용 — L2 미구현) |

공유 스토리지 코드(L1/gdrive 실물 조작 실패): `STORAGE_UPLOAD_FAILED`(500), `STORAGE_DELETE_FAILED`(500), `STORAGE_PRESIGN_FAILED`(500). 공통 코드 `UNAUTHORIZED`(401), `VALIDATION_ERROR`(400), `SERVICE_NOT_CONFIGURED`(503)도 사용.

## 테스트

`bun test <경로>`로 실행. 파일과 케이스 수:

| 파일 | 케이스 |
|------|:------:|
| `tests/dto/drive/asset.test.ts` | 15 |
| `tests/dto/drive/folder.test.ts` | 12 |
| `tests/route/drive/asset.test.ts` | 12 |
| `tests/route/drive/folder.test.ts` | 10 |
| `tests/service/domain/drive/drive-asset.test.ts` | 49 |
| `tests/service/domain/drive/drive-folder.test.ts` | 31 (4차에 "재귀 삭제 배치 조회" 3건 추가) |
| `tests/service/shared/storage-lifecycle.test.ts` | 7 |
| `tests/service/shared/gdrive-storage.test.ts` | 6 |
| `tests/service/shared/storage.test.ts` | 7 |
| `tests/page/admin/drive.test.ts` | 14 |

- 도메인 전체: `bun test tests/service/domain/drive tests/route/drive tests/dto/drive`
- `route/drive/lifecycle.ts` 전용 테스트 파일은 없음(로직은 `storage-lifecycle.test.ts`가 커버).

## 주의사항 / 함정

- **캐시**: 이 도메인은 애플리케이션 캐시(`service/shared/redis-cache.ts`의 `redisCache`, `service/shared/cache.ts`의 `createCache`)를 사용하지 않는다(둘 다 weather·spotify·badge에서만 사용). 드라이브의 캐싱은 (1) 공개 L1 파일의 CDN 배포, (2) 비공개 L1의 **300초 presigned URL**, (3) `gdrive-storage.ts`가 access token을 만료 60초 전까지 클로저에 캐싱하는 정도다.
- **presigned/직접 URL**: 상세 응답의 `url`은 티어에 따라 달라진다 — L1 공개=CDN, L1 비공개=presigned(300초), L1 없음=`/download` 프록시 경로. 업로드 응답의 `url`은 항상 CDN URL이다.
- **다운로드는 L3 → L1 순 폴백**: `download` 는 gdrive 를 먼저 보고, L3 사본이 없거나 gdrive 가 미구성이면 R2(`getObjectStream`)로 스트리밍한다. L2(Mac Studio) 서빙만 미구현이다. 일반 경로에서 L1 파일은 여전히 상세 응답의 presigned/CDN URL 로 받는 편이 빠르다(이 엔드포인트는 Vercel 함수를 경유하는 프록시다).
- **`complete` 는 신고 크기를 믿지 않는다**: `prepare` 의 `sizeBytes` 는 클라이언트 신고값이라 쿼터 우회에 쓰일 수 있어, upload-server 가 보낸 실측 크기와 다르면 `complete` 에서 쿼터를 다시 계산하고 초과 시 자산을 `failed` 로 마감·실물 정리 후 `DRIVE_QUOTA_EXCEEDED` 로 거절한다(위 §2). 즉 쿼터 초과는 업로드가 끝난 뒤에도 뒤늦게 드러날 수 있다.
- **L2(Mac Studio)는 TODO**: `local_path`·`DRIVE_L2_*` 코드·evict-local 라우트는 존재하나 `evictLocalFifo`는 `0`을 반환하는 stub, `deploy/upload-server/local-client.ts`도 미구현. `deploy/upload-server/plan.md` §4 참조.
- **cron 스케줄**(`vercel.json`): `evict-r2`=`0 3 * * *`, `auto-promote`=`0 5 * * *`(UTC 매일 03:00·05:00). `evict-local`은 라우트만 있고 cron 미등록. lifecycle 라우트 3개는 `route.on(['GET','POST'], ...)`(`route/drive/lifecycle.ts:12`)로 **GET·POST 모두 수신**한다(Vercel cron 은 GET 으로 호출). 세 메서드 모두 `verifyCronAuth`로 `UPLOAD_SERVER_SECRET`을 상수 시간 검증한다.
- **자산 ID는 숫자, 폴더 ID는 UUID 문자열**: `driveAssetParamSchema`는 `z.coerce.number().int().positive()`, `driveFolderParamSchema`는 `z.string()`. 스키마상 `cloud_assets.id`는 `int` autoincrement, `drive_folders.id`는 varchar36.
- **폴더 참조 무결성은 앱 로직**: `cloud_assets.folder_id`·`drive_folders.parent_id`에는 DB FK가 없다. 순환참조 가드·재귀 삭제·소유자 검증 등은 서비스 코드에서만 강제된다(깊이 상한 50).
- **자산 목록은 데이터·총 개수를 병렬 조회**한다: `getAssetList`(`compose/drive.ts`)가 정렬·`limit`/`offset` 이 붙은 select 와 같은 `where` 의 `COUNT(*)` 를 `Promise.all` 로 함께 실행한다. 응답(`paginatedResponse`)의 필드·값은 불변이다. 다만 select 는 여전히 `db.select()` 전체 컬럼이라 **`thumbnail_blob`(`mediumblob`)이 목록에도 실려 온다** — 컬럼 분리는 4차에서 적용하지 않았다.
- **stale 임시행 숨김**: 목록 쿼리(`compose/drive.ts`)는 `preparing`/`failed` 상태이면서 생성 10분 초과인 행을 결과에서 제외한다. 조건은 raw `sql` 대신 drizzle 연산자 조합(`or(notInArray(uploadStatus, ['preparing','failed']), gte(createdAt, staleThreshold))`)이다 — raw `sql` 템플릿에 JS `Date` 를 넣으면 프로세스 타임존에 따라 다른 리터럴이 만들어지던 문제(E-09)를 없앴다. `folderId=root`는 `folder_id IS NULL`로 해석, `mimeType` 필터는 접두 `LIKE`.
- **실물 삭제 실패는 더 이상 무음이 아니다**: 자산 삭제(`removeAsset`)·폴더 재귀 삭제·티어 정리(`cleanupUploadedTiers`)의 스토리지 예외를 `captureException` 으로 보고한다(행 삭제는 그대로 진행). 자산 삭제 순서는 **실물 정리 → DB 행 삭제**라, 행 삭제가 실패하는 드문 경우 실물만 사라진 행이 남을 수 있다.
- **중복 제거는 사용자 단위**: `uq_cloud_assets_user_hash`(user_id, file_hash) unique. 같은 파일이라도 다른 사용자면 별도 저장.
- **쿼터 기본값 이원화**: 실제 쿼터는 `getUserQuotaBytes`(=`user.storage_quota_bytes`, 조회 실패 시 10MB fallback)로만 계산된다. 서비스 deps의 `defaultQuotaBytes`·`uploadServerSecret`은 `drive-asset` 서비스 본문에서 사용되지 않는다(쿼터/토큰 검증은 각각 DB 컬럼·행 `upload_token`으로 처리).
- **삭제/eviction은 best-effort**: R2/gdrive 실물 삭제 및 티어 이동 루프는 `try/catch`로 실패를 삼킨다(DB 정합성 우선). 삭제 순서는 위 "실물 삭제 실패는 더 이상 무음이 아니다" 항목 참조.

## 관련 문서

- 전체 스키마: [../reference/db-schema.md](../reference/db-schema.md)
- 전체 환경변수: [../reference/env.md](../reference/env.md)
- 어드민(자산/폴더/lifecycle 로그 조회) 페이지: [../admin-features.md](../admin-features.md)
- 배포(별도 컨테이너 `upload-server`·`caldav-proxy`): [../deploy.md](../deploy.md)
- Hono 라우팅/OpenAPI 패턴: [../hono-reference.md](../hono-reference.md)
- 외부 업로더 계획(WebDAV·L2·토큰): `deploy/upload-server/plan.md`
