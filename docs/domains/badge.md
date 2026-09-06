# 배지(badge) 도메인

> 기준: 2026-09-07 (fix/audit-batch2-immediate-errors @ `af05000` + 워킹트리 미커밋 변경) 코드 검증. 다루는 코드: `dto/badge.ts`, `route/badge.ts`, `service/domain/badge/badge.ts`, `service/shared/image-generator.ts`, `service/shared/font-loader.ts`, `service/shared/icon-loader.ts`, `service/shared/cache.ts`, `lib/tailwind-converter.ts`, `lib/url-validator.ts`, `compose/shared.ts`, `route/index.ts`

## 개요

- 쿼리 파라미터로 동적 PNG 배지 이미지를 생성해 반환하는 도메인. README 뱃지·위젯 등 `<img src>` 로 바로 쓰는 이미지를 만든다.
- 파이프라인: 파라미터 → `hono/jsx` 엘리먼트 트리 구성 → **satori** 로 SVG 렌더 → **@resvg/resvg-wasm**(WASM) 로 PNG 래스터화. 텍스트·아이콘·배경색·폰트·Tailwind/CSS 스타일을 조합한다.
- 외부 의존: `satori`(JSX→SVG), `@resvg/resvg-wasm`(SVG→PNG, WASM 초기화 필요), `tw-to-css`(`twi()` 로 Tailwind 클래스→CSS), `@fontsource/inter`·`@fontsource/noto-sans-kr`(로컬 폰트 woff), Google Fonts CSS API(`fonts.googleapis.com`, 로컬에 없는 폰트 fallback), 원격 아이콘 URL fetch.
- 생성 파이프라인의 하위 컴포넌트(`image-generator`·`font-loader`·`icon-loader`·`cache`)는 `service/shared/` 의 **공유 서비스**로, 배지 전용이 아니다(블로그 썸네일 라우트 `route/blog/thumbnail.ts` 도 `imageGenerator`·`fontLoader` 를 재사용). 전수 인벤토리는 [reference/shared-services.md](../reference/shared-services.md) 참조.

## 파일 맵

| 파일 | 역할 |
|------|------|
| `dto/badge.ts` | 쿼리 스키마 `badgeImageQuerySchema`, 폰트 응답 스키마 `badgeFontsResponseSchema`, 색상 검증 `colorSchema`(hex 또는 CSS 색상명 149종, `transparent` 포함) |
| `route/badge.ts` | HTTP 경계. `GET /image`·`GET /fonts`. `css` JSON 화이트리스트 파싱, 캐시 헤더 부착 |
| `service/domain/badge/badge.ts` | `createBadgeService` — 캐시키 생성, 폰트/아이콘 로드, 스타일 병합, JSX 트리 구성, 이미지 생성 오케스트레이션 |
| `service/shared/image-generator.ts` | `createImageGenerator` — satori(SVG) + resvg-wasm(PNG). WASM 지연 초기화 (공유) |
| `service/shared/font-loader.ts` | `createFontLoader` — `@fontsource` 로컬 폰트 + Google Fonts fallback (공유) |
| `service/shared/icon-loader.ts` | `createIconLoader` — 로컬 아이콘(`public/icon`) / 원격 URL 로드, SVG sanitize, SSRF 가드 (공유) |
| `service/shared/cache.ts` | `createCache` — 인메모리 LRU + TTL 캐시 (공유) |
| `lib/tailwind-converter.ts` | `convertTailwindToCSS`(`twi()` 래핑) + `mergeStyles` |
| `lib/url-validator.ts` | `isPublicUrl` — 원격 아이콘 URL 의 SSRF 방어(https 전용·사설 IP 차단) (공유) |
| `compose/shared.ts` | DI 조립 — `badgeService` 및 `imageGenerator`/`fontLoader`/`iconLoader`/`badgeCache` 주입 |
| `route/index.ts` | `createBadgeRoute` 를 `/badge` 로 마운트 |
| `tests/dto/badge.test.ts`, `tests/route/badge.test.ts`, `tests/service/domain/badge/badge.test.ts`, `tests/service/shared/{image-generator,font-loader,icon-loader}.test.ts`, `tests/lib/tailwind-converter.test.ts` | 테스트 |

## 데이터 모델

- 없음 — 이 도메인은 DB 테이블을 사용하지 않는다. 폰트·아이콘은 파일시스템(`node_modules/@fontsource`, `public/icon`)에서, 원격 리소스는 fetch 로, 결과 캐시는 인메모리 LRU 로만 처리한다.

## API 엔드포인트

`route/index.ts` 에서 `/badge` 로 마운트되고, `index.ts` 에서 라우터 전체가 `/api` 로 마운트된다.

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/api/badge/image` | 없음(공개) | 쿼리 파라미터로 PNG 배지 생성. `Content-Type: image/png` 반환 |
| GET | `/api/badge/fonts` | 없음(공개) | 사용 가능한 로컬 폰트 목록 + Google Fonts 지원 여부(JSON) |

- 두 엔드포인트 모두 라우트 의존성에 `getSession` 이 없고, `middleware/index.ts` 에도 `/api/badge` 를 막는 인증 게이트가 없다(전역 미들웨어는 `/api/*` CORS·`*` 보안 헤더·로그 캡처·에러 핸들러로 인증 게이트가 아니다). → 공개.

### `GET /api/badge/image` 쿼리 파라미터 (`badgeImageQuerySchema`)

| 파라미터 | 타입/제약 | 기본값 | 설명 |
|----------|-----------|--------|------|
| `width` | int, 1–4096 | `800` | 이미지 폭(px) |
| `height` | int, 1–4096 | `250` | 이미지 높이(px) |
| `text` | string, ≤1000 | `'Badge'` | 배지 텍스트 |
| `font` | string | `'Inter'` | 폰트명 |
| `fontSize` | int, `0`(auto) 또는 8–500, optional | `0`·미지정 시 `round(height*0.5)` | 글자 크기 |
| `fontWeight` | int, 100–900(100 단위) | `400` | 글자 굵기 |
| `color` | hex(`#fff`/`#ffffff`) 또는 CSS 색상명 | `'#000000'` | 글자색 |
| `backgroundColor` | hex 또는 CSS 색상명 | `'#ffffff'` | 배경색 |
| `icon` | string | `''` | 로컬 아이콘 이름(`public/icon` 파일명, 확장자 제외) |
| `iconUrl` | string | `''` | 원격 아이콘 URL(https 전용, `iconUrl` 이 `icon` 보다 우선) |
| `iconSize` | int, 0–500 | `0`(auto=`round(fontSize*1.2)`) | 아이콘 크기(px) |
| `tailwind` | string | `''` | 컨테이너에 적용할 Tailwind 클래스(`tw-to-css` 변환) |
| `css` | JSON 문자열 | `'{}'` | 컨테이너 인라인 스타일(화이트리스트 속성만 반영) |

- `css` 화이트리스트(`route/badge.ts`): `color`, `backgroundColor`, `fontSize`, `fontWeight`, `fontFamily`, `padding`(및 상하좌우), `margin`(및 상하좌우), `borderRadius`, `border`, `borderColor`, `borderWidth`, `textAlign`, `letterSpacing`, `lineHeight`, `opacity`, `gap`, `display`, `alignItems`, `justifyContent`, `width`, `height`, `maxWidth`, `maxHeight`. 그 외 키·비문자열/비숫자 값은 무시. JSON 파싱 실패 시 `{}`.

### `GET /api/badge/fonts` 응답 (`badgeFontsResponseSchema`)

- `{ local: [{ name, weights }], googleFontsSupported: boolean }`. 현재 `local` = `[{ name: 'Inter', weights: [400, 700] }, { name: 'Noto Sans KR', weights: [400, 700] }]`, `googleFontsSupported: true`(`font-loader.ts` 의 `getAvailableFonts`·`LOCAL_FONTS`).
- 두 엔드포인트 모두 표준 `{ success, data }` 봉투를 쓰지 않는다: `/fonts` 는 `c.json(fonts)` 로 위 객체를 그대로, `/image` 는 PNG 바이트를 `Response` 로 직접 반환한다. 봉투 규약은 [hono-reference.md](../hono-reference.md) 참조.

## 핵심 흐름

### 배지 생성 (`GET /api/badge/image`)

1. `route/badge.ts`: `validator('query', badgeImageQuerySchema)` 로 검증 → `css` 문자열을 JSON 파싱 후 화이트리스트로 sanitize → `badgeService.generate(...)` 호출.
2. `service/domain/badge/badge.ts` `generate`:
   - `generateCacheKey` = 요청 파라미터를 키 정렬한 JSON → `sha256` → 앞 16자리 hex. `cache.get(key)` HIT 시 즉시 `{ buffer, cacheHit: true }` 반환.
   - `fontLoader.load(font, fontWeight)` 로 폰트 로드(아래 폰트 흐름).
   - 아이콘: `iconUrl` 이 있으면 `iconLoader.loadFromUrl`, 아니면 `icon` 으로 `iconLoader.loadLocal` → data URL.
   - `convertTailwindToCSS(tailwind)` → Tailwind 스타일, `mergeStyles(tailwindStyles, css)` → `computedStyles`(css 가 tailwind 를 덮어씀).
   - 파생값: `fontSize = fontSize || round(height*0.5)`, `iconSize = iconSize || round(fontSize*1.2)`, `gap = round(height*0.08)`(`service/domain/badge/badge.ts:90-92`). `fontSize`·`iconSize` 둘 다 `||` 라 `0`·미지정 모두 auto 로 동작한다.
   - `hono/jsx` 엘리먼트 트리 구성: 컨테이너 `div`(flex, center 정렬, `gap`, `backgroundColor`, `...computedStyles`) 안에 아이콘 `img`(있을 때)와 텍스트 `span`(글자색·크기·굵기·`fontFamily`·`ellipsis`).
   - `imageGenerator.generate(element, { width, height, fonts })` → PNG Buffer. **호출은 try/catch 로 감싸져 있고**, satori/resvg 예외는 `captureException(error)` 후 `createAppError('IMAGE_GENERATE_FAILED')`(500)로 변환된다(`service/domain/badge/badge.ts:142-155`).
   - `cache.set(key, buffer, 24h)` 후 `{ buffer, cacheHit: false }` 반환.
3. `route/badge.ts`: `Response` 로 PNG 바이트 반환 + 헤더 `Content-Type: image/png`, `X-Cache: HIT|MISS`, `Cache-Control: public, max-age=31536000, immutable`.

### 이미지 렌더 (`image-generator.ts`)

- `ensureWasm`: 최초 1회 `loadWasm()`(`node_modules/@resvg/resvg-wasm/index_bg.wasm` 읽기) → `initWasm(buffer)` 로 WASM 초기화. 중복 방지는 boolean 플래그가 아니라 **초기화 Promise 메모이즈**(`initPromise ??= (async () => ...)()`)다 — 동시 요청은 같은 Promise 를 await 하고, 실패하면 `initPromise` 를 `null` 로 되돌려 다음 요청이 재시도한다(`service/shared/image-generator.ts:32-46`).
- `satori(element, { width, height, fonts })` → SVG 문자열.
- `new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()` → `Buffer`.

### 폰트 로드 (`font-loader.ts`)

- 로컬 폰트: `LOCAL_FONTS` = Inter(400,700)·Noto Sans KR(400,700). 파일 경로는 `@fontsource/{inter|noto-sans-kr}/files/*.woff`. `basePath` 는 `VERCEL` 이면 `/var/task`, 아니면 `process.cwd()`.
- 요청 weight 는 해당 폰트의 가용 weight 중 **가장 가까운 값**으로 스냅(`closestWeight`).
- `load` fallback 순서: ① 로컬 → ② 없으면 Google Fonts(`fonts.googleapis.com/css2` CSS 파싱 후 woff URL fetch) → ③ 그래도 없으면 로컬 Inter → ④ 실패 시 `null`. 로드 결과는 인메모리 `fontCache` Map 에 캐시.

### 아이콘 로드 (`icon-loader.ts`)

- 로컬(`loadLocal`): 이름이 `^[a-zA-Z0-9_-]+$`(`SAFE_ICON_NAME`) 통과해야 함(경로 탐색 방지). `public/icon/{name}.svg` → 없으면 `.png` 순으로 읽어 base64 data URL 반환.
- 원격(`loadFromUrl`): `isPublicUrl` 통과해야 함(SSRF 방어). 8초 AbortController 타임아웃 fetch. **리다이렉트는 `redirect: 'manual'` 로 직접 따라가며 매 홉의 `Location` 을 `isPublicUrl` 로 재검증**한다(`MAX_REDIRECT_HOPS` 초과·`Location` 없음·사설 URL 이면 중단, 2026-07-10 SSRF 게이트 — 공개 URL 이 사설 IP 로 리다이렉트하는 우회 차단). 매직 바이트로 MIME 판별, ICO 는 `parseICO`(주입 시)로 최대 크기 프레임 선택. SVG 는 `sanitizeSvg`(xml/doctype/script/`on*` 핸들러/외부 `xlink:href`/`javascript:` 등 제거, `xmlns`·`viewBox` 보정) 후 data URL. 결과는 `iconCache` Map 캐시.

## 환경변수

- `VERCEL` — 존재 시 파일 기준 경로를 `/var/task` 로, 아니면 `process.cwd()` 로 분기(`font-loader.ts`, `icon-loader.ts`, `compose/shared.ts` 의 WASM 경로). 배지 전용 env·API 키는 없음(Google Fonts 는 키 불필요).
- 전체 env 인벤토리는 [reference/env.md](../reference/env.md) 참조.

## 에러 코드

| 코드 | 상태 | 발생 |
|------|------|------|
| `IMAGE_GENERATE_FAILED` | 500 | `badgeService.generate` 의 `imageGenerator.generate` 실패(satori/resvg 예외). `GET /image` 의 OpenAPI 응답에도 선언 |
| `SERVICE_NOT_CONFIGURED` | 503 | `badgeService` 미구성 시 `route/index.ts` 의 stub `Proxy` 가 호출 시 throw |

- 정의는 `lib/error-code.ts`·`error-message.ts`·`error.ts` 3파일.
- `IMAGE_GENERATE_FAILED` 는 `service/domain/badge/badge.ts:151` 에서 실제로 throw 된다. 원래 예외는 `captureException` 으로 리포팅되고, 응답에는 `INTERNAL_ERROR` 대신 이 코드가 나간다(상태 코드는 둘 다 500 이라 소비자 영향 없음). 블로그 썸네일 라우트는 이 래핑을 거치지 않아 여전히 `INTERNAL_ERROR` 로 떨어진다.

## 테스트

- `tests/dto/badge.test.ts` — 쿼리/색상/폰트 스키마 검증
- `tests/route/badge.test.ts` — 엔드포인트 동작·헤더·css 화이트리스트
- `tests/service/domain/badge/badge.test.ts` — 생성·캐시·스타일 병합 로직
- `tests/service/shared/image-generator.test.ts` · `font-loader.test.ts` · `icon-loader.test.ts` — 공유 서비스
- `tests/lib/tailwind-converter.test.ts` — Tailwind→CSS 변환

실행:

```
bun test tests/route/badge.test.ts tests/service/domain/badge/badge.test.ts
bun test tests/dto/badge.test.ts tests/lib/tailwind-converter.test.ts
```

## 주의사항 / 함정

- **응답·인메모리 이중 캐시**: 응답 헤더는 `Cache-Control: public, max-age=31536000, immutable`(1년, 파라미터 조합별 URL 이 곧 캐시키). 서버 측은 `createCache` 인메모리 LRU(`compose/shared.ts` 에서 `maxSize: 200`, TTL 24h)로, 배지 서비스가 `cache.set(key, buffer, 24h)` 저장. 인메모리라 프로세스/서버리스 인스턴스별로 독립이며 재시작 시 사라진다.
- **`fontSize=0` 은 auto**: 서비스가 `request.fontSize || round(height*0.5)` 를 쓰므로 `0` 과 미지정이 동일하게 `round(height*0.5)` 로 폴백한다. 이전에는 `??` 여서 `fontSize=0` 이 그대로 전달돼 글자가 보이지 않는 PNG 가 만들어졌고, 그 결과가 응답 캐시(`max-age=31536000`)와 인메모리 캐시에 그대로 고착됐다.
- **`css` 는 컨테이너(div)에만 적용**: `css`/`tailwind` 로 병합된 `computedStyles` 는 컨테이너 스타일에 스프레드된다. 텍스트색·글자크기·굵기·`fontFamily` 는 별도 `span` 스타일에 전용 파라미터(`color`/`fontSize`/`fontWeight`/`font`)로 들어가므로, `css` 의 `color` 는 텍스트가 아니라 컨테이너에 적용된다.
- **스타일 우선순위**: 컨테이너 기본값(width/height/flex/gap/backgroundColor) → `...computedStyles` 순서라, 사용자 `tailwind`/`css` 가 기본값(배경색 등)을 덮어쓸 수 있다. `css` 는 `tailwind` 보다 우선(`mergeStyles(tailwindStyles, css)`).
- **원격 아이콘 SSRF/보안 가드**: `iconUrl` 은 `isPublicUrl`(https 전용, `localhost`·사설/링크로컬 IP 차단)만 허용하고, 원격 SVG 는 `sanitizeSvg` 로 스크립트·이벤트 핸들러를 제거한다. 로컬 `icon` 이름은 `^[a-zA-Z0-9_-]+$` 로 제한.
- **WASM 초기화 비용**: resvg WASM 은 프로세스당 최초 1회 초기화(`ensureWasm`). 콜드 스타트 첫 요청이 상대적으로 느리다. 동시 요청은 메모이즈된 Promise 를 공유하므로 `initWasm` 이 두 번 불려 "Already initialized" 로 500 이 나던 레이스는 없다.
- **공유 서비스 재사용**: `imageGenerator`·`fontLoader` 는 블로그 썸네일 라우트도 사용한다. 이 파일들을 바꿀 때 배지 외 영향 범위를 확인한다.

## 관련 문서

- 공유 서비스 전수 인벤토리: [reference/shared-services.md](../reference/shared-services.md)
- 전체 엔드포인트 표: [reference/api-endpoints.md](../reference/api-endpoints.md)
- 환경변수: [reference/env.md](../reference/env.md)
- Hono/OpenAPI·에러·응답 헬퍼 패턴: [hono-reference.md](../hono-reference.md)
- 아키텍처(계층·compose·배포): [architecture.md](../architecture.md)
