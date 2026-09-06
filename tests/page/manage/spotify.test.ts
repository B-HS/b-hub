import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createManageSpotifyAccountsRoute } from '../../../page/manage/pages/spotify-accounts'
import { createManageSpotifyKeysRoute } from '../../../page/manage/pages/spotify-keys'
import { createManageSpotifyWidgetTokensRoute } from '../../../page/manage/pages/spotify-widget-tokens'
import type { SpotifyAccountService } from '../../../service/domain/spotify/spotify-account'
import type { SpotifyApiKeyService } from '../../../service/domain/spotify/spotify-api-key'
import type { SpotifyWidgetTokenService } from '../../../service/domain/spotify/spotify-widget-token'
import { cookieHeaderFrom, mockUser, sessionOf, stubSpotifyAccountService, stubSpotifyApiKeyService, stubSpotifyWidgetTokenService } from './helpers'

const sampleAccount = {
    id: 2,
    userId: 'u1',
    spotifyUserId: 'spotify-abc',
    displayName: '내 스포티파이',
    email: 'me@x.com',
    accessToken: 'ACCESS-SECRET',
    refreshToken: 'REFRESH-SECRET',
    isActive: true,
    createdAt: new Date('2026-04-01'),
    updatedAt: new Date('2026-04-01'),
}

describe('Spotify Accounts', () => {
    const createApp = (overrides: Partial<SpotifyAccountService> = {}) => {
        const app = new Hono()
        app.route(
            '/manage/spotify/accounts',
            createManageSpotifyAccountsRoute({ getSession: sessionOf(mockUser), spotifyAccountService: stubSpotifyAccountService(overrides) }),
        )
        return app
    }

    test('계정 목록에서 토큰은 노출하지 않는다', async () => {
        const res = await createApp({ list: () => Promise.resolve([sampleAccount]) as never }).request('/manage/spotify/accounts')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('spotify-abc')
        expect(html).not.toContain('ACCESS-SECRET')
        expect(html).not.toContain('REFRESH-SECRET')
    })

    test('연결 링크를 노출한다', async () => {
        const html = await (await createApp().request('/manage/spotify/accounts')).text()
        expect(html).toContain('/api/spotify/accounts/connect')
    })

    test('remove를 호출한다', async () => {
        const remove = mock(() => Promise.resolve())
        const res = await createApp({ remove }).request('/manage/spotify/accounts/2/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(remove).toHaveBeenCalledWith(2, 'u1')
    })
})

describe('Spotify API Keys', () => {
    const createApp = (keyOverrides: Partial<SpotifyApiKeyService> = {}, accountOverrides: Partial<SpotifyAccountService> = {}) => {
        const app = new Hono()
        app.route(
            '/manage/spotify/keys',
            createManageSpotifyKeysRoute({
                getSession: sessionOf(mockUser),
                spotifyApiKeyService: stubSpotifyApiKeyService(keyOverrides),
                spotifyAccountService: stubSpotifyAccountService({ getById: () => Promise.resolve(sampleAccount) as never, ...accountOverrides }),
            }),
        )
        return app
    }

    test('키 발급은 303 + 일회성 쿠키로 원문을 넘기고 다음 GET 에서 1회만 노출한다', async () => {
        const create = mock(() => Promise.resolve('brand-new-spotify-key'))
        const app = createApp({ create: create as never })
        const res = await app.request('/manage/spotify/keys', {
            method: 'POST',
            body: new URLSearchParams({ spotifyAccountId: '2', name: 'CLI' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/manage/spotify/keys')
        expect(res.headers.get('set-cookie') ?? '').toContain('hub_reveal=brand-new-spotify-key')
        expect(create).toHaveBeenCalledWith('u1', 2, 'CLI')

        const revealed = await app.request('/manage/spotify/keys', { headers: { cookie: cookieHeaderFrom(res) } })
        const html = await revealed.text()
        expect(html).toContain('brand-new-spotify-key')
        expect(html).toContain('다시 표시되지 않습니다')

        const again = await app.request('/manage/spotify/keys')
        expect(await again.text()).not.toContain('brand-new-spotify-key')
    })
})

describe('Spotify Widget Tokens', () => {
    const createApp = (tokenOverrides: Partial<SpotifyWidgetTokenService> = {}) => {
        const app = new Hono()
        app.route(
            '/manage/spotify/widget-tokens',
            createManageSpotifyWidgetTokensRoute({
                getSession: sessionOf(mockUser),
                spotifyWidgetTokenService: stubSpotifyWidgetTokenService(tokenOverrides),
                spotifyAccountService: stubSpotifyAccountService({ getById: () => Promise.resolve(sampleAccount) as never }),
            }),
        )
        return app
    }

    test('토글은 toggleActive를 호출한다', async () => {
        const toggleActive = mock(() => Promise.resolve())
        const res = await createApp({ toggleActive }).request('/manage/spotify/widget-tokens/5/toggle', {
            method: 'POST',
            body: new URLSearchParams({ isActive: 'false' }),
        })
        expect(res.status).toBe(303)
        expect(toggleActive).toHaveBeenCalledWith('u1', 5, false)
    })

    test('발급은 303 + 일회성 쿠키로 토큰을 넘기고 다음 GET 에서 1회만 노출한다', async () => {
        const create = mock(() => Promise.resolve({ token: 'brand-new-widget-token' }))
        const app = createApp({ create: create as never })
        const res = await app.request('/manage/spotify/widget-tokens', {
            method: 'POST',
            body: new URLSearchParams({ spotifyAccountId: '2' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/manage/spotify/widget-tokens')
        expect(res.headers.get('set-cookie') ?? '').toContain('hub_reveal=brand-new-widget-token')

        const revealed = await app.request('/manage/spotify/widget-tokens', { headers: { cookie: cookieHeaderFrom(res) } })
        expect(await revealed.text()).toContain('brand-new-widget-token')

        const again = await app.request('/manage/spotify/widget-tokens')
        expect(await again.text()).not.toContain('brand-new-widget-token')
    })
})
