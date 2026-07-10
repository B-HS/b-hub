import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { AdminShell, DataTable, FilterBar, Pagination, RowAction, type Column } from '../components'
import { flashPath, parseFlash } from '../flash'
import { formatDate, parseIntOr } from '../format'
import type { AdminContext, AdminGetSession } from '../guard'
import { requireAdminPage } from '../guard'
import type { AdminDb } from '../db'

type Row = Awaited<ReturnType<AdminDb['listSessions']>>['rows'][number]

const SessionsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: Row[]
    total: number
    page: number
    size: number
    q?: string
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, q, flash }) => (
    <AdminShell title='Sessions' subtitle='전체 사용자의 활성 세션' user={user} currentPath='/admin/sessions' flash={flash}>
        <FilterBar
            action='/admin/sessions'
            fields={[
                { kind: 'text', name: 'q', label: '이메일 검색', value: q },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'user', header: 'User', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userEmail}</a> },
                    { key: 'ip', header: 'IP', cell: (r) => r.ipAddress ?? '-', className: 'mono nowrap' },
                    { key: 'ua', header: 'User Agent', cell: (r) => r.userAgent ?? '-', className: 'truncate' },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    { key: 'expires', header: 'Expires', cell: (r) => formatDate(r.expiresAt), className: 'nowrap' },
                    {
                        key: 'action',
                        header: '',
                        cell: (r) => {
                            const back = `/admin/sessions?page=${page}&size=${size}${q ? `&q=${encodeURIComponent(q)}` : ''}`
                            return (
                                <div class='row-actions'>
                                    <RowAction action={`/admin/sessions/${r.id}/revoke`} label='강제 만료' variant='destructive' returnTo={back} />
                                    <RowAction
                                        action={`/admin/sessions/user/${r.userId}/revoke-all`}
                                        label='전체 만료'
                                        variant='destructive'
                                        returnTo={back}
                                    />
                                </div>
                            )
                        },
                    },
                ] as Column<Row>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, size }} basePath='/admin/sessions' />
    </AdminShell>
)

const sanitizeReturn = (raw: unknown, fallback: string): string => {
    const v = typeof raw === 'string' ? raw : ''
    return v.startsWith('/admin') ? v : fallback
}

export const createSessionsRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 20), 5), 100)
        const q = c.req.query('q')
        const { rows, total } = await deps.adminDb.listSessions({ page, size, q })
        const flash = parseFlash(c)
        return c.html(<SessionsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} q={q} flash={flash} />)
    })

    app.post('/user/:userId/revoke-all', async (c) => {
        const userId = c.req.param('userId')
        const body = await c.req.parseBody<{ returnTo?: string }>()
        await deps.adminDb.revokeAllUserSessions(userId)
        const back = sanitizeReturn(body.returnTo, '/admin/sessions')
        return c.redirect(flashPath(back), 303)
    })

    app.post('/:id/revoke', async (c) => {
        const id = c.req.param('id')
        const body = await c.req.parseBody<{ returnTo?: string }>()
        await deps.adminDb.revokeSession(id)
        const back = sanitizeReturn(body.returnTo, '/admin/sessions')
        return c.redirect(flashPath(back), 303)
    })

    return app
}
