# 이력서(Resume) 도메인

> 기준: 2026-09-07 (fix/audit-batch2-immediate-errors @ `af05000` + 워킹트리 미커밋 변경) 코드 검증. 다루는 코드: `dto/resume/resume.ts`, `dto/resume/resume-data.ts`, `route/resume/resume.ts`, `service/domain/resume/resume.ts`, `compose/resume.ts`, `compose/types.ts`, `route/index.ts`, `index.ts`, `db/schema.ts`, `page/admin/pages/resumes.tsx`, `page/admin/db.ts`, `lib/error-code.ts`, `lib/error-message.ts`, `lib/error.ts`

## 개요

- 사용자별 이력서 문서를 저장·조회·수정·삭제하는 CRUD 도메인.
- 한 `resumes` 테이블에 세 종류(`type`)의 문서를 JSON(`data`) 컬럼으로 보관한다: `resume`(일본 履歴書 양식), `cv`(職務経歴書 = 경력기술서 양식), `web`(resume.gumyo.net 웹 이력서 — ko/en/jp 3개 언어). 구분은 `type` 컬럼과 생성 시 discriminated union 으로 한다. (`web` 은 2026-08-29 신설 — cv 슬롯 재사용안은 기존 cv 실데이터 발견으로 폐기: [acknowledge/2026-08-29-cv-web-resume.md](../acknowledge/2026-08-29-cv-web-resume.md))
- 외부 API·라이브러리 의존은 없다. 저장소는 MySQL(Drizzle) `resumes` 테이블뿐이며, 스토리지/이미지 서비스도 쓰지 않는다(사진은 `data.photo` 문자열로 보관).
- 소비처는 두 갈래다. (1) 인증 API `/api/resume/*` — 소유자 본인의 CRUD, (2) 어드민 SSR `/admin/resumes` — 관리자 열람·공개여부 토글·삭제(생성/수정 없음).

## 파일 맵

| 파일 | 역할 |
|---|---|
| `dto/resume/resume-data.ts` | 이력서 본문 데이터 Zod 스키마 — `resumeDataSchema`(履歴書), `cvDataSchema`(職務経歴書), `webResumeDataSchema`(웹 이력서: localizedText/profile/seo/labels/company/project/skillGroup/additionalExperience). 타입 `ResumeData`·`CvData`·`WebResumeData` export |
| `dto/resume/resume.ts` | 요청 DTO — `resumeCreateSchema`(type 기반 discriminated union + title/isPublic), `resumeUpdateSchema`, `resumeListQuerySchema`, `RESUME_TYPE` 상수 |
| `route/resume/resume.ts` | HTTP 경계 — `createResumeRoute` 팩토리. GET/POST/PATCH/DELETE 5개, 전부 `getSession` 인증 + `withErrorHandling` |
| `service/domain/resume/resume.ts` | 도메인 로직 — `createResumeService`(list/getById/create/update/delete), 소유권 검사(not_found/not_owner), `ResumeServiceDb` 인터페이스, `ResumeService` 타입 |
| `compose/resume.ts` | DI — `composeResume`가 `ResumeServiceDb`를 Drizzle 쿼리(`schema.resumes`)로 인라인 구현 |
| `compose/types.ts` | `ComposeResumeArgs = ComposeCoreArgs`(`{ db, env }`) |
| `route/index.ts` | `/resume` 프리픽스로 라우트 마운트(`stub`으로 감쌈) |
| `index.ts` | `/api`에 API 라우터 마운트 + 루트(`''`)에 SSR 페이지 라우터(`createPage`) 마운트 → 어드민은 `page/index.ts`에서 `/admin` 프리픽스 |
| `db/schema.ts` | `resumes` 테이블 정의 (`Resume`/`NewResume` 타입) |
| `page/admin/pages/resumes.tsx` | 어드민 SSR 페이지 — 목록/상세/공개토글/삭제 |
| `page/admin/db.ts` | 어드민 전용 쿼리 — `listResumes`·`getResume`·`toggleResumeVisibility`·`deleteResume` |
| `lib/error-code.ts` · `lib/error-message.ts` · `lib/error.ts` | `RESUME_NOT_FOUND` 코드·메시지·상태(404) |
| `tests/dto/resume/resume.test.ts`, `tests/route/resume/resume.test.ts`, `tests/service/domain/resume/resume.test.ts`, `tests/page/admin/resumes.test.ts` | 테스트 (→ [테스트](#테스트)) |

## 데이터 모델

물리 테이블 `resumes` (`db/schema.ts`). 전수 스키마는 `docs/reference/db-schema.md` 참조.

| 컬럼(물리) | 타입 | 비고 |
|---|---|---|
| `id` | int, autoincrement, PK | 접근 식별자(숫자). slug 없음 |
| `user_id` | varchar(36), NOT NULL | `user.id` FK, `onDelete: cascade` |
| `type` | varchar(10), NOT NULL | `'resume'` · `'cv'` · `'web'` |
| `title` | varchar(255), NOT NULL | 목록/검색 대상 |
| `data` | json, NOT NULL | `type`에 따라 `ResumeData`·`CvData`·`WebResumeData` |
| `is_public` | boolean, default false, NOT NULL | 공개여부 플래그 |
| `created_at` | timestamp(fsp 3), defaultNow | 어드민 목록 정렬 기준 |
| `updated_at` | timestamp(fsp 3), defaultNow, `$onUpdate` | API 목록 정렬 기준 |

- 인덱스: `idx_resumes_user` on `user_id`.
- 관계: `user` 1—N `resumes`, 유저 삭제 시 cascade.

### data 본문 구조 (`dto/resume/resume-data.ts`)

`type='resume'` → `resumeDataSchema` (履歴書):

- 인적: `name_furigana`, `name`, `gender`(`'男'|'女'|''`), `birthday_year/month/day`, `age`, `photo`
- 연락: `contact`, `emergency` — 각각 `{ furigana, postal, address, phone, email }`
- 이력/자격: `history[]`, `qualifications[]` — 각 항목 `{ year, month, content }`
- 기타: `self_promotion`, `commuting_hours/minutes`, `dependents`, `marital_status`(`'有'|'無'|''`), `spouse_obligation`(`'有'|'無'|''`), `objective`, `creation_year/month/day`

`type='cv'` → `cvDataSchema` (職務経歴書):

- `name`, `kana`, `summary`
- `experience` — `{ environments, languages, frameworks, infrastructure, tools }`
- `overview[]` — `{ title, period, content, tech_stack }`
- `jobs[]` — `{ title, period_from, period_to, period_span, kind, role, size, content, lang, tools }`

`type='web'` → `webResumeDataSchema` (웹 이력서, resume.gumyo.net):

- 언어 의존 텍스트는 전부 `LocalizedText = { ko, en, jp }` 객체, 언어 무관 값(URL·이메일·스킬명)은 평문 string.
- `profile` — `firstName`/`lastName`(라틴), `firstNameReading`/`lastNameReading`(LocalizedText, ruby 표기·en 은 빈 문자열), `jobTitle`·`birthday`·`location`(LocalizedText), `email`·`github`·`blog`(string), `introduce`(LocalizedText[] — 불릿 줄 배열)
- `seo` — `{ title, description }` (LocalizedText)
- `labels` — 섹션 제목 `{ workExperience, projects, skills, etc }` (LocalizedText)
- `workExperiences[]` — 회사 `{ name, period, location, role (LocalizedText), projects[] }`
- `personalProjects` — 회사와 동형 블록 1개 (개인 프로젝트 섹션)
- `projects[]` (회사 하위) — `{ title (LocalizedText), description (LocalizedText[]), skills (string[]), site? (string) }`
- `skillGroups[]` — `{ name (LocalizedText), items (string[]) }`
- `additionalExperiences[]` — `{ period, description }` (LocalizedText)
- `customSections[]` — `{ label (LocalizedText), items ({ period, description }[]) }` — 사용자 정의 섹션, `.default([])` 로 하위호환

`resumeDataSchema` 의 스칼라 필드는 전부 문자열이다(`gender`/`marital_status`/`spouse_obligation`은 enum 으로 제약된 문자열).

## API 엔드포인트

마운트: `index.ts`가 `app.route('/api', api)`, `route/index.ts`가 `router.route('/resume', ...)` → 실제 경로는 `/api/resume*`. 공개 web 이력서 조회를 제외한 모든 엔드포인트가 세션 인증 필요(`getSession` 없으면 `UNAUTHORIZED`).

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/resume/public/web` | **없음(공개)** | `type='web'` 1건의 `{ webResume: data, updatedAt }`. 선택 순서는 **admin 소유 행 우선 → 그 안에서 `updated_at` desc**. `isPublic` 필터 없음(무조건 공개 합의). 없으면 404 |
| PATCH | `/api/resume/web` | 세션 + `role==='admin'` | **같은 규칙으로 고른 web 행**의 data 전체 교체(`webResumeDataSchema` 검증). 비 admin 403, web 행 없으면 404 |
| GET | `/api/resume` | 세션 | 내 이력서 목록. 쿼리 `type?`, `page`(기본 1), `limit`(기본 20, 최대 50). `updated_at` desc, `paginatedResponse` |
| GET | `/api/resume/:id` | 세션 + 소유 | 상세. 비숫자 id·미존재·비소유 → 404(`RESUME_NOT_FOUND`) |
| POST | `/api/resume` | 세션 | 생성. body = `resumeCreateSchema`(type + data + title, isPublic 기본 false) |
| PATCH | `/api/resume/:id` | 세션 + 소유 | 수정. body = `resumeUpdateSchema`(title/data/isPublic 전부 optional). 비소유 → 404 |
| DELETE | `/api/resume/:id` | 세션 + 소유 | 삭제. 비소유 → 404 |

어드민 SSR(관리자 전용, `requireAdminPage`, `/admin` + `/resumes` 마운트): `GET /admin/resumes`(목록·title 검색·페이지네이션), `GET /admin/resumes/:id`(data JSON 상세), `POST /admin/resumes/:id/visibility`(isPublic 토글, 303), `POST /admin/resumes/:id/delete`(삭제, 303). 상세는 [`docs/admin-features.md`](../admin-features.md) §8 참조.

## 핵심 흐름

### 목록 (GET /api/resume)

1. `route/resume/resume.ts` — `getSession` 검증 후 `resumeService.list(userId, query)` 호출.
2. `service/domain/resume/resume.ts` — `db.getResumesByUserId(userId, query)`에 위임.
3. `compose/resume.ts` — `userId`(+ `type` 있으면) 조건으로 `resumes` select, `updated_at` desc, `limit`/`offset` 페이지네이션 + `count(*)` total 을 `Promise.all`로 병렬 조회.
4. 라우트가 `paginatedResponse(resumes, { page, limit, total })`로 응답.

### 상세·수정·삭제의 소유권 처리

- `getById`/`update`/`delete` 모두 `getResumeById(id)`로 행을 먼저 읽고, `resume.userId !== userId`면 `not_owner`를 반환한다.
- 라우트는 `not_found`와 `not_owner`를 **둘 다 `RESUME_NOT_FOUND`(404)** 로 응답 → 존재·소유 여부를 외부에 구분 노출하지 않는다.
- `updateResume`(`compose/resume.ts:61-68`)은 `title`·`data`·`isPublic` 중 `undefined` 가 아닌 것만 `updateData` 에 담고, **담긴 게 하나도 없으면 UPDATE 를 실행하지 않고 그대로 반환**한다. `PATCH /api/resume/:id` 의 body 가 `{}` 이거나 전 필드가 생략된 경우 Drizzle `set({})` 이 빈 SET 절 SQL 을 만들어 500 이 나던 경로다. 이 경우 응답은 성공(200)이고 행은 그대로다 — `updated_at` 의 `$onUpdate` 도 돌지 않는다.

### 생성 (POST /api/resume)

1. `resumeCreateSchema` 검증 — `type`에 따라 `data`를 `resumeDataSchema`/`cvDataSchema`/`webResumeDataSchema`로 discriminated 검사, `title`(1~255)·`isPublic`(기본 false) 병합.
2. `resumeService.create(userId, input)` → `insertResume` → Drizzle `$returningId()` → `{ id }` 반환.

### 어드민 관리 (SSR)

- `page/admin/pages/resumes.tsx` — `requireAdminPage` 게이트 후, `listResumes`(title `like` 검색, `user` 이메일 leftJoin, `created_at` desc)로 목록, 상세는 `data`를 `JSON.stringify` pretty 출력.
- 공개토글/삭제는 POST → 303 redirect(+ `flash=ok`), `returnTo`는 `/admin` 접두사만 허용. 생성/본문수정 기능은 없다.

## 환경변수

없음 — 이 도메인은 자체 환경변수를 쓰지 않는다. DB 연결은 전역 `getDb()`/`getEnv()`가 담당하고, `composeResume`는 `db`만 사용한다.

## 에러 코드

`lib/error-code.ts` / `lib/error-message.ts` / `lib/error.ts`.

| 코드 | 상태 | 메시지 |
|---|---|---|
| `RESUME_NOT_FOUND` | 404 | 이력서를 찾을 수 없습니다 |

- 이 도메인 전용 코드는 `RESUME_NOT_FOUND` 하나. 인증 실패 시 던지는 `UNAUTHORIZED`는 공통 코드(도메인 전용 아님).

## 테스트

실행: `bun test tests/dto/resume tests/route/resume tests/service/domain/resume tests/page/admin/resumes.test.ts` (개별 파일도 가능).

| 파일 | 커버리지 |
|---|---|
| `tests/dto/resume/resume.test.ts` | 스키마 — resume(履歴書)/cv(職務経歴書)/web(웹 이력서) data 파싱, web 의 LocalizedText 언어 키 누락 거부·`site` optional, discriminated union 교차 거부(type↔data 불일치), `isPublic` 기본값 false, list 쿼리 기본값·type 필터 |
| `tests/service/domain/resume/resume.test.ts` | 서비스 — list, getPublicCv(최신 cv/없으면 null), getById(자신/not_found/not_owner), create, update·delete 소유권 |
| `tests/route/resume/resume.test.ts` | 라우트 — 공개 web 이력서(무인증 200·없으면 404) + 인증 5개 엔드포인트, 미인증 401, 미존재·타인 리소스 404 |
| `tests/page/admin/resumes.test.ts` | 어드민 — 목록(공개 뱃지/검색 prefill/size clamp 5~100/page 폴백), 상세 data JSON, id 0 처리, 공개토글 |

## 주의사항 / 함정

- **공개 read 는 `/public/web` 하나뿐**: web 이력서 1건을 인증 없이 서빙하며 `is_public` 을 게이트로 쓰지 않는다(무조건 공개 — 사용자 합의).
- **web 행 선택은 admin 우선**: `getLatestResumeByTypePreferringAdmin`(`compose/resume.ts`)이 `resumes` 를 `user` 와 left join 해 `ORDER BY (user.role = 'admin') DESC, resumes.updated_at DESC LIMIT 1` 로 고른다. 조회(`GET /public/web`)와 수정(`PATCH /web`)이 **같은 함수**를 쓰므로 항상 같은 행을 가리킨다. 일반 사용자가 `type='web'` 행을 더 최근에 저장해도 공개 이력서가 그 행으로 바뀌지 않고, admin 행이 하나도 없을 때만 최신 행으로 떨어진다. `resume`·`cv` 타입은 여전히 숫자 `id` + 소유자 세션으로만 접근 가능하고, `is_public`은 read 소비처가 없는 저장 플래그로 남아 있다.
- **비소유 = 404**: 타인 리소스 접근은 403이 아니라 404(`RESUME_NOT_FOUND`)로 응답한다. 서비스는 `not_owner`를 구분하지만 라우트가 not_found로 합쳐 존재 여부를 숨긴다.
- **update는 type 재검증 안 함**: `resumeUpdateSchema.data`는 `z.union([resumeDataSchema, cvDataSchema])`(discriminated 아님)이고 `type`은 update 대상이 아니다. 그래서 `'resume'` 행에 cv 형태 `data`를 PATCH해도 스키마·서비스 모두 통과 → 저장된 `type`과 `data` 구조의 정합성은 보장되지 않는다.
- **빈 PATCH 는 no-op**: `PATCH /api/resume/:id` 에 갱신 필드가 하나도 없으면 UPDATE 자체가 생략된다(위 [소유권 처리](#상세수정삭제의-소유권-처리)). 200 이 오지만 `updated_at` 은 갱신되지 않으므로, 목록 정렬(`updated_at` desc)로 최근 편집을 추적하는 소비자는 빈 PATCH 를 "저장" 으로 취급하면 안 된다.
- **어드민은 관리 전용**: 어드민 페이지는 생성·본문수정 없이 열람·공개토글·삭제만 한다. 본문 작성/수정은 `/api/resume`를 경유해야 한다.
- **정렬 기준 차이**: API 목록은 `updated_at` desc, 어드민 목록은 `created_at` desc 로 서로 다르다.

## 관련 문서

- 어드민 이력서 화면: [`docs/admin-features.md`](../admin-features.md) (§8 Resume)
- 전수 DB 스키마: `docs/reference/db-schema.md`
- Hono 라우트/응답 패턴: [`docs/hono-reference.md`](../hono-reference.md)
