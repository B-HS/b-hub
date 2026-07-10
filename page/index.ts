import { Hono } from 'hono'
import { homeRoute } from './home'
import { policyRoute } from './policy'
import { wellKnownRoute } from './well-known'
import { createAdminRoute, type AdminRouteDeps } from './admin'
import { createManageRoute, type ManageRouteDeps } from './manage'

export type PageDeps = {
    admin?: AdminRouteDeps
    manage?: ManageRouteDeps
}

export const createPage = (deps: PageDeps = {}) => {
    const page = new Hono()

    page.route('', homeRoute)
    page.route('/policy', policyRoute)
    page.route('', wellKnownRoute)
    if (deps.admin) page.route('/admin', createAdminRoute(deps.admin))
    if (deps.manage) page.route('/manage', createManageRoute(deps.manage))

    return page
}
