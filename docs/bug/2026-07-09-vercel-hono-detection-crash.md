# Vercel production 크래시 — "Requested module is not instantiated yet" (2026-07-09)

## 증상

- ec88797 이후 커밋(a6e0bbc, 0ac4e0d)을 production 배포하면 루트 `/` 요청이 500 `FUNCTION_INVOCATION_FAILED`.
- 런타임 로그: `TypeError: Requested module is not instantiated yet.` ×2 → `Bun process exited with exit status: 1`.
- `/api/*` 는 정상. api.gumyo.net 은 ec88797(7/2 빌드, b-hvghy150o)로 instant rollback 하여 복구된 상태였음.

## 근본 원인 (두 요인의 결합)

1. **Vercel 빌더 변경 (플랫폼 측)**: 정상 빌드(7/2)는 Vercel CLI 54.18.7, 실패 빌드(7/8)는 54.19.0. 54.19.0 이 이 프로젝트를 **hono 프레임워크로 자동 감지**해 기존 `λ api/index`(자가 번들 14MB) 외에 **`λ index`** 를 추가 생성. `λ index` = 루트 `index.ts` 트랜스파일(4KB) + **NFT 트레이싱된 node_modules**(비번들, 원시 모듈 그래프). filesystem 라우팅에서 `/` 가 rewrite 보다 먼저 `λ index` 에 매칭됨.
2. **better-auth 1.6 분리 패키지의 exports 조건 불일치 (의존성 측)**: deps 업그레이드(c70b372~)로 better-auth 1.3→1.6. 1.6 은 `@better-auth/telemetry`·`@better-auth/utils` 를 분리 패키지로 정적 import 하는데, 이들 exports 가 `node` 조건(`dist/node.mjs`)과 `default` 조건(`dist/index.mjs`)으로 갈라짐. **Vercel 트레이서는 `default` 파일만 포함, Bun 런타임은 `node` 파일을 resolve** → 파일 부재.

콜드스타트 1차 import 가 `Cannot find module '@better-auth/telemetry'` 로 실패 → ESM 그래프가 부분 인스턴스화 상태로 남음 → 런타임 재시도 import 가 `Requested module is not instantiated yet` 로 표출(진짜 에러가 가려짐) → 프로세스 exit 1.

## 재현·검증 절차

- 로컬(macOS bun 1.3.0/1.3.12)·Docker(oven/bun:1.3.12 Linux) 소스 실행은 전부 링킹 통과 → 코드 자체 문제 아님.
- `bunx vercel@54.19.0 build` 로컬 실행 → `functions/index.func` 생성 확인, `bun -e 'await import("./index.js")'` 로 `Cannot find module '@better-auth/telemetry'` 재현.
- 누락 패키지 전수(반복 실행): `@better-auth/telemetry`, `@better-auth/utils`(서브패스 `/password`) 2개뿐. 채우면 env 검증까지 도달(링킹 완주).
- 실배포 검증: `λ index` 가 받는 `/` 만 500, `λ api/index` 가 받는 `/api/*`·`/admin` 은 정상 — 토폴로지 가설과 일치.

## 수정

`vercel.json` 에 `"framework": null` 명시 → hono 자동 감지 차단. `bunx vercel@54.19.0 build` 재검증: 함수가 `api/index.func` 1개로 복원(기존 검증된 토폴로지), `/` → rewrite → `/api` 라우팅 유지, 번들 링킹 완주.

## 교훈

- `Requested module is not instantiated yet` 는 2차 증상. 1차 원인은 그 앞의 실패한 import(모듈 부재 등)이며 재시도 시 가려진다.
- 자가 번들(`bun build` 단일 파일) 전략은 트레이싱 누락에 면역 — 플랫폼이 비번들 함수를 추가 생성하는 순간 exports 조건(`node` vs `default`) 불일치가 표면화된다.
- 0ac4e0d 의 fast-xml-parser 명시 선언은 같은 계열 증상 대응이었으나 실제 누락물은 better-auth 분리 패키지였음. 팬텀 의존성 선언으로는 트레이서-런타임 조건 불일치를 못 막는다.
- 플랫폼 빌더 버전(빌드 로그 상단 Vercel CLI 버전)은 배포 간 부지불식 변수 — 정상/실패 배포의 빌드 로그 대조가 최단 경로였다.
