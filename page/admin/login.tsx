import { Hono } from 'hono'
import type { Context } from 'hono'
import type { FC } from 'hono/jsx'
import type { AuthProvider } from '../../service/shared/auth-provider'
import { CsrfField } from './components'
import type { AdminGetSession } from './guard'
import { resolveAdminSession } from './guard'

const SOCIAL_PROVIDERS = ['google', 'github'] as const
type SocialProvider = (typeof SOCIAL_PROVIDERS)[number]

const isSocialProvider = (value: string): value is SocialProvider => (SOCIAL_PROVIDERS as readonly string[]).includes(value)

const sanitizeNext = (raw: string | undefined): string => (raw && raw.startsWith('/admin') ? raw : '/admin')

type LoginPageProps = { nextPath: string; isAuthenticated: boolean; userEmail?: string }

const LoginPage: FC<LoginPageProps> = ({ nextPath, isAuthenticated, userEmail }) => (
    <html lang='ko'>
        <head>
            <meta charset='UTF-8' />
            <meta name='viewport' content='width=device-width, initial-scale=1.0' />
            <meta name='robots' content='noindex,nofollow' />
            <title>Admin Login · hyun-hub</title>
            <link rel='icon' href='/favicon.ico' />
            <link rel='stylesheet' href='/admin/styles.css' />
        </head>
        <body>
            <div class='login-shell'>
                <div class='login-card'>
                    <div class='login-title'>hyun-hub Admin</div>
                    {isAuthenticated ? (
                        <>
                            <p class='login-sub'>{userEmail} 계정에는 어드민 권한이 없습니다. 다른 계정으로 로그인해 주세요.</p>
                            <form method='post' action='/admin/login/logout'>
                                <CsrfField />
                                <button class='btn outline' type='submit'>
                                    로그아웃
                                </button>
                            </form>
                            <a class='btn ghost' href='/'>
                                홈으로
                            </a>
                        </>
                    ) : (
                        <>
                            <p class='login-sub'>관리자 계정으로 로그인해 주세요.</p>
                            <a class='btn' href={`/admin/login/social/google?next=${encodeURIComponent(nextPath)}`}>
                                Google 로그인
                            </a>
                            <a class='btn outline' href={`/admin/login/social/github?next=${encodeURIComponent(nextPath)}`}>
                                GitHub 로그인
                            </a>
                            <a class='btn ghost' href='/'>
                                홈으로
                            </a>
                        </>
                    )}
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

export type LoginRouteDeps = { getSession: AdminGetSession; auth?: AuthProvider }

export const createLoginRoute = (deps: LoginRouteDeps) => {
    const app = new Hono()

    app.get('/', async (c) => {
        const next = sanitizeNext(c.req.query('next'))
        const session = await resolveAdminSession(c, deps.getSession)
        if (session && session.user.role === 'admin') return c.redirect(next, 303)
        return c.html(<LoginPage nextPath={next} isAuthenticated={!!session} userEmail={session?.user.email} />)
    })

    app.get('/social/:provider', async (c) => {
        const provider = c.req.param('provider')
        if (!isSocialProvider(provider) || !deps.auth) return c.redirect('/admin/login', 303)
        const next = sanitizeNext(c.req.query('next'))
        const res = await deps.auth.api.signInSocial({
            body: { provider, callbackURL: next },
            headers: c.req.raw.headers,
            asResponse: true,
        })
        const url = await resolveRedirectUrl(res)
        if (!url) return c.redirect('/admin/login', 303)
        return forwardSetCookies(res, new Response(null, { status: 302, headers: { location: url } }))
    })

    const handleLogout = async (c: Context) => {
        if (!deps.auth) return c.redirect('/admin/login', 303)
        const res = await deps.auth.api.signOut({ headers: c.req.raw.headers, asResponse: true })
        return forwardSetCookies(res, new Response(null, { status: 302, headers: { location: '/admin/login' } }))
    }

    app.get('/logout', handleLogout)
    app.post('/logout', handleLogout)

    return app
}
