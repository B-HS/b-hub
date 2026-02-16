import type { Context } from 'hono'
import { createAppError } from './error'
import type { HonoVariables } from './hono-types'

type AuthUser = HonoVariables['user']
type AuthHandler = (c: Context, user: AuthUser) => Promise<Response>
type ValidateTokenFn = (token: string) => Promise<AuthUser | null>
type GetSessionFn = (c: Context) => Promise<{ user: AuthUser } | null>

export const withAuth = (deps: { getSession: GetSessionFn }) => (handler: AuthHandler) => async (c: Context) => {
    const session = await deps.getSession(c)
    if (!session) throw createAppError('UNAUTHORIZED')
    return handler(c, session.user)
}

export const withAdmin = (deps: { getSession: GetSessionFn }) => (handler: AuthHandler) => async (c: Context) => {
    const session = await deps.getSession(c)
    if (!session) throw createAppError('UNAUTHORIZED')
    if (session.user.role !== 'admin') throw createAppError('FORBIDDEN')
    return handler(c, session.user)
}

export const withApiToken = (deps: { validateToken: ValidateTokenFn }) => (handler: AuthHandler) => async (c: Context) => {
    const token = c.req.header('X-API-Token')
    if (!token) throw createAppError('API_TOKEN_INVALID')
    const user = await deps.validateToken(token)
    if (!user) throw createAppError('API_TOKEN_INVALID')
    return handler(c, user)
}
