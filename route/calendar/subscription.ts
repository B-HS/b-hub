import { Hono } from 'hono'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import type { CalendarService } from '../../service/domain/calendar/calendar'

type CalendarSubscriptionRouteDeps = {
    calendarService: CalendarService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
    baseUrl?: string
}

const resolveBaseUrl = (deps: CalendarSubscriptionRouteDeps, c: { req: { header: (name: string) => string | undefined; url: string } }) => {
    if (deps.baseUrl) return deps.baseUrl

    const host = c.req.header('X-Forwarded-Host') || c.req.header('Host') || 'localhost:3000'
    const proto = c.req.header('X-Forwarded-Proto') || (host.includes('localhost') ? 'http' : 'https')
    return `${proto}://${host}`
}

export const createCalendarSubscriptionRoute = (deps: CalendarSubscriptionRouteDeps) => {
    const route = new Hono()

    route.get(
        '/',
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const subscription = await deps.calendarService.getSubscription(session.user.id)
            if (!subscription) throw createAppError('CALENDAR_SUBSCRIPTION_NOT_FOUND')

            const baseUrl = resolveBaseUrl(deps, c)

            return c.json(
                successResponse({
                    token: subscription.token,
                    icsToken: subscription.icsToken,
                    name: subscription.name,
                    caldavUrl: `${baseUrl}/caldav/${subscription.token}/`,
                    icsUrl: `${baseUrl}/api/calendar/${subscription.icsToken}`,
                }),
            )
        }),
    )

    route.post(
        '/',
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const body = await c.req.json().catch(() => ({}))
            const subscription = await deps.calendarService.createSubscription(session.user.id, body?.name)

            const baseUrl = resolveBaseUrl(deps, c)

            return c.json(
                successResponse({
                    token: subscription.token,
                    icsToken: subscription.icsToken,
                    name: subscription.name,
                    caldavUrl: `${baseUrl}/caldav/${subscription.token}/`,
                    icsUrl: `${baseUrl}/api/calendar/${subscription.icsToken}`,
                }),
            )
        }),
    )

    route.post(
        '/regenerate',
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const token = await deps.calendarService.regenerateSubscriptionToken(session.user.id)
            return c.json(successResponse({ token }))
        }),
    )

    route.post(
        '/regenerate-ics',
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const icsToken = await deps.calendarService.regenerateIcsToken(session.user.id)
            return c.json(successResponse({ icsToken }))
        }),
    )

    return route
}
