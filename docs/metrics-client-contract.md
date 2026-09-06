# metrics 수집 클라이언트 계약 (machboard 에이전트·ESP32)

> 기준: 2026-09-07 (fix/audit-batch3-serverless @ 워킹트리 미커밋 변경) 코드 검증. 다루는 코드: `dto/metrics/ingest.ts`(`metricsIngestSchema`·`metricsIngestBatchSchema`), `dto/metrics/token.ts`, `dto/metrics/query.ts`(`metricsSeriesQuerySchema`), `compose/metrics.ts`(`buildSeriesPipeline`), `route/metrics/ingest.ts`, `middleware/require-metrics-token.ts`, `service/domain/metrics/token.ts`(rate limit)·`service/domain/metrics/log.ts`(online 판정), `lib/error-code.ts`·`lib/error.ts`. 서버 저장·조회 설계는 [domains/metrics.md](./domains/metrics.md).

> machboard 클라이언트(Tauri 데스크톱 / headless 데몬 / ESP32)는 **별도 레포**(`~/machboard`, 설계 정본 그쪽 `docs/design.md`)에 있으므로, b-hub 서버가 기대하는 **수집 계약**을 여기에 명세한다.
> ESP32 등 임베디드 클라이언트도 동일 계약을 따른다(전송량이 작을 뿐 필드·에러·재시도 규약 동일).

---

## 1. 전송

| 용도 | 엔드포인트 | 헤더 | 비고 |
|------|-----------|------|------|
| 단건 | `POST /api/metrics/ingest` | `Authorization: Bearer <token>` **또는** `X-Metrics-Token: <token>` | `{ ...event }` |
| 배치(권장) | `POST /api/metrics/ingest/batch` | 상동 | `{ "events": [ ... ] }`, **최대 50건** |

- **인증 헤더는 2종 중 택1**: `Authorization: Bearer <token>` 를 먼저 보고, 없으면 `X-Metrics-Token` 을 읽는다(`middleware/require-metrics-token.ts`). 토큰은 어드민이 `/admin/metrics/tokens`(또는 admin scope 로 `POST /api/metrics/tokens`)에서 발급하며 **평문은 발급 1회만** 표시된다.
- 수집은 **`client` scope 토큰으로 충분**하다(admin scope 토큰도 수집 가능). scope 는 발급 시 결정한다.
- 성공 시 `200` + `{ "success": true, "data": { "count": <n> } }`(단건·배치 공통, `count` = 저장된 이벤트 수).
- 배치는 스키마상 **1~50건**(빈 배열 → `400`). 50건 초과 시 서버는 **`413 METRICS_BATCH_TOO_LARGE`** → 클라이언트는 배치를 분할(권장: 절반)해 재전송.
- **payload 크기 제한**: 이벤트별 `payload` JSON 직렬화 결과의 **UTF-8 바이트 길이**가 **64KB(`METRICS_PAYLOAD_MAX_BYTES`=65536) 초과 시 `413 METRICS_PAYLOAD_TOO_LARGE`**. 서버는 `Buffer.byteLength(JSON.stringify(payload))` 로 잰다 — 문자 수가 아니므로 한글·이모지처럼 멀티바이트 문자가 많으면 같은 글자 수라도 더 빨리 상한에 닿는다. 배치는 각 이벤트를 개별 검사한다.
- **rate limit**: 토큰당 **rolling 24h 이벤트 수 < `dailyLimit`(기본 20000)**. 초과 시 **`429 METRICS_TOKEN_RATE_LIMIT`**. 카운트는 저장된 `metrics_logs` 의 `tokenId` 기준(Mongo 집계)이다.
- **요청 본문 크기 제한**(2026-09-07 3차 배치 신설): 단건 `/ingest` 는 본문 **128KB**, 배치 `/ingest/batch` 는 **4MB** 를 넘으면 DTO 파싱 전에 각각 `413 METRICS_PAYLOAD_TOO_LARGE`·`413 METRICS_BATCH_TOO_LARGE` 로 끊긴다(`errorResponse` 봉투). payload 64KB × 최대 50건이면 약 3.2MB 라 정상 클라이언트에는 여유가 있다. 대응은 아래 413 표와 같다(단건 축소 / 배치 분할).
- **검사 순서**: 토큰 인증(401) → rate limit(429) → **요청 본문 크기(413)** → 바디 검증(400) → payload/배치 크기(413).

## 2. 이벤트 필드 (`dto/metrics/ingest.ts` 의 `metricsIngestSchema`)

| field | 필수 | 규칙 / 예시 |
|-------|:---:|------|
| `deviceId` | ✅ | 디바이스 고유 식별자, 1~64자. 디바이스 upsert·시계열·다운 감지의 키(예: 머신 UUID / `WiFi.macAddress()`) |
| `hostname` | | ≤255자 |
| `os` | | ≤64자 (예: `macOS 15.2` / `esp32`) |
| `arch` | | ≤32자 (예: `arm64`) |
| `agentVersion` | | ≤64자 (예: `machboard-agent@0.3.0`) |
| `intervalSec` | | 양의 정수, ≤86400. **전송 주기(초)** — 서버 다운 감지 임계 계산에 쓰인다(아래 §4) |
| `payload` | ✅ | 자유 JSON 객체(`Record<string, unknown>`). CPU/메모리/디스크/네트워크 등 수치·상태를 담는다 |

- 필드 길이/타입 위반은 **`400`**(standard-validator). 배치 래퍼는 `{ "events": [ ... ] }`, `events` 는 **최소 1건**.
- **메타(`hostname`/`os`/`arch`/`agentVersion`/`intervalSec`)는 최초 1회만 보내도 된다**: 서버 `upsertDevice` 가 null 메타를 `$setOnInsert` 로만 처리해 **기존 등록값을 null 로 덮지 않는다**. 다만 값이 바뀌면(버전 업 등) 다시 실어 보내면 갱신된다.
- `payload` 안의 **수치 필드만 시계열 조회 대상**이다: 서버 `series` 는 `payload.<field>` 가 number 인 문서만 집계한다(dot-path, 예 `cpu.usage`). 문자열/객체 값은 시계열에 안 잡히므로, 그래프로 볼 지표는 payload 에 number 로 넣는다.
- **배열 인덱스 경로도 조회된다**: `field` 는 `^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$`(≤128자, `dto/metrics/query.ts:14-18`)라 숫자 세그먼트를 허용하며, 서버가 `cpu.cores.0.usage` 같은 경로를 배열 인덱스(`$arrayElemAt`)와 숫자 키 객체 양쪽으로 해석한다. 즉 `payload.cpu.cores` 를 배열로 보내도 코어별 시계열을 뽑을 수 있다.

## 3. 에러 응답과 재시도 정책

| 상태 | 코드 | 클라이언트 처리 |
|------|------|------|
| 401 | `METRICS_TOKEN_INVALID` | 토큰 무효/폐기/만료. **재시도 금지** — 토큰 재발급·재설정 필요, 로컬 알림 |
| 403 | `METRICS_TOKEN_FORBIDDEN` | client scope 토큰으로 admin 전용 API 호출(수집에는 발생 안 함) |
| 429 | `METRICS_TOKEN_RATE_LIMIT` | 일일 한도 초과. 전송 주기를 늘리거나 다음 창까지 대기(지수 backoff) |
| 413 | `METRICS_PAYLOAD_TOO_LARGE` | payload 축소(필드 정리) 후 재전송. 반복되면 drop |
| 413 | `METRICS_BATCH_TOO_LARGE` | 배치를 **절반으로 분할**해 재전송 |
| 400 | (issue 배열) | 스키마/길이 위반. **재시도해도 같은 실패이므로 재인큐하지 말고 drop + 로컬 카운터** |
| 5xx / 네트워크 | — | 서버·전송 실패. **지수 backoff 로 재인큐** |

- **오프라인/실패 버퍼**: 전송 실패분은 로컬 버퍼(RAM/디스크)에 적재하고 복구 시 batch flush(≤50, 오래된 것부터). 포화 시 가장 오래된 것부터 drop.
- **`400` 은 봉투 형식이 다르다**: 도메인 에러(401/403/413/429)는 `{ "success": false, "error": { "code", "message" } }` 이지만, **`400`(스키마 검증 실패)은 `error` 가 issue 배열**(`{ "success": false, "error": [ … ], "data": {…} }`) 이다(zod 4·hono-openapi 1 전환 결과). 클라이언트는 `400` 을 "고쳐도 그대로 실패"로 취급해 재인큐하지 않는다.

## 4. 온라인/오프라인 판정의 의미

서버는 어드민 조회(`GET /api/metrics/devices`) 시점에 디바이스 online 여부를 계산한다(별도 감시 크론·푸시 알림 없음 — 2026-07-22 사용자 결정으로 제거). **클라이언트가 조율할 지점은 `intervalSec` 하나다.**

- **online 판정**: `now - lastSeenAt < max(3 × intervalSec, 5분)`. 즉 클라이언트가 보낸 `intervalSec` 의 **3배(최소 300초)** 동안 아무 이벤트도 안 오면 그 디바이스는 **오프라인**으로 표시된다(`intervalSec` 미전송 시 기본 60초 → 임계 300초).
- **클라이언트 함의**: 실제 전송 주기와 `intervalSec` 을 일치시킨다. 주기보다 큰 값을 보내면 오프라인 표시가 둔해지고, 작은 값을 보내면 일시적 지연에도 오프라인 오탐이 잦아진다. 전송 주기를 바꾸면 `intervalSec` 도 함께 갱신해 보낸다.

## 5. 참고 — 최소 이벤트 예시 (비계약, 형태 예시)

```json
{
  "deviceId": "a1b2c3d4-...",
  "hostname": "demo-mbp",
  "os": "macOS 15.2",
  "arch": "arm64",
  "agentVersion": "machboard-agent@0.3.0",
  "intervalSec": 60,
  "payload": { "cpu": { "usage": 12.4 }, "mem": { "usedMb": 9123 }, "disk": { "usedPct": 62.1 } }
}
```

> `payload` 스키마는 서버가 강제하지 않는다(자유 JSON). 시계열로 조회할 지표는 number 로, dot-path(`cpu.usage` 등)로 접근 가능하게 둔다.
