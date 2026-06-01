export type NavItem = { href: string; label: string }
export type NavGroup = { title: string; items: NavItem[] }

export const NAV: readonly NavGroup[] = [
    {
        title: 'Overview',
        items: [{ href: '/admin', label: 'Dashboard' }],
    },
    {
        title: 'Identity',
        items: [
            { href: '/admin/users', label: 'Users' },
            { href: '/admin/sessions', label: 'Sessions' },
            { href: '/admin/api/tokens', label: 'API Tokens' },
            { href: '/admin/api/logs', label: 'Request Logs' },
        ],
    },
    {
        title: 'Blog',
        items: [
            { href: '/admin/blog/posts', label: 'Posts' },
            { href: '/admin/blog/comments', label: 'Comments' },
            { href: '/admin/blog/categories', label: 'Categories' },
            { href: '/admin/blog/tags', label: 'Tags' },
            { href: '/admin/blog/images', label: 'Images' },
        ],
    },
    {
        title: 'Social',
        items: [
            { href: '/admin/messages', label: 'Messages' },
            { href: '/admin/messages/follows', label: 'Follows' },
        ],
    },
    {
        title: 'Weather',
        items: [
            { href: '/admin/weather/keys', label: 'API Keys' },
            { href: '/admin/weather/logs', label: 'Request Logs' },
            { href: '/admin/weather/cache', label: 'Forecast Cache' },
        ],
    },
    {
        title: 'Mail',
        items: [
            { href: '/admin/mail/accounts', label: 'Accounts' },
            { href: '/admin/mail/sync-sessions', label: 'Sync Sessions' },
            { href: '/admin/mail/sync-logs', label: 'Sync Logs' },
            { href: '/admin/mail/messages', label: 'Messages' },
            { href: '/admin/mail/uploads', label: 'Uploads' },
        ],
    },
    {
        title: 'Spotify',
        items: [
            { href: '/admin/spotify/accounts', label: 'Accounts' },
            { href: '/admin/spotify/keys', label: 'API Keys' },
            { href: '/admin/spotify/widget-tokens', label: 'Widget Tokens' },
        ],
    },
    {
        title: 'Observability',
        items: [{ href: '/admin/logs', label: 'Log Events' }],
    },
    {
        title: 'Other',
        items: [
            { href: '/admin/resumes', label: 'Resumes' },
            { href: '/admin/calendar/events', label: 'Calendar Events' },
            { href: '/admin/calendar/groups', label: 'Calendar Groups' },
            { href: '/admin/calendar/subscriptions', label: 'Calendar Subs' },
            { href: '/admin/calendar/deleted', label: 'Calendar Tombstones' },
            { href: '/admin/drive/assets', label: 'Drive Assets' },
            { href: '/admin/drive/folders', label: 'Drive Folders' },
            { href: '/admin/drive/lifecycle-logs', label: 'Drive Lifecycle' },
        ],
    },
]

export const isActivePath = (current: string, href: string): boolean => {
    if (href === '/admin') return current === '/admin'
    return current === href || current.startsWith(href + '/')
}
