import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { ManageShell } from '../components'
import { CsrfField, DataTable, RowAction, type Column } from '../../admin/components'
import { flashPath, parseFlash } from '../../admin/flash'
import { formatDate } from '../../admin/format'
import type { AdminSessionUser } from '../../admin/guard'
import type { Flash } from '../../admin/flash'
import type { ManageContext, ManageGetSession } from '../guard'
import { requireSessionPage } from '../guard'
import { emptyToUndefined, errorToFlashCode } from '../util'
import type { DriveFolderService } from '../../../service/domain/drive/drive-folder'

type ManageDriveFoldersDeps = {
    getSession: ManageGetSession
    driveFolderService?: DriveFolderService
}

type FolderRow = Awaited<ReturnType<DriveFolderService['list']>>[number]

const DRIVE_FOLDERS_PATH = '/manage/drive/folders'

const NotConfiguredPage: FC<{ user: AdminSessionUser }> = ({ user }) => (
    <ManageShell title='Drive Folders' subtitle='드라이브 폴더' user={user} currentPath={DRIVE_FOLDERS_PATH}>
        <div class='banner err' role='alert'>
            드라이브 기능이 아직 구성되지 않았습니다.
        </div>
    </ManageShell>
)

const FoldersPage: FC<{ user: AdminSessionUser; rows: FolderRow[]; parentId?: string; flash?: Flash | null }> = ({ user, rows, parentId, flash }) => (
    <ManageShell title='Drive Folders' subtitle='드라이브 폴더' user={user} currentPath={DRIVE_FOLDERS_PATH} flash={flash}>
        <div class='card'>
            <h3 class='card-title-sm'>새 폴더</h3>
            <form method='post' action={DRIVE_FOLDERS_PATH} class='form-inline'>
                <CsrfField />
                <input type='hidden' name='returnParentId' value={parentId ?? ''} />
                <div class='field field-grow'>
                    <label for='folder-name'>Name</label>
                    <input id='folder-name' class='input input-block' name='name' required maxlength={255} />
                </div>
                <div class='field field-grow'>
                    <label for='folder-parent'>Parent ID (선택)</label>
                    <input id='folder-parent' class='input input-block' name='parentId' value={parentId ?? ''} />
                </div>
                <button class='btn' type='submit'>
                    생성
                </button>
            </form>
            {parentId && (
                <p class='text-muted mt-sm'>
                    현재 상위: <span class='mono'>{parentId}</span> · <a href={DRIVE_FOLDERS_PATH}>루트로</a>
                </p>
            )}
        </div>

        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='폴더가 없습니다.'
            columns={
                [
                    {
                        key: 'name',
                        header: 'Name',
                        cell: (r) => <a href={`${DRIVE_FOLDERS_PATH}?parentId=${encodeURIComponent(r.id)}`}>{r.name}</a>,
                    },
                    { key: 'id', header: 'ID', cell: (r) => <span class='mono'>{r.id}</span>, className: 'truncate' },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'update',
                        header: '수정',
                        cell: (r) => (
                            <form method='post' action={`${DRIVE_FOLDERS_PATH}/${r.id}/update`} class='form-inline'>
                                <CsrfField />
                                <input type='hidden' name='returnParentId' value={parentId ?? ''} />
                                <input class='input' name='name' value={r.name} placeholder='이름' />
                                <input class='input' name='parentId' value={r.parentId ?? ''} placeholder='상위 ID' />
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
                                action={`${DRIVE_FOLDERS_PATH}/${r.id}/delete`}
                                label='삭제'
                                variant='destructive'
                                hidden={{ returnParentId: parentId ?? '' }}
                                returnTo={parentId ? `${DRIVE_FOLDERS_PATH}?parentId=${encodeURIComponent(parentId)}` : DRIVE_FOLDERS_PATH}
                            />
                        ),
                    },
                ] as Column<FolderRow>[]
            }
        />
    </ManageShell>
)

const returnPath = (body: Record<string, unknown>): string => {
    const parentId = emptyToUndefined(body.returnParentId)
    return parentId ? `${DRIVE_FOLDERS_PATH}?parentId=${encodeURIComponent(parentId)}` : DRIVE_FOLDERS_PATH
}

export const createManageDriveFoldersRoute = (deps: ManageDriveFoldersDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.driveFolderService) return c.html(<NotConfiguredPage user={user} />)
        const parentId = emptyToUndefined(c.req.query('parentId'))
        try {
            const rows = await deps.driveFolderService.list(user.id, parentId)
            return c.html(<FoldersPage user={user} rows={rows} parentId={parentId} flash={parseFlash(c)} />)
        } catch (error) {
            return c.redirect(flashPath(DRIVE_FOLDERS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.driveFolderService) return c.redirect(flashPath(DRIVE_FOLDERS_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const name = emptyToUndefined(body.name)
        if (!name) return c.redirect(flashPath(returnPath(body), 'err', 'validation'), 303)
        try {
            await deps.driveFolderService.create(user.id, { name, parentId: emptyToUndefined(body.parentId) ?? null })
            return c.redirect(flashPath(returnPath(body), 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(returnPath(body), 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/update', async (c) => {
        const user = c.get('manageUser')
        if (!deps.driveFolderService) return c.redirect(flashPath(DRIVE_FOLDERS_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        try {
            await deps.driveFolderService.update(c.req.param('id'), user.id, {
                name: emptyToUndefined(body.name),
                parentId: emptyToUndefined(body.parentId) ?? null,
            })
            return c.redirect(flashPath(returnPath(body), 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(returnPath(body), 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/delete', async (c) => {
        const user = c.get('manageUser')
        if (!deps.driveFolderService) return c.redirect(flashPath(DRIVE_FOLDERS_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        try {
            await deps.driveFolderService.remove(c.req.param('id'), user.id)
            return c.redirect(flashPath(returnPath(body), 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(returnPath(body), 'err', errorToFlashCode(error)), 303)
        }
    })

    return app
}
