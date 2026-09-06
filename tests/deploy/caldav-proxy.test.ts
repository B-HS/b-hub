import { describe, expect, test } from 'bun:test'
import { createProxyFetch } from '../../deploy/caldav-proxy/proxy'

const TARGET = 'https://api.gumyo.net'
const TARGET_HOST = 'api.gumyo.net'

type CapturedRequest = { url: string; init: RequestInit }

const createFetchSpy = (response: Response) => {
    const calls: CapturedRequest[] = []
    const fetchImpl = ((url: string, init: RequestInit) => {
        calls.push({ url, init })
        return Promise.resolve(response)
    }) as unknown as typeof fetch

    return { calls, fetchImpl }
}

const createHandler = (response: Response) => {
    const { calls, fetchImpl } = createFetchSpy(response)
    return { calls, handler: createProxyFetch({ target: TARGET, targetHost: TARGET_HOST, fetchImpl }) }
}

describe('caldav proxy 업스트림 요청', () => {
    test('Accept-Encoding: identity 로 요청해 업스트림 압축을 막는다', async () => {
        const { calls, handler } = createHandler(new Response('ok'))

        await handler(new Request('http://caldav.hyns.dev/caldav/token-1/', { headers: { 'Accept-Encoding': 'gzip, deflate, br' } }))

        const headers = calls[0].init.headers as Headers
        expect(headers.get('Accept-Encoding')).toBe('identity')
    })

    test('Host 를 대상 호스트로 바꾸고 cf-* 헤더를 제거한다', async () => {
        const { calls, handler } = createHandler(new Response('ok'))

        await handler(
            new Request('http://caldav.hyns.dev/caldav/token-1/', {
                headers: { 'cf-connecting-ip': '1.2.3.4', 'cf-ray': 'ray-1' },
            }),
        )

        const headers = calls[0].init.headers as Headers
        expect(headers.get('Host')).toBe(TARGET_HOST)
        expect(headers.get('cf-connecting-ip')).toBeNull()
        expect(headers.get('cf-ray')).toBeNull()
    })

    test('경로와 쿼리를 유지한 대상 URL 로 전달한다', async () => {
        const { calls, handler } = createHandler(new Response('ok'))

        await handler(new Request('http://caldav.hyns.dev/caldav/token-1/default/uid.ics?export=1', { method: 'PROPFIND' }))

        expect(calls[0].url).toBe(`${TARGET}/caldav/token-1/default/uid.ics?export=1`)
        expect(calls[0].init.method).toBe('PROPFIND')
        expect(calls[0].init.redirect).toBe('manual')
    })
})

describe('caldav proxy 응답 전달', () => {
    test('업스트림의 content-encoding 과 content-length 를 제거한다', async () => {
        const upstream = new Response('BEGIN:VCALENDAR', {
            status: 207,
            headers: { 'Content-Type': 'text/xml', 'Content-Encoding': 'gzip', 'Content-Length': '15', 'DAV': '1, 2, calendar-access' },
        })
        const { handler } = createHandler(upstream)

        const res = await handler(new Request('http://caldav.hyns.dev/caldav/token-1/'))

        expect(res.status).toBe(207)
        expect(res.headers.get('content-encoding')).toBeNull()
        expect(res.headers.get('content-length')).toBeNull()
        expect(res.headers.get('content-type')).toBe('text/xml')
        expect(res.headers.get('dav')).toBe('1, 2, calendar-access')
    })

    test('본문은 그대로 전달한다', async () => {
        const { handler } = createHandler(new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR', { status: 200 }))

        const res = await handler(new Request('http://caldav.hyns.dev/caldav/token-1/'))

        expect(await res.text()).toBe('BEGIN:VCALENDAR\r\nEND:VCALENDAR')
    })

    test('업스트림 상태코드를 그대로 전달한다', async () => {
        const { handler } = createHandler(new Response(null, { status: 304 }))

        const res = await handler(new Request('http://caldav.hyns.dev/caldav/token-1/'))

        expect(res.status).toBe(304)
    })
})
