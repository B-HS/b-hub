import { createHash, timingSafeEqual } from 'crypto'
import { createAppError } from './error'

/**
 * Compares a provided secret with the expected one in constant time.
 * Empty values and length mismatches fail immediately.
 */
export const isSecretMatch = (provided: string, expected: string) => {
    if (!provided || !expected) return false
    if (provided.length !== expected.length) return false
    return timingSafeEqual(createHash('sha256').update(provided).digest(), createHash('sha256').update(expected).digest())
}

export const verifyCronAuth = (c: { req: { header: (name: string) => string | undefined } }, secret: string) => {
    const authHeader = c.req.header('Authorization')
    const cronSecret = c.req.header('x-cron-secret')
    const provided = authHeader?.replace('Bearer ', '') ?? cronSecret

    if (!isSecretMatch(provided ?? '', secret)) {
        throw createAppError('UNAUTHORIZED')
    }
}
