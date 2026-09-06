import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { ManageShell, RevealBanner } from '../components'
import { Badge, CsrfField, DataTable, RowAction, type Column } from '../../admin/components'
import { flashPath, parseFlash } from '../../admin/flash'
import { formatDate } from '../../admin/format'
import type { AdminSessionUser } from '../../admin/guard'
import { setRevealValue, takeRevealValue } from '../../admin/guard'
import type { Flash } from '../../admin/flash'
import type { ManageContext, ManageGetSession } from '../guard'
import { requireSessionPage } from '../guard'
import { emptyToUndefined, errorToFlashCode, parseId } from '../util'
import type { SpotifyWidgetTokenService } from '../../../service/domain/spotify/spotify-widget-token'
import type { SpotifyAccountService } from '../../../service/domain/spotify/spotify-account'

type ManageSpotifyWidgetTokensDeps = {
    getSession: ManageGetSession
    spotifyWidgetTokenService?: SpotifyWidgetTokenService
    spotifyAccountService?: SpotifyAccountService
}

type TokenRow = Awaited<ReturnType<SpotifyWidgetTokenService['listByUser']>>[number]
type AccountRow = Awaited<ReturnType<SpotifyAccountService['list']>>[number]

const SPOTIFY_WIDGET_TOKENS_PATH = '/manage/spotify/widget-tokens'

const NotConfiguredPage: FC<{ user: AdminSessionUser }> = ({ user }) => (
    <ManageShell title='Spotify Widget Tokens' subtitle='위젯 토큰' user={user} currentPath={SPOTIFY_WIDGET_TOKENS_PATH}>
        <div class='banner err' role='alert'>
            Spotify 기능이 아직 구성되지 않았습니다.
        </div>
    </ManageShell>
)

const TokensPage: FC<{ user: AdminSessionUser; rows: TokenRow[]; accounts: AccountRow[]; flash?: Flash | null; revealedToken?: string }> = ({
    user,
    rows,
    accounts,
    flash,
    revealedToken,
}) => (
    <ManageShell title='Spotify Widget Tokens' subtitle='위젯 토큰' user={user} currentPath={SPOTIFY_WIDGET_TOKENS_PATH} flash={flash}>
        {revealedToken && (
            <RevealBanner label='발급된 위젯 토큰' value={revealedToken} note='이 토큰은 다시 표시되지 않습니다. 안전한 곳에 보관해 주세요.' />
        )}
        <div class='card'>
            <h3 class='card-title-sm'>새 위젯 토큰</h3>
            <form method='post' action={SPOTIFY_WIDGET_TOKENS_PATH} class='form-inline'>
                <CsrfField />
                <div class='field'>
                    <label for='wt-account'>Account</label>
                    <select id='wt-account' class='select' name='spotifyAccountId' required>
                        {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.displayName ?? a.spotifyUserId}
                            </option>
                        ))}
                    </select>
                </div>
                <div class='field field-grow'>
                    <label for='wt-name'>이름 (선택)</label>
                    <input id='wt-name' class='input input-block' name='name' maxlength={100} />
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
                    { key: 'account', header: 'Account ID', cell: (r) => r.spotifyAccountId, className: 'num' },
                    {
                        key: 'active',
                        header: 'Active',
                        cell: (r) => <Badge kind={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'ON' : 'OFF'}</Badge>,
                    },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'toggle',
                        header: '활성토글',
                        cell: (r) => (
                            <RowAction
                                action={`${SPOTIFY_WIDGET_TOKENS_PATH}/${r.id}/toggle`}
                                label={r.isActive ? '비활성화' : '활성화'}
                                variant='ghost'
                                hidden={{ isActive: r.isActive ? 'false' : 'true' }}
                                returnTo={SPOTIFY_WIDGET_TOKENS_PATH}
                            />
                        ),
                    },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`${SPOTIFY_WIDGET_TOKENS_PATH}/${r.id}/delete`}
                                label='폐기'
                                variant='destructive'
                                returnTo={SPOTIFY_WIDGET_TOKENS_PATH}
                            />
                        ),
                    },
                ] as Column<TokenRow>[]
            }
        />
    </ManageShell>
)

export const createManageSpotifyWidgetTokensRoute = (deps: ManageSpotifyWidgetTokensDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    const loadPage = async (userId: string) => {
        const [rows, accounts] = await Promise.all([
            deps.spotifyWidgetTokenService!.listByUser(userId),
            deps.spotifyAccountService ? deps.spotifyAccountService.list(userId) : Promise.resolve([] as AccountRow[]),
        ])
        return { rows, accounts }
    }

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.spotifyWidgetTokenService) return c.html(<NotConfiguredPage user={user} />)
        const { rows, accounts } = await loadPage(user.id)
        return c.html(
            <TokensPage
                user={user}
                rows={rows}
                accounts={accounts}
                flash={parseFlash(c)}
                revealedToken={takeRevealValue(c, SPOTIFY_WIDGET_TOKENS_PATH)}
            />,
        )
    })

    app.post('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.spotifyWidgetTokenService || !deps.spotifyAccountService)
            return c.redirect(flashPath(SPOTIFY_WIDGET_TOKENS_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const spotifyAccountId = parseId(body.spotifyAccountId)
        if (spotifyAccountId === null) return c.redirect(flashPath(SPOTIFY_WIDGET_TOKENS_PATH, 'err', 'validation'), 303)
        try {
            await deps.spotifyAccountService.getById(spotifyAccountId, user.id)
            const { token } = await deps.spotifyWidgetTokenService.create(user.id, spotifyAccountId, emptyToUndefined(body.name))
            setRevealValue(c, SPOTIFY_WIDGET_TOKENS_PATH, token)
            return c.redirect(SPOTIFY_WIDGET_TOKENS_PATH, 303)
        } catch (error) {
            return c.redirect(flashPath(SPOTIFY_WIDGET_TOKENS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/toggle', async (c) => {
        const user = c.get('manageUser')
        if (!deps.spotifyWidgetTokenService) return c.redirect(flashPath(SPOTIFY_WIDGET_TOKENS_PATH, 'err', 'not_configured'), 303)
        const id = parseId(c.req.param('id'))
        if (id === null) return c.redirect(flashPath(SPOTIFY_WIDGET_TOKENS_PATH, 'err', 'validation'), 303)
        const body = await c.req.parseBody()
        try {
            await deps.spotifyWidgetTokenService.toggleActive(user.id, id, body.isActive === 'true')
            return c.redirect(flashPath(SPOTIFY_WIDGET_TOKENS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(SPOTIFY_WIDGET_TOKENS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/delete', async (c) => {
        const user = c.get('manageUser')
        if (!deps.spotifyWidgetTokenService) return c.redirect(flashPath(SPOTIFY_WIDGET_TOKENS_PATH, 'err', 'not_configured'), 303)
        const id = parseId(c.req.param('id'))
        if (id === null) return c.redirect(flashPath(SPOTIFY_WIDGET_TOKENS_PATH, 'err', 'validation'), 303)
        try {
            await deps.spotifyWidgetTokenService.revoke(user.id, id)
            return c.redirect(flashPath(SPOTIFY_WIDGET_TOKENS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(SPOTIFY_WIDGET_TOKENS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    return app
}
