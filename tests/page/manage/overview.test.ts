import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createManageOverviewRoute } from '../../../page/manage/pages/overview'
import { mockUser, sessionOf, stubAiConnectionService, stubApiTokenService, stubMailAccountService, stubWeatherApiKeyService } from './helpers'

const createApp = (opts: Parameters<typeof createManageOverviewRoute>[0]) => {
    const app = new Hono()
    app.route('/manage', createManageOverviewRoute(opts))
    return app
}

describe('GET /manage (Overview)', () => {
    test('로그인 사용자의 이메일·이름·role을 보여준다', async () => {
        const app = createApp({
            getSession: sessionOf(mockUser),
            apiTokenService: stubApiTokenService(),
            weatherApiKeyService: stubWeatherApiKeyService(),
            aiConnectionService: stubAiConnectionService(),
            mailAccountService: stubMailAccountService(),
        })
        const res = await app.request('/manage')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('user@example.com')
        expect(html).toContain('User')
        expect(html).toContain('user')
    })

    test('연동 요약 카운트를 집계한다', async () => {
        const app = createApp({
            getSession: sessionOf(mockUser),
            apiTokenService: stubApiTokenService({ listByUser: () => Promise.resolve([{ id: 1 } as never, { id: 2 } as never]) }),
            weatherApiKeyService: stubWeatherApiKeyService({ listByUser: () => Promise.resolve([{ id: 1 } as never]) }),
            aiConnectionService: stubAiConnectionService({
                list: () =>
                    Promise.resolve([
                        { provider: 'anthropic', status: 'active' } as never,
                        { provider: 'codex', status: 'reauth_required' } as never,
                    ]),
            }),
            mailAccountService: stubMailAccountService({ list: () => Promise.resolve([{ id: 1 } as never]) }),
        })
        const res = await app.request('/manage')
        const html = await res.text()
        expect(html).toContain('API Tokens')
        expect(html).toContain('AI Providers Connected')
    })

    test('aiConnectionService 미구성이면 안내 문구를 보여준다', async () => {
        const app = createApp({
            getSession: sessionOf(mockUser),
            apiTokenService: stubApiTokenService(),
            weatherApiKeyService: stubWeatherApiKeyService(),
        })
        const res = await app.request('/manage')
        const html = await res.text()
        expect(html).toContain('구성되지 않았습니다')
    })
})
