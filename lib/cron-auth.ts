import { createAppError } from './error'

export const verifyCronAuth = (c: { req: { header: (name: string) => string | undefined } }, secret: string) => {
    const authHeader = c.req.header('Authorization')
    const cronSecret = c.req.header('x-cron-secret')
    const provided = authHeader?.replace('Bearer ', '') ?? cronSecret

    if (!provided || provided !== secret) {
        throw createAppError('UNAUTHORIZED')
    }
}
