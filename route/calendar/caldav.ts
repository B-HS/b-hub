import { Hono } from 'hono'
import type { Context } from 'hono'
import { createAppError, isAppError } from '../../lib/error'
import { errorResponse } from '../../lib/api-response'
import { buildMultistatus, parsePropfind, parseReport, buildCalendarDataResponse } from '../../lib/xml'
import { eventsToICS } from '../../lib/ics'
import { parseICS, parseICSDateTime } from '../../lib/ics-parser'
import type { CalendarService, CalendarSubscription } from '../../service/domain/calendar/calendar'
import type { CaldavService } from '../../service/domain/calendar/caldav'

type CalendarCaldavRouteDeps = {
    calendarService: CalendarService
    caldavService: CaldavService
}

const DAV_HEADERS = {
    DAV: '1, 2, 3, calendar-access',
    Allow: 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, PROPPATCH, REPORT, MKCALENDAR',
}

const MAX_ICS_SIZE = 1024 * 1024

const CALDAV_BASE_PATH = '/caldav'
const DEFAULT_COLLECTION_SEGMENT = 'default'

const buildCollectionHref = (token: string, isDefaultCollection: boolean) =>
    isDefaultCollection ? `${CALDAV_BASE_PATH}/${token}/${DEFAULT_COLLECTION_SEGMENT}/` : `${CALDAV_BASE_PATH}/${token}/`

const buildEventHref = (collectionHref: string, uid: string) => `${collectionHref}${uid.split('@')[0]}.ics`

export const createCalendarCaldavRoute = (deps: CalendarCaldavRouteDeps) => {
    const route = new Hono()

    route.use('*', async (c, next) => {
        try {
            await next()
        } catch (err) {
            if (isAppError(err)) {
                return c.json(errorResponse(err.code, err.message, err.details), err.statusCode as 400)
            }
            return c.text('Internal error', 500)
        }
    })

    const resolveToken = async (c: Context): Promise<{ subscription: CalendarSubscription; userId: string }> => {
        const token = c.req.param('token')!
        const subscription = await deps.calendarService.getSubscriptionByToken(token)
        if (!subscription) throw createAppError('CALENDAR_SUBSCRIPTION_NOT_FOUND')
        return { subscription, userId: subscription.userId }
    }

    const handleOptions = () => new Response(null, { status: 200, headers: DAV_HEADERS })

    route.on('OPTIONS', '/:token', handleOptions)
    route.on('OPTIONS', '/:token/*', handleOptions)

    const handlePropfindPrincipal = async (c: Context) => {
        const { subscription, userId } = await resolveToken(c)
        const token = c.req.param('token')
        const depth = c.req.header('Depth') ?? '0'
        const body = await c.req.text()
        const { props, allprop } = parsePropfind(body)

        const calendarHref = buildCollectionHref(token!, false)
        const timezone = await deps.caldavService.getUserTimezone(userId)

        const requestedProps = allprop
            ? [
                  'resourcetype',
                  'current-user-principal',
                  'displayname',
                  'calendar-home-set',
                  'getctag',
                  'supported-calendar-component-set',
                  'current-user-privilege-set',
              ]
            : props

        const { found: responseProps } = deps.caldavService.getCalendarProperties(subscription, requestedProps, calendarHref, timezone)
        const responses = [{ href: calendarHref, propstats: [{ status: 200, props: responseProps }] }]

        if (depth === '1') {
            const events = await deps.calendarService.getAllEvents(userId)
            for (const event of events) {
                const etag = deps.calendarService.getEventEtag(event)
                responses.push({
                    href: buildEventHref(calendarHref, event.uid),
                    propstats: [{ status: 200, props: { 'D:getetag': `"${etag}"`, 'D:getcontenttype': 'text/calendar; component=vevent' } }],
                })
            }
        }

        const xml = buildMultistatus(responses)
        return new Response(xml, {
            status: 207,
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
                'DAV': '1, 2, 3, calendar-access',
            },
        })
    }

    const handlePropfindCalendar = async (c: Context) => {
        const { subscription, userId } = await resolveToken(c)
        const token = c.req.param('token')
        const depth = c.req.header('Depth') ?? '0'
        const body = await c.req.text()
        const { props, allprop } = parsePropfind(body)

        const calendarHref = buildCollectionHref(token!, true)
        const timezone = await deps.caldavService.getUserTimezone(userId)

        const requestedProps = allprop
            ? ['resourcetype', 'displayname', 'getctag', 'supported-calendar-component-set', 'current-user-privilege-set', 'sync-token']
            : props

        const { found: calendarProps } = deps.caldavService.getCalendarProperties(
            subscription,
            requestedProps,
            buildCollectionHref(token!, false),
            timezone,
        )
        const responses = [{ href: calendarHref, propstats: [{ status: 200, props: calendarProps }] }]

        if (depth === '1') {
            const events = await deps.calendarService.getAllEvents(userId)
            for (const event of events) {
                const etag = deps.calendarService.getEventEtag(event)
                responses.push({
                    href: buildEventHref(calendarHref, event.uid),
                    propstats: [{ status: 200, props: { 'D:getetag': `"${etag}"`, 'D:getcontenttype': 'text/calendar; component=vevent' } }],
                })
            }
        }

        return new Response(buildMultistatus(responses), {
            status: 207,
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
                'DAV': '1, 2, calendar-access',
            },
        })
    }

    route.on('PROPFIND', '/:token', handlePropfindPrincipal)
    route.on('PROPFIND', '/:token/', handlePropfindPrincipal)
    route.on('PROPFIND', '/:token/default', handlePropfindCalendar)
    route.on('PROPFIND', '/:token/default/', handlePropfindCalendar)

    const createReportHandler = (isDefaultCollection: boolean) => async (c: Context) => {
        const { userId } = await resolveToken(c)
        const token = c.req.param('token')

        const body = await c.req.text()
        const report = parseReport(body)
        const timezone = await deps.calendarService.getUserTimezone(userId)
        const domain = new URL(c.req.url).hostname || 'b-calendar'
        const calendarHref = buildCollectionHref(token!, isDefaultCollection)

        if (report.type === 'calendar-multiget') {
            const requestedEvents = report.hrefs.map((href) => {
                const uid = href.split('/').pop()?.replace('.ics', '').replace(/%40/g, '@') ?? ''
                return { href, searchUid: uid.split('@')[0] }
            })
            const eventsByUid = await deps.calendarService.getEventsByUids(
                userId,
                requestedEvents.map((requested) => requested.searchUid),
            )

            const responses: Array<{ href: string; etag: string; calendarData?: string; status?: number }> = requestedEvents.map(
                ({ href, searchUid }) => {
                    const event = eventsByUid.get(searchUid)
                    if (!event) return { href, etag: '', status: 404 }

                    const icsContent = eventsToICS([event], 'Calendar', domain, timezone)
                    return { href, etag: deps.calendarService.getEventEtag(event), calendarData: icsContent }
                },
            )

            return new Response(buildCalendarDataResponse(responses), {
                status: 207,
                headers: { 'Content-Type': 'application/xml; charset=utf-8' },
            })
        }

        if (report.type === 'calendar-query') {
            const events = await deps.calendarService.getAllEvents(userId)
            const responses: Array<{ href: string; etag: string; calendarData?: string }> = []

            for (const event of events) {
                const icsContent = eventsToICS([event], 'Calendar', domain, timezone)
                responses.push({
                    href: buildEventHref(calendarHref, event.uid),
                    etag: deps.calendarService.getEventEtag(event),
                    calendarData: icsContent,
                })
            }

            return new Response(buildCalendarDataResponse(responses), {
                status: 207,
                headers: { 'Content-Type': 'application/xml; charset=utf-8' },
            })
        }

        if (report.type === 'sync-collection') {
            const syncResult = await deps.caldavService.getChangesFromToken(userId, report.syncToken || null)

            const changedResponses = syncResult.changed.map(
                (event) => `  <D:response>
    <D:href>${buildEventHref(calendarHref, event.uid)}</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"${deps.calendarService.getEventEtag(event)}"</D:getetag>
        <D:getcontenttype>text/calendar; component=vevent</D:getcontenttype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`,
            )

            const deletedResponses = syncResult.deleted.map(
                (uid) => `  <D:response>
    <D:href>${buildEventHref(calendarHref, uid)}</D:href>
    <D:status>HTTP/1.1 404 Not Found</D:status>
  </D:response>`,
            )

            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:">
${[...changedResponses, ...deletedResponses].join('\n')}
  <D:sync-token>${syncResult.syncToken}</D:sync-token>
</D:multistatus>`

            return new Response(xml, {
                status: 207,
                headers: { 'Content-Type': 'application/xml; charset=utf-8' },
            })
        }

        if (report.type === 'free-busy-query') {
            if (!report.timeRange) {
                return c.text('Missing time-range', 400)
            }

            const start = parseICSDateTime(report.timeRange.start, undefined, timezone).date
            const end = parseICSDateTime(report.timeRange.end, undefined, timezone).date
            const periods = await deps.caldavService.getFreeBusy(userId, start, end)
            const ics = deps.caldavService.generateFreeBusyICS(periods, start, end)

            return new Response(ics, {
                status: 200,
                headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
            })
        }

        return c.text('Unknown report type', 400)
    }

    route.on('REPORT', '/:token', createReportHandler(false))
    route.on('REPORT', '/:token/', createReportHandler(false))
    route.on('REPORT', '/:token/default', createReportHandler(true))
    route.on('REPORT', '/:token/default/', createReportHandler(true))

    const handleProppatch = (c: Context) => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>${c.req.path}</D:href>
    <D:propstat>
      <D:prop/>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`
        return new Response(xml, { status: 207, headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
    }

    route.on('PROPPATCH', '/:token', handleProppatch)
    route.on('PROPPATCH', '/:token/', handleProppatch)
    route.on('PROPPATCH', '/:token/*', handleProppatch)

    const handleMkcalendar = (c: Context) => c.body(null, 201)

    route.on('MKCALENDAR', '/:token/*', handleMkcalendar)

    const handleGetCalendar = async (c: Context) => {
        const { subscription, userId } = await resolveToken(c)

        const events = await deps.calendarService.getAllEvents(userId)
        const timezone = await deps.calendarService.getUserTimezone(userId)
        const domain = new URL(c.req.url).hostname || 'b-calendar'
        const icsContent = eventsToICS(events, subscription.name ?? 'My Calendar', domain, timezone)

        return new Response(icsContent, {
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                ...DAV_HEADERS,
            },
        })
    }

    route.get('/:token', handleGetCalendar)
    route.get('/:token/', handleGetCalendar)
    route.get('/:token/default', handleGetCalendar)
    route.get('/:token/default/', handleGetCalendar)

    route.get('/:token/default/:uid', async (c) => {
        const { userId } = await resolveToken(c)
        const uid = c.req.param('uid').replace('.ics', '')

        const event = await deps.calendarService.getEventByUid(userId, uid.split('@')[0])
        if (!event) throw createAppError('CALENDAR_EVENT_NOT_FOUND')

        const timezone = await deps.calendarService.getUserTimezone(userId)
        const domain = new URL(c.req.url).hostname || 'b-calendar'
        const icsContent = eventsToICS([event], 'Calendar', domain, timezone)

        c.header('Content-Type', 'text/calendar; charset=utf-8')
        c.header('ETag', `"${deps.calendarService.getEventEtag(event)}"`)
        return c.body(icsContent)
    })

    route.put('/:token/default/:uid', async (c) => {
        const { userId } = await resolveToken(c)
        const icsData = await c.req.text()

        if (icsData.length > MAX_ICS_SIZE) {
            throw createAppError('CALENDAR_ICS_TOO_LARGE')
        }

        const timezone = await deps.calendarService.getUserTimezone(userId)
        const parsed = parseICS(icsData, timezone)
        if (!parsed) throw createAppError('CALENDAR_ICS_PARSE_FAILED')

        const eventUid = parsed.uid.includes('@') ? parsed.uid.split('@')[0] : parsed.uid

        const { event, created } = await deps.calendarService.upsertEventByUid(userId, eventUid, {
            summary: parsed.summary,
            description: parsed.description,
            location: parsed.location,
            dtstart: parsed.dtstart,
            dtend: parsed.dtend,
            isAllDay: parsed.isAllDay,
            rrule: parsed.rrule,
            exdate: parsed.exdate,
            status: parsed.status,
            transp: parsed.transp,
            priority: parsed.priority,
            categories: parsed.categories,
        })

        c.header('ETag', `"${deps.calendarService.getEventEtag(event)}"`)
        return created ? c.body(null, 201) : c.body(null, 204)
    })

    route.delete('/:token/default/:uid', async (c) => {
        const { userId } = await resolveToken(c)
        const uid = c.req.param('uid').replace('.ics', '').split('@')[0]
        await deps.calendarService.deleteEvent(userId, uid)
        return c.body(null, 204)
    })

    const getEventHandler = async (c: Context) => {
        const { userId } = await resolveToken(c)
        const uid = c.req.param('uid')!.replace('.ics', '').split('@')[0]

        const event = await deps.calendarService.getEventByUid(userId, uid)
        if (!event) throw createAppError('CALENDAR_EVENT_NOT_FOUND')

        const timezone = await deps.calendarService.getUserTimezone(userId)
        const domain = new URL(c.req.url).hostname || 'b-calendar'
        const icsContent = eventsToICS([event], 'Calendar', domain, timezone)

        return new Response(icsContent, {
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                'ETag': `"${deps.calendarService.getEventEtag(event)}"`,
            },
        })
    }

    const putEventHandler = async (c: Context) => {
        const { userId } = await resolveToken(c)
        const icsData = await c.req.text()

        if (icsData.length > MAX_ICS_SIZE) {
            throw createAppError('CALENDAR_ICS_TOO_LARGE')
        }

        const timezone = await deps.calendarService.getUserTimezone(userId)
        const parsed = parseICS(icsData, timezone)
        if (!parsed) throw createAppError('CALENDAR_ICS_PARSE_FAILED')

        const eventUid = parsed.uid.includes('@') ? parsed.uid.split('@')[0] : parsed.uid

        const { event, created } = await deps.calendarService.upsertEventByUid(userId, eventUid, {
            summary: parsed.summary,
            description: parsed.description,
            location: parsed.location,
            dtstart: parsed.dtstart,
            dtend: parsed.dtend,
            isAllDay: parsed.isAllDay,
            rrule: parsed.rrule,
            exdate: parsed.exdate,
            status: parsed.status,
            transp: parsed.transp,
            priority: parsed.priority,
            categories: parsed.categories,
        })

        return new Response(null, {
            status: created ? 201 : 204,
            headers: { ETag: `"${deps.calendarService.getEventEtag(event)}"` },
        })
    }

    const deleteEventHandler = async (c: Context) => {
        const { userId } = await resolveToken(c)
        const uid = c.req.param('uid')!.replace('.ics', '').split('@')[0]
        await deps.calendarService.deleteEvent(userId, uid)
        return c.body(null, 204)
    }

    route.get('/:token/:uid', getEventHandler)
    route.put('/:token/:uid', putEventHandler)
    route.delete('/:token/:uid', deleteEventHandler)

    return route
}
