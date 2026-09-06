import type { Context, Next } from 'hono'
import type { AdminGetSession, AdminSessionUser } from '../admin/guard'
import { resolveAdminSession } from '../admin/guard'

export type ManageSessionUser = AdminSessionUser
export type ManageGetSession = AdminGetSession

export type ManageContext = {
    Variables: {
        manageUser: ManageSessionUser
    }
}

export const requireSessionPage =
    (getSession: ManageGetSession) =>
    async (c: Context, next: Next): Promise<Response | void> => {
        const session = await resolveAdminSession(c, getSession)
        if (!session) {
            const url = new URL(c.req.url)
            const next = url.pathname + url.search
            return c.redirect(`/manage/login?next=${encodeURIComponent(next)}`, 303)
        }
        c.set('manageUser', session.user)
        await next()
    }
