import type { Context } from 'hono'
import { isAppError } from './error'
import { ERROR_MESSAGE } from './error-message'
import { errorResponse } from './api-response'
import { captureException } from './sentry'

type Handler = (c: Context) => Promise<Response>

export const withErrorHandling = (handler: Handler) => async (c: Context) => {
    try {
        return await handler(c)
    } catch (error) {
        if (isAppError(error)) {
            c.set('errorCode', error.code)
            return c.json(errorResponse(error.code, error.message, error.details), error.statusCode as 400)
        }
        const safeMessage = error instanceof Error ? error.message : 'Unknown error'
        c.set('errorDetail', safeMessage)
        if (process.env.NODE_ENV !== 'production') {
            const safeStack = error instanceof Error ? error.stack : undefined
            console.error('[withErrorHandling] Unhandled error:', safeMessage, safeStack)
        }
        captureException(error)
        return c.json(errorResponse('INTERNAL_ERROR', ERROR_MESSAGE.INTERNAL_ERROR), 500)
    }
}
