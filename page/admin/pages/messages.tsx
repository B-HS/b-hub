import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { AdminShell, Badge, DataTable, FilterBar, Pagination, RowAction, type Column } from '../components'
import { flashPath, parseFlash } from '../flash'
import { formatDate, parseIntOr, readPage, truncate } from '../format'
import type { AdminContext, AdminGetSession } from '../guard'
import { requireAdminPage } from '../guard'
import type { AdminDb } from '../db'

type MsgRow = Awaited<ReturnType<AdminDb['listMessages']>>['rows'][number]
type FollowRow = Awaited<ReturnType<AdminDb['listFollows']>>['rows'][number]
type MsgDetail = NonNullable<Awaited<ReturnType<AdminDb['getMessage']>>>
type MsgImage = Awaited<ReturnType<AdminDb['getMessageImages']>>[number]
type MsgLike = Awaited<ReturnType<AdminDb['getMessageLikes']>>[number]
type MsgBookmark = Awaited<ReturnType<AdminDb['getMessageBookmarks']>>[number]

const sanitizeReturn = (raw: unknown, fallback: string): string => {
    const v = typeof raw === 'string' ? raw : ''
    return v.startsWith('/admin') ? v : fallback
}

const MessagesPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: MsgRow[]
    total: number
    page: number
    size: number
    q?: string
    userId?: string
    includeDeleted?: string
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, q, userId, includeDeleted, flash }) => (
    <AdminShell title='Messages' subtitle='Social feed 메시지' user={user} currentPath='/admin/messages' flash={flash}>
        <FilterBar
            action='/admin/messages'
            fields={[
                { kind: 'text', name: 'q', label: '본문 검색', value: q },
                { kind: 'text', name: 'userId', label: 'User ID', value: userId },
                {
                    kind: 'select',
                    name: 'includeDeleted',
                    label: 'Deleted',
                    value: includeDeleted,
                    options: [
                        { value: '', label: '제외' },
                        { value: 'y', label: '포함' },
                    ],
                },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'time', header: 'Time', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    { key: 'user', header: 'User', cell: (r) => r.userEmail ?? r.userId },
                    {
                        key: 'body',
                        header: 'Body',
                        cell: (r) => <a href={`/admin/messages/${r.id}`}>{truncate(r.body, 120)}</a>,
                        className: 'truncate',
                    },
                    {
                        key: 'kind',
                        header: 'Kind',
                        cell: (r) => (
                            <div class='hstack-sm'>
                                {r.replyToId && <Badge kind='outline'>reply</Badge>}
                                {r.retweetOfId && <Badge kind='outline'>retweet</Badge>}
                                {!r.replyToId && !r.retweetOfId && <Badge kind='muted'>post</Badge>}
                            </div>
                        ),
                    },
                    { key: 'likes', header: 'Likes', cell: (r) => r.likesCount, className: 'num' },
                    { key: 'bookmarks', header: 'Bookmarks', cell: (r) => r.bookmarksCount, className: 'num' },
                    {
                        key: 'state',
                        header: 'State',
                        cell: (r) => (r.deletedAt ? <Badge kind='destructive'>deleted</Badge> : <Badge kind='success'>live</Badge>),
                    },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => {
                            const back = `/admin/messages?page=${page}&size=${size}${q ? `&q=${encodeURIComponent(q)}` : ''}${includeDeleted ? `&includeDeleted=${includeDeleted}` : ''}`
                            return r.deletedAt ? (
                                <RowAction action={`/admin/messages/${r.id}/restore`} label='restore' returnTo={back} />
                            ) : (
                                <RowAction action={`/admin/messages/${r.id}/delete`} label='soft delete' variant='destructive' returnTo={back} />
                            )
                        },
                    },
                ] as Column<MsgRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, userId, includeDeleted, size }} basePath='/admin/messages' />
    </AdminShell>
)

const FollowsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: FollowRow[]
    total: number
    page: number
    size: number
}> = ({ user, rows, total, page, size }) => (
    <AdminShell title='Follows' subtitle='팔로우 그래프 전체' user={user} currentPath='/admin/messages/follows'>
        <DataTable
            rows={rows}
            rowKey={(r) => `${r.followerId}:${r.followingId}`}
            columns={
                [
                    {
                        key: 'follower',
                        header: 'Follower',
                        cell: (r) => <a href={`/admin/users/${r.followerId}`}>{r.followerId.slice(0, 12)}…</a>,
                        className: 'mono',
                    },
                    {
                        key: 'following',
                        header: 'Following',
                        cell: (r) => <a href={`/admin/users/${r.followingId}`}>{r.followingId.slice(0, 12)}…</a>,
                        className: 'mono',
                    },
                    { key: 'created', header: 'Since', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                ] as Column<FollowRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ size }} basePath='/admin/messages/follows' />
    </AdminShell>
)

const MessageDetailPage: FC<{
    user: import('../guard').AdminSessionUser
    target: MsgDetail
    images: MsgImage[]
    likes: MsgLike[]
    bookmarks: MsgBookmark[]
}> = ({ user, target, images, likes, bookmarks }) => (
    <AdminShell
        title='Message detail'
        subtitle={target.userEmail ?? target.userId}
        user={user}
        currentPath='/admin/messages'
        breadcrumbs={[{ href: '/admin', label: 'Admin' }, { href: '/admin/messages', label: 'Messages' }, { label: target.id }]}>
        <div class='card'>
            <dl class='kv'>
                <dt>ID</dt>
                <dd class='mono'>{target.id}</dd>
                <dt>User</dt>
                <dd>
                    <a href={`/admin/users/${target.userId}`}>{target.userEmail ?? target.userId}</a>
                </dd>
                <dt>Kind</dt>
                <dd>{target.replyToId ? `reply → ${target.replyToId}` : target.retweetOfId ? `retweet → ${target.retweetOfId}` : 'post'}</dd>
                <dt>State</dt>
                <dd>{target.deletedAt ? <Badge kind='destructive'>deleted</Badge> : <Badge kind='success'>live</Badge>}</dd>
                <dt>Created</dt>
                <dd>{formatDate(target.createdAt)}</dd>
            </dl>
            <div class='mt-sm prewrap'>{target.body}</div>
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>첨부 이미지 ({images.length})</h3>
            <DataTable
                rows={images}
                rowKey={(r) => r.imageId}
                empty='첨부 이미지 없음.'
                columns={
                    [
                        { key: 'order', header: 'Order', cell: (r) => r.order ?? '-', className: 'num' },
                        { key: 'key', header: 'R2 key', cell: (r) => <span class='mono'>{r.r2Key ?? '-'}</span>, className: 'truncate' },
                        { key: 'mime', header: 'MIME', cell: (r) => r.mimeType ?? '-', className: 'mono' },
                    ] as Column<MsgImage>[]
                }
            />
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>좋아요 ({likes.length})</h3>
            <DataTable
                rows={likes}
                rowKey={(r) => r.userId}
                empty='좋아요 없음.'
                columns={
                    [
                        { key: 'user', header: 'User', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userEmail ?? r.userId}</a> },
                        { key: 'at', header: 'At', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    ] as Column<MsgLike>[]
                }
            />
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>북마크 ({bookmarks.length})</h3>
            <DataTable
                rows={bookmarks}
                rowKey={(r) => r.userId}
                empty='북마크 없음.'
                columns={
                    [
                        { key: 'user', header: 'User', cell: (r) => <a href={`/admin/users/${r.userId}`}>{r.userEmail ?? r.userId}</a> },
                        { key: 'at', header: 'At', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    ] as Column<MsgBookmark>[]
                }
            />
        </div>
    </AdminShell>
)

export const createMessagesRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    app.get('/', async (c) => {
        const page = readPage(c.req.query('page'))
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200)
        const q = c.req.query('q')
        const userId = c.req.query('userId')
        const includeDeleted = c.req.query('includeDeleted')
        const { rows, total } = await deps.adminDb.listMessages({
            page,
            size,
            q,
            userId,
            includeDeleted: includeDeleted as 'y' | 'n' | undefined,
        })
        return c.html(
            <MessagesPage
                user={c.get('adminUser')}
                rows={rows}
                total={total}
                page={page}
                size={size}
                q={q}
                userId={userId}
                includeDeleted={includeDeleted}
                flash={parseFlash(c)}
            />,
        )
    })

    app.post('/:id/delete', async (c) => {
        const id = c.req.param('id')
        const body = await c.req.parseBody<{ returnTo?: string }>()
        await deps.adminDb.softDeleteMessage(id)
        return c.redirect(flashPath(sanitizeReturn(body.returnTo, '/admin/messages')), 303)
    })

    app.post('/:id/restore', async (c) => {
        const id = c.req.param('id')
        const body = await c.req.parseBody<{ returnTo?: string }>()
        await deps.adminDb.restoreMessage(id)
        return c.redirect(flashPath(sanitizeReturn(body.returnTo, '/admin/messages')), 303)
    })

    app.get('/follows', async (c) => {
        const page = readPage(c.req.query('page'))
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200)
        const { rows, total } = await deps.adminDb.listFollows({ page, size })
        return c.html(<FollowsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} />)
    })

    app.get('/:id', async (c) => {
        const id = c.req.param('id')
        const target = await deps.adminDb.getMessage(id)
        if (!target) return c.notFound()
        const [images, likes, bookmarks] = await Promise.all([
            deps.adminDb.getMessageImages(id),
            deps.adminDb.getMessageLikes(id),
            deps.adminDb.getMessageBookmarks(id),
        ])
        return c.html(<MessageDetailPage user={c.get('adminUser')} target={target} images={images} likes={likes} bookmarks={bookmarks} />)
    })

    return app
}
