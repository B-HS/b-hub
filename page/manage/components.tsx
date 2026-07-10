import type { FC, PropsWithChildren } from 'hono/jsx'
import { ADMIN_CONFIRM_SCRIPT } from '../admin/components'
import type { AdminSessionUser } from '../admin/guard'
import type { Flash } from '../admin/flash'
import { MANAGE_NAV, isActiveManagePath, type ManageNavItem } from './nav'
import { readManageTheme, type ThemeMode } from './theme'

type ManageShellProps = {
    title: string
    subtitle?: string
    user: AdminSessionUser
    currentPath: string
    flash?: Flash | null
}

export const ManageShell: FC<PropsWithChildren<ManageShellProps>> = ({ title, subtitle, user, currentPath, flash, children }) => {
    const theme = readManageTheme()
    return (
        <html lang='ko' data-theme={theme ?? undefined}>
            <head>
                <meta charset='UTF-8' />
                <meta name='viewport' content='width=device-width, initial-scale=1.0' />
                <meta name='robots' content='noindex,nofollow' />
                <title>{title} · Manage</title>
                <link rel='icon' href='/favicon.ico' />
                <link rel='stylesheet' href='/manage/styles.css' />
            </head>
            <body>
                <div class='app'>
                    <ManageSidebar currentPath={currentPath} />
                    <main class='main'>
                        <ManageTopbar title={title} user={user} currentPath={currentPath} theme={theme} />
                        <section class='section'>
                            <header class='section-head'>
                                <h1 class='section-title'>{title}</h1>
                                {subtitle && <p class='section-sub'>{subtitle}</p>}
                            </header>
                            {flash && <ManageFlashBanner flash={flash} />}
                            {children}
                        </section>
                    </main>
                </div>
                <script dangerouslySetInnerHTML={{ __html: ADMIN_CONFIRM_SCRIPT }} />
            </body>
        </html>
    )
}

const ManageSidebar: FC<{ currentPath: string }> = ({ currentPath }) => (
    <aside class='sidebar' aria-label='Manage navigation'>
        <a class='sidebar-brand' href='/manage'>
            hyun-hub
        </a>
        {MANAGE_NAV.map((group) => (
            <div key={group.title}>
                <div class='sidebar-group'>{group.title}</div>
                {group.items.map((item) => (
                    <ManageSidebarLink key={item.href} item={item} currentPath={currentPath} />
                ))}
            </div>
        ))}
    </aside>
)

const ManageSidebarLink: FC<{ item: ManageNavItem; currentPath: string }> = ({ item, currentPath }) => (
    <a class={`sidebar-link${isActiveManagePath(currentPath, item.href) ? ' active' : ''}`} href={item.href}>
        {item.label}
    </a>
)

const ManageTopbar: FC<{ title: string; user: AdminSessionUser; currentPath: string; theme: ThemeMode | null }> = ({
    title,
    user,
    currentPath,
    theme,
}) => {
    const next = theme === 'dark' ? 'light' : 'dark'
    const toggleHref = `/manage/theme?to=${next}&returnTo=${encodeURIComponent(currentPath)}`
    const roleLabel = user.role ?? 'user'
    return (
        <div class='topbar'>
            <span class='topbar-title'>{title}</span>
            <span class='topbar-user'>
                <a class='btn ghost sm theme-toggle' href={toggleHref} aria-label='테마 전환'>
                    {next === 'dark' ? '다크 모드' : '라이트 모드'}
                </a>
                <span>{user.email}</span>
                <span class={`badge ${roleLabel === 'admin' ? 'destructive' : 'secondary'}`}>{roleLabel}</span>
            </span>
        </div>
    )
}

const ManageFlashBanner: FC<{ flash: Flash }> = ({ flash }) => (
    <div class={`banner ${flash.kind}`} role={flash.kind === 'err' ? 'alert' : 'status'}>
        {flash.message}
    </div>
)

export const RevealBanner: FC<{ label: string; value: string; note: string }> = ({ label, value, note }) => (
    <div class='banner ok'>
        <div class='card-title-sm'>{label}</div>
        <div class='mono prewrap'>{value}</div>
        <div class='text-muted mt-sm'>{note}</div>
    </div>
)
