import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { AdminShell, Badge, DataTable, FilterBar, Pagination, RowAction, type Column } from '../components'
import { flashPath, parseFlash } from '../flash'
import { formatDate, maskToken, parseDateEnd, parseDateStart, parseIntOr, truncate } from '../format'

const sanitizeReturn = (raw: unknown, fallback: string): string => {
    const v = typeof raw === 'string' ? raw : ''
    return v.startsWith('/admin') ? v : fallback
}

import type { AdminContext, AdminGetSession } from '../guard'
import { requireAdminPage } from '../guard'
import type { AdminDb } from '../db'

type TokenRow = Awaited<ReturnType<AdminDb['listApiTokens']>>['rows'][number]
type LogRow = Awaited<ReturnType<AdminDb['listApiLogs']>>['rows'][number]

const TokensPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: TokenRow[]
    total: number
    page: number
    size: number
    q?: string
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, q, flash }) => (
    <AdminShell title='API Tokens' subtitle='사용자별 발급된 API 토큰' user={user} currentPath='/admin/api/tokens' flash={flash}>
        <FilterBar
            action='/admin/api/tokens'
            fields={[
                { kind: 'text', name: 'q', label: '검색 (email or token name)', value: q },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'user', header: 'User', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userEmail}</a> },
                    { key: 'name', header: 'Name', cell: (r) => r.name ?? '-' },
                    { key: 'token', header: 'Token', cell: (r) => <span class='mono'>{maskToken(r.token)}</span> },
                    { key: 'expires', header: 'Expires', cell: (r) => formatDate(r.expiresAt), className: 'nowrap' },
                    { key: 'lastUsed', header: 'Last used', cell: (r) => formatDate(r.lastUsedAt), className: 'nowrap' },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'action',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`/admin/api/tokens/${r.id}/revoke`}
                                label='취소'
                                variant='destructive'
                                returnTo={`/admin/api/tokens?page=${page}&size=${size}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                            />
                        ),
                    },
                ] as Column<TokenRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, size }} basePath='/admin/api/tokens' />
    </AdminShell>
)

const LogsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: LogRow[]
    total: number
    page: number
    size: number
    status?: string
    path?: string
    userId?: string
    from?: string
    to?: string
}> = ({ user, rows, total, page, size, status, path, userId, from, to }) => (
    <AdminShell title='Request Logs' subtitle='/api/* 요청 로그' user={user} currentPath='/admin/api/logs'>
        <FilterBar
            action='/admin/api/logs'
            fields={[
                { kind: 'text', name: 'path', label: 'Path', value: path, placeholder: '/api/...' },
                { kind: 'number', name: 'status', label: 'Status', value: status },
                { kind: 'text', name: 'userId', label: 'User ID', value: userId },
                { kind: 'date', name: 'from', label: 'From', value: from },
                { kind: 'date', name: 'to', label: 'To', value: to },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'time', header: 'Time', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    { key: 'method', header: 'Method', cell: (r) => r.method, className: 'mono nowrap' },
                    { key: 'path', header: 'Path', cell: (r) => <span class='mono'>{truncate(r.path, 80)}</span>, className: 'truncate' },
                    {
                        key: 'status',
                        header: 'Status',
                        cell: (r) => (
                            <Badge kind={r.statusCode >= 500 ? 'destructive' : r.statusCode >= 400 ? 'outline' : 'success'}>{r.statusCode}</Badge>
                        ),
                    },
                    { key: 'user', header: 'User', cell: (r) => (r.userId ? <a href={`/admin/users/${r.userId}`}>{r.userId.slice(0, 8)}…</a> : '-') },
                    { key: 'ip', header: 'IP', cell: (r) => r.ip ?? '-', className: 'mono nowrap' },
                    { key: 'duration', header: 'ms', cell: (r) => r.durationMs ?? '-', className: 'num' },
                    { key: 'error', header: 'Error', cell: (r) => r.errorCode ?? '-' },
                ] as Column<LogRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ path, status, userId, from, to, size }} basePath='/admin/api/logs' />
    </AdminShell>
)

export const createApiTokensRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 20), 5), 100)
        const q = c.req.query('q')
        const { rows, total } = await deps.adminDb.listApiTokens({ page, size, q })
        const flash = parseFlash(c)
        return c.html(<TokensPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} q={q} flash={flash} />)
    })

    app.post('/:id/revoke', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        const body = await c.req.parseBody<{ returnTo?: string }>()
        if (id > 0) await deps.adminDb.revokeApiToken(id)
        return c.redirect(flashPath(sanitizeReturn(body.returnTo, '/admin/api/tokens')), 303)
    })

    return app
}

export const createApiLogsRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200)
        const path = c.req.query('path')
        const status = c.req.query('status')
        const userId = c.req.query('userId')
        const from = c.req.query('from')
        const to = c.req.query('to')
        const { rows, total } = await deps.adminDb.listApiLogs({
            page,
            size,
            status: status ? parseIntOr(status, 0) || undefined : undefined,
            path,
            userId,
            from: parseDateStart(from),
            to: parseDateEnd(to),
        })
        return c.html(
            <LogsPage
                user={c.get('adminUser')}
                rows={rows}
                total={total}
                page={page}
                size={size}
                status={status}
                path={path}
                userId={userId}
                from={from}
                to={to}
            />,
        )
    })

    return app
}
