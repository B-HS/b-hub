export const serviceNameFromPath = (path: string) => {
    if (path.startsWith('/api/weather')) return 'b-hub-weather'
    if (path.startsWith('/api/mail')) return 'b-hub-mail'
    if (path.startsWith('/api/spotify')) return 'b-hub-spotify'
    if (path.startsWith('/api/calendar')) return 'b-hub-calendar'
    if (path.startsWith('/api/drive')) return 'b-hub-drive'
    if (path.startsWith('/api/blog')) return 'b-hub-blog'
    if (path.startsWith('/api/resume')) return 'b-hub-resume'
    if (path.startsWith('/api/logs')) return 'b-hub-logs'
    if (path.startsWith('/api/badge')) return 'b-hub-badge'
    if (path.startsWith('/api/auth')) return 'b-hub-auth'
    if (path.startsWith('/api/ai')) return 'b-hub-ai'
    if (path.startsWith('/caldav') || path.startsWith('/.well-known')) return 'b-hub-caldav'
    if (path.startsWith('/api')) return 'b-hub-api'
    return 'b-hub-web'
}

export const severityFromStatus = (status: number) => (status >= 500 ? 40 : 30)

const STATUS_CODE_LABEL: Record<number, string> = {
    400: 'VALIDATION_ERROR',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'RATE_LIMIT_EXCEEDED',
}

export const errorCodeFromStatus = (status: number) => STATUS_CODE_LABEL[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : `HTTP_${status}`)
