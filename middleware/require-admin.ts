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

type RequireAdminDeps = {
    getSession: GetSessionFn
}

export const requireAdmin = (deps: RequireAdminDeps) => async (c: Context, next: Next) => {
    const session = await deps.getSession(c)
    if (!session) throw createAppError('UNAUTHORIZED')
    if (session.user.role !== 'admin') throw createAppError('FORBIDDEN')
    c.set('user', session.user)
    await next()
}
