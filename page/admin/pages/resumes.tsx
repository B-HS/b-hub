import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { AdminShell, Badge, DataTable, FilterBar, Pagination, RowAction, type Column } from '../components'
import { formatDate, parseIntOr } from '../format'
import type { AdminContext, AdminGetSession } from '../guard'
import { requireAdminPage } from '../guard'
import type { AdminDb } from '../db'

type Row = Awaited<ReturnType<AdminDb['listResumes']>>['rows'][number]
type Detail = NonNullable<Awaited<ReturnType<AdminDb['getResume']>>>

const ListPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: Row[]
    total: number
    page: number
    size: number
    q?: string
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, q, flash }) => (
    <AdminShell title='Resumes' subtitle='이력서 데이터' user={user} currentPath='/admin/resumes' flash={flash}>
        <FilterBar
            action='/admin/resumes'
            fields={[
                { kind: 'text', name: 'q', label: 'Title 검색', value: q },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'id', header: 'ID', cell: (r) => <a href={`/admin/resumes/${r.id}`}>{r.id}</a>, className: 'num' },
                    { key: 'user', header: 'User', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userEmail ?? r.userId}</a> },
                    { key: 'type', header: 'Type', cell: (r) => <Badge kind='secondary'>{r.type}</Badge> },
                    { key: 'title', header: 'Title', cell: (r) => r.title, className: 'truncate' },
                    {
                        key: 'visibility',
                        header: 'Visibility',
                        cell: (r) => (r.isPublic ? <Badge kind='success'>public</Badge> : <Badge kind='muted'>private</Badge>),
                    },
                    { key: 'created', header: '작성일', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <div class='row-actions'>
                                <RowAction
                                    action={`/admin/resumes/${r.id}/visibility`}
                                    label={r.isPublic ? '비공개로' : '공개로'}
                                    returnTo='/admin/resumes'
                                />
                                <RowAction
                                    action={`/admin/resumes/${r.id}/delete`}
                                    label='delete'
                                    variant='destructive'
                                    returnTo='/admin/resumes'
                                />
                            </div>
                        ),
                    },
                ] as Column<Row>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, size }} basePath='/admin/resumes' />
    </AdminShell>
)

const DetailPage: FC<{ user: import('../guard').AdminSessionUser; target: Detail }> = ({ user, target }) => (
    <AdminShell
        title={target.title}
        subtitle='Resume detail (JSON)'
        user={user}
        currentPath='/admin/resumes'
        breadcrumbs={[
            { href: '/admin', label: 'Admin' },
            { href: '/admin/resumes', label: 'Resumes' },
            { label: target.title },
        ]}>
        <div class='card'>
            <dl class='kv'>
                <dt>ID</dt>
                <dd class='mono'>{target.id}</dd>
                <dt>User</dt>
                <dd>
                    <a href={`/admin/users/${target.userId}`}>{target.userId}</a>
                </dd>
                <dt>Type</dt>
                <dd>{target.type}</dd>
                <dt>Public</dt>
                <dd>{target.isPublic ? 'YES' : 'NO'}</dd>
                <dt>Created</dt>
                <dd>{formatDate(target.createdAt)}</dd>
                <dt>Updated</dt>
                <dd>{formatDate(target.updatedAt)}</dd>
            </dl>
        </div>
        <div class='card'>
            <h3 style='font-weight:600;margin-bottom:0.5rem;'>Data</h3>
            <pre
                style='font-family:var(--font-mono);font-size:0.75rem;background:var(--color-muted);padding:0.75rem;border-radius:var(--radius-md);overflow:auto;max-height:32rem;'>
                {JSON.stringify(target.data, null, 2)}
            </pre>
        </div>
    </AdminShell>
)

const flashFrom = (c: { req: { query: (k: string) => string | undefined } }) =>
    c.req.query('flash') === 'ok' ? { kind: 'ok' as const, message: '저장되었습니다.' } : null

const sanitizeReturn = (raw: unknown, fallback: string): string => {
    const v = typeof raw === 'string' ? raw : ''
    return v.startsWith('/admin') ? v : fallback
}

const appendFlash = (path: string): string => path + (path.includes('?') ? '&' : '?') + 'flash=ok'

export const createResumesRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 20), 5), 100)
        const q = c.req.query('q')
        const { rows, total } = await deps.adminDb.listResumes({ page, size, q })
        return c.html(<ListPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} q={q} flash={flashFrom(c)} />)
    })

    app.get('/:id', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        if (!id) return c.notFound()
        const target = await deps.adminDb.getResume(id)
        if (!target) return c.notFound()
        return c.html(<DetailPage user={c.get('adminUser')} target={target} />)
    })

    app.post('/:id/visibility', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        const body = await c.req.parseBody<{ returnTo?: string }>()
        if (id > 0) await deps.adminDb.toggleResumeVisibility(id)
        return c.redirect(appendFlash(sanitizeReturn(body.returnTo, '/admin/resumes')), 303)
    })

    app.post('/:id/delete', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        const body = await c.req.parseBody<{ returnTo?: string }>()
        if (id > 0) await deps.adminDb.deleteResume(id)
        return c.redirect(appendFlash(sanitizeReturn(body.returnTo, '/admin/resumes')), 303)
    })

    return app
}
