# Spotify API Documentation

Base URL: `https://hub.gumyo.net/api`

---

## 인증 방식

### 1. 세션 인증 (로그인 사용자)
- better-auth 세션 쿠키 기반
- 계정 관리, API Key CRUD, 데이터 조회 모두 사용 가능
- 데이터 조회 시 `?accountId={id}` 쿼리 파라미터 필수

### 2. API Key 인증 (비로그인/외부 서비스)
- `X-Spotify-Key` 헤더에 발급받은 키 전달
- 데이터 조회 API에서만 사용 가능 (now-playing, playlists)
- 키는 특정 Spotify 계정에 바인딩됨 (accountId 불필요)

### 3. Widget Token (공개 접근)
- 위젯 전용 16자 토큰 기반 — 인증 헤더/쿠키 불필요
- `/spotify/playing/{token}` 형태로 SVG/HTML/JSON 직접 접근
- GitHub README `<img>` 태그, 블로그 `<iframe>` 임베딩에 사용
- API Key와 별도 관리 (발급/삭제/활성 토글 가능)

---

## 1. Spotify 계정 연동 (OAuth)

### `GET /spotify/accounts/connect`

Spotify OAuth 인증 페이지로 리다이렉트합니다.

| 항목 | 값 |
|------|-----|
| Auth | Session (로그인 필수) |
| Response | 302 Redirect → Spotify |

**Query Parameters:**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| redirect | string | X | OAuth 완료 후 돌아갈 URL |

**사용 예시:**
```
GET /api/spotify/accounts/connect?redirect=https://blog.gumyo.net/settings/spotify
```

### `GET /spotify/accounts/connect/callback`

Spotify OAuth 콜백 (프론트에서 직접 호출하지 않음). 처리 후 redirect URL로 리다이렉트됩니다.

**성공 시 리다이렉트:**
```
{redirect}?success=true&spotifyUserId=spotify_user_id_here
```

**실패 시 리다이렉트:**
```
{redirect}?error=SPOTIFY_OAUTH_EXCHANGE_FAILED
```

**사용자 거부 시:**
```
{redirect}?error=oauth_denied
```

---

## 2. Spotify 계정 관리

### `GET /spotify/accounts`

내 Spotify 계정 목록 조회.

| 항목 | 값 |
|------|-----|
| Auth | Session |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "spotifyUserId": "spotify_user_123",
      "displayName": "John Doe",
      "email": "john@example.com",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### `GET /spotify/accounts/:accountId`

Spotify 계정 상세 조회.

| 항목 | 값 |
|------|-----|
| Auth | Session |

**Path Parameters:**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| accountId | number | 계정 ID |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "spotifyUserId": "spotify_user_123",
    "displayName": "John Doe",
    "email": "john@example.com",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error 404:**
```json
{
  "success": false,
  "error": { "code": "SPOTIFY_ACCOUNT_NOT_FOUND", "message": "Spotify 계정을 찾을 수 없습니다" }
}
```

---

### `PATCH /spotify/accounts/:accountId`

Spotify 계정 수정.

| 항목 | 값 |
|------|-----|
| Auth | Session |
| Content-Type | application/json |

**Request Body:**
```json
{
  "displayName": "새 이름",
  "isActive": false
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| displayName | string | X | 표시 이름 (최대 100자) |
| isActive | boolean | X | 활성 상태 |

**Response 200:**
```json
{
  "success": true,
  "data": { "updated": true }
}
```

---

### `DELETE /spotify/accounts/:accountId`

Spotify 계정 삭제. 연결된 API Key도 함께 삭제됩니다.

| 항목 | 값 |
|------|-----|
| Auth | Session |

**Response 200:**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

---

## 3. API Key 관리

### `GET /spotify/keys`

내 Spotify API Key 목록 조회.

| 항목 | 값 |
|------|-----|
| Auth | Session |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "spotifyAccountId": 1,
      "name": "블로그 위젯용",
      "expiresAt": null,
      "lastUsedAt": "2024-01-15T12:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### `POST /spotify/keys`

새 API Key 발급. **키 값은 이 응답에서만 확인 가능합니다.**

| 항목 | 값 |
|------|-----|
| Auth | Session |
| Content-Type | application/json |

**Request Body:**
```json
{
  "spotifyAccountId": 1,
  "name": "블로그 위젯용"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| spotifyAccountId | number | O | 바인딩할 Spotify 계정 ID |
| name | string | X | 키 이름 (최대 100자) |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "key": "a1b2c3d4e5f6...64자 hex 토큰"
  }
}
```

---

### `DELETE /spotify/keys/:id`

API Key 삭제 (즉시 무효화).

| 항목 | 값 |
|------|-----|
| Auth | Session |

**Response 200:**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

---

## 4. 데이터 조회 API

> 이 API들은 **세션 인증** 또는 **API Key 인증** 둘 다 지원합니다.

### `GET /spotify/now-playing`

현재 재생 중인 트랙을 조회합니다. 미재생 시 최근 재생 정보를 반환합니다.

| 항목 | 값 |
|------|-----|
| Auth | Session + `?accountId={id}` **또는** `X-Spotify-Key` 헤더 |

**인증 예시:**

```
# API Key 방식 (외부 위젯 등)
GET /api/spotify/now-playing
X-Spotify-Key: a1b2c3d4e5f6...

# 세션 방식 (로그인 상태)
GET /api/spotify/now-playing?accountId=1
```

**Response 200 (재생 중):**
```json
{
  "success": true,
  "data": {
    "isPlaying": true,
    "track": {
      "name": "Bohemian Rhapsody",
      "artist": "Queen",
      "album": "A Night at the Opera",
      "albumArt": "https://i.scdn.co/image/...",
      "externalUrl": "https://open.spotify.com/track/...",
      "durationMs": 354000,
      "progressMs": 120000
    },
    "lastPlayedAt": null
  }
}
```

**Response 200 (미재생, 최근 재생 있음):**
```json
{
  "success": true,
  "data": {
    "isPlaying": false,
    "track": {
      "name": "Yesterday",
      "artist": "The Beatles",
      "album": "Help!",
      "albumArt": "https://i.scdn.co/image/...",
      "externalUrl": "https://open.spotify.com/track/...",
      "durationMs": 125000,
      "progressMs": null
    },
    "lastPlayedAt": "2024-01-15T12:30:00Z"
  }
}
```

**Response 200 (재생 기록 없음):**
```json
{
  "success": true,
  "data": {
    "isPlaying": false,
    "track": null,
    "lastPlayedAt": null
  }
}
```

---

### `GET /spotify/playlists`

플레이리스트 목록을 조회합니다.

| 항목 | 값 |
|------|-----|
| Auth | Session + `?accountId={id}` **또는** `X-Spotify-Key` 헤더 |

**Query Parameters:**

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| limit | number | 20 | 조회 개수 (1~50) |
| offset | number | 0 | 시작 위치 |
| accountId | number | - | 세션 인증 시 필수 |

**인증 예시:**

```
# API Key 방식
GET /api/spotify/playlists?limit=10
X-Spotify-Key: a1b2c3d4e5f6...

# 세션 방식
GET /api/spotify/playlists?accountId=1&limit=10&offset=0
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "37i9dQZF1DXcBWIGoYBM5M",
        "name": "Today's Top Hits",
        "description": "The most popular songs right now",
        "imageUrl": "https://i.scdn.co/image/...",
        "trackCount": 50,
        "isPublic": true,
        "externalUrl": "https://open.spotify.com/playlist/..."
      }
    ],
    "total": 42,
    "limit": 10,
    "offset": 0
  }
}
```

---

## 5. Widget Token 관리

### `GET /spotify/widget-tokens`

내 위젯 토큰 목록 조회.

| 항목 | 값 |
|------|-----|
| Auth | Session |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "spotifyAccountId": 1,
      "token": "a1b2c3d4e5f67890",
      "name": "GitHub README용",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### `POST /spotify/widget-tokens`

위젯 토큰 발급. API Key와 달리 토큰은 응답 및 목록에서 항상 확인 가능합니다.

| 항목 | 값 |
|------|-----|
| Auth | Session |
| Content-Type | application/json |

**Request Body:**
```json
{
  "spotifyAccountId": 1,
  "name": "GitHub README용"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| spotifyAccountId | number | O | 바인딩할 Spotify 계정 ID |
| name | string | X | 토큰 이름 (최대 100자) |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "token": "a1b2c3d4e5f67890"
  }
}
```

---

### `DELETE /spotify/widget-tokens/:id`

위젯 토큰 삭제 (즉시 무효화).

| 항목 | 값 |
|------|-----|
| Auth | Session |

**Response 200:**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

---

### `PATCH /spotify/widget-tokens/:id/active`

위젯 토큰 활성/비활성 토글.

| 항목 | 값 |
|------|-----|
| Auth | Session |
| Content-Type | application/json |

**Request Body:**
```json
{
  "isActive": false
}
```

**Response 200:**
```json
{
  "success": true,
  "data": { "id": 1, "isActive": false }
}
```

---

## 6. Now Playing 위젯 (공개 API)

> 위젯 토큰 기반 — 인증 불필요. GitHub README, 블로그 iframe 등에서 직접 사용합니다.

### 테마 커스터마이징 (공통 Query Parameters)

SVG (`/:token`)와 HTML 위젯 (`/:token/widget`) 모두 동일한 테마 파라미터를 지원합니다.

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| radius | number | 12 | 카드 border radius (0~50) |
| bg | hex | 191414 | 배경색 (`#` 없이) |
| color | hex | ffffff | 주요 텍스트 색상 (곡명 등) |
| secondary | hex | b3b3b3 | 보조 텍스트 색상 (아티스트, 시간) |
| accent | hex | 1DB954 | 강조색 (progress bar, equalizer, status 라벨) |

**커스텀 테마 예시:**
```
/api/spotify/playing/{token}?bg=0d1117&color=e6edf3&secondary=8b949e&accent=58a6ff&radius=8
```

---

### `GET /spotify/playing/:token`

SVG 이미지를 반환합니다. GitHub README의 `<img>` 태그에 사용합니다.

| 항목 | 값 |
|------|-----|
| Auth | 없음 (위젯 토큰) |
| Response | `image/svg+xml` |
| Cache | `no-cache, no-store, must-revalidate` |

**사용 예시:**
```markdown
![Now Playing](https://hub.gumyo.net/api/spotify/playing/a1b2c3d4e5f67890)
```

**커스텀 테마 적용:**
```markdown
![Now Playing](https://hub.gumyo.net/api/spotify/playing/a1b2c3d4e5f67890?bg=0d1117&accent=58a6ff)
```

SVG에 포함되는 정보:
- 앨범 아트 (base64 인코딩)
- 곡명, 아티스트명, 앨범명
- 이퀄라이저 애니메이션 (CSS `@keyframes`, 재생 중일 때만)

---

### `GET /spotify/playing/:token/widget`

HTML 위젯을 반환합니다. 블로그 `<iframe>`에 사용합니다.

| 항목 | 값 |
|------|-----|
| Auth | 없음 (위젯 토큰) |
| Response | `text/html` |
| Cache | `no-cache` |

**사용 예시:**
```html
<iframe src="https://hub.gumyo.net/api/spotify/playing/a1b2c3d4e5f67890/widget"
        width="480" height="140" frameborder="0"></iframe>
```

**커스텀 테마 적용:**
```html
<iframe src="https://hub.gumyo.net/api/spotify/playing/a1b2c3d4e5f67890/widget?bg=0d1117&color=e6edf3&accent=58a6ff"
        width="480" height="140" frameborder="0"></iframe>
```

HTML 위젯 특징:
- 완전한 HTML 문서 (인라인 CSS/JS, 외부 의존성 없음)
- JS가 `/data` 엔드포인트를 5초마다 polling
- 클라이언트 사이드 progress bar 보간 (200ms 간격)
- CSS 기반 이퀄라이저 애니메이션

---

### `GET /spotify/playing/:token/data`

JSON 데이터를 반환합니다. HTML 위젯의 polling 대상입니다.

| 항목 | 값 |
|------|-----|
| Auth | 없음 (위젯 토큰) |
| Response | `application/json` |
| Cache | `no-cache` |
| CORS | `Access-Control-Allow-Origin: *` |

**Response 200 (재생 중):**
```json
{
  "success": true,
  "data": {
    "isPlaying": true,
    "track": {
      "name": "Bohemian Rhapsody",
      "artist": "Queen",
      "album": "A Night at the Opera",
      "albumArt": "https://i.scdn.co/image/...",
      "externalUrl": "https://open.spotify.com/track/...",
      "durationMs": 354000,
      "progressMs": 120000
    },
    "lastPlayedAt": null
  }
}
```

**Response 200 (미재생):**
```json
{
  "success": true,
  "data": {
    "isPlaying": false,
    "track": null,
    "lastPlayedAt": null
  }
}
```

---

## 에러 코드

| 코드 | HTTP | 설명 |
|------|------|------|
| UNAUTHORIZED | 401 | 인증이 필요합니다 |
| SPOTIFY_ACCOUNT_NOT_FOUND | 404 | Spotify 계정을 찾을 수 없습니다 |
| SPOTIFY_ACCOUNT_ALREADY_EXISTS | 409 | 이미 연결된 Spotify 계정입니다 |
| SPOTIFY_OAUTH_STATE_INVALID | 400 | OAuth state가 유효하지 않습니다 |
| SPOTIFY_OAUTH_EXCHANGE_FAILED | 502 | OAuth 토큰 교환에 실패했습니다 |
| SPOTIFY_API_ERROR | 502 | Spotify API 호출에 실패했습니다 |
| SPOTIFY_KEY_INVALID | 401 | Spotify API 키가 유효하지 않습니다 |
| SPOTIFY_WIDGET_TOKEN_NOT_FOUND | 404 | Spotify 위젯 토큰을 찾을 수 없습니다 |
| SPOTIFY_WIDGET_TOKEN_INACTIVE | 403 | Spotify 위젯 토큰이 비활성화되었습니다 |
| VALIDATION_ERROR | 400 | 요청 데이터가 유효하지 않습니다 |

**에러 응답 형식:**
```json
{
  "success": false,
  "error": {
    "code": "SPOTIFY_KEY_INVALID",
    "message": "Spotify API 키가 유효하지 않습니다"
  }
}
```

---

## 프론트엔드 연동 플로우

### Spotify 계정 연동
```
1. 사용자가 "Spotify 연결" 버튼 클릭
2. → GET /api/spotify/accounts/connect?redirect={현재페이지URL}
3. → Spotify 로그인/권한 동의 페이지
4. → 콜백 처리 후 {현재페이지URL}?success=true&spotifyUserId=xxx 로 리다이렉트
5. → 프론트에서 success 쿼리 파라미터 확인 후 계정 목록 새로고침
```

### Now Playing 위젯 (Widget Token — GitHub README)
```markdown
![Now Playing](https://hub.gumyo.net/api/spotify/playing/{token})

<!-- 커스텀 테마 (GitHub Dark) -->
![Now Playing](https://hub.gumyo.net/api/spotify/playing/{token}?bg=0d1117&color=e6edf3&secondary=8b949e&accent=58a6ff&radius=8)
```

### Now Playing 위젯 (Widget Token — 블로그 iframe)
```html
<iframe src="https://hub.gumyo.net/api/spotify/playing/{token}/widget"
        width="480" height="140" frameborder="0"></iframe>

<!-- 커스텀 테마 -->
<iframe src="https://hub.gumyo.net/api/spotify/playing/{token}/widget?bg=ffffff&color=000000&secondary=666666&accent=1DB954&radius=16"
        width="480" height="140" frameborder="0"></iframe>
```

### Now Playing 위젯 (API Key — 커스텀 UI)
```typescript
const res = await fetch('https://hub.gumyo.net/api/spotify/now-playing', {
  headers: { 'X-Spotify-Key': 'your-api-key-here' },
})
const { data } = await res.json()

if (data.isPlaying) {
  console.log(`${data.track.name} - ${data.track.artist}`)
} else if (data.track) {
  console.log(`Last played: ${data.track.name}`)
}
```

### Now Playing 위젯 (세션)
```typescript
const res = await clientFetch('/spotify/now-playing?accountId=1')
```



