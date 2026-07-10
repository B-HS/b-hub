# weather 도메인

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 다루는 코드: `dto/weather/*`, `route/weather/*`, `service/domain/weather/*`, `compose/weather.ts`, `middleware/require-weather-key.ts`, `masterdata/locations.json`, `db/schema.ts`(weather_*), `service/shared/redis-cache.ts`

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
| `route/weather/location.ts` | 위치 목록/검색/좌표변환 라우트(`/`·`/convert`·`/:keyword`). `requireWeatherKey` 적용 |
| `route/weather/mock.ts` | 실데이터와 동일 인터페이스의 Mock 라우트. `requireWeatherKeyNoLog` 적용(로그·한도 없음). **`route/index.ts` 가 `NODE_ENV !== 'production'` 일 때만 `/weather/mock` 을 마운트** — 프로덕션에는 존재하지 않는다(2026-07-10 보안 게이트) |
| `route/weather/key.ts` | Weather API 키 CRUD 라우트. 세션(`withAuth`)/관리자(`withAdmin`) 인증 |
| `service/domain/weather/kma-api.ts` | KMA API 호출·재시도·에러매핑·base time 계산·Redis 캐싱 (`createKmaApiService`) |
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
| `weather_api_log` | 키별 요청 로그(한도 산정 소스) | `key_id`(FK, set null), `user_id`(FK, set null), `endpoint`, `nx`/`ny`, `status_code`, `ip`, `user_agent`, `duration_ms`, `error_code`, `created_at` | `idx_weather_api_log_user`(user_id), `idx_weather_api_log_key_created`(key_id, created_at) |
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
| GET | `/api/weather/locations` | `X-Weather-Key`(로그·한도) | 전체 위치 목록 |
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

1. `requireWeatherKey`(`middleware/require-weather-key.ts`): `X-Weather-Key` 헤더 → `weatherApiKeyService.validate`(sha256 해시 비교, 만료 확인) → `checkRateLimit`(24h 롤링 윈도우 로그 수 < `dailyLimit`). 실패 시 `WEATHER_KEY_INVALID`(401)/`WEATHER_KEY_RATE_LIMIT`(429).
2. `route/weather/weather.ts` `resolveCoordinates` 로 격자(`gridX`,`gridY`) 확정. `location` 만 온 경우 `locationService.search` 첫 결과 사용.
3. `kmaApi.getUltraSrtNcst(nx, ny)` 호출:
   - `getBaseDateTime('ncst')` 로 KST(`Date.now()+9h`) 기준 base date/time 산출.
   - `redisCache.get(cacheKey)` 히트 시 즉시 반환, 미스 시 KMA 호출(`fetchWithRetry`, 최대 3회, 지연 `1000ms×시도`).
   - `header.resultCode !== '00'` 이면 `mapKmaErrorCode`(`'03'`→`WEATHER_DATA_NOT_FOUND`, 그 외→`WEATHER_KMA_API_ERROR`).
   - 성공 시 다음 base 경계까지 TTL 로 `redisCache.set`.
4. `parseCurrentWeather`(`weather-data.ts`)로 카테고리 배열을 필드로 변환(코드→텍스트 포함) → `successResponse`.
5. `next()` 반환 후 `requireWeatherKey` 가 `logRequest`(endpoint·status·duration·error_code) 를 `weather_api_log` 에 비동기 insert.

### 2. KMA API·base time·캐시 규칙 (`kma-api.ts`)

| 메서드 | KMA 오퍼레이션 | `numOfRows` | base time(`getBaseDateTime`, KST) | 캐시 TTL 경계(`getNext*Ttl`) |
|------|------|:---:|------|------|
| `getUltraSrtNcst` | `getUltraSrtNcst`(초단기실황) | 10 | 분<40 → 직전 시, 분=`00` | 다음 매시 `:10` |
| `getUltraSrtFcst` | `getUltraSrtFcst`(초단기예보) | 60 | 분<45 → 직전 시, 분=`30` | 다음 매시 `:45` |
| `getVilageFcst` | `getVilageFcst`(단기예보) | 1000 | base 후보 `[02,05,08,11,14,17,20,23]` 중 제공(+10분) 지난 최신, `02:10` 이전이면 전일 `23`시 | 다음 base시각 `:10` |
| `getFcstVersion` | `getFcstVersion`(예보버전) | 1 | vilage 와 동일 base + `basedatetime` 파라미터 | 다음 base시각 `:10` |

- 공통 쿼리(ncst/fcst/vilage): `serviceKey=env.KMA_API_KEY`, `dataType=JSON`, `pageNo=1`, `base_date`/`base_time`, `nx`/`ny`. `getFcstVersion` 은 `base_date`/`base_time`/`nx`/`ny` 대신 `ftype`·`basedatetime`(=`baseDate+baseTime`) 를 보낸다(`serviceKey`/`dataType=JSON`/`pageNo=1` 은 공통).
- 최소 TTL 30초(`MIN_CACHE_TTL`). 캐시는 **성공 응답만** 저장.
- `redisCache`(`service/shared/redis-cache.ts`): 인메모리 Map(최대 30초) → Redis(`EX` ttl초). Redis 실패 시 인메모리로만 동작.

### 3. 위경도↔격자 변환 (`grid-converter.ts`, `location.ts`)

- `latLonToGrid(lat,lon)`/`gridToLatLon(x,y)`: KMA Lambert Conformal Conic 상수(`RE=6371.00877`, `GRID=5.0`, 기준위도 `30/60`, 기준점 `126/38`, 원점 `XO=43, YO=136`) 기반 순수 계산.
- `createLocationService`: `masterdata/locations.json` 로딩. `search`(level1/2/3 소문자 부분일치), `getByGrid`(격자 완전일치), `findNearest`(위경도 → 0.1도 셀 공간 인덱스 후보 중 유클리드 최근접), `getAll`.
- `/locations/convert`: `lat`+`lon` → `latLonToGrid`+`findNearest`, `gridX`+`gridY` → `gridToLatLon`+`getByGrid`.

### 4. 키 발급·검증 (`weather-api-key.ts`, `key.ts`)

- 발급(`create`): `generateToken()`(32바이트 난수 → 64 hex 평문) 생성 후 `hashToken`(sha256, 64 hex)만 `weather_api_key.token` 에 저장. 응답은 평문 1회.
- 검증(`validate`): 요청 토큰을 해시하여 일치 조회 + 만료 확인, `last_used_at` 비동기 갱신.
- 한도(`checkRateLimit`): 최근 24시간(`created_at >= now-24h`) `weather_api_log` 행 수 < `daily_limit`. 캘린더일이 아닌 **롤링 24시간**.
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

- **응답 `baseDate`/`baseTime` ≠ KMA base time**: `route/weather/weather.ts`·`mock.ts` 의 `/current` 응답 `baseDate`/`baseTime` 은 서버 로컬 현재시각을 시(hour) 단위로 자른 값(`${hours}00`)이며, KMA 요청에 쓰인 실제 관측 base time 이 아니다.
- **시각 기준 불일치**: KMA base time(`getBaseDateTime`)은 `Date.now()+9h`+UTC getter 로 KST 계산하지만, 캐시 TTL(`getNext*Ttl`)과 응답 baseDate/baseTime 은 `Date` 로컬 getter 기반이다. 배포 환경(UTC) 기준이 서로 다르다.
- **Mock 은 한도 우회**: `/api/weather/mock/*` 는 `requireWeatherKeyNoLog` 라 `weather_api_log` 에 기록되지 않고 한도 검사도 없다 → 한도 소진/집계에 잡히지 않는다.
- **한도는 롤링 24h**: `checkRateLimit`/`listByUser` 는 `created_at >= now-24h` 카운트. `daily_limit` 이지만 캘린더일 리셋이 아니다.
- **PTY 코드 세트 상이**: 초단기(`getPtyText`: 0/1/2/3/5/6/7)와 단기(`getPtyTextShort`: 0/1/2/3/4=소나기)의 강수형태 코드 매핑이 다르다. SKY 는 1/3/4 만 정의(2 없음).
- **키 소유권**: `revoke`/`listByUser` 는 `user_id` 스코프이나 `updateDailyLimit`(관리자)은 소유자 검증 없이 `key_id` 만으로 수정한다.
- **부가 쓰기 실패 무시**: `validate` 의 `last_used_at` 갱신·`logRequest` insert 는 실패 시 `captureException` 후 삼킨다. `redisCache.set` 의 Redis 쓰기 실패는 `captureException` 없이 조용히 무시하고(빈 catch) 인메모리 캐시만 유지한다. 셋 다 조회 응답에는 영향 없다.

## 관련 문서

- ESP32 로깅 계약(디바이스 로그 전송, `X-Device-Key`): [../firmware-logging-contract.md](../firmware-logging-contract.md). 날씨 펌웨어는 본 도메인(`X-Weather-Key`)으로 날씨를 읽고, 오류는 logs 도메인으로 별도 전송한다. 계약 예시에 `/weather/current` fetch 실패(`ESP_FETCH_FAILED`)가 포함되며, 디바이스 코드는 서버 `WEATHER_*` 와 충돌 방지를 위해 `ESP_` 접두사를 쓴다.
- 중앙 로깅: [../logging.md](../logging.md)
- DB 스키마 전수: [../reference/db-schema.md](../reference/db-schema.md)
- 환경변수 전수: [../reference/env.md](../reference/env.md)
- 어드민 기능(날씨 캐시 테이블 조회/삭제 등): [../admin-features.md](../admin-features.md)
