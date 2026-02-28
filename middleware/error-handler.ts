import type { Context, Next } from 'hono'
import { isAppError } from '../lib/error'
import { ERROR_MESSAGE } from '../lib/error-message'
import { errorResponse } from '../lib/api-response'
import { captureException } from '../lib/sentry'

export const errorHandler = () => async (c: Context, next: Next) => {
    try {
        await next()
    } catch (error) {
        if (isAppError(error)) {
            c.set('errorCode', error.code)
            return c.json(errorResponse(error.code, error.message, error.details), error.statusCode as 400)
        }
        const safeMessage = error instanceof Error ? error.message : 'Unknown error'
        const safeStack = error instanceof Error ? error.stack : undefined
        console.error('[errorHandler] Unhandled error:', safeMessage, safeStack)
        captureException(error)
        return c.json(errorResponse('INTERNAL_ERROR', ERROR_MESSAGE.INTERNAL_ERROR), 500)
    }
}
