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

export const isBlockedHost = (host: string): boolean => {
    const lower = host.toLowerCase().trim()

    const blockedNames = ['localhost', 'metadata.google.internal', 'metadata.google', 'kubernetes.default']
    if (blockedNames.some((n) => lower === n || lower.endsWith(`.${n}`))) return true

    const bare = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower

    if (bare === '::1' || bare === '::' || bare.startsWith('fe80:') || bare.startsWith('fc00:') || bare.startsWith('fd00:')) return true

    const parts = bare.split('.')
    if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p))) {
        const octets = parts.map(Number)
        if (octets.some((o) => o > 255)) return false
        const [a, b] = octets
        if (a === 127) return true
        if (a === 10) return true
        if (a === 172 && b >= 16 && b <= 31) return true
        if (a === 192 && b === 168) return true
        if (a === 169 && b === 254) return true
        if (a === 0) return true
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
