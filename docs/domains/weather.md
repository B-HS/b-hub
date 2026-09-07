# weather 도메인

> 기준: 2026-09-07 (fix/audit-batch4-performance @ 4차 배치 커밋분) 코드 검증. 다루는 코드: `dto/weather/*`, `route/weather/*`, `service/domain/weather/*`, `compose/weather.ts`, `middleware/require-weather-key.ts`, `masterdata/locations.json`, `db/schema.ts`(weather_*), `service/shared/redis-cache.ts`, `service/shared/redis-client.ts`

## 개요

- 기상청(KMA) 공공데이터 `VilageFcstInfoService_2.0` 를 프록시하여 현재 날씨·초단기예보·단기예보·예보 버전을 제공하는 도메인.
- 소비자는 주로 ESP32 날씨 펌웨어(외부 레포)와 웹 클라이언트. 디바이스/클라이언트는 사용자가 발급한 **Weather API 키**(`X-Weather-Key` 헤더)로 인증한다.
- 외부 의존:
  - KMA API — `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0`, 서비스키는 `env.KMA_API_KEY`. (`service/domain/weather/kma-api.ts`)
  - 위경도↔격자 변환은 KMA Lambert Conformal Conic 공식을 자체 구현(외부 호출 없음). (`service/domain/weather/grid-converter.ts`)
  - 캐시는 Redis(`ioredis`) + 인메모리 fallback. (`service/shared/redis-cache.ts`)
  - 행정구역-격자 매핑은 정적 JSON 마스터데이터. (`masterdata/locations.json`)

## 파일 맵

| 파일 | 역할 |
|------|------|
| `dto/weather/weather.ts` | 날씨 조회 요청/응답 Zod 스키마 (`coordinatesQuerySchema`, `versionQuerySchema`, `currentWeatherResponseSchema`, `ultraForecastResponseSchema`, `shortForecastResponseSchema`, `versionResponseSchema`) |
| `dto/weather/location.ts` | 위치/좌표변환 스키마 (`locationSchema`+`LocationData` 타입, `convertQuerySchema`, `latLonConvertResponseSchema`, `gridConvertResponseSchema`) |
| `dto/weather/weather-api-key.ts` | 키 발급/한도수정/응답 스키마 (`createWeatherKeyBodySchema`, `updateWeatherKeyLimitBodySchema`, `weatherKeyResponseSchema`) |
| `route/weather/weather.ts` | 실데이터 조회 라우트(`/current`·`/ultra-short`·`/short-term`·`/version`). `requireWeatherKey` 적용 |
| `route/weather/location.ts` | 위치 목록/검색/좌표변환 라우트(`/`·`/convert`·`/:keyword`). `requireWeatherKey` 적용. 목록은 ETag·`Cache-Control`·304 조건부 응답 |
| `route/weather/mock.ts` | 실데이터와 동일 인터페이스의 Mock 라우트. `requireWeatherKeyNoLog` 적용(로그·한도 없음). **`route/index.ts` 가 `NODE_ENV !== 'production'` 일 때만 `/weather/mock` 을 마운트** — 프로덕션에는 존재하지 않는다(2026-07-10 보안 게이트) |
| `route/weather/key.ts` | Weather API 키 CRUD 라우트. 세션(`withAuth`)/관리자(`withAdmin`) 인증 |
| `service/domain/weather/kma-api.ts` | KMA API 호출·재시도·에러매핑·base time 계산(`getKmaBaseDateTime` — 라우트도 쓰도록 export)·Redis 캐싱 (`createKmaApiService`) |
| `service/domain/weather/mock-kma-api.ts` | `KmaApiService` 인터페이스를 만족하는 난수 Mock (`createMockKmaApiService`) |
| `service/domain/weather/grid-converter.ts` | 위경도↔격자 변환 순수 함수 (`latLonToGrid`, `gridToLatLon`) |
| `service/domain/weather/location.ts` | 마스터데이터 기반 위치 검색/격자·좌표 조회 (`createLocationService`, 공간 인덱스) |
| `service/domain/weather/weather-data.ts` | KMA 원자료 파싱·코드 텍스트화 (`parseCurrentWeather`, `parseUltraForecasts`, `parseShortForecasts` 등) |
| `service/domain/weather/weather-api-key.ts` | 키 발급/검증/한도/로그 서비스 (`createWeatherApiKeyService`, Drizzle 직접 접근) |
| `compose/weather.ts` | DI 조립. `kmaApi`·`mockKmaApi`·`locationService`·`weatherApiKeyService` 반환 |
| `middleware/require-weather-key.ts` | `X-Weather-Key` 검증 미들웨어 (`requireWeatherKey`=검증+한도+로그, `requireWeatherKeyNoLog`=검증만) |
| `masterdata/locations.json` | 행정구역-격자 매핑 정적 데이터(약 3,834개 항목) |
| `tests/…/weather*` | 아래 [테스트](#테스트) 참조 |

> `compose/weather.ts` 는 `service/domain/weather/weather-data.ts` 를 직접 조립하지 않는다. 파싱 함수는 `route/weather/weather.ts`·`route/weather/mock.ts` 가 직접 import 한다.

## 데이터 모델

`db/schema.ts` 기준(물리 테이블명). 컬럼 상세/전체 스키마는 [../reference/db-schema.md](../reference/db-schema.md) 참조.

| 테이블 | 용도 | 핵심 컬럼 | 인덱스 |
|------|------|------|------|
| `weather_api_key` | 발급된 Weather API 키 | `user_id`(FK `user`, cascade), `token`(sha256 해시, unique 64), `name`, `daily_limit`(기본 100), `expires_at`, `last_used_at`, `created_at` | `idx_weather_api_key_user`(user_id) |
| `weather_api_log` | 키별 요청 로그(한도 산정 소스) | `key_id`(FK, set null), `user_id`(FK, set null), `endpoint`, `nx`/`ny`, `status_code`, `ip`, `user_agent`, `duration_ms`, `error_code`, `created_at` | `idx_weather_api_log_user`(user_id), `idx_weather_api_log_key_created`(key_id, created_at), `idx_weather_api_log_created`(created_at — 보존 삭제용, 4차 감사 P-02 추가. **`db:push` 필요**) |
| `weather_current` | (정의됨, 런타임 미기록) | `nx`,`ny`,`base_date`,`base_time`,`category`,`obsr_value`,`created_at` | `idx_weather_current_grid`(nx,ny,base_date,base_time) |
| `weather_ultra` | (정의됨, 런타임 미기록) | + `fcst_date`,`fcst_time`,`fcst_value` | `idx_weather_ultra_grid` |
| `weather_short` | (정의됨, 런타임 미기록) | + `fcst_date`,`fcst_time`,`fcst_value` | `idx_weather_short_grid` |

- 셀렉트 타입: `WeatherApiKey = typeof weatherApiKey.$inferSelect` (`db/schema.ts`).
- `weather_current`/`weather_ultra`/`weather_short` 는 스키마에 존재하나, 현재 조회 경로는 Redis 캐싱(아래 [핵심 흐름](#핵심-흐름))을 쓴다. 이 세 테이블에 write 하는 코드는 없고 `page/admin/db.ts` 의 카운트/격자별 삭제 조회에서만 참조된다.
- `weather_api_log.nx`/`ny` 는 컬럼만 존재하고 `requireWeatherKey` 의 `logRequest` 호출이 nx/ny 를 넘기지 않아 항상 `null` 로 기록된다.

## API 엔드포인트

`route/index.ts` 마운트 + `index.ts` 의 `app.route('/api', api)` 기준. 전체 경로는 `/api` 접두사 포함.

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/api/weather/current` | `X-Weather-Key`(로그·한도) | 현재 날씨(초단기실황, `getUltraSrtNcst`) |
| GET | `/api/weather/ultra-short` | `X-Weather-Key`(로그·한도) | 초단기예보(`getUltraSrtFcst`) |
| GET | `/api/weather/short-term` | `X-Weather-Key`(로그·한도) | 단기예보(`getVilageFcst`) |
| GET | `/api/weather/version` | `X-Weather-Key`(로그·한도) | 예보 버전(`ftype`=`ODAM`\|`VSRT`\|`SHRT`) |
| GET | `/api/weather/locations` | `X-Weather-Key`(로그·한도) | 전체 위치 목록. **`ETag` + `Cache-Control: private, max-age=3600`** 를 싣고, 요청 `If-None-Match` 가 같으면 본문 없이 **304** |
| GET | `/api/weather/locations/convert` | `X-Weather-Key`(로그·한도) | 좌표 변환(`lat`+`lon` 또는 `gridX`+`gridY`) |
| GET | `/api/weather/locations/:keyword` | `X-Weather-Key`(로그·한도) | 위치 검색(level1/2/3 부분일치) |
| GET | `/api/weather/mock/current` | `X-Weather-Key`(무로그·무한도) | 현재 날씨 Mock (비프로덕션 전용) |
| GET | `/api/weather/mock/ultra-short` | `X-Weather-Key`(무로그·무한도) | 초단기예보 Mock (비프로덕션 전용) |
| GET | `/api/weather/mock/short-term` | `X-Weather-Key`(무로그·무한도) | 단기예보 Mock (비프로덕션 전용) |
| GET | `/api/weather/mock/version` | `X-Weather-Key`(무로그·무한도) | 예보 버전 Mock (비프로덕션 전용) |
| GET | `/api/weather/keys` | 세션(`withAuth`) | 본인 키 목록(+24h 사용량) |
| POST | `/api/weather/keys` | 세션(`withAuth`) | 키 발급, **평문 키 1회만 반환** |
| DELETE | `/api/weather/keys/:id` | 세션(`withAuth`) | 본인 키 삭제(user_id 스코프) |
| PATCH | `/api/weather/keys/:id/limit` | 관리자(`withAdmin`) | 키 일일 한도 수정 |

- 조회 라우트 좌표 쿼리(`coordinatesQuerySchema`): `nx`(1–149)+`ny`(1–253) 우선, 없으면 `location`(문자열) 검색 첫 결과의 격자 사용, 둘 다 없으면 `WEATHER_INVALID_GRID`(400).
- `/locations/convert` 는 zod validator 없이 `c.req.query` 로 `lat`/`lon`/`gridX`/`gridY` 를 직접 읽는다.

## 핵심 흐름

### 1. 날씨 조회 (`GET /api/weather/current` 예시)

1. `requireWeatherKey`(`middleware/require-weather-key.ts`): `X-Weather-Key` 헤더 → `weatherApiKeyService.validate`(sha256 해시 비교, 만료 확인) → `checkRateLimit`(24h 롤링 윈도우 로그 수 < `dailyLimit`). 실패 시 `WEATHER_KEY_INVALID`(401)/`WEATHER_KEY_RATE_LIMIT`(429). **두 단계가 요청당 SELECT 1회로 합쳐진다** — `validate` 가 키 행과 24h 사용량을 상관 서브쿼리로 함께 읽고, 그 값을 `checkRateLimit` 이 받아쓴다(아래 §4).
2. `route/weather/weather.ts` `resolveCoordinates` 로 격자(`gridX`,`gridY`) 확정. `location` 만 온 경우 `locationService.search` 첫 결과 사용.
3. `kmaApi.getUltraSrtNcst(nx, ny)` 호출:
   - `getKmaBaseDateTime('ncst')` 로 KST(`nowMs + KST_OFFSET_MS`, UTC getter) 기준 base date/time 산출.
   - `redisCache.get(cacheKey)` 히트 시 즉시 반환, 미스 시 KMA 호출(`fetchWithRetry`, 최대 3회, 지연 `1000ms×시도`). **각 시도에 8초 `AbortSignal.timeout`** 이 붙고, 응답이 **4xx 면 재시도하지 않고 즉시** `WEATHER_KMA_API_ERROR`(502)로 끝낸다(키 오류·잘못된 파라미터를 3회 반복하지 않는다). 5xx·네트워크 오류·구조 이상만 재시도 대상이다.
   - `header.resultCode !== '00'` 이면 `mapKmaErrorCode`(`'03'`→`WEATHER_DATA_NOT_FOUND`, 그 외→`WEATHER_KMA_API_ERROR`).
   - 성공 시 다음 base 경계까지 TTL 로 `redisCache.set`. **`resultCode='03'`(NO_DATA)은 30초 negative cache** 로 저장해, 데이터가 아직 없는 시각에 같은 격자로 폭주하는 재조회를 막는다. 그 외 실패는 캐시하지 않는다.
   - **동시 요청은 single-flight** 로 합류한다: 같은 캐시 키의 진행 중 호출이 있으면 새 KMA 요청을 만들지 않고 그 Promise 를 기다린다(`inFlight` Map, 완료 후 제거).
4. `parseCurrentWeather`(`weather-data.ts`)로 카테고리 배열을 필드로 변환(코드→텍스트 포함) → `successResponse`.
5. `next()` 반환 후 `requireWeatherKey` 가 `logRequest`(endpoint·status·duration·error_code) 를 `weather_api_log` 에 **응답 전 `await`** 로 insert 한다(서버리스에서 응답 후 실행이 끊겨 한도 산정 소스가 비던 경로 차단). **insert 전에 컬럼 길이에 맞춰 값을 자른다**(`service/domain/weather/weather-api-key.ts`): `endpoint` 50자, `ip` 45자(+ `X-Forwarded-For` 처럼 콤마로 이어진 값은 첫 항목만, 공백 제거 후 빈 값이면 `null`), `user_agent` 512자, `error_code` 50자. 값이 길어 insert 가 통째로 실패해 한도 산정 소스가 비는 일을 막는다.

### 2. KMA API·base time·캐시 규칙 (`kma-api.ts`)

| 메서드 | KMA 오퍼레이션 | `numOfRows` | base time(`getKmaBaseDateTime`, KST) | 캐시 TTL 경계(`getNext*Ttl`) |
|------|------|:---:|------|------|
| `getUltraSrtNcst` | `getUltraSrtNcst`(초단기실황) | 10 | 분<40 → 직전 시, 분=`00` | 다음 매시 `:40` |
| `getUltraSrtFcst` | `getUltraSrtFcst`(초단기예보) | 60 | 분<45 → 직전 시, 분=`30` | 다음 매시 `:45` |
| `getVilageFcst` | `getVilageFcst`(단기예보) | 1000 | base 후보 `[02,05,08,11,14,17,20,23]` 중 제공(+10분) 지난 최신, `02:10` 이전이면 전일 `23`시 | 다음 base시각 `:10` |
| `getFcstVersion` | `getFcstVersion`(예보버전) | 1 | vilage 와 동일 base + `basedatetime` 파라미터 | 다음 base시각 `:10` |

- 공통 쿼리(ncst/fcst/vilage): `serviceKey=env.KMA_API_KEY`, `dataType=JSON`, `pageNo=1`, `base_date`/`base_time`, `nx`/`ny`. `getFcstVersion` 은 `base_date`/`base_time`/`nx`/`ny` 대신 `ftype`·`basedatetime`(=`baseDate+baseTime`) 를 보낸다(`serviceKey`/`dataType=JSON`/`pageNo=1` 은 공통).
- **base 전환 분과 TTL 경계 분은 같은 상수를 쓴다**(`NCST_BASE_SWITCH_MINUTE` 40 · `FCST_BASE_SWITCH_MINUTE` 45 · `VILAGE_BASE_SWITCH_MINUTE` 10 · `VILAGE_BASE_HOURS`). 이전에는 ncst 만 base 전환이 `:40`, TTL 경계가 `:10` 으로 어긋나 base 가 바뀐 뒤에도 최대 30분간 옛 base 응답이 캐시에서 나갔다(감사 P-17). `getNextNcstTtl`·`getNextFcstTtl` 은 같은 헬퍼(`getNextTtlAtMinute`)로 합쳤다.
- 최소 TTL 30초(`MIN_CACHE_TTL`). 캐시는 **성공 응답 + NO_DATA(`resultCode='03'`, 30초)** 만 저장한다.
- `redisCache`(`service/shared/redis-cache.ts`): 로컬 LRU 캐시(`createCache`, 최대 500 항목 · TTL 30초) → Redis(`EX` ttl초). Redis 클라이언트는 `service/shared/redis-client.ts` 가 `REDIS_URL` 이 있을 때만 지연 생성하며(프로세스당 1개), Redis 실패는 `captureException` 후 로컬 캐시로만 동작한다. `REDIS_URL` 이 없으면 Redis 는 아예 시도하지 않는다.

### 3. 위경도↔격자 변환 (`grid-converter.ts`, `location.ts`)

- `latLonToGrid(lat,lon)`/`gridToLatLon(x,y)`: KMA Lambert Conformal Conic 상수(`RE=6371.00877`, `GRID=5.0`, 기준위도 `30/60`, 기준점 `126/38`, 원점 `XO=43, YO=136`) 기반 순수 계산.
- `createLocationService`: `masterdata/locations.json` 로딩. `search`(level1/2/3 소문자 부분일치), `getByGrid`(격자 완전일치), `findNearest`(위경도 → 0.1도 셀 공간 인덱스 후보 중 유클리드 최근접), `getAll`.
- `/locations/convert`: `lat`+`lon` → `latLonToGrid`+`findNearest`, `gridX`+`gridY` → `gridToLatLon`+`getByGrid`.
- `GET /locations` 는 **정적 마스터데이터라 조건부 GET 을 지원**한다(`route/weather/location.ts`). 라우트 인스턴스가 최초 응답 때 전체 목록 JSON 의 sha256 앞 32자를 ETag(`"<hex>"`)로 만들어 보관하고, 이후 모든 응답에 `ETag` + `Cache-Control: private, max-age=3600` 을 싣는다. 요청 `If-None-Match` 가 그 값과 같으면 본문 없이 `304` 로 끝난다. 200 응답의 본문은 종전과 동일하다.

### 4. 키 발급·검증 (`weather-api-key.ts`, `key.ts`)

- 발급(`create`): `generateToken()`(32바이트 난수 → 64 hex 평문) 생성 후 `hashToken`(sha256, 64 hex)만 `weather_api_key.token` 에 저장. 응답은 평문 1회.
- 검증(`validate`): 요청 토큰을 해시하여 일치 조회 + 만료 확인, `last_used_at` 갱신(응답 전 `await`). 조회는 **키 행 + 최근 24시간 사용량을 한 SELECT** 로 가져온다 — `weather_api_log` 카운트를 `weatherApiKey.id` 와 상관된 서브쿼리로 붙였다(`getTableColumns` 로 키 컬럼 전부 + `recentUsage`). 이전에는 미들웨어 한 번에 SELECT 2회였다(감사 P-17).
- 한도(`checkRateLimit`): 최근 24시간(`created_at >= now-24h`) `weather_api_log` 행 수 < `daily_limit`. 캘린더일이 아닌 **롤링 24시간**. `validate` 가 방금 읽은 사용량이 있으면 그것을 쓰고(프로세스 내 인계 Map — 키당 1건, TTL 5초, 최대 100건, 읽으면 즉시 제거), 없으면 종전대로 COUNT 쿼리를 돈다. 인계 값은 `logRequest` 이전 시점이라 판정 기준은 종전과 같다.
- 목록(`listByUser`): 키별 24h 사용량(`todayUsage`)을 서브쿼리 조인으로 합산.
- 한도 수정(`updateDailyLimit`)은 관리자 전용(`withAdmin`), 소유자 검증 없이 `key_id` 로 수정.

### 5. Mock 흐름 (`mock.ts`, `mock-kma-api.ts`)

- 실 라우트와 동일 경로·파싱을 쓰되 `mockKmaApi`(난수 생성, 캐시·외부호출 없음)로 데이터 생성.
- `requireWeatherKeyNoLog` 적용 → 키 유효성만 검증하고 **한도 검사·로그 기록을 하지 않음**.

## 환경변수

이 도메인이 사용하는 것만. 전체는 [../reference/env.md](../reference/env.md) 참조.

| 변수 | 필수 | 용도 |
|------|:---:|------|
| `KMA_API_KEY` | 선택(`optional`) | KMA 서비스키. `compose/weather.ts` 에서 미설정 시 `''` 로 주입(호출은 인증 실패로 이어짐) |
| `REDIS_URL` | 선택(`optional`) | 캐시 Redis 접속. 미설정/실패 시 인메모리 캐시로 fallback |

## 에러 코드

`lib/error-code.ts`/`lib/error-message.ts`/`lib/error.ts` 중 이 도메인 코드.

| 코드 | HTTP | 메시지 |
|------|:---:|------|
| `WEATHER_KMA_API_ERROR` | 502 | 기상청 API 호출에 실패했습니다 |
| `WEATHER_INVALID_GRID` | 400 | 유효하지 않은 격자 좌표입니다 |
| `WEATHER_DATA_NOT_FOUND` | 404 | 기상 데이터를 찾을 수 없습니다 |
| `WEATHER_KEY_INVALID` | 401 | 날씨 API 키가 유효하지 않습니다 |
| `WEATHER_KEY_RATE_LIMIT` | 429 | 날씨 API 일일 요청 한도를 초과했습니다 |

- 공통 `VALIDATION_ERROR`(400)도 사용: 키 라우트(`/keys/:id`·`/keys/:id/limit` 의 `id` 파싱 실패)와 `/locations/:keyword`(keyword 100자 초과). 키 라우트는 `UNAUTHORIZED`(401)·`FORBIDDEN`(403)도 사용.

## 테스트

`bun test <경로>` 로 실행.

| 경로 | 대상 |
|------|------|
| `tests/service/domain/weather/grid-converter.test.ts` | 좌표 변환 |
| `tests/service/domain/weather/kma-api.test.ts` | KMA 호출/재시도/캐시 |
| `tests/service/domain/weather/location.test.ts` | 위치 검색/최근접 |
| `tests/service/domain/weather/mock-kma-api.test.ts` | Mock 데이터 생성 |
| `tests/service/domain/weather/weather-api-key.test.ts` | 키 발급/검증/한도 |
| `tests/service/domain/weather/weather-api-key-sql.test.ts` | 검증 SELECT 1회 합산(상관 서브쿼리)·사용량 인계 |
| `tests/service/domain/weather/weather-data.test.ts` | 파싱/코드 텍스트화 |
| `tests/route/weather/weather.test.ts` | 조회 라우트 |
| `tests/route/weather/location.test.ts` | 위치 라우트 |
| `tests/route/weather/mock.test.ts` | Mock 라우트 |
| `tests/route/weather/weather-api-key.test.ts` | 키 라우트 |
| `tests/dto/weather/weather.test.ts`, `tests/dto/weather/location.test.ts` | DTO 스키마 |
| `tests/middleware/require-weather-key.test.ts` | 키 미들웨어 |
| `tests/page/admin/weather.test.ts` | 어드민 날씨 페이지 |

- 전체 실행: `bun test tests/service/domain/weather tests/route/weather tests/dto/weather`.

## 주의사항 / 함정

- **응답 `baseDate`/`baseTime` = KMA ncst base time**: `route/weather/weather.ts:88`·`mock.ts:86` 의 `/current` 응답은 `getKmaBaseDateTime('ncst')` 결과를 그대로 싣는다. 즉 `kmaApi.getUltraSrtNcst` 가 실제로 요청한 base date/time 과 같은 값이다. 이전에는 서버 로컬 `getFullYear`/`getHours` 로 만든 `${hours}00` 이었고, 로컬(KST)에서는 얼추 맞지만 Vercel(UTC)에서는 9시간 어긋난 값이 응답에 실렸다.
- **시각 기준 불일치는 캐시 TTL 쪽에 남아 있다**: base time(`getKmaBaseDateTime`)은 `nowMs + KST_OFFSET_MS` 에 UTC getter 를 써서 실행 환경과 무관하게 KST 를 계산하지만, TTL 경계 계산(`getNextNcstTtl`·`getNextFcstTtl`·`getNextVilageTtl`)은 여전히 `Date` 로컬 getter 기반이다. UTC 배포에서 TTL 경계가 base 전환 시각과 어긋날 수 있다. 4차 배치는 이 중 **분(minute) 상수 불일치만** 잡았다(ncst TTL 경계 `:10` → `:40`, 위 §2). 로컬 getter → KST 통일은 하지 않았다.
- **키 검증의 사용량 인계는 같은 요청 안에서만 유효하다**: `validate` 가 담아 둔 `recentUsage` 는 TTL 5초·최대 100건의 프로세스 내 Map 에 있고 `checkRateLimit` 이 읽는 즉시 지워진다. `requireWeatherKeyNoLog`(mock 라우트)는 `checkRateLimit` 을 부르지 않으므로 인계 값이 소비되지 않고 TTL 로 만료되거나 100건 초과 시 밀려난다 — 한도 판정에는 영향이 없다.
- **Mock 은 한도 우회**: `/api/weather/mock/*` 는 `requireWeatherKeyNoLog` 라 `weather_api_log` 에 기록되지 않고 한도 검사도 없다 → 한도 소진/집계에 잡히지 않는다.
- **한도는 롤링 24h**: `checkRateLimit`/`listByUser` 는 `created_at >= now-24h` 카운트. `daily_limit` 이지만 캘린더일 리셋이 아니다.
- **PTY 코드 세트 상이**: 초단기(`getPtyText`: 0/1/2/3/5/6/7)와 단기(`getPtyTextShort`: 0/1/2/3/4=소나기)의 강수형태 코드 매핑이 다르다. SKY 는 1/3/4 만 정의(2 없음).
- **키 소유권**: `revoke`/`listByUser` 는 `user_id` 스코프이나 `updateDailyLimit`(관리자)은 소유자 검증 없이 `key_id` 만으로 수정한다.
- **요청 로그는 저장 전에 절단된다**: `endpoint`(50)·`ip`(45, XFF 첫 항목)·`user_agent`(512)·`error_code`(50). 스키마 길이를 넘겨 insert 가 실패하면 그 요청이 한도 집계에서 누락되기 때문이다.
- **부가 쓰기는 응답 전에 끝난다**: `validate` 의 `last_used_at` 갱신과 `logRequest` insert 는 모두 `await` 로 실행하고 실패만 `captureException` 후 삼킨다(응답에는 영향 없음). **weather 키의 `last_used_at` 은 매 요청 갱신한다** — `api_token`·`metrics_token` 에 들어간 "5분 경과 시만 UPDATE"(감사 P-07)는 weather 키에 적용하지 않았다(3차 결정 유지). `redisCache` 의 Redis 실패도 이제 `captureException` 으로 보고한 뒤 로컬 캐시로만 동작한다 — 예전의 빈 catch 무음 처리는 없어졌다. 대신 요청 지연에 이 쓰기 시간이 포함된다.
- **`weather_api_log` 는 90일 보존이다**: `GET /api/logs/purge` 크론(매일 04:40 UTC)이 90일 지난 행을 `LIMIT 1000` × 최대 50회로 삭제한다(→ [../logging.md](../logging.md)). 한도 산정은 롤링 24시간이라 보존 삭제의 영향을 받지 않는다.

## 관련 문서

- ESP32 로깅 계약(디바이스 로그 전송, `X-Device-Key`): [../firmware-logging-contract.md](../firmware-logging-contract.md). 날씨 펌웨어는 본 도메인(`X-Weather-Key`)으로 날씨를 읽고, 오류는 logs 도메인으로 별도 전송한다. 계약 예시에 `/weather/current` fetch 실패(`ESP_FETCH_FAILED`)가 포함되며, 디바이스 코드는 서버 `WEATHER_*` 와 충돌 방지를 위해 `ESP_` 접두사를 쓴다.
- 중앙 로깅: [../logging.md](../logging.md)
- DB 스키마 전수: [../reference/db-schema.md](../reference/db-schema.md)
- 환경변수 전수: [../reference/env.md](../reference/env.md)
- 어드민 기능(날씨 캐시 테이블 조회/삭제 등): [../admin-features.md](../admin-features.md)
