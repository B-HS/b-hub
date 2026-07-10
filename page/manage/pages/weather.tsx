import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { ManageShell, RevealBanner } from '../components'
import { CsrfField, DataTable, RowAction, type Column } from '../../admin/components'
import { flashPath, parseFlash } from '../../admin/flash'
import { formatDate } from '../../admin/format'
import type { AdminSessionUser } from '../../admin/guard'
import type { Flash } from '../../admin/flash'
import type { ManageContext, ManageGetSession } from '../guard'
import { requireSessionPage } from '../guard'
import type { WeatherApiKeyService } from '../../../service/domain/weather/weather-api-key'

type ManageWeatherKeysDeps = {
    getSession: ManageGetSession
    weatherApiKeyService: WeatherApiKeyService
}

type KeyRow = Awaited<ReturnType<WeatherApiKeyService['listByUser']>>[number]

const WEATHER_KEYS_PATH = '/manage/weather/keys'

const KeysPage: FC<{ user: AdminSessionUser; rows: KeyRow[]; flash?: Flash | null; revealedToken?: string }> = ({
    user,
    rows,
    flash,
    revealedToken,
}) => (
    <ManageShell title='Weather API Keys' subtitle='기상 API 접근 키' user={user} currentPath={WEATHER_KEYS_PATH} flash={flash}>
        {revealedToken && (
            <RevealBanner label='발급된 Weather 키' value={revealedToken} note='이 키는 다시 표시되지 않습니다. 안전한 곳에 보관해 주세요.' />
        )}
        <div class='card'>
            <h3 class='card-title-sm'>새 키 발급</h3>
            <form method='post' action={WEATHER_KEYS_PATH} class='form-inline'>
                <CsrfField />
                <div class='field field-grow'>
                    <label for='weather-name'>이름 (선택)</label>
                    <input id='weather-name' class='input input-block' name='name' maxlength={100} placeholder='예: 위젯용' />
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
                    { key: 'limit', header: 'Daily limit', cell: (r) => r.dailyLimit, className: 'num' },
                    { key: 'usage', header: 'Today', cell: (r) => r.todayUsage, className: 'num' },
                    { key: 'lastUsed', header: 'Last used', cell: (r) => formatDate(r.lastUsedAt), className: 'nowrap' },
                    { key: 'expires', header: 'Expires', cell: (r) => formatDate(r.expiresAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`${WEATHER_KEYS_PATH}/${r.id}/delete`}
                                label='폐기'
                                variant='destructive'
                                returnTo={WEATHER_KEYS_PATH}
                            />
                        ),
                    },
                ] as Column<KeyRow>[]
            }
        />
    </ManageShell>
)

export const createManageWeatherKeysRoute = (deps: ManageWeatherKeysDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        const rows = await deps.weatherApiKeyService.listByUser(user.id)
        return c.html(<KeysPage user={user} rows={rows} flash={parseFlash(c)} />)
    })

    app.post('/', async (c) => {
        const user = c.get('manageUser')
        const body = await c.req.parseBody<{ name?: string }>()
        const name = typeof body.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : undefined
        const token = await deps.weatherApiKeyService.create(user.id, name)
        const rows = await deps.weatherApiKeyService.listByUser(user.id)
        return c.html(<KeysPage user={user} rows={rows} revealedToken={token} />)
    })

    app.post('/:id/delete', async (c) => {
        const user = c.get('manageUser')
        const id = Number(c.req.param('id'))
        if (Number.isInteger(id) && id > 0) await deps.weatherApiKeyService.revoke(user.id, id)
        return c.redirect(flashPath(WEATHER_KEYS_PATH, 'ok'), 303)
    })

    return app
}
