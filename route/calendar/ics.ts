import { Hono } from 'hono'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { eventsToICS } from '../../lib/ics'
import type { CalendarService } from '../../service/domain/calendar/calendar'

type CalendarIcsRouteDeps = {
    calendarService: CalendarService
}

export const createCalendarIcsRoute = (deps: CalendarIcsRouteDeps) => {
    const route = new Hono()

    route.get(
        '/:icsToken',
        withErrorHandling(async (c) => {
            const token = c.req.param('icsToken')!.replace('.ics', '')

            const subscription = await deps.calendarService.getSubscriptionByIcsToken(token)
            if (!subscription) throw createAppError('CALENDAR_SUBSCRIPTION_NOT_FOUND')

            const events = await deps.calendarService.getAllEvents(subscription.userId)
            const timezone = await deps.calendarService.getUserTimezone(subscription.userId)
            const domain = new URL(c.req.url).hostname || 'b-calendar'
            const calendarName = subscription.name ?? 'My Calendar'

            const icsContent = eventsToICS(events, calendarName, domain, timezone)

            return new Response(icsContent, {
                headers: {
                    'Content-Type': 'text/calendar; charset=utf-8',
                    'Content-Disposition': `attachment; filename="${calendarName}.ics"`,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                },
            })
        }),
    )

    return route
}
