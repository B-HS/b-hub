import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createManageWeatherKeysRoute } from '../../../page/manage/pages/weather'
import type { WeatherApiKeyService } from '../../../service/domain/weather/weather-api-key'
import { cookieHeaderFrom, mockUser, sessionOf, stubWeatherApiKeyService } from './helpers'

const sampleKey = {
    id: 3,
    name: '위젯용',
    dailyLimit: 1000,
    todayUsage: 12,
    expiresAt: null,
    lastUsedAt: new Date('2026-05-20'),
    createdAt: new Date('2026-05-01'),
}

const createApp = (overrides: Partial<WeatherApiKeyService> = {}) => {
    const app = new Hono()
    app.route(
        '/manage/weather/keys',
        createManageWeatherKeysRoute({ getSession: sessionOf(mockUser), weatherApiKeyService: stubWeatherApiKeyService(overrides) }),
    )
    return app
}

describe('GET /manage/weather/keys', () => {
    test('키 이름과 일일 한도·사용량을 보여준다', async () => {
        const res = await createApp({ listByUser: () => Promise.resolve([sampleKey]) }).request('/manage/weather/keys')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('위젯용')
        expect(html).toContain('1000')
        expect(html).toContain('12')
    })
})

describe('POST /manage/weather/keys', () => {
    test('create를 호출하고 303 + 일회성 쿠키로 키를 넘긴다', async () => {
        const create = mock(() => Promise.resolve('brand-new-weather-key'))
        const app = createApp({ create })
        const res = await app.request('/manage/weather/keys', { method: 'POST', body: new URLSearchParams({ name: '위젯용' }) })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/manage/weather/keys')
        const setCookie = res.headers.get('set-cookie') ?? ''
        expect(setCookie).toContain('hub_reveal=brand-new-weather-key')
        expect(setCookie).toContain('HttpOnly')
        expect(setCookie).toContain('Path=/manage/weather/keys')
        expect(create).toHaveBeenCalledWith('u1', '위젯용')
    })

    test('발급 후 GET 한 번만 키를 노출하고 쿠키를 삭제한다', async () => {
        const app = createApp({ create: mock(() => Promise.resolve('brand-new-weather-key')) })
        const posted = await app.request('/manage/weather/keys', { method: 'POST', body: new URLSearchParams({ name: '위젯용' }) })
        const cookie = cookieHeaderFrom(posted)

        const revealed = await app.request('/manage/weather/keys', { headers: { cookie } })
        const html = await revealed.text()
        expect(html).toContain('brand-new-weather-key')
        expect(html).toContain('다시 표시되지 않습니다')
        expect(revealed.headers.get('set-cookie') ?? '').toContain('Max-Age=0')

        const again = await app.request('/manage/weather/keys')
        expect(await again.text()).not.toContain('brand-new-weather-key')
    })
})

describe('POST /manage/weather/keys/:id/delete', () => {
    test('revoke를 정수 id로 호출하고 303을 반환한다', async () => {
        const revoke = mock(() => Promise.resolve())
        const app = createApp({ revoke })
        const res = await app.request('/manage/weather/keys/3/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/manage/weather/keys?flash=ok')
        expect(revoke).toHaveBeenCalledWith('u1', 3)
    })
})
