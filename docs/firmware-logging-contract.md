# 펌웨어 로깅 클라이언트 계약 (ESP32 등)

> 기준: 2026-09-07 (fix/audit-batch3-serverless @ 워킹트리 미커밋 변경) 코드 검증. 다루는 코드: `dto/logs/log-event.ts`(`logEventIngestSchema`·`SEVERITY`), `route/logs/log-event.ts`, `route/logs/device-key.ts`, `middleware/require-device-key.ts`, `service/domain/logs/device-key.ts`(레이트리밋), `lib/error-code.ts`·`lib/error.ts`. 저장 스키마·서버 자동 캡처는 [logging.md](./logging.md).

> ESP32 weather 펌웨어는 **별도 레포**에 있으므로, b-hub 서버가 기대하는 **수집 계약**을 여기에 명세한다.
> 이 문서를 기준으로 펌웨어 레포에서 `LOG_ERR` 매크로 + 링버퍼 + WiFi 복구 flush 를 구현한다.

---

## 1. 전송

| 용도 | 엔드포인트 | 헤더 | 비고 |
|------|-----------|------|------|
| 배치(권장) | `POST /api/logs/batch` | `X-Device-Key: <token>` | `{ "events": [ ... ] }`, **최대 50건** |
| 단건 | `POST /api/logs` | `X-Device-Key: <token>` | `{ ...event }` |

- 성공 시 `200` + `{ "success": true, "data": { "id": <n> } }`(단건) / `{ "success": true, "data": { "count": <n> } }`(배치).
- 배치는 스키마상 **1~50건**(빈 배열 → `400`). 50건 초과 시 서버는 **`413 LOG_BATCH_TOO_LARGE`** → 클라이언트는 배치를 분할(권장: 절반)해 재전송.
- **요청 본문 크기 제한**(2026-09-07 3차 배치 신설): `POST /api/logs`·`/api/logs/batch` 모두 본문이 **1MB** 를 넘으면 DTO 파싱 전에 `413 LOG_BATCH_TOO_LARGE` 로 끊긴다(`errorResponse` 봉투). 50건 배치라도 이벤트당 평균 20KB 이하면 여유가 있다 — 대응은 기존 413 과 같이 **배치 절반 분할**이다.
- 인증 실패 `401 LOG_DEVICE_KEY_INVALID`, 디바이스 24h 한도 초과 `429 LOG_DEVICE_KEY_RATE_LIMIT`. **검사 순서: 디바이스 키(401·429) → 요청 본문 크기(413) → 바디 검증(400) → 배치 크기(413).**
- 한도는 **키의 디바이스 식별자당 rolling 24h 이벤트 수 < `dailyLimit`(기본 2000)**. 식별자는 `resolveDeviceIdentity`(`service/domain/logs/device-key.ts:12`) = 키의 `device_id`, **없으면 `key:<키 id>`** 다. 카운트는 저장된 `log_events.device_id` 기준이며, 저장 값도 이 식별자로 강제되므로 `deviceId` 없이 발급된 키도 한도가 적용된다.
- 스키마/필드 길이 위반은 **`400`**(standard-validator). **`400` 은 재시도해도 같은 실패이므로 재인큐하지 말고 drop + 로컬 카운터**(로그 스톰 방지). 도메인 에러(401/413/429)는 봉투 `{ "success": false, "error": { "code", "message" } }` 형식이지만, **`400` 은 `error` 가 issue 배열**(`{ "success": false, "error": [ … ], "data": {…} }`) 로 형식이 다르다 — zod 4·hono-openapi 1 전환 결과, 전체 대조는 [quality-assurance/fe-deps-impact-check.md](./quality-assurance/fe-deps-impact-check.md).
- 디바이스 키는 어드민이 `POST /api/logs/device-keys` 로 발급(평문 1회 표시).
- **저장되는 `deviceId` 는 요청 본문이 아니라 키에서 온다.** `route/logs/log-event.ts` 가 단건·배치 모두 `{ ...event, deviceId }`(미들웨어가 컨텍스트에 넣은 키 식별자)로 덮어쓰므로, 본문의 `deviceId` 는 반영되지 않는다. 배치 크기 사전 검사는 종전대로 50건 초과 시 `413`.

## 2. 이벤트 필드 (`dto/logs/log-event.ts` 의 `logEventIngestSchema`)

| field | 필수 | 예시 / 규칙 |
|-------|:---:|------|
| `service` | ✅ | `"esp32-weather"` (상수) |
| `errorCode` | ✅ | UPPER_SNAKE, `<SCOPE>_<AREA>_<CONDITION>` (예 `ESP_WIFI_DOWN`) |
| `severity` | | 이름(`"ERROR"`) 또는 숫자(0–100 정수, 예 40). 미지정 시 20(INFO) |
| `errorDescription` | | 사람이 읽는 메시지(최대 2000자) |
| `category` | | `network` / `parse` / `state` / `hardware` |
| `deviceId` | | **서버가 무시한다** — 저장 값은 키의 식별자(`device_key.device_id`, 없으면 `key:<키 id>`)로 덮어쓴다. 기기별 구분이 필요하면 키를 기기마다 발급한다 |
| `firmwareVersion` | | 빌드 매크로(`esp32-weather@0.11.0` 또는 **short git SHA** — 전체 40자 SHA 는 32자 제한 초과 → `400`) |
| `source` | | 생략 가능(서버가 `device` 보정) |
| `correlationId` / `sessionId` | | boot 세션 UUID(재부팅마다 변경) |
| `retryCount` | | backoff 확인용 |
| `occurredAt` | | NTP 동기 후 ISO8601, **타임존 오프셋 포함**(예 `…+09:00`/`…Z` — `coerce.date` 라 오프셋 없으면 서버 로컬로 해석돼 오차). **미동기 시 생략** — 서버 `created_at` 이 권위 시각 |
| `details` | | 자유 JSON (`{ "device": { "heap_free":…, "wifi_rssi":… }, "http_status":500 }`) |

severity 척도: `DEBUG=10 / INFO=20 / WARN=30 / ERROR=40 / FATAL=50`.

필드 길이 제약(초과 시 `400`): `service`·`errorCode`·`category`·`deviceId` ≤64자, `firmwareVersion`·`source` ≤32자, `correlationId`·`sessionId` ≤36자(UUID), `errorDescription` ≤2000자.

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
