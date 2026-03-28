import { createAppError } from '../../../lib/error'
import { createOAuthState, verifyOAuthState, parseStatePayload } from '../../../lib/hmac-state'
import { isAllowedRedirect } from '../../../lib/url-validator'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

const GMAIL_SCOPES = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
].join(' ')

const STATE_TTL_MS = 10 * 60 * 1000

type MailOAuthConnectDeps = {
    googleClientId: string
    googleClientSecret: string
    secret: string
    findAccountByProviderAndUser: (providerId: string, userId: string, accountId: string) => Promise<{ id: string } | null>
    upsertAccount: (data: {
        id: string
        accountId: string
        providerId: string
        userId: string
        accessToken: string
        refreshToken: string | null | undefined
        accessTokenExpiresAt: Date | null
        scope: string
    }) => Promise<{ id: string }>
    findMailAccountByEmail: (userId: string, email: string) => Promise<{ id: number; betterAuthAccountId: string | null } | null>
    createMailAccount: (
        userId: string,
        input: {
            provider: string
            email: string
            betterAuthAccountId: string
        },
    ) => Promise<{ id: number }>
    updateMailAccountBetterAuthId: (id: number, betterAuthAccountId: string) => Promise<void>
}

export const createMailOAuthConnectService = (deps: MailOAuthConnectDeps) => {
    const generateAuthUrl = async (userId: string, baseUrl: string, redirect?: string) => {
        const safeRedirect = redirect && isAllowedRedirect(redirect) ? redirect : null
        const state = await createOAuthState({ userId, redirect: safeRedirect }, deps.secret, STATE_TTL_MS)

        const callbackUrl = `${baseUrl}/api/mail/accounts/connect/google/callback`
        const params = new URLSearchParams({
            client_id: deps.googleClientId,
            redirect_uri: callbackUrl,
            response_type: 'code',
            scope: GMAIL_SCOPES,
            access_type: 'offline',
            prompt: 'consent',
            state,
        })

        return `${GOOGLE_AUTH_URL}?${params.toString()}`
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
    ): Promise<{ mailAccountId: number; email: string; redirect: string | null }> => {
        let stateData: { userId: string; exp: number; redirect: string | null }
        try {
            stateData = await verifyOAuthState<{ userId: string; redirect: string | null }>(state, deps.secret)
        } catch {
            throw createAppError('MAIL_OAUTH_STATE_INVALID')
        }

        if (stateData.userId !== sessionUserId) throw createAppError('MAIL_OAUTH_STATE_INVALID')

        const callbackUrl = `${baseUrl}/api/mail/accounts/connect/google/callback`
        const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: deps.googleClientId,
                client_secret: deps.googleClientSecret,
                redirect_uri: callbackUrl,
                grant_type: 'authorization_code',
            }),
        })

        if (!tokenRes.ok) {
            const errorBody = await tokenRes.text().catch(() => 'unknown')
            throw createAppError('MAIL_OAUTH_EXCHANGE_FAILED', { detail: errorBody })
        }

        const tokenData = (await tokenRes.json()) as {
            access_token: string
            refresh_token?: string
            expires_in: number
            scope: string
            id_token?: string
        }

        if (!tokenData.access_token) {
            throw createAppError('MAIL_OAUTH_EXCHANGE_FAILED')
        }

        const userinfoRes = await fetch(GOOGLE_USERINFO_URL, {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })

        if (!userinfoRes.ok) {
            throw createAppError('MAIL_OAUTH_EXCHANGE_FAILED')
        }

        const userinfo = (await userinfoRes.json()) as { sub: string; email: string }
        if (!userinfo.email || !userinfo.sub) {
            throw createAppError('MAIL_OAUTH_EXCHANGE_FAILED')
        }

        const existing = await deps.findAccountByProviderAndUser('google', sessionUserId, userinfo.sub)
        const accountId = existing?.id ?? crypto.randomUUID()

        const accountRow = await deps.upsertAccount({
            id: accountId,
            accountId: userinfo.sub,
            providerId: 'google',
            userId: sessionUserId,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token ?? undefined,
            accessTokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
            scope: tokenData.scope,
        })

        const existingMailAccount = await deps.findMailAccountByEmail(sessionUserId, userinfo.email)
        if (existingMailAccount) {
            if (existingMailAccount.betterAuthAccountId !== accountRow.id) {
                await deps.updateMailAccountBetterAuthId(existingMailAccount.id, accountRow.id)
            }
            return {
                mailAccountId: existingMailAccount.id,
                email: userinfo.email,
                redirect: stateData.redirect,
            }
        }

        const mailAccount = await deps.createMailAccount(sessionUserId, {
            provider: 'gmail',
            email: userinfo.email,
            betterAuthAccountId: accountRow.id,
        })

        return {
            mailAccountId: mailAccount.id,
            email: userinfo.email,
            redirect: stateData.redirect,
        }
    }

    return { generateAuthUrl, handleCallback, parseRedirectFromState }
}

export type MailOAuthConnectService = ReturnType<typeof createMailOAuthConnectService>
