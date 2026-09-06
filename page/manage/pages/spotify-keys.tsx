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
import { emptyToUndefined, errorToFlashCode, parseId } from '../util'
import type { SpotifyApiKeyService } from '../../../service/domain/spotify/spotify-api-key'
import type { SpotifyAccountService } from '../../../service/domain/spotify/spotify-account'

type ManageSpotifyKeysDeps = {
    getSession: ManageGetSession
    spotifyApiKeyService?: SpotifyApiKeyService
    spotifyAccountService?: SpotifyAccountService
}

type KeyRow = Awaited<ReturnType<SpotifyApiKeyService['listByUser']>>[number]
type AccountRow = Awaited<ReturnType<SpotifyAccountService['list']>>[number]

const SPOTIFY_KEYS_PATH = '/manage/spotify/keys'

const NotConfiguredPage: FC<{ user: AdminSessionUser }> = ({ user }) => (
    <ManageShell title='Spotify API Keys' subtitle='Spotify API 키' user={user} currentPath={SPOTIFY_KEYS_PATH}>
        <div class='banner err' role='alert'>
            Spotify 기능이 아직 구성되지 않았습니다.
        </div>
    </ManageShell>
)

const KeysPage: FC<{ user: AdminSessionUser; rows: KeyRow[]; accounts: AccountRow[]; flash?: Flash | null; revealedToken?: string }> = ({
    user,
    rows,
    accounts,
    flash,
    revealedToken,
}) => (
    <ManageShell title='Spotify API Keys' subtitle='Spotify API 키' user={user} currentPath={SPOTIFY_KEYS_PATH} flash={flash}>
        {revealedToken && (
            <RevealBanner label='발급된 Spotify API 키' value={revealedToken} note='이 키는 다시 표시되지 않습니다. 안전한 곳에 보관해 주세요.' />
        )}
        <div class='card'>
            <h3 class='card-title-sm'>새 키 발급</h3>
            <form method='post' action={SPOTIFY_KEYS_PATH} class='form-inline'>
                <CsrfField />
                <div class='field'>
                    <label for='key-account'>Account</label>
                    <select id='key-account' class='select' name='spotifyAccountId' required>
                        {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.displayName ?? a.spotifyUserId}
                            </option>
                        ))}
                    </select>
                </div>
                <div class='field field-grow'>
                    <label for='key-name'>이름 (선택)</label>
                    <input id='key-name' class='input input-block' name='name' maxlength={100} />
                </div>
                <button class='btn' type='submit'>
                    발급
                </button>
            </form>
        </div>

        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='발급된 키가 없습니다.'
            columns={
                [
                    { key: 'name', header: 'Name', cell: (r) => r.name ?? '-' },
                    { key: 'account', header: 'Account ID', cell: (r) => r.spotifyAccountId, className: 'num' },
                    { key: 'lastUsed', header: 'Last used', cell: (r) => formatDate(r.lastUsedAt), className: 'nowrap' },
                    { key: 'expires', header: 'Expires', cell: (r) => formatDate(r.expiresAt), className: 'nowrap' },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`${SPOTIFY_KEYS_PATH}/${r.id}/delete`}
                                label='폐기'
                                variant='destructive'
                                returnTo={SPOTIFY_KEYS_PATH}
                            />
                        ),
                    },
                ] as Column<KeyRow>[]
            }
        />
    </ManageShell>
)

export const createManageSpotifyKeysRoute = (deps: ManageSpotifyKeysDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    const loadPage = async (userId: string) => {
        const [rows, accounts] = await Promise.all([
            deps.spotifyApiKeyService!.listByUser(userId),
            deps.spotifyAccountService ? deps.spotifyAccountService.list(userId) : Promise.resolve([] as AccountRow[]),
        ])
        return { rows, accounts }
    }

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.spotifyApiKeyService) return c.html(<NotConfiguredPage user={user} />)
        const { rows, accounts } = await loadPage(user.id)
        return c.html(
            <KeysPage user={user} rows={rows} accounts={accounts} flash={parseFlash(c)} revealedToken={takeRevealValue(c, SPOTIFY_KEYS_PATH)} />,
        )
    })

    app.post('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.spotifyApiKeyService || !deps.spotifyAccountService) return c.redirect(flashPath(SPOTIFY_KEYS_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const spotifyAccountId = parseId(body.spotifyAccountId)
        if (spotifyAccountId === null) return c.redirect(flashPath(SPOTIFY_KEYS_PATH, 'err', 'validation'), 303)
        try {
            await deps.spotifyAccountService.getById(spotifyAccountId, user.id)
            const token = await deps.spotifyApiKeyService.create(user.id, spotifyAccountId, emptyToUndefined(body.name))
            setRevealValue(c, SPOTIFY_KEYS_PATH, token)
            return c.redirect(SPOTIFY_KEYS_PATH, 303)
        } catch (error) {
            return c.redirect(flashPath(SPOTIFY_KEYS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/delete', async (c) => {
        const user = c.get('manageUser')
        if (!deps.spotifyApiKeyService) return c.redirect(flashPath(SPOTIFY_KEYS_PATH, 'err', 'not_configured'), 303)
        const id = parseId(c.req.param('id'))
        if (id === null) return c.redirect(flashPath(SPOTIFY_KEYS_PATH, 'err', 'validation'), 303)
        try {
            await deps.spotifyApiKeyService.revoke(user.id, id)
            return c.redirect(flashPath(SPOTIFY_KEYS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(SPOTIFY_KEYS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    return app
}
