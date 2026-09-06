import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { ManageShell, RevealBanner } from '../components'
import { CsrfField, DataTable, RowAction, type Column } from '../../admin/components'
import { flashPath, parseFlash } from '../../admin/flash'
import { formatDate } from '../../admin/format'
import type { AdminSessionUser } from '../../admin/guard'
import { setRevealValue, takeRevealValue } from '../../admin/guard'
import type { Flash } from '../../admin/flash'
import type { ManageContext, ManageGetSession } from '../guard'
import { requireSessionPage } from '../guard'
import type { ApiTokenService } from '../../../service/shared/api-token'

type ManageTokensDeps = {
    getSession: ManageGetSession
    apiTokenService: ApiTokenService
}

type TokenRow = Awaited<ReturnType<ApiTokenService['listByUser']>>[number]

const TOKENS_PATH = '/manage/tokens'

const TokensPage: FC<{ user: AdminSessionUser; rows: TokenRow[]; flash?: Flash | null; revealedToken?: string }> = ({
    user,
    rows,
    flash,
    revealedToken,
}) => (
    <ManageShell title='API Tokens' subtitle='프로그램 접근용 API 토큰' user={user} currentPath={TOKENS_PATH} flash={flash}>
        {revealedToken && (
            <RevealBanner label='발급된 API 토큰' value={revealedToken} note='이 토큰은 다시 표시되지 않습니다. 안전한 곳에 보관해 주세요.' />
        )}
        <div class='card'>
            <p class='text-muted'>이 토큰으로 AI 채팅 등 프로그램 접근이 가능합니다. (Authorization 헤더에 사용)</p>
            <h3 class='card-title-sm mt-sm'>새 토큰 발급</h3>
            <form method='post' action={TOKENS_PATH} class='form-inline'>
                <CsrfField />
                <div class='field field-grow'>
                    <label for='token-name'>이름 (선택)</label>
                    <input id='token-name' class='input input-block' name='name' maxlength={100} placeholder='예: CLI 스크립트' />
                </div>
                <button class='btn' type='submit'>
                    발급
                </button>
            </form>
        </div>
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='발급된 토큰이 없습니다.'
            columns={
                [
                    { key: 'name', header: 'Name', cell: (r) => r.name ?? '-' },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    { key: 'lastUsed', header: 'Last used', cell: (r) => formatDate(r.lastUsedAt), className: 'nowrap' },
                    { key: 'expires', header: 'Expires', cell: (r) => formatDate(r.expiresAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => <RowAction action={`${TOKENS_PATH}/${r.id}/delete`} label='폐기' variant='destructive' returnTo={TOKENS_PATH} />,
                    },
                ] as Column<TokenRow>[]
            }
        />
    </ManageShell>
)

export const createManageTokensRoute = (deps: ManageTokensDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        const rows = await deps.apiTokenService.listByUser(user.id)
        return c.html(<TokensPage user={user} rows={rows} flash={parseFlash(c)} revealedToken={takeRevealValue(c, TOKENS_PATH)} />)
    })

    app.post('/', async (c) => {
        const user = c.get('manageUser')
        const body = await c.req.parseBody<{ name?: string }>()
        const name = typeof body.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : undefined
        const token = await deps.apiTokenService.create(user.id, name)
        setRevealValue(c, TOKENS_PATH, token)
        return c.redirect(TOKENS_PATH, 303)
    })

    app.post('/:id/delete', async (c) => {
        const user = c.get('manageUser')
        const id = Number(c.req.param('id'))
        if (Number.isInteger(id) && id > 0) await deps.apiTokenService.revokeById(user.id, id)
        return c.redirect(flashPath(TOKENS_PATH, 'ok'), 303)
    })

    return app
}
