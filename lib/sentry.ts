let sentryInitialized = false

export const initSentry = (dsn: string | undefined) => {
    if (!dsn || sentryInitialized) return
    try {
        const Sentry = require('@sentry/bun')
        Sentry.init({ dsn, tracesSampleRate: 0.1 })
        sentryInitialized = true
    } catch {}
}

export const captureException = (error: unknown) => {
    if (!sentryInitialized) return
    try {
        const Sentry = require('@sentry/bun')
        Sentry.captureException(error)
    } catch {}
}
