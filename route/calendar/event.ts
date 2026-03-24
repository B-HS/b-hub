import { Hono } from 'hono'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { createEventSchema, updateEventSchema, monthQuerySchema } from '../../dto/calendar-event'
import type { CalendarService } from '../../service/domain/calendar/calendar'
import type { CalendarEvent } from '../../service/domain/calendar/calendar'

type CalendarEventRouteDeps = {
    calendarService: CalendarService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

const eventToResponse = (event: CalendarEvent) => ({
    uid: event.uid,
    summary: event.summary,
    description: event.description,
    location: event.location,
    dtstart: event.dtstart.toISOString(),
    dtend: event.dtend.toISOString(),
    isAllDay: event.isAllDay,
    rrule: event.rrule
        ? {
              freq: event.rrule.freq,
              interval: event.rrule.interval,
              count: event.rrule.count,
              until: event.rrule.until?.toISOString(),
              byDay: event.rrule.byDay,
              byMonth: event.rrule.byMonth,
              byMonthDay: event.rrule.byMonthDay,
          }
        : undefined,
    exdate: event.exdate,
    status: event.status,
    transp: event.transp,
    priority: event.priority,
    categories: event.categories,
    color: event.color,
    sequence: event.sequence,
    created: event.created?.toISOString(),
    lastModified: event.lastModified?.toISOString(),
})

export const createCalendarEventRoute = (deps: CalendarEventRouteDeps) => {
    const route = new Hono()

    route.get(
        '/',
        validator('query', monthQuerySchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const query = c.req.valid('query' as never) as z.infer<typeof monthQuerySchema>
            const events = await deps.calendarService.getEventsByMonth(session.user.id, query.year, query.month)
            return c.json(successResponse(events.map(eventToResponse)))
        }),
    )

    route.post(
        '/',
        validator('json', createEventSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const data = c.req.valid('json' as never) as z.infer<typeof createEventSchema>
            const event = await deps.calendarService.createEvent(session.user.id, {
                summary: data.summary,
                description: data.description,
                location: data.location,
                dtstart: data.dtstart,
                dtend: data.dtend,
                isAllDay: data.isAllDay,
                rrule: data.rrule
                    ? {
                          freq: data.rrule.freq,
                          interval: data.rrule.interval,
                          count: data.rrule.count,
                          until: data.rrule.until ? new Date(data.rrule.until) : undefined,
                          byDay: data.rrule.byDay,
                          byMonth: data.rrule.byMonth,
                          byMonthDay: data.rrule.byMonthDay,
                      }
                    : undefined,
                status: data.status,
                transp: data.transp,
                priority: data.priority,
                categories: data.categories,
                color: data.color,
            })

            return c.json(successResponse(eventToResponse(event)), 201)
        }),
    )

    route.put(
        '/:uid',
        validator('json', updateEventSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const uid = c.req.param('uid')
            const existing = await deps.calendarService.getEventByUid(session.user.id, uid)
            if (!existing) throw createAppError('CALENDAR_EVENT_NOT_FOUND')

            const data = c.req.valid('json' as never) as z.infer<typeof updateEventSchema>
            const event = await deps.calendarService.updateEvent(session.user.id, {
                uid: existing.uid,
                summary: data.summary ?? existing.summary,
                description: data.description !== undefined ? (data.description ?? undefined) : existing.description,
                location: data.location !== undefined ? (data.location ?? undefined) : existing.location,
                dtstart: data.dtstart ?? existing.dtstart,
                dtend: data.dtend ?? existing.dtend,
                isAllDay: data.isAllDay ?? existing.isAllDay,
                rrule:
                    data.rrule !== undefined
                        ? data.rrule
                            ? {
                                  freq: data.rrule.freq,
                                  interval: data.rrule.interval,
                                  count: data.rrule.count,
                                  until: data.rrule.until ? new Date(data.rrule.until) : undefined,
                                  byDay: data.rrule.byDay,
                                  byMonth: data.rrule.byMonth,
                                  byMonthDay: data.rrule.byMonthDay,
                              }
                            : undefined
                        : existing.rrule,
                exdate: data.exdate !== undefined ? (data.exdate ?? undefined) : existing.exdate,
                status: data.status !== undefined ? (data.status ?? undefined) : existing.status,
                transp: data.transp !== undefined ? (data.transp ?? undefined) : existing.transp,
                priority: data.priority !== undefined ? (data.priority ?? undefined) : existing.priority,
                categories: data.categories !== undefined ? (data.categories ?? undefined) : existing.categories,
                color: data.color !== undefined ? (data.color ?? undefined) : existing.color,
                sequence: existing.sequence,
            })

            return c.json(successResponse(eventToResponse(event)))
        }),
    )

    route.delete(
        '/:uid',
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const uid = c.req.param('uid')
            await deps.calendarService.deleteEvent(session.user.id, uid)
            return c.body(null, 204)
        }),
    )

    return route
}
