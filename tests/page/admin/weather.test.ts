import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createWeatherRoute } from '../../../page/admin/pages/weather'
import { mockAdmin, sessionOf, stubAdminDb } from './helpers'

const sampleKey = {
    id: 7,
    userId: 'u-1',
    userEmail: 'weather@example.com',
    name: 'my-key',
    token: 'wk_abcdefghijklmnop',
    dailyLimit: 1000,
    expiresAt: new Date('2026-12-31'),
    lastUsedAt: new Date('2026-05-01'),
    createdAt: new Date('2026-04-01'),
}

const sampleLog = {
    id: 3,
    endpoint: '/api/weather/current',
    nx: 60,
    ny: 127,
    statusCode: 200,
    durationMs: 42,
    errorCode: null,
    userId: 'u-1',
    createdAt: new Date('2026-05-02'),
}

const sampleGrid = {
    nx: 60,
    ny: 127,
    lastBaseDate: '20260530',
    lastBaseTime: '0500',
    rows: 12,
}

const createApp = (overrides: Parameters<typeof stubAdminDb>[0] = {}) => {
    const app = new Hono()
    app.route(
        '/admin/weather',
        createWeatherRoute({
            getSession: sessionOf(mockAdmin),
            adminDb: stubAdminDb({
                listWeatherKeys: () => Promise.resolve({ rows: [sampleKey], total: 1 }),
                listWeatherLogs: () => Promise.resolve({ rows: [sampleLog], total: 1 }),
                weatherCacheSummary: () => Promise.resolve({ current: 11, ultra: 22, short: 33 }),
                weatherCacheGrids: () => Promise.resolve([sampleGrid]),
                ...overrides,
            }),
        }),
    )
    return app
}

describe('GET /admin/weather/keys (목록)', () => {
    test('200과 사용자 이메일/마스킹된 토큰을 보여준다', async () => {
        const res = await createApp().request('/admin/weather/keys')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('weather@example.com')
        expect(html).toContain('wk_a…mnop')
        expect(html).not.toContain('wk_abcdefghijklmnop')
        expect(html).toContain('1–1 / 1')
    })

    test('q 쿼리가 필터바에 prefill 된다', async () => {
        const res = await createApp().request('/admin/weather/keys?q=foo')
        const html = await res.text()
        expect(html).toContain('value="foo"')
    })

    test('size는 최소 5로 클램프된다', async () => {
        const listWeatherKeys = mock(() => Promise.resolve({ rows: [sampleKey], total: 1 }))
        const app = createApp({ listWeatherKeys })
        await app.request('/admin/weather/keys?size=1')
        expect(listWeatherKeys.mock.calls[0]![0]).toMatchObject({ size: 5 })
    })

    test('size는 최대 100으로 클램프된다', async () => {
        const listWeatherKeys = mock(() => Promise.resolve({ rows: [sampleKey], total: 1 }))
        const app = createApp({ listWeatherKeys })
        await app.request('/admin/weather/keys?size=9999')
        expect(listWeatherKeys.mock.calls[0]![0]).toMatchObject({ size: 100 })
    })

    test('잘못된 page는 1로 폴백한다', async () => {
        const listWeatherKeys = mock(() => Promise.resolve({ rows: [sampleKey], total: 1 }))
        const app = createApp({ listWeatherKeys })
        const res = await app.request('/admin/weather/keys?page=abc')
        expect(res.status).toBe(200)
        expect(listWeatherKeys.mock.calls[0]![0]).toMatchObject({ page: 1 })
    })
})

describe('POST /admin/weather/keys/:id/revoke', () => {
    test('revokeWeatherKey를 int로 호출하고 303 flash=ok로 리다이렉트한다', async () => {
        const revokeWeatherKey = mock(() => Promise.resolve())
        const app = createApp({ revokeWeatherKey })
        const res = await app.request('/admin/weather/keys/7/revoke', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/weather/keys')
        expect(res.headers.get('location')).toContain('flash=ok')
        expect(revokeWeatherKey).toHaveBeenCalledWith(7)
    })

    test('id 0이면 revokeWeatherKey를 호출하지 않지만 여전히 303이다', async () => {
        const revokeWeatherKey = mock(() => Promise.resolve())
        const app = createApp({ revokeWeatherKey })
        const res = await app.request('/admin/weather/keys/0/revoke', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('flash=ok')
        expect(revokeWeatherKey).not.toHaveBeenCalled()
    })

    test('비숫자 id는 revokeWeatherKey를 호출하지 않는다', async () => {
        const revokeWeatherKey = mock(() => Promise.resolve())
        const app = createApp({ revokeWeatherKey })
        const res = await app.request('/admin/weather/keys/abc/revoke', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(revokeWeatherKey).not.toHaveBeenCalled()
    })
})

describe('GET /admin/weather/logs (목록 + 필터)', () => {
    test('200과 로그 엔드포인트를 보여준다', async () => {
        const res = await createApp().request('/admin/weather/logs')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('/api/weather/current')
        expect(html).toContain('1–1 / 1')
    })

    test('endpoint/status/userId/from/to 필터가 prefill 된다', async () => {
        const res = await createApp().request('/admin/weather/logs?endpoint=current&status=500&userId=u-9&from=2026-05-01&to=2026-05-31')
        const html = await res.text()
        expect(html).toContain('value="current"')
        expect(html).toContain('value="500"')
        expect(html).toContain('value="u-9"')
        expect(html).toContain('value="2026-05-01"')
        expect(html).toContain('value="2026-05-31"')
    })

    test('status/from/to를 파싱하여 listWeatherLogs로 전달한다', async () => {
        const listWeatherLogs = mock(() => Promise.resolve({ rows: [sampleLog], total: 1 }))
        const app = createApp({ listWeatherLogs })
        await app.request('/admin/weather/logs?status=404&endpoint=cur&userId=u-9&from=2026-05-01&to=2026-05-31')
        const args = listWeatherLogs.mock.calls[0]![0]
        expect(args).toMatchObject({ status: 404, endpoint: 'cur', userId: 'u-9' })
        expect(args.from).toBeInstanceOf(Date)
        expect(args.to).toBeInstanceOf(Date)
    })

    test('size는 최소 5로 클램프된다', async () => {
        const listWeatherLogs = mock(() => Promise.resolve({ rows: [sampleLog], total: 1 }))
        const app = createApp({ listWeatherLogs })
        await app.request('/admin/weather/logs?size=1')
        expect(listWeatherLogs.mock.calls[0]![0]).toMatchObject({ size: 5 })
    })

    test('size는 최대 200으로 클램프된다', async () => {
        const listWeatherLogs = mock(() => Promise.resolve({ rows: [sampleLog], total: 1 }))
        const app = createApp({ listWeatherLogs })
        await app.request('/admin/weather/logs?size=9999')
        expect(listWeatherLogs.mock.calls[0]![0]).toMatchObject({ size: 200 })
    })
})

describe('GET /admin/weather/cache', () => {
    test('200과 summary 통계 및 격자 행을 렌더링한다', async () => {
        const res = await createApp().request('/admin/weather/cache')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('Current rows')
        expect(html).toContain('11')
        expect(html).toContain('22')
        expect(html).toContain('33')
        expect(html).toContain('60, 127')
        expect(html).toContain('20260530')
    })

    test('drop 액션 폼의 action이 격자 경로를 가리킨다', async () => {
        const res = await createApp().request('/admin/weather/cache')
        const html = await res.text()
        expect(html).toContain('/admin/weather/cache/60/127/drop')
    })

    test('격자가 없으면 빈 안내를 보여준다', async () => {
        const res = await createApp({ weatherCacheGrids: () => Promise.resolve([]) }).request('/admin/weather/cache')
        const html = await res.text()
        expect(html).toContain('캐시된 격자 없음.')
    })
})

describe('POST /admin/weather/cache/:nx/:ny/drop', () => {
    test('deleteWeatherCacheGrid를 파싱된 int로 호출하고 303 flash=ok로 리다이렉트한다', async () => {
        const deleteWeatherCacheGrid = mock(() => Promise.resolve())
        const app = createApp({ deleteWeatherCacheGrid })
        const res = await app.request('/admin/weather/cache/60/127/drop', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/weather/cache')
        expect(res.headers.get('location')).toContain('flash=ok')
        expect(deleteWeatherCacheGrid).toHaveBeenCalledWith(60, 127)
    })

    test('nx가 0이면 deleteWeatherCacheGrid를 호출하지 않지만 여전히 303이다', async () => {
        const deleteWeatherCacheGrid = mock(() => Promise.resolve())
        const app = createApp({ deleteWeatherCacheGrid })
        const res = await app.request('/admin/weather/cache/0/127/drop', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('flash=ok')
        expect(deleteWeatherCacheGrid).not.toHaveBeenCalled()
    })

    test('ny가 0이면 deleteWeatherCacheGrid를 호출하지 않는다', async () => {
        const deleteWeatherCacheGrid = mock(() => Promise.resolve())
        const app = createApp({ deleteWeatherCacheGrid })
        const res = await app.request('/admin/weather/cache/60/0/drop', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(deleteWeatherCacheGrid).not.toHaveBeenCalled()
    })

    test('비숫자 격자는 deleteWeatherCacheGrid를 호출하지 않는다', async () => {
        const deleteWeatherCacheGrid = mock(() => Promise.resolve())
        const app = createApp({ deleteWeatherCacheGrid })
        const res = await app.request('/admin/weather/cache/abc/xyz/drop', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(deleteWeatherCacheGrid).not.toHaveBeenCalled()
    })
})
