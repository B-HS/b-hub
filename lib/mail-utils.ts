export const sanitizeHeaderValue = (value: string): string => {
    return value.replace(/[\x00-\x1f\x7f]/g, '')
}

const isAscii = (text: string): boolean => /^[\x20-\x7e]*$/.test(text)

// RFC 2047 encoded-word (=?UTF-8?B?...?=). MIME 헤더에 비ASCII(한글 등)를 안전하게 넣기 위한 인코딩.
// 각 encoded-word는 75 octets 이하 권장이라 코드포인트 단위로 분할(멀티바이트 경계 보존)한다.
export const encodeMimeWord = (text: string): string => {
    if (isAscii(text)) return text

    const words: string[] = []
    let chunk = ''
    for (const ch of [...text]) {
        const candidate = chunk + ch
        // raw 36바이트 → base64 48자 + 오버헤드 12자 = 60자 < 75
        if (Buffer.byteLength(candidate, 'utf-8') > 36 && chunk) {
            words.push(chunk)
            chunk = ch
        } else {
            chunk = candidate
        }
    }
    if (chunk) words.push(chunk)

    return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf-8').toString('base64')}?=`).join(' ')
}

// 메일 주소 헤더(From/To/Cc/Bcc) 한 건을 RFC 호환 형식으로 직렬화한다.
// 표시 이름이 ASCII면 quoted-string, 비ASCII면 RFC 2047 encoded-word(따옴표 없이)를 사용한다.
export const formatMailAddress = (addr: { name?: string; address: string }): string => {
    const name = (addr.name ?? '').replace(/[\x00-\x1f\x7f\r\n]/g, '').slice(0, 256)
    if (!name) return addr.address
    if (isAscii(name)) {
        const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        return `"${escaped}" <${addr.address}>`
    }
    return `${encodeMimeWord(name)} <${addr.address}>`
}

export const sanitizeEmailName = (name: string): string => {
    return name
        .replace(/[\x00-\x1f\x7f\r\n]/g, '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .slice(0, 256)
}

export const escapeHtml = (str: string): string => {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export const htmlToPlainText = (html: string): string => {
    return html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li[^>]*>/gi, '\n- ')
        .replace(/<\/(p|div|li|tr|h[1-6]|table|blockquote|ul|ol)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&amp;/gi, '&')
        .replace(/[ \t]+/g, ' ')
        .replace(/[ \t]*\n[ \t]*/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
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

const LOCAL_FOLDER_REMOTE_ID_PREFIX = '__local_'

export const isLocalMailFolder = (remoteFolderId: string): boolean => remoteFolderId.startsWith(LOCAL_FOLDER_REMOTE_ID_PREFIX)

export const maskProviderError = (message: string): string => {
    return message
        .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '[redacted]')
        .replace(/\b[a-zA-Z0-9-]+\.(internal|local|localdomain|corp|lan)\b/g, '[redacted]')
}

const normalizeMessageIdToken = (token: string): string | null => {
    const trimmed = token.trim()
    if (!trimmed) return null
    const stripped = trimmed.replace(/^</, '').replace(/>$/, '').trim()
    if (!stripped) return null
    return `<${stripped}>`
}

export const extractMessageIdTokens = (raw: string): string[] => {
    const matches = raw.match(/<[^<>\s]+>/g)
    if (matches) return matches.map(normalizeMessageIdToken).filter((t): t is string => t !== null)
    return raw
        .split(/[\s,]+/)
        .map(normalizeMessageIdToken)
        .filter((t): t is string => t !== null)
}

export const deriveThreadId = (params: { references?: string | null; inReplyTo?: string | null; messageIdHeader?: string | null }): string | null => {
    if (params.references) {
        const tokens = extractMessageIdTokens(params.references)
        if (tokens.length > 0) return tokens[0]
    }
    if (params.inReplyTo) {
        const fromInReplyTo = extractMessageIdTokens(params.inReplyTo)
        if (fromInReplyTo.length > 0) return fromInReplyTo[0]
    }
    if (params.messageIdHeader) {
        const fromMessageId = extractMessageIdTokens(params.messageIdHeader)
        if (fromMessageId.length > 0) return fromMessageId[0]
    }
    return null
}

export const sanitizeFilename = (filename: string): string => {
    let decoded: string
    try {
        decoded = decodeURIComponent(filename)
    } catch {
        decoded = filename
    }
    const basename = decoded.split(/[/\\]/).pop() ?? ''
    return (
        basename
            .replace(/\.\./g, '')
            .replace(/[\x00-\x1f\x7f"]/g, '')
            .trim() || 'file'
    ).slice(0, 255)
}
