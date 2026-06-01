import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { AdminShell, Badge, DataTable, FilterBar, Pagination, RowAction, type Column } from '../components'
import { formatDate, parseDateEnd, parseDateStart, parseIntOr, truncate } from '../format'
import type { AdminContext, AdminGetSession } from '../guard'
import { requireAdminPage } from '../guard'
import type { AdminDb } from '../db'

const sanitizeReturn = (raw: unknown, fallback: string): string => {
    const v = typeof raw === 'string' ? raw : ''
    return v.startsWith('/admin') ? v : fallback
}

const appendFlash = (path: string): string => path + (path.includes('?') ? '&' : '?') + 'flash=ok'

type LogEventRow = Awaited<ReturnType<AdminDb['listLogEvents']>>['rows'][number]

const severityKind = (sev: number) => (sev >= 40 ? 'destructive' : sev >= 30 ? 'outline' : 'success')

const severityLabel = (sev: number) => (sev >= 50 ? 'FATAL' : sev >= 40 ? 'ERROR' : sev >= 30 ? 'WARN' : sev >= 20 ? 'INFO' : 'DEBUG')

const LogEventsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: LogEventRow[]
    total: number
    page: number
    size: number
    service?: string
    severity?: string
    deviceId?: string
    unresolved?: string
    from?: string
    to?: string
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, service, severity, deviceId, unresolved, from, to, flash }) => (
    <AdminShell title='Log Events' subtitle='b-hub 통합 에러·이벤트 로그' user={user} currentPath='/admin/logs' flash={flash}>
        <FilterBar
            action='/admin/logs'
            fields={[
                { kind: 'text', name: 'service', label: 'Service', value: service, placeholder: 'b-hub-...' },
                {
                    kind: 'select',
                    name: 'severity',
                    label: 'Min severity',
                    value: severity,
                    options: [
                        { value: '', label: 'All' },
                        { value: '30', label: 'WARN+' },
                        { value: '40', label: 'ERROR+' },
                        { value: '50', label: 'FATAL' },
                    ],
                },
                { kind: 'text', name: 'deviceId', label: 'Device', value: deviceId },
                {
                    kind: 'select',
                    name: 'unresolved',
                    label: 'Resolved',
                    value: unresolved,
                    options: [
                        { value: '', label: 'All' },
                        { value: 'y', label: 'Unresolved' },
                        { value: 'n', label: 'Resolved' },
                    ],
                },
                { kind: 'date', name: 'from', label: 'From', value: from },
                { kind: 'date', name: 'to', label: 'To', value: to },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='로그 이벤트가 없습니다.'
            columns={
                [
                    { key: 'time', header: 'Time', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    { key: 'severity', header: 'Severity', cell: (r) => <Badge kind={severityKind(r.severity)}>{severityLabel(r.severity)}</Badge> },
                    { key: 'service', header: 'Service', cell: (r) => <span class='mono'>{r.service}</span>, className: 'nowrap' },
                    { key: 'code', header: 'Error Code', cell: (r) => <span class='mono'>{r.errorCode}</span> },
                    { key: 'desc', header: 'Description', cell: (r) => truncate(r.errorDescription, 70), className: 'truncate' },
                    { key: 'device', header: 'Device', cell: (r) => r.deviceId ?? '-', className: 'mono nowrap' },
                    { key: 'resolved', header: 'Resolved', cell: (r) => (r.resolvedAt ? formatDate(r.resolvedAt) : '-'), className: 'nowrap' },
                    {
                        key: 'action',
                        header: '',
                        cell: (r) =>
                            r.resolvedAt ? (
                                '-'
                            ) : (
                                <RowAction
                                    action={`/admin/logs/${r.id}/resolve`}
                                    label='해소'
                                    returnTo={`/admin/logs?page=${page}&size=${size}${service ? `&service=${encodeURIComponent(service)}` : ''}${severity ? `&severity=${severity}` : ''}`}
                                />
                            ),
                    },
                ] as Column<LogEventRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ service, severity, deviceId, unresolved, from, to, size }} basePath='/admin/logs' />
    </AdminShell>
)

export const createLogEventsRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200)
        const service = c.req.query('service')
        const severity = c.req.query('severity')
        const deviceId = c.req.query('deviceId')
        const unresolved = c.req.query('unresolved')
        const from = c.req.query('from')
        const to = c.req.query('to')
        const { rows, total } = await deps.adminDb.listLogEvents({
            page,
            size,
            service: service || undefined,
            severityGte: severity ? parseIntOr(severity, 0) || undefined : undefined,
            deviceId: deviceId || undefined,
            unresolved: unresolved === 'y' ? 'y' : unresolved === 'n' ? 'n' : undefined,
            from: parseDateStart(from),
            to: parseDateEnd(to),
        })
        const flash = c.req.query('flash') === 'ok' ? { kind: 'ok' as const, message: '해소 처리되었습니다.' } : null
        return c.html(
            <LogEventsPage
                user={c.get('adminUser')}
                rows={rows}
                total={total}
                page={page}
                size={size}
                service={service}
                severity={severity}
                deviceId={deviceId}
                unresolved={unresolved}
                from={from}
                to={to}
                flash={flash}
            />,
        )
    })

    app.post('/:id/resolve', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        const body = await c.req.parseBody<{ returnTo?: string }>()
        if (id > 0) await deps.adminDb.resolveLogEvent(id)
        return c.redirect(appendFlash(sanitizeReturn(body.returnTo, '/admin/logs')), 303)
    })

    return app
}
