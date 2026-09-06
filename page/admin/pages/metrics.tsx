import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { AdminShell, Badge, CsrfField, DataTable, RowAction, type Column } from '../components'
import { RevealBanner } from '../../manage/components'
import { flashPath, parseFlash } from '../flash'
import { formatDate, parseIntOr } from '../format'
import type { Flash } from '../flash'
import type { AdminContext, AdminGetSession, AdminSessionUser } from '../guard'
import { requireAdminPage, setRevealValue, takeRevealValue } from '../guard'
import { METRICS_TOKEN_SCOPE } from '../../../dto/metrics/token'
import type { MetricsTokenService } from '../../../service/domain/metrics/token'

type MetricsTokensDeps = {
    getSession: AdminGetSession
    metricsTokenService?: MetricsTokenService
}

type TokenRow = Awaited<ReturnType<MetricsTokenService['listAll']>>[number]

const TOKENS_PATH = '/admin/metrics/tokens'

const MetricsTokensPage: FC<{
    user: AdminSessionUser
    rows: TokenRow[]
    configured: boolean
    flash?: Flash | null
    revealedToken?: string
}> = ({ user, rows, configured, flash, revealedToken }) => (
    <AdminShell
        title='Metrics Tokens'
        subtitle='machboard 수집·조회 토큰 (scope: client / admin)'
        user={user}
        currentPath={TOKENS_PATH}
        flash={flash}>
        {!configured && (
            <div class='card'>
                <p class='text-muted'>MONGODB_URI 가 설정되지 않아 metrics 도메인이 비활성 상태입니다.</p>
            </div>
        )}
        {revealedToken && (
            <RevealBanner label='발급된 metrics 토큰' value={revealedToken} note='이 토큰은 다시 표시되지 않습니다. 안전한 곳에 보관해 주세요.' />
        )}
        {configured && (
            <div class='card'>
                <h3 class='card-title-sm'>새 토큰 발급</h3>
                <form method='post' action={TOKENS_PATH} class='form-inline'>
                    <CsrfField />
                    <div class='field field-grow'>
                        <label for='metrics-alias'>별칭</label>
                        <input id='metrics-alias' class='input input-block' name='alias' maxlength={100} required placeholder='예: demo-mbp' />
                    </div>
                    <div class='field'>
                        <label for='metrics-scope'>Scope</label>
                        <select id='metrics-scope' class='input' name='scope'>
                            <option value={METRICS_TOKEN_SCOPE.CLIENT}>client (수집 전용)</option>
                            <option value={METRICS_TOKEN_SCOPE.ADMIN}>admin (수집+조회+토큰 관리)</option>
                        </select>
                    </div>
                    <div class='field'>
                        <label for='metrics-expires'>만료일 (일, 선택)</label>
                        <input id='metrics-expires' class='input' name='expiresInDays' type='number' min={1} max={3650} placeholder='무기한' />
                    </div>
                    <div class='field'>
                        <label for='metrics-limit'>일일 한도 (선택)</label>
                        <input id='metrics-limit' class='input' name='dailyLimit' type='number' min={1} placeholder='20000' />
                    </div>
                    <button class='btn' type='submit'>
                        발급
                    </button>
                </form>
            </div>
        )}
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='발급된 토큰이 없습니다.'
            columns={
                [
                    { key: 'alias', header: 'Alias', cell: (r) => r.alias },
                    {
                        key: 'scope',
                        header: 'Scope',
                        cell: (r) => <Badge kind={r.scope === METRICS_TOKEN_SCOPE.ADMIN ? 'destructive' : 'secondary'}>{r.scope}</Badge>,
                    },
                    { key: 'limit', header: 'Daily limit', cell: (r) => r.dailyLimit, className: 'num' },
                    { key: 'expires', header: 'Expires', cell: (r) => formatDate(r.expiresAt), className: 'nowrap' },
                    { key: 'lastUsed', header: 'Last used', cell: (r) => formatDate(r.lastUsedAt), className: 'nowrap' },
                    {
                        key: 'status',
                        header: 'Status',
                        cell: (r) => (r.revokedAt ? <Badge kind='muted'>revoked</Badge> : <Badge kind='success'>active</Badge>),
                    },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'action',
                        header: '',
                        cell: (r) =>
                            r.revokedAt ? (
                                '-'
                            ) : (
                                <RowAction action={`${TOKENS_PATH}/${r.id}/revoke`} label='폐기' variant='destructive' returnTo={TOKENS_PATH} />
                            ),
                    },
                ] as Column<TokenRow>[]
            }
        />
    </AdminShell>
)

export const createMetricsTokensRoute = (deps: MetricsTokensDeps) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/', async (c) => {
        const rows = deps.metricsTokenService ? await deps.metricsTokenService.listAll() : []
        return c.html(
            <MetricsTokensPage
                user={c.get('adminUser')}
                rows={rows}
                configured={!!deps.metricsTokenService}
                flash={parseFlash(c)}
                revealedToken={takeRevealValue(c, TOKENS_PATH)}
            />,
        )
    })

    app.post('/', async (c) => {
        if (!deps.metricsTokenService) return c.redirect(flashPath(TOKENS_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody<{ alias?: string; scope?: string; expiresInDays?: string; dailyLimit?: string }>()
        const alias = typeof body.alias === 'string' ? body.alias.trim() : ''
        if (!alias) return c.redirect(flashPath(TOKENS_PATH, 'err', 'validation'), 303)
        const scope = body.scope === METRICS_TOKEN_SCOPE.ADMIN ? METRICS_TOKEN_SCOPE.ADMIN : METRICS_TOKEN_SCOPE.CLIENT
        const expiresInDays = parseIntOr(typeof body.expiresInDays === 'string' ? body.expiresInDays : undefined, 0)
        const dailyLimit = parseIntOr(typeof body.dailyLimit === 'string' ? body.dailyLimit : undefined, 0)
        const { token } = await deps.metricsTokenService.create({
            alias,
            scope,
            expiresInDays: expiresInDays > 0 ? expiresInDays : undefined,
            dailyLimit: dailyLimit > 0 ? dailyLimit : undefined,
        })
        setRevealValue(c, TOKENS_PATH, token)
        return c.redirect(TOKENS_PATH, 303)
    })

    app.post('/:id/revoke', async (c) => {
        if (!deps.metricsTokenService) return c.redirect(flashPath(TOKENS_PATH, 'err', 'not_configured'), 303)
        const id = parseIntOr(c.req.param('id'), 0)
        if (id > 0) await deps.metricsTokenService.revoke(id)
        return c.redirect(flashPath(TOKENS_PATH, 'ok'), 303)
    })

    return app
}
