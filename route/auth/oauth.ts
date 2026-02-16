import { Hono } from 'hono'
import type { AuthProvider } from '../../service/shared/auth-provider'

type OAuthRouteDeps = {
    auth: AuthProvider
}

export const createOAuthRoute = (deps: OAuthRouteDeps) => {
    const route = new Hono()

    route.on(['POST', 'GET'], '/*', (c) => deps.auth.handler(c.req.raw))

    return route
}
