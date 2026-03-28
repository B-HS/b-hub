import { Hono } from 'hono'
import { homeRoute } from './home'
import { policyRoute } from './policy'
import { wellKnownRoute } from './well-known'

export const createPage = () => {
    const page = new Hono()

    page.route('', homeRoute)
    page.route('/policy', policyRoute)
    page.route('', wellKnownRoute)

    return page
}
