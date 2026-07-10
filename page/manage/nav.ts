export type ManageNavItem = { href: string; label: string }
export type ManageNavGroup = { title: string; items: ManageNavItem[] }

export const MANAGE_NAV: readonly ManageNavGroup[] = [
    {
        title: 'Overview',
        items: [{ href: '/manage', label: 'Overview' }],
    },
    {
        title: 'AI',
        items: [{ href: '/manage/ai/keys', label: 'Provider Keys' }],
    },
    {
        title: 'Access',
        items: [{ href: '/manage/tokens', label: 'API Tokens' }],
    },
    {
        title: 'Weather',
        items: [{ href: '/manage/weather/keys', label: 'API Keys' }],
    },
]

export const isActiveManagePath = (current: string, href: string): boolean => {
    if (href === '/manage') return current === '/manage'
    return current === href || current.startsWith(href + '/')
}
