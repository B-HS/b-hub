import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { ManageShell } from '../components'
import { CsrfField } from '../../admin/components'
import { flashPath, parseFlash } from '../../admin/flash'
import type { AdminSessionUser } from '../../admin/guard'
import type { Flash } from '../../admin/flash'
import type { ManageContext, ManageGetSession } from '../guard'
import { requireSessionPage } from '../guard'
import { emptyToUndefined, errorToFlashCode, parseId } from '../util'
import type { MailSyncService } from '../../../service/domain/mail/mail-sync'
import type { MailAccountService } from '../../../service/domain/mail/mail-account'
import { MAIL_HISTORICAL_BATCH_SIZE_DEFAULT, MAIL_HISTORICAL_BATCH_SIZE_MAX, MAIL_HISTORICAL_BATCH_SIZE_MIN } from '../../../dto/mail/sync'

type ManageMailSyncDeps = {
    getSession: ManageGetSession
    mailSyncService?: MailSyncService
    mailAccountService?: MailAccountService
}

type AccountRow = Awaited<ReturnType<MailAccountService['list']>>[number]
type SyncStatus = Awaited<ReturnType<MailSyncService['getSyncStatus']>>

const MAIL_SYNC_PATH = '/manage/mail/sync'

const clampBatchSize = (value: number | null) =>
    value === null ? MAIL_HISTORICAL_BATCH_SIZE_DEFAULT : Math.min(Math.max(value, MAIL_HISTORICAL_BATCH_SIZE_MIN), MAIL_HISTORICAL_BATCH_SIZE_MAX)

const NotConfiguredPage: FC<{ user: AdminSessionUser }> = ({ user }) => (
    <ManageShell title='Mail Sync' subtitle='메일 동기화' user={user} currentPath={MAIL_SYNC_PATH}>
        <div class='banner err' role='alert'>
            메일 기능이 아직 구성되지 않았습니다.
        </div>
    </ManageShell>
)

const SyncPage: FC<{ user: AdminSessionUser; accounts: AccountRow[]; accountId?: string; status: SyncStatus | null; flash?: Flash | null }> = ({
    user,
    accounts,
    accountId,
    status,
    flash,
}) => (
    <ManageShell title='Mail Sync' subtitle='메일 동기화' user={user} currentPath={MAIL_SYNC_PATH} flash={flash}>
        <div class='card'>
            <h2 class='card-title'>동기화 상태 조회</h2>
            <form method='get' action={MAIL_SYNC_PATH} class='form-inline'>
                <div class='field'>
                    <label for='status-account'>Account</label>
                    <select id='status-account' class='select' name='accountId'>
                        <option value=''>선택</option>
                        {accounts.map((a) => (
                            <option key={a.id} value={a.id} selected={accountId === String(a.id)}>
                                {a.email}
                            </option>
                        ))}
                    </select>
                </div>
                <button class='btn outline' type='submit'>
                    조회
                </button>
            </form>
            {status && <pre class='mono prewrap mt-sm'>{JSON.stringify(status, null, 2)}</pre>}
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>Incremental 동기화</h3>
            <form method='post' action={MAIL_SYNC_PATH} class='form-inline'>
                <CsrfField />
                <div class='field'>
                    <label for='sync-account'>Account</label>
                    <select id='sync-account' class='select' name='accountId' required>
                        {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.email}
                            </option>
                        ))}
                    </select>
                </div>
                <div class='field'>
                    <label for='sync-folder'>Folder ID (선택)</label>
                    <input id='sync-folder' class='input' type='number' name='folderId' />
                </div>
                <button class='btn' type='submit'>
                    동기화
                </button>
            </form>
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>Historical 배치 동기화</h3>
            <form method='post' action={`${MAIL_SYNC_PATH}/historical`} class='form-inline'>
                <CsrfField />
                <div class='field'>
                    <label for='hist-account'>Account</label>
                    <select id='hist-account' class='select' name='accountId' required>
                        {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.email}
                            </option>
                        ))}
                    </select>
                </div>
                <div class='field'>
                    <label for='hist-folder'>Folder ID (선택)</label>
                    <input id='hist-folder' class='input' type='number' name='folderId' />
                </div>
                <div class='field'>
                    <label for='hist-batch'>Batch size</label>
                    <input
                        id='hist-batch'
                        class='input'
                        type='number'
                        name='batchSize'
                        value={MAIL_HISTORICAL_BATCH_SIZE_DEFAULT}
                        min={MAIL_HISTORICAL_BATCH_SIZE_MIN}
                        max={MAIL_HISTORICAL_BATCH_SIZE_MAX}
                    />
                </div>
                <div class='field'>
                    <label for='hist-cursor'>Cursor (선택)</label>
                    <input id='hist-cursor' class='input' name='cursor' maxlength={500} />
                </div>
                <button class='btn' type='submit'>
                    배치 실행
                </button>
            </form>
        </div>
    </ManageShell>
)

export const createManageMailSyncRoute = (deps: ManageMailSyncDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailSyncService) return c.html(<NotConfiguredPage user={user} />)
        const accounts = deps.mailAccountService ? await deps.mailAccountService.list(user.id) : []
        const accountIdRaw = c.req.query('accountId')
        const accountId = parseId(accountIdRaw)
        let status: SyncStatus | null = null
        if (accountId !== null) {
            try {
                status = await deps.mailSyncService.getSyncStatus(accountId, user.id)
            } catch {
                status = null
            }
        }
        return c.html(<SyncPage user={user} accounts={accounts} accountId={accountIdRaw} status={status} flash={parseFlash(c)} />)
    })

    app.post('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailSyncService) return c.redirect(flashPath(MAIL_SYNC_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const accountId = parseId(body.accountId)
        if (accountId === null) return c.redirect(flashPath(MAIL_SYNC_PATH, 'err', 'validation'), 303)
        const folderId = parseId(body.folderId) ?? undefined
        try {
            await deps.mailSyncService.syncAccount(accountId, user.id, folderId)
            return c.redirect(flashPath(MAIL_SYNC_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(MAIL_SYNC_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/historical', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailSyncService) return c.redirect(flashPath(MAIL_SYNC_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const accountId = parseId(body.accountId)
        if (accountId === null) return c.redirect(flashPath(MAIL_SYNC_PATH, 'err', 'validation'), 303)
        const folderId = parseId(body.folderId) ?? undefined
        const batchSize = clampBatchSize(parseId(body.batchSize))
        try {
            await deps.mailSyncService.syncHistorical(accountId, user.id, { folderId, batchSize, cursor: emptyToUndefined(body.cursor) })
            return c.redirect(flashPath(MAIL_SYNC_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(MAIL_SYNC_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    return app
}
