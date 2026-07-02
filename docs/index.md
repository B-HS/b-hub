# docs/ — b-hub 문서 진입점

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 이 문서는 docs/ 전체의 지도이자 읽기 순서다. 레포 요약은 [../AGENTS.md](../AGENTS.md).

## 읽기 순서 (신규 에이전트 온보딩)

1. [../AGENTS.md](../AGENTS.md) — 레포 요약·명령어·절대 규칙 (1분)
2. [memory/stack-and-invariants.md](./memory/stack-and-invariants.md) — 스택·불변 규칙 정본
3. [architecture.md](./architecture.md) — 부트스트랩·계층·DI·요청 라이프사이클·에러/인증 체계
4. [guidelines/folder-guide.md](./guidelines/folder-guide.md) — 폴더별 역할·배치 규칙·변경 체크리스트
5. 작업 대상의 [domains/](#domains--도메인-문서) 문서 + 필요한 [reference/](#reference--전수-레퍼런스) 문서
6. 작업 유형의 [guidelines/](#guidelines--작업-지침서) 지침 (아래 "작업 유형별 빠른 진입")
7. [PROCESS.md](./PROCESS.md) 에 체크리스트 작성 → 작업 → [quality-assurance/pre-merge-checklist.md](./quality-assurance/pre-merge-checklist.md) 통과 → [guidelines/docs-maintenance.md](./guidelines/docs-maintenance.md) 트리거 표로 문서 갱신

## 작업 유형별 빠른 진입

| 하려는 일 | 따라갈 지침 | 함께 볼 것 |
|-----------|------------|-----------|
| 새 도메인 추가 | [guidelines/add-domain.md](./guidelines/add-domain.md) | [architecture.md](./architecture.md) · [reference/db-schema.md](./reference/db-schema.md) |
| 엔드포인트 추가/변경 | [guidelines/add-endpoint.md](./guidelines/add-endpoint.md) | [quality-assurance/endpoint-qa.md](./quality-assurance/endpoint-qa.md) · [reference/api-endpoints.md](./reference/api-endpoints.md) |
| DB 스키마 변경 | [guidelines/db-schema-change.md](./guidelines/db-schema-change.md) | [reference/db-schema.md](./reference/db-schema.md) |
| 어드민 페이지 | [guidelines/admin-page.md](./guidelines/admin-page.md) | [hono-reference.md](./hono-reference.md) · [admin-features.md](./admin-features.md) |
| 외부 API 연동 | [guidelines/external-api-integration.md](./guidelines/external-api-integration.md) | [reference/shared-services.md](./reference/shared-services.md) |
| 에러코드·로깅 | [guidelines/error-handling-and-logging.md](./guidelines/error-handling-and-logging.md) | [logging.md](./logging.md) |
| 테스트 작성 | [testing.md](./testing.md) | — |
| 배포·운영 | [deploy.md](./deploy.md) | — |
| 문서 갱신 | [guidelines/docs-maintenance.md](./guidelines/docs-maintenance.md) | — |

## 문서 지도

### 최상위 — 횡단 핵심

| 문서 | 내용 |
|------|------|
| [architecture.md](./architecture.md) | 전체 아키텍처 — 부트스트랩 순서, 계층 책임(Route/Service/ServiceDb/compose), DI 조립, 미들웨어 체인·HOF 합성, 에러 3파일·자동 로그 캡처, 인증 방식 총람, 명령 표 |
| [deploy.md](./deploy.md) | Vercel 단일 함수(빌드·rewrite·crons), 로컬 개발, db:push, `deploy/caldav-proxy`·`deploy/upload-server` Docker 서비스 |
| [testing.md](./testing.md) | tests/ 구조(소스 미러), 실행 명령, ServiceDb mock·route·admin 테스트 패턴, 현행 스위트 규모 |
| [admin-features.md](./admin-features.md) | 어드민 SSR 전 페이지·컬럼·필터·액션(form POST) 매핑 + `page/admin/` 파일 맵 |
| [logging.md](./logging.md) | `log_events` 중앙 로깅 상세 설계(스키마·수집·자동 캡처·알림·리텐션) |
| [firmware-logging-contract.md](./firmware-logging-contract.md) | ESP32 등 디바이스가 지켜야 할 로그 수집 계약 |
| [hono-reference.md](./hono-reference.md) | Hono JSX SSR 어드민 작성용 프레임워크 레퍼런스 |
| [DESIGN.md](./DESIGN.md) | 블로그 프론트(`gumyo.net` 블로그) 디자인 시스템 — 이 서버가 아닌 소비자 프론트의 시각 정본 |
| [PROCESS.md](./PROCESS.md) | 현재 작업 체크리스트(완료 시 history/ 이관) |

### domains/ — 도메인 문서

각 문서는 동일 템플릿: 개요 / 파일 맵 / 데이터 모델 / API 엔드포인트 / 핵심 흐름 / 환경변수 / 에러 코드 / 테스트 / 주의사항·함정.

| 문서 | 도메인 |
|------|--------|
| [domains/auth.md](./domains/auth.md) | 인증·보안 횡단 — better-auth, 인증 수단 총람(세션/어드민/API토큰/디바이스키/weather-key/widget-token), 레이트리밋, HMAC state |
| [domains/blog.md](./domains/blog.md) | 블로그 API — 게시글·카테고리·태그·댓글·방명록·이미지·OG 썸네일 |
| [domains/mail.md](./domains/mail.md) | 멀티계정 메일 — Gmail OAuth/IMAP, provider 추상화, 동기화, thread, 첨부, 발송, 암호화 |
| [domains/calendar.md](./domains/calendar.md) | 일정 — 이벤트·rrule·그룹·ICS 구독·CalDAV 서버 |
| [domains/drive.md](./domains/drive.md) | 개인 클라우드 — 자산·폴더, R2/GDrive 스토리지 계층, lifecycle cron |
| [domains/spotify.md](./domains/spotify.md) | Spotify — OAuth connect, 토큰 갱신, 위젯 토큰, playing/data |
| [domains/weather.md](./domains/weather.md) | 날씨 — KMA API, 격자 변환, location, weather key(ESP32), mock |
| [domains/resume.md](./domains/resume.md) | 이력서 — resume-data 구조, CRUD |
| [domains/badge.md](./domains/badge.md) | 동적 배지 이미지 — satori+resvg 파이프라인, 아이콘·폰트 |
| [domains/logs.md](./domains/logs.md) | 로그 도메인 파일 맵·엔드포인트(상세는 logging.md) |
| [domains/ai.md](./domains/ai.md) | AI 프로바이더 — codex OAuth/anthropic·ollama API key, 프로바이더 추상화, 모델 캐시, 채팅 세션·프롬프트·첨부, 자격증명 암호화, 사용기록 |

### reference/ — 전수 레퍼런스

| 문서 | 내용 |
|------|------|
| [reference/api-endpoints.md](./reference/api-endpoints.md) | 전 엔드포인트 인벤토리(Method/전체 Path/인증/핸들러) — 단일 정본(SSOT) |
| [reference/db-schema.md](./reference/db-schema.md) | 전 테이블(도메인 그룹별 컬럼·인덱스·FK) + db:push 워크플로 |
| [reference/env.md](./reference/env.md) | 환경변수 전수(필수/기본값/용도/사용 파일) |
| [reference/lib-utilities.md](./reference/lib-utilities.md) | `lib/` 전수 — 새 유틸 작성 전 중복 확인용 |
| [reference/shared-services.md](./reference/shared-services.md) | `service/shared/` 전수 — 역할·의존·주입 관계 |

### guidelines/ — 작업 지침서

| 문서 | 내용 |
|------|------|
| [guidelines/folder-guide.md](./guidelines/folder-guide.md) | 루트 폴더·설정 파일별 역할/배치 규칙/변경 체크리스트 |
| [guidelines/add-domain.md](./guidelines/add-domain.md) | 신규 도메인 추가 절차(스키마→에러→dto→service→compose→route→테스트→문서) |
| [guidelines/add-endpoint.md](./guidelines/add-endpoint.md) | 엔드포인트 추가 절차 |
| [guidelines/db-schema-change.md](./guidelines/db-schema-change.md) | 스키마 변경 절차(MySQL 제약·파괴적 변경 주의) |
| [guidelines/admin-page.md](./guidelines/admin-page.md) | 어드민 페이지 추가 절차(SSR JSX·form POST→303) |
| [guidelines/external-api-integration.md](./guidelines/external-api-integration.md) | 외부 API 연동 패턴(키 관리·OAuth state·mock·캐시) |
| [guidelines/error-handling-and-logging.md](./guidelines/error-handling-and-logging.md) | 에러코드 추가·캡처 경로·severity·알림·민감정보 |
| [guidelines/docs-maintenance.md](./guidelines/docs-maintenance.md) | 문서 유지보수 계약 — 코드 변경→문서 갱신 트리거 표, 스타일 규칙, 배치 기준 |

### quality-assurance/ — 검증 체크리스트

| 문서 | 내용 |
|------|------|
| [quality-assurance/pre-merge-checklist.md](./quality-assurance/pre-merge-checklist.md) | 머지 전 체크(typecheck·test·prettier·컨벤션·문서·시크릿) |
| [quality-assurance/endpoint-qa.md](./quality-assurance/endpoint-qa.md) | 엔드포인트 QA(검증·인증·봉투·OpenAPI·캡처·테스트) |
| [quality-assurance/fe-deps-impact-check.md](./quality-assurance/fe-deps-impact-check.md) | FE 소비자 영향 검수(2026-07 deps 업그레이드 — 400 바디 구조·문구·이메일·코드젠) |

### 기록 폴더 (ai-process §9)

| 폴더 | 용도 |
|------|------|
| [memory/](./memory/stack-and-invariants.md) | 불변 사실·절대 규칙 (세션 무관 항상 적용) |
| [history/](./history/index.md) | 완료 작업 이력 |
| [bug/](./bug/index.md) | 버그 기록(증상/원인/해결) |
| [acknowledge/](./acknowledge/2026-07-02-docs-structure.md) | 사용자 결정·합의 |
| [feedback/](./feedback/index.md) | 지적·교정 리포트(상황부 적용) |
| [utils/](./utils/index.md) | 보조 스크립트 기록 |

## 문서 신뢰 규칙

- 모든 문서 상단의 `> 기준: <날짜> (<브랜치 @ 커밋>) 코드 검증` 은 그 시점 코드와 대조 검증됐다는 뜻이다. 그 이후의 코드 변경은 반영되지 않았을 수 있다 — 의심되면 코드가 정본이고, 발견한 불일치는 [guidelines/docs-maintenance.md](./guidelines/docs-maintenance.md) 절차로 문서를 고친다.
- 문서 간 중복 서술은 금지 — 각 사실은 소유 문서 한 곳에만 있고 나머지는 링크다(엔드포인트=api-endpoints.md, 테이블=db-schema.md, env=env.md).
