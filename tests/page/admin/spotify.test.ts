import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createSpotifyRoute } from '../../../page/admin/pages/spotify'
import { mockAdmin, sessionOf, stubAdminDb } from './helpers'

const sampleAccount = {
    id: 'acc-1',
    userId: 'u-1',
    userEmail: 'owner@example.com',
    spotifyUserId: 'spotify-xyz',
    displayName: 'Hyun',
    email: 'spotify@example.com',
    isActive: true,
    createdAt: new Date('2026-05-01'),
}

const sampleKey = {
    id: 7,
    userId: 'user-1234567890abcdef',
    spotifyAccountId: 3,
    name: 'my-key',
    expiresAt: new Date('2026-12-31'),
    lastUsedAt: new Date('2026-05-02'),
    createdAt: new Date('2026-05-01'),
}

const sampleWidget = {
    id: 11,
    userId: 'user-1234567890abcdef',
    spotifyAccountId: 3,
    token: 'wt_abcdefghijklmnop',
    name: 'home-widget',
    isActive: true,
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-01'),
}

const createApp = (overrides: Parameters<typeof stubAdminDb>[0] = {}) => {
    const app = new Hono()
    app.route(
        '/admin/spotify',
        createSpotifyRoute({
            getSession: sessionOf(mockAdmin),
            adminDb: stubAdminDb({
                listSpotifyAccounts: () => Promise.resolve({ rows: [sampleAccount], total: 1 }),
                listSpotifyKeys: () => Promise.resolve({ rows: [sampleKey], total: 1 }),
                listSpotifyWidgetTokens: () => Promise.resolve({ rows: [sampleWidget], total: 1 }),
                ...overrides,
            }),
        }),
    )
    return app
}

describe('GET /admin/spotify/accounts (list)', () => {
    test('200과 계정 이메일/Spotify ID/활성 상태를 노출한다', async () => {
        const res = await createApp().request('/admin/spotify/accounts')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('owner@example.com')
        expect(html).toContain('spotify-xyz')
        expect(html).toContain('active')
        expect(html).toContain('1–1 / 1')
    })

    test('q 쿼리가 필터바에 prefill 된다', async () => {
        const res = await createApp().request('/admin/spotify/accounts?q=foo')
        const html = await res.text()
        expect(html).toContain('value="foo"')
    })

    test('size는 5 미만이면 5로 클램프된다', async () => {
        const listSpotifyAccounts = mock(() => Promise.resolve({ rows: [sampleAccount], total: 1 }))
        const app = createApp({ listSpotifyAccounts })
        await app.request('/admin/spotify/accounts?size=1')
        expect(listSpotifyAccounts).toHaveBeenCalledWith({ page: 1, size: 5, q: undefined })
    })

    test('size는 100 초과면 100으로 클램프된다', async () => {
        const listSpotifyAccounts = mock(() => Promise.resolve({ rows: [sampleAccount], total: 1 }))
        const app = createApp({ listSpotifyAccounts })
        await app.request('/admin/spotify/accounts?size=9999')
        expect(listSpotifyAccounts).toHaveBeenCalledWith({ page: 1, size: 100, q: undefined })
    })

    test('잘못된 page 값은 1로 폴백된다', async () => {
        const listSpotifyAccounts = mock(() => Promise.resolve({ rows: [sampleAccount], total: 1 }))
        const app = createApp({ listSpotifyAccounts })
        const res = await app.request('/admin/spotify/accounts?page=abc')
        expect(res.status).toBe(200)
        expect(listSpotifyAccounts).toHaveBeenCalledWith({ page: 1, size: 20, q: undefined })
    })
})

describe('GET /admin/spotify/keys (list)', () => {
    test('200과 키 이름을 노출한다', async () => {
        const res = await createApp().request('/admin/spotify/keys')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('my-key')
        expect(html).toContain('1–1 / 1')
    })

    test('q 쿼리가 Name 검색 필터바에 prefill 된다', async () => {
        const res = await createApp().request('/admin/spotify/keys?q=mykey')
        const html = await res.text()
        expect(html).toContain('value="mykey"')
    })

    test('size 클램프(5..100)가 적용된다', async () => {
        const listSpotifyKeys = mock(() => Promise.resolve({ rows: [sampleKey], total: 1 }))
        const app = createApp({ listSpotifyKeys })
        await app.request('/admin/spotify/keys?size=2')
        expect(listSpotifyKeys).toHaveBeenCalledWith({ page: 1, size: 5, q: undefined })
    })
})

describe('POST /admin/spotify/keys/:id/revoke', () => {
    test('revokeSpotifyKey(int)가 호출되고 303 리다이렉트한다', async () => {
        const revokeSpotifyKey = mock(() => Promise.resolve())
        const app = createApp({ revokeSpotifyKey })
        const res = await app.request('/admin/spotify/keys/7/revoke', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/spotify/keys?flash=ok')
        expect(revokeSpotifyKey).toHaveBeenCalledWith(7)
    })

    test('id가 0이면 revokeSpotifyKey를 호출하지 않지만 303 리다이렉트한다', async () => {
        const revokeSpotifyKey = mock(() => Promise.resolve())
        const app = createApp({ revokeSpotifyKey })
        const res = await app.request('/admin/spotify/keys/0/revoke', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/spotify/keys?flash=ok')
        expect(revokeSpotifyKey).not.toHaveBeenCalled()
    })

    test('id가 숫자가 아니면 revokeSpotifyKey를 호출하지 않지만 303 리다이렉트한다', async () => {
        const revokeSpotifyKey = mock(() => Promise.resolve())
        const app = createApp({ revokeSpotifyKey })
        const res = await app.request('/admin/spotify/keys/abc/revoke', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(revokeSpotifyKey).not.toHaveBeenCalled()
    })
})

describe('GET /admin/spotify/widget-tokens (list)', () => {
    test('200과 마스킹된 토큰을 노출한다', async () => {
        const res = await createApp().request('/admin/spotify/widget-tokens')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('home-widget')
        expect(html).toContain('wt_a…mnop')
        expect(html).not.toContain('wt_abcdefghijklmnop')
        expect(html).toContain('1–1 / 1')
    })

    test('size 클램프(5..100)가 적용된다', async () => {
        const listSpotifyWidgetTokens = mock(() => Promise.resolve({ rows: [sampleWidget], total: 1 }))
        const app = createApp({ listSpotifyWidgetTokens })
        await app.request('/admin/spotify/widget-tokens?size=500')
        expect(listSpotifyWidgetTokens).toHaveBeenCalledWith({ page: 1, size: 100 })
    })

    test('잘못된 page 값은 1로 폴백된다', async () => {
        const listSpotifyWidgetTokens = mock(() => Promise.resolve({ rows: [sampleWidget], total: 1 }))
        const app = createApp({ listSpotifyWidgetTokens })
        const res = await app.request('/admin/spotify/widget-tokens?page=xx')
        expect(res.status).toBe(200)
        expect(listSpotifyWidgetTokens).toHaveBeenCalledWith({ page: 1, size: 20 })
    })
})

describe('POST /admin/spotify/widget-tokens/:id/toggle', () => {
    test('toggleSpotifyWidgetToken(int)가 호출되고 303 리다이렉트한다', async () => {
        const toggleSpotifyWidgetToken = mock(() => Promise.resolve())
        const app = createApp({ toggleSpotifyWidgetToken })
        const res = await app.request('/admin/spotify/widget-tokens/11/toggle', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/spotify/widget-tokens?flash=ok')
        expect(toggleSpotifyWidgetToken).toHaveBeenCalledWith(11)
    })

    test('id가 0이면 toggleSpotifyWidgetToken을 호출하지 않지만 303 리다이렉트한다', async () => {
        const toggleSpotifyWidgetToken = mock(() => Promise.resolve())
        const app = createApp({ toggleSpotifyWidgetToken })
        const res = await app.request('/admin/spotify/widget-tokens/0/toggle', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/spotify/widget-tokens?flash=ok')
        expect(toggleSpotifyWidgetToken).not.toHaveBeenCalled()
    })
})
