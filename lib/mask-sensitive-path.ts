const SENSITIVE_PATH_TOKEN_MASK = '[REDACTED]'

const CALDAV_TOKEN_PATH_PREFIX = '/caldav/'
const SPOTIFY_PLAYING_TOKEN_PATH_PREFIX = '/api/spotify/playing/'
const CALENDAR_ICS_TOKEN_PATH_PREFIX = '/api/calendar/'
const CALENDAR_NON_TOKEN_SEGMENTS = ['events', 'groups', 'subscription']

const maskFirstSegmentAfterPrefix = (path: string, prefix: string) => {
    const rest = path.slice(prefix.length)
    const nextSlashIndex = rest.indexOf('/')
    const suffix = nextSlashIndex === -1 ? '' : rest.slice(nextSlashIndex)
    return `${prefix}${SENSITIVE_PATH_TOKEN_MASK}${suffix}`
}

export const maskSensitivePath = (path: string) => {
    if (path.startsWith(SPOTIFY_PLAYING_TOKEN_PATH_PREFIX)) return maskFirstSegmentAfterPrefix(path, SPOTIFY_PLAYING_TOKEN_PATH_PREFIX)
    if (path.startsWith(CALDAV_TOKEN_PATH_PREFIX)) return maskFirstSegmentAfterPrefix(path, CALDAV_TOKEN_PATH_PREFIX)
    if (path.startsWith(CALENDAR_ICS_TOKEN_PATH_PREFIX)) {
        const firstSegment = path.slice(CALENDAR_ICS_TOKEN_PATH_PREFIX.length).split('/')[0]
        if (firstSegment.length === 0 || CALENDAR_NON_TOKEN_SEGMENTS.includes(firstSegment)) return path
        return maskFirstSegmentAfterPrefix(path, CALENDAR_ICS_TOKEN_PATH_PREFIX)
    }
    return path
}
