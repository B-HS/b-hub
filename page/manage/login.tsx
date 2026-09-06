import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import type { AuthProvider } from '../../service/shared/auth-provider'
import type { ManageGetSession } from './guard'
import { resolveAdminSession } from '../admin/guard'

const SOCIAL_PROVIDERS = ['google', 'github'] as const
type SocialProvider = (typeof SOCIAL_PROVIDERS)[number]

const isSocialProvider = (value: string): value is SocialProvider => (SOCIAL_PROVIDERS as readonly string[]).includes(value)

const sanitizeNext = (raw: string | undefined): string => (raw && raw.startsWith('/manage') ? raw : '/manage')

const LoginPage: FC<{ nextPath: string }> = ({ nextPath }) => (
    <html lang='ko'>
        <head>
            <meta charset='UTF-8' />
            <meta name='viewport' content='width=device-width, initial-scale=1.0' />
            <meta name='robots' content='noindex,nofollow' />
            <title>Manage Login · hyun-hub</title>
            <link rel='icon' href='/favicon.ico' />
            <link rel='stylesheet' href='/manage/styles.css' />
        </head>
        <body>
            <div class='login-shell'>
                <div class='login-card'>
                    <div class='login-title'>hyun-hub</div>
                    <p class='login-sub'>계정으로 로그인해 주세요.</p>
                    <a class='btn' href={`/manage/login/social/google?next=${encodeURIComponent(nextPath)}`}>
                        Google 로그인
                    </a>
                    <a class='btn outline' href={`/manage/login/social/github?next=${encodeURIComponent(nextPath)}`}>
                        GitHub 로그인
                    </a>
                    <a class='btn ghost' href='/'>
                        홈으로
                    </a>
                </div>
            </div>
        </body>
    </html>
)

const forwardSetCookies = (from: Response, to: Response) => {
    for (const cookie of from.headers.getSetCookie()) to.headers.append('set-cookie', cookie)
    return to
}

const resolveRedirectUrl = async (res: Response): Promise<string | null> => {
    const location = res.headers.get('location')
    if (location) return location
    const data = (await res
        .clone()
        .json()
        .catch(() => null)) as { url?: string } | null
    return data?.url ?? null
}

export type ManageLoginRouteDeps = { getSession: ManageGetSession; auth?: AuthProvider }

export const createManageLoginRoute = (deps: ManageLoginRouteDeps) => {
    const app = new Hono()

    app.get('/', async (c) => {
        const next = sanitizeNext(c.req.query('next'))
        const session = await resolveAdminSession(c, deps.getSession)
        if (session) return c.redirect(next, 303)
        return c.html(<LoginPage nextPath={next} />)
    })

    app.get('/social/:provider', async (c) => {
        const provider = c.req.param('provider')
        if (!isSocialProvider(provider) || !deps.auth) return c.redirect('/manage/login', 303)
        const next = sanitizeNext(c.req.query('next'))
        const res = await deps.auth.api.signInSocial({
            body: { provider, callbackURL: next },
            headers: c.req.raw.headers,
            asResponse: true,
        })
        const url = await resolveRedirectUrl(res)
        if (!url) return c.redirect('/manage/login', 303)
        return forwardSetCookies(res, new Response(null, { status: 302, headers: { location: url } }))
    })

    app.get('/logout', async (c) => {
        if (!deps.auth) return c.redirect('/manage/login', 303)
        const res = await deps.auth.api.signOut({ headers: c.req.raw.headers, asResponse: true })
        return forwardSetCookies(res, new Response(null, { status: 302, headers: { location: '/manage/login' } }))
    })

    return app
}
