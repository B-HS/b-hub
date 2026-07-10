import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { ManageShell } from '../components'
import { Badge, CsrfField, DataTable, RowAction, type Column } from '../../admin/components'
import { flashPath, parseFlash } from '../../admin/flash'
import type { AdminSessionUser } from '../../admin/guard'
import type { Flash } from '../../admin/flash'
import type { ManageContext, ManageGetSession } from '../guard'
import { requireSessionPage } from '../guard'
import { emptyToUndefined, errorToFlashCode, parseCheckbox } from '../util'
import type { CalendarService } from '../../../service/domain/calendar/calendar'

type ManageCalendarGroupsDeps = {
    getSession: ManageGetSession
    calendarService?: CalendarService
}

type GroupRow = Awaited<ReturnType<CalendarService['getGroups']>>[number]

const CALENDAR_GROUPS_PATH = '/manage/calendar/groups'
const DEFAULT_GROUP_COLOR = '#3b82f6'

const NotConfiguredPage: FC<{ user: AdminSessionUser }> = ({ user }) => (
    <ManageShell title='Calendar Groups' subtitle='캘린더 그룹' user={user} currentPath={CALENDAR_GROUPS_PATH}>
        <div class='banner err' role='alert'>
            캘린더 기능이 아직 구성되지 않았습니다.
        </div>
    </ManageShell>
)

const GroupsPage: FC<{ user: AdminSessionUser; rows: GroupRow[]; flash?: Flash | null }> = ({ user, rows, flash }) => (
    <ManageShell title='Calendar Groups' subtitle='캘린더 그룹' user={user} currentPath={CALENDAR_GROUPS_PATH} flash={flash}>
        <div class='card'>
            <h3 class='card-title-sm'>새 그룹</h3>
            <form method='post' action={CALENDAR_GROUPS_PATH} class='form-inline'>
                <CsrfField />
                <div class='field field-grow'>
                    <label for='grp-name'>Name</label>
                    <input id='grp-name' class='input input-block' name='name' required maxlength={255} />
                </div>
                <div class='field'>
                    <label for='grp-color'>Color</label>
                    <input id='grp-color' class='input' name='color' required maxlength={50} value={DEFAULT_GROUP_COLOR} />
                </div>
                <button class='btn' type='submit'>
                    생성
                </button>
            </form>
        </div>

        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='그룹이 없습니다.'
            columns={
                [
                    { key: 'name', header: 'Name', cell: (r) => r.name },
                    { key: 'color', header: 'Color', cell: (r) => <span class='mono'>{r.color}</span> },
                    { key: 'sort', header: 'Sort', cell: (r) => r.sortOrder, className: 'num' },
                    {
                        key: 'visible',
                        header: 'Visible',
                        cell: (r) => <Badge kind={r.isVisible ? 'success' : 'muted'}>{r.isVisible ? 'Y' : 'N'}</Badge>,
                    },
                    {
                        key: 'update',
                        header: '수정',
                        cell: (r) => (
                            <form method='post' action={`${CALENDAR_GROUPS_PATH}/${r.id}/update`} class='form-inline'>
                                <CsrfField />
                                <input class='input' name='name' value={r.name} />
                                <input class='input' name='color' value={r.color} />
                                <label class='checkbox-row'>
                                    <input type='checkbox' name='isVisible' value='true' checked={r.isVisible} />
                                    표시
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
                                action={`${CALENDAR_GROUPS_PATH}/${r.id}/delete`}
                                label='삭제'
                                variant='destructive'
                                returnTo={CALENDAR_GROUPS_PATH}
                            />
                        ),
                    },
                ] as Column<GroupRow>[]
            }
        />
    </ManageShell>
)

export const createManageCalendarGroupsRoute = (deps: ManageCalendarGroupsDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.calendarService) return c.html(<NotConfiguredPage user={user} />)
        const rows = await deps.calendarService.getGroups(user.id)
        return c.html(<GroupsPage user={user} rows={rows} flash={parseFlash(c)} />)
    })

    app.post('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.calendarService) return c.redirect(flashPath(CALENDAR_GROUPS_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const name = emptyToUndefined(body.name)
        const color = emptyToUndefined(body.color)
        if (!name || !color) return c.redirect(flashPath(CALENDAR_GROUPS_PATH, 'err', 'validation'), 303)
        try {
            await deps.calendarService.createGroup(user.id, { name, color })
            return c.redirect(flashPath(CALENDAR_GROUPS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(CALENDAR_GROUPS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/update', async (c) => {
        const user = c.get('manageUser')
        if (!deps.calendarService) return c.redirect(flashPath(CALENDAR_GROUPS_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        try {
            await deps.calendarService.updateGroup(user.id, c.req.param('id'), {
                name: emptyToUndefined(body.name),
                color: emptyToUndefined(body.color),
                isVisible: parseCheckbox(body.isVisible),
            })
            return c.redirect(flashPath(CALENDAR_GROUPS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(CALENDAR_GROUPS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/delete', async (c) => {
        const user = c.get('manageUser')
        if (!deps.calendarService) return c.redirect(flashPath(CALENDAR_GROUPS_PATH, 'err', 'not_configured'), 303)
        try {
            await deps.calendarService.deleteGroup(user.id, c.req.param('id'))
            return c.redirect(flashPath(CALENDAR_GROUPS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(CALENDAR_GROUPS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    return app
}
