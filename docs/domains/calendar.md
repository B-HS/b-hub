# calendar 도메인

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 다루는 코드: `dto/calendar-event.ts`, `dto/calendar-event-mapper.ts`, `dto/calendar-group.ts`, `dto/calendar-subscription.ts`, `route/calendar/*`, `service/domain/calendar/*`, `compose/calendar.ts`, `lib/ics.ts`, `lib/ics-parser.ts`, `lib/xml.ts`, `db/schema.ts`, `route/index.ts`, `index.ts`, `page/well-known.ts`·`page/index.ts`, `lib/error-code.ts`·`lib/error-message.ts`·`lib/error.ts`

## 개요

사용자별 캘린더 백엔드. 이벤트 CRUD, rrule 반복 규칙, 그룹(캘린더 분류), 그리고 사용자 캘린더를 외부 클라이언트에 노출하는 두 경로 — 읽기전용 **ICS 피드**와 양방향 **CalDAV 서버** — 를 제공한다. 시간대는 사용자 단위(`user.timezone`, 기본 `Asia/Seoul`)로 관리한다.

외부 의존:

- `rrule` (npm) — 반복 규칙 전개. `lib/ics.ts` 의 `getRecurrenceOccurrences` 가 `RRule.between` 으로 범위 내 발생 여부를 판정한다.
- `fast-xml-parser` (npm) — CalDAV 요청/응답 XML 파싱·빌드 (`lib/xml.ts`).
- ICS(RFC 5545) 생성·파싱은 외부 라이브러리 없이 `lib/ics.ts`·`lib/ics-parser.ts` 에서 자체 구현한다.

CalDAV 응답은 표준 DAV/CalDAV 네임스페이스에 더해 Apple ical 확장(`http://apple.com/ns/ical/`, `calendar-color` 등)을 포함하며, `.well-known/caldav` 디스커버리·`current-user-principal`·`calendar-home-set`·Basic 인증(realm `CalDAV`)을 지원한다 — Apple Calendar(macOS/iOS) 등 CalDAV 클라이언트 대상이다.

> 참고: "구독(subscription)"은 **외부 ICS 를 주기적으로 가져오는(import) 기능이 아니다.** 사용자 자신의 캘린더를 CalDAV/ICS URL 로 **발행(publish)** 하기 위한 토큰 레코드다. 외부 URL fetch·가져오기 주기 로직은 코드에 없다.

## 파일 맵

| 파일 | 역할 |
|------|------|
| `dto/calendar-event.ts` | 이벤트 Zod 스키마 (`createEventSchema`/`updateEventSchema`, `recurrenceRuleSchema`, `monthQuerySchema`/`dateRangeQuerySchema`, status·transp enum) |
| `dto/calendar-event-mapper.ts` | 프론트 친화 바디(`title`/`startDate`/`startTime`…) ↔ 내부 `CalendarEvent`(`summary`/`dtstart`/`dtend`) 변환. `createEventBodySchema`/`patchEventBodySchema`, `toEventInput`/`toEventPatch`/`toEventResponse` |
| `dto/calendar-group.ts` | 그룹 스키마 (`createGroupSchema`/`updateGroupSchema`) |
| `dto/calendar-subscription.ts` | 구독 생성 스키마 (`createSubscriptionSchema` — `name?` 만) |
| `route/calendar/event.ts` | 이벤트 CRUD·월/범위/상세 조회 라우트 (세션 인증) |
| `route/calendar/group.ts` | 그룹 CRUD 라우트 (세션 인증) |
| `route/calendar/subscription.ts` | 구독 조회/생성/토큰 재발급 라우트 (세션 인증). CalDAV/ICS URL 조립 |
| `route/calendar/ics.ts` | `icsToken` 기반 공개 ICS 피드 라우트 |
| `route/calendar/caldav.ts` | CalDAV 서버 라우트 (PROPFIND/REPORT/PROPPATCH/MKCALENDAR/OPTIONS/GET/PUT/DELETE) |
| `service/domain/calendar/calendar.ts` | 도메인 로직(이벤트·그룹·구독·시간대). `CalendarServiceDb` 인터페이스, `CalendarEvent`/`CalendarSubscription`/`RecurrenceRule` 타입, `upsertEventByUid`, `getEventEtag` |
| `service/domain/calendar/caldav.ts` | CalDAV 동기화(sync-token·ctag), free-busy, PROPFIND 프로퍼티 조립. `CaldavServiceDb` 인터페이스 |
| `compose/calendar.ts` | `CalendarServiceDb`·`CaldavServiceDb` 를 Drizzle 로 인라인 구현해 두 서비스 주입 |
| `lib/ics.ts` | ICS(VCALENDAR/VEVENT) 생성, `generateIcsUid`/`generateSubscriptionToken`, `getRecurrenceOccurrences`, `generateTimezoneComponent` |
| `lib/ics-parser.ts` | ICS → `ParsedICS` 파싱(line unfolding·escape 해제·rrule/exdate 파싱), `extractUidFromICS` |
| `lib/xml.ts` | CalDAV XML: `buildMultistatus`/`parsePropfind`/`parseReport`/`buildCalendarDataResponse` |
| `page/well-known.ts` | `.well-known/caldav` 디스커버리(page 레이어) → `/caldav/{token}/` 301 리다이렉트 |
| `page/admin/pages/calendar.tsx` | 어드민 SSR 캘린더 화면 (상세 [../admin-features.md](../admin-features.md)) |
| `tests/dto/calendar/*`, `tests/route/calendar/*`, `tests/service/domain/calendar/*`, `tests/lib/{ics,ics-parser,xml}.test.ts` | 테스트 (아래 [테스트](#테스트)) |

## 데이터 모델

물리 테이블 4개(+ `user.timezone` 컬럼). 상세 컬럼은 [../reference/db-schema.md](../reference/db-schema.md) 참조.

| 테이블 | 핵심 컬럼 | 인덱스 / 관계 |
|--------|-----------|----------------|
| `calendar_group` | `id`(PK), `user_id`, `name`, `color`, `sort_order`(기본 0), `is_visible`(기본 true) | `idx_calendar_group_user(user_id)`. `user_id` → `user.id` (cascade) |
| `calendar_event` | `id`(PK), `user_id`, `uid`(unique), `summary`, `description`, `location`, `dtstart`/`dtend`(datetime), `is_all_day`, `rrule`(json), `exdate`(json), `status`(enum, 기본 `CONFIRMED`), `transp`(enum, 기본 `OPAQUE`), `priority`(tinyint), `categories`(json), `color`, `group_id`, `sequence`(기본 0), `dtstamp` | `idx_calendar_event_user`, `idx_calendar_event_user_dtstart(user_id,dtstart)`, `idx_calendar_event_uid`, `idx_calendar_event_group`. `group_id` → `calendar_group.id` (set null), `user_id` → `user.id` (cascade) |
| `deleted_calendar_event` | `id`(PK), `user_id`, `uid`, `deleted_at`, `sync_token` | `idx_deleted_event_user_sync(user_id,sync_token)`. CalDAV sync-collection 의 삭제 tombstone |
| `calendar_subscription` | `id`(PK), `user_id`, `token`(unique), `ics_token`(unique), `name`, `is_active`(기본 true), `ctag`(기본 `'0'`), `last_accessed_at` | `idx_subscription_token`, `idx_subscription_ics_token`, `idx_subscription_user`. `user_id` → `user.id` (cascade) |
| `user.timezone` | `varchar(64)`, 기본 `Asia/Seoul` | 이벤트/CalDAV ICS 의 TZID 근거 |

- `rrule` 은 `RRuleType`(`freq`/`interval`/`count`/`until`(string)/`byDay`/`byMonth`/`byMonthDay`) JSON. DB 저장 시 `until` 은 ISO 문자열, 도메인 타입에서는 `Date` 로 변환된다.
- 구독은 사용자당 1개다(`user_id` 기준, `createSubscription`/`insertSubscription` 이 기존 존재 시 재사용). `token`(CalDAV)·`ics_token`(ICS 피드)은 별개 토큰이다. `name` 미지정 시 저장 기본값은 `'Schedule'`(`createSubscription`, 커밋 `15a29a6` 에서 `'My Calendar'`→`'Schedule'`). `name` 이 null 일 때의 표시 폴백은 ICS 피드가 `'My Calendar'`, CalDAV `displayname` 이 `'B-Calendar'` 로 서로 다르다.

## API 엔드포인트

### JSON API (`/api` mount, 세션 인증)

`route/index.ts` 에서 `/calendar/events`·`/calendar/groups`·`/calendar/subscription`·`/calendar` 로, `index.ts` 에서 `/api` 로 마운트된다. 모든 핸들러는 `getSession`(better-auth) 으로 인증하고, 미인증 시 `UNAUTHORIZED` 를 던진다.

| Method | 전체 Path | 인증 | 설명 |
|--------|-----------|------|------|
| GET | `/api/calendar/events` | 세션 | 월 조회(`year`, `month` 0–11). 반복 이벤트는 마스터를 반환 |
| GET | `/api/calendar/events/range` | 세션 | 기간 조회(`startDate`,`endDate`,`groupId?`). 최대 366일 |
| GET | `/api/calendar/events/detail/:uid` | 세션 | 단건 상세 |
| POST | `/api/calendar/events` | 세션 | 생성(`createEventSchema` — `dtstart`/`dtend` datetime). 201 |
| POST | `/api/calendar/events/create` | 세션 | 생성(`createEventBodySchema` — `startDate`/`startTime` 분리형, `toEventInput` 매핑). 201 |
| PUT | `/api/calendar/events/:uid` | 세션 | 전체 수정(`updateEventSchema`) |
| PATCH | `/api/calendar/events/:uid` | 세션 | 부분 수정(`patchEventBodySchema`, `toEventPatch` 병합) |
| DELETE | `/api/calendar/events/:uid` | 세션 | 삭제. 204 |
| GET | `/api/calendar/groups` | 세션 | 그룹 목록(`sort_order` 정렬) |
| POST | `/api/calendar/groups` | 세션 | 그룹 생성. 201 |
| PATCH | `/api/calendar/groups/:id` | 세션 | 그룹 수정 |
| DELETE | `/api/calendar/groups/:id` | 세션 | 그룹 삭제(이벤트 있으면 거부). 204 |
| GET | `/api/calendar/subscription` | 세션 | 구독 조회 → `token`/`icsToken`/`name`/`caldavUrl`/`icsUrl` |
| POST | `/api/calendar/subscription` | 세션 | 구독 생성(있으면 기존 반환) |
| POST | `/api/calendar/subscription/regenerate` | 세션 | CalDAV `token` 재발급 |
| POST | `/api/calendar/subscription/regenerate-ics` | 세션 | `icsToken` 재발급 |
| GET | `/api/calendar/:icsToken` | ics 토큰(path) | 공개 ICS 피드. `.ics` 접미사 허용, `attachment` 다운로드, `no-store` |

### CalDAV (`/caldav` mount, 구독 토큰 인증)

`index.ts` 에서 `/api` 와 별개로 `/caldav` 최상위 마운트. 인증은 세션이 아니라 URL 경로의 구독 `token`(→ `resolveToken` 이 subscription 조회로 `userId` 해석). `securityExcludePaths` 에 `/caldav/`·`/.well-known/caldav` 가 포함돼 보안 미들웨어에서 제외된다. `route/calendar/caldav.ts` 는 공용 에러 캐치 `route.use('*')` 외에 아래 method×path 조합 **24개 라우트**를 등록한다(트레일링 슬래시·`/default` 변형 포함).

| Method | 전체 Path | 인증 | 설명 |
|--------|-----------|------|------|
| OPTIONS | `/caldav/:token`, `/caldav/:token/*` | token | DAV 헤더 광고(`DAV: 1, 2, 3, calendar-access`) |
| PROPFIND | `/caldav/:token`, `/caldav/:token/` | token | 프린시펄 프로퍼티. Depth 1 시 이벤트 목록 |
| PROPFIND | `/caldav/:token/default`, `/caldav/:token/default/` | token | 캘린더 컬렉션 프로퍼티. Depth 1 시 이벤트 목록 |
| REPORT | `/caldav/:token`(+`/`,`/default`,`/default/`) | token | `calendar-multiget`/`calendar-query`/`sync-collection`/`free-busy-query` |
| PROPPATCH | `/caldav/:token`(+`/`,`/*`) | token | 프로퍼티 변경 no-op(207 성공만 반환) |
| MKCALENDAR | `/caldav/:token/*` | token | 201 반환(no-op) |
| GET | `/caldav/:token`(+`/`,`/default`,`/default/`) | token | 전체 캘린더 ICS |
| GET | `/caldav/:token/default/:uid`, `/caldav/:token/:uid` | token | 단건 이벤트 ICS(ETag) |
| PUT | `/caldav/:token/default/:uid`, `/caldav/:token/:uid` | token | ICS 업로드 → `upsertEventByUid`. 생성 201 / 갱신 204 |
| DELETE | `/caldav/:token/default/:uid`, `/caldav/:token/:uid` | token | 삭제. 204 |
| GET/PROPFIND | `/.well-known/caldav` | Basic/query token | `page/well-known.ts` — `?token=` 또는 Basic 비밀번호로 `/caldav/{token}/` 301 리다이렉트 |

## 핵심 흐름

### 이벤트 생성 (친화 폼)

1. `POST /api/calendar/events/create` → `createEventBodySchema` 검증.
2. `toEventInput`(`dto/calendar-event-mapper.ts`) 이 `startDate`+`startTime`(+`isAllDay`) 을 `combineDatetime` 으로 UTC `Date` 로 합쳐 `dtstart`/`dtend` 생성, `title`→`summary` 매핑.
3. `calendarService.createEvent` → `uid = generateIcsUid()`(`{uuid}@b-calendar`), `rrule.until` 을 ISO 문자열로 저장, `db.insertEvent`, 이어 `db.incrementCtag`(구독 ctag 갱신).
4. `toEventResponse` 로 친화 응답(분리형 `startDate`/`startTime`) 반환.

### 범위 조회 + 반복 판정

1. `GET /api/calendar/events/range` → `getEventsByDateRange`.
2. compose 쿼리: `dtstart` 이 범위 내이거나 `rrule IS NOT NULL AND dtstart <= endDate` 인 행을 조회.
3. 비반복 이벤트는 `dtstart` 범위 검사, 반복 이벤트는 `getRecurrenceOccurrences`(rrule.between)로 **범위 내 발생이 1개 이상이면 마스터 이벤트를 포함**한다(개별 인스턴스로 전개하지 않음).

### CalDAV 동기(sync-collection)

1. 클라이언트가 `REPORT` 로 `sync-collection`(이전 `sync-token`) 전송.
2. `caldavService.getChangesFromToken`: 토큰 없음 → 전체 이벤트. 토큰 파싱(`http://b-calendar/sync/{ctag}`) 후 `getChangedEventsSince`(`updated_at >= ctag 시각`)·`getDeletedEventsSince`(`deleted_calendar_event`) 로 변경/삭제 계산.
3. 변경분은 `getetag`, 삭제분은 404 `<D:response>` 로, 마지막에 현재 `sync-token` 을 붙여 207 multistatus 반환.
4. ctag 는 이벤트 CUD 마다 `incrementCtag`(`Date.now().toString(36)`)로 갱신. 삭제는 `deleted_calendar_event` 에 tombstone 기록.

### ICS 업로드(PUT) upsert

1. CalDAV `PUT` 바디(ICS, 최대 1MB `MAX_ICS_SIZE`) → 초과 시 `CALENDAR_ICS_TOO_LARGE`.
2. `parseICS`(`lib/ics-parser.ts`) 실패 시 `CALENDAR_ICS_PARSE_FAILED`.
3. `uid` 에서 `@` 이전만 취해 `upsertEventByUid` — 기존 있으면 `updateEvent`(sequence+1), 없으면 `insertEvent`. ETag 헤더 반환.

## 환경변수

- `BASE_URL` (선택) — 구독 응답의 `caldavUrl`/`icsUrl` 절대 URL 조립에 사용. `compose/index.ts` 가 `env.BASE_URL ?? ''` 로 라우터에 전달한다. 미설정 시 `route/calendar/subscription.ts` 의 `resolveBaseUrl` 이 `X-Forwarded-Host`/`Host` + proto 로 대체한다.

이 도메인 전용 env 는 없다(그 외 공통 env 는 [../reference/env.md](../reference/env.md)).

## 에러 코드

`lib/error-code.ts`·`lib/error-message.ts`·`lib/error.ts`(STATUS_MAP) 기준.

| 코드 | HTTP | 메시지 | 비고 |
|------|:----:|--------|------|
| `CALENDAR_EVENT_NOT_FOUND` | 404 | 캘린더 이벤트를 찾을 수 없습니다 | |
| `CALENDAR_SUBSCRIPTION_NOT_FOUND` | 404 | 캘린더 구독을 찾을 수 없습니다 | CalDAV/ICS 토큰 무효 포함 |
| `CALENDAR_CALDAV_AUTH_FAILED` | 401 | CalDAV 인증에 실패했습니다 | 정의만 존재, throw 지점 없음 |
| `CALENDAR_ICS_PARSE_FAILED` | 422 | ICS 데이터 파싱에 실패했습니다 | |
| `CALENDAR_ICS_TOO_LARGE` | 413 | ICS 데이터가 크기 제한을 초과했습니다 | 1MB 초과 |
| `CALENDAR_GROUP_NOT_FOUND` | 404 | 캘린더 그룹을 찾을 수 없습니다 | |
| `CALENDAR_GROUP_HAS_EVENTS` | 409 | 이벤트가 있는 그룹은 삭제할 수 없습니다 | |
| `CALENDAR_INVALID_DATE_RANGE` | 400 | 유효하지 않은 날짜 범위입니다 | start>end 또는 366일 초과 |

## 테스트

`bun test <경로>` 로 실행.

- `tests/dto/calendar/event.test.ts`, `event-mapper.test.ts`, `group.test.ts`, `subscription.test.ts`
- `tests/route/calendar/event.test.ts`, `group.test.ts`, `subscription.test.ts`, `ics.test.ts`, `caldav.test.ts`
- `tests/service/domain/calendar/calendar.test.ts`, `caldav.test.ts`
- `tests/lib/ics.test.ts`, `tests/lib/ics-parser.test.ts`, `tests/lib/xml.test.ts`
- `tests/page/admin/calendar.test.ts` (어드민)

예: `bun test tests/service/domain/calendar` · `bun test tests/route/calendar/caldav.test.ts`

## 주의사항 / 함정

- **응답 스키마 2종.** `route/calendar/event.ts` 의 `eventToResponse`(ISO `dtstart`/`dtend`)는 GET `/`·POST `/`·PUT `/:uid` 가, `dto/calendar-event-mapper.ts` 의 `toEventResponse`(분리형 `startDate`/`startTime`, `id`=`uid`, `title`)는 GET `/range`·GET `/detail/:uid`·POST `/create`·PATCH `/:uid` 가 사용한다. 엔드포인트별로 필드 모양이 다르다.
- **반복 이벤트는 서버에서 전개하지 않는다.** 범위/월 조회는 마스터 이벤트(+`rrule`)를 반환하고 인스턴스 전개는 클라이언트 몫이다.
- **`getRecurrenceOccurrences` 는 `exdate` 를 반영하지 않는다.** `exdate` 는 ICS `EXDATE` 로 출력되지만 서버 범위 필터에는 적용되지 않는다.
- **uid 접미사 처리.** 저장 uid 는 `{uuid}@b-calendar` 인데, CalDAV href·조회는 `@` 이전만 사용한다. 서비스는 정확 매칭 실패 시 `getEventByUidWithDomain`(`{uid}@b-calendar`)로 재조회한다.
- **all-day 는 UTC 자정 고정.** `combineDatetime`·`formatDateTimeICS` 가 `getUTC*` 로 처리 — 시간대 오프셋을 적용하지 않는다.
- **ctag/sync-token 은 base36 타임스탬프.** `incrementCtag` = `Date.now().toString(36)`. 삭제 tombstone 의 `sync_token` 비교는 문자열 `gte` 다.
- **PROPPATCH·MKCALENDAR 는 no-op.** 실제 프로퍼티 변경·컬렉션 생성 없이 성공 응답만 반환한다.
- **free-busy 는 `OPAQUE` 이벤트만 집계.** compose `getFreeBusyEvents` 가 `transp = 'OPAQUE'` + 기간 겹침(`dtend >= start AND dtstart <= end`)으로 필터한다 → `TRANSPARENT` 이벤트는 바쁨에 안 잡힌다. `status = TENTATIVE` 는 `BUSY-TENTATIVE`, 그 외는 `BUSY` 로 표기(`getFreeBusy`).
- **CalDAV 는 세션 미들웨어 밖.** 토큰이 곧 자격증명이므로 토큰 유출 = 캘린더 노출. `/caldav/`·`/.well-known/caldav` 는 `securityExcludePaths` 로 제외된다.

## 관련 문서

- 배포/프록시: **`deploy/caldav-proxy`** 는 CalDAV 트래픽(PROPFIND/REPORT 등)을 `https://api.gumyo.net` 으로 포워딩하는 별도 Bun 리버스 프록시다(서버리스가 비표준 HTTP 메서드를 못 받는 우회). 상세 [../deploy.md](../deploy.md).
- 아키텍처(계층·부트스트랩): [../architecture.md](../architecture.md)
- 어드민 캘린더 화면: [../admin-features.md](../admin-features.md)
- DB 스키마 전수: [../reference/db-schema.md](../reference/db-schema.md) · 환경변수: [../reference/env.md](../reference/env.md)
- Hono 패턴 레퍼런스: [../hono-reference.md](../hono-reference.md)
- 문서 지도: [../index.md](../index.md)
