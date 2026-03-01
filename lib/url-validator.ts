const PRIVATE_IP_RANGES = [/^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^169\.254\./, /^::1$/, /^fc00:/, /^fe80:/, /^fd/]

const BLOCKED_HOSTNAMES = ['localhost', '0.0.0.0', '[::1]']

export const isPublicUrl = (urlString: string) => {
    let url: URL
    try {
        url = new URL(urlString)
    } catch {
        return false
    }

    if (url.protocol !== 'https:') return false

    const hostname = url.hostname.replace(/^\[|\]$/g, '')

    if (BLOCKED_HOSTNAMES.includes(hostname.toLowerCase())) return false

    for (const range of PRIVATE_IP_RANGES) {
        if (range.test(hostname)) return false
    }

    return true
}

const ALLOWED_DOMAINS = ['gumyo.net', 'hyns.dev']

export const isAllowedRedirect = (url: string): boolean => {
    if (url.startsWith('/') && !url.startsWith('//')) return true

    try {
        const { hostname, protocol } = new URL(url)
        if (protocol !== 'https:' && protocol !== 'http:') return false
        return ALLOWED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))
    } catch {
        return false
    }
}
