import { Hono } from 'hono'
import { homeRoute } from './home'
import { policyRoute } from './policy'

export const createPage = () => {
    const page = new Hono()

    page.route('', homeRoute)
    page.route('/policy', policyRoute)

    const handleWellKnown = (c: {
        req: { query: (k: string) => string | undefined }
        redirect: (url: string, code: number) => Response
        text: (body: string, code: number) => Response
    }) => {
        const token = c.req.query('token')
        if (token) return c.redirect(`/caldav/${token}/`, 301)
        return c.text('CalDAV server. Use /caldav/:token/', 200)
    }

    page.get('/.well-known/caldav', handleWellKnown as never)
    page.on('PROPFIND', '/.well-known/caldav', handleWellKnown as never)

    return page
}
