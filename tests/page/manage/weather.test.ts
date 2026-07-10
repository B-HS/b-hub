import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createManageWeatherKeysRoute } from '../../../page/manage/pages/weather'
import type { WeatherApiKeyService } from '../../../service/domain/weather/weather-api-key'
import { mockUser, sessionOf, stubWeatherApiKeyService } from './helpers'

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
    test('create를 호출하고 발급된 키를 1회 노출한다', async () => {
        const create = mock(() => Promise.resolve('brand-new-weather-key'))
        const app = createApp({ create })
        const res = await app.request('/manage/weather/keys', { method: 'POST', body: new URLSearchParams({ name: '위젯용' }) })
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('brand-new-weather-key')
        expect(html).toContain('다시 표시되지 않습니다')
        expect(create).toHaveBeenCalledWith('u1', '위젯용')
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
