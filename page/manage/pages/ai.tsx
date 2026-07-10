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
import { aiProviderKeyCreateSchema } from '../../../dto/ai/key'
import { AI_PROVIDERS } from '../../../dto/ai/provider'
import { isAppError } from '../../../lib/error'
import type { AiService } from '../../../service/domain/ai/ai'

type ManageAiKeysDeps = {
    getSession: ManageGetSession
    aiService?: AiService
}

type KeyRow = Awaited<ReturnType<AiService['listKeys']>>[number]
type AiStatus = Awaited<ReturnType<AiService['getStatus']>>

const AI_KEYS_PATH = '/manage/ai/keys'

const AI_ERROR_FLASH_CODE: Record<string, string> = {
    AI_KEY_LIMIT: 'ai_key_limit',
    AI_ENCRYPTION_FAILED: 'ai_encryption_failed',
}

const emptyToUndefined = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
}

const NotConfiguredPage: FC<{ user: AdminSessionUser }> = ({ user }) => (
    <ManageShell title='AI Provider Keys' subtitle='AI 프로바이더 인증 키 관리' user={user} currentPath={AI_KEYS_PATH}>
        <div class='banner err' role='alert'>
            AI 기능이 아직 구성되지 않았습니다. 관리자에게 문의해 주세요.
        </div>
    </ManageShell>
)

const KeysPage: FC<{ user: AdminSessionUser; rows: KeyRow[]; status: AiStatus; flash?: Flash | null }> = ({ user, rows, status, flash }) => (
    <ManageShell title='AI Provider Keys' subtitle='AI 프로바이더 인증 키 관리' user={user} currentPath={AI_KEYS_PATH} flash={flash}>
        <div class='card'>
            <h2 class='card-title'>프로바이더 연동 상태</h2>
            <div class='hstack wrap'>
                {status.map((s) => (
                    <span key={s.provider} class='inline-hstack'>
                        <Badge kind={s.connected ? 'success' : 'muted'}>{s.provider}</Badge>
                        <span class='text-muted'>{s.connected ? `${s.keyCount} key(s)` : '미연동'}</span>
                    </span>
                ))}
            </div>
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>새 키 등록</h3>
            <form method='post' action={AI_KEYS_PATH} class='form-stack'>
                <CsrfField />
                <div class='hstack wrap'>
                    <div class='field'>
                        <label for='ai-provider'>Provider</label>
                        <select id='ai-provider' class='select' name='provider'>
                            {AI_PROVIDERS.map((p) => (
                                <option key={p} value={p}>
                                    {p}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div class='field field-grow'>
                        <label for='ai-label'>Label</label>
                        <input id='ai-label' class='input input-block' name='label' required maxlength={100} placeholder='예: 개인 OpenAI' />
                    </div>
                </div>
                <div class='field'>
                    <label for='ai-credential'>Credential (API key / access token)</label>
                    <input id='ai-credential' class='input input-block' type='password' name='credential' required autocomplete='off' />
                </div>
                <div class='hstack wrap'>
                    <div class='field field-grow'>
                        <label for='ai-baseurl'>Base URL (omlx 필수)</label>
                        <input id='ai-baseurl' class='input input-block' type='url' name='baseUrl' placeholder='https://...' />
                    </div>
                    <div class='field field-grow'>
                        <label for='ai-model'>Default Model (선택)</label>
                        <input id='ai-model' class='input input-block' name='defaultModel' maxlength={100} placeholder='예: gpt-4o-mini' />
                    </div>
                </div>
                <div>
                    <button class='btn' type='submit'>
                        등록
                    </button>
                </div>
            </form>
            <p class='text-muted mt-sm'>키 원문은 등록 시 한 번만 사용되며, 저장 후에는 마스킹된 값만 표시됩니다.</p>
        </div>

        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='등록된 키가 없습니다.'
            columns={
                [
                    { key: 'provider', header: 'Provider', cell: (r) => <Badge kind='secondary'>{r.provider}</Badge> },
                    { key: 'label', header: 'Label', cell: (r) => r.label },
                    { key: 'credential', header: 'Credential', cell: (r) => <span class='mono'>{r.credentialMasked}</span> },
                    { key: 'baseUrl', header: 'Base URL', cell: (r) => <span class='mono'>{r.baseUrl ?? '-'}</span>, className: 'truncate' },
                    { key: 'model', header: 'Model', cell: (r) => r.defaultModel ?? '-' },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction action={`${AI_KEYS_PATH}/${r.id}/delete`} label='삭제' variant='destructive' returnTo={AI_KEYS_PATH} />
                        ),
                    },
                ] as Column<KeyRow>[]
            }
        />
    </ManageShell>
)

export const createManageAiKeysRoute = (deps: ManageAiKeysDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.aiService) return c.html(<NotConfiguredPage user={user} />)
        const [rows, status] = await Promise.all([deps.aiService.listKeys(user.id), deps.aiService.getStatus(user.id)])
        return c.html(<KeysPage user={user} rows={rows} status={status} flash={parseFlash(c)} />)
    })

    app.post('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.aiService) return c.redirect(flashPath(AI_KEYS_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const parsed = aiProviderKeyCreateSchema.safeParse({
            provider: body.provider,
            label: emptyToUndefined(body.label),
            credential: typeof body.credential === 'string' ? body.credential : undefined,
            baseUrl: emptyToUndefined(body.baseUrl),
            defaultModel: emptyToUndefined(body.defaultModel),
        })
        if (!parsed.success) return c.redirect(flashPath(AI_KEYS_PATH, 'err', 'validation'), 303)
        try {
            await deps.aiService.addKey(user.id, parsed.data)
            return c.redirect(flashPath(AI_KEYS_PATH, 'ok'), 303)
        } catch (error) {
            const code = isAppError(error) ? AI_ERROR_FLASH_CODE[error.code] ?? 'unknown' : 'unknown'
            return c.redirect(flashPath(AI_KEYS_PATH, 'err', code), 303)
        }
    })

    app.post('/:id/delete', async (c) => {
        const user = c.get('manageUser')
        if (!deps.aiService) return c.redirect(flashPath(AI_KEYS_PATH, 'err', 'not_configured'), 303)
        const id = c.req.param('id')
        const result = await deps.aiService.deleteKey(user.id, id)
        return c.redirect(flashPath(AI_KEYS_PATH, result.deleted ? 'ok' : 'err', result.deleted ? undefined : 'not_found'), 303)
    })

    return app
}
