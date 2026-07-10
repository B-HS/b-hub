import { getCookie } from 'hono/cookie'
import { tryGetContext } from 'hono/context-storage'

export const ADMIN_THEME_COOKIE = 'admin_theme'
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const THEME_MODES = ['light', 'dark'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

export const isThemeMode = (value: string | undefined): value is ThemeMode => value === 'light' || value === 'dark'

export const sanitizeTheme = (value: string | undefined): ThemeMode => (value === 'light' ? 'light' : 'dark')

export const readAdminTheme = (): ThemeMode | null => {
    const c = tryGetContext()
    if (!c) return null
    const value = getCookie(c, ADMIN_THEME_COOKIE)
    return isThemeMode(value) ? value : null
}
