import { describe, it, expect } from 'bun:test'
import { buildMultistatus, parsePropfind, parseReport, buildCalendarDataResponse } from '../../lib/xml'

describe('buildMultistatus', () => {
    it('207 Multistatus XML을 생성한다', () => {
        const xml = buildMultistatus([{ href: '/test', propstats: [{ status: 200, props: { 'D:displayname': 'Test' } }] }])
        expect(xml).toContain('multistatus')
        expect(xml).toContain('/test')
        expect(xml).toContain('Test')
        expect(xml).toContain('HTTP/1.1 200 OK')
    })

    it('404 속성을 포함한다', () => {
        const xml = buildMultistatus([{ href: '/test', propstats: [{ status: 404, props: { 'D:missing': null } }] }])
        expect(xml).toContain('HTTP/1.1 404 Not Found')
    })

    it('여러 response를 포함한다', () => {
        const xml = buildMultistatus([
            { href: '/cal/1', propstats: [{ status: 200, props: { 'D:displayname': 'Cal 1' } }] },
            { href: '/cal/2', propstats: [{ status: 200, props: { 'D:displayname': 'Cal 2' } }] },
            { href: '/cal/3', propstats: [{ status: 200, props: { 'D:displayname': 'Cal 3' } }] },
        ])

        const responseCount = xml.split('D:response').length - 1
        expect(responseCount).toBeGreaterThanOrEqual(3)
        expect(xml).toContain('/cal/1')
        expect(xml).toContain('/cal/2')
        expect(xml).toContain('/cal/3')
    })

    it('빈 responses 배열을 처리한다', () => {
        const xml = buildMultistatus([])

        expect(xml).toContain('multistatus')
        expect(xml).not.toContain('D:href')
    })
})

describe('parsePropfind', () => {
    it('빈 XML은 allprop으로 처리한다', () => {
        const result = parsePropfind('')
        expect(result.allprop).toBe(true)
    })

    it('prop 요소를 파싱한다', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:">
    <D:prop>
        <D:displayname/>
        <D:resourcetype/>
    </D:prop>
</D:propfind>`
        const result = parsePropfind(xml)
        expect(result.allprop).toBe(false)
        expect(result.props).toContain('displayname')
        expect(result.props).toContain('resourcetype')
    })

    it('allprop 요청을 올바르게 파싱한다', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:">
    <D:allprop/>
</D:propfind>`
        const result = parsePropfind(xml)
        expect(result.allprop).toBe(true)
    })

    it('잘못된 XML은 allprop으로 대체한다', () => {
        const result = parsePropfind('<<<not valid xml>>>')
        expect(result.allprop).toBe(true)
        expect(result.props).toEqual([])
    })
})

describe('parseReport', () => {
    it('sync-collection 요청을 파싱한다', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<D:sync-collection xmlns:D="DAV:">
    <D:sync-token>http://b-calendar/sync/abc123</D:sync-token>
    <D:prop><D:getetag/></D:prop>
</D:sync-collection>`
        const result = parseReport(xml)
        expect(result.type).toBe('sync-collection')
        expect(result.syncToken).toBe('http://b-calendar/sync/abc123')
    })

    it('잘못된 XML은 unknown으로 처리한다', () => {
        const result = parseReport('invalid xml')
        expect(result.type).toBe('unknown')
    })

    it('calendar-multiget에서 여러 href를 추출한다', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
    <D:prop><D:getetag/><C:calendar-data/></D:prop>
    <D:href>/cal/event1.ics</D:href>
    <D:href>/cal/event2.ics</D:href>
    <D:href>/cal/event3.ics</D:href>
</C:calendar-multiget>`
        const result = parseReport(xml)
        expect(result.type).toBe('calendar-multiget')
        expect(result.hrefs).toHaveLength(3)
    })

    it('calendar-query에서 time-range를 추출한다', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
    <D:prop><D:getetag/><C:calendar-data/></D:prop>
    <C:filter>
        <C:comp-filter name="VCALENDAR">
            <C:time-range start="20240101T000000Z" end="20240131T235959Z"/>
        </C:comp-filter>
    </C:filter>
</C:calendar-query>`
        const result = parseReport(xml)
        expect(result.type).toBe('calendar-query')
        expect(result.timeRange).toBeDefined()
        expect(result.timeRange?.start).toBe('20240101T000000Z')
        expect(result.timeRange?.end).toBe('20240131T235959Z')
    })

    it('free-busy-query에서 time-range를 추출한다', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<C:free-busy-query xmlns:C="urn:ietf:params:xml:ns:caldav">
    <C:time-range start="20240101T000000Z" end="20240131T235959Z"/>
</C:free-busy-query>`
        const result = parseReport(xml)
        expect(result.type).toBe('free-busy-query')
        expect(result.timeRange).toBeDefined()
        expect(result.timeRange?.start).toBe('20240101T000000Z')
        expect(result.timeRange?.end).toBe('20240131T235959Z')
    })

    it('sync-collection에서 syncToken이 빈 문자열이면 undefined를 반환한다', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<D:sync-collection xmlns:D="DAV:">
    <D:sync-token></D:sync-token>
    <D:prop><D:getetag/></D:prop>
</D:sync-collection>`
        const result = parseReport(xml)
        expect(result.type).toBe('sync-collection')
        expect(result.syncToken).toBeUndefined()
    })
})

describe('buildCalendarDataResponse', () => {
    it('calendar-data 응답을 생성한다', () => {
        const xml = buildCalendarDataResponse([{ href: '/cal/event.ics', etag: 'abc123', calendarData: 'BEGIN:VCALENDAR...' }])
        expect(xml).toContain('abc123')
        expect(xml).toContain('BEGIN:VCALENDAR...')
    })

    it('404 상태 응답을 생성한다', () => {
        const xml = buildCalendarDataResponse([{ href: '/cal/deleted.ics', etag: '', status: 404 }])
        expect(xml).toContain('404')
        expect(xml).toContain('/cal/deleted.ics')
    })

    it('여러 이벤트 응답을 생성한다', () => {
        const xml = buildCalendarDataResponse([
            { href: '/cal/e1.ics', etag: 'aaa', calendarData: 'BEGIN:VCALENDAR\nEND:VCALENDAR' },
            { href: '/cal/e2.ics', etag: 'bbb', calendarData: 'BEGIN:VCALENDAR\nEND:VCALENDAR' },
            { href: '/cal/e3.ics', etag: 'ccc', calendarData: 'BEGIN:VCALENDAR\nEND:VCALENDAR' },
        ])

        expect(xml).toContain('/cal/e1.ics')
        expect(xml).toContain('/cal/e2.ics')
        expect(xml).toContain('/cal/e3.ics')
        const responseCount = xml.split('D:response').length - 1
        expect(responseCount).toBeGreaterThanOrEqual(3)
    })

    it('calendar-data가 없는 응답을 생성한다', () => {
        const xml = buildCalendarDataResponse([{ href: '/cal/no-data.ics', etag: 'xyz123' }])

        expect(xml).toContain('/cal/no-data.ics')
        expect(xml).toContain('xyz123')
        expect(xml).not.toContain('calendar-data')
    })
})
