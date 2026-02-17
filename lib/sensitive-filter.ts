const SENSITIVE_KEYS = [
    'password',
    'passwd',
    'pwd',
    'secret',
    'token',
    'apitoken',
    'api_token',
    'authtoken',
    'auth_token',
    'authorization',
    'key',
    'apikey',
    'api_key',
    'access_token',
    'refresh_token',
    'credential',
    'private',
]

const REDACTED_VALUE = '[REDACTED]'

export const isSensitiveKey = (key: string): boolean => {
    const lowerKey = key.toLowerCase()
    return SENSITIVE_KEYS.some((sensitiveKey) => lowerKey.includes(sensitiveKey))
}

export const filterSensitiveData = (data: Record<string, string> | null): Record<string, string> | null => {
    if (!data) return null

    const filtered: Record<string, string> = {}

    for (const [key, value] of Object.entries(data)) {
        filtered[key] = isSensitiveKey(key) ? REDACTED_VALUE : value
    }

    return filtered
}
