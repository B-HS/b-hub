import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { AdminShell, Badge, DataTable, FilterBar, Pagination, RowAction, type Column } from '../components'
import { formatDate, parseIntOr, ynLabel } from '../format'
import type { AdminContext, AdminGetSession, AdminSessionUser } from '../guard'
import { requireAdminPage } from '../guard'
import type { AdminDb } from '../db'

const sanitizeReturn = (raw: unknown, fallback: string): string => {
    const v = typeof raw === 'string' ? raw : ''
    return v.startsWith('/admin') ? v : fallback
}

const appendFlash = (path: string): string => path + (path.includes('?') ? '&' : '?') + 'flash=ok'

type ProviderRow = Awaited<ReturnType<AdminDb['listAiProviders']>>['rows'][number]
type SessionRow = Awaited<ReturnType<AdminDb['listAiSessions']>>['rows'][number]
type PromptRow = Awaited<ReturnType<AdminDb['listAiPrompts']>>['rows'][number]

const statusKind = (status: string) => (status === 'active' ? 'success' : status === 'reauth_required' ? 'destructive' : 'muted')

const ProvidersPage: FC<{
    user: AdminSessionUser
    rows: ProviderRow[]
    total: number
    page: number
    size: number
    q?: string
    provider?: string
    status?: string
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, q, provider, status, flash }) => (
    <AdminShell title='AI Providers' subtitle='사용자 AI 프로바이더 연결' user={user} currentPath='/admin/ai/providers' flash={flash}>
        <FilterBar
            action='/admin/ai/providers'
            fields={[
                { kind: 'text', name: 'q', label: 'User', value: q, placeholder: 'email' },
                {
                    kind: 'select',
                    name: 'provider',
                    label: 'Provider',
                    value: provider,
                    options: [
                        { value: '', label: 'All' },
                        { value: 'codex', label: 'codex' },
                        { value: 'anthropic', label: 'anthropic' },
                        { value: 'ollama', label: 'ollama' },
                    ],
                },
                {
                    kind: 'select',
                    name: 'status',
                    label: 'Status',
                    value: status,
                    options: [
                        { value: '', label: 'All' },
                        { value: 'active', label: 'active' },
                        { value: 'reauth_required', label: 'reauth_required' },
                        { value: 'disabled', label: 'disabled' },
                    ],
                },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='연결된 AI 프로바이더가 없습니다.'
            columns={
                [
                    { key: 'user', header: 'User', cell: (r) => r.userEmail ?? r.userId, className: 'nowrap' },
                    { key: 'provider', header: 'Provider', cell: (r) => <span class='mono'>{r.provider}</span> },
                    { key: 'auth', header: 'Auth', cell: (r) => r.authType },
                    { key: 'status', header: 'Status', cell: (r) => <Badge kind={statusKind(r.status)}>{r.status}</Badge> },
                    { key: 'detail', header: 'Detail', cell: (r) => r.statusDetail ?? '-', className: 'truncate' },
                    { key: 'name', header: 'Name', cell: (r) => r.displayName ?? '-' },
                    { key: 'used', header: 'Last used', cell: (r) => (r.lastUsedAt ? formatDate(r.lastUsedAt) : '-'), className: 'nowrap' },
                    {
                        key: 'models',
                        header: 'Models fetched',
                        cell: (r) => (r.modelsFetchedAt ? formatDate(r.modelsFetchedAt) : '-'),
                        className: 'nowrap',
                    },
                    {
                        key: 'action',
                        header: '',
                        cell: (r) => (
                            <>
                                <RowAction
                                    action={`/admin/ai/providers/${r.id}/status`}
                                    label={r.status === 'active' ? '비활성' : '활성'}
                                    hidden={{ status: r.status === 'active' ? 'disabled' : 'active' }}
                                    returnTo={`/admin/ai/providers?page=${page}&size=${size}`}
                                />
                                <RowAction
                                    action={`/admin/ai/providers/${r.id}/delete`}
                                    label='삭제'
                                    variant='destructive'
                                    confirm='이 연결을 삭제할까요?'
                                    returnTo={`/admin/ai/providers?page=${page}&size=${size}`}
                                />
                            </>
                        ),
                    },
                ] as Column<ProviderRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, provider, status, size }} basePath='/admin/ai/providers' />
    </AdminShell>
)

const SessionsPage: FC<{ user: AdminSessionUser; rows: SessionRow[]; total: number; page: number; size: number; q?: string; provider?: string }> = ({
    user,
    rows,
    total,
    page,
    size,
    q,
    provider,
}) => (
    <AdminShell title='AI Sessions' subtitle='AI 채팅 세션' user={user} currentPath='/admin/ai/sessions'>
        <FilterBar
            action='/admin/ai/sessions'
            fields={[
                { kind: 'text', name: 'q', label: 'User', value: q, placeholder: 'email' },
                {
                    kind: 'select',
                    name: 'provider',
                    label: 'Provider',
                    value: provider,
                    options: [
                        { value: '', label: 'All' },
                        { value: 'codex', label: 'codex' },
                        { value: 'anthropic', label: 'anthropic' },
                        { value: 'ollama', label: 'ollama' },
                    ],
                },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='세션이 없습니다.'
            columns={
                [
                    { key: 'user', header: 'User', cell: (r) => r.userEmail ?? r.userId, className: 'nowrap' },
                    { key: 'provider', header: 'Provider', cell: (r) => <span class='mono'>{r.provider}</span> },
                    { key: 'model', header: 'Model', cell: (r) => <span class='mono'>{r.modelId}</span> },
                    { key: 'title', header: 'Title', cell: (r) => r.title ?? '-', className: 'truncate' },
                    { key: 'feature', header: 'Feature', cell: (r) => r.featureKey ?? '-' },
                    { key: 'last', header: 'Last message', cell: (r) => (r.lastMessageAt ? formatDate(r.lastMessageAt) : '-'), className: 'nowrap' },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                ] as Column<SessionRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, provider, size }} basePath='/admin/ai/sessions' />
    </AdminShell>
)

const PromptsPage: FC<{ user: AdminSessionUser; rows: PromptRow[]; total: number; page: number; size: number; q?: string; stage?: string }> = ({
    user,
    rows,
    total,
    page,
    size,
    q,
    stage,
}) => (
    <AdminShell title='AI Prompts' subtitle='사용자 프롬프트 템플릿' user={user} currentPath='/admin/ai/prompts'>
        <FilterBar
            action='/admin/ai/prompts'
            fields={[
                { kind: 'text', name: 'q', label: 'Search', value: q, placeholder: 'email·name' },
                {
                    kind: 'select',
                    name: 'stage',
                    label: 'Stage',
                    value: stage,
                    options: [
                        { value: '', label: 'All' },
                        { value: 'system', label: 'system' },
                        { value: 'context', label: 'context' },
                        { value: 'user', label: 'user' },
                        { value: 'assistant', label: 'assistant' },
                    ],
                },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='프롬프트가 없습니다.'
            columns={
                [
                    { key: 'user', header: 'User', cell: (r) => r.userEmail ?? r.userId, className: 'nowrap' },
                    { key: 'name', header: 'Name', cell: (r) => r.name },
                    { key: 'stage', header: 'Stage', cell: (r) => <Badge kind='outline'>{r.stage}</Badge> },
                    { key: 'feature', header: 'Feature', cell: (r) => r.featureKey ?? '-' },
                    { key: 'order', header: 'Order', cell: (r) => r.sortOrder },
                    { key: 'active', header: 'Active', cell: (r) => ynLabel(r.isActive) },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                ] as Column<PromptRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, stage, size }} basePath='/admin/ai/prompts' />
    </AdminShell>
)

const readListParams = (c: { req: { query: (k: string) => string | undefined } }) => ({
    page: parseIntOr(c.req.query('page'), 1),
    size: Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200),
    q: c.req.query('q'),
})

export const createAiProvidersRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/', async (c) => {
        const { page, size, q } = readListParams(c)
        const provider = c.req.query('provider')
        const status = c.req.query('status')
        const { rows, total } = await deps.adminDb.listAiProviders({
            page,
            size,
            q: q || undefined,
            provider: provider || undefined,
            status: status || undefined,
        })
        const flash = c.req.query('flash') === 'ok' ? { kind: 'ok' as const, message: '처리되었습니다.' } : null
        return c.html(
            <ProvidersPage
                user={c.get('adminUser')}
                rows={rows}
                total={total}
                page={page}
                size={size}
                q={q}
                provider={provider}
                status={status}
                flash={flash}
            />,
        )
    })

    app.post('/:id/status', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        const body = await c.req.parseBody<{ status?: string; returnTo?: string }>()
        const next = body.status === 'active' ? 'active' : 'disabled'
        if (id > 0) await deps.adminDb.setAiProviderStatus(id, next)
        return c.redirect(appendFlash(sanitizeReturn(body.returnTo, '/admin/ai/providers')), 303)
    })

    app.post('/:id/delete', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        const body = await c.req.parseBody<{ returnTo?: string }>()
        if (id > 0) await deps.adminDb.deleteAiProvider(id)
        return c.redirect(appendFlash(sanitizeReturn(body.returnTo, '/admin/ai/providers')), 303)
    })

    return app
}

export const createAiSessionsRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/', async (c) => {
        const { page, size, q } = readListParams(c)
        const provider = c.req.query('provider')
        const { rows, total } = await deps.adminDb.listAiSessions({ page, size, q: q || undefined, provider: provider || undefined })
        return c.html(<SessionsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} q={q} provider={provider} />)
    })

    return app
}

export const createAiPromptsRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/', async (c) => {
        const { page, size, q } = readListParams(c)
        const stage = c.req.query('stage')
        const { rows, total } = await deps.adminDb.listAiPrompts({ page, size, q: q || undefined, stage: stage || undefined })
        return c.html(<PromptsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} q={q} stage={stage} />)
    })

    return app
}
