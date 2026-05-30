export const formatDate = (d: Date | string | null | undefined): string => {
    if (!d) return '-'
    const date = typeof d === 'string' ? new Date(d) : d
    if (Number.isNaN(date.getTime())) return '-'
    return date.toISOString().slice(0, 19).replace('T', ' ')
}

export const formatDateShort = (d: Date | string | null | undefined): string => {
    if (!d) return '-'
    const date = typeof d === 'string' ? new Date(d) : d
    if (Number.isNaN(date.getTime())) return '-'
    return date.toISOString().slice(0, 10)
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

export const formatBytes = (bytes: number | null | undefined): string => {
    if (bytes == null) return '-'
    if (bytes === 0) return '0 B'
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
    const value = bytes / Math.pow(1024, i)
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${UNITS[i]}`
}

export const maskToken = (token: string | null | undefined): string => {
    if (!token) return '-'
    if (token.length <= 8) return `${token.slice(0, 2)}***`
    return `${token.slice(0, 4)}…${token.slice(-4)}`
}

export const truncate = (text: string | null | undefined, max = 80): string => {
    if (!text) return '-'
    if (text.length <= max) return text
    return text.slice(0, max) + '…'
}

export const ynLabel = (v: boolean | null | undefined): 'YES' | 'NO' => (v ? 'YES' : 'NO')

export const parseIntOr = (v: unknown, fallback: number): number => {
    const n = Number(v)
    return Number.isFinite(n) && Number.isInteger(n) ? n : fallback
}

export const parseDateStart = (v: string | undefined): Date | undefined => {
    if (!v) return undefined
    const d = new Date(v.length === 10 ? `${v}T00:00:00` : v)
    return Number.isNaN(d.getTime()) ? undefined : d
}

export const parseDateEnd = (v: string | undefined): Date | undefined => {
    if (!v) return undefined
    const d = new Date(v.length === 10 ? `${v}T23:59:59.999` : v)
    return Number.isNaN(d.getTime()) ? undefined : d
}

export const clampPage = (page: number, totalPages: number): number => Math.max(1, Math.min(page, Math.max(totalPages, 1)))
