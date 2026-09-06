import { lookup } from 'dns/promises'

const BLOCKED_IPV4_RANGES = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^0\./,
    /^169\.254\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
    /^(22[4-9]|23\d)\./,
    /^255\.255\.255\.255$/,
]

const BLOCKED_IPV6_PATTERNS = [/^::1$/, /^::$/, /^fc/, /^fd/, /^fe[89ab]/, /^ff/]

const BLOCKED_HOSTNAMES = ['localhost', '0.0.0.0']

const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/
const IPV4_MAPPED_DOTTED_PATTERN = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/
const IPV4_MAPPED_HEX_PATTERN = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/

const HEX_RADIX = 16
const OCTET_SHIFT = 8
const OCTET_MASK = 0xff

const toIpv4Mapped = (host: string) => {
    const dotted = host.match(IPV4_MAPPED_DOTTED_PATTERN)
    if (dotted) return dotted[1]

    const hex = host.match(IPV4_MAPPED_HEX_PATTERN)
    if (!hex) return null

    const high = parseInt(hex[1], HEX_RADIX)
    const low = parseInt(hex[2], HEX_RADIX)
    return [high >> OCTET_SHIFT, high & OCTET_MASK, low >> OCTET_SHIFT, low & OCTET_MASK].join('.')
}

const normalizeHost = (host: string) => host.replace(/^\[|\]$/g, '').toLowerCase()

/**
 * Detects loopback, private, link-local, CGNAT, multicast and reserved addresses,
 * including IPv4-mapped IPv6 forms such as `::ffff:127.0.0.1`.
 */
export const isPrivateAddress = (address: string) => {
    const host = normalizeHost(address)
    if (BLOCKED_HOSTNAMES.includes(host)) return true

    const target = toIpv4Mapped(host) ?? host
    if (host.includes(':') && !IPV4_PATTERN.test(target)) return BLOCKED_IPV6_PATTERNS.some((pattern) => pattern.test(host))

    return BLOCKED_IPV4_RANGES.some((range) => range.test(target))
}

export const isPublicUrl = (urlString: string) => {
    let url: URL
    try {
        url = new URL(urlString)
    } catch {
        return false
    }

    if (url.protocol !== 'https:') return false

    return !isPrivateAddress(url.hostname)
}

export type AddressLookup = (hostname: string) => Promise<Array<{ address: string }>>

const defaultLookup: AddressLookup = (hostname) => lookup(hostname, { all: true })

/**
 * Same as isPublicUrl, but also resolves the hostname and rejects when any
 * resolved address points at a private range (DNS rebinding defence).
 */
export const isPublicUrlResolved = async (urlString: string, lookupFn: AddressLookup = defaultLookup) => {
    if (!isPublicUrl(urlString)) return false

    const host = normalizeHost(new URL(urlString).hostname)
    if (IPV4_PATTERN.test(host) || host.includes(':')) return true

    try {
        const addresses = await lookupFn(host)
        if (addresses.length === 0) return false
        return addresses.every((entry) => !isPrivateAddress(entry.address))
    } catch {
        return false
    }
}

const ALLOWED_DOMAINS = ['gumyo.net', 'hyns.dev']

export const isAllowedRedirect = (url: string): boolean => {
    if (url.startsWith('/')) return !url.startsWith('//') && !url.startsWith('/\\')

    try {
        const { hostname, protocol } = new URL(url)
        if (protocol !== 'https:' && protocol !== 'http:') return false
        return ALLOWED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))
    } catch {
        return false
    }
}
