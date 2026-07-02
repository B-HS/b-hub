# DB 스키마 변경 지침

> 기준: 2026-07-02 (dev @ `f20afcf`) 코드 검증. 다루는 코드: `db/schema.ts`, `drizzle.config.ts`, `package.json`, `.gitignore`

## 개요

이 레포는 **마이그레이션 파일이 없다.** 스키마 변경은 `db/schema.ts` 를 고치고 `bun run db:push`(= `drizzle-kit push`)로 실 DB 에 직접 반영한다. 이 문서는 그 변경 절차·검증·MySQL 제약·문서 갱신만 소유한다. 테이블·컬럼·인덱스의 실제 인벤토리는 [../reference/db-schema.md](../reference/db-schema.md), 명령 표는 [../architecture.md](../architecture.md) §8, 불변 규칙은 [../memory/stack-and-invariants.md](../memory/stack-and-invariants.md) 가 소유한다 — 중복 서술하지 않는다.

## 전제 (불변 사실)

- 스키마 단일 출처는 `db/schema.ts`(`drizzle-orm/mysql-core`). 이 파일이 DB 스키마의 정본이고, DB 는 파생물이다.
- **마이그레이션 파일 없음.** `drizzle/`(= `drizzle.config.ts` 의 `out`)과 `drizzle-kit generate` 산출물은 `.gitignore` 됨 — 커밋하지 않는다. 로컬 DDL 확인 용도로만 쓴다.
- `db:push` 는 diff 를 계산해 **실 DB 에 즉시 적용**한다. 되돌리는 down 스크립트가 없으므로 반영 전에 diff 를 확인하는 것이 핵심이다.
- `drizzle.config.ts` 는 `schema: './db/schema.ts'`, `out: './drizzle'`, `dialect: 'mysql'`, `dbCredentials.url: process.env.DATABASE_URL`. **`getEnv()` 가 아니라 `process.env.DATABASE_URL` 을 직접** 읽으므로, `.env` 의 `DATABASE_URL` 로 접속한다(`bun run` 이 `.env` 를 로드).

### 명령 (`package.json` scripts)

| 명령 | 실제 커맨드 | 용도 |
|------|-------------|------|
| `bun run db:generate` | `drizzle-kit generate` | 스키마 diff → SQL DDL 산출. **반영 안 함**, `drizzle/`(gitignored) 에 생성. 미리보기·검증용 |
| `bun run db:push` | `drizzle-kit push` | diff 를 실 DB 에 **직접 반영**. 현재 워크플로의 반영 수단 |
| `bun run db:studio` | `drizzle-kit studio` | Drizzle Studio 로 실 DB 브라우징(반영 결과 확인) |

## 변경 절차 (체크리스트)

변경 1건마다 아래를 순서대로 밟는다. 각 단계 검증 후 다음으로 넘어간다.

- [ ] **1. `db/schema.ts` 수정** — 테이블/컬럼/인덱스/관계를 편집한다. 네이밍·타입·인덱스 관례는 아래 [스키마 작성 관례](#스키마-작성-관례) 를 따른다. 코드 컨벤션(arrow function·주석 금지 등)은 스키마 파일에도 동일 적용.
- [ ] **2. DDL 미리 검증 — `bun run db:generate`** — 생성된 SQL(`drizzle/` 하위, gitignored)을 열어 diff 가 의도대로인지 확인한다. 특히 `ALTER TABLE ... DROP` / `ADD COLUMN` 이 예상과 맞는지, 파괴적 구문이 없는지 본다. **이 산출물은 커밋하지 않는다.**
- [ ] **3. 실 DB 반영 — `bun run db:push`** — 확인이 끝나면 반영한다. 파괴적 변경이면 [파괴적 변경](#파괴적-변경-drop--rename) 을 먼저 읽는다.
- [ ] **4. 검증** — `bun run db:studio` 로 테이블/컬럼/인덱스가 실제로 반영됐는지, 또는 어드민(`/admin`, `page/admin/db.ts` 조회 계층)에서 데이터가 정상 조회되는지 확인한다. 타입 파생이 바뀌었으면 `bunx tsc --noEmit` 도 돌린다.
- [ ] **5. 문서 갱신** — [../reference/db-schema.md](../reference/db-schema.md) 의 인벤토리와, 해당 테이블을 소유하는 [../domains/](../domains/) 문서의 데이터 모델 절을 갱신한다. → [문서 갱신 트리거](#문서-갱신-트리거)

> `db:push` 는 인터랙티브 CLI 다. 변경이 파괴적일 수 있으면 확인을 요구하므로 **비대화형 파이프라인/CI 에서 무인 실행하지 않는다** — 로컬에서 diff 를 보며 수동 반영한다.

## 스키마 작성 관례

`db/schema.ts` 실물 기준. 새 테이블/컬럼은 기존 관례에 맞춘다.

### 물리명 ↔ TS 필드

- **신규 계열**(better-auth·mail·spotify·calendar·drive·logs·weather·`image_assets` 등)은 물리 컬럼 **snake_case** + TS 필드 **camelCase**(예: `error_code`→`errorCode`).
- **레거시 블로그 계열**(`posts`·`comments`·`messages` 등)은 물리 컬럼명 자체가 camelCase — 신규 테이블에서 따라하지 말 것. 상세는 [../reference/db-schema.md](../reference/db-schema.md) §공통 규칙.

### 컬럼 타입·기본값

- **PK**: 대부분 `int().autoincrement()`. 대량 로그는 `bigint({ mode: 'number' }).autoincrement()`(`log_events`). UUID PK 는 `varchar(36)`(better-auth 4테이블·`image_assets`·`messages`·calendar·`drive_folders`). 순수 조인 테이블은 PK 없이 조합 unique 만.
- **타입 파생은 손으로 적지 않는다** — 스키마 하단에서 `typeof X.$inferSelect` / `$inferInsert` 로 export(예: `LogEvent`, `NewLogEvent`).

### timestamp(3) vs datetime(3) 선택 기준

시각 컬럼은 fsp 3(밀리초)을 쓰되, **서버 권위 시각인지 / 클라이언트 벽시계인지**로 타입을 가른다. (logging.md 의 실제 결정 사례)

| 타입 | 언제 | 예 |
|------|------|----|
| `timestamp(col, { fsp: 3 }).defaultNow().notNull()` | 서버가 insert 시점에 기록하는 권위 시각. `updatedAt` 은 추가로 `.$onUpdate(() => new Date())` | `created_at`, `updated_at` |
| `datetime(col, { fsp: 3 })` | 클라이언트/외부가 준 벽시계를 TZ 변환 없이 저장. nullable, 암묵 default·2038 회피 | `log_events.occurred_at`/`resolved_at` |

- `log_events` 는 이 결정을 그대로 적용: `occurred_at`/`resolved_at` = `datetime(3)`(클라 벽시계, NTP 전엔 null), `created_at` = `timestamp(3).defaultNow()`(서버 insert 권위 시각). 근거는 [../logging.md](../logging.md) §Postgres → MySQL 번역 결정.
- 앱이 값을 넣는 시각 컬럼은 default 없이 둔다: `calendar_event.dtstart`/`dtend`/`dtstamp` 는 서브초 정밀도가 불필요해 `datetime`(fsp 없음, notNull, default 없음), 사용 시각 `last_used_at` 은 nullable `timestamp(3)`(defaultNow 없이 사용 시점에 세팅).

### 인덱스·유니크 네이밍

`mysqlTable(name, cols, (table) => [ ... ])` 의 3번째 인자 배열에 선언한다.

- **일반 인덱스**: `index('idx_<table>_<컬럼들>').on(...)` — 예: `idx_api_token_user`, `idx_mail_messages_account_folder_received`, `idx_log_events_service_created`.
- **복합 유니크**: `unique('uq_<table>_<컬럼들>').on(...)` — 예: `uq_mail_accounts_user_email`, `uq_cloud_assets_user_hash`.
- **단일 컬럼 유니크**: 컬럼 정의에 인라인 `.unique()`(별도 이름 없이, Drizzle/MySQL 자동 네이밍) — 예: `email`, `token`, `r2_key`, `uid`, `ics_token`.
- **순수 조인 테이블**: 이름 없는 `unique().on(a, b)` — 예: `post_tags`, `message_images`, `follows`.
- 새 인덱스는 `idx_`/`uq_` 접두 + 테이블명 + 컬럼 순서로 네이밍한다(기존 전부 이 규칙).

## MySQL 제약 (주의)

이 스키마는 MySQL 이다. Postgres 관용을 그대로 옮기면 push 가 깨지거나 의도와 달라진다. 실제로 밟은 결정은 [../logging.md](../logging.md) §Postgres → MySQL 번역 결정에 기록돼 있다.

| 제약 | 내용 | 이 레포의 대응 |
|------|------|----------------|
| **partial index 미지원** | `WHERE` 조건부 인덱스 불가 | `log_events` 의 미해소 조회는 partial 대신 **전체 복합 인덱스** `idx_log_events_code_resolved`(`error_code`, `resolved_at`) 로 |
| **GIN / jsonb_path_ops 미지원** | json 컬럼 함수형 인덱스 불가 | `log_events.details`(json)·mail 주소 json 은 **인덱싱하지 않음** |
| **json 컬럼 리터럴 default 불가** | json 은 리터럴 default 를 못 붙임(표현식 default 는 MySQL 8.0.13+) | `log_events.details` 는 **default 없이 nullable**. 배열 초기값이 필요한 mail json(`to_addresses`/`cc_addresses`/`bcc_addresses`)은 Drizzle `.default([])` 로 선언 → 이런 컬럼 추가 시 `db:generate` 로 생성 DDL 을 반드시 확인 |
| **타입 매핑** | Postgres 타입은 직접 대응 없음 | `bigserial`→`bigint AUTO_INCREMENT`, `timestamptz`→`timestamp(3)`/`datetime(3)`, `jsonb`→`json`, `inet`→`varchar(45)` |

- 특수 타입 참고: `longtext`(대용량 본문, `mail_messages.body_html/body_text`), `mediumblob`(`customType` 로 정의, `cloud_assets.thumbnail_blob`), `mysqlEnum`(`calendar_event.status`/`transp`), `json().$type<...>()`(타입 지정 json).

## 파괴적 변경 (drop / rename)

`db:push` 는 실 DB 에 직접 diff 를 적용하므로, 아래 변경은 데이터 손실 위험이 있다. **반드시 `db:generate` 로 SQL 을 먼저 확인**한다.

- **컬럼/테이블 drop**: `db/schema.ts` 에서 컬럼·테이블을 지우면 push 시 `DROP COLUMN`/`DROP TABLE` 로 그 데이터가 사라진다. 의도한 삭제인지 diff 로 확인하고, 필요하면 사전 백업.
- **컬럼 rename**: Drizzle 은 스키마 diff 만으로 **rename 을 rename 으로 인식하지 못한다** — 이전 이름 컬럼은 drop, 새 이름 컬럼은 add 로 처리돼 **해당 컬럼 데이터가 유실**될 수 있다. `db:push`/`db:generate` 는 이 경우 drop+add 인지 rename 인지 확인을 요구한다. rename 은 특히 생성 SQL 을 검토한 뒤 반영한다.
- **not-null 추가 / 타입 축소**: 기존 행에 null·초과값이 있으면 반영이 실패하거나 절단될 수 있다. 컬럼 추가 시 nullable 또는 default 를 먼저 두고, 데이터 백필 후 제약을 좁힌다.
- 파괴적 변경 여부가 애매하면 push 하지 말고 `db:generate` 산출 SQL 을 근거로 판단한다(diff 가 정본).

## 문서 갱신 트리거

스키마를 바꾸면 아래 문서를 갱신한다(코드↔문서 동기화).

| 변경 | 갱신할 문서 |
|------|-------------|
| 테이블/컬럼/인덱스/관계 추가·삭제·변경 | [../reference/db-schema.md](../reference/db-schema.md) 인벤토리(물리명·컬럼수·인덱스·FK·사용처) |
| 특정 도메인의 데이터 모델 변경 | 해당 [../domains/](../domains/) 문서의 데이터 모델 절 |
| `log_events`/`device_key` 변경 | [../logging.md](../logging.md) (§1 데이터 모델) |
| db:push 워크플로·전제 자체의 변경 | [../memory/stack-and-invariants.md](../memory/stack-and-invariants.md), [../architecture.md](../architecture.md) §8, 이 문서 |

## 관련 문서

- 전체 스키마 인벤토리: [../reference/db-schema.md](../reference/db-schema.md)
- 명령 표·부트스트랩·DB 싱글톤: [../architecture.md](../architecture.md)
- MySQL 번역 결정 사례(원본): [../logging.md](../logging.md)
- 불변 규칙(마이그레이션 없음·계층 경계): [../memory/stack-and-invariants.md](../memory/stack-and-invariants.md)
- 도메인별 데이터 모델: [../domains/](../domains/)
