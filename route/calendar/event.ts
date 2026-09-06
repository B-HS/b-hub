import { Hono } from 'hono'
import { validator } from 'hono-openapi'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { createEventSchema, updateEventSchema, monthQuerySchema, dateRangeQuerySchema } from '../../dto/calendar-event'
import { createEventBodySchema, patchEventBodySchema, toEventInput, toEventPatch, toEventResponse } from '../../dto/calendar-event-mapper'
import type { CalendarService } from '../../service/domain/calendar/calendar'
import type { CalendarEvent } from '../../service/domain/calendar/calendar'

type CalendarEventRouteDeps = {
    calendarService: CalendarService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

const MAX_DATE_RANGE_DAYS = 366

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
    groupId: event.groupId ?? null,
    sequence: event.sequence,
    created: event.created?.toISOString(),
    lastModified: event.lastModified?.toISOString(),
})

export const createCalendarEventRoute = (deps: CalendarEventRouteDeps) => {
    const route = new Hono()

    const assertGroupOwned = async (userId: string, groupId: string | null | undefined) => {
        if (!groupId) return
        const group = await deps.calendarService.getGroupById(userId, groupId)
        if (!group) throw createAppError('CALENDAR_GROUP_NOT_FOUND')
    }

    const assertDateRange = (dtstart: Date, dtend: Date) => {
        if (dtend < dtstart) throw createAppError('VALIDATION_ERROR')
    }

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

    route.get(
        '/range',
        validator('query', dateRangeQuerySchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const query = c.req.valid('query' as never) as z.infer<typeof dateRangeQuerySchema>
            const startDate = new Date(`${query.startDate}T00:00:00Z`)
            const endDate = new Date(`${query.endDate}T23:59:59Z`)

            if (startDate > endDate) throw createAppError('CALENDAR_INVALID_DATE_RANGE')

            const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
            if (diffDays > MAX_DATE_RANGE_DAYS) throw createAppError('CALENDAR_INVALID_DATE_RANGE')

            await assertGroupOwned(session.user.id, query.groupId)

            const events = await deps.calendarService.getEventsByDateRange(session.user.id, startDate, endDate, query.groupId)
            return c.json(successResponse(events.map((e) => toEventResponse(e))))
        }),
    )

    route.get(
        '/detail/:uid',
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const uid = c.req.param('uid')!
            const event = await deps.calendarService.getEventByUid(session.user.id, uid)
            if (!event) throw createAppError('CALENDAR_EVENT_NOT_FOUND')

            return c.json(successResponse(toEventResponse(event)))
        }),
    )

    route.post(
        '/',
        validator('json', createEventSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const data = c.req.valid('json' as never) as z.infer<typeof createEventSchema>
            await assertGroupOwned(session.user.id, data.groupId)

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
                groupId: data.groupId,
            })

            return c.json(successResponse(eventToResponse(event)), 201)
        }),
    )

    route.post(
        '/create',
        validator('json', createEventBodySchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const data = c.req.valid('json' as never) as z.infer<typeof createEventBodySchema>
            const input = toEventInput(data)
            assertDateRange(input.dtstart, input.dtend)
            await assertGroupOwned(session.user.id, input.groupId)

            const event = await deps.calendarService.createEvent(session.user.id, input)

            return c.json(successResponse(toEventResponse(event)), 201)
        }),
    )

    route.put(
        '/:uid',
        validator('json', updateEventSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const uid = c.req.param('uid')!
            const existing = await deps.calendarService.getEventByUid(session.user.id, uid)
            if (!existing) throw createAppError('CALENDAR_EVENT_NOT_FOUND')

            const data = c.req.valid('json' as never) as z.infer<typeof updateEventSchema>
            await assertGroupOwned(session.user.id, data.groupId)

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
                groupId: data.groupId !== undefined ? data.groupId : existing.groupId,
                sequence: existing.sequence,
            })

            return c.json(successResponse(eventToResponse(event)))
        }),
    )

    route.patch(
        '/:uid',
        validator('json', patchEventBodySchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const uid = c.req.param('uid')!
            const existing = await deps.calendarService.getEventByUid(session.user.id, uid)
            if (!existing) throw createAppError('CALENDAR_EVENT_NOT_FOUND')

            const data = c.req.valid('json' as never) as z.infer<typeof patchEventBodySchema>
            const merged = toEventPatch(existing, data)
            if (data.startDate !== undefined && data.endDate !== undefined) assertDateRange(merged.dtstart, merged.dtend)
            await assertGroupOwned(session.user.id, data.groupId)

            const updated = await deps.calendarService.updateEvent(session.user.id, merged)

            return c.json(successResponse(toEventResponse(updated)))
        }),
    )

    route.delete(
        '/:uid',
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const uid = c.req.param('uid')!
            await deps.calendarService.deleteEvent(session.user.id, uid)
            return c.body(null, 204)
        }),
    )

    return route
}
