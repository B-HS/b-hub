import { XMLBuilder, XMLParser } from 'fast-xml-parser'

const DAV_NS = 'DAV:'
const CALDAV_NS = 'urn:ietf:params:xml:ns:caldav'
const CS_NS = 'http://calendarserver.org/ns/'
const APPLE_NS = 'http://apple.com/ns/ical/'

const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    suppressEmptyNode: false,
    suppressBooleanAttributes: false,
})

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
})

type PropValue = string | Record<string, unknown> | null

type PropstatEntry = {
    status: number
    props: Record<string, PropValue>
}

type ResponseEntry = {
    href: string
    propstats: PropstatEntry[]
}

const getStatusText = (status: number) => {
    const texts: Record<number, string> = { 200: 'OK', 404: 'Not Found' }
    return texts[status] ?? 'Unknown'
}

export const buildMultistatus = (responses: ResponseEntry[]) => {
    const responseElements = responses.map((response) => ({
        'D:href': response.href,
        'D:propstat': response.propstats.map((propstat) => ({
            'D:prop': Object.fromEntries(
                Object.entries(propstat.props).map(([key, value]) => {
                    if (value === null) return [key, '']
                    return [key, value]
                }),
            ),
            'D:status': `HTTP/1.1 ${propstat.status} ${getStatusText(propstat.status)}`,
        })),
    }))

    const xml = {
        '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
        'D:multistatus': {
            '@_xmlns:D': DAV_NS,
            '@_xmlns:C': CALDAV_NS,
            '@_xmlns:CS': CS_NS,
            '@_xmlns:A': APPLE_NS,
            'D:response': responseElements,
        },
    }

    return builder.build(xml)
}

type ParsedPropfind = {
    props: string[]
    allprop: boolean
}

export const parsePropfind = (xml: string): ParsedPropfind => {
    if (!xml.trim()) return { props: [], allprop: true }

    try {
        const parsed = parser.parse(xml)
        const propfind = parsed.propfind || parsed['D:propfind'] || parsed['d:propfind'] || {}

        if (propfind.allprop || propfind['D:allprop'] || propfind['d:allprop']) {
            return { props: [], allprop: true }
        }

        const prop = propfind.prop || propfind['D:prop'] || propfind['d:prop'] || {}
        const props = Object.keys(prop).filter((key) => !key.startsWith('@_'))

        return { props, allprop: props.length === 0 }
    } catch {
        return { props: [], allprop: true }
    }
}

type ParsedReport = {
    type: 'calendar-multiget' | 'calendar-query' | 'sync-collection' | 'free-busy-query' | 'unknown'
    hrefs: string[]
    timeRange?: { start: string; end: string }
    syncToken?: string
}

export const parseReport = (xml: string): ParsedReport => {
    try {
        const parsed = parser.parse(xml)

        const findKey = (obj: Record<string, unknown>, search: string): unknown => {
            for (const key of Object.keys(obj)) {
                if (key.toLowerCase().includes(search.toLowerCase())) return obj[key]
            }
            return undefined
        }

        if (findKey(parsed, 'calendar-multiget')) {
            const multiget = findKey(parsed, 'calendar-multiget') as Record<string, unknown>
            const hrefValue = findKey(multiget, 'href')
            const hrefs = Array.isArray(hrefValue) ? hrefValue : hrefValue ? [hrefValue] : []
            return { type: 'calendar-multiget', hrefs: hrefs.map(String) }
        }

        if (findKey(parsed, 'calendar-query')) {
            const query = findKey(parsed, 'calendar-query') as Record<string, unknown>
            const filter = findKey(query, 'filter') as Record<string, unknown> | undefined
            const compFilter = filter ? (findKey(filter, 'comp-filter') as Record<string, unknown>) : undefined
            const timeRange = compFilter ? (findKey(compFilter, 'time-range') as Record<string, string>) : undefined

            return {
                type: 'calendar-query',
                hrefs: [],
                timeRange: timeRange ? { start: timeRange['@_start'], end: timeRange['@_end'] } : undefined,
            }
        }

        if (findKey(parsed, 'sync-collection')) {
            const syncCollection = findKey(parsed, 'sync-collection') as Record<string, unknown>
            const syncToken = findKey(syncCollection, 'sync-token') as string | undefined
            return { type: 'sync-collection', hrefs: [], syncToken: syncToken || undefined }
        }

        if (findKey(parsed, 'free-busy-query')) {
            const query = findKey(parsed, 'free-busy-query') as Record<string, unknown>
            const timeRange = findKey(query, 'time-range') as Record<string, string> | undefined
            return {
                type: 'free-busy-query',
                hrefs: [],
                timeRange: timeRange ? { start: timeRange['@_start'], end: timeRange['@_end'] } : undefined,
            }
        }

        return { type: 'unknown', hrefs: [] }
    } catch {
        return { type: 'unknown', hrefs: [] }
    }
}

export const buildCalendarDataResponse = (responses: Array<{ href: string; etag: string; calendarData?: string; status?: number }>) => {
    const responseElements = responses.map((response) => {
        if (response.status && response.status !== 200) {
            return {
                'D:href': response.href,
                'D:status': `HTTP/1.1 ${response.status} ${getStatusText(response.status)}`,
            }
        }

        return {
            'D:href': response.href,
            'D:propstat': {
                'D:prop': {
                    'D:getetag': `"${response.etag}"`,
                    ...(response.calendarData ? { 'C:calendar-data': response.calendarData } : {}),
                },
                'D:status': 'HTTP/1.1 200 OK',
            },
        }
    })

    const xml = {
        '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
        'D:multistatus': {
            '@_xmlns:D': DAV_NS,
            '@_xmlns:C': CALDAV_NS,
            'D:response': responseElements,
        },
    }

    return builder.build(xml)
}
