import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { AdminShell, DataTable, Stat, type Column } from './components'
import { formatBytes, formatDate, truncate } from './format'
import type { AdminContext, AdminGetSession } from './guard'
import { requireAdminPage } from './guard'
import type { AdminDb } from './db'

type Counts = Awaited<ReturnType<AdminDb['counts']>>
type RecentUsers = Awaited<ReturnType<AdminDb['recentUsers']>>
type RecentRequests = Awaited<ReturnType<AdminDb['recentRequests']>>
type RecentErrors = Awaited<ReturnType<AdminDb['recentErrors']>>
type RecentLogEvents = Awaited<ReturnType<AdminDb['recentLogEvents']>>

const Dashboard: FC<{
    user: import('./guard').AdminSessionUser
    counts: Counts
    recentUsers: RecentUsers
    recentRequests: RecentRequests
    recentErrors: RecentErrors
    recentLogEvents: RecentLogEvents
}> = ({ user, counts, recentUsers, recentRequests, recentErrors, recentLogEvents }) => (
    <AdminShell title='Dashboard' subtitle='전체 시스템 상태 요약' user={user} currentPath='/admin'>
        <div class='cards-grid'>
            <Stat label='Users' value={counts.users} />
            <Stat label='Active Sessions' value={counts.activeSessions} />
            <Stat label='API Tokens' value={counts.apiTokens} />
            <Stat label='Requests (24h)' value={counts.requests24h} delta={`errors ${counts.errors24h}`} />
            <Stat label='Posts' value={counts.posts} />
            <Stat label='Comments' value={counts.comments} />
            <Stat label='Messages' value={counts.messages} />
            <Stat label='Mail Accounts' value={counts.mailAccounts} />
            <Stat label='Spotify Accounts' value={counts.spotifyAccounts} />
            <Stat label='Calendar Events' value={counts.calendarEvents} />
            <Stat label='Weather Logs' value={counts.weatherLogs} />
            <Stat label='Log Errors (24h)' value={counts.logErrors24h} delta={`events ${counts.logEvents24h}`} />
            <Stat label='Resumes' value={counts.resumes} />
            <Stat label='Drive Assets' value={counts.driveAssets} delta={formatBytes(counts.storageBytes)} />
        </div>

        <div class='card'>
            <h2 style='font-size:1rem;font-weight:600;margin-bottom:0.75rem;'>최근 가입 사용자</h2>
            <DataTable
                rows={recentUsers}
                rowKey={(r) => r.id}
                columns={
                    [
                        { key: 'email', header: 'Email', cell: (r) => <a href={`/admin/users/${r.id}`}>{r.email}</a> },
                        { key: 'name', header: 'Name', cell: (r) => r.name },
                        { key: 'role', header: 'Role', cell: (r) => r.role ?? 'user' },
                        { key: 'createdAt', header: 'Joined', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    ] as Column<RecentUsers[number]>[]
                }
            />
        </div>

        <div class='card'>
            <h2 style='font-size:1rem;font-weight:600;margin-bottom:0.75rem;'>최근 API 요청</h2>
            <DataTable
                rows={recentRequests}
                rowKey={(r) => r.id}
                columns={
                    [
                        { key: 'createdAt', header: 'Time', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                        { key: 'method', header: 'Method', cell: (r) => r.method, className: 'mono nowrap' },
                        { key: 'path', header: 'Path', cell: (r) => <span class='mono'>{truncate(r.path, 60)}</span>, className: 'truncate' },
                        { key: 'status', header: 'Status', cell: (r) => r.statusCode, className: 'num' },
                        { key: 'durationMs', header: 'Duration', cell: (r) => `${r.durationMs ?? '-'} ms`, className: 'num' },
                        { key: 'errorCode', header: 'Error', cell: (r) => r.errorCode ?? '-' },
                    ] as Column<RecentRequests[number]>[]
                }
            />
        </div>

        <div class='card'>
            <h2 style='font-size:1rem;font-weight:600;margin-bottom:0.75rem;'>최근 에러</h2>
            <DataTable
                rows={recentErrors}
                rowKey={(r) => r.id}
                empty='최근 에러가 없습니다.'
                columns={
                    [
                        { key: 'createdAt', header: 'Time', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                        { key: 'method', header: 'Method', cell: (r) => r.method, className: 'mono nowrap' },
                        { key: 'path', header: 'Path', cell: (r) => <span class='mono'>{truncate(r.path, 60)}</span>, className: 'truncate' },
                        { key: 'status', header: 'Status', cell: (r) => r.statusCode, className: 'num' },
                        { key: 'errorCode', header: 'Error', cell: (r) => r.errorCode ?? '-' },
                    ] as Column<RecentErrors[number]>[]
                }
            />
        </div>

        <div class='card'>
            <h2 style='font-size:1rem;font-weight:600;margin-bottom:0.75rem;'>최근 로그 이벤트 (ERROR+)</h2>
            <DataTable
                rows={recentLogEvents}
                rowKey={(r) => r.id}
                empty='최근 로그 이벤트가 없습니다.'
                columns={
                    [
                        { key: 'createdAt', header: 'Time', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                        { key: 'service', header: 'Service', cell: (r) => <span class='mono'>{r.service}</span>, className: 'nowrap' },
                        { key: 'errorCode', header: 'Error Code', cell: (r) => <span class='mono'>{r.errorCode}</span> },
                        { key: 'severity', header: 'Severity', cell: (r) => r.severity, className: 'num' },
                        { key: 'device', header: 'Device', cell: (r) => r.deviceId ?? '-', className: 'mono nowrap' },
                        { key: 'resolved', header: 'Resolved', cell: (r) => (r.resolvedAt ? formatDate(r.resolvedAt) : '-'), className: 'nowrap' },
                    ] as Column<RecentLogEvents[number]>[]
                }
            />
        </div>
    </AdminShell>
)

export const createDashboardRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))
    app.get('/', async (c) => {
        const [counts, recentUsers, recentRequests, recentErrors, recentLogEvents] = await Promise.all([
            deps.adminDb.counts(),
            deps.adminDb.recentUsers(),
            deps.adminDb.recentRequests(),
            deps.adminDb.recentErrors(),
            deps.adminDb.recentLogEvents(),
        ])
        return c.html(
            <Dashboard
                user={c.get('adminUser')}
                counts={counts}
                recentUsers={recentUsers}
                recentRequests={recentRequests}
                recentErrors={recentErrors}
                recentLogEvents={recentLogEvents}
            />,
        )
    })
    return app
}
