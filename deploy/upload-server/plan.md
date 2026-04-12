# Upload Server 고도화 계획

## 1. WebDAV 서버 구현

### 목적
macOS Finder, Windows Explorer에서 네이티브 네트워크 드라이브로 마운트하여 드래그앤드롭 업로드/다운로드, 폴더 관리, 용량 확인을 지원한다.

### 접속 방식
- macOS Finder: 서버 연결 → `https://webdav.hyns.dev`
- Windows Explorer: 네트워크 드라이브 연결 → `https://webdav.hyns.dev`

### 구현할 WebDAV 메서드

| 메서드 | 용도 | hyun-hub API 매핑 |
|--------|------|-------------------|
| `OPTIONS` | 지원 메서드 응답 | 직접 처리 |
| `PROPFIND` (Depth 0) | 단일 파일/폴더 정보 | `GET /assets/:id` 또는 `GET /folders/:id` |
| `PROPFIND` (Depth 1) | 디렉토리 목록 | `GET /assets?folderId=x` + `GET /folders?parentId=x` |
| `GET` | 파일 다운로드 | `GET /assets/:id/download` 또는 R2 presigned URL redirect |
| `PUT` | 파일 업로드 | `POST /prepare` → 디스크 저장 → R2/GDrive 분배 → `POST /complete` |
| `MKCOL` | 폴더 생성 | `POST /folders` |
| `DELETE` | 파일/폴더 삭제 | `DELETE /assets/:id` 또는 `DELETE /folders/:id` |
| `MOVE` | 파일/폴더 이동, 이름 변경 | `PATCH /assets/:id` 또는 `PATCH /folders/:id` |
| `COPY` | 파일 복사 | 미지원 (405 반환) 또는 GET → PUT으로 구현 |
| `LOCK` / `UNLOCK` | 파일 잠금 (Office 등) | 빈 응답으로 fake 지원 (Finder 호환) |
| `HEAD` | 파일 존재 확인 | `GET /assets/:id` 응답의 헤더만 반환 |

### PROPFIND 응답 형식 (XML)

```xml
<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/folder-name/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
        <D:displayname>folder-name</D:displayname>
        <D:creationdate>2026-04-12T00:00:00Z</D:creationdate>
        <D:getlastmodified>Sat, 12 Apr 2026 00:00:00 GMT</D:getlastmodified>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/file.pdf</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype/>
        <D:displayname>file.pdf</D:displayname>
        <D:getcontentlength>1234567</D:getcontentlength>
        <D:getcontenttype>application/pdf</D:getcontenttype>
        <D:creationdate>2026-04-12T00:00:00Z</D:creationdate>
        <D:getlastmodified>Sat, 12 Apr 2026 00:00:00 GMT</D:getlastmodified>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>
```

### 용량 표시 (quota-available-bytes)

Finder가 마운트 시 `PROPFIND /` (Depth 0)에서 quota 정보를 요청한다.

```xml
<D:prop>
  <D:quota-available-bytes>1099511627776</D:quota-available-bytes>
  <D:quota-used-bytes>1256707</D:quota-used-bytes>
</D:prop>
```

hyun-hub `GET /quota` API에서 가져온 값을 반환.

### 인증 방식

- HTTP Basic Auth → username/password로 hyun-hub 세션 토큰 또는 API 토큰 검증
- Finder/Explorer 모두 Basic Auth를 네이티브 지원 (로그인 창 자동 표시)
- hyun-hub에 WebDAV 전용 토큰 발급 엔드포인트 추가 필요
  - 또는 기존 API 토큰 시스템 활용 (`/api/auth/token`)
  - 또는 email + password 기반 (better-auth에 email/password가 비활성화이므로 별도 구현 필요)
- 추천: API 토큰 방식. 사용자가 웹 UI에서 WebDAV 토큰 생성 → Finder에 입력

### 아키텍처

```
Finder/Explorer
  ↓ WebDAV (HTTPS)
nginx (webdav.hyns.dev)
  ↓
upload-server (기존 /upload 엔드포인트 + 새 WebDAV 엔드포인트)
  ↓                          ↓
hyun-hub API (메타데이터)    R2 / Google Drive (파일)
```

기존 upload-server에 WebDAV 라우트를 추가하는 방식. 별도 컨테이너 불필요.

### 파일 구조 (예상)

```
deploy/upload-server/
  index.ts              -- 기존 upload + WebDAV 라우트 등록
  upload-handler.ts     -- 기존 업로드 핸들러
  webdav/
    handler.ts          -- WebDAV 메서드 라우팅
    propfind.ts         -- PROPFIND 응답 생성 (XML)
    get.ts              -- 파일 다운로드 (스트리밍)
    put.ts              -- 파일 업로드 (prepare → 저장 → complete)
    mkcol.ts            -- 폴더 생성
    delete.ts           -- 삭제
    move.ts             -- 이동/이름 변경
    lock.ts             -- LOCK/UNLOCK fake 응답
    auth.ts             -- Basic Auth 검증
    xml.ts              -- XML 빌더/파서 유틸
```

### 주의사항

#### Finder 호환성
- Finder는 PROPFIND 전에 반드시 OPTIONS를 보냄. `Allow` 헤더에 지원 메서드 나열 필수
- Finder는 LOCK을 지원하지 않으면 read-only로 마운트함. 빈 LOCK 응답이라도 반환해야 쓰기 가능
- Finder는 `.DS_Store`, `._*` 파일을 자동 생성함. 이걸 무시하거나 업로드 차단 필요
- Finder는 파일 업로드 시 `PUT` 전에 빈 파일을 먼저 만들고 이후 내용을 씀 (0-byte PUT → 실제 PUT). 이 패턴 처리 필요
- Finder는 `If` 헤더로 lock token을 보냄. LOCK fake 구현 시 이 토큰을 추적해야 함

#### Windows Explorer 호환성
- Explorer는 WebDAV Mini-Redirector를 사용하며, HTTPS 필수 (HTTP는 레지스트리 수정 필요)
- Explorer는 `PROPFIND` Depth가 `infinity`일 수 있음. 무한 루프 방지 필요
- Explorer는 `Translate: f` 헤더를 보냄. 무시해도 됨
- Explorer는 50MB 이상 파일 다운로드 시 타임아웃 기본값이 30분. 클라이언트 측 레지스트리 수정 필요할 수 있음

#### 업로드 흐름 차이
- 현재 웹 UI: client에서 SHA-256 → prepare → upload-server → complete
- WebDAV: Finder가 PUT으로 바로 보냄. SHA-256 해시, prepare, complete를 WebDAV 서버 내부에서 순차 처리
- 파일 수신 → 디스크 저장 → SHA-256 계산 → prepare API → R2/GDrive 분배 → complete API
- 기존 upload-handler.ts의 로직을 재사용하되, 인증 부분만 다름 (uploadToken 대신 Basic Auth)

#### 경로 매핑
- WebDAV URL 경로 ↔ hyun-hub 폴더 구조 매핑 필요
- `https://webdav.hyns.dev/Documents/file.pdf` → folderId 조회 → assetId 조회
- 경로 → folderId 변환 캐시 필요 (매 요청마다 DB 조회하면 느림)
- 루트 `/`는 folderId = null (루트 폴더)

#### 성능
- PROPFIND가 빈번하게 호출됨 (Finder가 디렉토리 열 때마다)
- hyun-hub API 응답을 캐시 (TTL 30초 정도)
- 대용량 파일 다운로드는 R2 presigned URL로 redirect하거나 스트리밍

#### 동시성
- Finder가 여러 파일을 동시에 업로드할 수 있음
- 기존 디스크 기반 스트리밍 처리로 메모리 문제 없음
- 동시 업로드 수 제한 (서버 측) 고려

### nginx 설정 (webdav.hyns.dev)

```nginx
server {
    listen 443 ssl;
    server_name webdav.hyns.dev;
    ssl_certificate /etc/letsencrypt/live/hyns.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hyns.dev/privkey.pem;

    client_max_body_size 10G;

    proxy_connect_timeout 86400;
    proxy_send_timeout 86400;
    proxy_read_timeout 86400;
    send_timeout 86400;

    location / {
        proxy_pass http://upload-server:4100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_method $request_method;
        proxy_pass_request_headers on;
        proxy_pass_request_body on;
        proxy_request_buffering off;
    }
}
```

### 필요한 hyun-hub API 추가/수정

1. **WebDAV 토큰 인증 엔드포인트** — Basic Auth의 password를 검증하여 userId 반환
2. **경로 기반 폴더 조회** — `GET /folders/by-path?path=/Documents/Sub` → folderId 반환 (현재 없음)
3. **경로 기반 파일 조회** — `GET /assets/by-path?folderId=x&name=file.pdf` → assetId 반환 (현재 없음)

---

## 2. WebDAV 토큰 시스템

### DB 스키마

```
webdav_tokens 테이블:
  id          varchar(36) PK
  userId      varchar(36) FK → user.id (cascade delete)
  token       varchar(64) NOT NULL UNIQUE — SHA-256 해시 저장 (평문 저장 금지)
  name        varchar(100) NOT NULL — 디바이스 이름 (예: 'MacBook Pro', 'Windows PC')
  lastUsedAt  timestamp(3) — 마지막 사용 시각
  createdAt   timestamp(3)
```

### 특징
- 한 유저가 여러 토큰 발급 가능 (MacBook, iMac, Windows 등 디바이스별)
- 모든 토큰이 같은 WebDAV 스토리지를 봄 (userId 기반 격리)
- 토큰은 발급 시 한번만 평문 표시, DB에는 SHA-256 해시로 저장
- 토큰별 마지막 사용 시각 기록 (어떤 디바이스가 활성인지 확인용)
- 토큰 개별 삭제 가능 (디바이스 분실 시 해당 토큰만 폐기)

### hyun-hub API 엔드포인트

```
POST   /api/drive/webdav-tokens           — 토큰 생성 (name 필수)
GET    /api/drive/webdav-tokens           — 토큰 목록 (토큰값은 마스킹, lastUsedAt 포함)
DELETE /api/drive/webdav-tokens/:tokenId  — 토큰 삭제
POST   /api/drive/webdav-tokens/verify    — 토큰 검증 (WebDAV 서버가 호출, userId 반환)
```

### 인증 흐름

```
Finder 서버 연결:
  URL: https://webdav.hyns.dev
  이름: (아무 값, 사용 안 함)
  비밀번호: 발급받은 WebDAV 토큰

WebDAV 서버 요청 수신:
  → Authorization: Basic base64(username:password) 파싱
  → password 추출
  → hyun-hub POST /api/drive/webdav-tokens/verify { token: password }
  → 응답: { userId, name } 또는 401
  → userId로 파일/폴더 접근
  → lastUsedAt 업데이트
```

### 보안
- 토큰은 64자 hex (256-bit), brute force 불가능
- DB에 SHA-256 해시로 저장, 유출돼도 원본 복구 불가
- HTTPS 필수 (Basic Auth는 평문이므로)
- 토큰별 삭제로 디바이스 분실 대응
- rate limiting: verify 실패 시 IP 기반 제한

---

## 3. FE (storage) WebDAV 토큰 관리 UI

### 위치
마이페이지 또는 설정 페이지에 "WebDAV 연결" 섹션 추가.

### UI 구성

```
┌─────────────────────────────────────────────────┐
│ WebDAV 연결                                      │
│                                                   │
│ 서버 주소: https://webdav.hyns.dev               │
│                                        [복사]     │
│                                                   │
│ ┌───────────────────────────────────────────────┐ │
│ │ 토큰 목록                                      │ │
│ │                                               │ │
│ │ MacBook Pro     ****a3f2   마지막: 2시간 전  [삭제] │ │
│ │ Windows PC      ****b7e1   마지막: 3일 전    [삭제] │ │
│ │ iMac            ****c9d4   미사용            [삭제] │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│ [+ 새 토큰 생성]                                   │
│                                                   │
│ ┌───────────────────────────────────────────────┐ │
│ │ 새 토큰 생성                                    │ │
│ │                                               │ │
│ │ 디바이스 이름: [MacBook Air        ]            │ │
│ │                           [생성]               │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│ ┌───────────────────────────────────────────────┐ │
│ │ ⚠️ 토큰이 생성되었습니다. 이 값은 다시 볼 수 없습니다. │ │
│ │                                               │ │
│ │ wdv_8f3a...c2e1d4b7                    [복사]  │ │
│ │                                               │ │
│ │ Finder 설정 방법:                               │ │
│ │ 1. Finder → 이동 → 서버에 연결                   │ │
│ │ 2. 주소: https://webdav.hyns.dev               │ │
│ │ 3. 이름: (아무 값)                               │ │
│ │ 4. 비밀번호: 위 토큰 값 붙여넣기                   │ │
│ └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### FE 구현 파일 (예상)

```
entities/drive/
  webdav-token-api.ts    — CRUD API 호출 (server action)
  webdav-token-type.ts   — WebdavToken 타입
  webdav-token-query.ts  — React Query hooks

features/storage/
  webdav-token-section.tsx    — 토큰 목록 + 생성 UI
  webdav-token-create.tsx     — 생성 다이얼로그
  webdav-token-list.tsx       — 토큰 리스트

shared/i18n/
  ko.ts, en.ts, jp.ts    — WebDAV 관련 번역 키 추가
```

### i18n 키 (예상)

```
webdavConnection: 'WebDAV 연결'
webdavServerUrl: '서버 주소'
webdavTokenList: '토큰 목록'
webdavCreateToken: '새 토큰 생성'
webdavDeviceName: '디바이스 이름'
webdavTokenCreated: '토큰이 생성되었습니다. 이 값은 다시 볼 수 없습니다.'
webdavTokenCopied: '토큰이 복사되었습니다.'
webdavLastUsed: '마지막 사용'
webdavNeverUsed: '미사용'
webdavDeleteToken: '토큰 삭제'
webdavDeleteConfirm: '이 토큰을 삭제하면 해당 디바이스에서 WebDAV 접근이 차단됩니다.'
webdavFinderGuide: 'Finder → 이동 → 서버에 연결'
webdavExplorerGuide: '탐색기 → 네트워크 드라이브 연결'
```

---

## 4. Mac Studio L2 스토리지 구현 (TODO)

### 연동 방식
- Mac Studio에 HTTP API 서버 배치 (Cloudflare Tunnel 또는 Tailscale로 외부 노출)
- upload-server에서 10GB 초과 파일은 Mac Studio로 스트리밍-스트리밍 전송
- `createReadStream(tmpPath)`을 body로 Mac Studio HTTP API에 전달

### 필요 작업
- `deploy/upload-server/local-client.ts` 실제 구현
- Mac Studio HTTP API 서버 프로젝트 생성
- download fallback: L1 없고 L2 있으면 Mac Studio에서 스트리밍 서빙
- lifecycle: Mac Studio FIFO eviction 구현
