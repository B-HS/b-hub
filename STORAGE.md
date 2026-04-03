# Drive - Personal Cloud Storage

Cloudflare R2 기반 개인 파일 스토리지. 무한 depth 폴더 트리, 파일 CRUD, Public/Private 접근 제어.
`better-auth` 세션 인증, 유저별 완전 격리.

---

## TypeScript Types

프론트엔드에서 바로 사용할 수 있는 전체 타입 정의.

```typescript
// ─── 폴더 ───

type DriveFolder = {
    id: string // UUID
    userId: string
    parentId: string | null // null = 루트 폴더
    name: string
    createdAt: string // ISO 8601
    updatedAt: string // ISO 8601
}

type DriveFolderDetail = {
    id: string
    name: string
    parentId: string | null
    breadcrumb: { id: string; name: string }[] // 루트부터 현재까지 경로
    createdAt: string
    updatedAt: string
}

type DriveFolderCreateInput = {
    name: string // 1~255자
    parentId?: string | null // 생략 또는 null = 루트에 생성
}

type DriveFolderUpdateInput = {
    name?: string // 이름 변경
    parentId?: string | null // 폴더 이동 (null = 루트로)
}

// ─── 파일 ───

type DriveAsset = {
    id: number
    originalName: string
    mimeType: string
    sizeBytes: number
    folderId: string | null // null = 루트
    isPublic: boolean
    thumbnail: string | null // "data:image/webp;base64,..." 또는 null (비이미지)
    createdAt: string // ISO 8601
    updatedAt: string
}

type DriveAssetDetail = DriveAsset & {
    fileHash: string // SHA-256 hex (64자)
    url: string // CDN URL (public) 또는 Presigned URL (private, 5분)
    lastViewedAt: string | null
}

type DriveUploadResult = {
    id: number
    s3Key: string
    originalName: string // 서버에서 sanitize된 이름
    mimeType: string
    sizeBytes: number
    folderId: string | null
    isPublic: false // 업로드 시 항상 false
    url: string // CDN URL
}

type DriveAssetUpdateInput = {
    originalName?: string // 파일 이름 변경 (1~255자, 서버에서 sanitize)
    isPublic?: boolean // 공개/비공개 전환
    folderId?: string | null // 파일 이동 (null = 루트로)
}

type DriveAssetUpdateResult = {
    id: number
    originalName?: string // 변경된 경우만 포함
    isPublic?: boolean
    folderId?: string | null
}

// ─── 쿼터 ───

type DriveQuota = {
    used: number // bytes
    total: number // bytes (사용자별, 기본 10MB = 10485760)
    remaining: number // bytes
}

// ─── 공통 ───

type ApiSuccessResponse<T> = { success: true; data: T }
type ApiPaginatedResponse<T> = { success: true; data: T[]; pagination: { page: number; limit: number; total: number } }
type ApiErrorResponse = { success: false; error: { code: string; message: string } }
```

---

## API Reference

Base URL: `https://api.gumyo.net/api/drive`

모든 요청에 `credentials: 'include'` 필수 (better-auth 세션 쿠키).

---

## 1. Folder API

### POST /folders - 폴더 생성

```typescript
const createFolder = async (data: DriveFolderCreateInput): Promise<DriveFolder> => {
    const res = await fetch('/api/drive/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
    })
    const json = await res.json() // 201
    return json.data
}

// 루트에 폴더 생성
await createFolder({ name: '사진' })

// 특정 폴더 하위에 생성
await createFolder({ name: '여행', parentId: 'folder-uuid' })
```

**제약:**

-   같은 위치(parentId)에 동일 이름 불가 → `409 DRIVE_FOLDER_NAME_DUPLICATE`
-   parentId가 있으면 해당 폴더가 본인 소유여야 함 → `404 DRIVE_FOLDER_NOT_FOUND`

---

### GET /folders - 폴더 목록

```typescript
const listFolders = async (parentId?: string): Promise<DriveFolder[]> => {
    const query = parentId ? `?parentId=${parentId}` : ''
    const res = await fetch(`/api/drive/folders${query}`, { credentials: 'include' })
    const json = await res.json()
    return json.data // 이름순 정렬
}

// 루트 폴더 목록
const rootFolders = await listFolders()

// 특정 폴더의 자식 폴더
const subFolders = await listFolders('parent-folder-uuid')
```

**Lazy Loading 패턴:** 폴더 클릭 시 해당 폴더의 자식만 로드. 전체 트리를 한 번에 가져오지 않음.

---

### GET /folders/:folderId - 폴더 상세 + Breadcrumb

```typescript
const getFolderDetail = async (folderId: string): Promise<DriveFolderDetail> => {
    const res = await fetch(`/api/drive/folders/${folderId}`, { credentials: 'include' })
    const json = await res.json()
    return json.data
}
```

**Response:**

```json
{
    "success": true,
    "data": {
        "id": "folder-3",
        "name": "제주도",
        "parentId": "folder-2",
        "breadcrumb": [
            { "id": "folder-1", "name": "사진" },
            { "id": "folder-2", "name": "여행" },
            { "id": "folder-3", "name": "제주도" }
        ],
        "createdAt": "2026-04-03T00:00:00.000Z",
        "updatedAt": "2026-04-03T00:00:00.000Z"
    }
}
```

**Breadcrumb 네비게이션 예시:**

```tsx
const Breadcrumb = ({ breadcrumb }: { breadcrumb: { id: string; name: string }[] }) => (
    <nav>
        <button onClick={() => navigate('/drive')}>Home</button>
        {breadcrumb.map((item, i) => (
            <span key={item.id}>
                {' / '}
                <button onClick={() => navigate(`/drive/folder/${item.id}`)}>{item.name}</button>
            </span>
        ))}
    </nav>
)
```

---

### PATCH /folders/:folderId - 폴더 수정 (이름 변경 / 이동)

```typescript
// 이름 변경
const renameFolder = async (folderId: string, name: string) => {
    const res = await fetch(`/api/drive/folders/${folderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
        credentials: 'include',
    })
    return res.json()
}

// 폴더 이동
const moveFolder = async (folderId: string, newParentId: string | null) => {
    const res = await fetch(`/api/drive/folders/${folderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: newParentId }), // null = 루트로 이동
        credentials: 'include',
    })
    return res.json()
}
```

**순환 참조 방지:** 자기 자신이나 자신의 하위 폴더로 이동 불가 → `400 DRIVE_FOLDER_CIRCULAR_REF`

---

### DELETE /folders/:folderId - 폴더 삭제

```typescript
const deleteFolder = async (folderId: string) => {
    const res = await fetch(`/api/drive/folders/${folderId}`, {
        method: 'DELETE',
        credentials: 'include',
    })
    return res.json()
}
```

**삭제 동작:**

-   하위 폴더: **연쇄 삭제** (DB CASCADE)
-   폴더 내 파일: **루트로 이동** (folderId → null, 파일 자체는 보존)
-   R2 원본 파일은 삭제되지 않음 (데이터 보존 우선)

---

## 2. File API

### POST /assets - 파일 업로드

```typescript
const uploadFile = async (file: File, folderId?: string): Promise<DriveUploadResult> => {
    const formData = new FormData()
    formData.append('file', file)
    if (folderId) formData.append('folderId', folderId)

    const res = await fetch('/api/drive/assets', {
        method: 'POST',
        body: formData,
        credentials: 'include',
    })
    const json = await res.json()
    return json.data
}

// 루트에 업로드
await uploadFile(file)

// 특정 폴더에 업로드
await uploadFile(file, 'folder-uuid')
```

**업로드 진행률 (XMLHttpRequest):**

```typescript
const uploadWithProgress = (file: File, folderId: string | undefined, onProgress: (pct: number) => void): Promise<DriveUploadResult> => {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const formData = new FormData()
        formData.append('file', file)
        if (folderId) formData.append('folderId', folderId)

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
            const json = JSON.parse(xhr.responseText)
            json.success ? resolve(json.data) : reject(json.error)
        }
        xhr.onerror = () => reject(new Error('네트워크 오류'))

        xhr.open('POST', '/api/drive/assets')
        xhr.withCredentials = true
        xhr.send(formData)
    })
}
```

**서버 처리 흐름:**

```
파일 수신
  → 크기 검증 (100MB)
  → 파일명 sanitize (path traversal 방지)
  → MIME 타입 검증 (블랙리스트 + 확장자 차단)
  → [image/*] magic byte 검증 (JPEG/PNG/GIF/WebP 시그니처)
  → SHA-256 해시 계산
  → 중복 확인 (userId + hash)
  → 쿼터 확인 (SUM(sizeBytes) + 신규)
  → [image/*] 100x100 WebP 썸네일 생성
  → R2 업로드: users/{userId}/{uuid}/{sanitized-filename}
  → DB INSERT (실패 시 R2 파일 자동 롤백)
```

**클라이언트 사전 검증 (서버 왕복 없이 차단):**

```typescript
const MAX_FILE_SIZE = 100 * 1024 * 1024

const BLOCKED_EXTENSIONS = new Set(['.exe', '.bat', '.cmd', '.scr', '.msi', '.pif', '.vbs', '.js', '.ps1', '.sh', '.com'])

const validateBeforeUpload = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) return '100MB 이하 파일만 업로드할 수 있습니다'
    if (file.size === 0) return '빈 파일은 업로드할 수 없습니다'
    const ext = file.name.match(/(\.[^.]+)$/)?.[1]?.toLowerCase()
    if (ext && BLOCKED_EXTENSIONS.has(ext)) return `${ext} 파일은 업로드할 수 없습니다`
    return null
}
```

---

### GET /assets - 파일 목록

```typescript
const listAssets = async (params?: {
    page?: number // 기본 1
    limit?: number // 기본 20, max 100
    folderId?: string // 생략=전체, 'root'=루트만, UUID=해당 폴더
    mimeType?: string // prefix 매칭: 'image/' → image/jpeg, image/png 등
    sort?: 'created' | 'name' | 'size' // 기본 'created'
    order?: 'asc' | 'desc' // 기본 'desc'
}) => {
    const query = new URLSearchParams()
    if (params?.page) query.set('page', String(params.page))
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.folderId) query.set('folderId', params.folderId)
    if (params?.mimeType) query.set('mimeType', params.mimeType)
    if (params?.sort) query.set('sort', params.sort)
    if (params?.order) query.set('order', params.order)

    const res = await fetch(`/api/drive/assets?${query}`, { credentials: 'include' })
    return res.json() as Promise<ApiPaginatedResponse<DriveAsset>>
}

// 특정 폴더의 파일만
await listAssets({ folderId: 'folder-uuid' })

// 루트에 있는 파일만 (폴더에 속하지 않은)
await listAssets({ folderId: 'root' })

// 이미지만 필터
await listAssets({ mimeType: 'image/' })

// 전체 파일 (폴더 무관)
await listAssets()
```

**`folderId` 파라미터 동작:**

| 값           | 동작                                                |
| ------------ | --------------------------------------------------- |
| 생략         | 유저의 모든 파일 반환                               |
| `'root'`     | `folderId IS NULL`인 파일만 (루트에 직접 있는 파일) |
| `'uuid-...'` | 해당 폴더에 속한 파일만                             |

**`thumbnail` 필드:**

```tsx
// thumbnail이 있으면 (이미지 파일) 바로 img src로 사용
{
    asset.thumbnail ? <img src={asset.thumbnail} alt={asset.originalName} width={100} height={100} /> : <FileIcon mimeType={asset.mimeType} />
}
```

thumbnail은 DB에서 직접 가져오는 base64 data URL이므로 추가 네트워크 요청 없음.

---

### GET /assets/:assetId - 파일 상세 + 다운로드 URL

```typescript
const getAssetDetail = async (assetId: number): Promise<DriveAssetDetail> => {
    const res = await fetch(`/api/drive/assets/${assetId}`, { credentials: 'include' })
    const json = await res.json()
    return json.data
}
```

**`url` 필드:**

| `isPublic` | URL 형태                                                 | 유효 기간  |
| ---------- | -------------------------------------------------------- | ---------- |
| `true`     | `https://blogimg.gumyo.net/users/{userId}/{uuid}/{file}` | 영구 (CDN) |
| `false`    | `https://{r2-endpoint}/...?X-Amz-Signature=...`          | 5분        |

**파일 다운로드:**

```typescript
const downloadFile = async (assetId: number) => {
    const { url, originalName } = await getAssetDetail(assetId)

    const res = await fetch(url)
    const blob = await res.blob()

    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = originalName
    a.click()
    URL.revokeObjectURL(a.href)
}
```

**이미지 미리보기:**

```typescript
const previewImage = async (assetId: number) => {
    const { url, mimeType } = await getAssetDetail(assetId)
    if (!mimeType.startsWith('image/')) return null
    return url // <img src={url} /> 로 바로 사용
}
```

**부수 효과:** `lastViewedAt`이 현재 시각으로 갱신됨.

---

### PATCH /assets/:assetId - 파일 수정 (이름 변경 / 이동 / 공개 설정)

하나의 엔드포인트로 이름 변경, 폴더 이동, 공개 설정을 모두 처리한다.

```typescript
const updateAsset = async (assetId: number, data: DriveAssetUpdateInput): Promise<DriveAssetUpdateResult> => {
    const res = await fetch(`/api/drive/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
    })
    const json = await res.json()
    return json.data
}

// 파일 이름 변경
await updateAsset(1, { originalName: '새이름.jpg' })

// 폴더 이동
await updateAsset(1, { folderId: 'target-folder-uuid' })

// 루트로 이동
await updateAsset(1, { folderId: null })

// 공개 전환
await updateAsset(1, { isPublic: true })

// 동시에 여러 필드 변경
await updateAsset(1, { originalName: '공개사진.jpg', isPublic: true, folderId: 'public-folder' })
```

-   `originalName`은 서버에서 sanitize됨 (path traversal 문자 제거)
-   `folderId`가 존재하지 않는 폴더면 → `404 DRIVE_FOLDER_NOT_FOUND`

---

### DELETE /assets/:assetId - 파일 삭제

```typescript
const deleteAsset = async (assetId: number) => {
    const res = await fetch(`/api/drive/assets/${assetId}`, {
        method: 'DELETE',
        credentials: 'include',
    })
    return res.json()
}
```

DB 먼저 삭제 → R2 삭제 순서. 복구 불가.

---

### GET /quota - 사용량 조회

```typescript
const getQuota = async (): Promise<DriveQuota> => {
    const res = await fetch('/api/drive/quota', { credentials: 'include' })
    const json = await res.json()
    return json.data
}
```

**사용률 표시:**

```typescript
const formatQuota = (quota: DriveQuota) => {
    const pct = Math.round((quota.used / quota.total) * 100)
    const format = (bytes: number) => {
        if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    }
    return `${format(quota.used)} / ${format(quota.total)} (${pct}%)`
}
```

---

## 3. Folder + File 통합 패턴

폴더 진입 시 해당 위치의 폴더와 파일을 동시에 로드하는 패턴.

```typescript
const loadFolderContents = async (folderId?: string) => {
    const [folders, assets] = await Promise.all([listFolders(folderId), listAssets({ folderId: folderId ?? 'root' })])

    return { folders, assets: assets.data, pagination: assets.pagination }
}

// 루트 진입
const root = await loadFolderContents()

// 특정 폴더 진입
const folder = await loadFolderContents('folder-uuid')
```

**폴더 탐색 화면 구성:**

```tsx
const DrivePage = () => {
    const [currentFolderId, setCurrentFolderId] = useState<string | undefined>()
    const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([])
    const [folders, setFolders] = useState<DriveFolder[]>([])
    const [assets, setAssets] = useState<DriveAsset[]>([])

    const enterFolder = async (folderId: string) => {
        setCurrentFolderId(folderId)
        const [detail, contents] = await Promise.all([getFolderDetail(folderId), loadFolderContents(folderId)])
        setBreadcrumb(detail.breadcrumb)
        setFolders(contents.folders)
        setAssets(contents.assets)
    }

    const goToRoot = async () => {
        setCurrentFolderId(undefined)
        setBreadcrumb([])
        const contents = await loadFolderContents()
        setFolders(contents.folders)
        setAssets(contents.assets)
    }

    return (
        <div>
            <Breadcrumb items={breadcrumb} onNavigate={enterFolder} onHome={goToRoot} />
            <QuotaBar />
            <UploadButton currentFolderId={currentFolderId} />
            <NewFolderButton parentId={currentFolderId} />
            <FolderList folders={folders} onEnter={enterFolder} />
            <AssetGrid assets={assets} />
        </div>
    )
}
```

---

## Error Handling

```typescript
type DriveErrorCode =
    | 'DRIVE_ASSET_NOT_FOUND'
    | 'DRIVE_FILE_TOO_LARGE'
    | 'DRIVE_INVALID_MIME_TYPE'
    | 'DRIVE_DUPLICATE_FILE'
    | 'DRIVE_QUOTA_EXCEEDED'
    | 'DRIVE_FOLDER_NOT_FOUND'
    | 'DRIVE_FOLDER_CIRCULAR_REF'
    | 'DRIVE_FOLDER_NAME_DUPLICATE'
    | 'UNAUTHORIZED'
```

| Code                          | HTTP | 발생 조건                              | 프론트엔드 처리                    |
| ----------------------------- | ---- | -------------------------------------- | ---------------------------------- |
| `DRIVE_ASSET_NOT_FOUND`       | 404  | 존재하지 않는 파일                     | toast + 목록 새로고침              |
| `DRIVE_FILE_TOO_LARGE`        | 413  | 100MB 초과                             | 업로드 전 `file.size`로 사전 차단  |
| `DRIVE_INVALID_MIME_TYPE`     | 422  | 차단된 MIME/확장자, 이미지 위장        | toast (차단 목록은 아래 참고)      |
| `DRIVE_DUPLICATE_FILE`        | 409  | 동일 SHA-256 해시 파일                 | "이미 업로드된 파일입니다"         |
| `DRIVE_QUOTA_EXCEEDED`        | 413  | 사용자별 쿼터 초과                     | 쿼터 표시 + 정리 유도              |
| `DRIVE_FOLDER_NOT_FOUND`      | 404  | 존재하지 않는 폴더 또는 타인 폴더 접근 | toast + 상위 폴더로 이동           |
| `DRIVE_FOLDER_CIRCULAR_REF`   | 400  | 자기 하위 폴더로 이동                  | "이 위치로 이동할 수 없습니다"     |
| `DRIVE_FOLDER_NAME_DUPLICATE` | 409  | 같은 위치에 동일 이름                  | "같은 이름의 폴더가 이미 있습니다" |
| `UNAUTHORIZED`                | 401  | 세션 만료                              | 로그인 리다이렉트                  |

**에러 핸들러:**

```typescript
const driveErrorHandler = (error: { code: string; message: string }) => {
    switch (error.code) {
        case 'DRIVE_FILE_TOO_LARGE':
        case 'DRIVE_QUOTA_EXCEEDED':
        case 'DRIVE_DUPLICATE_FILE':
        case 'DRIVE_INVALID_MIME_TYPE':
        case 'DRIVE_FOLDER_NAME_DUPLICATE':
        case 'DRIVE_FOLDER_CIRCULAR_REF':
            toast.error(error.message)
            break
        case 'DRIVE_ASSET_NOT_FOUND':
        case 'DRIVE_FOLDER_NOT_FOUND':
            toast.error(error.message)
            router.push('/drive')
            break
        case 'UNAUTHORIZED':
            router.push('/login')
            break
        default:
            toast.error('오류가 발생했습니다')
    }
}
```

---

## Security

### 파일 업로드 보안

| 계층       | 검증                                                                              |
| ---------- | --------------------------------------------------------------------------------- |
| 파일명     | `sanitizeFilename()` - path traversal(`../`), 제어문자, 역슬래시 제거. 255자 제한 |
| MIME 타입  | 블랙리스트 차단 (exe, html, js 등) + 정규식 형식 검증                             |
| 확장자     | `.exe .bat .cmd .scr .msi .pif .vbs .js .ps1 .sh .com` 차단                       |
| Magic byte | `image/*` MIME인 경우 JPEG/PNG/GIF/WebP 파일 시그니처 검증                        |
| 크기       | `file.size` + `buffer.length` 이중 검증 (100MB)                                   |
| 중복       | SHA-256 해시 기반 동일 유저 내 중복 차단                                          |
| 쿼터       | 유저별 총 사용량 제한 (DB `user.storage_quota_bytes` 기반, 기본 10MB)             |
| R2 롤백    | DB insert 실패 시 R2 파일 자동 삭제                                               |

### 접근 제어

-   모든 요청: `better-auth` 세션 필수
-   파일/폴더 조회/수정/삭제: `userId` 소유권 검증
-   Private 파일: 5분 유효 Presigned URL로만 접근
-   폴더 이동: 순환 참조 검증 (최대 50 depth 탐색)

---

## Limits & Constraints

| 항목                    | 값                                                     |
| ----------------------- | ------------------------------------------------------ |
| 최대 파일 크기          | 100MB                                                  |
| 유저별 기본 쿼터        | 10MB (사용자별 DB 설정 가능)                           |
| 목록 페이지 크기        | 1~100건 (기본 20)                                      |
| 썸네일                  | 100x100px WebP quality 60                              |
| Presigned URL 유효 시간 | 5분 (300초)                                            |
| 중복 판정 범위          | 동일 유저 + SHA-256                                    |
| 폴더 이름               | 1~255자, 같은 위치 중복 불가                           |
| 폴더 depth              | 무제한 (안전장치: 순환참조/breadcrumb 50 depth 제한)   |
| 차단 확장자             | `.exe .bat .cmd .scr .msi .pif .vbs .js .ps1 .sh .com` |

---

## Database Schema

```sql
CREATE TABLE drive_folders (
    id          VARCHAR(36) PRIMARY KEY,
    user_id     VARCHAR(36) NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    parent_id   VARCHAR(36) REFERENCES drive_folders(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP(3) NOT NULL DEFAULT NOW(),

    INDEX idx_drive_folders_user (user_id),
    INDEX idx_drive_folders_user_parent (user_id, parent_id)
);

CREATE TABLE cloud_assets (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        VARCHAR(36) NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    s3_key         VARCHAR(500) NOT NULL UNIQUE,
    original_name  VARCHAR(255) NOT NULL,
    mime_type      VARCHAR(100) NOT NULL,
    size_bytes     BIGINT NOT NULL,
    file_hash      VARCHAR(64) NOT NULL,
    folder_id      VARCHAR(36) REFERENCES drive_folders(id) ON DELETE SET NULL,
    thumbnail_blob MEDIUMBLOB,
    is_public      BOOLEAN NOT NULL DEFAULT FALSE,
    last_viewed_at TIMESTAMP(3),
    created_at     TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP(3) NOT NULL DEFAULT NOW(),

    INDEX idx_cloud_assets_user (user_id),
    INDEX idx_cloud_assets_user_created (user_id, created_at),
    INDEX idx_cloud_assets_folder (folder_id),
    UNIQUE uq_cloud_assets_user_hash (user_id, file_hash)
);
```

**삭제 전략:**

-   `drive_folders.parent_id` → `ON DELETE CASCADE` (하위 폴더 연쇄 삭제)
-   `cloud_assets.folder_id` → `ON DELETE SET NULL` (파일은 루트로 이동, 보존)

---

## Environment Variables

| Variable               | Required | Default                     | Description                      |
| ---------------------- | -------- | --------------------------- | -------------------------------- |
| `R2_END_POINT`         | Y        | -                           | Cloudflare R2 S3 호환 엔드포인트 |
| `R2_ACCESS_KEY_ID`     | Y        | -                           | R2 Access Key ID                 |
| `R2_SECRET_ACCESS_KEY` | Y        | -                           | R2 Secret Access Key             |
| `R2_BUCKET`            | N        | `blog-cloud`                | R2 버킷명                        |
| `R2_CUSTOM_DOMAIN`     | N        | `https://blogimg.gumyo.net` | Public CDN 도메인                |

---

## Backend Architecture

```
route/drive/asset.ts     파일 CRUD 엔드포인트 (6개)
route/drive/folder.ts    폴더 CRUD 엔드포인트 (5개)
service/domain/drive/    비즈니스 로직 (보안 검증, 해시, 쿼터, breadcrumb, 순환참조)
service/shared/          StorageService, ImageProcessor (Blog/Mail과 공유)
compose/drive.ts         DB 어댑터 + 서비스 조립
dto/drive/               Zod 검증 스키마
db/schema.ts             drive_folders + cloud_assets 테이블
```

---

## Cost Estimation (R2, 10-Year)

| 항목    | 단가      | 1TB/월 |
| ------- | --------- | ------ |
| Storage | $0.015/GB | $15.36 |
| Egress  | $0        | $0     |

**1TB 10년: ~$1,843 (월 ~$15)**

---

## Changelog

### 2026-04-03

**보안 강화**

-   **에러 코드 통일**: `DRIVE_NOT_OWNER` (403) 제거 → `DRIVE_ASSET_NOT_FOUND` / `DRIVE_FOLDER_NOT_FOUND` (404)로 통일
    -   타인의 리소스 접근 시 "소유자가 아닙니다" 대신 "찾을 수 없습니다"로 응답 (리소스 존재 여부 비노출)
    -   **프론트엔드 영향**: `DRIVE_NOT_OWNER` 에러 코드를 분기 처리하고 있었다면 제거 필요. 이제 `DRIVE_ASSET_NOT_FOUND` / `DRIVE_FOLDER_NOT_FOUND`로만 내려옴
-   **프로덕션 스택 트레이스 제거**: 서버 에러 발생 시 콘솔에 스택 트레이스가 출력되지 않음 (Sentry 전송은 유지)

**사용자별 스토리지 쿼터**

-   기존: 전체 사용자 공통 5GB 하드코딩
-   변경: **사용자별 쿼터** — DB `user.storage_quota_bytes` 컬럼 기반
    -   기본값: **10MB** (가입 시 자동 적용)
    -   `GET /quota` 응답의 `total` 값이 사용자마다 다를 수 있음
    -   추후 결제 플랜에 따라 개별 사용자의 쿼터를 DB에서 업데이트하면 즉시 반영됨

```typescript
// 예시: 플랜별 쿼터 (추후 적용 예정)
// Free:  10MB  (10 * 1024 * 1024 = 10485760)
// Basic: 1GB   (1 * 1024 * 1024 * 1024 = 1073741824)
// Pro:   10GB  (10 * 1024 * 1024 * 1024 = 10737418240)
```

**프론트엔드 변경 필요사항 요약**

| 항목                          | 변경 내용                                                         | 필수 여부            |
| ----------------------------- | ----------------------------------------------------------------- | -------------------- |
| `DRIVE_NOT_OWNER` 에러 핸들링 | 제거 (더 이상 내려오지 않음)                                      | 사용 중이었다면 필수 |
| 쿼터 표시 포맷                | GB 고정 → MB/GB 자동 전환 권장 (`total`이 10MB일 수 있음)         | 권장                 |
| 쿼터 하드코딩                 | `5GB` 상수 사용 중이었다면 제거, 항상 `GET /quota`의 `total` 사용 | 필수                 |
