/**
 * Remove control characters from email header values to prevent header injection attacks.
 */
export const sanitizeHeaderValue = (value: string): string => {
    return value.replace(/[\x00-\x1f\x7f]/g, '')
}

/**
 * Sanitize email display name for use in "Name" <addr> format.
 * Removes control characters, escapes backslash and double quotes.
 */
export const sanitizeEmailName = (name: string): string => {
    return name
        .replace(/[\x00-\x1f\x7f\r\n]/g, '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .slice(0, 256)
}

/**
 * Escape HTML special characters to prevent XSS in HTML email templates.
 */
export const escapeHtml = (str: string): string => {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

/**
 * Check if a hostname/IP points to a private or internal network address.
 * Used to prevent SSRF attacks on IMAP/SMTP host configuration.
 */
export const isBlockedHost = (host: string): boolean => {
    const lower = host.toLowerCase().trim()

    // Block well-known internal hostnames
    const blockedNames = ['localhost', 'metadata.google.internal', 'metadata.google', 'kubernetes.default']
    if (blockedNames.some((n) => lower === n || lower.endsWith(`.${n}`))) return true

    // Strip brackets for IPv6
    const bare = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower

    // Block IPv6 loopback and link-local
    if (bare === '::1' || bare === '::' || bare.startsWith('fe80:') || bare.startsWith('fc00:') || bare.startsWith('fd00:')) return true

    // IPv4 checks
    const parts = bare.split('.')
    if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p))) {
        const octets = parts.map(Number)
        if (octets.some((o) => o > 255)) return false // Not a valid IP, let DNS resolve
        const [a, b] = octets
        if (a === 127) return true                      // 127.0.0.0/8
        if (a === 10) return true                       // 10.0.0.0/8
        if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
        if (a === 192 && b === 168) return true         // 192.168.0.0/16
        if (a === 169 && b === 254) return true         // 169.254.0.0/16
        if (a === 0) return true                        // 0.0.0.0/8
    }

    return false
}

/**
 * Mask sensitive information (IP addresses, hostnames) from provider error messages.
 */
export const maskProviderError = (message: string): string => {
    return message
        .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '[redacted]')
        .replace(/\b[a-zA-Z0-9-]+\.(internal|local|localdomain|corp|lan)\b/g, '[redacted]')
}

/**
 * Sanitize attachment filename to prevent path traversal attacks.
 * Extracts basename after URL-decoding, removes residual traversal sequences and control characters.
 */
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
