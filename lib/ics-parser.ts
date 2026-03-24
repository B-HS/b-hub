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

const unescapeICSText = (text: string) => {
    const escapeMap: Record<string, string> = { '\\\\': '\\', '\\n': '\n', '\\,': ',', '\\;': ';' }
    return text.replace(/\\\\|\\n|\\,|\\;/g, (match) => escapeMap[match])
}

const parseICSDateTime = (value: string, params?: string): { date: Date; isAllDay: boolean } => {
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

    if (value.endsWith('Z')) {
        return { date: new Date(Date.UTC(year, month, day, hours, minutes, seconds)), isAllDay: false }
    }

    return { date: new Date(year, month, day, hours, minutes, seconds), isAllDay: false }
}

const parseRRule = (value: string): RecurrenceRule | undefined => {
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
                rule.until = parseICSDateTime(val).date
                break
            case 'BYDAY':
                rule.byDay = val.split(',')
                break
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

export const parseICS = (ics: string): ParsedICS | null => {
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

    let inEvent = false
    let uid = ''
    let summary = ''
    let description: string | undefined
    let location: string | undefined
    let dtstart: Date | undefined
    let dtend: Date | undefined
    let isAllDay = false
    let rrule: RecurrenceRule | undefined
    let exdate: string[] = []
    let status: EventStatus | undefined
    let transp: EventTransparency | undefined
    let priority: number | undefined
    let categories: string[] | undefined
    let sequence: number | undefined

    for (const line of lines) {
        if (line === 'BEGIN:VEVENT') {
            inEvent = true
            continue
        }
        if (line === 'END:VEVENT') {
            inEvent = false
            continue
        }

        if (!inEvent) continue

        const colonIndex = line.indexOf(':')
        if (colonIndex === -1) continue

        const keyPart = line.slice(0, colonIndex)
        const value = line.slice(colonIndex + 1)
        const [key, ...paramParts] = keyPart.split(';')
        const params = paramParts.join(';')

        switch (key) {
            case 'UID':
                uid = value
                break
            case 'SUMMARY':
                summary = unescapeICSText(value)
                break
            case 'DESCRIPTION':
                description = unescapeICSText(value)
                break
            case 'LOCATION':
                location = unescapeICSText(value)
                break
            case 'DTSTART': {
                const parsed = parseICSDateTime(value, params)
                dtstart = parsed.date
                isAllDay = parsed.isAllDay
                break
            }
            case 'DTEND': {
                const parsed = parseICSDateTime(value, params)
                dtend = parsed.date
                break
            }
            case 'RRULE':
                rrule = parseRRule(value)
                break
            case 'STATUS':
                if (['TENTATIVE', 'CONFIRMED', 'CANCELLED'].includes(value)) {
                    status = value as EventStatus
                }
                break
            case 'TRANSP':
                if (['TRANSPARENT', 'OPAQUE'].includes(value)) {
                    transp = value as EventTransparency
                }
                break
            case 'PRIORITY':
                priority = parseInt(value)
                break
            case 'CATEGORIES':
                categories = value.split(',').map(unescapeICSText)
                break
            case 'SEQUENCE':
                sequence = parseInt(value)
                break
            case 'EXDATE':
                exdate.push(value)
                break
        }
    }

    if (!uid || !summary || !dtstart) {
        return null
    }

    if (!dtend) {
        dtend = isAllDay ? new Date(dtstart.getTime() + 24 * 60 * 60 * 1000) : new Date(dtstart.getTime() + 60 * 60 * 1000)
    }

    return {
        uid,
        summary,
        description,
        location,
        dtstart,
        dtend,
        isAllDay,
        rrule,
        exdate: exdate.length > 0 ? exdate : undefined,
        status,
        transp,
        priority,
        categories,
        sequence,
    }
}

export const extractUidFromICS = (ics: string): string | null => {
    const match = ics.match(/^UID:(.+)$/m)
    return match ? match[1].trim() : null
}
