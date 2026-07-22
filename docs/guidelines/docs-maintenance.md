# 문서 유지보수 계약 (docs maintenance)

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 다루는 코드: `docs/**`, `docs/PROCESS.md`, `AGENTS.md`, `CLAUDE.md`, `~/.claude/convention/ai-process.md`

## 소유 범위

- 이 문서는 **docs/ 트리 전체의 유지보수 규칙**만 소유한다: 문서 지도(폴더별 용도), 코드 변경 → 갱신 문서 트리거 표, 문서 스타일 규칙, 신규 문서 배치 판단, PROCESS.md 운영, 부패 검증 절차, 기록 폴더(bug·feedback·acknowledge) 양식.
- 각 도메인·레퍼런스의 **내용**은 이 문서가 소유하지 않는다. 무엇이 어디에 있는지의 지도와 갱신 규칙만 다루고, 실체는 링크한다.
- 코드를 바꾼 뒤 어떤 문서를 갱신할지는 이 문서의 [트리거 표](#트리거-표--코드-변경--갱신-문서)가 단일 출처다(`AGENTS.md` 4번이 이 표를 가리킨다).

---

## 1. 문서 지도

### 최상위 문서 (`docs/*.md`)

| 문서 | 소유 범위 |
|------|-----------|
| [index.md](../index.md) | 진입점 — 문서 지도·읽기 순서(모든 에이전트의 시작점) |
| [PROCESS.md](../PROCESS.md) | 현재/누적 작업 체크리스트(완료 시 `history/` 이관). **집필 워크플로에서 직접 수정 금지 — §5 참조** |
| [architecture.md](../architecture.md) | 전역 골격 — 부트스트랩·compose DI·계층 경계·미들웨어 파이프라인·에러/응답/HOF 패턴 |
| [deploy.md](../deploy.md) | 배포 3종(Vercel 함수 + `deploy/` Docker 2개)·빌드·env 배선·cron |
| [testing.md](../testing.md) | `bun test` 러너·`tests/` 미러 구조·작성 규약 |
| [logging.md](../logging.md) | `log_events` 중앙 로깅·서버 4xx·5xx 자동 캡처·디바이스 수집 |
| [firmware-logging-contract.md](../firmware-logging-contract.md) | ESP32 등 외부 디바이스가 지켜야 하는 로그 수집 계약 |
| [admin-features.md](../admin-features.md) | `page/admin/**` 어드민 UI 기능 맵(테이블→페이지 매핑) |
| [hono-reference.md](../hono-reference.md) | 어드민 SSR JSX 렌더링·폼·가드 Hono 패턴 |
| [DESIGN.md](../DESIGN.md) | 블로그 프론트 디자인 시스템(외부 소비자 자산). **어떤 경우에도 수정 금지** |

### 하위 폴더 (`docs/<folder>/`)

| 폴더 | 소유 범위 | 파일 규칙 |
|------|-----------|-----------|
| [domains/](../domains/) | 도메인별 문서(파일 맵·데이터 모델·엔드포인트·흐름·함정). 현재 12종: ai·auth·badge·blog·calendar·drive·logs·mail·metrics·resume·spotify·weather | `<domain>.md` 1도메인 1파일 |
| [reference/](../reference/) | 전수 인벤토리 — `db-schema.md`(테이블·컬럼)·`api-endpoints.md`(전 라우트)·`env.md`(환경변수)·`lib-utilities.md`(lib/ 전수)·`shared-services.md`(service/shared 전수) | 주제별 1파일, 카운트·표 중심 |
| [guidelines/](./) | 작업 유형별 절차 지침서(체크리스트). 이 문서 포함. 현재 8종: 신규 도메인 추가([add-domain.md](./add-domain.md))·엔드포인트 추가([add-endpoint.md](./add-endpoint.md))·DB 변경([db-schema-change.md](./db-schema-change.md))·어드민 페이지([admin-page.md](./admin-page.md))·외부 API 연동([external-api-integration.md](./external-api-integration.md))·에러/로깅([error-handling-and-logging.md](./error-handling-and-logging.md))·폴더별 지침([folder-guide.md](./folder-guide.md))·문서 유지보수(이 문서) | `<주제>.md` |
| [quality-assurance/](../quality-assurance/) | 검증 체크리스트 — 머지 전 통과 기준([pre-merge-checklist.md](../quality-assurance/pre-merge-checklist.md))·엔드포인트 QA([endpoint-qa.md](../quality-assurance/endpoint-qa.md))·의존성 업그레이드 FE 소비자 영향 검수([fe-deps-impact-check.md](../quality-assurance/fe-deps-impact-check.md)) | `<주제>.md`, 체크박스 진행 추적 |
| [memory/](../memory/) | 장기 기억 — 세션·에이전트가 바뀌어도 불변인 전제([stack-and-invariants.md](../memory/stack-and-invariants.md)) | 주제별 1파일 |
| [history/](../history/) | 완료 작업 이력. PROCESS.md 완료분 이관처 | `YYYY-MM-<요약>.md` + [index.md](../history/index.md) 목록 |
| [bug/](../bug/) | 버그 기록(증상·원인·해결) | `<요약>.md` + [index.md](../bug/index.md) 목록 — §7.1 |
| [acknowledge/](../acknowledge/) | 사용자 결정·합의·전제 | `YYYY-MM-DD-<요약>.md` — §7.3 |
| [feedback/](../feedback/) | 지적·교정 리포트(상황별 적용) | `YYYY-MM-DD-<요약>.md` + [index.md](../feedback/index.md) 목록 — §7.2 |
| [utils/](../utils/) | 작업 보조 스크립트(`scripts/`) 기록 | [index.md](../utils/index.md) 단일 표 |

> `docs/` 분류의 근거는 `~/.claude/convention/ai-process.md` §9, 구조 확정 합의는 [acknowledge/2026-07-02-docs-structure.md](../acknowledge/2026-07-02-docs-structure.md).

---

## 2. 트리거 표 — 코드 변경 → 갱신 문서

> 코드를 바꾸면 아래 매핑대로 해당 문서를 **같은 작업 안에서** 갱신한다(`~/.claude/convention/ai-process.md` §9, `docs/guidelines/docs-maintenance.md` = `AGENTS.md` 4번의 대상). `<d>` = 해당 도메인.

| 코드 변경 | 갱신할 문서 | 갱신 항목 |
|-----------|-------------|-----------|
| 라우트 추가·삭제·경로/인증 변경 (`route/**`, `route/index.ts`) | [reference/api-endpoints.md](../reference/api-endpoints.md) + [domains/`<d>`.md](../domains/) | 평면 인벤토리(method·path·인증·핸들러 파일) + 도메인 엔드포인트 섹션 |
| 어드민 라우트·페이지 (`page/admin/**`, `page/index.ts`) | [admin-features.md](../admin-features.md) (+ 새 Hono 패턴이면 [hono-reference.md](../hono-reference.md)) | 테이블→페이지 매핑·기능 맵 |
| 스키마 변경 (`db/schema.ts`) | [reference/db-schema.md](../reference/db-schema.md) + [domains/`<d>`.md](../domains/) (+ 어드민 노출 시 [admin-features.md](../admin-features.md)) | 테이블·컬럼·관계·테이블 수 + 도메인 데이터 모델 |
| 환경변수 추가·변경 (`lib/env.ts`, `.env.example`) | [reference/env.md](../reference/env.md) (+ 도메인 전용이면 [domains/`<d>`.md](../domains/), 배포/인프라 env 면 [deploy.md](../deploy.md)) | env 키 표·필수/선택·키 수 |
| lib 파일 추가·시그니처 변경 (`lib/*.ts`) | [reference/lib-utilities.md](../reference/lib-utilities.md) (+ 새 HOF·응답/에러 패턴이면 [architecture.md](../architecture.md)) | lib 인벤토리·파일 수·소비자 |
| 에러 코드 추가 (`lib/error-code.ts`·`error-message.ts`·`error.ts`) | [reference/lib-utilities.md](../reference/lib-utilities.md) + [domains/`<d>`.md](../domains/) | 코드 수·`STATUS_MAP` 정합 확인 + 도메인 에러 목록 |
| 공유 서비스 추가 (`service/shared/*.ts`, `compose/shared.ts`) | [reference/shared-services.md](../reference/shared-services.md) (+ 주입 배선 변화면 [architecture.md](../architecture.md)) | 서비스 팩토리 인벤토리·주입 관계 |
| 도메인 서비스 로직 변경 (`service/domain/<d>/*`, `compose/<d>.ts`, `dto/<d>/*`) | [domains/`<d>`.md](../domains/) | 파일 맵·데이터 흐름·함정 |
| 신규 도메인 전체 | [domains/`<new>`.md](../domains/)(신규) + [reference/api-endpoints.md](../reference/api-endpoints.md) + [reference/db-schema.md](../reference/db-schema.md)(테이블 시) + [architecture.md](../architecture.md)(compose 배선) + [AGENTS.md](../../AGENTS.md)·[index.md](../index.md)(도메인 목록·지도) + [guidelines/folder-guide.md](./folder-guide.md)·이 문서 §1(도메인 폴더·테이블·에러코드 카운트) + [guidelines/add-endpoint.md](./add-endpoint.md)(기존 도메인 목록) | 신규 도메인 문서 + 인벤토리 반영 + 배선 + 각 카운트 |
| 미들웨어 변경 (`middleware/*`) | [architecture.md](../architecture.md) (+ 인증이면 [reference/api-endpoints.md](../reference/api-endpoints.md) 인증 표기, 로그캡처면 [logging.md](../logging.md)) | 전역 파이프라인·인증 범례 |
| 로깅·수집 (`middleware/log-capture.ts`, `route/logs/*`, `dto/logs/*`, `service/domain/logs/*`) | [logging.md](../logging.md) (+ 디바이스 수집 계약이면 [firmware-logging-contract.md](../firmware-logging-contract.md)) | 캡처 경로·수집 스키마·계약 |
| 배포·빌드 (`vercel.json`, `package.json` scripts, `bunfig.toml`, `deploy/**`) | [deploy.md](../deploy.md) | 빌드·배포 대상·cron |
| 의존성 major 업그레이드 (`package.json` dependencies, `bun.lock`) | [history/](../history/)(업그레이드 이력) (+ 외부 계약·검증 응답이 바뀌면 [quality-assurance/](../quality-assurance/) FE 소비자 영향 검수 — 표본 [fe-deps-impact-check.md](../quality-assurance/fe-deps-impact-check.md), 영향받는 [reference/](../reference/)·[domains/](../domains/)) | 버전·breaking 대응·소비자 영향 |
| 테스트 러너·구조 (`bunfig.toml`, `tests/**` 구조) | [testing.md](../testing.md) | 러너·위치·작성 규약 |
| 계층·스택·커밋 등 불변 규칙 변화 | [memory/stack-and-invariants.md](../memory/stack-and-invariants.md) + [AGENTS.md](../../AGENTS.md) | 전제·절대 규칙 |
| 블로그 프론트 디자인 시스템 | [DESIGN.md](../DESIGN.md) | (이 집필 워크플로에선 수정 금지 — 소유만 명시) |

> 도메인이 여러 계층에 흩어지는 원칙(한 도메인 = route/service/dto/compose 4곳): [architecture.md](../architecture.md). 어느 도메인 문서를 고를지 모호하면 `route/index.ts` 의 마운트 접두사(`/api/<d>`)로 판별한다.

---

## 3. 문서 스타일 규칙

- **언어·톤**: 한국어 문서체(개조식). 미사여구·자축·과장 금지. "완벽/잘 됨" 단정 금지. 코드로 확인한 사실만 기술한다.
- **기준 인용 블록**: 문서 첫 줄 제목 바로 아래에 `> 기준: <커밋/날짜> 코드 검증. 다루는 코드: <경로 목록>` 1줄. 커밋 형식은 `<브랜치> @ <short-sha>`(주 검증 대상은 `dev`, 작업 브랜치면 그 브랜치명), 날짜 형식은 `YYYY-MM-DD`. "다루는 코드" 에는 그 문서가 사실을 뽑은 파일 경로를 전부 적는다.
- **경로 표기**: 파일·디렉터리 경로는 레포 루트 상대경로를 인라인 코드(`route/blog/post.ts`)로. 인벤토리·매핑은 markdown 표로.
- **중복 금지**: 다른 문서가 소유한 내용을 재서술하지 않고 상대경로 링크한다. 각 문서는 자기 소유 범위만 서술한다(소유 경계는 §1 지도).
- **수치·고유명**: 카운트(테이블 수·에러코드 수·env 키 수 등)·엔드포인트 method/path·테이블·컬럼·함수·env·에러코드는 반드시 코드 Read 로 확인 후 기재. 확인 못 한 것은 쓰지 않는다.
- **시크릿 금지**: 실제 토큰·키·DSN·접속정보를 문서에 적지 않는다. env 는 키 이름·용도만.

---

## 4. 신규 문서 배치 결정 규칙

새 문서를 만들 때 아래 순서로 폴더를 결정한다.

1. **코드의 전수 인벤토리인가**(전 라우트·전 테이블·전 env·전 lib·전 shared) → `reference/`.
2. **한 도메인의 설계 설명인가**(파일 맵·흐름·함정) → `domains/<d>.md`.
3. **작업 절차·체크리스트인가**("이럴 때 이렇게 한다") → `guidelines/`.
4. **머지·검증 기준인가**(했는지/안 했는지 체크박스) → `quality-assurance/`.
5. **불변 전제인가**(세션 바뀌어도 유지) → `memory/`. **사용자와의 결정·합의**면 → `acknowledge/`. **상황별 교정 노트**면 → `feedback/`.
6. **완료된 작업 이력**이면 → `history/`. **버그 리포트**면 → `bug/`. **보조 스크립트**면 → `utils/`.
7. **전역 골격·배포·테스트·로깅 같은 횡단 단일 주제**면 → `docs/` 최상위.

- 판단 애매 시 규칙: "무엇이 어디에 있는지"(지도·인벤토리)는 `reference/`·`domains/`, "어떻게 일하는가"(절차)는 `guidelines/`, "무엇을 확인했는가"(검증)는 `quality-assurance/`.
- 두 폴더에 걸치면 한쪽을 **정본**으로 두고 다른 쪽은 링크(중복 금지, §3).
- 폴더별 파일명 규칙은 §1 지도의 "파일 규칙" 열을 따른다(날짜 접두 여부).

---

## 5. PROCESS.md 운영

- **시작**: 작업 a·b·c·d 가 생기면 [PROCESS.md](../PROCESS.md) 에 markdown 체크리스트 + 각 항목 상세를 적고, 상단에 기준 문서(베이스 룰)를 명시한다(`~/.claude/convention/ai-process.md` §2).
- **진행**: 매 스텝 완료 시 해당 항목을 `[x]` 로 체크하고 다음으로 넘어간다. 체크리스트에 없는 행동은 하지 않는다. 범위를 벗어나는 작업이 필요하면 멈추고 사용자에게 묻는다(§3, ai-process §3).
- **완료**: 작업이 끝나면 그 체크리스트·결정 요약을 [history/](../history/)(`YYYY-MM-<요약>.md`)로 이관하고 [history/index.md](../history/index.md) 목록에 1행 추가한다. PROCESS.md 의 "완료 작업(이력)" 섹션에는 history 링크만 남긴다.
- **주의**: 이 문서를 만든 집필 워크플로에서는 `PROCESS.md`·`DESIGN.md` 를 직접 수정하지 않는다(별도 소유). 위 운영 규칙은 일반 작업 세션의 절차 계약이다.

---

## 6. 문서 부패 검증법 (주장 → 코드 대조)

문서가 코드와 어긋났는지(부패) 확인하는 절차. 트리거 표 갱신 후, 그리고 주기적으로 수행한다.

1. **기준 블록 확인**: 문서 상단 `> 기준:` 의 커밋과 현재 `git log -1 --format='%h'` 를 비교. "다루는 코드" 경로가 그 사이 변경됐는지 `git log <ref>..HEAD -- <경로>` 로 확인.
2. **주장 → 코드 재확인**: 각 사실(엔드포인트·테이블·컬럼·함수·env·에러코드)을 `grep`/Read 로 코드에서 직접 재확인한다. 추측·기억 금지.
   - 라우트: `grep -rn "route\.\(get\|post\|put\|delete\|patch\)" route/` 로 실제 등록과 대조.
   - 테이블/컬럼: `db/schema.ts` 의 `mysqlTable(...)` 정의와 대조.
   - env: `lib/env.ts` 의 `envSchema` 키와 대조.
   - 에러코드: `lib/error-code.ts` 의 `ERROR_CODE` 와 `error-message.ts`·`STATUS_MAP` 3파일 정합 대조.
3. **카운트 재집계**: 수치(테이블 수 — [reference/db-schema.md](../reference/db-schema.md), 에러코드 수 — [reference/lib-utilities.md](../reference/lib-utilities.md), env 키 수 — [reference/env.md](../reference/env.md), 라우트 수 — [reference/api-endpoints.md](../reference/api-endpoints.md), 공유 서비스 수 — [reference/shared-services.md](../reference/shared-services.md))는 각 정본이 소유한다. 검증 시 실제로 다시 세어 대조한다(정본 밖에서 수치를 복제하지 않는다. `admin-features.md` 의 라우트·서비스 팩토리 수는 참고용 복제이므로 정본이 아니다).
4. **불일치 처리**: 어긋나면 문서를 수정하고 `> 기준:` 의 커밋/날짜를 갱신한다. 코드가 틀린 것으로 판단되면 문서를 고치지 말고 멈춰 사용자에게 묻는다(ai-process §3).
5. **링크 무결성**: 상대경로 링크가 실제 파일을 가리키는지 확인(`grep -ro '\](\.\./[^)]*)' docs/` 로 추출 후 존재 검사). 소유 이동 시 링크도 함께 갱신한다.

---

## 7. 기록 폴더 양식

### 7.1 bug/ — 버그 기록

- 파일: 버그 1건 = `<요약>.md`, [bug/index.md](../bug/index.md) 목록 표에 1행(요약·상태) 추가.
- 필수 항목:

```markdown
# <버그 요약>

> 기준: <날짜/커밋>. 다루는 코드: <경로들>

## 대상 파일
- <파일 경로>(함수/라인)

## 증상
- 관찰된 잘못된 동작

## 근본 원인
- 코드로 확인한 원인(추측 금지)

## 해결
- 수정 내용(+ 커밋 해시)

## 재발 방지 / 백필
- (있으면) 백필 스크립트·가드
```

### 7.2 feedback/ — 지적·교정 리포트

- 파일: 지적 1건 = `YYYY-MM-DD-<요약>.md`, [feedback/index.md](../feedback/index.md) 목록에 추가. `memory/`(항상 적용)와 달리 **상황에 따라 적용**하는 노트.
- 필수 항목: **무엇을 지적받았나**(증상/사용자 발언) / **왜 틀렸나**(근본 원인) / **어떻게 고치나** / **언제 적용하나**(적용 조건 — 무조건 아님).
- 보편 규칙으로 굳으면 이 폴더에서 [memory/](../memory/) 또는 컨벤션으로 승격하고 원본 삭제.

```markdown
# <지적 요약>

## 무엇을 지적받았나
- 증상 / 사용자 발언

## 왜 틀렸나
- 근본 원인

## 어떻게 고치나
- 올바른 해결

## 언제 적용하나
- 적용 조건(이 상황에서만)
```

### 7.3 acknowledge/ — 결정·합의

- 파일: 합의 1건 = `YYYY-MM-DD-<요약>.md`. 사용자가 내린 결정·합의·전제를 기록해 재발 시 그 결정을 따른다.
- 필수 항목: **결정**(무엇으로 정했나 — 표/목록) / **이유**(왜). 표본: [acknowledge/2026-07-02-docs-structure.md](../acknowledge/2026-07-02-docs-structure.md).

```markdown
# <합의 요약> (YYYY-MM-DD)

## 결정
- 정한 내용(표/목록)

## 이유
- 근거·배경
```

> history/(완료 이력, `YYYY-MM-<요약>.md`)·utils/(스크립트 표)·memory/(불변 전제)의 양식은 각 폴더 [index.md](../history/index.md) 및 [memory/stack-and-invariants.md](../memory/stack-and-invariants.md) 서두 규칙을 따른다.
