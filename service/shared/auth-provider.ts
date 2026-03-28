import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins'
import type { Database } from '../../db/index'

type AuthProviderDeps = {
    db: Database
    baseUrl: string
    githubClientId: string
    githubClientSecret: string
    googleClientId: string
    googleClientSecret: string
    secret?: string
    trustedOrigins?: string[]
}

export const createAuthProvider = (deps: AuthProviderDeps) => {
    const auth = betterAuth({
        baseURL: deps.baseUrl,
        secret: deps.secret,
        database: drizzleAdapter(deps.db, { provider: 'mysql' }),
        emailAndPassword: { enabled: false },
        socialProviders: {
            github: {
                clientId: deps.githubClientId,
                clientSecret: deps.githubClientSecret,
            },
            google: {
                clientId: deps.googleClientId,
                clientSecret: deps.googleClientSecret,
                scope: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send'],
                accessType: 'offline',
                prompt: 'consent',
            },
        },
        plugins: [
            admin({
                defaultRole: 'user',
                adminRoles: ['admin'],
            }),
        ],
        trustedOrigins: deps.trustedOrigins ?? ['https://blog.gumyo.net'],
        advanced: {
            crossSubDomainCookies: {
                enabled: process.env.NODE_ENV === 'production',
                domain: '.gumyo.net',
            },
        },
    })

    return auth
}

export type AuthProvider = ReturnType<typeof createAuthProvider>
