import type { Context, Next } from 'hono'
import { createAppError } from '../lib/error'

type ValidateTokenFn = (token: string) => Promise<{ id: string } | null>

type RequireApiTokenDeps = {
    validateToken: ValidateTokenFn
}

export const requireApiToken = (deps: RequireApiTokenDeps) => async (c: Context, next: Next) => {
    const token = c.req.header('X-API-Token')
    if (!token) throw createAppError('API_TOKEN_INVALID')
    const result = await deps.validateToken(token)
    if (!result) throw createAppError('API_TOKEN_INVALID')
    c.set('user', {
        id: result.id,
        name: '',
        email: '',
        role: null,
        image: null,
    })
    await next()
}
