import { Hono } from 'hono'
import { homeRoute } from './home'
import { policyRoute } from './policy'

export const createPage = () => {
    const page = new Hono()

    page.route('', homeRoute)
    page.route('/policy', policyRoute)

    page.get('/.well-known/caldav', (c) => {
        const token = c.req.query('token')
        if (token) return c.redirect(`/caldav/${token}/`, 301)
        return c.text('CalDAV server. Use /caldav/:token/', 200)
    })

    return page
}
