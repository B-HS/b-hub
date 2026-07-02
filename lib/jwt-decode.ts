export const decodeJwtPayloadUnverified = (jwt: string): Record<string, unknown> | null => {
    const parts = jwt.split('.')
    if (parts.length < 2) return null
    try {
        const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
        const parsed = JSON.parse(json)
        if (typeof parsed !== 'object' || parsed === null) return null
        return parsed as Record<string, unknown>
    } catch {
        return null
    }
}

export const getJwtExpiryMs = (jwt: string): number | null => {
    const payload = decodeJwtPayloadUnverified(jwt)
    const exp = payload?.exp
    return typeof exp === 'number' ? exp * 1000 : null
}
