# Weather API

Base URL: `https://hub.gumyo.net/api`

모든 Weather API 요청에는 `X-Weather-Key` 헤더가 필요하다.

```
X-Weather-Key: <발급받은 키>
```

---

## 1. API Key 관리

세션 인증(로그인) 필요.

### GET /weather/keys

키 목록 조회.

**Response**

```json
{
    "success": true,
    "data": [
        {
            "id": 1,
            "name": "my-app",
            "dailyLimit": 1000,
            "todayUsage": 42,
            "expiresAt": null,
            "lastUsedAt": "2026-03-07T12:00:00.000Z",
            "createdAt": "2026-01-01T00:00:00.000Z"
        }
    ]
}
```

### POST /weather/keys

키 발급. 발급 시 1회만 키 값을 확인할 수 있다.

**Body**

```json
{ "name": "my-app" }
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| name | string | X | 키 이름 (최대 100자) |

**Response**

```json
{ "success": true, "data": { "key": "abc123..." } }
```

### DELETE /weather/keys/:id

키 삭제.

### PATCH /weather/keys/:id/limit (Admin)

일일 한도 수정.

**Body**

```json
{ "dailyLimit": 5000 }
```

---

## 2. 날씨 조회

### 공통 Query Parameters

날씨 조회 엔드포인트(`/current`, `/ultra-short`, `/short-term`)는 동일한 좌표 파라미터를 사용한다.

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| nx | int | 조건부 | 격자 X 좌표 (1~149) |
| ny | int | 조건부 | 격자 Y 좌표 (1~253) |
| location | string | 조건부 | 지역명 검색 (예: "서울", "강남구") |

`nx`+`ny` 또는 `location` 중 하나를 반드시 제공해야 한다.

---

### GET /weather/current

초단기실황 - 현재 관측값.

**Response**

```json
{
    "success": true,
    "data": {
        "gridX": 60,
        "gridY": 127,
        "baseDate": "20260307",
        "baseTime": "1200",
        "temperature": 5.2,
        "humidity": 65,
        "rainfall": 0,
        "windDirection": 180,
        "windSpeed": 3.5,
        "windU": 1.2,
        "windV": -2.3,
        "windDirectionText": "S",
        "ptyText": "없음"
    }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| temperature | number | 기온 (C) |
| humidity | number | 습도 (%) |
| rainfall | number | 1시간 강수량 (mm) |
| windDirection | number | 풍향 (deg) |
| windSpeed | number | 풍속 (m/s) |
| windU | number | 동서바람성분 (m/s), 동(+) 서(-) |
| windV | number | 남북바람성분 (m/s), 북(+) 남(-) |
| windDirectionText | string | 16방위 (N, NNE, NE, ...) |
| ptyText | string | 강수형태 (없음/비/비눈/눈/빗방울/빗방울눈날림/눈날림) |

---

### GET /weather/ultra-short

초단기예보 - 현재 시점부터 6시간 이내 1시간 간격 예보.

**Response**

```json
{
    "success": true,
    "data": {
        "gridX": 60,
        "gridY": 127,
        "forecasts": [
            {
                "fcstDate": "20260307",
                "fcstTime": "1300",
                "temperature": 6.1,
                "humidity": 60,
                "sky": 1,
                "pty": 0,
                "rainfall": 0,
                "lightning": 0,
                "windDirection": 200,
                "windSpeed": 4.2,
                "skyText": "맑음",
                "ptyText": "없음",
                "windDirectionText": "SSW"
            }
        ]
    }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| fcstDate | string | 예보일자 (YYYYMMDD) |
| fcstTime | string | 예보시각 (HH00) |
| temperature | number | 기온 (C) |
| humidity | number | 습도 (%) |
| sky | number | 하늘상태 코드 (1: 맑음, 3: 구름많음, 4: 흐림) |
| pty | number | 강수형태 코드 (0: 없음, 1: 비, 2: 비/눈, 3: 눈, 5: 빗방울, 6: 빗방울눈날림, 7: 눈날림) |
| rainfall | number | 1시간 강수량 (mm) |
| lightning | number | 낙뢰 (kA) |
| windDirection | number | 풍향 (deg) |
| windSpeed | number | 풍속 (m/s) |
| skyText | string | 하늘상태 텍스트 |
| ptyText | string | 강수형태 텍스트 |
| windDirectionText | string | 16방위 |

---

### GET /weather/short-term

단기예보 - 최대 5일 예보.

**Response**

```json
{
    "success": true,
    "data": {
        "gridX": 60,
        "gridY": 127,
        "forecasts": [
            {
                "fcstDate": "20260307",
                "fcstTime": "0600",
                "temperature": 3,
                "tempMin": -2,
                "tempMax": 12,
                "humidity": 55,
                "sky": 1,
                "pty": 0,
                "pop": 10,
                "rainfall": "강수없음",
                "snowfall": "적설없음",
                "windDirection": 270,
                "windSpeed": 2.5,
                "skyText": "맑음",
                "ptyText": "없음",
                "windDirectionText": "W",
                "rainfallText": "강수없음",
                "snowfallText": "적설없음"
            }
        ]
    }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| fcstDate | string | 예보일자 (YYYYMMDD) |
| fcstTime | string | 예보시각 (HH00) |
| temperature | number \| null | 기온 (C) |
| tempMin | number \| null | 일 최저기온 (C), 해당 시간대에만 존재 |
| tempMax | number \| null | 일 최고기온 (C), 해당 시간대에만 존재 |
| humidity | number \| null | 습도 (%) |
| sky | number | 하늘상태 코드 |
| pty | number | 강수형태 코드 (0: 없음, 1: 비, 2: 비/눈, 3: 눈, 4: 소나기) |
| pop | number \| null | 강수확률 (%) |
| rainfall | string \| null | 강수량 범주 ("강수없음", "1mm 미만", "6.2mm", "30.0~50.0mm", "50.0mm 이상") |
| snowfall | string \| null | 적설량 범주 ("적설없음", "0.5cm 미만", "2.3cm", "5.0cm 이상") |
| windDirection | number | 풍향 (deg) |
| windSpeed | number | 풍속 (m/s) |
| rainfallText | string | 강수량 텍스트 |
| snowfallText | string | 적설량 텍스트 |

---

### GET /weather/version

예보 데이터 버전 조회. 데이터가 갱신되었는지 확인할 때 사용한다.

**Query Parameters**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| ftype | string | O | `ODAM` (초단기실황), `VSRT` (초단기예보), `SHRT` (단기예보) |

**Response**

```json
{
    "success": true,
    "data": {
        "filetype": "ODAM",
        "version": "20260307120015"
    }
}
```

---

## 3. Mock 날씨 조회

`/weather/mock/*` 엔드포인트는 실제 기상청 API를 호출하지 않고 랜덤 가짜 데이터를 반환한다. Rate limit에 카운팅되지 않는다.

| 실제 엔드포인트 | Mock 엔드포인트 |
|----------------|----------------|
| GET /weather/current | GET /weather/mock/current |
| GET /weather/ultra-short | GET /weather/mock/ultra-short |
| GET /weather/short-term | GET /weather/mock/short-term |
| GET /weather/version | GET /weather/mock/version |

요청 파라미터와 응답 구조는 실제 엔드포인트와 동일하다. API 키 검증은 수행하지만 호출 횟수를 차감하지 않으므로 개발/테스트 시 자유롭게 사용할 수 있다.

---

## 4. 위치/좌표

### GET /weather/locations

전체 행정구역 위치 목록.

**Response**

```json
{
    "success": true,
    "data": [
        {
            "code": "1100000000",
            "level1": "서울특별시",
            "level2": "종로구",
            "level3": "청운효자동",
            "gridX": 60,
            "gridY": 127,
            "longitude": 126.97,
            "latitude": 37.57
        }
    ]
}
```

### GET /weather/locations/:keyword

지역명으로 위치 검색.

```
GET /weather/locations/강남
```

### GET /weather/locations/convert

위경도 <-> 격자 좌표 변환.

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| lat + lon | number | 위경도 -> 격자 변환 |
| gridX + gridY | int | 격자 -> 위경도 변환 |

**위경도 -> 격자 Response**

```json
{
    "success": true,
    "data": {
        "gridX": 60,
        "gridY": 127,
        "nearestLocation": { "code": "...", "level1": "서울특별시", ... }
    }
}
```

**격자 -> 위경도 Response**

```json
{
    "success": true,
    "data": {
        "latitude": 37.57,
        "longitude": 126.97,
        "location": { "code": "...", "level1": "서울특별시", ... }
    }
}
```

---

## 5. 에러 코드

| 코드 | HTTP | 설명 |
|------|------|------|
| WEATHER_KEY_INVALID | 401 | API 키가 없거나 유효하지 않음 |
| WEATHER_KEY_RATE_LIMIT | 429 | 일일 요청 한도 초과 |
| WEATHER_INVALID_GRID | 400 | 좌표 파라미터가 잘못됨 |
| WEATHER_DATA_NOT_FOUND | 404 | 기상 데이터 없음 |
| WEATHER_KMA_API_ERROR | 502 | 기상청 외부 API 호출 실패 |

---

## 6. 권장 갱신 주기

기상청 API는 일정 시간마다 데이터를 발표한다. 프론트에서 데이터를 폴링할 때 아래 주기를 권장한다.

### 초단기실황 (`/weather/current`)

- **발표 주기**: 매시 정시 (하루 24회)
- **API 제공 시각**: 매시 10분 이후
- **권장 갱신 간격**: **1시간**
- 참고: 10분마다 최신 정보로 업데이트되지만, 큰 변화가 없으므로 1시간이면 충분

### 초단기예보 (`/weather/ultra-short`)

- **발표 주기**: 매시 30분 (하루 24회)
- **API 제공 시각**: 매시 45분 이후
- **예보 범위**: 발표 시점부터 6시간
- **권장 갱신 간격**: **1시간**
- 참고: 10분마다 업데이트 (기온, 습도, 바람)

### 단기예보 (`/weather/short-term`)

- **발표 주기**: 02, 05, 08, 11, 14, 17, 20, 23시 (하루 8회)
- **API 제공 시각**: 발표 후 10분 이후 (02:10, 05:10, ...)
- **예보 범위**: 최대 5일
- **권장 갱신 간격**: **3시간**

### 예보 버전 (`/weather/version`)

- 데이터 갱신 여부만 확인하는 용도
- 실제 데이터 호출 전에 버전을 비교하여 불필요한 호출을 줄일 수 있음
- 별도 주기적 폴링 불필요

### 하루 총 API 호출 수 (지점 1개 기준)

| API | 갱신 주기 | 하루 호출 수 |
|-----|-----------|-------------|
| 초단기실황 | 1시간 | 24 |
| 초단기예보 | 1시간 | 24 |
| 단기예보 | 3시간 | 8 |
| **합계** | | **56** |

### 기상청 데이터 코드 참고

**하늘상태 (SKY)**

| 코드 | 의미 | 전운량 |
|------|------|--------|
| 1 | 맑음 | 0~5 |
| 3 | 구름많음 | 6~8 |
| 4 | 흐림 | 9~10 |

**강수형태 (PTY)**

| 코드 | 초단기실황/초단기예보 | 단기예보 |
|------|----------------------|---------|
| 0 | 없음 | 없음 |
| 1 | 비 | 비 |
| 2 | 비/눈 | 비/눈 |
| 3 | 눈 | 눈 |
| 4 | - | 소나기 |
| 5 | 빗방울 | - |
| 6 | 빗방울눈날림 | - |
| 7 | 눈날림 | - |

**16방위 변환**

풍향값(deg)에서 16방위로 변환:

```
index = Math.round(deg / 22.5) % 16
방위 = [N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSW, SW, WSW, W, WNW, NW, NNW][index]
```
