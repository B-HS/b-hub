import type { CalendarEvent, CalendarSubscription } from './calendar'

export type SyncResult = {
    changed: CalendarEvent[]
    deleted: string[]
    syncToken: string
}

export type FreeBusyPeriod = {
    start: Date
    end: Date
    type: 'BUSY' | 'BUSY-UNAVAILABLE' | 'BUSY-TENTATIVE'
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
    sequence: number
    createdAt: Date
    updatedAt: Date
}

type DeletedEventRow = {
    uid: string
    syncToken: string
}

type FreeBusyRow = {
    dtstart: Date
    dtend: Date
    status: string | null
}

export type CaldavServiceDb = {
    getSubscriptionByUserId: (userId: string) => Promise<CalendarSubscription | null>
    getAllEvents: (userId: string) => Promise<CalendarEventRow[]>
    getChangedEventsSince: (userId: string, since: Date) => Promise<CalendarEventRow[]>
    getDeletedEventsSince: (userId: string, previousCtag: string) => Promise<DeletedEventRow[]>
    getFreeBusyEvents: (userId: string, start: Date, end: Date) => Promise<FreeBusyRow[]>
    insertDeletedEvent: (data: { id: string; userId: string; uid: string; syncToken: string }) => Promise<void>
    getUserTimezone: (userId: string) => Promise<string | null>
}

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
    status: (row.status as CalendarEvent['status']) ?? undefined,
    transp: (row.transp as CalendarEvent['transp']) ?? undefined,
    priority: row.priority ?? undefined,
    categories: row.categories ?? undefined,
    color: row.color ?? undefined,
    sequence: row.sequence,
    created: row.createdAt,
    lastModified: row.updatedAt,
})

const ctagToDate = (ctag: string): Date => new Date(parseInt(ctag, 36))

type CaldavServiceDeps = {
    db: CaldavServiceDb
}

export const createCaldavService = (deps: CaldavServiceDeps) => {
    const { db } = deps

    const getSyncToken = (ctag: string) => `http://b-calendar/sync/${ctag}`

    const parseSyncToken = (token: string): string | null => {
        const match = token.match(/http:\/\/b-calendar\/sync\/(.+)/)
        return match ? match[1] : null
    }

    const getChangesFromToken = async (userId: string, token: string | null): Promise<SyncResult> => {
        const subscription = await db.getSubscriptionByUserId(userId)

        if (!subscription) {
            return { changed: [], deleted: [], syncToken: getSyncToken('0') }
        }

        const currentCtag = subscription.ctag

        if (!token) {
            const events = await db.getAllEvents(userId)
            return {
                changed: events.map(toCalendarEvent),
                deleted: [],
                syncToken: getSyncToken(currentCtag),
            }
        }

        const previousCtag = parseSyncToken(token)
        if (!previousCtag) {
            const events = await db.getAllEvents(userId)
            return {
                changed: events.map(toCalendarEvent),
                deleted: [],
                syncToken: getSyncToken(currentCtag),
            }
        }

        const since = ctagToDate(previousCtag)
        const changedEvents = await db.getChangedEventsSince(userId, since)
        const deletedEvents = await db.getDeletedEventsSince(userId, previousCtag)

        return {
            changed: changedEvents.map(toCalendarEvent),
            deleted: deletedEvents.map((e) => e.uid),
            syncToken: getSyncToken(currentCtag),
        }
    }

    const recordDeletedEvent = async (userId: string, uid: string, syncToken: string) => {
        await db.insertDeletedEvent({
            id: crypto.randomUUID(),
            userId,
            uid,
            syncToken,
        })
    }

    const getFreeBusy = async (userId: string, start: Date, end: Date): Promise<FreeBusyPeriod[]> => {
        const events = await db.getFreeBusyEvents(userId, start, end)

        return events.map((event) => ({
            start: event.dtstart,
            end: event.dtend,
            type: event.status === 'TENTATIVE' ? ('BUSY-TENTATIVE' as const) : ('BUSY' as const),
        }))
    }

    const generateFreeBusyICS = (periods: FreeBusyPeriod[], start: Date, end: Date, organizer?: string): string => {
        const now = new Date()
        const formatDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

        const lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//b-calendar//FreeBusy//EN',
            'METHOD:REPLY',
            'BEGIN:VFREEBUSY',
            `DTSTAMP:${formatDate(now)}`,
            `DTSTART:${formatDate(start)}`,
            `DTEND:${formatDate(end)}`,
        ]

        if (organizer) {
            lines.push(`ORGANIZER:${organizer}`)
        }

        for (const period of periods) {
            lines.push(`FREEBUSY;FBTYPE=${period.type}:${formatDate(period.start)}/${formatDate(period.end)}`)
        }

        lines.push('END:VFREEBUSY', 'END:VCALENDAR')
        return lines.join('\r\n')
    }

    const buildPropfindResponse = (
        href: string,
        props: Record<string, unknown>,
        notFoundProps: string[] = [],
    ): { href: string; propstats: Array<{ status: number; props: Record<string, unknown> }> } => {
        const propstats: Array<{ status: number; props: Record<string, unknown> }> = []

        if (Object.keys(props).length > 0) {
            propstats.push({ status: 200, props })
        }

        if (notFoundProps.length > 0) {
            const notFound: Record<string, unknown> = {}
            for (const prop of notFoundProps) {
                notFound[prop] = ''
            }
            propstats.push({ status: 404, props: notFound })
        }

        return { href, propstats }
    }

    type PropValue = string | Record<string, unknown> | null

    const getCalendarProperties = (
        subscription: CalendarSubscription,
        requestedProps: string[],
        calendarHref: string,
        timezone: string,
    ): { found: Record<string, PropValue>; notFound: string[] } => {
        const found: Record<string, PropValue> = {}
        const notFound: string[] = []

        for (const prop of requestedProps) {
            switch (prop) {
                case 'resourcetype':
                    found['D:resourcetype'] = { 'D:collection': '', 'C:calendar': '' }
                    break
                case 'current-user-principal':
                    found['D:current-user-principal'] = { 'D:href': calendarHref }
                    break
                case 'principal-URL':
                    found['D:principal-URL'] = { 'D:href': calendarHref }
                    break
                case 'displayname':
                    found['D:displayname'] = subscription.name ?? 'B-Calendar'
                    break
                case 'calendar-home-set':
                    found['C:calendar-home-set'] = { 'D:href': calendarHref }
                    break
                case 'calendar-user-address-set':
                    found['C:calendar-user-address-set'] = { 'D:href': 'mailto:user@b-calendar' }
                    break
                case 'getctag':
                    found['CS:getctag'] = subscription.ctag
                    break
                case 'supported-calendar-component-set':
                    found['C:supported-calendar-component-set'] = { 'C:comp': { '@_name': 'VEVENT' } }
                    break
                case 'supported-calendar-data':
                    found['C:supported-calendar-data'] = { 'C:calendar-data': { '@_content-type': 'text/calendar', '@_version': '2.0' } }
                    break
                case 'current-user-privilege-set':
                    found['D:current-user-privilege-set'] = {
                        'D:privilege': [{ 'D:read': '' }, { 'D:write': '' }, { 'D:write-content': '' }, { 'D:bind': '' }, { 'D:unbind': '' }],
                    }
                    break
                case 'sync-token':
                    found['D:sync-token'] = getSyncToken(subscription.ctag)
                    break
                case 'calendar-description':
                    found['C:calendar-description'] = ''
                    break
                case 'calendar-color':
                    found['A:calendar-color'] = '#0E61B9FF'
                    break
                case 'getcontenttype':
                    found['D:getcontenttype'] = 'text/calendar; component=vevent'
                    break
                case 'supported-report-set':
                    found['D:supported-report-set'] = {
                        'D:supported-report': [
                            { 'D:report': { 'C:calendar-multiget': '' } },
                            { 'D:report': { 'C:calendar-query': '' } },
                            { 'D:report': { 'C:free-busy-query': '' } },
                            { 'D:report': { 'D:sync-collection': '' } },
                        ],
                    }
                    break
                case 'owner':
                    found['D:owner'] = { 'D:href': calendarHref }
                    break
                case 'principal-collection-set':
                    found['D:principal-collection-set'] = { 'D:href': calendarHref }
                    break
                case 'calendar-timezone':
                    found['C:calendar-timezone'] = generateTimezoneComponent(timezone)
                    break
                default:
                    notFound.push(prop)
            }
        }

        return { found, notFound }
    }

    const generateTimezoneComponent = (timezone: string): string => {
        return `BEGIN:VTIMEZONE\r\nTZID:${timezone}\r\nEND:VTIMEZONE`
    }

    const getUserTimezone = async (userId: string): Promise<string> => {
        const timezone = await db.getUserTimezone(userId)
        return timezone ?? 'Asia/Seoul'
    }

    return {
        getSyncToken,
        parseSyncToken,
        getChangesFromToken,
        recordDeletedEvent,
        getFreeBusy,
        generateFreeBusyICS,
        buildPropfindResponse,
        getCalendarProperties,
        generateTimezoneComponent,
        getUserTimezone,
    }
}

export type CaldavService = ReturnType<typeof createCaldavService>
