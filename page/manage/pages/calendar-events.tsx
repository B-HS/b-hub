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
import { emptyToUndefined, errorToFlashCode, parseCheckbox } from '../util'
import type { CalendarService, CalendarEvent } from '../../../service/domain/calendar/calendar'

type ManageCalendarEventsDeps = {
    getSession: ManageGetSession
    calendarService?: CalendarService
}

type GroupRow = Awaited<ReturnType<CalendarService['getGroups']>>[number]

const CALENDAR_EVENTS_PATH = '/manage/calendar/events'

const toDateInput = (d: Date): string => d.toISOString().slice(0, 16)

const parseDateInput = (value: unknown): Date | null => {
    if (typeof value !== 'string' || value.trim().length === 0) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
}

const NotConfiguredPage: FC<{ user: AdminSessionUser }> = ({ user }) => (
    <ManageShell title='Calendar Events' subtitle='캘린더 이벤트' user={user} currentPath={CALENDAR_EVENTS_PATH}>
        <div class='banner err' role='alert'>
            캘린더 기능이 아직 구성되지 않았습니다.
        </div>
    </ManageShell>
)

const EventFormFields: FC<{ groups: GroupRow[]; event?: CalendarEvent }> = ({ groups, event }) => (
    <>
        <div class='hstack wrap'>
            <div class='field field-grow'>
                <label for='ev-summary'>Summary</label>
                <input id='ev-summary' class='input input-block' name='summary' required maxlength={500} value={event?.summary ?? ''} />
            </div>
            <div class='field'>
                <label class='checkbox-row'>
                    <input type='checkbox' name='isAllDay' value='true' checked={event?.isAllDay ?? false} />
                    All day
                </label>
            </div>
        </div>
        <div class='hstack wrap'>
            <div class='field'>
                <label for='ev-dtstart'>Start</label>
                <input id='ev-dtstart' class='input' type='datetime-local' name='dtstart' required value={event ? toDateInput(event.dtstart) : ''} />
            </div>
            <div class='field'>
                <label for='ev-dtend'>End</label>
                <input id='ev-dtend' class='input' type='datetime-local' name='dtend' required value={event ? toDateInput(event.dtend) : ''} />
            </div>
            <div class='field'>
                <label for='ev-group'>Group</label>
                <select id='ev-group' class='select' name='groupId'>
                    <option value=''>없음</option>
                    {groups.map((g) => (
                        <option key={g.id} value={g.id} selected={event?.groupId === g.id}>
                            {g.name}
                        </option>
                    ))}
                </select>
            </div>
        </div>
        <div class='field'>
            <label for='ev-location'>Location (선택)</label>
            <input id='ev-location' class='input input-block' name='location' maxlength={500} value={event?.location ?? ''} />
        </div>
        <div class='field'>
            <label for='ev-description'>Description (선택)</label>
            <textarea id='ev-description' class='input input-block' name='description' rows={3}>
                {event?.description ?? ''}
            </textarea>
        </div>
    </>
)

const EventsPage: FC<{ user: AdminSessionUser; events: CalendarEvent[]; groups: GroupRow[]; flash?: Flash | null }> = ({
    user,
    events,
    groups,
    flash,
}) => (
    <ManageShell title='Calendar Events' subtitle='캘린더 이벤트' user={user} currentPath={CALENDAR_EVENTS_PATH} flash={flash}>
        <div class='card'>
            <h2 class='card-title'>새 이벤트</h2>
            <form method='post' action={CALENDAR_EVENTS_PATH} class='form-stack'>
                <CsrfField />
                <EventFormFields groups={groups} />
                <div>
                    <button class='btn' type='submit'>
                        생성
                    </button>
                </div>
            </form>
        </div>

        <DataTable
            rows={events}
            rowKey={(r) => r.uid}
            empty='이벤트가 없습니다.'
            columns={
                [
                    {
                        key: 'summary',
                        header: 'Summary',
                        cell: (r) => <a href={`${CALENDAR_EVENTS_PATH}/${encodeURIComponent(r.uid)}`}>{r.summary}</a>,
                    },
                    { key: 'start', header: 'Start', cell: (r) => formatDate(r.dtstart), className: 'nowrap' },
                    { key: 'end', header: 'End', cell: (r) => formatDate(r.dtend), className: 'nowrap' },
                    { key: 'allday', header: 'All day', cell: (r) => (r.isAllDay ? <Badge kind='outline'>Y</Badge> : '-') },
                    { key: 'group', header: 'Group', cell: (r) => r.groupId ?? '-' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`${CALENDAR_EVENTS_PATH}/${encodeURIComponent(r.uid)}/delete`}
                                label='삭제'
                                variant='destructive'
                                returnTo={CALENDAR_EVENTS_PATH}
                            />
                        ),
                    },
                ] as Column<CalendarEvent>[]
            }
        />
    </ManageShell>
)

const EventDetailPage: FC<{ user: AdminSessionUser; event: CalendarEvent; groups: GroupRow[]; flash?: Flash | null }> = ({
    user,
    event,
    groups,
    flash,
}) => (
    <ManageShell title='Event detail' subtitle={event.summary} user={user} currentPath={CALENDAR_EVENTS_PATH} flash={flash}>
        <div class='card'>
            <h2 class='card-title'>이벤트 수정</h2>
            <form method='post' action={`${CALENDAR_EVENTS_PATH}/${encodeURIComponent(event.uid)}/update`} class='form-stack'>
                <CsrfField />
                <EventFormFields groups={groups} event={event} />
                <div>
                    <button class='btn' type='submit'>
                        저장
                    </button>
                </div>
            </form>
        </div>
        <div class='card'>
            <RowAction
                action={`${CALENDAR_EVENTS_PATH}/${encodeURIComponent(event.uid)}/delete`}
                label='이벤트 삭제'
                variant='destructive'
                returnTo={CALENDAR_EVENTS_PATH}
            />
        </div>
    </ManageShell>
)

const buildEventInput = (body: Record<string, unknown>, dtstart: Date, dtend: Date) => ({
    summary: typeof body.summary === 'string' ? body.summary : '',
    dtstart,
    dtend,
    isAllDay: parseCheckbox(body.isAllDay),
    description: emptyToUndefined(body.description),
    location: emptyToUndefined(body.location),
    groupId: emptyToUndefined(body.groupId) ?? null,
})

export const createManageCalendarEventsRoute = (deps: ManageCalendarEventsDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.calendarService) return c.html(<NotConfiguredPage user={user} />)
        const [events, groups] = await Promise.all([deps.calendarService.getAllEvents(user.id), deps.calendarService.getGroups(user.id)])
        return c.html(<EventsPage user={user} events={events} groups={groups} flash={parseFlash(c)} />)
    })

    app.post('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.calendarService) return c.redirect(flashPath(CALENDAR_EVENTS_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const dtstart = parseDateInput(body.dtstart)
        const dtend = parseDateInput(body.dtend)
        if (dtstart === null || dtend === null || !emptyToUndefined(body.summary))
            return c.redirect(flashPath(CALENDAR_EVENTS_PATH, 'err', 'validation'), 303)
        try {
            await deps.calendarService.createEvent(user.id, buildEventInput(body, dtstart, dtend))
            return c.redirect(flashPath(CALENDAR_EVENTS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(CALENDAR_EVENTS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.get('/:uid', async (c) => {
        const user = c.get('manageUser')
        if (!deps.calendarService) return c.html(<NotConfiguredPage user={user} />)
        const event = await deps.calendarService.getEventByUid(user.id, c.req.param('uid'))
        if (!event) return c.redirect(flashPath(CALENDAR_EVENTS_PATH, 'err', 'not_found'), 303)
        const groups = await deps.calendarService.getGroups(user.id)
        return c.html(<EventDetailPage user={user} event={event} groups={groups} flash={parseFlash(c)} />)
    })

    app.post('/:uid/update', async (c) => {
        const user = c.get('manageUser')
        if (!deps.calendarService) return c.redirect(flashPath(CALENDAR_EVENTS_PATH, 'err', 'not_configured'), 303)
        const uid = c.req.param('uid')
        const existing = await deps.calendarService.getEventByUid(user.id, uid)
        if (!existing) return c.redirect(flashPath(CALENDAR_EVENTS_PATH, 'err', 'not_found'), 303)
        const body = await c.req.parseBody()
        const dtstart = parseDateInput(body.dtstart)
        const dtend = parseDateInput(body.dtend)
        if (dtstart === null || dtend === null || !emptyToUndefined(body.summary)) {
            return c.redirect(flashPath(`${CALENDAR_EVENTS_PATH}/${encodeURIComponent(uid)}`, 'err', 'validation'), 303)
        }
        try {
            await deps.calendarService.updateEvent(user.id, { ...existing, ...buildEventInput(body, dtstart, dtend), uid: existing.uid })
            return c.redirect(flashPath(`${CALENDAR_EVENTS_PATH}/${encodeURIComponent(uid)}`, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(`${CALENDAR_EVENTS_PATH}/${encodeURIComponent(uid)}`, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:uid/delete', async (c) => {
        const user = c.get('manageUser')
        if (!deps.calendarService) return c.redirect(flashPath(CALENDAR_EVENTS_PATH, 'err', 'not_configured'), 303)
        try {
            await deps.calendarService.deleteEvent(user.id, c.req.param('uid'))
            return c.redirect(flashPath(CALENDAR_EVENTS_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(CALENDAR_EVENTS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    return app
}
