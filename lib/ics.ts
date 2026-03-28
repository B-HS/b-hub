import { RRule, Frequency } from 'rrule'

type RecurrenceRule = {
    freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
    interval?: number
    count?: number
    until?: Date | string
    byDay?: string[]
    byMonth?: number[]
    byMonthDay?: number[]
}

type CalendarEvent = {
    uid: string
    summary: string
    description?: string | null
    location?: string | null
    dtstart: Date
    dtend: Date
    isAllDay: boolean
    rrule?: RecurrenceRule | null
    exdate?: string[] | null
    status?: string | null
    transp?: string | null
    priority?: number | null
    categories?: string[] | null
    sequence?: number
    created?: Date | null
    lastModified?: Date | null
    color?: string | null
}

export const generateIcsUid = () => `${crypto.randomUUID()}@b-calendar`

export const generateSubscriptionToken = () => {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const freqMap: Record<string, Frequency> = {
    DAILY: RRule.DAILY,
    WEEKLY: RRule.WEEKLY,
    MONTHLY: RRule.MONTHLY,
    YEARLY: RRule.YEARLY,
}

export const getRecurrenceOccurrences = (rrule: RecurrenceRule, dtstart: Date, rangeStart: Date, rangeEnd: Date): Date[] => {
    const rule = new RRule({
        freq: freqMap[rrule.freq],
        interval: rrule.interval ?? 1,
        count: rrule.count,
        until: rrule.until ? (rrule.until instanceof Date ? rrule.until : new Date(rrule.until)) : undefined,
        byweekday: rrule.byDay?.map((day) => {
            const dayMap: Record<string, number> = { SU: 6, MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5 }
            return dayMap[day]
        }),
        bymonth: rrule.byMonth,
        bymonthday: rrule.byMonthDay,
        dtstart,
    })

    return rule.between(rangeStart, rangeEnd, true)
}

const formatDateTimeICS = (date: Date, isAllDay: boolean) => {
    if (isAllDay) {
        const year = date.getUTCFullYear()
        const month = String(date.getUTCMonth() + 1).padStart(2, '0')
        const day = String(date.getUTCDate()).padStart(2, '0')
        return `${year}${month}${day}`
    }

    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    const hours = String(date.getUTCHours()).padStart(2, '0')
    const minutes = String(date.getUTCMinutes()).padStart(2, '0')
    const seconds = String(date.getUTCSeconds()).padStart(2, '0')
    return `${year}${month}${day}T${hours}${minutes}${seconds}`
}

const escapeICSText = (text: string) =>
    text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n/g, '\\n').replace(/\r/g, '\\n').replace(/\n/g, '\\n')

const formatRRule = (rrule: RecurrenceRule): string => {
    const parts = [`FREQ=${rrule.freq}`]
    if (rrule.interval && rrule.interval > 1) parts.push(`INTERVAL=${rrule.interval}`)
    if (rrule.count) parts.push(`COUNT=${rrule.count}`)
    if (rrule.until) parts.push(`UNTIL=${formatDateTimeICS(rrule.until instanceof Date ? rrule.until : new Date(rrule.until), false)}Z`)
    if (rrule.byDay?.length) parts.push(`BYDAY=${rrule.byDay.join(',')}`)
    if (rrule.byMonth?.length) parts.push(`BYMONTH=${rrule.byMonth.join(',')}`)
    if (rrule.byMonthDay?.length) parts.push(`BYMONTHDAY=${rrule.byMonthDay.join(',')}`)
    return parts.join(';')
}

export const generateTimezoneComponent = (timezone: string): string[] => {
    return [
        'BEGIN:VTIMEZONE',
        `TZID:${timezone}`,
        'BEGIN:STANDARD',
        `TZNAME:${timezone}`,
        'DTSTART:19700101T000000',
        'TZOFFSETFROM:+0000',
        'TZOFFSETTO:+0000',
        'END:STANDARD',
        'END:VTIMEZONE',
    ]
}

export const eventsToICS = (events: CalendarEvent[], calendarName: string, domain: string, timezone: string): string => {
    const lines: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        `PRODID:-//${domain}//B-Calendar//EN`,
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${escapeICSText(calendarName)}`,
        `X-WR-TIMEZONE:${timezone}`,
        ...generateTimezoneComponent(timezone),
    ]

    for (const event of events) {
        lines.push('BEGIN:VEVENT')
        lines.push(`UID:${event.uid}`)

        if (event.isAllDay) {
            lines.push(`DTSTART;VALUE=DATE:${formatDateTimeICS(event.dtstart, true)}`)
            lines.push(`DTEND;VALUE=DATE:${formatDateTimeICS(event.dtend, true)}`)
        } else {
            lines.push(`DTSTART;TZID=${timezone}:${formatDateTimeICS(event.dtstart, false)}`)
            lines.push(`DTEND;TZID=${timezone}:${formatDateTimeICS(event.dtend, false)}`)
        }

        lines.push(`SUMMARY:${escapeICSText(event.summary)}`)

        if (event.description) {
            lines.push(`DESCRIPTION:${escapeICSText(event.description)}`)
        }

        if (event.location) {
            lines.push(`LOCATION:${escapeICSText(event.location)}`)
        }

        if (event.rrule) {
            lines.push(`RRULE:${formatRRule(event.rrule)}`)
        }

        if (event.exdate?.length) {
            for (const exdate of event.exdate) {
                if (event.isAllDay) {
                    lines.push(`EXDATE;VALUE=DATE:${exdate.replace(/T.*$/, '')}`)
                } else {
                    lines.push(`EXDATE:${exdate}`)
                }
            }
        }

        if (event.sequence !== undefined) {
            lines.push(`SEQUENCE:${event.sequence}`)
        }

        if (event.status) {
            lines.push(`STATUS:${event.status}`)
        }

        if (event.transp) {
            lines.push(`TRANSP:${event.transp}`)
        }

        if (event.priority !== undefined && event.priority !== null) {
            lines.push(`PRIORITY:${event.priority}`)
        }

        if (event.categories?.length) {
            lines.push(`CATEGORIES:${event.categories.map(escapeICSText).join(',')}`)
        }

        if (event.created) {
            lines.push(`CREATED:${formatDateTimeICS(event.created, false)}Z`)
        }

        if (event.lastModified) {
            lines.push(`LAST-MODIFIED:${formatDateTimeICS(event.lastModified, false)}Z`)
        }

        lines.push(`DTSTAMP:${formatDateTimeICS(new Date(), false)}Z`)
        lines.push('END:VEVENT')
    }

    lines.push('END:VCALENDAR')
    return lines.join('\r\n')
}
