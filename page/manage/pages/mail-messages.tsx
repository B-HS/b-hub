import { Hono } from 'hono'
import type { Context } from 'hono'
import type { FC } from 'hono/jsx'
import { ManageShell } from '../components'
import { Badge, CsrfField, DataTable, FilterBar, Pagination, RowAction, type Column } from '../../admin/components'
import { flashPath, parseFlash } from '../../admin/flash'
import { formatDate, parseIntOr, truncate } from '../../admin/format'
import type { AdminSessionUser } from '../../admin/guard'
import type { Flash } from '../../admin/flash'
import type { ManageContext, ManageGetSession } from '../guard'
import { requireSessionPage } from '../guard'
import { emptyToUndefined, errorToFlashCode, idsFromCsv, parseEmailList, parseId, parseTriBool } from '../util'
import { mailComposeSchema, mailForwardSchema } from '../../../dto/mail/message'
import type { MailMessageService } from '../../../service/domain/mail/mail-message'
import type { MailAccountService } from '../../../service/domain/mail/mail-account'
import type { MailUploadService } from '../../../service/domain/mail/mail-upload'

type MailFolderRow = { id: number; accountId: number; name: string; type: string; parentId: number | null; messageCount: number; unreadCount: number }
export type ManageMailFolderDb = { getFoldersByAccount: (accountId: number) => Promise<MailFolderRow[]> }

type ManageMailMessagesDeps = {
    getSession: ManageGetSession
    mailMessageService?: MailMessageService
    mailAccountService?: MailAccountService
    mailFolderDb?: ManageMailFolderDb
    mailUploadService?: MailUploadService
}

type MessageRow = Awaited<ReturnType<MailMessageService['list']>>['data'][number]
type MessageDetail = Awaited<ReturnType<MailMessageService['getById']>>
type AccountRow = Awaited<ReturnType<MailAccountService['list']>>[number]

const MAIL_MESSAGES_PATH = '/manage/mail/messages'
const DEFAULT_PAGE_SIZE = 20
const MIN_PAGE_SIZE = 5
const MAX_PAGE_SIZE = 100

const formatAddress = (a: { name: string; address: string } | null | undefined): string => {
    if (!a) return '-'
    return a.name ? `${a.name} <${a.address}>` : a.address
}

const NotConfiguredPage: FC<{ user: AdminSessionUser }> = ({ user }) => (
    <ManageShell title='Mail Messages' subtitle='메일 조회·발송' user={user} currentPath={MAIL_MESSAGES_PATH}>
        <div class='banner err' role='alert'>
            메일 기능이 아직 구성되지 않았습니다.
        </div>
    </ManageShell>
)

type MessagesPageProps = {
    user: AdminSessionUser
    rows: MessageRow[]
    accounts: AccountRow[]
    folders: MailFolderRow[]
    total: number
    page: number
    size: number
    accountId?: string
    folderId?: string
    isRead?: string
    isStarred?: string
    q?: string
    flash?: Flash | null
}

const MessagesPage: FC<MessagesPageProps> = ({
    user,
    rows,
    accounts,
    folders,
    total,
    page,
    size,
    accountId,
    folderId,
    isRead,
    isStarred,
    q,
    flash,
}) => (
    <ManageShell title='Mail Messages' subtitle='메일 조회·발송' user={user} currentPath={MAIL_MESSAGES_PATH} flash={flash}>
        <FilterBar
            action={MAIL_MESSAGES_PATH}
            fields={[
                { kind: 'text', name: 'q', label: '검색 (제목/본문)', value: q },
                {
                    kind: 'select',
                    name: 'accountId',
                    label: 'Account',
                    value: accountId,
                    options: [{ value: '', label: '전체' }, ...accounts.map((a) => ({ value: String(a.id), label: a.email }))],
                },
                { kind: 'number', name: 'folderId', label: 'Folder ID', value: folderId },
                {
                    kind: 'select',
                    name: 'isRead',
                    label: 'Read',
                    value: isRead,
                    options: [
                        { value: '', label: '전체' },
                        { value: 'true', label: '읽음' },
                        { value: 'false', label: '안읽음' },
                    ],
                },
                {
                    kind: 'select',
                    name: 'isStarred',
                    label: 'Star',
                    value: isStarred,
                    options: [
                        { value: '', label: '전체' },
                        { value: 'true', label: '별표' },
                        { value: 'false', label: '해제' },
                    ],
                },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />

        {accountId && (
            <div class='card'>
                <h3 class='card-title-sm'>폴더 ({folders.length})</h3>
                <DataTable
                    rows={folders}
                    rowKey={(r) => r.id}
                    empty='폴더가 없습니다.'
                    columns={
                        [
                            { key: 'id', header: 'ID', cell: (r) => r.id, className: 'num' },
                            { key: 'name', header: 'Name', cell: (r) => r.name },
                            { key: 'type', header: 'Type', cell: (r) => <Badge kind='secondary'>{r.type}</Badge> },
                            { key: 'count', header: 'Messages', cell: (r) => r.messageCount, className: 'num' },
                            { key: 'unread', header: 'Unread', cell: (r) => r.unreadCount, className: 'num' },
                        ] as Column<MailFolderRow>[]
                    }
                />
            </div>
        )}

        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='메시지가 없습니다.'
            columns={
                [
                    { key: 'from', header: 'From', cell: (r) => formatAddress(r.fromAddress), className: 'truncate' },
                    {
                        key: 'subject',
                        header: 'Subject',
                        cell: (r) => <a href={`${MAIL_MESSAGES_PATH}/${r.id}`}>{truncate(r.subject ?? '(제목 없음)', 80)}</a>,
                        className: 'truncate',
                    },
                    {
                        key: 'flags',
                        header: 'Flags',
                        cell: (r) => (
                            <div class='hstack-sm'>
                                {r.isRead ? <Badge kind='muted'>read</Badge> : <Badge kind='success'>unread</Badge>}
                                {r.isStarred && <Badge kind='outline'>star</Badge>}
                                {r.hasAttachments && <Badge kind='outline'>attach</Badge>}
                            </div>
                        ),
                    },
                    { key: 'received', header: 'Received', cell: (r) => formatDate(r.receivedAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <div class='row-actions'>
                                <RowAction
                                    action={`${MAIL_MESSAGES_PATH}/${r.isRead ? 'mark-unread' : 'mark-read'}`}
                                    label={r.isRead ? '안읽음' : '읽음'}
                                    variant='ghost'
                                    hidden={{ messageId: r.id }}
                                    returnTo={MAIL_MESSAGES_PATH}
                                />
                                <RowAction
                                    action={`${MAIL_MESSAGES_PATH}/${r.isStarred ? 'unstar' : 'star'}`}
                                    label={r.isStarred ? '별표해제' : '별표'}
                                    variant='ghost'
                                    hidden={{ messageId: r.id }}
                                    returnTo={MAIL_MESSAGES_PATH}
                                />
                                <RowAction
                                    action={`${MAIL_MESSAGES_PATH}/delete`}
                                    label='삭제'
                                    variant='destructive'
                                    hidden={{ messageId: r.id }}
                                    returnTo={MAIL_MESSAGES_PATH}
                                />
                            </div>
                        ),
                    },
                ] as Column<MessageRow>[]
            }
        />
        <Pagination
            page={page}
            pageSize={size}
            total={total}
            baseQuery={{ q, accountId, folderId, isRead, isStarred, size }}
            basePath={MAIL_MESSAGES_PATH}
        />

        <div class='card'>
            <h3 class='card-title-sm'>전체 읽음 처리</h3>
            <form method='post' action={`${MAIL_MESSAGES_PATH}/mark-all-read`} class='form-inline'>
                <CsrfField />
                <div class='field'>
                    <label for='mar-account'>Account ID (선택)</label>
                    <input id='mar-account' class='input' type='number' name='accountId' value={accountId ?? ''} />
                </div>
                <div class='field'>
                    <label for='mar-folder'>Folder ID (선택)</label>
                    <input id='mar-folder' class='input' type='number' name='folderId' value={folderId ?? ''} />
                </div>
                <button class='btn outline' type='submit'>
                    전체 읽음
                </button>
            </form>
            <p class='text-muted mt-sm'>Account ID 또는 Folder ID 중 하나는 필수입니다.</p>
        </div>

        <div class='card'>
            <h2 class='card-title'>메일 발송</h2>
            <form method='post' action={`${MAIL_MESSAGES_PATH}/send`} class='form-stack'>
                <CsrfField />
                <div class='hstack wrap'>
                    <div class='field'>
                        <label for='send-account'>Account</label>
                        <select id='send-account' class='select' name='accountId' required>
                            {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.email}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div class='field field-grow'>
                        <label for='send-to'>To (쉼표 구분)</label>
                        <input id='send-to' class='input input-block' name='to' required placeholder='a@x.com, b@y.com' />
                    </div>
                </div>
                <div class='field'>
                    <label for='send-cc'>Cc (선택, 쉼표 구분)</label>
                    <input id='send-cc' class='input input-block' name='cc' />
                </div>
                <div class='field'>
                    <label for='send-subject'>Subject</label>
                    <input id='send-subject' class='input input-block' name='subject' maxlength={1000} />
                </div>
                <div class='field'>
                    <label for='send-body'>Body (text)</label>
                    <textarea id='send-body' class='input input-block' name='bodyText' rows={6}></textarea>
                </div>
                <div class='field'>
                    <label for='send-attach'>Attachment upload IDs (선택, 쉼표 구분)</label>
                    <input id='send-attach' class='input input-block' name='attachmentIds' placeholder='12, 34' />
                </div>
                <div>
                    <button class='btn' type='submit'>
                        발송
                    </button>
                </div>
            </form>
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>업로드 삭제</h3>
            <form
                method='post'
                action={`${MAIL_MESSAGES_PATH}/uploads/delete`}
                class='form-inline'
                data-confirm='이 작업은 되돌릴 수 없습니다. 계속할까요?'>
                <CsrfField />
                <div class='field'>
                    <label for='upload-id'>Upload ID</label>
                    <input id='upload-id' class='input' type='number' name='uploadId' required />
                </div>
                <button class='btn sm destructive' type='submit'>
                    삭제
                </button>
            </form>
        </div>
    </ManageShell>
)

const MessageDetailPage: FC<{ user: AdminSessionUser; target: MessageDetail; folders: MailFolderRow[]; flash?: Flash | null }> = ({
    user,
    target,
    folders,
    flash,
}) => (
    <ManageShell title='Message detail' subtitle={target.subject ?? '(제목 없음)'} user={user} currentPath={MAIL_MESSAGES_PATH} flash={flash}>
        <div class='card'>
            <dl class='kv'>
                <dt>ID</dt>
                <dd class='mono'>{target.id}</dd>
                <dt>From</dt>
                <dd>{formatAddress(target.fromAddress)}</dd>
                <dt>To</dt>
                <dd>{(target.toAddresses ?? []).map(formatAddress).join(', ') || '-'}</dd>
                <dt>Cc</dt>
                <dd>{(target.ccAddresses ?? []).map(formatAddress).join(', ') || '-'}</dd>
                <dt>Received</dt>
                <dd>{formatDate(target.receivedAt)}</dd>
                <dt>Flags</dt>
                <dd>
                    <div class='hstack-sm'>
                        {target.isRead ? <Badge kind='muted'>read</Badge> : <Badge kind='success'>unread</Badge>}
                        {target.isStarred && <Badge kind='outline'>star</Badge>}
                    </div>
                </dd>
            </dl>
            <div class='mt-sm prewrap mono'>{target.bodyText ?? '(텍스트 본문 없음)'}</div>
            {target.bodyHtml && <p class='text-muted mt-sm'>HTML 본문은 보안을 위해 렌더링하지 않습니다.</p>}
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>첨부파일 ({target.attachments?.length ?? 0})</h3>
            <DataTable
                rows={target.attachments ?? []}
                rowKey={(r) => r.id}
                empty='첨부파일 없음.'
                columns={
                    [
                        { key: 'name', header: 'Filename', cell: (r) => r.filename ?? '-' },
                        { key: 'mime', header: 'MIME', cell: (r) => r.mimeType ?? '-', className: 'mono' },
                        {
                            key: 'download',
                            header: '',
                            cell: (r) => (
                                <a class='btn sm outline' href={`/api/mail/messages/${target.id}/attachments/${r.id}`}>
                                    다운로드
                                </a>
                            ),
                        },
                    ] as Column<NonNullable<MessageDetail['attachments']>[number]>[]
                }
            />
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>답장</h3>
            <form method='post' action={`${MAIL_MESSAGES_PATH}/${target.id}/reply`} class='form-stack'>
                <CsrfField />
                <div class='field'>
                    <label for='reply-body'>Body (text)</label>
                    <textarea id='reply-body' class='input input-block' name='bodyText' rows={5}></textarea>
                </div>
                <div>
                    <button class='btn' type='submit'>
                        답장 발송
                    </button>
                </div>
            </form>
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>전달</h3>
            <form method='post' action={`${MAIL_MESSAGES_PATH}/${target.id}/forward`} class='form-stack'>
                <CsrfField />
                <div class='field'>
                    <label for='fwd-to'>To (쉼표 구분)</label>
                    <input id='fwd-to' class='input input-block' name='to' required placeholder='a@x.com' />
                </div>
                <div class='field'>
                    <label for='fwd-body'>Body (선택)</label>
                    <textarea id='fwd-body' class='input input-block' name='bodyHtml' rows={4}></textarea>
                </div>
                <div>
                    <button class='btn' type='submit'>
                        전달 발송
                    </button>
                </div>
            </form>
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>폴더 이동</h3>
            <form method='post' action={`${MAIL_MESSAGES_PATH}/move`} class='form-inline'>
                <CsrfField />
                <input type='hidden' name='messageId' value={target.id} />
                <div class='field'>
                    <label for='move-target'>Target folder</label>
                    <select id='move-target' class='select' name='targetFolderId' required>
                        {folders.map((f) => (
                            <option key={f.id} value={f.id}>
                                {f.name} (#{f.id})
                            </option>
                        ))}
                    </select>
                </div>
                <button class='btn outline' type='submit'>
                    이동
                </button>
            </form>
        </div>

        <div class='card'>
            <div class='row-actions'>
                <RowAction
                    action={`${MAIL_MESSAGES_PATH}/${target.isRead ? 'mark-unread' : 'mark-read'}`}
                    label={target.isRead ? '안읽음 표시' : '읽음 표시'}
                    variant='ghost'
                    hidden={{ messageId: target.id }}
                    returnTo={`${MAIL_MESSAGES_PATH}/${target.id}`}
                />
                <RowAction
                    action={`${MAIL_MESSAGES_PATH}/${target.isStarred ? 'unstar' : 'star'}`}
                    label={target.isStarred ? '별표 해제' : '별표'}
                    variant='ghost'
                    hidden={{ messageId: target.id }}
                    returnTo={`${MAIL_MESSAGES_PATH}/${target.id}`}
                />
                <RowAction
                    action={`${MAIL_MESSAGES_PATH}/delete`}
                    label='삭제'
                    variant='destructive'
                    hidden={{ messageId: target.id }}
                    returnTo={MAIL_MESSAGES_PATH}
                />
            </div>
        </div>
    </ManageShell>
)

const idsFromBody = (value: unknown): number[] => {
    const id = parseId(value)
    return id === null ? [] : [id]
}

export const createManageMailMessagesRoute = (deps: ManageMailMessagesDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    const loadFolders = async (userId: string, accountId: number): Promise<MailFolderRow[]> => {
        if (!deps.mailAccountService || !deps.mailFolderDb) return []
        try {
            await deps.mailAccountService.getById(accountId, userId)
            return deps.mailFolderDb.getFoldersByAccount(accountId)
        } catch {
            return []
        }
    }

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailMessageService) return c.html(<NotConfiguredPage user={user} />)
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), DEFAULT_PAGE_SIZE), MIN_PAGE_SIZE), MAX_PAGE_SIZE)
        const q = emptyToUndefined(c.req.query('q'))
        const accountIdRaw = c.req.query('accountId')
        const folderIdRaw = c.req.query('folderId')
        const isReadRaw = c.req.query('isRead')
        const isStarredRaw = c.req.query('isStarred')
        const accountId = parseId(accountIdRaw) ?? undefined
        const folderId = parseId(folderIdRaw) ?? undefined
        const isRead = parseTriBool(isReadRaw)
        const isStarred = parseTriBool(isStarredRaw)

        const { data, total } = q
            ? await deps.mailMessageService.search(user.id, { q, accountId, page, limit: size })
            : await deps.mailMessageService.list(user.id, { accountId, folderId, isRead, isStarred, page, limit: size })
        const accounts = deps.mailAccountService ? await deps.mailAccountService.list(user.id) : []
        const folders = accountId ? await loadFolders(user.id, accountId) : []

        return c.html(
            <MessagesPage
                user={user}
                rows={data}
                accounts={accounts}
                folders={folders}
                total={total}
                page={page}
                size={size}
                accountId={accountIdRaw}
                folderId={folderIdRaw}
                isRead={isReadRaw}
                isStarred={isStarredRaw}
                q={q}
                flash={parseFlash(c)}
            />,
        )
    })

    app.get('/:id', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailMessageService) return c.html(<NotConfiguredPage user={user} />)
        const id = parseId(c.req.param('id'))
        if (id === null) return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', 'validation'), 303)
        try {
            const target = await deps.mailMessageService.getById(user.id, id)
            const folders = await loadFolders(user.id, target.accountId)
            return c.html(<MessageDetailPage user={user} target={target} folders={folders} flash={parseFlash(c)} />)
        } catch (error) {
            return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    const flagAction = (handler: (userId: string, messageIds: number[]) => Promise<unknown>) => async (c: Context<ManageContext>) => {
        const user = c.get('manageUser')
        if (!deps.mailMessageService) return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const ids = idsFromBody(body.messageId)
        const returnTo = typeof body.returnTo === 'string' && body.returnTo.startsWith('/manage') ? body.returnTo : MAIL_MESSAGES_PATH
        if (ids.length === 0) return c.redirect(flashPath(returnTo, 'err', 'validation'), 303)
        try {
            await handler(user.id, ids)
            return c.redirect(flashPath(returnTo, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(returnTo, 'err', errorToFlashCode(error)), 303)
        }
    }

    app.post(
        '/mark-read',
        flagAction((userId, ids) => deps.mailMessageService!.markRead(userId, ids)),
    )
    app.post(
        '/mark-unread',
        flagAction((userId, ids) => deps.mailMessageService!.markUnread(userId, ids)),
    )
    app.post(
        '/star',
        flagAction((userId, ids) => deps.mailMessageService!.markStarred(userId, ids)),
    )
    app.post(
        '/unstar',
        flagAction((userId, ids) => deps.mailMessageService!.unmarkStarred(userId, ids)),
    )
    app.post(
        '/delete',
        flagAction((userId, ids) => deps.mailMessageService!.deleteMessages(userId, ids)),
    )

    app.post('/mark-all-read', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailMessageService) return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const accountId = parseId(body.accountId) ?? undefined
        const folderId = parseId(body.folderId) ?? undefined
        if (accountId === undefined && folderId === undefined) return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', 'validation'), 303)
        try {
            await deps.mailMessageService.markAllRead(user.id, { accountId, folderId })
            return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/move', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailMessageService) return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const messageId = parseId(body.messageId)
        const targetFolderId = parseId(body.targetFolderId)
        const returnTo = typeof body.returnTo === 'string' && body.returnTo.startsWith('/manage') ? body.returnTo : MAIL_MESSAGES_PATH
        if (messageId === null || targetFolderId === null) return c.redirect(flashPath(returnTo, 'err', 'validation'), 303)
        try {
            await deps.mailMessageService.moveToFolder(user.id, [messageId], targetFolderId)
            return c.redirect(flashPath(returnTo, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(returnTo, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/send', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailMessageService) return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const cc = parseEmailList(body.cc)
        const attachmentIds = idsFromCsv(body.attachmentIds)
        const parsed = mailComposeSchema.safeParse({
            accountId: parseId(body.accountId) ?? undefined,
            to: parseEmailList(body.to),
            cc: cc.length ? cc : undefined,
            subject: typeof body.subject === 'string' ? body.subject : '',
            bodyText: emptyToUndefined(body.bodyText),
            attachmentIds: attachmentIds.length ? attachmentIds : undefined,
        })
        if (!parsed.success) return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', 'validation'), 303)
        try {
            await deps.mailMessageService.send(user.id, parsed.data.accountId, parsed.data)
            return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/reply', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailMessageService) return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', 'not_configured'), 303)
        const id = parseId(c.req.param('id'))
        if (id === null) return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', 'validation'), 303)
        const body = await c.req.parseBody()
        try {
            await deps.mailMessageService.reply(user.id, id, { bodyText: emptyToUndefined(body.bodyText) })
            return c.redirect(flashPath(`${MAIL_MESSAGES_PATH}/${id}`, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(`${MAIL_MESSAGES_PATH}/${id}`, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/forward', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailMessageService) return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', 'not_configured'), 303)
        const id = parseId(c.req.param('id'))
        if (id === null) return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', 'validation'), 303)
        const body = await c.req.parseBody()
        const parsed = mailForwardSchema.safeParse({ to: parseEmailList(body.to), bodyHtml: emptyToUndefined(body.bodyHtml) })
        if (!parsed.success) return c.redirect(flashPath(`${MAIL_MESSAGES_PATH}/${id}`, 'err', 'validation'), 303)
        try {
            await deps.mailMessageService.forward(user.id, id, parsed.data)
            return c.redirect(flashPath(`${MAIL_MESSAGES_PATH}/${id}`, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(`${MAIL_MESSAGES_PATH}/${id}`, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/uploads/delete', async (c) => {
        const user = c.get('manageUser')
        if (!deps.mailUploadService) return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const uploadId = parseId(body.uploadId)
        if (uploadId === null) return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', 'validation'), 303)
        try {
            await deps.mailUploadService.deleteUpload(uploadId, user.id)
            return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(MAIL_MESSAGES_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    return app
}
