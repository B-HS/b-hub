# 펌웨어 로깅 클라이언트 계약 (ESP32 등)

> ESP32 weather 펌웨어는 **별도 레포**에 있으므로, b-hub 서버가 기대하는 **수집 계약**을 여기에 명세한다.
> 이 문서를 기준으로 펌웨어 레포에서 `LOG_ERR` 매크로 + 링버퍼 + WiFi 복구 flush 를 구현한다.

---

## 1. 전송

| 용도 | 엔드포인트 | 헤더 | 비고 |
|------|-----------|------|------|
| 배치(권장) | `POST /api/logs/batch` | `X-Device-Key: <token>` | `{ "events": [ ... ] }`, **최대 50건** |
| 단건 | `POST /api/logs` | `X-Device-Key: <token>` | `{ ...event }` |

- 배치 50건 초과 시 서버는 **`413 LOG_BATCH_TOO_LARGE`** → 클라이언트는 배치를 분할(권장: 절반)해 재전송.
- 인증 실패 `401 LOG_DEVICE_KEY_INVALID`, 디바이스 24h 한도 초과 `429 LOG_DEVICE_KEY_RATE_LIMIT`.
- 디바이스 키는 어드민이 `POST /api/logs/device-keys` 로 발급(평문 1회 표시).

## 2. 이벤트 필드 (`dto/logs/log-event.ts` 의 `logEventIngestSchema`)

| field | 필수 | 예시 / 규칙 |
|-------|:---:|------|
| `service` | ✅ | `"esp32-weather"` (상수) |
| `errorCode` | ✅ | UPPER_SNAKE, `<SCOPE>_<AREA>_<CONDITION>` (예 `ESP_WIFI_DOWN`) |
| `severity` | | 이름(`"ERROR"`) 또는 숫자(40). 미지정 시 20(INFO) |
| `errorDescription` | | 사람이 읽는 메시지(최대 2000자) |
| `category` | | `network` / `parse` / `state` / `hardware` |
| `deviceId` | | `WiFi.macAddress()` |
| `firmwareVersion` | | 빌드 매크로(`esp32-weather@0.11.0` 또는 git SHA) |
| `source` | | 생략 가능(서버가 `device` 보정) |
| `correlationId` / `sessionId` | | boot 세션 UUID(재부팅마다 변경) |
| `retryCount` | | backoff 확인용 |
| `occurredAt` | | NTP 동기 후 ISO8601(KST). **미동기 시 생략** — 서버 `created_at` 이 권위 시각 |
| `details` | | 자유 JSON (`{ "device": { "heap_free":…, "wifi_rssi":… }, "http_status":500 }`) |

severity 척도: `DEBUG=10 / INFO=20 / WARN=30 / ERROR=40 / FATAL=50`.

## 3. 클라이언트 정책

- **Serial 로그는 전 레벨**(개발용). **원격 전송은 `severity >= WARN(30)`만**.
- 오프라인이면 **링버퍼(RAM 32~64 entry)** 에 적재, 포화 시 가장 오래된 것부터 drop → 다음 flush 때 `ESP_LOG_OVERFLOW` 1건으로 요약 전송.
- WiFi 복구 시 **batch flush**(≤50, 오래된 것부터). HTTP 실패 시 재인큐 + 지수 backoff, `413` 이면 배치 절반.
- **재귀 방지**: 로그 전송/직렬화 실패는 **다시 `LOG_ERR` 를 호출하지 않고** serial + 로컬 카운터만(로그 스톰 방지).

## 4. 매크로 예시 (비컴파일, 참고용)

```cpp
#define LOG_ERR(code, sev, desc, ...) \
  logEvent((sev), (code), (desc), __FILE__, __LINE__, ##__VA_ARGS__)

LOG_ERR("ESP_FETCH_FAILED", 40, "weatherFetchCurrent returned false",
        R"({"endpoint":"/weather/current","http_status":500})");
```

## 5. 에러 코드 레지스트리 (시작값)

| code | severity | 의미 |
|------|:---:|------|
| `ESP_WIFI_DOWN` | 40 | WiFi 연결 끊김 |
| `ESP_WIFI_RECONNECT_FAIL` | 40 | 재연결 실패 |
| `ESP_FETCH_FAILED` | 30 | weather fetch 실패 |
| `ESP_JSON_PARSE_FAIL` | 30 | 응답 파싱 실패 |
| `ESP_HEAP_LOW` | 30 | free heap < 임계값 |
| `ESP_LOG_OVERFLOW` | 20 | 링버퍼 포화로 일부 drop |

> 서버 측 사전 정의 코드(`WEATHER_*` 등)와 충돌하지 않도록 디바이스 코드는 `ESP_` 접두사를 유지한다.
