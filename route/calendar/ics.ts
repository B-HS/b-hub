import { Hono } from 'hono'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { eventsToICS } from '../../lib/ics'
import type { CalendarService } from '../../service/domain/calendar/calendar'

type CalendarIcsRouteDeps = {
    calendarService: CalendarService
}

const ICS_CACHE_CONTROL = 'no-cache, no-store, must-revalidate'
const ICS_LINE_SEPARATOR = '\r\n'
const ICS_VOLATILE_LINE_PREFIX = 'DTSTAMP:'
const ETAG_HASH_ALGORITHM = 'SHA-256'
const ETAG_HASH_LENGTH = 32
const NOT_MODIFIED_STATUS = 304

/**
 * Hashes the ICS payload without its per-render DTSTAMP lines so the validator
 * only changes when the calendar content itself changes.
 */
const buildIcsEtagHash = async (icsContent: string) => {
    const stableContent = icsContent
        .split(ICS_LINE_SEPARATOR)
        .filter((line) => !line.startsWith(ICS_VOLATILE_LINE_PREFIX))
        .join(ICS_LINE_SEPARATOR)

    const digest = await crypto.subtle.digest(ETAG_HASH_ALGORITHM, new TextEncoder().encode(stableContent))

    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, ETAG_HASH_LENGTH)
}

const isNotModified = (ifNoneMatch: string | undefined, etagHash: string) => {
    if (!ifNoneMatch) return false

    const quotedEtag = `"${etagHash}"`
    return ifNoneMatch.split(',').some((candidate) => {
        const trimmed = candidate.trim()
        return trimmed === '*' || trimmed === quotedEtag || trimmed === `W/${quotedEtag}`
    })
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
            const etagHash = await buildIcsEtagHash(icsContent)
            const etag = `W/"${etagHash}"`

            if (isNotModified(c.req.header('If-None-Match'), etagHash)) {
                return new Response(null, {
                    status: NOT_MODIFIED_STATUS,
                    headers: {
                        'ETag': etag,
                        'Cache-Control': ICS_CACHE_CONTROL,
                    },
                })
            }

            return new Response(icsContent, {
                headers: {
                    'Content-Type': 'text/calendar; charset=utf-8',
                    'Content-Disposition': `attachment; filename="${calendarName}.ics"`,
                    'Cache-Control': ICS_CACHE_CONTROL,
                    'ETag': etag,
                },
            })
        }),
    )

    return route
}
