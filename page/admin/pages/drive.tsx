import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { AdminShell, Badge, DataTable, FilterBar, Pagination, RowAction, type Column } from '../components'
import { parseFlash } from '../flash'
import { formatBytes, formatDate, parseIntOr, truncate } from '../format'
import type { AdminContext, AdminGetSession } from '../guard'
import { requireAdminPage } from '../guard'
import type { AdminDb } from '../db'

type AssetRow = Awaited<ReturnType<AdminDb['listDriveAssets']>>['rows'][number]
type FolderRow = Awaited<ReturnType<AdminDb['listDriveFolders']>>['rows'][number]
type LogRow = Awaited<ReturnType<AdminDb['listLifecycleLogs']>>['rows'][number]

const AssetsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: AssetRow[]
    total: number
    page: number
    size: number
    q?: string
    tier?: string
    status?: string
    userId?: string
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, q, tier, status, userId, flash }) => (
    <AdminShell title='Drive Assets' subtitle='드라이브에 업로드된 자산' user={user} currentPath='/admin/drive/assets' flash={flash}>
        <FilterBar
            action='/admin/drive/assets'
            fields={[
                { kind: 'text', name: 'q', label: 'Filename 검색', value: q },
                { kind: 'text', name: 'userId', label: 'User ID', value: userId },
                {
                    kind: 'select',
                    name: 'tier',
                    label: 'Tier',
                    value: tier,
                    options: [
                        { value: '', label: '전체' },
                        { value: 'L1', label: 'L1' },
                        { value: 'L2', label: 'L2' },
                        { value: 'L3', label: 'L3' },
                    ],
                },
                {
                    kind: 'select',
                    name: 'status',
                    label: 'Upload status',
                    value: status,
                    options: [
                        { value: '', label: '전체' },
                        { value: 'ready', label: 'ready' },
                        { value: 'uploading', label: 'uploading' },
                        { value: 'failed', label: 'failed' },
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
                    { key: 'id', header: 'ID', cell: (r) => r.id, className: 'num' },
                    { key: 'user', header: 'User', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userEmail ?? r.userId}</a> },
                    { key: 'name', header: 'Original name', cell: (r) => truncate(r.originalName, 60), className: 'truncate' },
                    { key: 'mime', header: 'MIME', cell: (r) => r.mimeType, className: 'mono' },
                    { key: 'size', header: 'Size', cell: (r) => formatBytes(r.sizeBytes), className: 'num' },
                    { key: 'tier', header: 'Tier', cell: (r) => <Badge kind='outline'>{r.storageTiers}</Badge> },
                    {
                        key: 'status',
                        header: 'Status',
                        cell: (r) => (
                            <Badge kind={r.uploadStatus === 'ready' ? 'success' : r.uploadStatus === 'failed' ? 'destructive' : 'secondary'}>
                                {r.uploadStatus}
                            </Badge>
                        ),
                    },
                    { key: 'access', header: 'Access', cell: (r) => r.accessCount, className: 'num' },
                    { key: 'lastViewed', header: 'Last viewed', cell: (r) => formatDate(r.lastViewedAt), className: 'nowrap' },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`/admin/drive/assets/${r.id}/delete`}
                                label='delete'
                                variant='destructive'
                                returnTo='/admin/drive/assets'
                            />
                        ),
                    },
                ] as Column<AssetRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, tier, status, userId, size }} basePath='/admin/drive/assets' />
    </AdminShell>
)

const FoldersPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: FolderRow[]
    total: number
    page: number
    size: number
}> = ({ user, rows, total, page, size }) => (
    <AdminShell title='Drive Folders' subtitle='드라이브 폴더 트리' user={user} currentPath='/admin/drive/folders'>
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'id', header: 'ID', cell: (r) => <span class='mono'>{r.id.slice(0, 8)}…</span> },
                    { key: 'user', header: 'User', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userEmail ?? r.userId}</a> },
                    { key: 'parent', header: 'Parent', cell: (r) => (r.parentId ? <span class='mono'>{r.parentId.slice(0, 8)}…</span> : '-') },
                    { key: 'name', header: 'Name', cell: (r) => r.name },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                ] as Column<FolderRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ size }} basePath='/admin/drive/folders' />
    </AdminShell>
)

const LogsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: LogRow[]
    total: number
    page: number
    size: number
    assetId?: string
}> = ({ user, rows, total, page, size, assetId }) => (
    <AdminShell title='Drive Lifecycle Logs' subtitle='스토리지 티어 이동 이력' user={user} currentPath='/admin/drive/lifecycle-logs'>
        <FilterBar
            action='/admin/drive/lifecycle-logs'
            fields={[
                { kind: 'number', name: 'assetId', label: 'Asset ID', value: assetId },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'time', header: 'Time', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    { key: 'asset', header: 'Asset', cell: (r) => r.assetId, className: 'num' },
                    { key: 'action', header: 'Action', cell: (r) => <Badge kind='secondary'>{r.action}</Badge> },
                    {
                        key: 'tier',
                        header: 'Tier',
                        cell: (r) => `${r.fromTier} → ${r.toTier}`,
                        className: 'mono',
                    },
                    { key: 'reason', header: 'Reason', cell: (r) => r.reason, className: 'truncate' },
                ] as Column<LogRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ assetId, size }} basePath='/admin/drive/lifecycle-logs' />
    </AdminShell>
)

export const createDriveRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/assets', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 20), 5), 100)
        const q = c.req.query('q')
        const tier = c.req.query('tier')
        const status = c.req.query('status')
        const userId = c.req.query('userId')
        const { rows, total } = await deps.adminDb.listDriveAssets({ page, size, q, tier, status, userId })
        return c.html(
            <AssetsPage
                user={c.get('adminUser')}
                rows={rows}
                total={total}
                page={page}
                size={size}
                q={q}
                tier={tier}
                status={status}
                userId={userId}
                flash={parseFlash(c)}
            />,
        )
    })

    app.post('/assets/:id/delete', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        if (id > 0) await deps.adminDb.deleteDriveAsset(id)
        return c.redirect('/admin/drive/assets?flash=ok', 303)
    })

    app.get('/folders', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200)
        const { rows, total } = await deps.adminDb.listDriveFolders({ page, size })
        return c.html(<FoldersPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} />)
    })

    app.get('/lifecycle-logs', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200)
        const assetId = c.req.query('assetId')
        const { rows, total } = await deps.adminDb.listLifecycleLogs({
            page,
            size,
            assetId: assetId ? parseIntOr(assetId, 0) || undefined : undefined,
        })
        return c.html(<LogsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} assetId={assetId} />)
    })

    return app
}
