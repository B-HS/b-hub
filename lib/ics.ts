import { RRule } from 'rrule'

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

const MS_PER_MINUTE = 60 * 1000
const MINUTES_PER_HOUR = 60
const ZONE_PROBE_MONTHS = 12
const STANDARD_COMPONENT_DTSTART = '19700101T000000'

export const BYDAY_PATTERN = /^([+-]?[1-5])?(MO|TU|WE|TH|FR|SA|SU)$/

export const isSupportedTimezone = (timezone: string) => {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone })
        return true
    } catch {
        return false
    }
}

/**
 * Returns the wall-clock reading of an instant in the given IANA timezone,
 * encoded as epoch milliseconds whose UTC fields hold that wall clock.
 */
export const getZonedWallClockMs = (instantMs: number, timezone: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(new Date(instantMs))

    const values: Record<string, number> = {}
    for (const part of parts) {
        if (part.type !== 'literal') values[part.type] = Number(part.value)
    }

    return Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second)
}

export const generateIcsUid = () => `${crypto.randomUUID()}@b-calendar`

export const generateSubscriptionToken = () => {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
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

const formatRRule = (rrule: RecurrenceRule, isAllDay = false) => {
    const parts = [`FREQ=${rrule.freq}`]
    if (rrule.interval && rrule.interval > 1) parts.push(`INTERVAL=${rrule.interval}`)
    if (rrule.count) parts.push(`COUNT=${rrule.count}`)

    if (rrule.until) {
        const until = rrule.until instanceof Date ? rrule.until : new Date(rrule.until)
        parts.push(isAllDay ? `UNTIL=${formatDateTimeICS(until, true)}` : `UNTIL=${formatDateTimeICS(until, false)}Z`)
    }

    const byDay = rrule.byDay?.filter((day) => BYDAY_PATTERN.test(day)) ?? []
    if (byDay.length > 0) parts.push(`BYDAY=${byDay.join(',')}`)
    if (rrule.byMonth?.length) parts.push(`BYMONTH=${rrule.byMonth.join(',')}`)
    if (rrule.byMonthDay?.length) parts.push(`BYMONTHDAY=${rrule.byMonthDay.join(',')}`)
    return parts.join(';')
}

export const getRecurrenceOccurrences = (rrule: RecurrenceRule, dtstart: Date, rangeStart: Date, rangeEnd: Date) => {
    const rule = new RRule({ ...RRule.parseString(formatRRule(rrule)), dtstart })
    return rule.between(rangeStart, rangeEnd, true)
}

const formatUtcOffset = (offsetMinutes: number) => {
    const sign = offsetMinutes < 0 ? '-' : '+'
    const absolute = Math.abs(offsetMinutes)
    const hours = String(Math.floor(absolute / MINUTES_PER_HOUR)).padStart(2, '0')
    const minutes = String(absolute % MINUTES_PER_HOUR).padStart(2, '0')
    return `${sign}${hours}${minutes}`
}

const getZoneOffsetMinutesInYear = (timezone: string, year: number) => {
    const offsets = new Set<number>()
    for (let month = 0; month < ZONE_PROBE_MONTHS; month++) {
        const instantMs = Date.UTC(year, month, 1)
        offsets.add((getZonedWallClockMs(instantMs, timezone) - instantMs) / MS_PER_MINUTE)
    }
    return [...offsets]
}

/**
 * Builds a VTIMEZONE component with the real UTC offset of the zone.
 * Zones that observe DST cannot be expressed exactly here, so the block is
 * omitted for them rather than emitted with a wrong offset.
 */
export const generateTimezoneComponent = (timezone: string) => {
    if (!isSupportedTimezone(timezone)) return []

    const offsets = getZoneOffsetMinutesInYear(timezone, new Date().getUTCFullYear())
    if (offsets.length !== 1) return []

    const offset = formatUtcOffset(offsets[0])
    return [
        'BEGIN:VTIMEZONE',
        `TZID:${timezone}`,
        'BEGIN:STANDARD',
        `TZNAME:${timezone}`,
        `DTSTART:${STANDARD_COMPONENT_DTSTART}`,
        `TZOFFSETFROM:${offset}`,
        `TZOFFSETTO:${offset}`,
        'END:STANDARD',
        'END:VTIMEZONE',
    ]
}

export const eventsToICS = (events: CalendarEvent[], calendarName: string, domain: string, timezone: string) => {
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
            lines.push(`RRULE:${formatRRule(event.rrule, event.isAllDay)}`)
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
