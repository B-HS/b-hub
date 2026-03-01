import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { createSpotifyProvider } from '../../../../service/domain/spotify/spotify-provider'

const createMockDeps = () => ({
    betterAuthAccountId: 'ba-1',
    getOAuthToken: mock(() => Promise.resolve({ accessToken: 'access-token', refreshToken: 'refresh-token' })),
    refreshOAuthToken: mock(() => Promise.resolve('new-access-token')),
})

describe('createSpotifyProvider', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    describe('getCurrentlyPlaying', () => {
        test('재생 중인 트랙을 반환한다', async () => {
            const mockData = { is_playing: true, item: { name: 'Song' } }
            globalThis.fetch = mock(() =>
                Promise.resolve(new Response(JSON.stringify(mockData), { status: 200 })),
            ) as typeof fetch

            const deps = createMockDeps()
            const provider = createSpotifyProvider(deps)
            const result = await provider.getCurrentlyPlaying()
            expect(result).toEqual(mockData)
        })

        test('204 응답 시 null을 반환한다', async () => {
            globalThis.fetch = mock(() =>
                Promise.resolve(new Response(null, { status: 204 })),
            ) as typeof fetch

            const deps = createMockDeps()
            const provider = createSpotifyProvider(deps)
            const result = await provider.getCurrentlyPlaying()
            expect(result).toBeNull()
        })

        test('401 시 토큰을 갱신하고 재시도한다', async () => {
            let callCount = 0
            globalThis.fetch = mock(() => {
                callCount++
                if (callCount === 1) {
                    return Promise.resolve(new Response(null, { status: 401 }))
                }
                return Promise.resolve(new Response(JSON.stringify({ is_playing: true }), { status: 200 }))
            }) as typeof fetch

            const deps = createMockDeps()
            const provider = createSpotifyProvider(deps)
            const result = await provider.getCurrentlyPlaying()
            expect(result).toEqual({ is_playing: true })
            expect(deps.refreshOAuthToken).toHaveBeenCalledTimes(1)
        })

        test('429 시 Retry-After 후 재시도한다', async () => {
            let callCount = 0
            globalThis.fetch = mock(() => {
                callCount++
                if (callCount === 1) {
                    return Promise.resolve(new Response(null, { status: 429, headers: { 'Retry-After': '0' } }))
                }
                return Promise.resolve(new Response(JSON.stringify({ is_playing: false }), { status: 200 }))
            }) as typeof fetch

            const deps = createMockDeps()
            const provider = createSpotifyProvider(deps)
            const result = await provider.getCurrentlyPlaying()
            expect(result).toEqual({ is_playing: false })
        })
    })

    describe('getRecentlyPlayed', () => {
        test('최근 재생 트랙 목록을 반환한다', async () => {
            const mockData = { items: [{ track: { name: 'Song' }, played_at: '2024-01-01T00:00:00Z' }] }
            globalThis.fetch = mock(() =>
                Promise.resolve(new Response(JSON.stringify(mockData), { status: 200 })),
            ) as typeof fetch

            const deps = createMockDeps()
            const provider = createSpotifyProvider(deps)
            const result = await provider.getRecentlyPlayed(1)
            expect(result).toEqual(mockData)
        })
    })

    describe('getPlaylists', () => {
        test('플레이리스트 목록을 반환한다', async () => {
            const mockData = { items: [], total: 0 }
            globalThis.fetch = mock(() =>
                Promise.resolve(new Response(JSON.stringify(mockData), { status: 200 })),
            ) as typeof fetch

            const deps = createMockDeps()
            const provider = createSpotifyProvider(deps)
            const result = await provider.getPlaylists(20, 0)
            expect(result).toEqual(mockData)
        })

        test('limit, offset 파라미터를 전달한다', async () => {
            globalThis.fetch = mock((url: string) => {
                expect(url).toContain('limit=10')
                expect(url).toContain('offset=5')
                return Promise.resolve(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
            }) as typeof fetch

            const deps = createMockDeps()
            const provider = createSpotifyProvider(deps)
            await provider.getPlaylists(10, 5)
        })
    })

    describe('disconnect', () => {
        test('토큰을 초기화한다', async () => {
            globalThis.fetch = mock(() =>
                Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
            ) as typeof fetch

            const deps = createMockDeps()
            const provider = createSpotifyProvider(deps)
            await provider.getCurrentlyPlaying()
            provider.disconnect()
            await provider.getCurrentlyPlaying()
            expect(deps.getOAuthToken).toHaveBeenCalledTimes(2)
        })
    })
})
