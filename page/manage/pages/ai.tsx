import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { AiProviderStatusList, ManageShell } from '../components'
import { Badge, CsrfField, DataTable, RowAction, type Column } from '../../admin/components'
import { flashPath, parseFlash } from '../../admin/flash'
import { formatDate } from '../../admin/format'
import type { AdminSessionUser } from '../../admin/guard'
import type { Flash } from '../../admin/flash'
import type { ManageContext, ManageGetSession } from '../guard'
import { requireSessionPage } from '../guard'
import { aiProviderStatusBadgeKind, emptyToUndefined, errorToFlashCode, parseId } from '../util'
import { AI_PROVIDER, aiProviderCreateSchema } from '../../../dto/ai/provider'
import type { AiConnectionService } from '../../../service/domain/ai/ai-connection'

type ManageAiProvidersDeps = {
    getSession: ManageGetSession
    aiConnectionService?: AiConnectionService
}

type ProviderRow = Awaited<ReturnType<AiConnectionService['list']>>[number]

const AI_PROVIDERS_PATH = '/manage/ai/providers'
const PROVIDER_NAMES = Object.values(AI_PROVIDER)

const NotConfiguredPage: FC<{ user: AdminSessionUser }> = ({ user }) => (
    <ManageShell title='AI Providers' subtitle='내 AI 프로바이더 연결 관리' user={user} currentPath={AI_PROVIDERS_PATH}>
        <div class='banner err' role='alert'>
            AI 기능이 아직 구성되지 않았습니다. 관리자에게 문의해 주세요.
        </div>
    </ManageShell>
)

const ProvidersPage: FC<{ user: AdminSessionUser; rows: ProviderRow[]; flash?: Flash | null }> = ({ user, rows, flash }) => (
    <ManageShell title='AI Providers' subtitle='내 AI 프로바이더 연결 관리' user={user} currentPath={AI_PROVIDERS_PATH} flash={flash}>
        <div class='card'>
            <h2 class='card-title'>프로바이더 연결 상태</h2>
            <AiProviderStatusList rows={rows} />
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>프로바이더 연결</h3>
            <form method='post' action={AI_PROVIDERS_PATH} class='form-stack'>
                <CsrfField />
                <div class='hstack wrap'>
                    <div class='field'>
                        <label for='ai-provider'>Provider</label>
                        <select id='ai-provider' class='select' name='provider'>
                            {PROVIDER_NAMES.map((p) => (
                                <option key={p} value={p}>
                                    {p}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div class='field field-grow'>
                        <label for='ai-display-name'>Display name (선택)</label>
                        <input id='ai-display-name' class='input input-block' name='displayName' maxlength={100} placeholder='예: 개인 Anthropic' />
                    </div>
                </div>
                <div class='field'>
                    <label for='ai-api-key'>API Key (anthropic·ollama)</label>
                    <input id='ai-api-key' class='input input-block' type='password' name='apiKey' autocomplete='off' />
                </div>
                <div class='field'>
                    <label for='ai-id-token'>ID Token (codex)</label>
                    <input id='ai-id-token' class='input input-block' type='password' name='idToken' autocomplete='off' />
                </div>
                <div class='field'>
                    <label for='ai-access-token'>Access Token (codex)</label>
                    <input id='ai-access-token' class='input input-block' type='password' name='accessToken' autocomplete='off' />
                </div>
                <div class='field'>
                    <label for='ai-refresh-token'>Refresh Token (codex)</label>
                    <input id='ai-refresh-token' class='input input-block' type='password' name='refreshToken' autocomplete='off' />
                </div>
                <div class='field'>
                    <label for='ai-account-id'>Account ID (codex·선택)</label>
                    <input id='ai-account-id' class='input input-block' name='accountId' maxlength={255} autocomplete='off' />
                </div>
                <div>
                    <button class='btn' type='submit'>
                        연결
                    </button>
                </div>
            </form>
            <p class='text-muted mt-sm'>
                codex 는 ID·Access·Refresh Token 3개를, anthropic·ollama 는 API Key 를 입력합니다. 등록 전 자격증명을 검증하며, 이미 연결된
                프로바이더는 자격증명이 갱신(재인증)됩니다.
            </p>
        </div>

        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='연결된 프로바이더가 없습니다.'
            columns={
                [
                    { key: 'provider', header: 'Provider', cell: (r) => <Badge kind='secondary'>{r.provider}</Badge> },
                    { key: 'auth', header: 'Auth', cell: (r) => r.authType },
                    { key: 'status', header: 'Status', cell: (r) => <Badge kind={aiProviderStatusBadgeKind(r.status)}>{r.status}</Badge> },
                    { key: 'detail', header: 'Detail', cell: (r) => r.statusDetail ?? '-', className: 'truncate' },
                    { key: 'name', header: 'Name', cell: (r) => r.displayName ?? '-' },
                    { key: 'used', header: 'Last used', cell: (r) => formatDate(r.lastUsedAt), className: 'nowrap' },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`${AI_PROVIDERS_PATH}/${r.id}/delete`}
                                label='삭제'
                                variant='destructive'
                                confirm='이 프로바이더 연결을 삭제할까요?'
                                returnTo={AI_PROVIDERS_PATH}
                            />
                        ),
                    },
                ] as Column<ProviderRow>[]
            }
        />
    </ManageShell>
)

export const createManageAiProvidersRoute = (deps: ManageAiProvidersDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.aiConnectionService) return c.html(<NotConfiguredPage user={user} />)
        const rows = await deps.aiConnectionService.list(user.id)
        return c.html(<ProvidersPage user={user} rows={rows} flash={parseFlash(c)} />)
    })

    app.post('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.aiConnectionService) return c.redirect(flashPath(AI_PROVIDERS_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const credentials =
            body.provider === AI_PROVIDER.CODEX
                ? {
                      idToken: body.idToken,
                      accessToken: body.accessToken,
                      refreshToken: body.refreshToken,
                      accountId: emptyToUndefined(body.accountId),
                  }
                : { apiKey: body.apiKey }
        const parsed = aiProviderCreateSchema.safeParse({
            provider: body.provider,
            displayName: emptyToUndefined(body.displayName),
            credentials,
        })
        if (!parsed.success) return c.redirect(flashPath(AI_PROVIDERS_PATH, 'err', 'validation'), 303)
        try {
            await deps.aiConnectionService.connect(user.id, parsed.data)
            return c.redirect(flashPath(AI_PROVIDERS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(AI_PROVIDERS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/delete', async (c) => {
        const user = c.get('manageUser')
        if (!deps.aiConnectionService) return c.redirect(flashPath(AI_PROVIDERS_PATH, 'err', 'not_configured'), 303)
        const id = parseId(c.req.param('id'))
        if (!id) return c.redirect(flashPath(AI_PROVIDERS_PATH, 'err', 'not_found'), 303)
        try {
            await deps.aiConnectionService.remove(user.id, id)
            return c.redirect(flashPath(AI_PROVIDERS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(AI_PROVIDERS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    return app
}
