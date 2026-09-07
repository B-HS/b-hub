import { describe, expect, test, mock, afterEach } from 'bun:test'
import { composeSpotify } from '../../compose/spotify'

const createSpotifyAccountRow = (overrides: { betterAuthAccountId?: string | null; isActive?: boolean } = {}) => ({
    id: 1,
    userId: 'user-1',
    spotifyUserId: 'spotify-1',
    displayName: null,
    email: null,
    betterAuthAccountId: 'ba-1',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
})

const createFakeDb = (selectResults: unknown[][]) => {
    const queue = [...selectResults]

    const selectChain = {
        from: () => selectChain,
        leftJoin: () => selectChain,
        where: () => selectChain,
        limit: () => Promise.resolve(queue.shift() ?? []),
    }

    const updateChain = {
        set: () => updateChain,
        where: () => Promise.resolve(undefined),
    }

    return { select: () => selectChain, update: () => updateChain }
}

const createComposed = (selectResults: unknown[][]) =>
    composeSpotify({
        db: createFakeDb(selectResults),
        env: { SPOTIFY_CLIENT_ID: 'client-id', SPOTIFY_CLIENT_SECRET: 'client-secret', BETTER_AUTH_SECRET: 'auth-secret' },
    } as never)

describe('composeSpotify 의 provider 생성', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    test('isActive가 false인 계정은 SPOTIFY_ACCOUNT_NOT_FOUND 404가 된다', async () => {
        const spotifyFetch = mock(() => Promise.resolve(new Response(null, { status: 200 })))
        globalThis.fetch = spotifyFetch as typeof fetch

        const { spotifyDataService } = createComposed([[createSpotifyAccountRow({ isActive: false })]])

        await expect(spotifyDataService.getNowPlaying(1)).rejects.toMatchObject({ code: 'SPOTIFY_ACCOUNT_NOT_FOUND', statusCode: 404 })
        expect(spotifyFetch).not.toHaveBeenCalled()
    })

    test('betterAuthAccountId가 없는 계정은 SPOTIFY_ACCOUNT_NOT_FOUND 404가 된다', async () => {
        const { spotifyDataService } = createComposed([[createSpotifyAccountRow({ betterAuthAccountId: null })]])

        await expect(spotifyDataService.getPlaylists(1)).rejects.toMatchObject({ code: 'SPOTIFY_ACCOUNT_NOT_FOUND', statusCode: 404 })
    })

    test('토큰 갱신 실패는 SPOTIFY_API_ERROR 502가 되고 Spotify 응답 본문이 새지 않는다', async () => {
        const refreshErrorBody = 'invalid_grant: refresh token revoked'
        globalThis.fetch = mock((input: string) =>
            input.includes('accounts.spotify.com')
                ? Promise.resolve(new Response(refreshErrorBody, { status: 400 }))
                : Promise.resolve(new Response(null, { status: 401 })),
        ) as typeof fetch

        const oauthRow = [{ accessToken: 'access-token', refreshToken: 'refresh-token' }]
        const { spotifyDataService } = createComposed([[createSpotifyAccountRow()], oauthRow, oauthRow])

        const error = await spotifyDataService.getNowPlaying(1).catch((e: unknown) => e)

        expect(error).toMatchObject({ code: 'SPOTIFY_API_ERROR', statusCode: 502, details: { status: 400 } })
        expect(JSON.stringify(error)).not.toContain('invalid_grant')
    })

    test('활성 연결 계정은 현재 재생 정보를 반환한다', async () => {
        const track = { name: 'Song', artists: [{ name: 'Artist' }], album: { name: 'Album', images: [] }, duration_ms: 1000 }
        globalThis.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({ is_playing: true, item: track, progress_ms: 500 }), { status: 200 })),
        ) as typeof fetch

        const oauthRow = [{ accessToken: 'access-token', refreshToken: 'refresh-token' }]
        const { spotifyDataService } = createComposed([[createSpotifyAccountRow()], oauthRow])

        const result = await spotifyDataService.getNowPlaying(1)

        expect(result.isPlaying).toBe(true)
        expect(result.track?.name).toBe('Song')
    })
})

const createJoinedRow = (overrides: Record<string, unknown> = {}) => ({
    betterAuthAccountId: 'ba-1',
    isActive: true,
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    accessTokenExpiresAt: null,
    ...overrides,
})

const createCountingDb = (selectResults: unknown[][]) => {
    const queue = [...selectResults]
    const state = { selectCalls: 0, updatedValues: [] as Record<string, unknown>[] }

    const selectChain = {
        from: () => selectChain,
        leftJoin: () => selectChain,
        where: () => selectChain,
        limit: () => Promise.resolve(queue.shift() ?? []),
    }

    const db = {
        select: () => {
            state.selectCalls += 1
            return selectChain
        },
        update: () => ({
            set: (values: Record<string, unknown>) => {
                state.updatedValues.push(values)
                return { where: () => Promise.resolve(undefined) }
            },
        }),
    }

    return { db, state }
}

const composeWithDb = (db: unknown) =>
    composeSpotify({
        db,
        env: { SPOTIFY_CLIENT_ID: 'client-id', SPOTIFY_CLIENT_SECRET: 'client-secret', BETTER_AUTH_SECRET: 'auth-secret' },
    } as never)

describe('composeSpotify 의 계정·토큰 단일 조회', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    const captureAuthHeaders = () => {
        const authHeaders: string[] = []
        globalThis.fetch = mock((input: string, init?: RequestInit) => {
            if (input.includes('accounts.spotify.com')) {
                return Promise.resolve(new Response(JSON.stringify({ access_token: 'new-access-token', expires_in: 3600 }), { status: 200 }))
            }
            authHeaders.push(String((init?.headers as Record<string, string>).Authorization))
            return Promise.resolve(new Response(JSON.stringify({ is_playing: false }), { status: 200 }))
        }) as typeof fetch
        return authHeaders
    }

    test('JOIN 으로 계정과 토큰을 한 번에 읽어 토큰 재조회를 하지 않는다', async () => {
        const authHeaders = captureAuthHeaders()
        const { db, state } = createCountingDb([[createJoinedRow()], []])
        const { spotifyDataService } = composeWithDb(db)

        await spotifyDataService.getNowPlaying(1)

        expect(state.selectCalls).toBe(1)
        expect(authHeaders[0]).toBe('Bearer access-token')
    })

    test('만료가 5분 이내면 401 을 기다리지 않고 선제 갱신한다', async () => {
        const authHeaders = captureAuthHeaders()
        const { db, state } = createCountingDb([[createJoinedRow({ accessTokenExpiresAt: new Date(Date.now() + 60_000) })], []])
        const { spotifyDataService } = composeWithDb(db)

        await spotifyDataService.getNowPlaying(1)

        expect(authHeaders[0]).toBe('Bearer new-access-token')
        expect(state.updatedValues[0]).toMatchObject({ accessToken: 'new-access-token' })
    })

    test('만료까지 5분 넘게 남았으면 갱신하지 않는다', async () => {
        const authHeaders = captureAuthHeaders()
        const { db, state } = createCountingDb([[createJoinedRow({ accessTokenExpiresAt: new Date(Date.now() + 60 * 60_000) })], []])
        const { spotifyDataService } = composeWithDb(db)

        await spotifyDataService.getNowPlaying(1)

        expect(authHeaders[0]).toBe('Bearer access-token')
        expect(state.updatedValues).toHaveLength(0)
    })

    test('선제 갱신이 실패하면 기존 토큰으로 요청한다', async () => {
        const authHeaders: string[] = []
        globalThis.fetch = mock((input: string, init?: RequestInit) => {
            if (input.includes('accounts.spotify.com')) return Promise.resolve(new Response('nope', { status: 400 }))
            authHeaders.push(String((init?.headers as Record<string, string>).Authorization))
            return Promise.resolve(new Response(JSON.stringify({ is_playing: false }), { status: 200 }))
        }) as typeof fetch

        const { db } = createCountingDb([[createJoinedRow({ accessTokenExpiresAt: new Date(Date.now() + 60_000) })], []])
        const { spotifyDataService } = composeWithDb(db)

        await spotifyDataService.getNowPlaying(1)

        expect(authHeaders[0]).toBe('Bearer access-token')
    })
})

describe('composeSpotify 의 토큰 갱신', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    const createCapturingDb = (selectResults: unknown[][], capturedSets: Record<string, unknown>[]) => {
        const queue = [...selectResults]

        const selectChain = {
            from: () => selectChain,
            leftJoin: () => selectChain,
            where: () => selectChain,
            limit: () => Promise.resolve(queue.shift() ?? []),
        }

        const updateChain = {
            set: (values: Record<string, unknown>) => {
                capturedSets.push(values)
                return { where: () => Promise.resolve(undefined) }
            },
        }

        return { select: () => selectChain, update: () => updateChain }
    }

    const createComposedWithCapture = (capturedSets: Record<string, unknown>[]) => {
        const oauthRow = [{ accessToken: 'access-token', refreshToken: 'refresh-token' }]
        return composeSpotify({
            db: createCapturingDb([[createSpotifyAccountRow()], oauthRow, oauthRow], capturedSets),
            env: { SPOTIFY_CLIENT_ID: 'client-id', SPOTIFY_CLIENT_SECRET: 'client-secret', BETTER_AUTH_SECRET: 'auth-secret' },
        } as never)
    }

    const mockRefreshFetch = (body: Record<string, unknown>) => {
        let isRefreshed = false
        globalThis.fetch = mock((input: string) => {
            if (input.includes('accounts.spotify.com')) {
                isRefreshed = true
                return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
            }
            if (!isRefreshed) return Promise.resolve(new Response(null, { status: 401 }))
            return Promise.resolve(new Response(JSON.stringify({ is_playing: false }), { status: 200 }))
        }) as typeof fetch
    }

    test('갱신 응답에 refresh_token 이 있으면 저장한다', async () => {
        const capturedSets: Record<string, unknown>[] = []
        mockRefreshFetch({ access_token: 'new-access-token', expires_in: 3600, refresh_token: 'rotated-refresh-token' })

        const { spotifyDataService } = createComposedWithCapture(capturedSets)
        await spotifyDataService.getNowPlaying(1)

        expect(capturedSets[0]).toMatchObject({ accessToken: 'new-access-token', refreshToken: 'rotated-refresh-token' })
    })

    test('갱신 응답에 refresh_token 이 없으면 기존 값을 덮어쓰지 않는다', async () => {
        const capturedSets: Record<string, unknown>[] = []
        mockRefreshFetch({ access_token: 'new-access-token', expires_in: 3600 })

        const { spotifyDataService } = createComposedWithCapture(capturedSets)
        await spotifyDataService.getNowPlaying(1)

        expect(capturedSets[0]).toMatchObject({ accessToken: 'new-access-token' })
        expect(capturedSets[0]).not.toHaveProperty('refreshToken')
    })
})
