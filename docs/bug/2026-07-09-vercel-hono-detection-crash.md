# Vercel production 크래시 — "Requested module is not instantiated yet" (2026-07-09)

> **한 줄 요약**: Vercel 빌더가 54.19.0 부터 이 프로젝트를 hono 프레임워크로 자동 감지해 **비번들 함수(`λ index`)를 추가 생성**했고, better-auth 1.6 분리 패키지의 exports 조건(`node` vs `default`) 불일치로 그 함수의 node_modules 트레이싱이 깨져 **루트 `/` 콜드스타트가 크래시**했다. 수정은 2단계: ① `vercel.json` `"framework": null`(자동 감지 차단, `e26ab62`) + ② **커밋되는 함수 엔트리 `api/index.ts` 셔임**(새 빌더의 소스 시점 함수 열거 대응 — §5-2). ①만으로는 클라우드에서 함수가 0개가 되어 전 경로 404 가 났다.
>
> **이 문서를 읽어야 하는 경우**: `vercel.json` 을 수정할 때 · 의존성(특히 better-auth)을 업그레이드할 때 · Vercel 배포가 `FUNCTION_INVOCATION_FAILED` / `Requested module is not instantiated yet` 로 죽을 때.

## 1. 증상

- ec88797 이후 커밋(a6e0bbc, 0ac4e0d)을 production 배포하면 **루트 `/` 요청만 500** `FUNCTION_INVOCATION_FAILED` ("This Serverless Function has crashed").
- `/api/*`(blog·health 등)·`/admin` 은 같은 배포에서 **정상 동작**. 즉 전면 장애가 아니라 특정 함수만 죽는 부분 장애였다.
- 런타임 로그(아래가 전부이며, 이것이 사용자에게 보인 유일한 에러):

```
TypeError: Requested module is not instantiated yet.
    at link (native:1:11)
    ... (link 6프레임)
    at linkAndEvaluateModule (native:1:11)
    at requestImportModule (native:2)
Bun process exited with exit status: 1.
```

- 당시 대응: api.gumyo.net 을 7/2 빌드(ec88797, `b-hvghy150o`)로 instant rollback 하여 서비스 복구.

## 2. 근본 원인 — 두 요인의 결합 (둘 다 필요조건)

### 2-1. 플랫폼 측: Vercel 빌더의 hono 프레임워크 자동 감지 (54.18.7 → 54.19.0)

빌드 로그 상단 `Vercel CLI <버전>` 이 빌더 버전이다. 이 값은 **우리가 고정할 수 없고 Vercel 이 수시로 올린다.**

| 배포 | 빌드일 | 빌더 CLI | 생성된 함수 | 결과 |
|------|--------|----------|-------------|------|
| `b-hvghy150o` (ec88797) | 2026-07-02 | 54.18.7 | `λ index` 1개 = **자가 번들 `api/index.js`** | 정상 |
| `b-bqssdk95o` (0ac4e0d) | 2026-07-08 | 54.19.0 | `λ index` + `λ api/index` **2개** | `/` 크래시 |

54.19.0 이 hono 의존성을 보고 프레임워크 프리셋을 자동 적용(`.vc-config.json` 에 `"framework": { "slug": "hono" }`)하여, 기존의 자가 번들 함수와 **별개로** 루트 `index.ts` 를 엔트리로 하는 함수를 추가 생성했다:

- `functions/index.func/` = `index.ts` 트랜스파일(4KB) + 소스 디렉토리 + **NFT 트레이싱된 node_modules(약 108MB, 비번들 원시 모듈 그래프)**
- `functions/api/index.func/` = 기존 `vercel-build` 산출물 `api/index.js`(14MB 단일 번들)

라우팅은 `config.json` 기준 `handle: filesystem` 이 rewrite 보다 먼저다. 따라서 `/` 는 rewrite(`/(.*) → /api`)에 닿기 전에 **새로 생긴 `λ index` 에 매칭**된다. `/api/*` 는 여전히 번들 함수로 가서 살아 있었던 이유가 이것.

### 2-2. 의존성 측: better-auth 1.6 분리 패키지의 exports 조건 불일치

deps 업그레이드(`c70b372`~)로 better-auth 1.3 → 1.6. 1.6 은 텔레메트리·유틸을 별도 패키지로 분리해 `dist/index.mjs` 에서 정적 import 한다. 문제는 `@better-auth/telemetry` 의 exports:

```json
".": {
  "dev-source": "./src/index.ts",
  "types": "./dist/index.d.mts",
  "node": "./dist/node.mjs",
  "default": "./dist/index.mjs"
}
```

- **Vercel 의 파일 트레이서**는 `default` 조건의 `dist/index.mjs` 만 함수에 포함시켰다.
- **Bun 런타임**은 `node` 조건의 `dist/node.mjs` 를 resolve 한다 → 파일이 없어 `Cannot find module '@better-auth/telemetry'`.

누락은 전수 확인 결과 정확히 2개 패키지: `@better-auth/telemetry`, `@better-auth/utils`(서브패스 `@better-auth/utils/password`). 이 둘을 채우면 링킹이 끝까지 진행된다(env 검증 도달).

### 2-3. 에러 메시지가 가려진 메커니즘

`Requested module is not instantiated yet` 는 **2차 증상**이다:

1. 콜드스타트 1차 import 가 `Cannot find module '@better-auth/telemetry'` 로 실패 → ESM 그래프가 부분 인스턴스화 상태로 남음.
2. Vercel Bun 런처가 같은 프로세스에서 import 를 재시도 → 깨진 그래프에 대해 link 단계에서 `Requested module is not instantiated yet` (로그에 2회 찍힌 것이 재시도 2회).
3. 프로세스 exit 1 → `FUNCTION_INVOCATION_FAILED`.

1차 에러(진짜 원인)는 로그에 거의 남지 않아, 겉보기에는 Bun 모듈 링커 버그처럼 보인다. **이 메시지를 보면 "그 앞의 실패한 import(모듈 부재 등)" 를 먼저 의심할 것.**

## 3. 배제한 가설 (조사 기록)

- **코드/의존성 자체의 링킹 버그 아님**: macOS Bun 1.3.0/1.3.12, Docker `oven/bun:1.3.12`(Linux) 에서 소스(`bun index.ts`)·번들(`api/index.js`)·동적 import 전부 링킹 통과(env 검증 단계 도달). `bun.lock` 커밋되어 있어 Vercel 과 동일 버전 설치.
- **zod 4 `z.url()` 엄격화로 인한 prod env 검증 실패 아님**: getEnv throw 라면 에러 메시지가 달랐을 것이고, 번들 함수(`/api/*`)는 같은 env 로 정상 동작했다.
- **`--external`(@google/genai·cheerio) 런타임 링킹 문제 아님**: 개별 dynamic import 정상, 번들 함수 정상.
- **0ac4e0d(fast-xml-parser 명시 선언)는 같은 계열 증상을 노린 대응이었으나 무효**: 실제 누락물은 better-auth 분리 패키지였고, 근본 원인이 "팬텀 의존성"이 아니라 "트레이서-런타임 exports 조건 불일치"라서 package.json 선언으로는 못 막는다.

## 4. 재현·진단 방법 (다음에 또 터지면 이 순서로)

```bash
# 1. 정상/실패 배포의 빌드 로그에서 빌더 버전·함수 구성 대조
vercel inspect --logs <deployment-url>   # 상단 "Vercel CLI x.y.z"
vercel inspect <deployment-url>          # Builds 섹션의 λ 목록

# 2. 실배포와 같은 빌더 버전으로 로컬 빌드 (레포 루트에서)
bunx vercel@<빌더버전> build --yes
ls .vercel/output/functions/             # 함수 개수 확인 (정상 = api 1개)

# 3. 트레이싱된 함수를 로컬에서 직접 실행 — 1차 에러(진짜 원인)가 그대로 나온다
cd .vercel/output/functions/index.func && bun -e 'await import("./index.js")'
# "Cannot find module X" 가 나오면: 루트 node_modules 의 X 를 통째로 복사 후 재실행을
# 반복해 누락 전수를 확인한다. env 에러(DATABASE_URL)까지 가면 링킹 완주 = 성공.
```

- 런타임 로그 실시간 확보: `vercel logs <deployment-url>` 스트리밍 상태에서 해당 경로로 요청을 넣어 콜드스타트를 유발.
- 배포 URL 이 Vercel Authentication(302)에 막히면 브라우저(대시보드 로그인 세션)로 접근.

## 5. 수정과 검증

### 5-1. 1차 수정 — `"framework": null` (커밋 `e26ab62`)

`vercel.json` 에 `"framework": null` 을 추가해 hono 자동 감지를 차단했다. `bunx vercel@54.19.0 build` 로컬 검증에서는 함수가 `functions/api/index.func` 1개로 복원되어 충분해 보였다.

### 5-2. 1차 수정의 클라우드 실패 — 소스 시점 함수 열거 (전 경로 404)

그러나 push 후 클라우드 배포(`b-81m9dsgjr`, 빌더 CLI **54.21.1**)는 **함수 0개**로 나와 `/`·`/api/*` 전부 플랫폼 404(`NOT_FOUND`)가 됐다.

- 빌드 로그 증거: 기존 정상 빌드에 있던 함수 컴파일 단계("Using TypeScript x.y.z", 약 50초 소요)가 사라지고 **2초 만에 "Build Completed"**. `vercel inspect` 의 Builds 목록이 빔.
- 원인: **새 빌더 파이프라인은 함수 열거를 소스 트리(클론 시점) 기준으로 한다.** `api/index.js` 는 gitignored 산출물이라 클론 시점에 없고, buildCommand 가 빌드 중에 생성해도 함수로 잡히지 않는다. (구 빌더 ≤54.18.7 은 buildCommand **이후** `api/` 를 열거해 산출물이 함수가 됐다. 7/8 의 54.19.0 은 hono 프리셋 경로라 `λ api/index` 가 생성됐다.)
- 로컬 재현: `rm api/index.js` 후 `bunx vercel@54.21.1 build` → functions 디렉토리 자체가 안 생김. 로컬에서 1차 검증이 통과했던 이유는 **이전 빌드가 남긴 `api/index.js` 가 이미 워킹트리에 존재**했기 때문(fresh clone 조건 미재현 — 함정).

### 5-3. 최종 수정 — 커밋되는 셔임 `api/index.ts`

```ts
export { default } from './index.js'
```

- `api/index.ts` 를 **커밋**한다(.gitignore 를 `api/` → `api/index.js` 로 좁힘). 클론 시점에 존재하므로 함수로 열거된다.
- 함수 빌드는 buildCommand(번들 생성) **이후** 실행되므로, 셔임의 `./index.js` import 가 14MB 자가 번들을 흡수해 최종 핸들러 = 번들 그 자체가 된다. externals(@google/genai·cheerio)만 node_modules 로 트레이싱(약 85MB) — 기존 정상 토폴로지와 동일.
- 셔임이 `../index.ts`(소스)가 아니라 `./index.js`(번들)를 가리키는 것이 핵심: 소스를 가리키면 원시 모듈 그래프 트레이싱으로 §2-2 의 exports 조건 불일치를 그대로 다시 밟는다.

검증: fresh-clone 시뮬레이션(`rm api/index.js` 후 `bunx vercel@54.21.1 build`) → `functions/api/index.func` 생성(핸들러 14MB 번들 + externals node_modules), 로컬 실행 링킹 완주(env 검증 도달), `bunx tsc --noEmit` 0(tsconfig 이 `api` 제외), `bun test` 2278 pass. 클라우드 배포 후 `/`·`/api/health`·`/admin` 스모크 통과(§7 참조).

## 6. 재발 방지 — 앞으로 지킬 것

1. **`vercel.json` 의 `"framework": null` 과 커밋된 `api/index.ts` 셔임을 제거하지 않는다. 둘은 한 세트다.** 이 프로젝트의 배포 계약은 "자가 번들 단일 함수" 다. `framework: null` 만 있으면 함수 0개(전 경로 404, §5-2), 셔임만 있으면 hono 감지로 비번들 `λ index` 가 부활해 `/` 크래시(§2). Vercel 의 hono 프레임워크 지원으로 갈아타려면 트레이싱 문제(exports `node` 조건)가 해소됐는지 §4 방법으로 먼저 로컬 검증할 것.
2. **셔임 `api/index.ts` 는 반드시 번들(`./index.js`)을 가리킨다.** 소스(`../index.ts`)로 바꾸면 원시 그래프 트레이싱으로 §2-2 문제를 그대로 다시 밟는다.
3. **로컬 `vercel build` 검증은 fresh-clone 조건으로.** 검증 전 `rm api/index.js` — 워킹트리에 남은 산출물이 클라우드와 다른 결과를 만든다(§5-2 의 함정).
4. **의존성 업그레이드 후에는 preview 배포에서 `/api/*` 만이 아니라 루트 `/` 도 확인한다.** 이번 사건에서 preview 는 `/api` 만 확인되어 통과처럼 보였다.
5. **production 배포 직후 `/`·`/api/health`·`/admin` 3종 스모크 체크.** 함수가 여러 개로 갈라지면 경로별로 다른 함수가 응답한다.
6. **`Requested module is not instantiated yet` = 2차 증상.** Bun 버그로 단정하지 말고 §4 로 1차 import 실패(모듈 부재)를 먼저 찾는다.
7. **빌드 로그의 `Vercel CLI` 버전은 배포 간 부지불식 변수.** 같은 코드가 갑자기 깨지면 정상/실패 배포의 빌더 버전·Builds(λ 목록)·빌드 소요 시간(함수 컴파일 단계 유무)부터 대조한다. (이 사건 동안에만 54.18.7 → 54.19.0 → 54.21.1 세 번 바뀌었다.)

## 7. 참고 (당시 식별자)

- 정상: `b-hvghy150o` (ec88797, 2026-07-02, CLI 54.18.7) — instant rollback 대상.
- 실패(크래시): `b-9xpqh096i` (a6e0bbc) · `b-owokanq5i`/`b-bqssdk95o` (0ac4e0d) — 2026-07-08, CLI 54.19.0.
- 실패(함수 0개·전 경로 404): `b-81m9dsgjr` (88ec15a, `framework: null` 만 적용) — 2026-07-09, CLI 54.21.1.
- 관련 커밋: deps 업그레이드 `c70b372`~`ed87433`(특히 better-auth 1.6 `c3adc1f`), 무효했던 대응 `0ac4e0d`, 1차 수정 `e26ab62`, 최종 수정(셔임) — 이 문서와 같은 커밋.
- better-auth 1.6.23 기준. 분리 패키지: `@better-auth/{core,telemetry,utils,drizzle-adapter,kysely-adapter,memory-adapter}`.
