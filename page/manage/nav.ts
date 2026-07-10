export type ManageNavItem = { href: string; label: string }
export type ManageNavGroup = { title: string; items: ManageNavItem[] }

export const MANAGE_NAV: readonly ManageNavGroup[] = [
    {
        title: 'Overview',
        items: [{ href: '/manage', label: 'Overview' }],
    },
    {
        title: 'Mail',
        items: [
            { href: '/manage/mail/accounts', label: 'Accounts' },
            { href: '/manage/mail/messages', label: 'Messages' },
            { href: '/manage/mail/sync', label: 'Sync' },
        ],
    },
    {
        title: 'Calendar',
        items: [
            { href: '/manage/calendar/events', label: 'Events' },
            { href: '/manage/calendar/groups', label: 'Groups' },
            { href: '/manage/calendar/subscription', label: 'Subscription' },
        ],
    },
    {
        title: 'Drive',
        items: [
            { href: '/manage/drive/folders', label: 'Folders' },
            { href: '/manage/drive/assets', label: 'Assets' },
        ],
    },
    {
        title: 'Resume',
        items: [{ href: '/manage/resume', label: 'Resumes' }],
    },
    {
        title: 'Spotify',
        items: [
            { href: '/manage/spotify/accounts', label: 'Accounts' },
            { href: '/manage/spotify/keys', label: 'API Keys' },
            { href: '/manage/spotify/widget-tokens', label: 'Widget Tokens' },
        ],
    },
    {
        title: 'AI',
        items: [{ href: '/manage/ai/providers', label: 'Providers' }],
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
