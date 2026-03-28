import { Hono } from 'hono'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { createGroupSchema, updateGroupSchema } from '../../dto/calendar-group'
import type { CalendarService } from '../../service/domain/calendar/calendar'

type CalendarGroupRouteDeps = {
    calendarService: CalendarService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

export const createCalendarGroupRoute = (deps: CalendarGroupRouteDeps) => {
    const route = new Hono()

    route.get(
        '/',
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const groups = await deps.calendarService.getGroups(session.user.id)
            return c.json(successResponse(groups))
        }),
    )

    route.post(
        '/',
        validator('json', createGroupSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const data = c.req.valid('json' as never) as z.infer<typeof createGroupSchema>
            const group = await deps.calendarService.createGroup(session.user.id, data)

            return c.json(successResponse(group), 201)
        }),
    )

    route.patch(
        '/:id',
        validator('json', updateGroupSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const id = c.req.param('id')
            const data = c.req.valid('json' as never) as z.infer<typeof updateGroupSchema>
            await deps.calendarService.updateGroup(session.user.id, id, data)

            const updated = await deps.calendarService.getGroupById(session.user.id, id)
            return c.json(successResponse(updated))
        }),
    )

    route.delete(
        '/:id',
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const id = c.req.param('id')
            await deps.calendarService.deleteGroup(session.user.id, id)

            return c.body(null, 204)
        }),
    )

    return route
}
