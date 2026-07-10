import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { AdminShell, Badge, DataTable, FilterBar, Pagination, RowAction, type Column } from '../components'
import { parseFlash } from '../flash'
import { formatDate, maskToken, parseDateEnd, parseDateStart, parseIntOr } from '../format'
import type { AdminContext, AdminGetSession } from '../guard'
import { requireAdminPage } from '../guard'
import type { AdminDb } from '../db'

type GroupRow = Awaited<ReturnType<AdminDb['listCalendarGroups']>>['rows'][number]
type EventRow = Awaited<ReturnType<AdminDb['listCalendarEvents']>>['rows'][number]
type SubRow = Awaited<ReturnType<AdminDb['listCalendarSubscriptions']>>['rows'][number]
type DeletedRow = Awaited<ReturnType<AdminDb['listDeletedCalendarEvents']>>['rows'][number]

const GroupsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: GroupRow[]
    total: number
    page: number
    size: number
}> = ({ user, rows, total, page, size }) => (
    <AdminShell title='Calendar Groups' subtitle='달력 그룹' user={user} currentPath='/admin/calendar/groups'>
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'id', header: 'ID', cell: (r) => <span class='mono'>{r.id.slice(0, 8)}…</span> },
                    { key: 'user', header: 'User', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userEmail ?? r.userId}</a> },
                    { key: 'name', header: 'Name', cell: (r) => r.name },
                    {
                        key: 'color',
                        header: 'Color',
                        cell: (r) => (
                            <span class='inline-hstack'>
                                <span class='color-dot' style={`background:${r.color}`} />
                                <span class='mono'>{r.color}</span>
                            </span>
                        ),
                    },
                    { key: 'order', header: 'Order', cell: (r) => r.sortOrder, className: 'num' },
                    {
                        key: 'visible',
                        header: 'Visible',
                        cell: (r) => (r.isVisible ? <Badge kind='success'>visible</Badge> : <Badge kind='muted'>hidden</Badge>),
                    },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                ] as Column<GroupRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ size }} basePath='/admin/calendar/groups' />
    </AdminShell>
)

const EventsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: EventRow[]
    total: number
    page: number
    size: number
    q?: string
    userId?: string
    from?: string
    to?: string
}> = ({ user, rows, total, page, size, q, userId, from, to }) => (
    <AdminShell title='Calendar Events' subtitle='달력 이벤트' user={user} currentPath='/admin/calendar/events'>
        <FilterBar
            action='/admin/calendar/events'
            fields={[
                { kind: 'text', name: 'q', label: 'Summary 검색', value: q },
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
                    { key: 'user', header: 'User', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userEmail ?? r.userId}</a> },
                    { key: 'summary', header: 'Summary', cell: (r) => r.summary, className: 'truncate' },
                    { key: 'start', header: 'Start', cell: (r) => formatDate(r.dtstart), className: 'nowrap' },
                    { key: 'end', header: 'End', cell: (r) => formatDate(r.dtend), className: 'nowrap' },
                    { key: 'allDay', header: 'All day', cell: (r) => (r.isAllDay ? 'yes' : '-') },
                    { key: 'group', header: 'Group', cell: (r) => r.groupName ?? '-' },
                    {
                        key: 'status',
                        header: 'Status',
                        cell: (r) => (
                            <Badge kind={r.status === 'CANCELLED' ? 'destructive' : r.status === 'TENTATIVE' ? 'outline' : 'secondary'}>
                                {r.status ?? '-'}
                            </Badge>
                        ),
                    },
                ] as Column<EventRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, userId, from, to, size }} basePath='/admin/calendar/events' />
    </AdminShell>
)

const SubsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: SubRow[]
    total: number
    page: number
    size: number
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, flash }) => (
    <AdminShell title='Calendar Subscriptions' subtitle='달력 외부 구독 토큰' user={user} currentPath='/admin/calendar/subscriptions' flash={flash}>
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'user', header: 'User', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userEmail ?? r.userId}</a> },
                    { key: 'name', header: 'Name', cell: (r) => r.name ?? '-' },
                    { key: 'token', header: 'Token', cell: (r) => <span class='mono'>{maskToken(r.token)}</span> },
                    {
                        key: 'active',
                        header: 'Active',
                        cell: (r) => (r.isActive ? <Badge kind='success'>active</Badge> : <Badge kind='muted'>revoked</Badge>),
                    },
                    { key: 'last', header: 'Last access', cell: (r) => formatDate(r.lastAccessedAt), className: 'nowrap' },
                    { key: 'ctag', header: 'CTag', cell: (r) => <span class='mono'>{r.ctag}</span> },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) =>
                            r.isActive ? (
                                <RowAction
                                    action={`/admin/calendar/subscriptions/${r.id}/revoke`}
                                    label='취소'
                                    variant='destructive'
                                    returnTo='/admin/calendar/subscriptions'
                                />
                            ) : (
                                <span class='mono text-muted'>—</span>
                            ),
                    },
                ] as Column<SubRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ size }} basePath='/admin/calendar/subscriptions' />
    </AdminShell>
)

const DeletedPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: DeletedRow[]
    total: number
    page: number
    size: number
}> = ({ user, rows, total, page, size }) => (
    <AdminShell title='Calendar Tombstones' subtitle='삭제된 이벤트 추적 (sync token용)' user={user} currentPath='/admin/calendar/deleted'>
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'user', header: 'User', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userEmail ?? r.userId}</a> },
                    { key: 'uid', header: 'UID', cell: (r) => <span class='mono'>{r.uid}</span>, className: 'truncate' },
                    { key: 'syncToken', header: 'Sync token', cell: (r) => <span class='mono'>{r.syncToken.slice(0, 12)}…</span> },
                    { key: 'deletedAt', header: 'Deleted', cell: (r) => formatDate(r.deletedAt), className: 'nowrap' },
                ] as Column<DeletedRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ size }} basePath='/admin/calendar/deleted' />
    </AdminShell>
)

export const createCalendarRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/groups', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 20), 5), 100)
        const { rows, total } = await deps.adminDb.listCalendarGroups({ page, size })
        return c.html(<GroupsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} />)
    })

    app.get('/events', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200)
        const q = c.req.query('q')
        const userId = c.req.query('userId')
        const from = c.req.query('from')
        const to = c.req.query('to')
        const { rows, total } = await deps.adminDb.listCalendarEvents({ page, size, q, userId, from: parseDateStart(from), to: parseDateEnd(to) })
        return c.html(
            <EventsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} q={q} userId={userId} from={from} to={to} />,
        )
    })

    app.get('/subscriptions', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 20), 5), 100)
        const { rows, total } = await deps.adminDb.listCalendarSubscriptions({ page, size })
        return c.html(<SubsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} flash={parseFlash(c)} />)
    })

    app.post('/subscriptions/:id/revoke', async (c) => {
        const id = c.req.param('id')
        await deps.adminDb.revokeCalendarSubscription(id)
        return c.redirect('/admin/calendar/subscriptions?flash=ok', 303)
    })

    app.get('/deleted', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200)
        const { rows, total } = await deps.adminDb.listDeletedCalendarEvents({ page, size })
        return c.html(<DeletedPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} />)
    })

    return app
}
