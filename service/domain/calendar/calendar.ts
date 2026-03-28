import { getRecurrenceOccurrences, generateIcsUid, generateSubscriptionToken } from '../../../lib/ics'
import { createAppError } from '../../../lib/error'

export type EventStatus = 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED'
export type EventTransparency = 'TRANSPARENT' | 'OPAQUE'

export type RecurrenceRule = {
    freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
    interval?: number
    count?: number
    until?: Date
    byDay?: string[]
    byMonth?: number[]
    byMonthDay?: number[]
}

export type CalendarEvent = {
    uid: string
    summary: string
    description?: string
    location?: string
    dtstart: Date
    dtend: Date
    isAllDay: boolean
    rrule?: RecurrenceRule
    exdate?: string[]
    status?: EventStatus
    transp?: EventTransparency
    priority?: number
    categories?: string[]
    color?: string
    groupId?: string | null
    sequence?: number
    created?: Date
    lastModified?: Date
}

export type CalendarSubscription = {
    id: string
    userId: string
    token: string
    icsToken: string
    name: string | null
    isActive: boolean
    ctag: string
    lastAccessedAt: Date | null
}

type CalendarEventRow = {
    uid: string
    summary: string
    description: string | null
    location: string | null
    dtstart: Date
    dtend: Date
    isAllDay: boolean
    rrule: { freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'; interval?: number; count?: number; until?: string; byDay?: string[]; byMonth?: number[]; byMonthDay?: number[] } | null
    exdate: string[] | null
    status: string | null
    transp: string | null
    priority: number | null
    categories: string[] | null
    color: string | null
    groupId: string | null
    sequence: number
    createdAt: Date
    updatedAt: Date
}

type CalendarGroupRow = {
    id: string
    userId: string
    name: string
    color: string
    sortOrder: number
    isVisible: boolean
    createdAt: Date
    updatedAt: Date
}

export type CalendarServiceDb = {
    getEventsByMonthRange: (userId: string, startDate: Date, endDate: Date) => Promise<CalendarEventRow[]>
    getEventsByDateRange: (userId: string, startDate: Date, endDate: Date, groupId?: string) => Promise<CalendarEventRow[]>
    getAllEvents: (userId: string) => Promise<CalendarEventRow[]>
    getEventByUid: (userId: string, uid: string) => Promise<CalendarEventRow | null>
    getEventByUidWithDomain: (userId: string, uid: string) => Promise<CalendarEventRow | null>
    insertEvent: (data: {
        id: string
        userId: string
        uid: string
        summary: string
        description: string | null
        location: string | null
        dtstart: Date
        dtend: Date
        isAllDay: boolean
        rrule: { freq: string; interval?: number; count?: number; until?: string; byDay?: string[]; byMonth?: number[]; byMonthDay?: number[] } | null
        exdate?: string[] | null
        status: EventStatus | null
        transp: EventTransparency | null
        priority: number | null
        categories: string[] | null
        color: string | null
        groupId?: string | null
        dtstamp: Date
    }) => Promise<void>
    updateEvent: (
        userId: string,
        uid: string,
        data: {
            summary: string
            description: string | null
            location: string | null
            dtstart: Date
            dtend: Date
            isAllDay: boolean
            rrule: { freq: string; interval?: number; count?: number; until?: string; byDay?: string[]; byMonth?: number[]; byMonthDay?: number[] } | null
            exdate?: string[] | null
            status: EventStatus | null
            transp: EventTransparency | null
            priority: number | null
            categories: string[] | null
            color: string | null
            groupId?: string | null
            sequence: number
            dtstamp: Date
        },
    ) => Promise<void>
    deleteEventByUid: (userId: string, uid: string) => Promise<void>
    getGroupsByUser: (userId: string) => Promise<CalendarGroupRow[]>
    getGroupById: (userId: string, groupId: string) => Promise<CalendarGroupRow | null>
    insertGroup: (data: { id: string; userId: string; name: string; color: string; sortOrder: number; isVisible: boolean }) => Promise<void>
    updateGroup: (userId: string, groupId: string, data: Partial<{ name: string; color: string; sortOrder: number; isVisible: boolean }>) => Promise<void>
    deleteGroup: (userId: string, groupId: string) => Promise<void>
    countEventsByGroup: (userId: string, groupId: string) => Promise<number>
    getSubscription: (userId: string) => Promise<CalendarSubscription | null>
    getSubscriptionByToken: (token: string) => Promise<CalendarSubscription | null>
    getSubscriptionByIcsToken: (token: string) => Promise<CalendarSubscription | null>
    insertSubscription: (data: { id: string; userId: string; token: string; icsToken: string; name: string; isActive: boolean }) => Promise<void>
    updateSubscription: (userId: string, data: Record<string, unknown>) => Promise<void>
    updateSubscriptionToken: (userId: string, token: string) => Promise<void>
    updateSubscriptionIcsToken: (userId: string, icsToken: string) => Promise<void>
    updateSubscriptionLastAccessed: (id: string) => Promise<void>
    incrementCtag: (userId: string) => Promise<void>
    insertDeletedEvent: (data: { id: string; userId: string; uid: string; syncToken: string }) => Promise<void>
    getUserTimezone: (userId: string) => Promise<string | null>
    updateUserTimezone: (userId: string, timezone: string) => Promise<void>
}

const toNull = <T>(value: T | undefined | null | ''): T | null => (value === undefined || value === null || value === '' ? null : value)

const toCalendarEvent = (row: CalendarEventRow): CalendarEvent => ({
    uid: row.uid,
    summary: row.summary,
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    dtstart: row.dtstart,
    dtend: row.dtend,
    isAllDay: row.isAllDay,
    rrule: row.rrule
        ? {
              ...row.rrule,
              until: row.rrule.until ? new Date(row.rrule.until) : undefined,
          }
        : undefined,
    exdate: row.exdate ?? undefined,
    status: (row.status as EventStatus) ?? undefined,
    transp: (row.transp as EventTransparency) ?? undefined,
    priority: row.priority ?? undefined,
    categories: row.categories ?? undefined,
    color: row.color ?? undefined,
    groupId: row.groupId ?? undefined,
    sequence: row.sequence,
    created: row.createdAt,
    lastModified: row.updatedAt,
})

type CalendarServiceDeps = {
    db: CalendarServiceDb
}

export const createCalendarService = (deps: CalendarServiceDeps) => {
    const { db } = deps

    const getEventsByMonth = async (userId: string, year: number, month: number): Promise<CalendarEvent[]> => {
        const startDate = new Date(year, month, 1)
        const endDate = new Date(year, month + 1, 0, 23, 59, 59)

        const rows = await db.getEventsByMonthRange(userId, startDate, endDate)

        const result: CalendarEvent[] = []

        for (const row of rows) {
            const event = toCalendarEvent(row)

            if (!event.rrule) {
                if (event.dtstart >= startDate && event.dtstart <= endDate) {
                    result.push(event)
                }
            } else {
                const occurrences = getRecurrenceOccurrences(event.rrule, event.dtstart, startDate, endDate)
                if (occurrences.length > 0) {
                    result.push(event)
                }
            }
        }

        return result
    }

    const getAllEvents = async (userId: string): Promise<CalendarEvent[]> => {
        const rows = await db.getAllEvents(userId)
        return rows.map(toCalendarEvent)
    }

    const getEventByUid = async (userId: string, uid: string): Promise<CalendarEvent | null> => {
        const row = await db.getEventByUid(userId, uid)
        if (row) return toCalendarEvent(row)

        const rowWithDomain = await db.getEventByUidWithDomain(userId, uid)
        return rowWithDomain ? toCalendarEvent(rowWithDomain) : null
    }

    const createEvent = async (userId: string, data: Omit<CalendarEvent, 'uid' | 'created' | 'lastModified'>): Promise<CalendarEvent> => {
        const id = crypto.randomUUID()
        const uid = generateIcsUid()
        const now = new Date()

        const rruleValue =
            data.rrule && data.rrule.freq
                ? {
                      ...data.rrule,
                      until: data.rrule.until?.toISOString(),
                  }
                : null

        await db.insertEvent({
            id,
            userId,
            uid,
            summary: data.summary,
            description: toNull(data.description),
            location: toNull(data.location),
            dtstart: data.dtstart,
            dtend: data.dtend,
            isAllDay: data.isAllDay,
            rrule: rruleValue,
            status: toNull(data.status) as EventStatus | null,
            transp: toNull(data.transp) as EventTransparency | null,
            priority: toNull(data.priority),
            categories: data.categories?.length ? data.categories : null,
            color: toNull(data.color),
            groupId: toNull(data.groupId),
            dtstamp: now,
        })

        await db.incrementCtag(userId)

        return {
            ...data,
            uid,
            created: now,
            lastModified: now,
        }
    }

    const updateEvent = async (userId: string, data: CalendarEvent): Promise<CalendarEvent> => {
        const now = new Date()
        const newSequence = (data.sequence ?? 0) + 1

        const rruleValue =
            data.rrule && data.rrule.freq
                ? {
                      ...data.rrule,
                      until: data.rrule.until?.toISOString(),
                  }
                : null

        await db.updateEvent(userId, data.uid, {
            summary: data.summary,
            description: toNull(data.description),
            location: toNull(data.location),
            dtstart: data.dtstart,
            dtend: data.dtend,
            isAllDay: data.isAllDay,
            rrule: rruleValue,
            exdate: data.exdate?.length ? data.exdate : null,
            status: toNull(data.status) as EventStatus | null,
            transp: toNull(data.transp) as EventTransparency | null,
            priority: toNull(data.priority),
            categories: data.categories?.length ? data.categories : null,
            color: toNull(data.color),
            groupId: data.groupId !== undefined ? toNull(data.groupId) : undefined,
            sequence: newSequence,
            dtstamp: now,
        })

        await db.incrementCtag(userId)

        return {
            ...data,
            sequence: newSequence,
            lastModified: now,
        }
    }

    const deleteEvent = async (userId: string, uid: string): Promise<void> => {
        const event = await db.getEventByUid(userId, uid)
        const eventWithDomain = event ?? (await db.getEventByUidWithDomain(userId, uid))

        if (eventWithDomain) {
            const newCtag = Date.now().toString(36)

            await db.insertDeletedEvent({
                id: crypto.randomUUID(),
                userId,
                uid: eventWithDomain.uid,
                syncToken: newCtag,
            })

            await db.deleteEventByUid(userId, eventWithDomain.uid)
            await db.incrementCtag(userId)
        }
    }

    const upsertEventByUid = async (
        userId: string,
        uid: string,
        data: Omit<CalendarEvent, 'uid' | 'created' | 'lastModified'>,
    ): Promise<{ event: CalendarEvent; created: boolean }> => {
        const existing = await getEventByUid(userId, uid)
        if (existing) {
            const updated = await updateEvent(userId, { ...data, uid: existing.uid })
            return { event: updated, created: false }
        }

        const id = crypto.randomUUID()
        const now = new Date()

        const rruleValue =
            data.rrule && data.rrule.freq
                ? {
                      ...data.rrule,
                      until: data.rrule.until?.toISOString(),
                  }
                : null

        await db.insertEvent({
            id,
            userId,
            uid,
            summary: data.summary,
            description: toNull(data.description),
            location: toNull(data.location),
            dtstart: data.dtstart,
            dtend: data.dtend,
            isAllDay: data.isAllDay,
            rrule: rruleValue,
            status: toNull(data.status) as EventStatus | null,
            transp: toNull(data.transp) as EventTransparency | null,
            priority: toNull(data.priority),
            categories: data.categories?.length ? data.categories : null,
            color: toNull(data.color),
            groupId: toNull(data.groupId),
            dtstamp: now,
        })

        await db.incrementCtag(userId)

        return {
            event: { ...data, uid, created: now, lastModified: now },
            created: true,
        }
    }

    const getEventsByDateRange = async (userId: string, startDate: Date, endDate: Date, groupId?: string): Promise<CalendarEvent[]> => {
        const rows = await db.getEventsByDateRange(userId, startDate, endDate, groupId)

        const result: CalendarEvent[] = []

        for (const row of rows) {
            const event = toCalendarEvent(row)

            if (!event.rrule) {
                if (event.dtstart >= startDate && event.dtstart <= endDate) {
                    result.push(event)
                }
            } else {
                const occurrences = getRecurrenceOccurrences(event.rrule, event.dtstart, startDate, endDate)
                if (occurrences.length > 0) {
                    result.push(event)
                }
            }
        }

        return result
    }

    const getGroups = async (userId: string) => {
        return db.getGroupsByUser(userId)
    }

    const getGroupById = async (userId: string, groupId: string) => {
        return db.getGroupById(userId, groupId)
    }

    const createGroup = async (userId: string, data: { name: string; color: string; sortOrder?: number; isVisible?: boolean }) => {
        const id = crypto.randomUUID()
        const sortOrder = data.sortOrder ?? 0
        const isVisible = data.isVisible ?? true
        await db.insertGroup({ id, userId, name: data.name, color: data.color, sortOrder, isVisible })
        return { id, userId, name: data.name, color: data.color, sortOrder, isVisible }
    }

    const updateGroup = async (userId: string, groupId: string, data: Partial<{ name: string; color: string; sortOrder: number; isVisible: boolean }>) => {
        const existing = await db.getGroupById(userId, groupId)
        if (!existing) throw createAppError('CALENDAR_GROUP_NOT_FOUND')
        await db.updateGroup(userId, groupId, data)
    }

    const deleteGroup = async (userId: string, groupId: string) => {
        const existing = await db.getGroupById(userId, groupId)
        if (!existing) throw createAppError('CALENDAR_GROUP_NOT_FOUND')
        const count = await db.countEventsByGroup(userId, groupId)
        if (count > 0) throw createAppError('CALENDAR_GROUP_HAS_EVENTS')
        await db.deleteGroup(userId, groupId)
    }

    const getEventEtag = (event: CalendarEvent): string => {
        const timestamp = event.lastModified?.getTime() ?? Date.now()
        return `${timestamp.toString(36)}-${event.uid.slice(0, 8)}`
    }

    const getSubscription = async (userId: string): Promise<CalendarSubscription | null> => {
        return db.getSubscription(userId)
    }

    const getSubscriptionByToken = async (token: string): Promise<CalendarSubscription | null> => {
        const subscription = await db.getSubscriptionByToken(token)

        if (subscription) {
            await db.updateSubscriptionLastAccessed(subscription.id)
        }

        return subscription
    }

    const getSubscriptionByIcsToken = async (token: string): Promise<CalendarSubscription | null> => {
        return db.getSubscriptionByIcsToken(token)
    }

    const createSubscription = async (userId: string, name?: string): Promise<CalendarSubscription> => {
        const existing = await getSubscription(userId)
        if (existing) return existing

        const id = crypto.randomUUID()
        const token = generateSubscriptionToken()
        const icsToken = generateSubscriptionToken()

        await db.insertSubscription({
            id,
            userId,
            token,
            icsToken,
            name: name ?? 'My Calendar',
            isActive: true,
        })

        return { id, userId, token, icsToken, name: name ?? 'My Calendar', isActive: true, ctag: '0', lastAccessedAt: null }
    }

    const regenerateSubscriptionToken = async (userId: string): Promise<string> => {
        const newToken = generateSubscriptionToken()
        await db.updateSubscriptionToken(userId, newToken)
        return newToken
    }

    const regenerateIcsToken = async (userId: string): Promise<string> => {
        const newToken = generateSubscriptionToken()
        await db.updateSubscriptionIcsToken(userId, newToken)
        return newToken
    }

    const getUserTimezone = async (userId: string): Promise<string> => {
        const timezone = await db.getUserTimezone(userId)
        return timezone ?? 'Asia/Seoul'
    }

    const updateUserTimezone = async (userId: string, timezone: string): Promise<void> => {
        await db.updateUserTimezone(userId, timezone)
    }

    return {
        getEventsByMonth,
        getEventsByDateRange,
        getAllEvents,
        getEventByUid,
        createEvent,
        updateEvent,
        deleteEvent,
        upsertEventByUid,
        getEventEtag,
        getGroups,
        getGroupById,
        createGroup,
        updateGroup,
        deleteGroup,
        getSubscription,
        getSubscriptionByToken,
        getSubscriptionByIcsToken,
        createSubscription,
        regenerateSubscriptionToken,
        regenerateIcsToken,
        getUserTimezone,
        updateUserTimezone,
    }
}

export type CalendarService = ReturnType<typeof createCalendarService>
