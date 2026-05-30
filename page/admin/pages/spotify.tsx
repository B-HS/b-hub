import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { AdminShell, Badge, DataTable, FilterBar, Pagination, RowAction, type Column } from '../components'
import { formatDate, maskToken, parseIntOr } from '../format'
import type { AdminContext, AdminGetSession } from '../guard'
import { requireAdminPage } from '../guard'
import type { AdminDb } from '../db'

type AccountRow = Awaited<ReturnType<AdminDb['listSpotifyAccounts']>>['rows'][number]
type KeyRow = Awaited<ReturnType<AdminDb['listSpotifyKeys']>>['rows'][number]
type WidgetRow = Awaited<ReturnType<AdminDb['listSpotifyWidgetTokens']>>['rows'][number]

const AccountsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: AccountRow[]
    total: number
    page: number
    size: number
    q?: string
}> = ({ user, rows, total, page, size, q }) => (
    <AdminShell title='Spotify Accounts' subtitle='연결된 Spotify 계정' user={user} currentPath='/admin/spotify/accounts'>
        <FilterBar
            action='/admin/spotify/accounts'
            fields={[
                { kind: 'text', name: 'q', label: '검색', value: q },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'user', header: 'User', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userEmail}</a> },
                    { key: 'spotifyId', header: 'Spotify ID', cell: (r) => <span class='mono'>{r.spotifyUserId}</span> },
                    { key: 'name', header: 'Display Name', cell: (r) => r.displayName ?? '-' },
                    { key: 'email', header: 'Spotify email', cell: (r) => r.email ?? '-' },
                    {
                        key: 'active',
                        header: 'Active',
                        cell: (r) => (r.isActive ? <Badge kind='success'>active</Badge> : <Badge kind='muted'>off</Badge>),
                    },
                    { key: 'created', header: 'Connected', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                ] as Column<AccountRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, size }} basePath='/admin/spotify/accounts' />
    </AdminShell>
)

const KeysPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: KeyRow[]
    total: number
    page: number
    size: number
    q?: string
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, q, flash }) => (
    <AdminShell title='Spotify API Keys' subtitle='발급된 Spotify API 키' user={user} currentPath='/admin/spotify/keys' flash={flash}>
        <FilterBar
            action='/admin/spotify/keys'
            fields={[
                { kind: 'text', name: 'q', label: 'Name 검색', value: q },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'user', header: 'User', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userId.slice(0, 12)}…</a>, className: 'mono' },
                    { key: 'account', header: 'Spotify Acc', cell: (r) => r.spotifyAccountId, className: 'num' },
                    { key: 'name', header: 'Name', cell: (r) => r.name ?? '-' },
                    { key: 'expires', header: 'Expires', cell: (r) => formatDate(r.expiresAt), className: 'nowrap' },
                    { key: 'lastUsed', header: 'Last used', cell: (r) => formatDate(r.lastUsedAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`/admin/spotify/keys/${r.id}/revoke`}
                                label='취소'
                                variant='destructive'
                                returnTo='/admin/spotify/keys'
                            />
                        ),
                    },
                ] as Column<KeyRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, size }} basePath='/admin/spotify/keys' />
    </AdminShell>
)

const WidgetsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: WidgetRow[]
    total: number
    page: number
    size: number
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, flash }) => (
    <AdminShell title='Spotify Widget Tokens' subtitle='위젯용 토큰' user={user} currentPath='/admin/spotify/widget-tokens' flash={flash}>
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'id', header: 'ID', cell: (r) => r.id, className: 'num' },
                    { key: 'user', header: 'User ID', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userId.slice(0, 12)}…</a>, className: 'mono' },
                    { key: 'account', header: 'Spotify Acc', cell: (r) => r.spotifyAccountId, className: 'num' },
                    { key: 'name', header: 'Name', cell: (r) => r.name ?? '-' },
                    { key: 'token', header: 'Token', cell: (r) => <span class='mono'>{maskToken(r.token)}</span> },
                    {
                        key: 'active',
                        header: 'Active',
                        cell: (r) => (r.isActive ? <Badge kind='success'>active</Badge> : <Badge kind='muted'>off</Badge>),
                    },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`/admin/spotify/widget-tokens/${r.id}/toggle`}
                                label={r.isActive ? '비활성' : '활성'}
                                returnTo='/admin/spotify/widget-tokens'
                            />
                        ),
                    },
                ] as Column<WidgetRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ size }} basePath='/admin/spotify/widget-tokens' />
    </AdminShell>
)

const flashFrom = (c: { req: { query: (k: string) => string | undefined } }) =>
    c.req.query('flash') === 'ok' ? { kind: 'ok' as const, message: '저장되었습니다.' } : null

export const createSpotifyRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/accounts', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 20), 5), 100)
        const q = c.req.query('q')
        const { rows, total } = await deps.adminDb.listSpotifyAccounts({ page, size, q })
        return c.html(<AccountsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} q={q} />)
    })

    app.get('/keys', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 20), 5), 100)
        const q = c.req.query('q')
        const { rows, total } = await deps.adminDb.listSpotifyKeys({ page, size, q })
        return c.html(<KeysPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} q={q} flash={flashFrom(c)} />)
    })

    app.post('/keys/:id/revoke', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        if (id > 0) await deps.adminDb.revokeSpotifyKey(id)
        return c.redirect('/admin/spotify/keys?flash=ok', 303)
    })

    app.get('/widget-tokens', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 20), 5), 100)
        const { rows, total } = await deps.adminDb.listSpotifyWidgetTokens({ page, size })
        return c.html(<WidgetsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} flash={flashFrom(c)} />)
    })

    app.post('/widget-tokens/:id/toggle', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        if (id > 0) await deps.adminDb.toggleSpotifyWidgetToken(id)
        return c.redirect('/admin/spotify/widget-tokens?flash=ok', 303)
    })

    return app
}
