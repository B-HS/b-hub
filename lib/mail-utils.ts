export const sanitizeHeaderValue = (value: string): string => {
    return value.replace(/[\x00-\x1f\x7f]/g, '')
}

export const sanitizeEmailName = (name: string): string => {
    return name
        .replace(/[\x00-\x1f\x7f\r\n]/g, '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .slice(0, 256)
}

export const escapeHtml = (str: string): string => {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

const isPrivateIPv4 = (a: number, b: number): boolean => {
    if (a === 127) return true
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    if (a === 0) return true
    return false
}

const parseIPv4Octet = (part: string): number | null => {
    if (part.startsWith('0x') || part.startsWith('0X')) {
        const val = parseInt(part, 16)
        return Number.isFinite(val) && val >= 0 && val <= 255 ? val : null
    }
    if (part.length > 1 && part.startsWith('0')) {
        const val = parseInt(part, 8)
        return Number.isFinite(val) && val >= 0 && val <= 255 ? val : null
    }
    if (/^\d{1,3}$/.test(part)) {
        const val = Number(part)
        return val >= 0 && val <= 255 ? val : null
    }
    return null
}

const extractIPv4FromIPv6 = (addr: string): [number, number, number, number] | null => {
    const mappedMatch = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i)
    if (mappedMatch) {
        const parts = mappedMatch[1].split('.').map(Number)
        if (parts.length === 4 && parts.every((p) => p >= 0 && p <= 255)) return parts as [number, number, number, number]
    }
    const compatMatch = addr.match(/^::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (compatMatch) {
        const parts = compatMatch[1].split('.').map(Number)
        if (parts.length === 4 && parts.every((p) => p >= 0 && p <= 255)) return parts as [number, number, number, number]
    }
    return null
}

export const isBlockedHost = (host: string): boolean => {
    const lower = host.toLowerCase().trim()

    const blockedNames = ['localhost', 'metadata.google.internal', 'metadata.google', 'kubernetes.default']
    if (blockedNames.some((n) => lower === n || lower.endsWith(`.${n}`))) return true

    const bare = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower

    if (bare === '::1' || bare === '::' || bare.startsWith('fe80:') || bare.startsWith('fc00:') || bare.startsWith('fd00:')) return true

    const mappedIPv4 = extractIPv4FromIPv6(bare)
    if (mappedIPv4) return isPrivateIPv4(mappedIPv4[0], mappedIPv4[1])

    if (bare.includes(':')) return false

    const parts = bare.split('.')
    if (parts.length === 4) {
        const octets = parts.map(parseIPv4Octet)
        if (octets.every((o) => o !== null)) {
            const [a, b] = octets as number[]
            return isPrivateIPv4(a, b)
        }
    }

    return false
}

export const maskProviderError = (message: string): string => {
    return message
        .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '[redacted]')
        .replace(/\b[a-zA-Z0-9-]+\.(internal|local|localdomain|corp|lan)\b/g, '[redacted]')
}

export const sanitizeFilename = (filename: string): string => {
    let decoded: string
    try {
        decoded = decodeURIComponent(filename)
    } catch {
        decoded = filename
    }
    const basename = decoded.split(/[/\\]/).pop() ?? ''
    return (basename
        .replace(/\.\./g, '')
        .replace(/[\x00-\x1f\x7f"]/g, '')
        .trim() || 'file'
    ).slice(0, 255)
}
