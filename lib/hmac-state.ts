import { timingSafeEqual } from 'crypto'

export const base64url = (buf: ArrayBuffer) => Buffer.from(buf).toString('base64url')

export const base64urlEncode = (str: string) => Buffer.from(str).toString('base64url')

export const base64urlDecode = (str: string) => Buffer.from(str, 'base64url').toString()

export const hmacSign = async (payload: string, secret: string): Promise<string> => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    return base64url(sig)
}

export const hmacVerify = async (payload: string, signature: string, secret: string): Promise<boolean> => {
    const expected = await hmacSign(payload, secret)
    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
}

export const createOAuthState = async (data: Record<string, unknown>, secret: string, ttlMs: number): Promise<string> => {
    const payload = base64urlEncode(JSON.stringify({ ...data, exp: Date.now() + ttlMs }))
    const sig = await hmacSign(payload, secret)
    return `${payload}.${sig}`
}

export const verifyOAuthState = async <T>(state: string, secret: string): Promise<T & { exp: number }> => {
    const dotIdx = state.indexOf('.')
    if (dotIdx < 0) throw new Error('Invalid state format')

    const payload = state.slice(0, dotIdx)
    const sig = state.slice(dotIdx + 1)

    const valid = await hmacVerify(payload, sig, secret)
    if (!valid) throw new Error('Invalid state signature')

    const data = JSON.parse(base64urlDecode(payload)) as T & { exp: number }
    if (Date.now() > data.exp) throw new Error('State expired')

    return data
}

export const parseStatePayload = <T>(state: string): T | null => {
    try {
        const [payload] = state.split('.')
        if (!payload) return null
        return JSON.parse(base64urlDecode(payload)) as T
    } catch {
        return null
    }
}
