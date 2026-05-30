import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { AdminShell, Badge, DataTable, FilterBar, Pagination, RowAction, Stat, type Column } from '../components'
import { formatDate, maskToken, parseDateEnd, parseDateStart, parseIntOr } from '../format'
import type { AdminContext, AdminGetSession } from '../guard'
import { requireAdminPage } from '../guard'
import type { AdminDb } from '../db'

type KeyRow = Awaited<ReturnType<AdminDb['listWeatherKeys']>>['rows'][number]
type LogRow = Awaited<ReturnType<AdminDb['listWeatherLogs']>>['rows'][number]
type Grid = Awaited<ReturnType<AdminDb['weatherCacheGrids']>>[number]

const KeysPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: KeyRow[]
    total: number
    page: number
    size: number
    q?: string
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, q, flash }) => (
    <AdminShell title='Weather API Keys' subtitle='기상 API 키 발급 현황' user={user} currentPath='/admin/weather/keys' flash={flash}>
        <FilterBar
            action='/admin/weather/keys'
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
                    { key: 'name', header: 'Name', cell: (r) => r.name ?? '-' },
                    { key: 'token', header: 'Token', cell: (r) => <span class='mono'>{maskToken(r.token)}</span> },
                    { key: 'limit', header: 'Daily limit', cell: (r) => r.dailyLimit, className: 'num' },
                    { key: 'last', header: 'Last used', cell: (r) => formatDate(r.lastUsedAt), className: 'nowrap' },
                    { key: 'exp', header: 'Expires', cell: (r) => formatDate(r.expiresAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction action={`/admin/weather/keys/${r.id}/revoke`} label='취소' variant='destructive' returnTo='/admin/weather/keys' />
                        ),
                    },
                ] as Column<KeyRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, size }} basePath='/admin/weather/keys' />
    </AdminShell>
)

const LogsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: LogRow[]
    total: number
    page: number
    size: number
    status?: string
    endpoint?: string
    userId?: string
    from?: string
    to?: string
}> = ({ user, rows, total, page, size, status, endpoint, userId, from, to }) => (
    <AdminShell title='Weather Logs' subtitle='기상 API 호출 로그' user={user} currentPath='/admin/weather/logs'>
        <FilterBar
            action='/admin/weather/logs'
            fields={[
                { kind: 'text', name: 'endpoint', label: 'Endpoint', value: endpoint },
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
                    { key: 'endpoint', header: 'Endpoint', cell: (r) => r.endpoint, className: 'mono' },
                    { key: 'grid', header: 'Grid', cell: (r) => `${r.nx ?? '-'},${r.ny ?? '-'}`, className: 'mono' },
                    {
                        key: 'status',
                        header: 'Status',
                        cell: (r) => <Badge kind={r.statusCode >= 500 ? 'destructive' : r.statusCode >= 400 ? 'outline' : 'success'}>{r.statusCode}</Badge>,
                    },
                    { key: 'dur', header: 'ms', cell: (r) => r.durationMs ?? '-', className: 'num' },
                    { key: 'err', header: 'Error', cell: (r) => r.errorCode ?? '-' },
                ] as Column<LogRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ endpoint, status, userId, from, to, size }} basePath='/admin/weather/logs' />
    </AdminShell>
)

const CachePage: FC<{
    user: import('../guard').AdminSessionUser
    summary: Awaited<ReturnType<AdminDb['weatherCacheSummary']>>
    grids: Grid[]
}> = ({ user, summary, grids }) => (
    <AdminShell title='Weather Cache' subtitle='격자별 캐시 상태' user={user} currentPath='/admin/weather/cache'>
        <div class='cards-grid'>
            <Stat label='Current rows' value={summary.current} />
            <Stat label='Ultra rows' value={summary.ultra} />
            <Stat label='Short rows' value={summary.short} />
        </div>
        <DataTable
            rows={grids}
            rowKey={(r) => `${r.nx}-${r.ny}`}
            empty='캐시된 격자 없음.'
            columns={
                [
                    { key: 'grid', header: 'Grid (nx,ny)', cell: (r) => `${r.nx}, ${r.ny}`, className: 'mono' },
                    { key: 'date', header: 'Last base date', cell: (r) => r.lastBaseDate, className: 'mono' },
                    { key: 'time', header: 'Last base time', cell: (r) => r.lastBaseTime, className: 'mono' },
                    { key: 'rows', header: 'Rows', cell: (r) => r.rows, className: 'num' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`/admin/weather/cache/${r.nx}/${r.ny}/drop`}
                                label='drop'
                                variant='destructive'
                                returnTo='/admin/weather/cache'
                            />
                        ),
                    },
                ] as Column<Grid>[]
            }
        />
    </AdminShell>
)

const flashFrom = (c: { req: { query: (k: string) => string | undefined } }) =>
    c.req.query('flash') === 'ok' ? { kind: 'ok' as const, message: '저장되었습니다.' } : null

export const createWeatherRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/keys', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 20), 5), 100)
        const q = c.req.query('q')
        const { rows, total } = await deps.adminDb.listWeatherKeys({ page, size, q })
        return c.html(<KeysPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} q={q} flash={flashFrom(c)} />)
    })

    app.post('/keys/:id/revoke', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        if (id > 0) await deps.adminDb.revokeWeatherKey(id)
        return c.redirect('/admin/weather/keys?flash=ok', 303)
    })

    app.get('/logs', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200)
        const status = c.req.query('status')
        const endpoint = c.req.query('endpoint')
        const userId = c.req.query('userId')
        const from = c.req.query('from')
        const to = c.req.query('to')
        const { rows, total } = await deps.adminDb.listWeatherLogs({
            page,
            size,
            status: status ? parseIntOr(status, 0) || undefined : undefined,
            endpoint,
            userId,
            from: parseDateStart(from),
            to: parseDateEnd(to),
        })
        return c.html(
            <LogsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} status={status} endpoint={endpoint} userId={userId} from={from} to={to} />,
        )
    })

    app.get('/cache', async (c) => {
        const [summary, grids] = await Promise.all([deps.adminDb.weatherCacheSummary(), deps.adminDb.weatherCacheGrids()])
        return c.html(<CachePage user={c.get('adminUser')} summary={summary} grids={grids} />)
    })

    app.post('/cache/:nx/:ny/drop', async (c) => {
        const nx = parseIntOr(c.req.param('nx'), 0)
        const ny = parseIntOr(c.req.param('ny'), 0)
        if (nx > 0 && ny > 0) await deps.adminDb.deleteWeatherCacheGrid(nx, ny)
        return c.redirect('/admin/weather/cache?flash=ok', 303)
    })

    return app
}
