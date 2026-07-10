import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { ManageShell } from '../components'
import { Badge, CsrfField, DataTable, RowAction, type Column } from '../../admin/components'
import { flashPath, parseFlash } from '../../admin/flash'
import { formatDate } from '../../admin/format'
import type { AdminSessionUser } from '../../admin/guard'
import type { Flash } from '../../admin/flash'
import type { ManageContext, ManageGetSession } from '../guard'
import { requireSessionPage } from '../guard'
import { emptyToUndefined, errorToFlashCode, parseCheckbox, parseId } from '../util'
import type { SpotifyAccountService } from '../../../service/domain/spotify/spotify-account'

type ManageSpotifyAccountsDeps = {
    getSession: ManageGetSession
    spotifyAccountService?: SpotifyAccountService
}

type AccountRow = Awaited<ReturnType<SpotifyAccountService['list']>>[number]

const SPOTIFY_ACCOUNTS_PATH = '/manage/spotify/accounts'

const NotConfiguredPage: FC<{ user: AdminSessionUser }> = ({ user }) => (
    <ManageShell title='Spotify Accounts' subtitle='Spotify 계정' user={user} currentPath={SPOTIFY_ACCOUNTS_PATH}>
        <div class='banner err' role='alert'>
            Spotify 기능이 아직 구성되지 않았습니다.
        </div>
    </ManageShell>
)

const AccountsPage: FC<{ user: AdminSessionUser; rows: AccountRow[]; flash?: Flash | null }> = ({ user, rows, flash }) => (
    <ManageShell title='Spotify Accounts' subtitle='Spotify 계정' user={user} currentPath={SPOTIFY_ACCOUNTS_PATH} flash={flash}>
        <div class='card'>
            <h2 class='card-title'>계정 연결</h2>
            <p class='text-muted'>Spotify 계정으로 로그인해 재생 정보 접근을 연결합니다.</p>
            <a class='btn' href='/api/spotify/accounts/connect'>
                Spotify 연결
            </a>
        </div>

        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='연결된 계정이 없습니다.'
            columns={
                [
                    { key: 'spotifyUserId', header: 'Spotify User', cell: (r) => <span class='mono'>{r.spotifyUserId}</span> },
                    { key: 'display', header: 'Name', cell: (r) => r.displayName ?? '-' },
                    { key: 'email', header: 'Email', cell: (r) => r.email ?? '-' },
                    {
                        key: 'active',
                        header: 'Active',
                        cell: (r) => <Badge kind={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'ON' : 'OFF'}</Badge>,
                    },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'update',
                        header: '수정',
                        cell: (r) => (
                            <form method='post' action={`${SPOTIFY_ACCOUNTS_PATH}/${r.id}/update`} class='form-inline'>
                                <CsrfField />
                                <input class='input' name='displayName' value={r.displayName ?? ''} placeholder='이름' />
                                <label class='checkbox-row'>
                                    <input type='checkbox' name='isActive' value='true' checked={r.isActive} />
                                    활성
                                </label>
                                <button class='btn sm outline' type='submit'>
                                    저장
                                </button>
                            </form>
                        ),
                    },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`${SPOTIFY_ACCOUNTS_PATH}/${r.id}/delete`}
                                label='삭제'
                                variant='destructive'
                                returnTo={SPOTIFY_ACCOUNTS_PATH}
                            />
                        ),
                    },
                ] as Column<AccountRow>[]
            }
        />
    </ManageShell>
)

export const createManageSpotifyAccountsRoute = (deps: ManageSpotifyAccountsDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.spotifyAccountService) return c.html(<NotConfiguredPage user={user} />)
        const rows = await deps.spotifyAccountService.list(user.id)
        return c.html(<AccountsPage user={user} rows={rows} flash={parseFlash(c)} />)
    })

    app.post('/:id/update', async (c) => {
        const user = c.get('manageUser')
        if (!deps.spotifyAccountService) return c.redirect(flashPath(SPOTIFY_ACCOUNTS_PATH, 'err', 'not_configured'), 303)
        const id = parseId(c.req.param('id'))
        if (id === null) return c.redirect(flashPath(SPOTIFY_ACCOUNTS_PATH, 'err', 'validation'), 303)
        const body = await c.req.parseBody()
        try {
            await deps.spotifyAccountService.update(id, user.id, {
                displayName: emptyToUndefined(body.displayName),
                isActive: parseCheckbox(body.isActive),
            })
            return c.redirect(flashPath(SPOTIFY_ACCOUNTS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(SPOTIFY_ACCOUNTS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/delete', async (c) => {
        const user = c.get('manageUser')
        if (!deps.spotifyAccountService) return c.redirect(flashPath(SPOTIFY_ACCOUNTS_PATH, 'err', 'not_configured'), 303)
        const id = parseId(c.req.param('id'))
        if (id === null) return c.redirect(flashPath(SPOTIFY_ACCOUNTS_PATH, 'err', 'validation'), 303)
        try {
            await deps.spotifyAccountService.remove(id, user.id)
            return c.redirect(flashPath(SPOTIFY_ACCOUNTS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(SPOTIFY_ACCOUNTS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    return app
}
