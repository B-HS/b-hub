# 공유 서비스(service/shared) 레퍼런스

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 다루는 코드: `service/shared/*.ts`(14개), `compose/shared.ts`, `compose/index.ts`, `compose/types.ts`, `compose/drive.ts`, `compose/spotify.ts`, `compose/ai.ts`, `lib/env.ts`, `lib/token-utils.ts`, `lib/url-validator.ts`, `service/domain/weather/kma-api.ts`, `package.json`

## 개요

- `service/shared/` 는 특정 도메인에 속하지 않는 횡단 서비스 모음. 14개 파일.
- 대부분 **Factory 패턴**: `createXxxService(deps)` 로 만들고 `export type XxxService = ReturnType<typeof createXxxService>` 로 타입을 유도한다. Drizzle 쿼리·외부 SDK 인스턴스는 서비스가 직접 만들지 않고 `deps` 로 주입받는다(계층 경계 — [../architecture.md](../architecture.md)).
- **조립 원칙**: `compose/shared.ts`(`composeShared`)가 공유 서비스 대부분을 인스턴스화하고, `compose/index.ts` 가 그 결과를 도메인 compose 에 주입한다.
- **예외 2가지**:
  - `redis-cache.ts` 는 팩토리가 아니라 **모듈 싱글톤**(`redisCache`)이라 DI 가 아닌 직접 import 로 쓰인다.
  - `cache.ts` 는 제네릭 팩토리(`createCache<T>`)라 각 소비 compose 가 개별 인스턴스를 만든다(공유 싱글톤 아님).
- **현재 미배선(정의+단위테스트만, compose/route 소비처 없음)**: `ai.ts`, `markdown.ts`, `notification.ts`. (grep 근거: `createAiService`·`createMarkdownService`·`createNotificationService` 참조가 `tests/` 에만 존재)

## 인벤토리

| 파일 | export | 역할 | 주입/소비처 | 테스트 |
|------|--------|------|------------|--------|
| `auth-provider.ts` | `createAuthProvider` | better-auth 인스턴스(OAuth·세션·admin) | `composeShared` → 전역(`auth`, `getSession`) | 없음 |
| `api-token.ts` | `createApiTokenService`, `hashToken` | API 토큰 발급·검증·폐기 | `composeShared` → 전역(`apiTokenService`) | `api-token.test.ts` |
| `storage.ts` | `createStorageService` | R2/S3 객체 저장(L1) | `composeShared` → blog·mail·drive·ai, storage-lifecycle `l1` | `storage.test.ts` |
| `gdrive-storage.ts` | `createGdriveStorageService` | Google Drive 저장(L3) | `composeShared`(lazy `initGdriveStorage`) → drive | `gdrive-storage.test.ts` |
| `storage-lifecycle.ts` | `createStorageLifecycleService` | L1↔L3 티어 이동(축출/승격) | `composeDrive` 만 | `storage-lifecycle.test.ts` |
| `cache.ts` | `createCache<T>` | 인메모리 LRU+TTL 캐시(제네릭) | `composeShared`(badge), `composeSpotify`(album art) | `cache.test.ts` |
| `redis-cache.ts` | `redisCache`(싱글톤) | Redis + 30초 인메모리 write-through | `service/domain/weather/kma-api.ts` 직접 import | `redis-cache.test.ts` |
| `image-processor.ts` | `createImageProcessor` | sharp 기반 이미지 변환(webp/png/resize) | `composeShared` → blog·drive | `image-processor.test.ts` |
| `image-generator.ts` | `createImageGenerator` | satori→resvg(WASM) PNG 생성 | `composeShared` → badgeService · blog 썸네일 라우트(`route/index.ts` → `createThumbnailRoute`) | `image-generator.test.ts` |
| `font-loader.ts` | `createFontLoader` | 로컬(@fontsource)·Google 폰트 로드 | `composeShared` → badgeService · blog 썸네일 라우트(`route/index.ts` → `createThumbnailRoute`) | `font-loader.test.ts` |
| `icon-loader.ts` | `createIconLoader` | 로컬·원격 아이콘 로드(SSRF·SVG 새니타이즈) | `composeShared` → badgeService | `icon-loader.test.ts` |
| `markdown.ts` | `createMarkdownService` | 마크다운→HTML + HTML 새니타이즈 | 미배선(테스트만) | `markdown.test.ts` |
| `notification.ts` | `createNotificationService` | Discord/일반 웹훅 POST | 미배선(테스트만) | `notification.test.ts` |
| `ai.ts` | `createAiService` | LLM 요약·번역·태그 추출 | 미배선(테스트만) | `ai.test.ts` |

## 조립·주입 관계 (compose 근거)

- `composeShared(core)` 가 생성해 반환하는 것: `auth`, `getSession`, `apiTokenService`, `storageService`, `imageProcessor`, `imageGenerator`, `fontLoader`, `badgeService`, `gdriveStorageService`(항상 `null` 플레이스홀더 — 실제 인스턴스는 `initGdriveStorage` 로 지연 생성), `initGdriveStorage`, `getGdriveAccessToken`. (`compose/shared.ts:133-145`)
- `compose/index.ts` 의 도메인 주입(스프레드 병합 전):
  - `composeBlog({ ...core, storageService, imageProcessor })` (`compose/index.ts:20`)
  - `composeMail({ ...core, storageService })` (`compose/index.ts:23`, `ComposeMailArgs`)
  - `composeDrive({ ...core, storageService, imageProcessor, gdriveStorageService: null, initGdriveStorage })` (`compose/index.ts:27`)
  - `composeAi({ ...core, storageService, logEventService })` (`compose/index.ts:34`, `ComposeAiArgs`) — `storageService` 를 `aiStorageAdapter`(첨부 업로드/삭제/URL/다운로드)로 래핑해 소비(`compose/ai.ts:217-224`). `AI_ENCRYPTION_KEY` 없으면 `{}` 반환(미조립). AI 도메인 상세 [../domains/ai.md](../domains/ai.md).
  - `composeWeather`·`composeLogs`·`composeSpotify`·`composeResume`·`composeCalendar` 는 `core`(`{db, env}`)만 받는다 — 공유 서비스 주입 없음.
- `badgeService` 는 별도 도메인 compose 없이 `composeShared` 내부에서 `imageGenerator`·`fontLoader`·`iconLoader`·`badgeCache` 를 조합해 만든다(`compose/shared.ts:82-89`). 이미지/배지 서비스 4종은 사실상 badge 도메인 전용 소비자다.

---

## 인증 / 토큰

> 상세(엔드포인트·미들웨어·세션 흐름)는 [../domains/auth.md](../domains/auth.md) 소유. 여기서는 공유 서비스 정의만.

### auth-provider.ts

- 역할: `better-auth` 인스턴스 생성. `drizzleAdapter`(provider `'mysql'`) + `admin` 플러그인(defaultRole `'user'`, adminRoles `['admin']`). `emailAndPassword` 비활성.
- 외부 의존: `better-auth`(^1.6). 소셜 프로바이더 GitHub·Google. Google scope 에 `gmail.modify`·`gmail.send`·`drive.file` 포함(+`openid`/`email`/`profile`), `accessType: 'offline'`, `prompt: 'consent'`.
- env(주입값, `composeShared` 경유): `BASE_URL`(기본 `http://localhost:9999`), `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `TRUSTED_ORIGINS`(콤마 분리), `NODE_ENV`(→ `isProduction`).
- 팩토리 시그니처: `createAuthProvider({ db, baseUrl, githubClientId, githubClientSecret, googleClientId, googleClientSecret, secret?, trustedOrigins?, isProduction })`. 반환은 명시 `Auth` 타입(base) — better-auth 1.6 이 내부 zod v4 를 참조해 추론 타입이 non-portable(TS2883)해지는 것을 옵션 `BetterAuthOptions` 타입 + 명시 annotation 으로 해소. admin 플러그인 전용 API 타입은 코드에서 미사용이라 손실 없음.
- 기타: `ALWAYS_TRUSTED_ORIGINS = ['*.gumyo.net', '*.hyns.dev', '*.seok.dev']` 상시 신뢰. `crossSubDomainCookies` 는 프로덕션에서만 활성(domain `.gumyo.net`, `isProduction` 주입값 기준).
- 주입: `composeShared` 가 `auth` 와, 세션을 `{ user: { id, name, email, role, image } }` 로 정규화하는 `getSession` 을 함께 노출(`compose/shared.ts:35-47`).
- 테스트: 없음(better-auth 위임 래퍼).

### api-token.ts

- 역할: 개인 API 토큰 CRUD. `create`(발급, 기본 만료 90일) / `validate`(해시 매칭·만료 확인·`lastUsedAt` 갱신) / `revoke` / `listByUser`. `apiToken` 테이블 사용.
- 외부 의존: 없음. `lib/token-utils` 의 `generateToken`(랜덤) + `hashToken`(SHA-256 hex) 사용. 토큰은 평문 저장 안 하고 해시만 저장. `hashToken` 재수출.
- env: 없음(`db` 만).
- 팩토리 시그니처: `createApiTokenService({ db })`.
- 주입: `composeShared` → `apiTokenService`(전역).
- 테스트: `tests/service/shared/api-token.test.ts`.

---

## 스토리지 3종 (storage / gdrive-storage / storage-lifecycle)

3계층 저장 모델에서 각기 다른 역할을 맡는다.

- `storage.ts` = **L1**(R2/S3, 빠른 CDN 서빙). blog·mail·drive 공용 객체 저장.
- `gdrive-storage.ts` = **L3**(Google Drive, 콜드 보관). drive 도메인이 대용량/저빈도 자산을 둔다.
- `storage-lifecycle.ts` = **L1↔L3 이동 정책**. L1 을 소비(`l1`)하고 L3 를 지연 획득(`getL3`)해 축출·승격을 수행. 자기 저장소를 갖지 않고 위 둘을 오케스트레이션한다.

> 티어링 스케줄러·엔드포인트(`route/drive/lifecycle.ts`)와 자산 CRUD 는 [../domains/drive.md](../domains/drive.md) 소유.

### storage.ts

- 역할: R2/S3 객체 업로드·삭제·목록·URL·프리사인드 URL·다운로드. `upload`→`{ key, url }`, `getUrl`(CDN 경로), `getPresignedUrl`(기본 만료 300초), `getObject`→`Buffer|null`(실패 시 null).
- 외부 의존: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
- 에러: `STORAGE_UPLOAD_FAILED`, `STORAGE_DELETE_FAILED`, `STORAGE_PRESIGN_FAILED`(모두 `lib/error-code.ts` 등록).
- env(주입값, `composeShared` 경유): `R2_END_POINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`(기본 `'blog-cloud'`), `R2_CUSTOM_DOMAIN` 또는 `R2_CUSTOME_DOMAIN`(오탈자 키 폴백, 기본 `https://blogimg.gumyo.net`). S3Client 는 `region: 'auto'` 로 `composeShared` 에서 생성.
- 팩토리 시그니처: `createStorageService({ s3, bucket, cdnDomain })`.
- 주입: `composeShared` → `storageService` → blog·mail·drive·ai(첨부); storage-lifecycle 의 `l1`.
- 테스트: `tests/service/shared/storage.test.ts`.

### gdrive-storage.ts

- 역할: Google Drive v3 다운로드·삭제(L3). refresh token → access token 교환(만료 60초 전까지 캐시). `download`→`ReadableStream`(`alt=media&supportsAllDrives=true`), `del`(404 는 무시).
- 외부 의존: `https://oauth2.googleapis.com/token`, `https://www.googleapis.com/drive/v3`. SDK 없이 `fetch` 직접 호출.
- 에러: `DRIVE_L3_DOWNLOAD_FAILED`(토큰 교환/다운로드 실패), `STORAGE_DELETE_FAILED`.
- env: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. `refreshToken` 은 env 가 아니라 **DB `account` 테이블에서 조회** — `composeShared.getGdriveRefreshToken` 이 `scope LIKE '%drive.file%'` 계정의 `refreshToken` 을 읽는다(`compose/shared.ts:91-98`).
- 팩토리 시그니처: `createGdriveStorageService({ clientId, clientSecret, refreshToken })`.
- 주입: `composeShared` 가 **lazy** 로 감싼다 — `initGdriveStorage()`(최초 호출 시 refresh token 이 있으면 생성, `GOOGLE_CLIENT_*` 또는 토큰 없으면 `null`). drive 에 `initGdriveStorage` 로 전달되어 `getGdriveStorage`·`getL3` 로 소비.
- 테스트: `tests/service/shared/gdrive-storage.test.ts`.

### storage-lifecycle.ts

- 역할: L1 자산 티어링. `evictR2Stale`(미접근 자산 L1 삭제 후 `storageTiers` 에서 `L1` 제거 + 로그), `autoPromote`(접근 빈도 높은 L3-only 자산을 L3 다운로드→L1 업로드→tier 추가), `evictLocalFifo`(현재 `0` 반환 no-op). `removeTier`/`addTier` 로 `storageTiers`(콤마 문자열) 조작, 각 동작을 lifecycle 로그에 기록.
- 외부 의존: 없음(주입된 `l1`·`getL3`·`db` 를 통해서만 접근).
- 팩토리 시그니처: `createStorageLifecycleService({ db, l1, getL3, evictionDays, promotionThreshold, l1MaxFileSize })`. `db` 는 `getStaleL1Assets`·`getPromotionCandidates`·`updateStorageTiers`·`insertLifecycleLog` 4개 메서드 인터페이스.
- 주입: **`composeDrive` 만**(`compose/drive.ts:247-295`). `l1: storageService`, `getL3: initGdriveStorage`, db 는 `cloudAssets`·`storageLifecycleLogs` 테이블 Drizzle 인라인 구현. 임계값은 env 가 아니라 **하드코딩 상수**: `evictionDays: 30`, `promotionThreshold: 5`, `l1MaxFileSize: 100 * 1024 * 1024`(100MB).
- 테스트: `tests/service/shared/storage-lifecycle.test.ts`.

---

## 캐시 2종 (cache vs redis-cache)

두 캐시는 성격이 다르며 선택 기준이 명확하다.

| 구분 | `cache.ts` (`createCache<T>`) | `redis-cache.ts` (`redisCache`) |
|------|------------------------------|--------------------------------|
| 형태 | 제네릭 **팩토리**(인스턴스별) | 모듈 **싱글톤** |
| 저장소 | 프로세스 인메모리 `Map` (LRU+TTL) | Redis(ioredis) + 30초 인메모리 write-through |
| 주입 | DI(compose 가 생성해 서비스에 주입) | 직접 import(DI 아님) |
| API | 동기 `get/set/del/has/clear/size` | 비동기 `get<T>`/`set<T>`(JSON 직렬화) |
| TTL 단위 | ms(`defaultTtlMs` 기본 5분) | 초(`ttlSeconds`, 인메모리 캡 30초) |
| 영속/공유 | 인스턴스 한정, 재시작 시 소멸 | Redis 로 인스턴스 간 공유·영속 |
| env | 없음 | `REDIS_URL` |

- 선택 기준: **프로세스 로컬·타입 지정·바운드 LRU** 가 필요하고 인스턴스 간 공유가 불필요하면 `createCache`. **서버리스 인스턴스 간 공유/영속**이 필요하면 `redisCache`(Redis 장애 시 인메모리로 자동 폴백, `get` 실패 시 `null`).

### cache.ts

- 역할: 인메모리 LRU + TTL 캐시. `set` 시 `maxSize` 도달하면 `accessOrder` 앞에서부터 축출. `get` 은 만료 확인 후 접근순서 갱신.
- 팩토리 시그니처: `createCache<T>({ maxSize? = 1000, defaultTtlMs? = 5*60*1000 })`.
- 주입:
  - `composeShared`: `createCache<Buffer>({ maxSize: 200, defaultTtlMs: 24h })` → badgeService(`badgeCache`).
  - `composeSpotify`: `createCache<string>({ maxSize: 200, defaultTtlMs: 5분 })` → spotifyWidgetService(`albumArtCache`, `compose/spotify.ts:224`). 상세 [../domains/spotify.md](../domains/spotify.md).
- 테스트: `tests/service/shared/cache.test.ts`.

### redis-cache.ts

- 역할: 모듈 로드 시 ioredis 클라이언트 1개를 생성(`REDIS_URL`, `maxRetriesPerRequest: 1`, `connectTimeout: 3000`, `lazyConnect: true`). `get`/`set` 은 인메모리 `memoryStore`(TTL 최대 30초)를 먼저 확인/기록하고 Redis 를 조회/기록한다. Redis 실패는 삼켜지고 인메모리만 유지.
- 외부 의존: `ioredis`(^5.11.1), `REDIS_URL`.
- export: `redisCache = { get, set }`(팩토리 아님).
- 소비: `service/domain/weather/kma-api.ts` 가 직접 import 해 KMA API 응답을 캐시(`redisCache.get`/`set`). 상세 [../domains/weather.md](../domains/weather.md).
- 테스트: `tests/service/shared/redis-cache.test.ts`.

---

## 이미지 / 배지 파이프라인

> 배지 생성 파이프라인 전체(파라미터→JSX→satori→resvg)와 엔드포인트는 [../domains/badge.md](../domains/badge.md) 소유. 아래는 공유 서비스 4종의 정의·주입만.

### image-processor.ts

- 역할: sharp 기반 변환. `toWebp`(기본 quality 80), `toPng`, `resize`(fit `inside`), `getMetadata`. 입력 10MB 초과 시 `IMAGE_PROCESS_FAILED`(`toWebp`/`toPng` 한정).
- 외부 의존: `sharp`(^0.35, 주입).
- 팩토리 시그니처: `createImageProcessor({ sharp })`.
- 주입: `composeShared` → `imageProcessor` → blog·drive.
- 테스트: `tests/service/shared/image-processor.test.ts`.

### image-generator.ts

- 역할: `hono/jsx` 엘리먼트 → **satori** SVG → **@resvg/resvg-wasm** PNG(Buffer). WASM 은 최초 1회만 init(`ensureWasm`).
- 외부 의존: `satori`(^0.26), `@resvg/resvg-wasm`(^2.6.2). `composeShared` 가 `loadWasm` 으로 `node_modules/@resvg/resvg-wasm/index_bg.wasm` 을 읽어 주입(`VERCEL` 이면 basePath `/var/task`).
- 팩토리 시그니처: `createImageGenerator({ satori, initWasm, Resvg, loadWasm })`.
- 주입: `composeShared` → `imageGenerator` → badgeService.
- 테스트: `tests/service/shared/image-generator.test.ts`.

### font-loader.ts

- 역할: satori 용 폰트 로드. `loadLocal`(로컬 `@fontsource`), `loadGoogle`(Google Fonts CSS→woff), `load`(로컬→Google→Inter 순 폴백). 결과 `fontCache` 캐시.
- 외부 의존: 로컬 `@fontsource/inter`·`@fontsource/noto-sans-kr`(weights 400/700, 요청 weight 에 가장 가까운 값 선택). 폴백 시 `https://fonts.googleapis.com/css2`. `VERCEL` 이면 basePath `/var/task`.
- 팩토리 시그니처: `createFontLoader({ fetchFn? })`.
- 주입: `composeShared` → `fontLoader` → badgeService.
- 테스트: `tests/service/shared/font-loader.test.ts`.

### icon-loader.ts

- 역할: 아이콘 로드. `loadLocal`(`public/icon` 의 svg/png → data URL, 파일명 `^[a-zA-Z0-9_-]+$` 검증), `loadFromUrl`(원격 fetch, 8초 타임아웃, 매직바이트 MIME 감지, SVG 새니타이즈, 선택적 `parseICO` 로 ICO→PNG), `loadAvailableIcons`. 결과 `iconCache` 캐시.
- 외부 의존: 원격 아이콘 URL. **SSRF 가드**로 `lib/url-validator` 의 `isPublicUrl` 을 통과한 URL 만 fetch. SVG 는 `<script>`·`on*`·`xlink:href`·`javascript:` 등 제거 후 사용.
- 팩토리 시그니처: `createIconLoader({ fetchFn?, iconDir?, parseICO? })`.
- 주입: `composeShared` → `iconLoader` → badgeService.
- 테스트: `tests/service/shared/icon-loader.test.ts`.

---

## 미배선 서비스 (정의·테스트만, 현재 소비처 없음)

아래 3종은 팩토리와 단위테스트는 있으나, `compose/*` 및 `route/*` 어디에서도 인스턴스화·주입되지 않는다(grep 상 참조가 `tests/` 에만 존재).

### markdown.ts

- 역할: `toHtml`(주입 `processor` 있으면 사용, 없으면 내장 정규식 변환) + `sanitizeHtml`(`<script>`·`iframe`/`embed`/`object`/`form`/`base`/`meta`/`link`·`<svg>`·`on*`/`style` 속성·`javascript:`/`data:`/`vbscript:` href 제거), `stripHtml`, `truncate`(기본 200자).
- 외부 의존: 없음(`processor` 주입 옵셔널). env 없음.
- 팩토리 시그니처: `createMarkdownService({ processor? })`.
- 테스트: `tests/service/shared/markdown.test.ts`.

### notification.ts

- 역할: `sendDiscord`(웹훅 URL + Discord embed 페이로드), `sendWebhook`(임의 URL·헤더). 결과 `{ success, statusCode?, error? }`.
- 외부 의존: 주입/기본 `fetch`. 웹훅 URL 은 인자로 받음(env 아님).
- 팩토리 시그니처: `createNotificationService({ fetchFn? })`.
- 참고: 실제 운영의 Discord 알림 전송은 이 서비스가 아니라 `lib/discord.ts` 의 `sendDiscordAlert`(env `DISCORD_WEBHOOK_URL`)가 logs 도메인에서 담당한다(`compose/logs.ts`). 로깅/알림 상세는 [../logging.md](../logging.md).
- 테스트: `tests/service/shared/notification.test.ts`.

### ai.ts

- 역할: LLM 텍스트 처리. `summarize`(시스템 프롬프트 + 사용자 콘텐츠), `translate`(기본 `ko`), `generateTags`(3-5개, JSON 배열 파싱). `wrapUserContent` 로 사용자 콘텐츠를 `<content>` 로 감싸 **프롬프트 인젝션 방지** 지시문을 덧붙인다.
- 외부 의존: 주입된 `model.generateContent` 인터페이스에만 의존해 **프로바이더 비종속**. `@google/genai`(^2)가 `package.json` 의존성이며 `vercel-build` 에서 `--external` 로 번들 제외되지만, 이 모델을 실제로 인스턴스화해 `createAiService` 에 주입하는 소스는 현재 없음(compose 미배선). `lib/env.ts` 에 Gemini/LLM 모델 관련 키는 없다(AI 프로바이더 도메인의 `AI_ENCRYPTION_KEY` 는 자격증명 암호화용으로 별개다 → [../domains/ai.md](../domains/ai.md)).
- 팩토리 시그니처: `createAiService({ model })`. `model: { generateContent: (prompt) => Promise<{ response: { text: () => string } }> }`.
- 테스트: `tests/service/shared/ai.test.ts`.
