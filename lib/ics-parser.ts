import { BYDAY_PATTERN, getZonedWallClockMs, isSupportedTimezone } from './ics'

type RecurrenceRule = {
    freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
    interval?: number
    count?: number
    until?: Date
    byDay?: string[]
    byMonth?: number[]
    byMonthDay?: number[]
}

type EventStatus = 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED'
type EventTransparency = 'TRANSPARENT' | 'OPAQUE'

const UTC_TIMEZONE = 'UTC'
const ALL_DAY_DURATION_MS = 24 * 60 * 60 * 1000
const DEFAULT_DURATION_MS = 60 * 60 * 1000

const unescapeICSText = (text: string) => {
    const escapeMap: Record<string, string> = { '\\\\': '\\', '\\n': '\n', '\\,': ',', '\\;': ';' }
    return text.replace(/\\\\|\\n|\\,|\\;/g, (match) => escapeMap[match])
}

const getZoneOffsetMs = (instantMs: number, timezone: string) => getZonedWallClockMs(instantMs, timezone) - instantMs

const wallClockToInstantMs = (wallClockMs: number, timezone: string) => {
    const approximateInstantMs = wallClockMs - getZoneOffsetMs(wallClockMs, timezone)
    return wallClockMs - getZoneOffsetMs(approximateInstantMs, timezone)
}

const getSourceTimezone = (value: string, params: string | undefined, targetTimezone: string) => {
    const tzid = params?.match(/TZID=([^;:]+)/)?.[1]
    if (tzid) return isSupportedTimezone(tzid) ? tzid : targetTimezone
    if (value.endsWith('Z')) return UTC_TIMEZONE
    return targetTimezone
}

export const parseICSDateTime = (value: string, params?: string, timezone = UTC_TIMEZONE) => {
    const isAllDay = params?.includes('VALUE=DATE') || value.length === 8

    if (isAllDay) {
        const year = parseInt(value.slice(0, 4))
        const month = parseInt(value.slice(4, 6)) - 1
        const day = parseInt(value.slice(6, 8))
        return { date: new Date(Date.UTC(year, month, day)), isAllDay: true }
    }

    const dateStr = value.replace('Z', '')
    const year = parseInt(dateStr.slice(0, 4))
    const month = parseInt(dateStr.slice(4, 6)) - 1
    const day = parseInt(dateStr.slice(6, 8))
    const hours = parseInt(dateStr.slice(9, 11)) || 0
    const minutes = parseInt(dateStr.slice(11, 13)) || 0
    const seconds = parseInt(dateStr.slice(13, 15)) || 0

    const wallClockMs = Date.UTC(year, month, day, hours, minutes, seconds)
    const sourceTimezone = getSourceTimezone(value, params, timezone)

    if (sourceTimezone === timezone) return { date: new Date(wallClockMs), isAllDay: false }

    const instantMs = wallClockToInstantMs(wallClockMs, sourceTimezone)
    return { date: new Date(getZonedWallClockMs(instantMs, timezone)), isAllDay: false }
}

const parseRRule = (value: string, timezone: string) => {
    const parts = value.split(';')
    const rule: Partial<RecurrenceRule> = {}

    for (const part of parts) {
        const [key, val] = part.split('=')
        switch (key) {
            case 'FREQ':
                if (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(val)) {
                    rule.freq = val as RecurrenceRule['freq']
                }
                break
            case 'INTERVAL':
                rule.interval = parseInt(val)
                break
            case 'COUNT':
                rule.count = parseInt(val)
                break
            case 'UNTIL':
                rule.until = parseICSDateTime(val, undefined, timezone).date
                break
            case 'BYDAY': {
                const byDay = val.split(',').filter((day) => BYDAY_PATTERN.test(day))
                if (byDay.length > 0) rule.byDay = byDay
                break
            }
            case 'BYMONTH':
                rule.byMonth = val.split(',').map((v) => parseInt(v))
                break
            case 'BYMONTHDAY':
                rule.byMonthDay = val.split(',').map((v) => parseInt(v))
                break
        }
    }

    return rule.freq ? (rule as RecurrenceRule) : undefined
}

export type ParsedICS = {
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
    sequence?: number
}

type ParsingEvent = {
    uid: string
    summary: string
    description?: string
    location?: string
    dtstart?: Date
    dtend?: Date
    isAllDay: boolean
    rrule?: RecurrenceRule
    exdate: string[]
    status?: EventStatus
    transp?: EventTransparency
    priority?: number
    categories?: string[]
    sequence?: number
    hasRecurrenceId: boolean
}

export const parseICS = (ics: string, timezone = UTC_TIMEZONE) => {
    const lines: string[] = []
    const rawLines = ics.split(/\r?\n/)

    for (let i = 0; i < rawLines.length; i++) {
        if (rawLines[i].startsWith(' ') || rawLines[i].startsWith('\t')) {
            if (lines.length > 0) {
                lines[lines.length - 1] += rawLines[i].slice(1)
            }
        } else {
            lines.push(rawLines[i])
        }
    }

    const targetTimezone = isSupportedTimezone(timezone) ? timezone : UTC_TIMEZONE

    let current: ParsingEvent | null = null
    let master: ParsingEvent | null = null
    let inAlarm = false

    for (const line of lines) {
        if (line === 'BEGIN:VEVENT') {
            current = { uid: '', summary: '', isAllDay: false, exdate: [], hasRecurrenceId: false }
            inAlarm = false
            continue
        }
        if (line === 'END:VEVENT') {
            if (current && !current.hasRecurrenceId && !master) master = current
            current = null
            inAlarm = false
            continue
        }

        if (!current) continue

        if (line === 'BEGIN:VALARM') {
            inAlarm = true
            continue
        }
        if (line === 'END:VALARM') {
            inAlarm = false
            continue
        }
        if (inAlarm) continue

        const colonIndex = line.indexOf(':')
        if (colonIndex === -1) continue

        const keyPart = line.slice(0, colonIndex)
        const value = line.slice(colonIndex + 1)
        const [key, ...paramParts] = keyPart.split(';')
        const params = paramParts.join(';')

        switch (key) {
            case 'UID':
                current.uid = value
                break
            case 'RECURRENCE-ID':
                current.hasRecurrenceId = true
                break
            case 'SUMMARY':
                current.summary = unescapeICSText(value)
                break
            case 'DESCRIPTION':
                current.description = unescapeICSText(value)
                break
            case 'LOCATION':
                current.location = unescapeICSText(value)
                break
            case 'DTSTART': {
                const parsed = parseICSDateTime(value, params, targetTimezone)
                current.dtstart = parsed.date
                current.isAllDay = parsed.isAllDay
                break
            }
            case 'DTEND': {
                const parsed = parseICSDateTime(value, params, targetTimezone)
                current.dtend = parsed.date
                break
            }
            case 'RRULE':
                current.rrule = parseRRule(value, targetTimezone)
                break
            case 'STATUS':
                if (['TENTATIVE', 'CONFIRMED', 'CANCELLED'].includes(value)) {
                    current.status = value as EventStatus
                }
                break
            case 'TRANSP':
                if (['TRANSPARENT', 'OPAQUE'].includes(value)) {
                    current.transp = value as EventTransparency
                }
                break
            case 'PRIORITY':
                current.priority = parseInt(value)
                break
            case 'CATEGORIES':
                current.categories = value.split(',').map(unescapeICSText)
                break
            case 'SEQUENCE':
                current.sequence = parseInt(value)
                break
            case 'EXDATE':
                current.exdate.push(value)
                break
        }
    }

    if (!master || !master.uid || !master.summary || !master.dtstart) {
        return null
    }

    const dtstart = master.dtstart
    const dtend = master.dtend ?? new Date(dtstart.getTime() + (master.isAllDay ? ALL_DAY_DURATION_MS : DEFAULT_DURATION_MS))

    return {
        uid: master.uid,
        summary: master.summary,
        description: master.description,
        location: master.location,
        dtstart,
        dtend,
        isAllDay: master.isAllDay,
        rrule: master.rrule,
        exdate: master.exdate.length > 0 ? master.exdate : undefined,
        status: master.status,
        transp: master.transp,
        priority: master.priority,
        categories: master.categories,
        sequence: master.sequence,
    }
}

export const extractUidFromICS = (ics: string) => {
    const match = ics.match(/^UID:(.+)$/m)
    return match ? match[1].trim() : null
}
