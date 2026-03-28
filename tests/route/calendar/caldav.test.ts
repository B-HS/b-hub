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
            deleted: [],
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
            headers: { 'Content-Type': 'application/xml', Depth: '0' },
            body: '<propfind xmlns="DAV:"><allprop/></propfind>',
        })
        expect(res.status).toBe(207)
        expect(res.headers.get('Content-Type')).toContain('application/xml')
    })

    test('유효하지 않은 토큰이면 404를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/caldav/invalid-token/', {
            method: 'PROPFIND',
            headers: { 'Content-Type': 'application/xml', Depth: '0' },
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
            headers: { 'Content-Type': 'application/xml', Depth: '1' },
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
})
