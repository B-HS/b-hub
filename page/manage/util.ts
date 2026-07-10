import { isAppError } from '../../lib/error'

export const emptyToUndefined = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
}

export const parseId = (value: unknown): number | null => {
    const n = Number(value)
    return Number.isInteger(n) && n > 0 ? n : null
}

export const parseCheckbox = (value: unknown): boolean => value === 'true' || value === 'on' || value === '1'

export const parseTriBool = (value: unknown): boolean | undefined => {
    if (value === 'true') return true
    if (value === 'false') return false
    return undefined
}

export const idsFromCsv = (value: unknown): number[] => {
    if (typeof value !== 'string') return []
    return value
        .split(/[\n,;]/)
        .map((s) => parseId(s.trim()))
        .filter((n): n is number => n !== null)
}

export const parseEmailList = (value: unknown): { name: string; address: string }[] => {
    if (typeof value !== 'string') return []
    return value
        .split(/[\n,;]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((address) => ({ name: '', address }))
}

const FLASH_CODE_BY_APP_ERROR: Record<string, string> = {
    FORBIDDEN: 'forbidden',
    VALIDATION_ERROR: 'validation',
}

export const errorToFlashCode = (error: unknown): string => {
    if (!isAppError(error)) return 'unknown'
    const { code } = error
    if (FLASH_CODE_BY_APP_ERROR[code]) return FLASH_CODE_BY_APP_ERROR[code]
    if (code.endsWith('NOT_FOUND')) return 'not_found'
    if (
        code.endsWith('DUPLICATE') ||
        code.endsWith('HAS_EVENTS') ||
        code.endsWith('CIRCULAR_REF') ||
        code.endsWith('QUOTA_EXCEEDED') ||
        code.endsWith('LIMIT_EXCEEDED')
    ) {
        return 'conflict'
    }
    return 'unknown'
}
