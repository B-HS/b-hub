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
import { mailAccountCreateSchema } from '../../../dto/mail/account'
import type { MailAccountService } from '../../../service/domain/mail/mail-account'

type ManageMailAccountsDeps = {
    getSession: ManageGetSession
    mailAccountService?: MailAccountService
}

type AccountRow = Awaited<ReturnType<MailAccountService['list']>>[number]

const MAIL_ACCOUNTS_PATH = '/manage/mail/accounts'
const MAIL_PROVIDERS = ['gmail', 'naver', 'daum', 'imap'] as const

const NotConfiguredPage: FC<{ user: AdminSessionUser }> = ({ user }) => (
    <ManageShell title='Mail Accounts' subtitle='메일 계정 연결·관리' user={user} currentPath={MAIL_ACCOUNTS_PATH}>
        <div class='banner err' role='alert'>
            메일 기능이 아직 구성되지 않았습니다.
        </div>
    </ManageShell>
)

const AccountsPage: FC<{ user: AdminSessionUser; rows: AccountRow[]; flash?: Flash | null }> = ({ user, rows, flash }) => (
    <ManageShell title='Mail Accounts' subtitle='메일 계정 연결·관리' user={user} currentPath={MAIL_ACCOUNTS_PATH} flash={flash}>
        <div class='card'>
            <h2 class='card-title'>Gmail 연결 (OAuth)</h2>
            <p class='text-muted'>Google 계정으로 로그인해 메일 권한을 연결합니다.</p>
            <a class='btn' href='/api/mail/accounts/connect/google'>
                Gmail 연결
            </a>
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>직접 연결 (IMAP/SMTP)</h3>
            <form method='post' action={MAIL_ACCOUNTS_PATH} class='form-stack'>
                <CsrfField />
                <div class='hstack wrap'>
                    <div class='field'>
                        <label for='mail-provider'>Provider</label>
                        <select id='mail-provider' class='select' name='provider'>
                            {MAIL_PROVIDERS.map((p) => (
                                <option key={p} value={p}>
                                    {p}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div class='field field-grow'>
                        <label for='mail-email'>Email</label>
                        <input id='mail-email' class='input input-block' type='email' name='email' required placeholder='user@example.com' />
                    </div>
                    <div class='field field-grow'>
                        <label for='mail-display'>Display name (선택)</label>
                        <input id='mail-display' class='input input-block' name='displayName' maxlength={100} />
                    </div>
                </div>
                <div class='hstack wrap'>
                    <div class='field field-grow'>
                        <label for='mail-username'>Username (선택)</label>
                        <input id='mail-username' class='input input-block' name='username' autocomplete='off' />
                    </div>
                    <div class='field field-grow'>
                        <label for='mail-password'>Password / App password</label>
                        <input id='mail-password' class='input input-block' type='password' name='password' autocomplete='off' />
                    </div>
                </div>
                <div class='hstack wrap'>
                    <div class='field field-grow'>
                        <label for='mail-imap-host'>IMAP host</label>
                        <input id='mail-imap-host' class='input input-block' name='imapHost' placeholder='imap.example.com' />
                    </div>
                    <div class='field'>
                        <label for='mail-imap-port'>IMAP port</label>
                        <input id='mail-imap-port' class='input' type='number' name='imapPort' placeholder='993' />
                    </div>
                    <div class='field'>
                        <label class='checkbox-row' for='mail-imap-tls'>
                            <input id='mail-imap-tls' type='checkbox' name='imapTls' value='true' checked />
                            IMAP TLS
                        </label>
                    </div>
                </div>
                <div class='hstack wrap'>
                    <div class='field field-grow'>
                        <label for='mail-smtp-host'>SMTP host</label>
                        <input id='mail-smtp-host' class='input input-block' name='smtpHost' placeholder='smtp.example.com' />
                    </div>
                    <div class='field'>
                        <label for='mail-smtp-port'>SMTP port</label>
                        <input id='mail-smtp-port' class='input' type='number' name='smtpPort' placeholder='465' />
                    </div>
                    <div class='field'>
                        <label class='checkbox-row' for='mail-smtp-tls'>
                            <input id='mail-smtp-tls' type='checkbox' name='smtpTls' value='true' checked />
                            SMTP TLS
                        </label>
                    </div>
                </div>
                <div>
                    <button class='btn' type='submit'>
                        연결
                    </button>
                </div>
            </form>
        </div>

        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='연결된 계정이 없습니다.'
            columns={
                [
                    { key: 'provider', header: 'Provider', cell: (r) => <Badge kind='secondary'>{r.provider}</Badge> },
                    { key: 'email', header: 'Email', cell: (r) => r.email },
                    { key: 'display', header: 'Name', cell: (r) => r.displayName ?? '-' },
                    {
                        key: 'active',
                        header: 'Active',
                        cell: (r) => <Badge kind={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'ON' : 'OFF'}</Badge>,
                    },
                    { key: 'lastSync', header: 'Last sync', cell: (r) => formatDate(r.lastSyncAt), className: 'nowrap' },
                    { key: 'status', header: 'Status', cell: (r) => r.lastSyncStatus ?? '-' },
                    {
                        key: 'update',
                        header: '수정',
                        cell: (r) => (
                            <form method='post' action={`${MAIL_ACCOUNTS_PATH}/${r.id}/update`} class='form-inline'>
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
                            <div class='row-actions'>
                                <RowAction
                                    action={`${MAIL_ACCOUNTS_PATH}/${r.id}/test`}
                                    label='연결 테스트'
                                    variant='ghost'
                                    returnTo={MAIL_ACCOUNTS_PATH}
                                />
                                <RowAction
                                    action={`${MAIL_ACCOUNTS_PATH}/${r.id}/delete`}
                                    label='삭제'
                                    variant='destructive'
                                    returnTo={MAIL_ACCOUNTS_PATH}
                                />
                            </div>
                        ),
                    },
                ] as Column<AccountRow>[]
            }
        />
    </ManageShell>
)

export const createManageMailAccountsRoute = (deps: ManageMailAccountsDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailAccountService) return c.html(<NotConfiguredPage user={user} />)
        const rows = await deps.mailAccountService.list(user.id)
        return c.html(<AccountsPage user={user} rows={rows} flash={parseFlash(c)} />)
    })

    app.post('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailAccountService) return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const password = emptyToUndefined(body.password)
        const imapPort = emptyToUndefined(body.imapPort)
        const smtpPort = emptyToUndefined(body.smtpPort)
        const parsed = mailAccountCreateSchema.safeParse({
            provider: body.provider,
            email: body.email,
            displayName: emptyToUndefined(body.displayName),
            credentials: password ? { username: emptyToUndefined(body.username), password } : undefined,
            imapHost: emptyToUndefined(body.imapHost),
            imapPort: imapPort ? Number(imapPort) : undefined,
            imapTls: parseCheckbox(body.imapTls),
            smtpHost: emptyToUndefined(body.smtpHost),
            smtpPort: smtpPort ? Number(smtpPort) : undefined,
            smtpTls: parseCheckbox(body.smtpTls),
        })
        if (!parsed.success) return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'err', 'validation'), 303)
        try {
            await deps.mailAccountService.create(user.id, parsed.data)
            return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/update', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailAccountService) return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'err', 'not_configured'), 303)
        const id = parseId(c.req.param('id'))
        if (id === null) return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'err', 'validation'), 303)
        const body = await c.req.parseBody()
        try {
            await deps.mailAccountService.update(id, user.id, {
                displayName: emptyToUndefined(body.displayName),
                isActive: parseCheckbox(body.isActive),
            })
            return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/test', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailAccountService) return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'err', 'not_configured'), 303)
        const id = parseId(c.req.param('id'))
        if (id === null) return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'err', 'validation'), 303)
        try {
            await deps.mailAccountService.testConnection(id, user.id)
            return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/delete', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailAccountService) return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'err', 'not_configured'), 303)
        const id = parseId(c.req.param('id'))
        if (id === null) return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'err', 'validation'), 303)
        try {
            await deps.mailAccountService.remove(id, user.id)
            return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(MAIL_ACCOUNTS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    return app
}
