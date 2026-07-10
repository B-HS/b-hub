import type { Child, FC, PropsWithChildren } from 'hono/jsx'
import { NAV, isActivePath, type NavItem } from './nav'
import type { AdminSessionUser } from './guard'
import { readAdminTheme, type ThemeMode } from './theme'
import { ADMIN_CSRF_FIELD, readCsrfToken } from './csrf'
import type { Flash } from './flash'

const DEFAULT_DESTRUCTIVE_CONFIRM = '이 작업은 되돌릴 수 없습니다. 계속할까요?'

export const ADMIN_CONFIRM_SCRIPT = `document.addEventListener('submit',function(e){var f=e.target;if(f&&f.getAttribute&&f.hasAttribute('data-confirm')&&!window.confirm(f.getAttribute('data-confirm')))e.preventDefault();},true);`

type ShellProps = {
    title: string
    subtitle?: string
    user: AdminSessionUser
    currentPath: string
    breadcrumbs?: { href?: string; label: string }[]
    flash?: Flash | null
}

export const AdminShell: FC<PropsWithChildren<ShellProps>> = ({ title, subtitle, user, currentPath, breadcrumbs, flash, children }) => {
    const theme = readAdminTheme()
    return (
        <html lang='ko' data-theme={theme ?? undefined}>
            <head>
                <meta charset='UTF-8' />
                <meta name='viewport' content='width=device-width, initial-scale=1.0' />
                <meta name='robots' content='noindex,nofollow' />
                <title>{title} · Admin</title>
                <link rel='icon' href='/favicon.ico' />
                <link rel='stylesheet' href='/admin/styles.css' />
            </head>
            <body>
                <div class='app'>
                    <Sidebar currentPath={currentPath} />
                    <main class='main'>
                        <Topbar title={title} user={user} currentPath={currentPath} theme={theme} />
                        <section class='section'>
                            {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
                            <header class='section-head'>
                                <h1 class='section-title'>{title}</h1>
                                {subtitle && <p class='section-sub'>{subtitle}</p>}
                            </header>
                            {flash && <FlashBanner flash={flash} />}
                            {children}
                        </section>
                    </main>
                </div>
                <script dangerouslySetInnerHTML={{ __html: ADMIN_CONFIRM_SCRIPT }} />
            </body>
        </html>
    )
}

const Sidebar: FC<{ currentPath: string }> = ({ currentPath }) => (
    <aside class='sidebar' aria-label='Admin navigation'>
        <a class='sidebar-brand' href='/admin'>
            hyun-hub Admin
        </a>
        {NAV.map((group) => (
            <div key={group.title}>
                <div class='sidebar-group'>{group.title}</div>
                {group.items.map((item) => (
                    <SidebarLink key={item.href} item={item} currentPath={currentPath} />
                ))}
            </div>
        ))}
    </aside>
)

const SidebarLink: FC<{ item: NavItem; currentPath: string }> = ({ item, currentPath }) => (
    <a class={`sidebar-link${isActivePath(currentPath, item.href) ? ' active' : ''}`} href={item.href}>
        {item.label}
    </a>
)

const Topbar: FC<{ title: string; user: AdminSessionUser; currentPath: string; theme: ThemeMode | null }> = ({ title, user, currentPath, theme }) => {
    const next = theme === 'dark' ? 'light' : 'dark'
    const toggleHref = `/admin/theme?to=${next}&returnTo=${encodeURIComponent(currentPath)}`
    return (
        <div class='topbar'>
            <span class='topbar-title'>{title}</span>
            <span class='topbar-user'>
                <a class='btn ghost sm theme-toggle' href={toggleHref} aria-label='테마 전환'>
                    {next === 'dark' ? '다크 모드' : '라이트 모드'}
                </a>
                <span>{user.email}</span>
                <span class='badge destructive'>admin</span>
            </span>
        </div>
    )
}

export const CsrfField: FC = () => {
    const token = readCsrfToken()
    return token ? <input type='hidden' name={ADMIN_CSRF_FIELD} value={token} /> : <></>
}

const Breadcrumbs: FC<{ items: { href?: string; label: string }[] }> = ({ items }) => (
    <nav class='crumbs' aria-label='Breadcrumb'>
        {items.map((c, i) => (
            <span key={i}>
                {c.href ? <a href={c.href}>{c.label}</a> : <span>{c.label}</span>}
                {i < items.length - 1 && <span class='sep'> / </span>}
            </span>
        ))}
    </nav>
)

const FlashBanner: FC<{ flash: Flash }> = ({ flash }) => (
    <div class={`banner ${flash.kind}`} role={flash.kind === 'err' ? 'alert' : 'status'}>
        {flash.message}
    </div>
)

export type Column<T> = {
    key: string
    header: string
    cell: (row: T) => Child
    className?: string
}

type DataTableProps<T> = {
    rows: T[]
    columns: Column<T>[]
    rowKey: (row: T) => string | number
    empty?: string
}

export const DataTable = <T,>({ rows, columns, rowKey, empty = '데이터가 없습니다.' }: DataTableProps<T>) => (
    <div class='table-wrap'>
        <div class='table-scroll'>
            <table class='t'>
                <thead>
                    <tr>
                        {columns.map((c) => (
                            <th key={c.key} class={c.className}>
                                {c.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colspan={columns.length}>
                                <div class='empty'>{empty}</div>
                            </td>
                        </tr>
                    ) : (
                        rows.map((row) => (
                            <tr key={rowKey(row)}>
                                {columns.map((c) => (
                                    <td key={c.key} class={c.className}>
                                        {c.cell(row)}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    </div>
)

type BadgeKind = 'default' | 'secondary' | 'outline' | 'success' | 'muted' | 'destructive'

export const Badge: FC<PropsWithChildren<{ kind?: BadgeKind }>> = ({ kind = 'secondary', children }) => (
    <span class={`badge ${kind}`}>{children}</span>
)

type PaginationProps = {
    page: number
    pageSize: number
    total: number
    baseQuery: Record<string, string | number | undefined>
    basePath: string
}

const PAGE_SIZE_PRESETS = [20, 50, 100] as const
const PAGE_WINDOW = 5

const PageLink: FC<PropsWithChildren<{ href: string; disabled?: boolean; active?: boolean; label?: string }>> = ({
    href,
    disabled,
    active,
    label,
    children,
}) => (
    <a
        class={`btn sm ${active ? 'default' : 'outline'}${disabled ? ' disabled' : ''}`}
        aria-disabled={disabled ? 'true' : undefined}
        aria-current={active ? 'page' : undefined}
        aria-label={label}
        href={disabled ? '#' : href}>
        {children}
    </a>
)

export const Pagination: FC<PaginationProps> = ({ page, pageSize, total, baseQuery, basePath }) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const current = Math.min(Math.max(page, 1), totalPages)
    const buildHref = (overrides: Record<string, string | number>) => {
        const qs = new URLSearchParams()
        for (const [k, v] of Object.entries({ ...baseQuery, ...overrides })) {
            if (v === undefined || v === '' || v === null) continue
            qs.set(k, String(v))
        }
        return `${basePath}?${qs.toString()}`
    }
    const pageHref = (p: number) => buildHref({ page: p })
    const sizeHref = (size: number) => buildHref({ page: 1, size })
    const windowStart = Math.max(1, Math.min(current - Math.floor(PAGE_WINDOW / 2), totalPages - PAGE_WINDOW + 1))
    const start = Math.max(1, windowStart)
    const end = Math.min(totalPages, start + PAGE_WINDOW - 1)
    const pageNumbers = Array.from({ length: end - start + 1 }, (_, i) => start + i)
    const from = total === 0 ? 0 : (current - 1) * pageSize + 1
    const to = Math.min(current * pageSize, total)
    return (
        <div class='pagination'>
            <span class='summary'>
                {from}–{to} / {total} (page {current} / {totalPages})
            </span>
            <div class='page-size'>
                <span class='page-size-label'>표시</span>
                {PAGE_SIZE_PRESETS.map((size) => (
                    <PageLink key={size} href={sizeHref(size)} active={size === pageSize} label={`페이지당 ${size}개`}>
                        {size}
                    </PageLink>
                ))}
            </div>
            <div class='nav'>
                <PageLink href={pageHref(1)} disabled={current === 1} label='처음 페이지'>
                    처음
                </PageLink>
                <PageLink href={pageHref(current - 1)} disabled={current === 1} label='이전 페이지'>
                    이전
                </PageLink>
                {start > 1 && <span class='ellipsis'>…</span>}
                {pageNumbers.map((p) => (
                    <PageLink key={p} href={pageHref(p)} active={p === current} label={`${p} 페이지`}>
                        {p}
                    </PageLink>
                ))}
                {end < totalPages && <span class='ellipsis'>…</span>}
                <PageLink href={pageHref(current + 1)} disabled={current === totalPages} label='다음 페이지'>
                    다음
                </PageLink>
                <PageLink href={pageHref(totalPages)} disabled={current === totalPages} label='마지막 페이지'>
                    끝
                </PageLink>
            </div>
        </div>
    )
}

type FilterFieldText = { kind: 'text'; name: string; label: string; value?: string; placeholder?: string }
type FilterFieldSelect = { kind: 'select'; name: string; label: string; value?: string; options: { value: string; label: string }[] }
type FilterFieldNumber = { kind: 'number'; name: string; label: string; value?: number | string }
type FilterFieldDate = { kind: 'date'; name: string; label: string; value?: string }
export type FilterField = FilterFieldText | FilterFieldSelect | FilterFieldNumber | FilterFieldDate

export const FilterBar: FC<{ action: string; fields: FilterField[]; hidden?: Record<string, string | number | undefined> }> = ({
    action,
    fields,
    hidden,
}) => (
    <form class='filter-bar' method='get' action={action}>
        {hidden && Object.entries(hidden).map(([k, v]) => v !== undefined && v !== '' && <input key={k} type='hidden' name={k} value={String(v)} />)}
        {fields.map((f) => (
            <div class='field' key={f.name}>
                <label for={`f-${f.name}`}>{f.label}</label>
                {f.kind === 'text' && (
                    <input id={`f-${f.name}`} class='input' type='text' name={f.name} value={f.value ?? ''} placeholder={f.placeholder ?? ''} />
                )}
                {f.kind === 'number' && (
                    <input id={`f-${f.name}`} class='input' type='number' name={f.name} value={f.value !== undefined ? String(f.value) : ''} />
                )}
                {f.kind === 'date' && <input id={`f-${f.name}`} class='input' type='date' name={f.name} value={f.value ?? ''} />}
                {f.kind === 'select' && (
                    <select id={`f-${f.name}`} class='select' name={f.name}>
                        {f.options.map((o) => (
                            <option key={o.value} value={o.value} selected={f.value === o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                )}
            </div>
        ))}
        <button class='btn' type='submit'>
            적용
        </button>
    </form>
)

type RowActionProps = {
    method?: 'post'
    action: string
    label: string
    variant?: 'default' | 'outline' | 'ghost' | 'destructive'
    confirm?: string
    hidden?: Record<string, string | number>
    returnTo?: string
}

export const RowAction: FC<RowActionProps> = ({ method = 'post', action, label, variant = 'outline', confirm, hidden, returnTo }) => {
    const confirmMessage = confirm ?? (variant === 'destructive' ? DEFAULT_DESTRUCTIVE_CONFIRM : undefined)
    return (
        <form method={method} action={action} data-confirm={confirmMessage}>
            <CsrfField />
            {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type='hidden' name={k} value={String(v)} />)}
            {returnTo && <input type='hidden' name='returnTo' value={returnTo} />}
            <button class={`btn sm ${variant}`} type='submit'>
                {label}
            </button>
        </form>
    )
}

export const Stat: FC<{ label: string; value: string | number; delta?: string }> = ({ label, value, delta }) => (
    <div class='card stat'>
        <span class='label'>{label}</span>
        <span class='value'>{value}</span>
        {delta && <span class='delta'>{delta}</span>}
    </div>
)
