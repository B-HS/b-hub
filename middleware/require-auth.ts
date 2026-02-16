import type { Context, Next } from 'hono'
import { createAppError } from '../lib/error'

type GetSessionFn = (c: Context) => Promise<{
    user: {
        id: string
        name: string
        email: string
        role: string | null
        image: string | null
    }
} | null>

type RequireAuthDeps = {
    getSession: GetSessionFn
}

export const requireAuth = (deps: RequireAuthDeps) => async (c: Context, next: Next) => {
    const session = await deps.getSession(c)
    if (!session) throw createAppError('UNAUTHORIZED')
    c.set('user', session.user)
    await next()
}
