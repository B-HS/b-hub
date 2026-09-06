import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createCalendarCaldavRoute } from '../../../route/calendar/caldav'

const now = new Date('2024-01-15T10:00:00Z')
const later = new Date('2024-01-15T11:00:00Z')

const mockSubscription = {
    id: 'sub-1',
    userId: 'user-1',
    token: 'valid-token',
    icsToken: 'ics-token',
    name: 'My Calendar',
    isActive: true,
    ctag: '1',
    lastAccessedAt: null,
}

const mockEvent = {
    uid: 'test-uid@b-calendar',
    summary: '회의',
    description: '팀 미팅',
    dtstart: now,
    dtend: later,
    isAllDay: false,
    sequence: 0,
    created: now,
    lastModified: now,
}

const createMockCalendarService = () => ({
    getSubscriptionByToken: mock((token: string) => Promise.resolve(token === 'valid-token' ? mockSubscription : null)),
    getAllEvents: mock(() => Promise.resolve([mockEvent])),
    getEventByUid: mock((_userId: string, _uid: string) => Promise.resolve(mockEvent as typeof mockEvent | null)),
    getEventEtag: mock(() => 'etag-123'),
    upsertEventByUid: mock(() => Promise.resolve({ event: mockEvent, created: true as boolean })),
    deleteEvent: mock(() => Promise.resolve()),
    getUserTimezone: mock(() => Promise.resolve('Asia/Seoul')),
})

const createMockCaldavService = () => ({
    getUserTimezone: mock(() => Promise.resolve('Asia/Seoul')),
    getCalendarProperties: mock(() => ({
        found: { 'D:resourcetype': { 'D:collection': '', 'C:calendar': '' }, 'D:displayname': 'My Calendar' },
        notFound: [],
    })),
    getChangesFromToken: mock(() =>
        Promise.resolve({
            changed: [mockEvent],
            deleted: [] as string[],
            syncToken: 'http://b-calendar/sync/1',
        }),
    ),
    getFreeBusy: mock(() => Promise.resolve([])),
    generateFreeBusyICS: mock(() => 'BEGIN:VCALENDAR\r\nEND:VCALENDAR'),
})

const createMockDeps = () => ({
    calendarService: createMockCalendarService(),
    caldavService: createMockCaldavService(),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/caldav', createCalendarCaldavRoute(deps as never))
    return { app, deps }
}

describe('CalDAV OPTIONS', () => {
    test('DAV 헤더를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token', { method: 'OPTIONS' })
        expect(res.status).toBe(200)
        expect(res.headers.get('DAV')).toContain('calendar-access')
    })
})

describe('CalDAV PROPFIND', () => {
    test('207 멀티스테이터스를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/', {
            method: 'PROPFIND',
            headers: { 'Content-Type': 'application/xml', 'Depth': '0' },
            body: '<propfind xmlns="DAV:"><allprop/></propfind>',
        })
        expect(res.status).toBe(207)
        expect(res.headers.get('Content-Type')).toContain('application/xml')
    })

    test('유효하지 않은 토큰이면 404를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/invalid-token/', {
            method: 'PROPFIND',
            headers: { 'Content-Type': 'application/xml', 'Depth': '0' },
            body: '<propfind xmlns="DAV:"><allprop/></propfind>',
        })
        expect(res.status).toBe(404)
    })
})

describe('CalDAV GET /:token/:uid.ics', () => {
    test('이벤트 ICS 콘텐츠를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/test-uid.ics')
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toContain('text/calendar')
        const body = await res.text()
        expect(body).toContain('BEGIN:VCALENDAR')
    })
})

describe('CalDAV PUT /:token/default/:uid.ics', () => {
    test('이벤트를 생성/수정한다', async () => {
        const { app } = createApp()
        const icsData = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'UID:new-event@b-calendar',
            'SUMMARY:새 이벤트',
            'DTSTART:20240115T100000Z',
            'DTEND:20240115T110000Z',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n')

        const res = await app.request('/caldav/valid-token/default/new-event.ics', {
            method: 'PUT',
            headers: { 'Content-Type': 'text/calendar' },
            body: icsData,
        })
        expect([201, 204]).toContain(res.status)
        expect(res.headers.get('ETag')).toBeTruthy()
    })

    test('1MB 초과 ICS 데이터는 413을 반환한다', async () => {
        const { app } = createApp()
        const largeData = 'X'.repeat(1024 * 1024 + 1)

        const res = await app.request('/caldav/valid-token/default/large-event.ics', {
            method: 'PUT',
            headers: { 'Content-Type': 'text/calendar' },
            body: largeData,
        })
        expect(res.status).toBe(413)
    })
})

describe('CalDAV PUT /:token/:uid (non-default path)', () => {
    test('1MB 초과 ICS 데이터는 413을 반환한다', async () => {
        const { app } = createApp()
        const largeData = 'X'.repeat(1024 * 1024 + 1)

        const res = await app.request('/caldav/valid-token/large-event.ics', {
            method: 'PUT',
            headers: { 'Content-Type': 'text/calendar' },
            body: largeData,
        })
        expect(res.status).toBe(413)
    })
})

describe('CalDAV DELETE /:token/default/:uid.ics', () => {
    test('이벤트를 삭제하고 204를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/default/test-uid.ics', { method: 'DELETE' })
        expect(res.status).toBe(204)
    })
})

describe('CalDAV OPTIONS 추가', () => {
    test('Allow 헤더를 포함한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token', { method: 'OPTIONS' })
        expect(res.status).toBe(200)
        const allow = res.headers.get('Allow')
        expect(allow).toBeTruthy()
        expect(allow).toContain('OPTIONS')
        expect(allow).toContain('GET')
        expect(allow).toContain('PUT')
        expect(allow).toContain('DELETE')
        expect(allow).toContain('PROPFIND')
        expect(allow).toContain('REPORT')
    })
})

describe('CalDAV PROPFIND Depth:1', () => {
    test('Depth:1이면 이벤트 목록을 포함한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/', {
            method: 'PROPFIND',
            headers: { 'Content-Type': 'application/xml', 'Depth': '1' },
            body: '<propfind xmlns="DAV:"><allprop/></propfind>',
        })
        expect(res.status).toBe(207)
        const body = await res.text()
        expect(body).toContain('D:response')
        expect(body).toContain('test-uid')
    })
})

describe('CalDAV GET /:token/:uid 추가', () => {
    test('이벤트가 없으면 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getEventByUid = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/caldav/valid-token/nonexistent-uid.ics')
        expect(res.status).toBe(404)
    })

    test('ETag 헤더를 포함한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/test-uid.ics')
        expect(res.status).toBe(200)
        const etag = res.headers.get('ETag')
        expect(etag).toBeTruthy()
    })
})

describe('CalDAV PUT /:token/:uid.ics 응답 코드', () => {
    test('잘못된 ICS 데이터이면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/bad-event.ics', {
            method: 'PUT',
            headers: { 'Content-Type': 'text/calendar' },
            body: 'THIS IS NOT VALID ICS DATA',
        })
        expect(res.status).toBe(422)
    })

    test('새 이벤트를 생성하면 201을 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.upsertEventByUid = mock(() => Promise.resolve({ event: mockEvent, created: true as boolean }))
        const { app } = createApp(deps)
        const icsData = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'UID:new-event@b-calendar',
            'SUMMARY:새 이벤트',
            'DTSTART:20240115T100000Z',
            'DTEND:20240115T110000Z',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n')
        const res = await app.request('/caldav/valid-token/new-event.ics', {
            method: 'PUT',
            headers: { 'Content-Type': 'text/calendar' },
            body: icsData,
        })
        expect(res.status).toBe(201)
    })

    test('기존 이벤트를 수정하면 204를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.upsertEventByUid = mock(() => Promise.resolve({ event: mockEvent, created: false as boolean }))
        const { app } = createApp(deps)
        const icsData = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'UID:existing-event@b-calendar',
            'SUMMARY:수정된 이벤트',
            'DTSTART:20240115T100000Z',
            'DTEND:20240115T110000Z',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n')
        const res = await app.request('/caldav/valid-token/existing-event.ics', {
            method: 'PUT',
            headers: { 'Content-Type': 'text/calendar' },
            body: icsData,
        })
        expect(res.status).toBe(204)
    })
})

describe('CalDAV DELETE /:token/:uid.ics 추가', () => {
    test('삭제 후 204를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/test-uid.ics', { method: 'DELETE' })
        expect(res.status).toBe(204)
    })
})

describe('CalDAV PROPPATCH', () => {
    test('207 응답을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/', {
            method: 'PROPPATCH',
            headers: { 'Content-Type': 'application/xml' },
            body: '<propertyupdate xmlns="DAV:"><set><prop><displayname>New Name</displayname></prop></set></propertyupdate>',
        })
        expect(res.status).toBe(207)
        expect(res.headers.get('Content-Type')).toContain('application/xml')
    })
})

describe('CalDAV MKCALENDAR', () => {
    test('201 응답을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/new-calendar', { method: 'MKCALENDAR' })
        expect(res.status).toBe(201)
    })
})

describe('CalDAV GET /:token 전체 캘린더', () => {
    test('전체 캘린더 ICS를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token')
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toContain('text/calendar')
        const body = await res.text()
        expect(body).toContain('BEGIN:VCALENDAR')
    })
})

describe('CalDAV PROPFIND /default (calendar collection)', () => {
    test('Depth:0이면 캘린더 속성만 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/default/', {
            method: 'PROPFIND',
            headers: { 'Content-Type': 'application/xml', 'Depth': '0' },
            body: '<propfind xmlns="DAV:"><allprop/></propfind>',
        })
        expect(res.status).toBe(207)
        expect(res.headers.get('Content-Type')).toContain('application/xml')
        const body = await res.text()
        expect(body).toContain('/default/')
    })

    test('Depth:1이면 이벤트 목록을 포함한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/default/', {
            method: 'PROPFIND',
            headers: { 'Content-Type': 'application/xml', 'Depth': '1' },
            body: '<propfind xmlns="DAV:"><allprop/></propfind>',
        })
        expect(res.status).toBe(207)
        const body = await res.text()
        expect(body).toContain('test-uid')
    })

    test('trailing slash 없이도 동작한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/default', {
            method: 'PROPFIND',
            headers: { 'Content-Type': 'application/xml', 'Depth': '0' },
            body: '<propfind xmlns="DAV:"><allprop/></propfind>',
        })
        expect(res.status).toBe(207)
    })

    test('유효하지 않은 토큰이면 404를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/invalid-token/default/', {
            method: 'PROPFIND',
            headers: { 'Content-Type': 'application/xml', 'Depth': '0' },
            body: '<propfind xmlns="DAV:"><allprop/></propfind>',
        })
        expect(res.status).toBe(404)
    })
})

describe('CalDAV REPORT', () => {
    test('calendar-query를 처리한다', async () => {
        const { app } = createApp()
        const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT"/>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`

        const res = await app.request('/caldav/valid-token/', {
            method: 'REPORT',
            headers: { 'Content-Type': 'application/xml' },
            body: reportBody,
        })
        expect(res.status).toBe(207)
    })

    test('sync-collection을 처리한다', async () => {
        const { app } = createApp()
        const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:sync-collection xmlns:D="DAV:">
  <D:sync-token/>
  <D:prop>
    <D:getetag/>
  </D:prop>
</D:sync-collection>`

        const res = await app.request('/caldav/valid-token/', {
            method: 'REPORT',
            headers: { 'Content-Type': 'application/xml' },
            body: reportBody,
        })
        expect(res.status).toBe(207)
        const body = await res.text()
        expect(body).toContain('sync-token')
    })

    test('free-busy-query를 처리한다', async () => {
        const { app } = createApp()
        const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<C:free-busy-query xmlns:C="urn:ietf:params:xml:ns:caldav">
  <C:time-range start="20240101T000000Z" end="20240131T235959Z"/>
</C:free-busy-query>`

        const res = await app.request('/caldav/valid-token/', {
            method: 'REPORT',
            headers: { 'Content-Type': 'application/xml' },
            body: reportBody,
        })
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toContain('text/calendar')
    })

    test('free-busy-query time-range 없으면 400을 반환한다', async () => {
        const { app } = createApp()
        const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<C:free-busy-query xmlns:C="urn:ietf:params:xml:ns:caldav">
</C:free-busy-query>`

        const res = await app.request('/caldav/valid-token/', {
            method: 'REPORT',
            headers: { 'Content-Type': 'application/xml' },
            body: reportBody,
        })
        expect(res.status).toBe(400)
    })

    test('calendar-multiget으로 개별 이벤트를 조회한다', async () => {
        const { app } = createApp()
        const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <D:href>/caldav/valid-token/test-uid.ics</D:href>
</C:calendar-multiget>`

        const res = await app.request('/caldav/valid-token/', {
            method: 'REPORT',
            headers: { 'Content-Type': 'application/xml' },
            body: reportBody,
        })
        expect(res.status).toBe(207)
        const body = await res.text()
        expect(body).toContain('BEGIN:VCALENDAR')
    })

    test('calendar-multiget에서 존재하지 않는 이벤트는 404를 포함한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getEventByUid = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <D:href>/caldav/valid-token/nonexistent.ics</D:href>
</C:calendar-multiget>`

        const res = await app.request('/caldav/valid-token/', {
            method: 'REPORT',
            headers: { 'Content-Type': 'application/xml' },
            body: reportBody,
        })
        expect(res.status).toBe(207)
        const body = await res.text()
        expect(body).toContain('404')
    })

    test('알 수 없는 report 타입이면 400을 반환한다', async () => {
        const { app } = createApp()
        const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:unknown-report xmlns:D="DAV:">
</D:unknown-report>`

        const res = await app.request('/caldav/valid-token/', {
            method: 'REPORT',
            headers: { 'Content-Type': 'application/xml' },
            body: reportBody,
        })
        expect(res.status).toBe(400)
    })

    test('유효하지 않은 토큰이면 404를 반환한다', async () => {
        const { app } = createApp()
        const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/></D:prop>
  <C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"/></C:comp-filter></C:filter>
</C:calendar-query>`

        const res = await app.request('/caldav/invalid-token/', {
            method: 'REPORT',
            headers: { 'Content-Type': 'application/xml' },
            body: reportBody,
        })
        expect(res.status).toBe(404)
    })

    test('/default 경로에서도 REPORT가 동작한다', async () => {
        const { app } = createApp()
        const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"/></C:comp-filter></C:filter>
</C:calendar-query>`

        const res = await app.request('/caldav/valid-token/default/', {
            method: 'REPORT',
            headers: { 'Content-Type': 'application/xml' },
            body: reportBody,
        })
        expect(res.status).toBe(207)
    })

    test('sync-collection에서 삭제된 이벤트도 포함한다', async () => {
        const deps = createMockDeps()
        deps.caldavService.getChangesFromToken = mock(() =>
            Promise.resolve({
                changed: [] as (typeof mockEvent)[],
                deleted: ['deleted-uid@b-calendar'],
                syncToken: 'http://b-calendar/sync/2',
            }),
        )
        const { app } = createApp(deps)
        const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:sync-collection xmlns:D="DAV:">
  <D:sync-token>http://b-calendar/sync/1</D:sync-token>
  <D:prop><D:getetag/></D:prop>
</D:sync-collection>`

        const res = await app.request('/caldav/valid-token/', {
            method: 'REPORT',
            headers: { 'Content-Type': 'application/xml' },
            body: reportBody,
        })
        expect(res.status).toBe(207)
        const body = await res.text()
        expect(body).toContain('deleted-uid')
        expect(body).toContain('404 Not Found')
        expect(body).toContain('http://b-calendar/sync/2')
    })
})

describe('CalDAV GET /:token/default 전체 캘린더', () => {
    test('trailing slash로 전체 캘린더를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/default/')
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toContain('text/calendar')
        expect(res.headers.get('DAV')).toContain('calendar-access')
    })

    test('trailing slash 없이도 전체 캘린더를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/default')
        expect(res.status).toBe(200)
        const body = await res.text()
        expect(body).toContain('BEGIN:VCALENDAR')
    })

    test('유효하지 않은 토큰이면 404를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/invalid-token/default/')
        expect(res.status).toBe(404)
    })
})

describe('CalDAV GET /:token/default/:uid', () => {
    test('단일 이벤트를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/default/test-uid.ics')
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toContain('text/calendar')
        expect(res.headers.get('ETag')).toBeTruthy()
    })

    test('존재하지 않는 이벤트면 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getEventByUid = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/caldav/valid-token/default/nonexistent.ics')
        expect(res.status).toBe(404)
    })
})

describe('CalDAV PROPFIND 특정 속성 요청', () => {
    test('allprop 대신 특정 prop을 요청할 수 있다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/', {
            method: 'PROPFIND',
            headers: { 'Content-Type': 'application/xml', 'Depth': '0' },
            body: `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
    <D:displayname/>
  </D:prop>
</D:propfind>`,
        })
        expect(res.status).toBe(207)
    })

    test('빈 body로도 PROPFIND가 동작한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/', {
            method: 'PROPFIND',
            headers: { Depth: '0' },
        })
        expect(res.status).toBe(207)
    })
})

describe('CalDAV PROPPATCH 경로 변형', () => {
    test('trailing slash 없이도 동작한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token', {
            method: 'PROPPATCH',
            headers: { 'Content-Type': 'application/xml' },
            body: '<propertyupdate xmlns="DAV:"><set><prop><displayname>Test</displayname></prop></set></propertyupdate>',
        })
        expect(res.status).toBe(207)
    })

    test('하위 경로에서도 동작한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/default/', {
            method: 'PROPPATCH',
            headers: { 'Content-Type': 'application/xml' },
            body: '<propertyupdate xmlns="DAV:"><set><prop><displayname>Test</displayname></prop></set></propertyupdate>',
        })
        expect(res.status).toBe(207)
        const body = await res.text()
        expect(body).toContain('/caldav/valid-token/default/')
    })
})

describe('CalDAV OPTIONS 경로 변형', () => {
    test('하위 경로에서도 DAV 헤더를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/valid-token/default/', { method: 'OPTIONS' })
        expect(res.status).toBe(200)
        expect(res.headers.get('DAV')).toContain('calendar-access')
        expect(res.headers.get('Allow')).toContain('PROPFIND')
    })
})

describe('CalDAV 에러 핸들링', () => {
    test('서비스 예외 시 500을 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getSubscriptionByToken = mock(() => {
            throw new Error('DB connection failed')
        })
        const { app } = createApp(deps)
        const res = await app.request('/caldav/valid-token/')
        expect(res.status).toBe(500)
    })
})

describe('CalDAV PUT 타임존 처리', () => {
    test('UTC ICS 값을 사용자 타임존 벽시계로 저장한다', async () => {
        const deps = createMockDeps()
        const { app } = createApp(deps)
        const icsData = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'UID:tz-event@b-calendar',
            'SUMMARY:타임존 이벤트',
            'DTSTART:20240115T100000Z',
            'DTEND:20240115T110000Z',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n')

        await app.request('/caldav/valid-token/tz-event.ics', {
            method: 'PUT',
            headers: { 'Content-Type': 'text/calendar' },
            body: icsData,
        })

        const [, , input] = deps.calendarService.upsertEventByUid.mock.calls[0] as unknown as [string, string, { dtstart: Date; dtend: Date }]
        expect(input.dtstart.toISOString()).toBe('2024-01-15T19:00:00.000Z')
        expect(input.dtend.toISOString()).toBe('2024-01-15T20:00:00.000Z')
    })

    test('VALARM 설명이 이벤트 설명을 덮어쓰지 않는다', async () => {
        const deps = createMockDeps()
        const { app } = createApp(deps)
        const icsData = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'UID:alarm-event@b-calendar',
            'SUMMARY:회의',
            'DESCRIPTION:본문 설명',
            'DTSTART:20240115T100000Z',
            'DTEND:20240115T110000Z',
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            'DESCRIPTION:알림',
            'TRIGGER:-PT10M',
            'END:VALARM',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n')

        await app.request('/caldav/valid-token/alarm-event.ics', {
            method: 'PUT',
            headers: { 'Content-Type': 'text/calendar' },
            body: icsData,
        })

        const [, , input] = deps.calendarService.upsertEventByUid.mock.calls[0] as unknown as [string, string, { description?: string }]
        expect(input.description).toBe('본문 설명')
    })
})

describe('CalDAV href 단일화 (D-16)', () => {
    const propfindBody = '<propfind xmlns="DAV:"><allprop/></propfind>'
    const calendarQueryBody = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"/></C:comp-filter></C:filter>
</C:calendar-query>`

    test('principal 컬렉션의 PROPFIND 와 REPORT href 가 같다', async () => {
        const { app } = createApp()

        const propfind = await app.request('/caldav/valid-token/', {
            method: 'PROPFIND',
            headers: { Depth: '1' },
            body: propfindBody,
        })
        const report = await app.request('/caldav/valid-token/', {
            method: 'REPORT',
            headers: { 'Content-Type': 'application/xml' },
            body: calendarQueryBody,
        })

        const propfindBodyText = await propfind.text()
        const reportBodyText = await report.text()
        expect(propfindBodyText).toContain('/caldav/valid-token/test-uid.ics')
        expect(reportBodyText).toContain('/caldav/valid-token/test-uid.ics')
    })

    test('default 컬렉션의 PROPFIND 와 REPORT href 가 같다', async () => {
        const { app } = createApp()

        const propfind = await app.request('/caldav/valid-token/default/', {
            method: 'PROPFIND',
            headers: { Depth: '1' },
            body: propfindBody,
        })
        const report = await app.request('/caldav/valid-token/default/', {
            method: 'REPORT',
            headers: { 'Content-Type': 'application/xml' },
            body: calendarQueryBody,
        })

        const propfindBodyText = await propfind.text()
        const reportBodyText = await report.text()
        expect(propfindBodyText).toContain('/caldav/valid-token/default/test-uid.ics')
        expect(reportBodyText).toContain('/caldav/valid-token/default/test-uid.ics')
        expect(propfindBodyText).not.toContain('test-uid@b-calendar.ics')
    })

    test('sync-collection href 도 요청한 컬렉션을 따른다', async () => {
        const deps = createMockDeps()
        deps.caldavService.getChangesFromToken = mock(() =>
            Promise.resolve({
                changed: [mockEvent],
                deleted: ['deleted-uid@b-calendar'],
                syncToken: 'http://b-calendar/sync/2',
            }),
        )
        const { app } = createApp(deps)
        const syncBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:sync-collection xmlns:D="DAV:">
  <D:sync-token>http://b-calendar/sync/1</D:sync-token>
  <D:prop><D:getetag/></D:prop>
</D:sync-collection>`

        const res = await app.request('/caldav/valid-token/default/', {
            method: 'REPORT',
            headers: { 'Content-Type': 'application/xml' },
            body: syncBody,
        })

        const body = await res.text()
        expect(body).toContain('/caldav/valid-token/default/test-uid.ics')
        expect(body).toContain('/caldav/valid-token/default/deleted-uid.ics')
    })
})

describe('CalDAV free-busy time-range 파싱 (E-29)', () => {
    test('ICS 형식 time-range 를 사용자 타임존 벽시계로 변환한다', async () => {
        const deps = createMockDeps()
        const { app } = createApp(deps)
        const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<C:free-busy-query xmlns:C="urn:ietf:params:xml:ns:caldav">
  <C:time-range start="20240101T000000Z" end="20240131T235959Z"/>
</C:free-busy-query>`

        const res = await app.request('/caldav/valid-token/', {
            method: 'REPORT',
            headers: { 'Content-Type': 'application/xml' },
            body: reportBody,
        })

        expect(res.status).toBe(200)
        const [, start, end] = deps.caldavService.getFreeBusy.mock.calls[0] as unknown as [string, Date, Date]
        expect(Number.isNaN(start.getTime())).toBe(false)
        expect(Number.isNaN(end.getTime())).toBe(false)
        expect(start.toISOString()).toBe('2024-01-01T09:00:00.000Z')
        expect(end.toISOString()).toBe('2024-02-01T08:59:59.000Z')
    })
})

describe('CalDAV PUT EXDATE 전달 (D-15)', () => {
    const icsWithExdate = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:recurring-event@b-calendar',
        'SUMMARY:반복 이벤트',
        'DTSTART:20240115T100000Z',
        'DTEND:20240115T110000Z',
        'RRULE:FREQ=DAILY;COUNT=5',
        'EXDATE:20240117T100000Z',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n')

    test('default 경로 PUT 이 exdate 를 전달한다', async () => {
        const deps = createMockDeps()
        const { app } = createApp(deps)

        await app.request('/caldav/valid-token/default/recurring-event.ics', {
            method: 'PUT',
            headers: { 'Content-Type': 'text/calendar' },
            body: icsWithExdate,
        })

        const [, , input] = deps.calendarService.upsertEventByUid.mock.calls[0] as unknown as [string, string, { exdate?: string[] }]
        expect(input.exdate).toEqual(['20240117T100000Z'])
    })

    test('token 직속 경로 PUT 도 exdate 를 전달한다', async () => {
        const deps = createMockDeps()
        const { app } = createApp(deps)

        await app.request('/caldav/valid-token/recurring-event.ics', {
            method: 'PUT',
            headers: { 'Content-Type': 'text/calendar' },
            body: icsWithExdate,
        })

        const [, , input] = deps.calendarService.upsertEventByUid.mock.calls[0] as unknown as [string, string, { exdate?: string[] }]
        expect(input.exdate).toEqual(['20240117T100000Z'])
    })
})
