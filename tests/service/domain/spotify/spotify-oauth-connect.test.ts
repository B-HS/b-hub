import { describe, expect, test, mock, afterEach } from 'bun:test'
import { createSpotifyOAuthConnectService } from '../../../../service/domain/spotify/spotify-oauth-connect'

const createMockDeps = () => ({
    spotifyClientId: 'client-id',
    spotifyClientSecret: 'client-secret',
    secret: 'hmac-secret-32-chars-minimum-value',
    findAccountByProviderAndUser: mock(() => Promise.resolve(null)),
    upsertAccount: mock(() => Promise.resolve({ id: 'acc-1' })),
    findSpotifyAccountByUserId: mock(() => Promise.resolve(null)),
    createSpotifyAccount: mock(() => Promise.resolve({ id: 1 })),
    updateSpotifyAccount: mock(() => Promise.resolve()),
})

describe('createSpotifyOAuthConnectService', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    describe('generateAuthUrl', () => {
        test('Spotify OAuth URL을 생성한다', async () => {
            const deps = createMockDeps()
            const service = createSpotifyOAuthConnectService(deps)
            const url = await service.generateAuthUrl('user-1', 'https://api.gumyo.net')
            expect(url).toContain('accounts.spotify.com/authorize')
            expect(url).toContain('client_id=client-id')
        })

        test('state에 userId가 포함된다', async () => {
            const deps = createMockDeps()
            const service = createSpotifyOAuthConnectService(deps)
            const url = await service.generateAuthUrl('user-1', 'https://api.gumyo.net')
            const state = new URL(url).searchParams.get('state')
            expect(state).toBeTruthy()
        })

        test('redirect가 state에 포함된다', async () => {
            const deps = createMockDeps()
            const service = createSpotifyOAuthConnectService(deps)
            const url = await service.generateAuthUrl('user-1', 'https://api.gumyo.net', '/dashboard')
            const state = new URL(url).searchParams.get('state')!
            const redirect = service.parseRedirectFromState(state)
            expect(redirect).toBe('/dashboard')
        })
    })

    describe('handleCallback', () => {
        const setupFetch = (tokenData: Record<string, unknown>, profileData: Record<string, unknown>) => {
            let callCount = 0
            globalThis.fetch = mock(() => {
                callCount++
                if (callCount === 1) {
                    return Promise.resolve(new Response(JSON.stringify(tokenData), { status: 200 }))
                }
                return Promise.resolve(new Response(JSON.stringify(profileData), { status: 200 }))
            }) as typeof fetch
        }

        test('유효한 code와 state로 계정을 생성한다', async () => {
            setupFetch(
                { access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'user-read-currently-playing' },
                { id: 'spotify-user-1', display_name: 'Test User', email: 'test@email.com' },
            )

            const deps = createMockDeps()
            const service = createSpotifyOAuthConnectService(deps)
            const url = await service.generateAuthUrl('user-1', 'https://api.gumyo.net')
            const state = new URL(url).searchParams.get('state')!

            const result = await service.handleCallback('valid-code', state, 'user-1', 'https://api.gumyo.net')
            expect(result.spotifyAccountId).toBe(1)
            expect(result.spotifyUserId).toBe('spotify-user-1')
            expect(deps.createSpotifyAccount).toHaveBeenCalledTimes(1)
        })

        test('잘못된 state는 에러를 발생시킨다', async () => {
            const deps = createMockDeps()
            const service = createSpotifyOAuthConnectService(deps)
            await expect(service.handleCallback('code', 'invalid-state', 'user-1', 'https://api.gumyo.net')).rejects.toMatchObject({
                code: 'SPOTIFY_OAUTH_STATE_INVALID',
            })
        })

        test('userId 불일치 시 에러를 발생시킨다', async () => {
            const deps = createMockDeps()
            const service = createSpotifyOAuthConnectService(deps)
            const url = await service.generateAuthUrl('user-1', 'https://api.gumyo.net')
            const state = new URL(url).searchParams.get('state')!

            await expect(service.handleCallback('code', state, 'user-2', 'https://api.gumyo.net')).rejects.toMatchObject({
                code: 'SPOTIFY_OAUTH_STATE_INVALID',
            })
        })

        test('토큰 교환 실패 시 에러를 발생시킨다', async () => {
            globalThis.fetch = mock(() => Promise.resolve(new Response('error', { status: 400 }))) as typeof fetch

            const deps = createMockDeps()
            const service = createSpotifyOAuthConnectService(deps)
            const url = await service.generateAuthUrl('user-1', 'https://api.gumyo.net')
            const state = new URL(url).searchParams.get('state')!

            await expect(service.handleCallback('bad-code', state, 'user-1', 'https://api.gumyo.net')).rejects.toMatchObject({
                code: 'SPOTIFY_OAUTH_EXCHANGE_FAILED',
            })
        })

        test('기존 계정이 있으면 업데이트한다', async () => {
            setupFetch(
                { access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'scope' },
                { id: 'spotify-user-1', display_name: 'Updated', email: 'updated@email.com' },
            )

            const deps = createMockDeps()
            deps.findSpotifyAccountByUserId = mock(() => Promise.resolve({ id: 5 }))
            const service = createSpotifyOAuthConnectService(deps)
            const url = await service.generateAuthUrl('user-1', 'https://api.gumyo.net')
            const state = new URL(url).searchParams.get('state')!

            const result = await service.handleCallback('valid-code', state, 'user-1', 'https://api.gumyo.net')
            expect(result.spotifyAccountId).toBe(5)
            expect(deps.updateSpotifyAccount).toHaveBeenCalledTimes(1)
            expect(deps.createSpotifyAccount).not.toHaveBeenCalled()
        })
    })

    describe('parseRedirectFromState', () => {
        test('redirect URL을 파싱한다', async () => {
            const deps = createMockDeps()
            const service = createSpotifyOAuthConnectService(deps)
            const url = await service.generateAuthUrl('user-1', 'https://api.gumyo.net', '/settings')
            const state = new URL(url).searchParams.get('state')!
            expect(service.parseRedirectFromState(state)).toBe('/settings')
        })

        test('잘못된 state는 null을 반환한다', () => {
            const deps = createMockDeps()
            const service = createSpotifyOAuthConnectService(deps)
            expect(service.parseRedirectFromState('invalid')).toBeNull()
        })
    })
})
