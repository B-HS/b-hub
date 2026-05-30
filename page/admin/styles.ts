export const ADMIN_DESIGN_TOKENS_CSS = `:root {
    --palette-neutral-0: oklch(1 0 0);
    --palette-neutral-25: oklch(0.985 0 0);
    --palette-neutral-50: oklch(0.97 0 0);
    --palette-neutral-100: oklch(0.961 0 0);
    --palette-neutral-200: oklch(0.922 0 0);
    --palette-neutral-300: oklch(0.85 0 0);
    --palette-neutral-400: oklch(0.708 0 0);
    --palette-neutral-500: oklch(0.556 0 0);
    --palette-neutral-600: oklch(0.439 0 0);
    --palette-neutral-700: oklch(0.269 0 0);
    --palette-neutral-800: oklch(0.205 0 0);
    --palette-neutral-900: oklch(0.145 0 0);

    --palette-red-400: oklch(0.704 0.191 22);
    --palette-red-500: oklch(0.577 0.245 27);
    --palette-green-500: oklch(0.723 0.219 150);
    --palette-amber-500: oklch(0.752 0.164 85);

    --color-background: var(--palette-neutral-0);
    --color-foreground: var(--palette-neutral-900);
    --color-card: var(--palette-neutral-0);
    --color-card-foreground: var(--palette-neutral-900);
    --color-popover: var(--palette-neutral-0);
    --color-popover-foreground: var(--palette-neutral-900);

    --color-primary: var(--palette-neutral-800);
    --color-primary-foreground: var(--palette-neutral-25);
    --color-secondary: var(--palette-neutral-50);
    --color-secondary-foreground: var(--palette-neutral-800);
    --color-muted: var(--palette-neutral-50);
    --color-muted-foreground: var(--palette-neutral-500);
    --color-accent: var(--palette-neutral-50);
    --color-accent-foreground: var(--palette-neutral-800);

    --color-destructive: var(--palette-red-500);
    --color-destructive-foreground: var(--palette-neutral-0);
    --color-success: var(--palette-green-500);
    --color-warning: var(--palette-amber-500);

    --color-border: var(--palette-neutral-200);
    --color-input: var(--palette-neutral-200);
    --color-ring: var(--palette-neutral-400);

    --color-sidebar: var(--palette-neutral-25);
    --color-sidebar-foreground: var(--palette-neutral-900);
    --color-sidebar-primary: var(--palette-neutral-800);
    --color-sidebar-primary-foreground: var(--palette-neutral-25);
    --color-sidebar-accent: var(--palette-neutral-50);
    --color-sidebar-accent-foreground: var(--palette-neutral-800);
    --color-sidebar-border: var(--palette-neutral-200);

    --radius: 0.375rem;
    --radius-sm: calc(var(--radius) - 4px);
    --radius-md: calc(var(--radius) - 2px);
    --radius-lg: var(--radius);
    --radius-xl: calc(var(--radius) + 4px);

    --shadow-xs: 0 0 7px 0 hsl(0 0% 0% / 0.03);
    --shadow-sm: 0 0 7px 0 hsl(0 0% 0% / 0.06), 0 1px 2px -1px hsl(0 0% 0% / 0.06);
    --shadow-md: 0 0 7px 0 hsl(0 0% 0% / 0.06), 0 2px 4px -1px hsl(0 0% 0% / 0.06);
    --shadow-lg: 0 0 7px 0 hsl(0 0% 0% / 0.06), 0 4px 6px -1px hsl(0 0% 0% / 0.06);

    --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif,
        'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;

    --sidebar-width: 16rem;
    --topbar-height: 3rem;
}

@media (prefers-color-scheme: dark) {
    :root {
        --color-background: var(--palette-neutral-900);
        --color-foreground: var(--palette-neutral-25);
        --color-card: var(--palette-neutral-800);
        --color-card-foreground: var(--palette-neutral-25);
        --color-popover: var(--palette-neutral-800);
        --color-popover-foreground: var(--palette-neutral-25);
        --color-primary: var(--palette-neutral-200);
        --color-primary-foreground: var(--palette-neutral-800);
        --color-secondary: var(--palette-neutral-700);
        --color-secondary-foreground: var(--palette-neutral-25);
        --color-muted: var(--palette-neutral-700);
        --color-muted-foreground: var(--palette-neutral-400);
        --color-accent: var(--palette-neutral-700);
        --color-accent-foreground: var(--palette-neutral-25);
        --color-destructive: var(--palette-red-400);
        --color-border: oklch(1 0 0 / 10%);
        --color-input: oklch(1 0 0 / 15%);
        --color-ring: var(--palette-neutral-500);
        --color-sidebar: var(--palette-neutral-800);
        --color-sidebar-foreground: var(--palette-neutral-25);
        --color-sidebar-primary: var(--palette-neutral-25);
        --color-sidebar-primary-foreground: var(--palette-neutral-800);
        --color-sidebar-accent: var(--palette-neutral-700);
        --color-sidebar-accent-foreground: var(--palette-neutral-25);
        --color-sidebar-border: oklch(1 0 0 / 10%);
    }
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    border: 0 solid var(--color-border);
}

html,
body {
    height: 100%;
    background: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
}

a {
    color: inherit;
    text-decoration: none;
}

a:hover {
    text-decoration: underline;
    text-underline-offset: 4px;
}

button,
input,
select,
textarea {
    font: inherit;
    color: inherit;
}

table {
    border-collapse: collapse;
    width: 100%;
}

.app {
    display: flex;
    min-height: 100dvh;
    width: 100%;
}

.sidebar {
    width: var(--sidebar-width);
    background: var(--color-sidebar);
    border-right: 1px solid var(--color-sidebar-border);
    color: var(--color-sidebar-foreground);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem 0.5rem;
    position: sticky;
    top: 0;
    height: 100dvh;
    overflow-y: auto;
}

.sidebar-brand {
    padding: 0.5rem 0.75rem;
    font-weight: 700;
    font-size: 1rem;
    color: var(--color-sidebar-foreground);
    margin-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-sidebar-border);
    padding-bottom: 0.75rem;
}

.sidebar-group {
    padding: 0.75rem 0.75rem 0.25rem;
    font-size: 0.6875rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-muted-foreground);
}

.sidebar-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    border-radius: var(--radius-md);
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-sidebar-foreground);
    transition: background-color 150ms ease;
}

.sidebar-link:hover {
    background: var(--color-sidebar-accent);
    text-decoration: none;
}

.sidebar-link.active {
    background: var(--color-sidebar-accent);
    color: var(--color-sidebar-accent-foreground);
}

.main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    height: var(--topbar-height);
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0 1rem;
    border-bottom: 1px solid var(--color-border);
    background: color-mix(in oklch, var(--color-background) 95%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
}

.topbar-title {
    font-size: 1.125rem;
    font-weight: 600;
}

.topbar-user {
    margin-left: auto;
    font-size: 0.8125rem;
    color: var(--color-muted-foreground);
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.section {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    flex: 1;
    min-width: 0;
}

.section-head {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

.section-title {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.01em;
}

.section-sub {
    font-size: 0.875rem;
    color: var(--color-muted-foreground);
}

.crumbs {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
}

.crumbs a:hover {
    color: var(--color-foreground);
}

.crumbs .sep {
    opacity: 0.5;
}

.card {
    background: var(--color-card);
    color: var(--color-card-foreground);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    padding: 1rem 1.25rem;
}

.cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.75rem;
}

.stat {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.stat .label {
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.stat .value {
    font-size: 1.75rem;
    font-weight: 700;
    line-height: 1.2;
}

.stat .delta {
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
}

.table-wrap {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--color-card);
    box-shadow: var(--shadow-xs);
}

.table-scroll {
    overflow-x: auto;
}

.t {
    width: 100%;
    font-size: 0.8125rem;
}

.t thead th {
    height: 2.5rem;
    padding: 0 0.75rem;
    text-align: left;
    font-weight: 500;
    color: var(--color-muted-foreground);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
    background: var(--color-secondary);
}

.t tbody td {
    padding: 0.625rem 0.75rem;
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
}

.t tbody tr:last-child td {
    border-bottom: 0;
}

.t tbody tr:hover {
    background: color-mix(in oklch, var(--color-muted) 50%, transparent);
}

.t .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.t .mono {
    font-family: var(--font-mono);
    font-size: 0.75rem;
}

.t .nowrap {
    white-space: nowrap;
}

.t .truncate {
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    height: 2rem;
    padding: 0 0.75rem;
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
    white-space: nowrap;
}

.btn:hover {
    background: color-mix(in oklch, var(--color-primary) 90%, transparent);
    text-decoration: none;
}

.btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-ring) 50%, transparent);
    border-color: var(--color-ring);
}

.btn.outline {
    background: var(--color-background);
    color: var(--color-foreground);
    border-color: var(--color-input);
    box-shadow: var(--shadow-xs);
}

.btn.outline:hover {
    background: var(--color-accent);
    color: var(--color-accent-foreground);
}

.btn.ghost {
    background: transparent;
    color: var(--color-foreground);
}

.btn.ghost:hover {
    background: var(--color-accent);
}

.btn.destructive {
    background: var(--color-destructive);
    color: var(--color-destructive-foreground);
}

.btn.destructive:hover {
    background: color-mix(in oklch, var(--color-destructive) 90%, transparent);
}

.btn.sm {
    height: 1.625rem;
    padding: 0 0.5rem;
    font-size: 0.75rem;
}

.btn[disabled],
.btn.disabled {
    pointer-events: none;
    opacity: 0.5;
}

.row-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
}

.row-actions form {
    display: inline-block;
}

.badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    height: 1.25rem;
    padding: 0 0.5rem;
    border-radius: 9999px;
    font-size: 0.6875rem;
    font-weight: 500;
    border: 1px solid transparent;
    white-space: nowrap;
}

.badge.default {
    background: var(--color-primary);
    color: var(--color-primary-foreground);
}

.badge.secondary {
    background: var(--color-secondary);
    color: var(--color-secondary-foreground);
}

.badge.outline {
    background: transparent;
    color: var(--color-foreground);
    border-color: var(--color-border);
}

.badge.success {
    background: color-mix(in oklch, var(--color-primary) 10%, transparent);
    color: var(--color-primary);
}

.badge.muted {
    background: var(--color-muted);
    color: var(--color-muted-foreground);
}

.badge.destructive {
    background: color-mix(in oklch, var(--color-destructive) 10%, transparent);
    color: var(--color-destructive);
}

.filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: end;
    padding: 0.875rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-card);
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.field > label {
    font-size: 0.6875rem;
    color: var(--color-muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.input,
.select {
    height: 2rem;
    min-width: 10rem;
    padding: 0 0.625rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-input);
    background: var(--color-background);
    color: var(--color-foreground);
    font-size: 0.8125rem;
    box-shadow: var(--shadow-xs);
    transition: border-color 150ms ease, box-shadow 150ms ease;
}

.input:focus,
.select:focus {
    outline: none;
    border-color: var(--color-ring);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-ring) 50%, transparent);
}

.checkbox-row {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    color: var(--color-foreground);
}

.pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-top: 0.5rem;
}

.pagination .summary {
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
}

.pagination .nav {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
}

.empty {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--color-muted-foreground);
    font-size: 0.875rem;
}

.kv {
    display: grid;
    grid-template-columns: 10rem 1fr;
    gap: 0.5rem 1rem;
    font-size: 0.8125rem;
}

.kv dt {
    color: var(--color-muted-foreground);
}

.kv dd {
    color: var(--color-foreground);
    word-break: break-all;
}

.banner {
    padding: 0.75rem 1rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    font-size: 0.8125rem;
}

.banner.ok {
    background: color-mix(in oklch, var(--color-primary) 6%, transparent);
    color: var(--color-foreground);
}

.banner.err {
    background: color-mix(in oklch, var(--color-destructive) 10%, transparent);
    color: var(--color-destructive);
    border-color: color-mix(in oklch, var(--color-destructive) 30%, transparent);
}

.login-shell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: 1rem;
}

.login-card {
    width: 100%;
    max-width: 24rem;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    text-align: center;
}

.login-title {
    font-size: 1.25rem;
    font-weight: 700;
}

.login-sub {
    color: var(--color-muted-foreground);
    font-size: 0.875rem;
}

@media (max-width: 768px) {
    .sidebar {
        display: none;
    }
    .section {
        padding: 1rem;
    }
}
`

export const ADMIN_DESIGN_TOKENS_CACHE_HEADERS = {
    'Content-Type': 'text/css; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
}
