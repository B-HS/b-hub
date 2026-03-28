import { Hono } from 'hono'
import type { Context } from 'hono'

export const wellKnownRoute = new Hono()

const extractBasicAuthToken = (authHeader: string | undefined): string | null => {
    if (!authHeader?.startsWith('Basic ')) return null
    try {
        const decoded = atob(authHeader.slice(6))
        const colonIdx = decoded.indexOf(':')
        if (colonIdx === -1) return null
        return decoded.slice(colonIdx + 1)
    } catch {
        return null
    }
}

const unauthorizedResponse = () =>
    new Response('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="CalDAV"' },
    })

const redirectToCaldav = (token: string) =>
    new Response(null, {
        status: 301,
        headers: { Location: `/caldav/${token}/` },
    })

const handleWellKnown = (c: Context) => {
    const token = c.req.query('token')
    const basicToken = extractBasicAuthToken(c.req.header('Authorization'))

    if (token) return redirectToCaldav(token)
    if (basicToken) return redirectToCaldav(basicToken)

    return unauthorizedResponse()
}

const handleCaldavFallback = (c: Context) => {
    const basicToken = extractBasicAuthToken(c.req.header('Authorization'))

    if (basicToken) return redirectToCaldav(basicToken)

    return unauthorizedResponse()
}

wellKnownRoute.get('/.well-known/caldav', handleWellKnown)
wellKnownRoute.get('/.well-known/caldav/', handleWellKnown)
wellKnownRoute.on('PROPFIND', '/.well-known/caldav', handleWellKnown)
wellKnownRoute.on('PROPFIND', '/.well-known/caldav/', handleWellKnown)
wellKnownRoute.on('PROPFIND', '/', handleCaldavFallback)
wellKnownRoute.on('PROPFIND', '/principals/', handleCaldavFallback)
wellKnownRoute.on('PROPFIND', '/principals/*', handleCaldavFallback)
wellKnownRoute.on('PROPFIND', '/calendar/dav/*', handleCaldavFallback)
