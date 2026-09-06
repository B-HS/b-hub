import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { AdminShell, Badge, CsrfField, DataTable, FilterBar, Pagination, RowAction, type Column } from '../components'
import { flashPath, parseFlash } from '../flash'
import { formatBytes, formatDate, parseIntOr, readPage, truncate } from '../format'
import type { AdminContext, AdminGetSession } from '../guard'
import { requireAdminPage } from '../guard'
import type { AdminDb } from '../db'

type UsersListRow = Awaited<ReturnType<AdminDb['listUsers']>>['rows'][number]

const UsersListPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: UsersListRow[]
    total: number
    page: number
    size: number
    q?: string
    role?: string
    banned?: string
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, q, role, banned, flash }) => (
    <AdminShell title='Users' subtitle='전체 사용자 관리' user={user} currentPath='/admin/users' flash={flash}>
        <FilterBar
            action='/admin/users'
            fields={[
                { kind: 'text', name: 'q', label: '검색', value: q, placeholder: 'email or name' },
                {
                    kind: 'select',
                    name: 'role',
                    label: 'Role',
                    value: role,
                    options: [
                        { value: '', label: '전체' },
                        { value: 'admin', label: 'admin' },
                        { value: 'user', label: 'user/null' },
                    ],
                },
                {
                    kind: 'select',
                    name: 'banned',
                    label: 'Banned',
                    value: banned,
                    options: [
                        { value: '', label: '전체' },
                        { value: 'y', label: 'banned only' },
                        { value: 'n', label: 'unbanned only' },
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
                    {
                        key: 'email',
                        header: 'Email',
                        cell: (r) => <a href={`/admin/users/${r.id}`}>{r.email}</a>,
                    },
                    { key: 'name', header: 'Name', cell: (r) => r.name },
                    {
                        key: 'role',
                        header: 'Role',
                        cell: (r) => <Badge kind={r.role === 'admin' ? 'destructive' : 'secondary'}>{r.role ?? 'user'}</Badge>,
                    },
                    {
                        key: 'banned',
                        header: 'Banned',
                        cell: (r) => (r.banned ? <Badge kind='destructive'>banned</Badge> : <Badge kind='muted'>—</Badge>),
                    },
                    { key: 'timezone', header: 'TZ', cell: (r) => r.timezone, className: 'nowrap' },
                    { key: 'quota', header: 'Quota', cell: (r) => formatBytes(r.storageQuotaBytes), className: 'num' },
                    { key: 'createdAt', header: 'Joined', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                ] as Column<UsersListRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, role, banned, size }} basePath='/admin/users' />
    </AdminShell>
)

type UserDetailData = NonNullable<Awaited<ReturnType<AdminDb['getUser']>>>
type UserAccount = Awaited<ReturnType<AdminDb['getUserAccounts']>>[number]
type UserSession = Awaited<ReturnType<AdminDb['getUserSessions']>>[number]
type UserApiLog = Awaited<ReturnType<AdminDb['getUserApiRequests']>>[number]

const UserDetailPage: FC<{
    user: import('../guard').AdminSessionUser
    target: UserDetailData
    accounts: UserAccount[]
    sessions: UserSession[]
    apiLogs: UserApiLog[]
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, target, accounts, sessions, apiLogs, flash }) => (
    <AdminShell
        title={target.email}
        subtitle='사용자 상세 정보'
        user={user}
        currentPath='/admin/users'
        breadcrumbs={[{ href: '/admin', label: 'Admin' }, { href: '/admin/users', label: 'Users' }, { label: target.email }]}
        flash={flash}>
        <div class='cards-grid cols-280'>
            <div class='card'>
                <h3 class='card-title-sm'>프로필</h3>
                <dl class='kv'>
                    <dt>ID</dt>
                    <dd class='mono'>{target.id}</dd>
                    <dt>Name</dt>
                    <dd>{target.name}</dd>
                    <dt>Email</dt>
                    <dd>{target.email}</dd>
                    <dt>Email Verified</dt>
                    <dd>{target.emailVerified ? 'YES' : 'NO'}</dd>
                    <dt>Role</dt>
                    <dd>{target.role ?? 'user'}</dd>
                    <dt>Timezone</dt>
                    <dd>{target.timezone}</dd>
                    <dt>Quota</dt>
                    <dd>{formatBytes(target.storageQuotaBytes)}</dd>
                    <dt>Created</dt>
                    <dd>{formatDate(target.createdAt)}</dd>
                </dl>
            </div>

            <div class='card'>
                <h3 class='card-title-sm'>Role 변경</h3>
                <form method='post' action={`/admin/users/${target.id}/role`} class='form-inline'>
                    <CsrfField />
                    <div class='field'>
                        <label for='role-sel'>Role</label>
                        <select id='role-sel' class='select' name='role'>
                            <option value='admin' selected={target.role === 'admin'}>
                                admin
                            </option>
                            <option value='user' selected={target.role !== 'admin'}>
                                user
                            </option>
                        </select>
                    </div>
                    <button class='btn' type='submit'>
                        저장
                    </button>
                </form>
            </div>

            <div class='card'>
                <h3 class='card-title-sm'>Ban 상태</h3>
                <form method='post' action={`/admin/users/${target.id}/ban`} class='form-stack'>
                    <CsrfField />
                    <div class='field'>
                        <label>Reason</label>
                        <input class='input' name='reason' value={target.banReason ?? ''} />
                    </div>
                    <div class='field'>
                        <label>Expires (YYYY-MM-DD or empty)</label>
                        <input class='input' name='expires' value={target.banExpires ? new Date(target.banExpires).toISOString().slice(0, 10) : ''} />
                    </div>
                    <div class='hstack'>
                        <button class='btn destructive' type='submit' name='action' value='ban'>
                            Ban
                        </button>
                        <button class='btn outline' type='submit' name='action' value='unban'>
                            Unban
                        </button>
                    </div>
                </form>
            </div>

            <div class='card'>
                <h3 class='card-title-sm'>Storage Quota</h3>
                <form method='post' action={`/admin/users/${target.id}/quota`} class='form-inline'>
                    <CsrfField />
                    <div class='field'>
                        <label>Bytes</label>
                        <input class='input' name='bytes' type='number' value={String(target.storageQuotaBytes)} />
                    </div>
                    <button class='btn' type='submit'>
                        저장
                    </button>
                </form>
            </div>
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>연결된 계정</h3>
            <DataTable
                rows={accounts}
                rowKey={(r) => r.id}
                empty='연결된 OAuth 계정이 없습니다.'
                columns={
                    [
                        { key: 'provider', header: 'Provider', cell: (r) => r.providerId },
                        { key: 'accountId', header: 'Account ID', cell: (r) => <span class='mono'>{r.accountId}</span> },
                        { key: 'createdAt', header: '연결일', cell: (r) => formatDate(r.createdAt) },
                    ] as Column<UserAccount>[]
                }
            />
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>활성 세션</h3>
            <DataTable
                rows={sessions}
                rowKey={(r) => r.id}
                empty='활성 세션 없음.'
                columns={
                    [
                        { key: 'ip', header: 'IP', cell: (r) => r.ipAddress ?? '-', className: 'mono nowrap' },
                        { key: 'ua', header: 'User Agent', cell: (r) => r.userAgent ?? '-', className: 'truncate' },
                        { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                        { key: 'expires', header: 'Expires', cell: (r) => formatDate(r.expiresAt), className: 'nowrap' },
                        {
                            key: 'action',
                            header: '',
                            cell: (r) => (
                                <RowAction
                                    action={`/admin/users/${target.id}/sessions/${r.id}/revoke`}
                                    label='강제 만료'
                                    variant='destructive'
                                    returnTo={`/admin/users/${target.id}`}
                                />
                            ),
                        },
                    ] as Column<UserSession>[]
                }
            />
            <form
                method='post'
                action={`/admin/users/${target.id}/sessions/revoke-all`}
                class='mt-sm'
                data-confirm='이 사용자의 모든 세션을 만료할까요?'>
                <CsrfField />
                <input type='hidden' name='returnTo' value={`/admin/users/${target.id}`} />
                <button class='btn destructive' type='submit'>
                    모든 세션 강제 만료
                </button>
            </form>
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>최근 API 요청 (20건)</h3>
            <DataTable
                rows={apiLogs}
                rowKey={(r) => r.id}
                empty='API 요청 기록이 없습니다.'
                columns={
                    [
                        { key: 'time', header: 'Time', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                        { key: 'method', header: 'Method', cell: (r) => r.method, className: 'mono nowrap' },
                        { key: 'path', header: 'Path', cell: (r) => <span class='mono'>{truncate(r.path, 60)}</span>, className: 'truncate' },
                        { key: 'status', header: 'Status', cell: (r) => r.statusCode, className: 'num' },
                        { key: 'duration', header: 'ms', cell: (r) => r.durationMs ?? '-', className: 'num' },
                        { key: 'error', header: 'Error', cell: (r) => r.errorCode ?? '-' },
                    ] as Column<UserApiLog>[]
                }
            />
        </div>
    </AdminShell>
)

const sanitizeReturn = (raw: unknown, fallback: string): string => {
    const value = typeof raw === 'string' ? raw : ''
    if (!value.startsWith('/admin')) return fallback
    return value
}

export const createUsersRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/', async (c) => {
        const page = readPage(c.req.query('page'))
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 20), 5), 100)
        const q = c.req.query('q')
        const role = c.req.query('role')
        const banned = c.req.query('banned')
        const { rows, total } = await deps.adminDb.listUsers({ page, size, q, role, banned: banned as 'y' | 'n' | undefined })
        const flash = parseFlash(c)
        return c.html(
            <UsersListPage
                user={c.get('adminUser')}
                rows={rows}
                total={total}
                page={page}
                size={size}
                q={q}
                role={role}
                banned={banned}
                flash={flash}
            />,
        )
    })

    app.get('/:id', async (c) => {
        const id = c.req.param('id')
        const target = await deps.adminDb.getUser(id)
        if (!target) return c.notFound()
        const [accounts, sessions, apiLogs] = await Promise.all([
            deps.adminDb.getUserAccounts(id),
            deps.adminDb.getUserSessions(id),
            deps.adminDb.getUserApiRequests(id),
        ])
        const flash = parseFlash(c)
        return c.html(
            <UserDetailPage user={c.get('adminUser')} target={target} accounts={accounts} sessions={sessions} apiLogs={apiLogs} flash={flash} />,
        )
    })

    app.post('/:id/role', async (c) => {
        const id = c.req.param('id')
        const body = await c.req.parseBody<{ role: string; returnTo?: string }>()
        const newRole = body.role === 'admin' ? 'admin' : 'user'
        await deps.adminDb.updateUserRole(id, newRole)
        return c.redirect(sanitizeReturn(body.returnTo, `/admin/users/${id}`) + '?flash=ok', 303)
    })

    app.post('/:id/ban', async (c) => {
        const id = c.req.param('id')
        const body = await c.req.parseBody<{ action?: string; reason?: string; expires?: string; returnTo?: string }>()
        const banned = body.action === 'ban'
        const reason = body.reason?.trim() || null
        const expires = body.expires?.trim() ? new Date(body.expires) : null
        if (banned && expires && Number.isNaN(expires.getTime()))
            return c.redirect(flashPath(sanitizeReturn(body.returnTo, `/admin/users/${id}`), 'err', 'validation'), 303)
        await deps.adminDb.updateUserBan(id, banned, banned ? reason : null, banned ? expires : null)
        if (banned) await deps.adminDb.revokeAllUserSessions(id)
        return c.redirect(sanitizeReturn(body.returnTo, `/admin/users/${id}`) + '?flash=ok', 303)
    })

    app.post('/:id/quota', async (c) => {
        const id = c.req.param('id')
        const body = await c.req.parseBody<{ bytes?: string; returnTo?: string }>()
        const bytes = parseIntOr(body.bytes, 0)
        if (bytes < 0) return c.redirect(flashPath(sanitizeReturn(body.returnTo, `/admin/users/${id}`), 'err', 'validation'), 303)
        await deps.adminDb.updateUserQuota(id, bytes)
        return c.redirect(sanitizeReturn(body.returnTo, `/admin/users/${id}`) + '?flash=ok', 303)
    })

    app.post('/:id/sessions/revoke-all', async (c) => {
        const id = c.req.param('id')
        const body = await c.req.parseBody<{ returnTo?: string }>()
        await deps.adminDb.revokeAllUserSessions(id)
        return c.redirect(sanitizeReturn(body.returnTo, `/admin/users/${id}`) + '?flash=ok', 303)
    })

    app.post('/:id/sessions/:sid/revoke', async (c) => {
        const sid = c.req.param('sid')
        const id = c.req.param('id')
        const body = await c.req.parseBody<{ returnTo?: string }>()
        await deps.adminDb.revokeSession(sid)
        return c.redirect(sanitizeReturn(body.returnTo, `/admin/users/${id}`) + '?flash=ok', 303)
    })

    return app
}
