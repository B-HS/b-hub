import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { AdminShell, Badge, DataTable, FilterBar, Pagination, RowAction, type Column } from '../components'
import { flashPath, parseFlash } from '../flash'
import { formatBytes, formatDate, parseIntOr, readPage, truncate } from '../format'
import type { AdminContext, AdminGetSession } from '../guard'
import { requireAdminPage } from '../guard'
import type { AdminDb } from '../db'

type AccountRow = Awaited<ReturnType<AdminDb['listMailAccounts']>>['rows'][number]
type SyncLogRow = Awaited<ReturnType<AdminDb['listMailSyncLogs']>>['rows'][number]
type SyncSessionRow = Awaited<ReturnType<AdminDb['listMailSyncSessions']>>['rows'][number]
type MsgRow = Awaited<ReturnType<AdminDb['listMailMessages']>>['rows'][number]
type UploadRow = Awaited<ReturnType<AdminDb['listMailUploads']>>['rows'][number]

const AccountsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: AccountRow[]
    total: number
    page: number
    size: number
    q?: string
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, q, flash }) => (
    <AdminShell title='Mail Accounts' subtitle='연결된 메일 계정' user={user} currentPath='/admin/mail/accounts' flash={flash}>
        <FilterBar
            action='/admin/mail/accounts'
            fields={[
                { kind: 'text', name: 'q', label: '검색 (email)', value: q },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'user', header: 'User', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userEmail}</a> },
                    { key: 'provider', header: 'Provider', cell: (r) => <Badge kind='secondary'>{r.provider}</Badge> },
                    { key: 'email', header: 'Email', cell: (r) => r.email },
                    {
                        key: 'active',
                        header: 'Active',
                        cell: (r) => (r.isActive ? <Badge kind='success'>active</Badge> : <Badge kind='muted'>off</Badge>),
                    },
                    { key: 'lastSync', header: 'Last sync', cell: (r) => formatDate(r.lastSyncAt), className: 'nowrap' },
                    { key: 'lastStatus', header: 'Status', cell: (r) => r.lastSyncStatus ?? '-' },
                    { key: 'created', header: 'Connected', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <div class='row-actions'>
                                <RowAction
                                    action={`/admin/mail/accounts/${r.id}/toggle`}
                                    label={r.isActive ? '비활성' : '활성'}
                                    returnTo='/admin/mail/accounts'
                                />
                                <RowAction action={`/admin/mail/accounts/${r.id}/sync`} label='동기화' returnTo='/admin/mail/accounts' />
                            </div>
                        ),
                    },
                ] as Column<AccountRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, size }} basePath='/admin/mail/accounts' />
    </AdminShell>
)

const SyncLogsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: SyncLogRow[]
    total: number
    page: number
    size: number
    accountId?: string
    status?: string
}> = ({ user, rows, total, page, size, accountId, status }) => (
    <AdminShell title='Mail Sync Logs' subtitle='메일 동기화 결과 로그' user={user} currentPath='/admin/mail/sync-logs'>
        <FilterBar
            action='/admin/mail/sync-logs'
            fields={[
                { kind: 'number', name: 'accountId', label: 'Account ID', value: accountId },
                { kind: 'text', name: 'status', label: 'Status', value: status },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'time', header: 'Time', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    { key: 'account', header: 'Account', cell: (r) => r.accountId, className: 'num' },
                    { key: 'type', header: 'Type', cell: (r) => r.syncType },
                    {
                        key: 'status',
                        header: 'Status',
                        cell: (r) => (
                            <Badge kind={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'destructive' : 'secondary'}>
                                {r.status}
                            </Badge>
                        ),
                    },
                    { key: 'added', header: 'Added', cell: (r) => r.messagesAdded ?? 0, className: 'num' },
                    { key: 'updated', header: 'Updated', cell: (r) => r.messagesUpdated ?? 0, className: 'num' },
                    { key: 'deleted', header: 'Deleted', cell: (r) => r.messagesDeleted ?? 0, className: 'num' },
                    { key: 'duration', header: 'ms', cell: (r) => r.durationMs ?? '-', className: 'num' },
                    { key: 'error', header: 'Error', cell: (r) => r.errorMessage ?? '-', className: 'truncate' },
                ] as Column<SyncLogRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ accountId, status, size }} basePath='/admin/mail/sync-logs' />
    </AdminShell>
)

const SyncSessionsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: SyncSessionRow[]
    total: number
    page: number
    size: number
    status?: string
}> = ({ user, rows, total, page, size, status }) => (
    <AdminShell title='Mail Sync Sessions' subtitle='진행 중인 동기화 세션' user={user} currentPath='/admin/mail/sync-sessions'>
        <FilterBar
            action='/admin/mail/sync-sessions'
            fields={[
                { kind: 'text', name: 'status', label: 'Status', value: status },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'time', header: 'Started', cell: (r) => formatDate(r.startedAt), className: 'nowrap' },
                    { key: 'account', header: 'Account', cell: (r) => r.accountId, className: 'num' },
                    { key: 'folder', header: 'Folder', cell: (r) => r.folderId ?? '-' },
                    { key: 'type', header: 'Type', cell: (r) => r.syncType },
                    {
                        key: 'status',
                        header: 'Status',
                        cell: (r) => (
                            <Badge kind={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'destructive' : 'secondary'}>
                                {r.status}
                            </Badge>
                        ),
                    },
                    { key: 'progress', header: 'Progress', cell: (r) => `${r.syncedCount ?? 0} / ${r.totalEstimate ?? '?'}` },
                    { key: 'last', header: 'Last batch', cell: (r) => formatDate(r.lastBatchAt), className: 'nowrap' },
                ] as Column<SyncSessionRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ status, size }} basePath='/admin/mail/sync-sessions' />
    </AdminShell>
)

const MailMessagesPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: MsgRow[]
    total: number
    page: number
    size: number
    accountId?: string
    q?: string
    folderId?: string
    isRead?: string
    hasAttachments?: string
}> = ({ user, rows, total, page, size, accountId, q, folderId, isRead, hasAttachments }) => (
    <AdminShell title='Mail Messages' subtitle='수신된 메일' user={user} currentPath='/admin/mail/messages'>
        <FilterBar
            action='/admin/mail/messages'
            fields={[
                { kind: 'number', name: 'accountId', label: 'Account ID', value: accountId },
                { kind: 'text', name: 'q', label: 'Subject 검색', value: q },
                { kind: 'number', name: 'folderId', label: 'Folder ID', value: folderId },
                {
                    kind: 'select',
                    name: 'isRead',
                    label: 'Read',
                    value: isRead,
                    options: [
                        { value: '', label: '전체' },
                        { value: 'y', label: 'read' },
                        { value: 'n', label: 'unread' },
                    ],
                },
                {
                    kind: 'select',
                    name: 'hasAttachments',
                    label: 'Attachments',
                    value: hasAttachments,
                    options: [
                        { value: '', label: '전체' },
                        { value: 'y', label: 'with' },
                        { value: 'n', label: 'without' },
                    ],
                },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'received', header: 'Received', cell: (r) => formatDate(r.receivedAt), className: 'nowrap' },
                    { key: 'account', header: 'Account', cell: (r) => r.accountId, className: 'num' },
                    { key: 'folder', header: 'Folder', cell: (r) => r.folderId, className: 'num' },
                    { key: 'subject', header: 'Subject', cell: (r) => truncate(r.subject, 60), className: 'truncate' },
                    {
                        key: 'from',
                        header: 'From',
                        cell: (r) => (r.fromAddress ? `${r.fromAddress.name ?? ''} <${r.fromAddress.address}>` : '-'),
                        className: 'truncate',
                    },
                    {
                        key: 'flags',
                        header: 'Flags',
                        cell: (r) => (
                            <div class='hstack-sm'>
                                {r.isRead ? <Badge kind='muted'>read</Badge> : <Badge kind='success'>unread</Badge>}
                                {r.hasAttachments && <Badge kind='outline'>attach</Badge>}
                            </div>
                        ),
                    },
                ] as Column<MsgRow>[]
            }
        />
        <Pagination
            page={page}
            pageSize={size}
            total={total}
            baseQuery={{ accountId, q, folderId, isRead, hasAttachments, size }}
            basePath='/admin/mail/messages'
        />
    </AdminShell>
)

const UploadsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: UploadRow[]
    total: number
    page: number
    size: number
    q?: string
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, q, flash }) => (
    <AdminShell title='Mail Uploads' subtitle='메일 첨부용 업로드' user={user} currentPath='/admin/mail/uploads' flash={flash}>
        <FilterBar
            action='/admin/mail/uploads'
            fields={[
                { kind: 'text', name: 'q', label: 'Filename 검색', value: q },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'user', header: 'User', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userEmail ?? r.userId}</a> },
                    { key: 'filename', header: 'Filename', cell: (r) => r.filename, className: 'truncate' },
                    { key: 'mime', header: 'MIME', cell: (r) => r.mimeType, className: 'mono' },
                    { key: 'size', header: 'Size', cell: (r) => formatBytes(r.sizeBytes), className: 'num' },
                    { key: 'r2Key', header: 'R2 key', cell: (r) => <span class='mono'>{r.r2Key}</span>, className: 'truncate' },
                    { key: 'inline', header: 'Inline', cell: (r) => (r.isInline ? 'yes' : 'no') },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`/admin/mail/uploads/${r.id}/delete`}
                                label='delete'
                                variant='destructive'
                                returnTo='/admin/mail/uploads'
                            />
                        ),
                    },
                ] as Column<UploadRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, size }} basePath='/admin/mail/uploads' />
    </AdminShell>
)

export type TriggerMailSync = (accountId: number) => Promise<void>

export const createMailRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb; triggerMailSync?: TriggerMailSync }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/accounts', async (c) => {
        const page = readPage(c.req.query('page'))
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 20), 5), 100)
        const q = c.req.query('q')
        const { rows, total } = await deps.adminDb.listMailAccounts({ page, size, q })
        return c.html(<AccountsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} q={q} flash={parseFlash(c)} />)
    })

    app.post('/accounts/:id/toggle', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        if (id > 0) await deps.adminDb.toggleMailAccount(id)
        return c.redirect('/admin/mail/accounts?flash=ok', 303)
    })

    app.post('/accounts/:id/sync', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        if (id > 0 && deps.triggerMailSync) {
            try {
                await deps.triggerMailSync(id)
            } catch {
                return c.redirect(flashPath('/admin/mail/accounts', 'err', 'sync'), 303)
            }
        }
        return c.redirect('/admin/mail/accounts?flash=ok', 303)
    })

    app.get('/sync-logs', async (c) => {
        const page = readPage(c.req.query('page'))
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200)
        const accountId = c.req.query('accountId')
        const status = c.req.query('status')
        const { rows, total } = await deps.adminDb.listMailSyncLogs({
            page,
            size,
            accountId: accountId ? parseIntOr(accountId, 0) || undefined : undefined,
            status,
        })
        return c.html(
            <SyncLogsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} accountId={accountId} status={status} />,
        )
    })

    app.get('/sync-sessions', async (c) => {
        const page = readPage(c.req.query('page'))
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200)
        const status = c.req.query('status')
        const { rows, total } = await deps.adminDb.listMailSyncSessions({ page, size, status })
        return c.html(<SyncSessionsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} status={status} />)
    })

    app.get('/messages', async (c) => {
        const page = readPage(c.req.query('page'))
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200)
        const accountId = c.req.query('accountId')
        const q = c.req.query('q')
        const folderId = c.req.query('folderId')
        const isRead = c.req.query('isRead')
        const hasAttachments = c.req.query('hasAttachments')
        const { rows, total } = await deps.adminDb.listMailMessages({
            page,
            size,
            accountId: accountId ? parseIntOr(accountId, 0) || undefined : undefined,
            q,
            folderId: folderId ? parseIntOr(folderId, 0) || undefined : undefined,
            isRead: isRead as 'y' | 'n' | undefined,
            hasAttachments: hasAttachments as 'y' | 'n' | undefined,
        })
        return c.html(
            <MailMessagesPage
                user={c.get('adminUser')}
                rows={rows}
                total={total}
                page={page}
                size={size}
                accountId={accountId}
                q={q}
                folderId={folderId}
                isRead={isRead}
                hasAttachments={hasAttachments}
            />,
        )
    })

    app.get('/uploads', async (c) => {
        const page = readPage(c.req.query('page'))
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 20), 5), 100)
        const q = c.req.query('q')
        const { rows, total } = await deps.adminDb.listMailUploads({ page, size, q })
        return c.html(<UploadsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} q={q} flash={parseFlash(c)} />)
    })

    app.post('/uploads/:id/delete', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        if (id > 0) await deps.adminDb.deleteMailUpload(id)
        return c.redirect('/admin/mail/uploads?flash=ok', 303)
    })

    return app
}
