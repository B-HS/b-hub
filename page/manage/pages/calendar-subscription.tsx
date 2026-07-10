import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { ManageShell } from '../components'
import { CsrfField } from '../../admin/components'
import { flashPath, parseFlash } from '../../admin/flash'
import { formatDate } from '../../admin/format'
import type { AdminSessionUser } from '../../admin/guard'
import type { Flash } from '../../admin/flash'
import type { ManageContext, ManageGetSession } from '../guard'
import { requireSessionPage } from '../guard'
import { errorToFlashCode } from '../util'
import type { CalendarService, CalendarSubscription } from '../../../service/domain/calendar/calendar'

type ManageCalendarSubscriptionDeps = {
    getSession: ManageGetSession
    calendarService?: CalendarService
    baseUrl?: string
}

const CALENDAR_SUBSCRIPTION_PATH = '/manage/calendar/subscription'

const NotConfiguredPage: FC<{ user: AdminSessionUser }> = ({ user }) => (
    <ManageShell title='Calendar Subscription' subtitle='캘린더 구독 (CalDAV/ICS)' user={user} currentPath={CALENDAR_SUBSCRIPTION_PATH}>
        <div class='banner err' role='alert'>
            캘린더 기능이 아직 구성되지 않았습니다.
        </div>
    </ManageShell>
)

const SubscriptionPage: FC<{ user: AdminSessionUser; subscription: CalendarSubscription | null; baseUrl: string; flash?: Flash | null }> = ({
    user,
    subscription,
    baseUrl,
    flash,
}) => (
    <ManageShell title='Calendar Subscription' subtitle='캘린더 구독 (CalDAV/ICS)' user={user} currentPath={CALENDAR_SUBSCRIPTION_PATH} flash={flash}>
        {subscription ? (
            <>
                <div class='card'>
                    <h2 class='card-title'>구독 정보</h2>
                    <dl class='kv'>
                        <dt>Name</dt>
                        <dd>{subscription.name ?? '-'}</dd>
                        <dt>Active</dt>
                        <dd>{subscription.isActive ? 'Y' : 'N'}</dd>
                        <dt>CalDAV URL</dt>
                        <dd class='mono prewrap'>{`${baseUrl}/caldav/${subscription.token}/`}</dd>
                        <dt>ICS URL</dt>
                        <dd class='mono prewrap'>{`${baseUrl}/api/calendar/${subscription.icsToken}`}</dd>
                        <dt>Last accessed</dt>
                        <dd>{formatDate(subscription.lastAccessedAt)}</dd>
                    </dl>
                </div>
                <div class='card'>
                    <h3 class='card-title-sm'>토큰 재발급</h3>
                    <div class='row-actions'>
                        <form
                            method='post'
                            action={`${CALENDAR_SUBSCRIPTION_PATH}/regenerate`}
                            data-confirm='기존 CalDAV URL이 무효화됩니다. 계속할까요?'>
                            <CsrfField />
                            <button class='btn sm outline' type='submit'>
                                CalDAV 토큰 재발급
                            </button>
                        </form>
                        <form
                            method='post'
                            action={`${CALENDAR_SUBSCRIPTION_PATH}/regenerate-ics`}
                            data-confirm='기존 ICS URL이 무효화됩니다. 계속할까요?'>
                            <CsrfField />
                            <button class='btn sm outline' type='submit'>
                                ICS 토큰 재발급
                            </button>
                        </form>
                    </div>
                </div>
            </>
        ) : (
            <div class='card'>
                <p class='text-muted'>아직 구독이 없습니다.</p>
                <form method='post' action={CALENDAR_SUBSCRIPTION_PATH} class='form-inline'>
                    <CsrfField />
                    <div class='field field-grow'>
                        <label for='sub-name'>Name (선택)</label>
                        <input id='sub-name' class='input input-block' name='name' maxlength={255} placeholder='Schedule' />
                    </div>
                    <button class='btn' type='submit'>
                        구독 생성
                    </button>
                </form>
            </div>
        )}
    </ManageShell>
)

export const createManageCalendarSubscriptionRoute = (deps: ManageCalendarSubscriptionDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))
    const baseUrl = deps.baseUrl ?? ''

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.calendarService) return c.html(<NotConfiguredPage user={user} />)
        const subscription = await deps.calendarService.getSubscription(user.id)
        return c.html(<SubscriptionPage user={user} subscription={subscription} baseUrl={baseUrl} flash={parseFlash(c)} />)
    })

    app.post('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.calendarService) return c.redirect(flashPath(CALENDAR_SUBSCRIPTION_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody<{ name?: string }>()
        const name = typeof body.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : undefined
        try {
            await deps.calendarService.createSubscription(user.id, name)
            return c.redirect(flashPath(CALENDAR_SUBSCRIPTION_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(CALENDAR_SUBSCRIPTION_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/regenerate', async (c) => {
        const user = c.get('manageUser')
        if (!deps.calendarService) return c.redirect(flashPath(CALENDAR_SUBSCRIPTION_PATH, 'err', 'not_configured'), 303)
        try {
            await deps.calendarService.regenerateSubscriptionToken(user.id)
            return c.redirect(flashPath(CALENDAR_SUBSCRIPTION_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(CALENDAR_SUBSCRIPTION_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/regenerate-ics', async (c) => {
        const user = c.get('manageUser')
        if (!deps.calendarService) return c.redirect(flashPath(CALENDAR_SUBSCRIPTION_PATH, 'err', 'not_configured'), 303)
        try {
            await deps.calendarService.regenerateIcsToken(user.id)
            return c.redirect(flashPath(CALENDAR_SUBSCRIPTION_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(CALENDAR_SUBSCRIPTION_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    return app
}
