import { getCookie } from 'hono/cookie'
import { tryGetContext } from 'hono/context-storage'
import { isThemeMode, sanitizeTheme, type ThemeMode } from '../admin/theme'

export const MANAGE_THEME_COOKIE = 'manage_theme'

export const readManageTheme = (): ThemeMode | null => {
    const c = tryGetContext()
    if (!c) return null
    const value = getCookie(c, MANAGE_THEME_COOKIE)
    return isThemeMode(value) ? value : null
}

export { sanitizeTheme }
export type { ThemeMode }
