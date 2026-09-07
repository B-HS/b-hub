# calendar 도메인

> 기준: 2026-09-07 (fix/audit-batch4-performance @ 4차 배치 커밋 완료, 비교 기준 `bab14e8`) 코드 검증. 다루는 코드: `dto/calendar-event.ts`, `dto/calendar-event-mapper.ts`, `dto/calendar-group.ts`, `dto/calendar-subscription.ts`, `route/calendar/*`, `service/domain/calendar/*`, `compose/calendar.ts`, `lib/ics.ts`, `lib/ics-parser.ts`, `lib/xml.ts`, `db/schema.ts`, `route/index.ts`, `index.ts`, `page/well-known.ts`·`page/index.ts`, `lib/error-code.ts`·`lib/error-message.ts`·`lib/error.ts`

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
| `calendar_event` | `id`(PK), `user_id`, `uid`(unique), `summary`, `description`, `location`, `dtstart`/`dtend`(datetime), `is_all_day`, `rrule`(json), `exdate`(json), `status`(enum, 기본 `CONFIRMED`), `transp`(enum, 기본 `OPAQUE`), `priority`(tinyint), `categories`(json), `color`, `group_id`, `sequence`(기본 0), `dtstamp` | `idx_calendar_event_user`, `idx_calendar_event_user_dtstart(user_id,dtstart)`, `idx_calendar_event_group`(4차에서 `idx_calendar_event_uid` 제거 — `uid` 의 unique 제약이 같은 인덱스를 이미 제공한다). `group_id` → `calendar_group.id` (set null), `user_id` → `user.id` (cascade) |
| `deleted_calendar_event` | `id`(PK), `user_id`, `uid`, `deleted_at`, `sync_token` | `idx_deleted_event_user_sync(user_id,sync_token)`. CalDAV sync-collection 의 삭제 tombstone |
| `calendar_subscription` | `id`(PK), `user_id`, `token`(unique), `ics_token`(unique), `name`, `is_active`(기본 true), `ctag`(기본 `'0'`), `last_accessed_at` | **`unique(user_id)` = `uq_calendar_subscription_user`**(`db:push` 필요). 4차에서 중복 인덱스 3종(`idx_subscription_token`·`idx_subscription_ics_token`·`idx_subscription_user`)을 제거했다 — 앞 둘은 `token`·`ics_token` 의 unique 제약이, 마지막은 새 `uq_calendar_subscription_user` 가 같은 컬럼을 이미 인덱싱한다. `user_id` → `user.id` (cascade) |
| `user.timezone` | `varchar(64)`, 기본 `Asia/Seoul` | 이벤트/CalDAV ICS 의 TZID 근거 |

- `rrule` 은 `RRuleType`(`freq`/`interval`/`count`/`until`(string)/`byDay`/`byMonth`/`byMonthDay`) JSON. DB 저장 시 `until` 은 ISO 문자열, 도메인 타입에서는 `Date` 로 변환된다.
- **구독은 사용자당 1개이며 DB 제약으로 보장한다.** `calendar_subscription.user_id` 에 unique(`uq_calendar_subscription_user`)가 걸리고, `insertSubscription`(`compose/calendar.ts`)은 select-then-insert 트랜잭션 대신 `insert ... onDuplicateKeyUpdate` upsert 다. 동시 요청이 두 행을 만들던 경합이 사라진다. `createSubscription` 은 insert 직후 실제 행을 다시 읽어 반환하므로, 이미 있던 구독의 기존 토큰이 그대로 응답된다(새 토큰이 생성돼 응답에만 담기고 저장은 안 되던 불일치 제거). **이 unique 는 `bun run db:push` 전까지 DB 에 반영되지 않는다** — push 전에 `user_id` 중복 행이 남아 있으면 제약 생성이 실패하므로 먼저 정리한다. `token`(CalDAV)·`ics_token`(ICS 피드)은 별개 토큰이다. `name` 미지정 시 저장 기본값은 `'Schedule'`(`createSubscription`, 커밋 `15a29a6` 에서 `'My Calendar'`→`'Schedule'`). `name` 이 null 일 때의 표시 폴백은 ICS 피드가 `'My Calendar'`, CalDAV `displayname` 이 `'B-Calendar'` 로 서로 다르다.

## API 엔드포인트

### JSON API (`/api` mount, 세션 인증)

`route/index.ts` 에서 `/calendar/events`·`/calendar/groups`·`/calendar/subscription`·`/calendar` 로, `index.ts` 에서 `/api` 로 마운트된다. 모든 핸들러는 `getSession`(better-auth) 으로 인증하고, 미인증 시 `UNAUTHORIZED` 를 던진다.

| Method | 전체 Path | 인증 | 설명 |
|--------|-----------|------|------|
| GET | `/api/calendar/events` | 세션 | 월 조회(`year`, `month` 0–11). 반복 이벤트는 범위 내 각 발생 인스턴스로 전개 반환 |
| GET | `/api/calendar/events/range` | 세션 | 기간 조회(`startDate`,`endDate`,`groupId?`). 최대 366일. 반복 이벤트는 발생 인스턴스로 전개 |
| GET | `/api/calendar/events/detail/:uid` | 세션 | 단건 상세 |
| POST | `/api/calendar/events` | 세션 | 생성(`createEventSchema` — `dtstart`/`dtend` datetime). 201. `dtend < dtstart` 면 400, 남의(또는 없는) `groupId` 면 404 |
| POST | `/api/calendar/events/create` | 세션 | 생성(`createEventBodySchema` — `startDate`/`startTime` 분리형, `toEventInput` 매핑). 201. 같은 400/404 검사 |
| PUT | `/api/calendar/events/:uid` | 세션 | 전체 수정(`updateEventSchema`). `dtend < dtstart` 면 400, 남의 `groupId` 면 404 |
| PATCH | `/api/calendar/events/:uid` | 세션 | 부분 수정(`patchEventBodySchema`, `toEventPatch` 병합). 날짜를 둘 다 보낸 경우 역전이면 400, 남의 `groupId` 면 404 |
| DELETE | `/api/calendar/events/:uid` | 세션 | 삭제. 204 |
| GET | `/api/calendar/groups` | 세션 | 그룹 목록(`sort_order` 정렬) |
| POST | `/api/calendar/groups` | 세션 | 그룹 생성. 201 |
| PATCH | `/api/calendar/groups/:id` | 세션 | 그룹 수정. 갱신 후 행 재조회에 실패하면 `CALENDAR_GROUP_NOT_FOUND`(404) |
| DELETE | `/api/calendar/groups/:id` | 세션 | 그룹 삭제(이벤트 있으면 거부). 204 |
| GET | `/api/calendar/subscription` | 세션 | 구독 조회 → `token`/`icsToken`/`name`/`caldavUrl`/`icsUrl` |
| POST | `/api/calendar/subscription` | 세션 | 구독 생성(있으면 기존 반환) |
| POST | `/api/calendar/subscription/regenerate` | 세션 | CalDAV `token` 재발급. 구독 행이 없으면 `CALENDAR_SUBSCRIPTION_NOT_FOUND`(404) |
| POST | `/api/calendar/subscription/regenerate-ics` | 세션 | `icsToken` 재발급. 구독 행이 없으면 `CALENDAR_SUBSCRIPTION_NOT_FOUND`(404) |
| GET | `/api/calendar/:icsToken` | ics 토큰(path) | 공개 ICS 피드. `.ics` 접미사 허용, `attachment` 다운로드, `no-cache, no-store, must-revalidate`. **약한 `ETag` 를 붙이고 `If-None-Match` 가 맞으면 본문 없이 304**(아래 [ICS 피드](#ics-피드-etag304)) |

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

1. `GET /api/calendar/events/range` → `getEventsByDateRange` (월 조회 `GET /api/calendar/events` → `getEventsByMonthRange` 도 동일 로직).
2. compose 쿼리는 **overlap** 조건이다(2026-07-10 수정 — 이전 dtstart-in-range 버그): `(dtstart <= endDate AND dtend >= startDate)` **또는** `(rrule IS NOT NULL AND dtstart <= endDate)` 인 행을 조회.
3. `expandEventsInRange` 로 후처리한다 — 비반복 이벤트는 overlap(`dtstart <= endDate && dtend >= startDate`)이면 그대로 포함, 반복 이벤트는 `getRecurrenceOccurrences`(rrule.between)의 **각 발생을 개별 인스턴스**(`{...event, dtstart: occurrence, dtend: occurrence + duration}`)로 전개해 포함한다(마스터 1건 반환이 아님).

### ICS 피드 ETag/304

1. `route/calendar/ics.ts` 가 종전대로 구독 토큰 → 이벤트 → `eventsToICS` 로 본문을 만든다(생성 로직·본문 바이트 불변).
2. 그 본문에서 **`DTSTAMP:` 로 시작하는 줄만 걷어낸 문자열**을 SHA-256 해시하고 앞 32자를 취해 검증자로 쓴다. `DTSTAMP` 는 렌더할 때마다 바뀌므로 제외해야 내용이 그대로일 때 검증자가 안정된다.
3. 응답 헤더에 `ETag: W/"<해시>"` 를 추가한다. 요청의 `If-None-Match` 가 `*` · `"<해시>"` · `W/"<해시>"` 중 하나와 맞으면(쉼표 목록 각 항목을 trim 해 비교) **본문 없이 304** 를 반환하며, 304 응답에도 같은 `ETag` 와 `Cache-Control` 을 싣는다.
4. `Cache-Control` 은 이전과 같은 `no-cache, no-store, must-revalidate` 다 — 재검증은 하되 캐시 저장은 여전히 막는다. 200 응답의 본문·`Content-Type`·`Content-Disposition` 도 그대로다.

### CalDAV 동기(sync-collection)

1. 클라이언트가 `REPORT` 로 `sync-collection`(이전 `sync-token`) 전송.
2. `caldavService.getChangesFromToken`: 토큰 없음 → 전체 이벤트. 토큰 파싱(`http://b-calendar/sync/{ctag}`) 후 `getChangedEventsSince`(`updated_at >= ctag 시각`)·`getDeletedEventsSince`(`deleted_calendar_event`) 로 변경/삭제 계산.
3. 변경분은 `getetag`, 삭제분은 404 `<D:response>` 로, 마지막에 현재 `sync-token` 을 붙여 207 multistatus 반환.
4. ctag 는 이벤트 CUD 마다 `incrementCtag`(`Date.now().toString(36)`)로 갱신. 삭제는 `deleted_calendar_event` 에 tombstone 기록.
5. **삭제는 트랜잭션 1개**다(`compose/calendar.ts` `deleteEventWithTombstone`): tombstone insert → 이벤트 delete → 구독 `ctag` 갱신을 한 트랜잭션에서 수행한다. 이전의 `insertDeletedEvent` → `deleteEventByUid` → `incrementCtag` 3단계는 중간 실패 시 tombstone 만 남거나 ctag 가 뒤처질 수 있었다.

### calendar-multiget 일괄 조회

- `REPORT` 의 `calendar-multiget` 은 요청 href 마다 이벤트를 1건씩 조회하던 것을 **한 번의 `IN` 조회**로 바꿨다(`route/calendar/caldav.ts` → `calendarService.getEventsByUids`).
- 서비스는 href 에서 뽑은 uid 목록을 중복 제거한 뒤 **`uid` 와 `uid@b-calendar` 두 형태를 모두 담아** `db.getEventsByUids(userId, uids)`(`inArray`)로 조회하고, uid 별로 정확 매칭을 우선(없으면 도메인 접미사 행)해 `Map<uid, CalendarEvent>` 를 만든다.
- 응답은 **요청 href 순서 그대로** 조립한다. 이벤트가 있으면 `etag` + `calendarData`, 없으면 종전과 같이 `status: 404` 행이다. 207 multistatus 의 바이트 구성은 바뀌지 않는다.
- 단건 조회(`getEventByUid`)도 쿼리 1회다: compose 가 `or(uid = ?, uid = ?@b-calendar)` 로 두 형태를 한 번에 읽고 정확 매칭을 우선 반환한다(이전에는 정확 매칭 실패 시 `getEventByUidWithDomain` 으로 2차 쿼리를 던졌다). `deleteEvent` 도 이 단일 조회 결과만 쓴다.
- `calendar-query` 의 `time-range` 는 **여전히 무시**한다 — `getAllEvents` 로 전체 이벤트를 돌려준다(REPORT 결과가 바뀌므로 4차에서 손대지 않았다). `free-busy-query` 만 `time-range` 를 필수로 파싱한다.

### ICS 업로드(PUT) upsert

1. CalDAV `PUT` 바디(ICS, 최대 1MB `MAX_ICS_SIZE`) → 초과 시 `CALENDAR_ICS_TOO_LARGE`.
2. `calendarService.getUserTimezone(userId)` 로 사용자 타임존을 구해 `parseICS(icsData, timezone)` 호출(`lib/ics-parser.ts`). 실패 시 `CALENDAR_ICS_PARSE_FAILED`.
3. `uid` 에서 `@` 이전만 취해 `upsertEventByUid` — 기존 있으면 `updateEvent`(sequence+1), 없으면 `insertEvent`. **`exdate` 도 함께 전달·저장**한다. ETag 헤더 반환.

### ICS 파싱(`lib/ics-parser.ts`)

- **`parseICS(ics, timezone = 'UTC')`**: 대상 타임존은 `isSupportedTimezone`(`Intl.DateTimeFormat` 생성 성공 여부)로 검사하고, 지원하지 않으면 `UTC` 로 떨어진다.
- **VALARM 무시**: `BEGIN:VALARM` ~ `END:VALARM` 사이 줄은 전부 건너뛴다. 알람 블록의 `DESCRIPTION`·`TRIGGER` 등이 이벤트 필드를 덮어쓰지 않는다.
- **RECURRENCE-ID 컴포넌트 스킵**: 하나의 ICS 에 VEVENT 가 여러 개 있으면 `RECURRENCE-ID` 를 가진 컴포넌트(반복 예외 인스턴스)는 마스터로 채택하지 않고, `RECURRENCE-ID` 가 없는 **첫 VEVENT** 만 마스터로 쓴다. 마스터가 없거나 `uid`·`summary`·`dtstart` 가 없으면 `null`.
- **타임존 해석**(`getSourceTimezone` + `wallClockToInstantMs`): 프로퍼티 파라미터에 `TZID=` 가 있으면 그 존(지원하지 않는 TZID 면 대상 타임존), 값이 `Z` 로 끝나면 UTC, 둘 다 아니면(floating) 대상 타임존으로 본다. 원본 존과 대상 존이 다르면 벽시계→절대시각→대상 존 벽시계 순으로 변환한 값을 저장한다. `VALUE=DATE`(또는 길이 8)는 종일로 판정해 변환하지 않는다.
- **BYDAY 검증**: `BYDAY_PATTERN`(`lib/ics.ts`, `/^([+-]?[1-5])?(MO|TU|WE|TH|FR|SA|SU)$/`)에 맞지 않는 토큰은 버리고, 남은 것이 없으면 `byDay` 자체를 두지 않는다. DTO 의 `recurrenceRuleSchema.byDay` 도 같은 정규식으로 검증한다(`dto/calendar-event.ts`).
- `RRULE:UNTIL` 은 대상 타임존 기준으로 파싱하고, `DTEND` 가 없으면 종일 `+24h` / 그 외 `+1h` 로 채운다.

### ICS 생성(`lib/ics.ts`)

- **VTIMEZONE 은 실제 오프셋으로 만든다**(`generateTimezoneComponent`). 해당 연도의 12개월을 프로브해 존 오프셋 집합을 구하고, **오프셋이 하나일 때만** `TZOFFSETFROM`/`TZOFFSETTO` 에 그 값을 넣은 블록을 반환한다. DST 를 쓰는 존(오프셋 2개 이상)이나 지원하지 않는 존은 **틀린 오프셋 대신 빈 배열**을 돌려주고, `caldav.ts` 의 `generateTimezoneComponent` 가 `BEGIN:VTIMEZONE`/`TZID`/`END:VTIMEZONE` 최소 블록으로 폴백한다. (이전에는 존과 무관하게 `+0000` 을 박았다.)
- **종일 이벤트의 `UNTIL` 은 DATE 형식**으로 출력한다(`formatRRule(rrule, isAllDay)` — 종일이면 `UNTIL=YYYYMMDD`, 아니면 `UNTIL=…Z`). `BYDAY` 는 출력 시에도 `BYDAY_PATTERN` 으로 거른다.
- `getRecurrenceOccurrences` 는 `RRule.parseString(formatRRule(rrule))` 로 만든 규칙을 쓴다. 손으로 만든 요일 맵 대신 RFC 문자열을 거치므로 `2MO` 같은 서수 BYDAY 도 그대로 해석된다.

### CalDAV href 규칙

- 컬렉션 href 는 `buildCollectionHref(token, isDefaultCollection)` 하나로 만든다 — `/default` 계열 요청은 `/caldav/<token>/default/`, 루트 계열은 `/caldav/<token>/`.
- 이벤트 href 는 `buildEventHref(collectionHref, uid)` = `<collection>/<uid의 @ 앞부분>.ics` 로 **모든 응답에서 동일**하다(PROPFIND·`calendar-multiget`·`calendar-query`·`sync-collection` 의 변경·삭제 응답 포함). 이전에는 `/default` PROPFIND 만 전체 `uid` 를 써서 클라이언트가 서로 다른 경로를 보게 됐다.
- `REPORT` 는 `createReportHandler(isDefaultCollection)` 로 컬렉션별 핸들러를 만들어, 요청이 들어온 컬렉션과 같은 href 접두사로 응답한다.
- `free-busy-query` 의 `time-range` 는 `parseICSDateTime(value, undefined, timezone)` 으로 파싱한다. ICS basic 포맷(`20260101T000000Z`)을 `new Date()` 에 그대로 넣으면 `Invalid Date` 가 되기 때문이다.

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
| `CALENDAR_INVALID_DATE_RANGE` | 400 | 유효하지 않은 날짜 범위입니다 | 조회 범위 start>end 또는 366일 초과 |
| `VALIDATION_ERROR` | 400 | (공통) | 이벤트 `dtend < dtstart` — DTO refine 또는 라우트 `assertDateRange` |

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
- **범위/월 조회는 서버에서 반복을 전개한다.** `expandEventsInRange`(`service/domain/calendar/calendar.ts:199`)가 `getRecurrenceOccurrences` 의 각 발생을 개별 인스턴스로 만들어 반환한다(마스터 1건이 아님). 그 외 경로(`getAllEvents`·CalDAV ICS 출력)는 마스터 + `RRULE` 그대로다.
- **`getRecurrenceOccurrences` 는 여전히 `exdate` 를 반영하지 않는다.** `exdate` 는 이제 CalDAV PUT/upsert 에서도 저장되고 ICS `EXDATE` 로 출력되지만, 서버 전개(`expandEventsInRange`)에서 제외 처리는 하지 않는다.
- **uid 접미사 처리.** 저장 uid 는 `{uuid}@b-calendar`(`CALENDAR_UID_DOMAIN_SUFFIX`)인데, CalDAV href·조회는 `@` 이전만 사용한다. 단건·일괄 조회 모두 두 형태를 **한 쿼리로 함께 읽고** 정확 매칭을 우선한다(`or(...)` / `inArray(...)`). 별도의 2차 조회 함수(`getEventByUidWithDomain`)는 제거됐다.
- **구독 `last_accessed_at` 은 5분 단위로만 갱신된다.** CalDAV 토큰 해석 경로인 `getSubscriptionByToken`(`service/domain/calendar/calendar.ts`)이 조회한 행의 `lastAccessedAt` 이 5분보다 최근이면 `updateSubscriptionLastAccessed` 를 호출하지 않는다(값이 없으면 갱신). CalDAV 클라이언트가 초 단위로 폴링해도 매 요청 UPDATE 가 붙지 않는 대신, 어드민·`/manage` 화면의 "마지막 접근" 표시는 최대 5분 오차를 갖는다. 응답에는 이 값이 실리지 않아 계약 영향은 없다.
- **all-day 는 UTC 자정 고정.** `combineDatetime`·`formatDateTimeICS` 가 `getUTC*` 로 처리 — 시간대 오프셋을 적용하지 않는다. 종일 이벤트의 `RRULE:UNTIL` 만 DATE 형식으로 출력한다.
- **ETag 는 `updated_at` 기반**이다(`getEventEtag` = `lastModified` 의 base36 + uid 앞 8자). 생성·수정·upsert 가 `updatedAt` 을 DB 기본값에 맡기지 않고 서비스가 계산한 `now` 로 명시 저장하므로, 응답 헤더로 돌려준 ETag 와 이후 조회에서 계산되는 ETag 가 일치한다.
- **VTIMEZONE 은 DST 존에서 생략된다.** 오프셋이 연중 2개 이상인 존은 정확히 표현할 수 없어 최소 블록(`TZID` 만)으로 나간다 — 클라이언트가 존 이름으로 해석해야 한다.
- **ctag/sync-token 은 base36 타임스탬프.** `incrementCtag` = `Date.now().toString(36)`. 삭제 tombstone 의 `sync_token` 비교는 문자열 `gte` 다.
- **PROPPATCH·MKCALENDAR 는 no-op.** 실제 프로퍼티 변경·컬렉션 생성 없이 성공 응답만 반환한다.
- **free-busy 는 `OPAQUE` 이벤트만 집계.** compose `getFreeBusyEvents` 가 `transp = 'OPAQUE'` + 기간 겹침(`dtend >= start AND dtstart <= end`)으로 필터한다 → `TRANSPARENT` 이벤트는 바쁨에 안 잡힌다. `status = TENTATIVE` 는 `BUSY-TENTATIVE`, 그 외는 `BUSY` 로 표기(`getFreeBusy`).
- **토큰 재발급은 구독 존재를 먼저 확인한다.** `regenerateSubscriptionToken`·`regenerateIcsToken`(`service/domain/calendar/calendar.ts:486-501`)이 `db.getSubscription(userId)` 로 행을 읽고 없으면 `CALENDAR_SUBSCRIPTION_NOT_FOUND` 를 던진다. 이전에는 UPDATE 가 0행에 적용되고도 새 토큰 문자열을 200 으로 돌려줘, 클라이언트가 아무 데도 연결되지 않는 CalDAV/ICS URL 을 저장했다.
- **그룹 PATCH 는 갱신 행을 반드시 돌려준다.** `route/calendar/group.ts:55` 가 재조회 결과가 `null` 이면 404 를 던진다. 응답 봉투의 `data` 가 `null` 로 나가 소비자 파싱이 깨지던 경로(C-10)를 막는다.
- **이벤트의 `groupId` 는 소유권을 검증한다.** `route/calendar/event.ts` 의 `assertGroupOwned` 가 `groupId` 가 있을 때 `calendarService.getGroupById(userId, groupId)` 로 확인하고 없으면 `CALENDAR_GROUP_NOT_FOUND`(404). 목록 조회(`/range`)뿐 아니라 **생성 2종·PUT·PATCH 전부**에 적용되므로, 남의 그룹 id 를 실어 이벤트를 그 그룹에 넣는 경로가 막힌다.
- **날짜 역전은 400 이다.** `dto/calendar-event.ts` 의 `createEventSchema`·`updateEventSchema` 가 `dtend >= dtstart` 를 `refine`(경로 `dtend`)하고, 분리형 바디 경로(`/create`·PATCH)는 라우트의 `assertDateRange` 가 병합 결과를 검사해 `VALIDATION_ERROR`(400)를 던진다. PATCH 는 `startDate`·`endDate` 를 **둘 다 보낸 경우에만** 검사한다(한쪽만 바꾸는 부분 수정은 기존 값과의 역전을 막지 않는다).
- **CalDAV 는 세션 미들웨어 밖.** 토큰이 곧 자격증명이므로 토큰 유출 = 캘린더 노출. `/caldav/`·`/.well-known/caldav` 는 `securityExcludePaths` 로 제외된다.

## 관련 문서

- 배포/프록시: **`deploy/caldav-proxy`** 는 CalDAV 트래픽(PROPFIND/REPORT 등)을 `https://api.gumyo.net` 으로 포워딩하는 별도 Bun 리버스 프록시다(서버리스가 비표준 HTTP 메서드를 못 받는 우회). 상세 [../deploy.md](../deploy.md).
- 아키텍처(계층·부트스트랩): [../architecture.md](../architecture.md)
- 어드민 캘린더 화면: [../admin-features.md](../admin-features.md)
- DB 스키마 전수: [../reference/db-schema.md](../reference/db-schema.md) · 환경변수: [../reference/env.md](../reference/env.md)
- Hono 패턴 레퍼런스: [../hono-reference.md](../hono-reference.md)
- 문서 지도: [../index.md](../index.md)
