# 환경변수 레퍼런스

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 다루는 코드: `lib/env.ts`, `.env.example`, `compose/index.ts`, `compose/shared.ts`, `compose/blog.ts`, `compose/drive.ts`, `compose/mail.ts`, `compose/spotify.ts`, `compose/weather.ts`, `compose/logs.ts`, `compose/ai.ts`, `db/index.ts`, `drizzle.config.ts`, `index.ts`, `lib/sentry.ts`, `service/shared/redis-cache.ts`, `service/shared/font-loader.ts`, `service/shared/icon-loader.ts`, `lib/api-response.ts`, `lib/with-error-handling.ts`, `middleware/error-handler.ts`, `middleware/index.ts`, `service/shared/auth-provider.ts`, `deploy/caldav-proxy/proxy.ts`, `deploy/upload-server/index.ts`

## 개요

- 허브 앱의 환경변수 스키마 단일 출처는 `lib/env.ts` 의 `envSchema`(zod). 값 접근은 `getEnv()` 싱글톤으로만 한다.
- 스키마에 30개 키가 선언되어 있고, **필수는 `DATABASE_URL` 하나**다. 나머지는 전부 `.optional()`(단 `NODE_ENV` 는 `default('development')`).
- 검증된 `env` 객체는 `compose/index.ts` 에서 한 번 만들어(`getEnv()`) `core = { db, env }` 로 각 `compose/<domain>.ts` 에 주입된다. 대부분의 키는 compose 계층에서만 소비된다.
- 예외적으로 부트스트랩·모듈 싱글톤·서버 엔트리 몇 곳은 `process.env` 를 직접 읽는다(아래 [getEnv 규칙](#getenv-규칙)).
- getEnv 규칙 정본은 [../memory/stack-and-invariants.md](../memory/stack-and-invariants.md), 부트스트랩·DI 흐름은 [../architecture.md](../architecture.md) 참조.

## getEnv 규칙

`lib/env.ts`:

- `getEnv()` 는 `cachedEnv` 모듈 변수에 결과를 캐시하는 싱글톤. 최초 호출 시 `envSchema.safeParse(process.env)` 실행.
- 검증 실패 시 누락/위반 키를 모아 `throw new Error('Missing or invalid environment variables: <paths>')`. **fail-fast** — 앱 부팅 자체가 멈춘다.
- optional 키는 미설정이면 통과하지만, **설정되면 형식 제약**(`z.url()`·`.min(n)`)을 만족해야 한다. 위반 시 동일하게 throw.
- `resetEnvCache()` 는 캐시를 비운다(테스트 전용, `tests/lib/env.test.ts`).
- 프로덕션 코드에서 `getEnv()` 호출부는 `compose/index.ts:15` **한 곳**뿐. 이후는 주입된 `env` 를 사용한다.

### process.env 직접 접근 (getEnv 우회 지점)

싱글톤/부트스트랩/모듈 스코프라 검증된 `env` 대신 `process.env` 를 직접 읽는 코드. Bun 런타임 실코드 기준(테스트·`deploy/` 제외).

| 파일:라인 | 변수 | 맥락 |
|------|------|------|
| `db/index.ts:14` | `DATABASE_URL` | Drizzle DB 풀 싱글톤 생성 |
| `drizzle.config.ts:8` | `DATABASE_URL` | drizzle-kit 설정(앱 런타임 밖) |
| `index.ts:38` | `NODE_ENV` | 비프로덕션에서만 `/docs`·`/swagger` 노출 |
| `index.ts:60` | `PORT` | 서버 리슨 포트(미설정 시 `9999`) |
| `lib/api-response.ts:49` | `NODE_ENV` | 환경 분기 |
| `lib/with-error-handling.ts:19` | `NODE_ENV` | 환경 분기 |
| `middleware/error-handler.ts:17` | `NODE_ENV` | 환경 분기 |
| `middleware/index.ts:23` | `NODE_ENV` | 환경 분기 |
| `service/shared/font-loader.ts:21` | `VERCEL` | Vercel 파일 경로 분기 |
| `service/shared/icon-loader.ts:11` | `VERCEL` | Vercel 파일 경로 분기 |
| `service/shared/redis-cache.ts:3` | `REDIS_URL` | 모듈 스코프 Redis 클라이언트 초기화 |

- `NODE_ENV` 는 주입 소비 1곳(`compose/shared.ts:32` `isProduction: env.NODE_ENV === 'production'`, 2026-07 deps 업그레이드에서 auth-provider 직접접근을 주입으로 정리) + `process.env` 직접 접근 5곳이 혼재한다.
- `DATABASE_URL`·`REDIS_URL`·`PORT` 도 소비는 `process.env` 로 하지만, `DATABASE_URL` 은 `getEnv()` 가 검증은 수행한다(`REDIS_URL`·`PORT`·`NODE_ENV`·`VERCEL` 은 optional).
- `VERCEL` 은 `compose/shared.ts:70` 에서는 주입 `env` 로, 폰트/아이콘 로더에서는 `process.env` 로 이중 접근.

## 변수 인벤토리

`lib/env.ts` 선언 순서. `필수/선택` 은 zod 스키마 기준(괄호는 제약: `min1`=`.min(1)`, `min32`=`.min(32)`, `url`=`z.url()`, `enum`=허용값 고정). `기본값` 은 zod 스키마의 `default` 만 표기(값이 있는 건 `NODE_ENV` 뿐). 소비 측 fallback(`?? ...`)은 `용도` 에 병기.

| 변수 | 필수/선택(zod) | 기본값 | 용도 | 사용 파일 |
|------|------|------|------|------|
| `DATABASE_URL` | 필수 (min1) | — | MySQL 접속 URL. Drizzle 풀 생성 | `db/index.ts:14`, `drizzle.config.ts:8` (process.env 직접) |
| `SITE_URL` | 선택 (url) | — | **선언만, 소비 코드 없음** | (없음) |
| `BASE_URL` | 선택 (min1) | — | better-auth `baseURL`(미설정 시 `http://localhost:9999`) / 앱 `baseUrl`(미설정 시 `''`) | `compose/shared.ts:25`, `compose/index.ts:47` |
| `GITHUB_CLIENT_ID` | 선택 (min1) | — | better-auth GitHub OAuth | `compose/shared.ts:26` |
| `GITHUB_CLIENT_SECRET` | 선택 (min1) | — | better-auth GitHub OAuth | `compose/shared.ts:27` |
| `GOOGLE_CLIENT_ID` | 선택 (min1) | — | better-auth Google OAuth + Gmail OAuth connect + Google Drive 토큰 교환 | `compose/shared.ts:28`·`107`·`122`, `compose/mail.ts:45`·`108` |
| `GOOGLE_CLIENT_SECRET` | 선택 (min1) | — | 상동 | `compose/shared.ts:29`·`108`·`123`, `compose/mail.ts:46`·`109` |
| `SPOTIFY_CLIENT_ID` | 선택 (min1) | — | Spotify OAuth connect | `compose/spotify.ts:74`·`151` |
| `SPOTIFY_CLIENT_SECRET` | 선택 (min1) | — | Spotify OAuth connect | `compose/spotify.ts:75`·`151` |
| `R2_END_POINT` | 선택 (url) | — | R2(S3) 엔드포인트 | `compose/shared.ts:53` |
| `R2_ACCESS_KEY_ID` | 선택 (min1) | — | R2 자격증명(미설정 시 `''`) | `compose/shared.ts:55` |
| `R2_SECRET_ACCESS_KEY` | 선택 (min1) | — | R2 자격증명(미설정 시 `''`) | `compose/shared.ts:56` |
| `R2_BUCKET` | 선택 (min1) | — | R2 버킷(미설정 시 `'blog-cloud'`) | `compose/shared.ts:62`, `compose/blog.ts:491` |
| `R2_CUSTOM_DOMAIN` | 선택 (min1) | — | R2 CDN 도메인(우선). 미설정 시 `R2_CUSTOME_DOMAIN` → `'https://blogimg.gumyo.net'` | `compose/shared.ts:63` |
| `R2_CUSTOME_DOMAIN` | 선택 (min1) | — | **오타 별칭**. `R2_CUSTOM_DOMAIN` 미설정 시 fallback 소스 | `compose/shared.ts:63` |
| `KMA_API_KEY` | 선택 (min1) | — | 기상청 서비스키(미설정 시 `''` 주입) | `compose/weather.ts:9` |
| `DISCORD_WEBHOOK_URL` | 선택 (url) | — | 로그 알림 Discord webhook. 미설정 시 alerter 비활성 | `compose/logs.ts:52`·`58` |
| `SENTRY_DSN` | 선택 (url) | — | **선언·`.env.example` 에 있으나 소비 코드 없음**(`initSentry` 런타임 미호출) | (없음) |
| `BETTER_AUTH_SECRET` | 선택 (min1) | — | better-auth secret + mail/spotify OAuth connect 서명(`secret`) | `compose/shared.ts:30`, `compose/mail.ts:110`, `compose/spotify.ts:76` |
| `TRUSTED_ORIGINS` | 선택 | — | better-auth `trustedOrigins`(CSV → `split(',')`, 미설정 시 `[]`) | `compose/shared.ts:31` |
| `MAIL_ENCRYPTION_KEY` | 선택 (min32) | — | 메일 자격증명 암호화 키. **`compose/mail.ts` 가 미설정 시 throw**(아래 함정) | `compose/mail.ts:15`·`18` |
| `AI_ENCRYPTION_KEY` | 선택 (min32) | — | AI 프로바이더 자격증명 암호화 키(mail 과 분리). **미설정 시 `compose/ai.ts` 가 `{}` 반환 → AI 라우트만 `SERVICE_NOT_CONFIGURED`(503), 앱은 정상 부팅** | `compose/ai.ts` |
| `GDRIVE_ROOT_FOLDER_ID` | 선택 (min1) | — | Google Drive 루트 폴더 ID(미설정 시 `''`) | `compose/index.ts:48` |
| `UPLOAD_SERVER_SECRET` | 선택 (min1) | — | upload-server 토큰 서명 시크릿(blog·drive, 미설정 시 `''`) | `compose/blog.ts:493`, `compose/drive.ts:244`·`297` |
| `UPLOAD_SERVER_URL` | 선택 (url) | — | upload-server base URL(blog, 미설정 시 `''`) | `compose/blog.ts:494` |
| `REDIS_URL` | 선택 (min1) | — | 캐시 Redis 접속. 미설정/실패 시 인메모리 fallback | `service/shared/redis-cache.ts:3` (process.env 직접) |
| `MONGODB_URI` | 선택 (min1) | — | metrics 로그·디바이스 MongoDB 접속. **미설정 시 `compose/metrics.ts` 가 `{}` 반환 → metrics 라우트만 `SERVICE_NOT_CONFIGURED`(503), 앱은 정상 부팅**(DB 명은 코드 상수 `metrics` 고정, URI path 무시) | `compose/metrics.ts:15`·`17`, `db/mongo.ts` |
| `VERCEL` | 선택 | — | Vercel 런타임 감지(파일 경로 분기) | `compose/shared.ts:70`(env), `service/shared/font-loader.ts:21`·`service/shared/icon-loader.ts:11`(process.env) |
| `PORT` | 선택 | — | 서버 리슨 포트(미설정 시 `9999`) | `index.ts:60` (process.env 직접) |
| `NODE_ENV` | 선택 (enum) | `'development'` | 환경 분기. 허용값 `development`\|`production`\|`test` | `compose/shared.ts:32`(주입 env → `isProduction`), `index.ts:38`, `lib/api-response.ts:49`, `lib/with-error-handling.ts:19`, `middleware/error-handler.ts:17`, `middleware/index.ts:23`(이상 5곳 process.env) |

- 도메인별 env 요약은 각 도메인 문서에도 있다(예: weather 의 `KMA_API_KEY`·`REDIS_URL` → [../domains/weather.md](../domains/weather.md#환경변수)).

## .env.example ↔ lib/env.ts 차집합

`.env.example` 에는 23개 키가 있고 모두 `lib/env.ts` 스키마에 존재한다. 즉 **`.env.example` 에만 있는 키는 없음.**

**스키마에 있으나 `.env.example` 에 없는 키 (7개):**

| 변수 | 성격 |
|------|------|
| `SPOTIFY_CLIENT_ID` | spotify 도메인 env — 예시 파일 누락 |
| `SPOTIFY_CLIENT_SECRET` | spotify 도메인 env — 예시 파일 누락 |
| `UPLOAD_SERVER_URL` | blog 업로드 서버 URL — 예시 파일 누락(`UPLOAD_SERVER_SECRET` 은 있음) |
| `R2_CUSTOME_DOMAIN` | `R2_CUSTOM_DOMAIN` 오타 별칭 — 정상 키만 예시에 있음 |
| `VERCEL` | 플랫폼(Vercel) 주입 변수 — 로컬 설정 대상 아님 |
| `PORT` | 호스트 주입 변수 |
| `NODE_ENV` | 플랫폼/런타임 주입 변수 |

- `VERCEL`·`PORT`·`NODE_ENV` 는 배포 플랫폼이 주입하므로 예시 파일 부재는 정상. `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`/`UPLOAD_SERVER_URL` 은 기능 env 임에도 `.env.example` 에 없다.

## deploy/ 별도 서비스 env

`deploy/` 하위 두 서비스는 **별도 Docker 프로세스**라 `lib/env.ts`/`getEnv()` 지배 밖이다. 자체 `process.env` + 하드코딩 기본값을 쓴다(허브 스키마와 무관, 이름이 겹쳐도 다른 env 공간).

### caldav-proxy (`deploy/caldav-proxy/proxy.ts`)

| 변수 | 기본값 | 용도 |
|------|------|------|
| `PORT` | `4000` | 프록시 리슨 포트 |

- 프록시 대상 `TARGET`(`https://api.gumyo.net`)은 env 아닌 하드코딩 상수.

### upload-server (`deploy/upload-server/index.ts`)

| 변수 | 기본값 | 용도 |
|------|------|------|
| `PORT` | `4100` | 리슨 포트 |
| `HUB_BASE_URL` | `https://api.gumyo.net` | 허브 검증 대상 base URL |
| `ALLOWED_ORIGINS` | `https://gumyo.net,https://hyns.dev` | CORS 허용 오리진(CSV → `split(',')`) |
| `MAX_UPLOAD_SIZE_BYTES` | `10 * 1024 * 1024 * 1024` (10GiB) | 업로드 최대 바이트 |
| `R2_END_POINT` | `''` | R2 엔드포인트 |
| `R2_ACCESS_KEY_ID` | `''` | R2 자격증명 |
| `R2_SECRET_ACCESS_KEY` | `''` | R2 자격증명 |
| `R2_BUCKET` | `blog-cloud` | R2 버킷 |

- `R2_*` 이름이 허브 스키마와 같지만, 이 서비스 컨테이너의 독립 env 다.

## 시크릿 취급

- 값 자체(토큰·시크릿·DSN·자격증명)는 **이 문서를 포함한 어떤 문서·로그·커밋에도 쓰지 않는다.** 여기서는 키 이름·제약·사용처만 다룬다.
- 실제 값은 `.env`(gitignore) 로만 두고 `getEnv()`(허브) / 컨테이너 env(`deploy/`) 로만 접근한다.

## 주의사항 / 함정

- **`MAIL_ENCRYPTION_KEY` 는 스키마상 optional 이나 사실상 부팅 필수**: `compose/mail.ts:15` 가 미설정 시 `throw new Error('MAIL_ENCRYPTION_KEY is required for mail functionality')`. `compose()` 가 `composeMail` 을 무조건 호출하므로, 미설정이면 zod 통과 후 compose 단계에서 앱 전체 부팅이 실패한다. 설정 시엔 `.min(32)` 도 만족해야 한다.
- **`SITE_URL`·`SENTRY_DSN` 은 선언만 되고 소비되지 않음**: 코드 어디서도 읽지 않는다. `SENTRY_DSN` 은 `lib/sentry.ts` 의 `initSentry(dsn)` 인자로 전달돼야 하나, 프로덕션 코드에 `initSentry` 호출이 없어(`tests/lib/sentry.test.ts` 만 호출) 항상 미초기화 → `captureException` 이 no-op. (로깅 세부는 [../logging.md](../logging.md))
- **`R2_CUSTOME_DOMAIN` 오타 별칭**: `compose/shared.ts:63` 가 `R2_CUSTOM_DOMAIN ?? R2_CUSTOME_DOMAIN ?? 'https://blogimg.gumyo.net'` 로 두 철자 모두 fallback으로 읽는다. 정상 철자(`_CUSTOM_`)가 우선.
- **소비 측 fallback 이 zod default 를 대체**: 대부분의 optional 키는 zod default 가 없고, 미설정 시 compose 에서 `?? ''`/`?? 'blog-cloud'`/`?? 'http://localhost:9999'` 등으로 흡수된다. "미설정=빈 문자열/로컬 기본"이라 인증·업로드가 조용히 무력화될 수 있다(에러 아님).
- **`NODE_ENV` 는 주입 env 미경유**: 검증된 `env.NODE_ENV`(default 적용본) 대신 5개 파일(`index.ts`·`middleware/error-handler.ts`·`middleware/index.ts`·`lib/api-response.ts`·`lib/with-error-handling.ts`)이 `process.env.NODE_ENV` 를 직접 본다(`service/shared/auth-provider.ts` 는 2026-07 `isProduction` 주입으로 정리됨). `process.env.NODE_ENV` 는 미설정 시 `undefined` 라 zod default(`'development'`)와 값이 다를 수 있다.

## 관련 문서

- 스택 불변식 / getEnv 규칙 정본: [../memory/stack-and-invariants.md](../memory/stack-and-invariants.md)
- 부트스트랩·compose DI 흐름: [../architecture.md](../architecture.md)
- 로깅(`DISCORD_WEBHOOK_URL`·Sentry): [../logging.md](../logging.md)
- 도메인별 env 관점: [../domains/weather.md](../domains/weather.md), [../domains/spotify.md](../domains/spotify.md)
