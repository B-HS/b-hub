import { createAppError } from '../../../lib/error'
import { createOAuthState, verifyOAuthState, parseStatePayload } from '../../../lib/hmac-state'

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize'
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SPOTIFY_PROFILE_URL = 'https://api.spotify.com/v1/me'

const SPOTIFY_SCOPES = ['user-read-currently-playing', 'user-read-playback-state', 'playlist-read-private', 'user-read-recently-played'].join(' ')

const STATE_TTL_MS = 10 * 60 * 1000

type SpotifyOAuthConnectDeps = {
    spotifyClientId: string
    spotifyClientSecret: string
    secret: string
    findAccountByProviderAndUser: (providerId: string, userId: string, accountId: string) => Promise<{ id: string } | null>
    upsertAccount: (data: {
        id: string
        accountId: string
        providerId: string
        userId: string
        accessToken: string
        refreshToken: string | null
        accessTokenExpiresAt: Date | null
        scope: string
    }) => Promise<{ id: string }>
    findSpotifyAccountByUserId: (userId: string, spotifyUserId: string) => Promise<{ id: number } | null>
    createSpotifyAccount: (data: {
        userId: string
        spotifyUserId: string
        displayName: string | null
        email: string | null
        betterAuthAccountId: string
    }) => Promise<{ id: number }>
    updateSpotifyAccount: (
        id: number,
        data: { displayName?: string | null; email?: string | null; betterAuthAccountId?: string },
    ) => Promise<void>
}

export const createSpotifyOAuthConnectService = (deps: SpotifyOAuthConnectDeps) => {
    const generateAuthUrl = async (userId: string, baseUrl: string, redirect?: string) => {
        const state = await createOAuthState({ userId, redirect: redirect || null }, deps.secret, STATE_TTL_MS)

        const callbackUrl = `${baseUrl}/api/spotify/accounts/connect/callback`
        const params = new URLSearchParams({
            client_id: deps.spotifyClientId,
            redirect_uri: callbackUrl,
            response_type: 'code',
            scope: SPOTIFY_SCOPES,
            state,
        })

        return `${SPOTIFY_AUTH_URL}?${params.toString()}`
    }

    const parseRedirectFromState = (state: string): string | null => {
        const data = parseStatePayload<{ redirect?: string }>(state)
        return data?.redirect || null
    }

    const handleCallback = async (
        code: string,
        state: string,
        sessionUserId: string,
        baseUrl: string,
    ): Promise<{ spotifyAccountId: number; spotifyUserId: string; redirect: string | null }> => {
        let stateData: { userId: string; exp: number; redirect: string | null }
        try {
            stateData = await verifyOAuthState<{ userId: string; redirect: string | null }>(state, deps.secret)
        } catch {
            throw createAppError('SPOTIFY_OAUTH_STATE_INVALID')
        }

        if (stateData.userId !== sessionUserId) throw createAppError('SPOTIFY_OAUTH_STATE_INVALID')

        const callbackUrl = `${baseUrl}/api/spotify/accounts/connect/callback`
        const tokenRes = await fetch(SPOTIFY_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(`${deps.spotifyClientId}:${deps.spotifyClientSecret}`).toString('base64')}`,
            },
            body: new URLSearchParams({
                code,
                redirect_uri: callbackUrl,
                grant_type: 'authorization_code',
            }),
        })

        if (!tokenRes.ok) {
            const errorBody = await tokenRes.text().catch(() => 'unknown')
            throw createAppError('SPOTIFY_OAUTH_EXCHANGE_FAILED', { detail: errorBody })
        }

        const tokenData = (await tokenRes.json()) as {
            access_token: string
            refresh_token?: string
            expires_in: number
            scope: string
            token_type: string
        }

        if (!tokenData.access_token) {
            throw createAppError('SPOTIFY_OAUTH_EXCHANGE_FAILED')
        }

        const profileRes = await fetch(SPOTIFY_PROFILE_URL, {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })

        if (!profileRes.ok) {
            throw createAppError('SPOTIFY_OAUTH_EXCHANGE_FAILED')
        }

        const profile = (await profileRes.json()) as { id: string; display_name: string | null; email: string | null }
        if (!profile.id) {
            throw createAppError('SPOTIFY_OAUTH_EXCHANGE_FAILED')
        }

        const existing = await deps.findAccountByProviderAndUser('spotify', sessionUserId, profile.id)
        const accountId = existing?.id ?? crypto.randomUUID()

        const accountRow = await deps.upsertAccount({
            id: accountId,
            accountId: profile.id,
            providerId: 'spotify',
            userId: sessionUserId,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token ?? null,
            accessTokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
            scope: tokenData.scope,
        })

        const existingSpotifyAccount = await deps.findSpotifyAccountByUserId(sessionUserId, profile.id)
        if (existingSpotifyAccount) {
            await deps.updateSpotifyAccount(existingSpotifyAccount.id, {
                displayName: profile.display_name,
                email: profile.email,
                betterAuthAccountId: accountRow.id,
            })
            return {
                spotifyAccountId: existingSpotifyAccount.id,
                spotifyUserId: profile.id,
                redirect: stateData.redirect,
            }
        }

        const spotifyAccount = await deps.createSpotifyAccount({
            userId: sessionUserId,
            spotifyUserId: profile.id,
            displayName: profile.display_name,
            email: profile.email,
            betterAuthAccountId: accountRow.id,
        })

        return {
            spotifyAccountId: spotifyAccount.id,
            spotifyUserId: profile.id,
            redirect: stateData.redirect,
        }
    }

    return { generateAuthUrl, handleCallback, parseRedirectFromState }
}

export type SpotifyOAuthConnectService = ReturnType<typeof createSpotifyOAuthConnectService>
