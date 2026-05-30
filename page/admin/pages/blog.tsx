import { Hono } from 'hono'
import type { Context } from 'hono'
import type { FC } from 'hono/jsx'
import { AdminShell, Badge, DataTable, FilterBar, Pagination, RowAction, type Column } from '../components'
import { formatBytes, formatDate, parseIntOr, truncate } from '../format'
import type { AdminContext, AdminGetSession } from '../guard'
import { requireAdminPage } from '../guard'
import type { AdminDb } from '../db'

type PostRow = Awaited<ReturnType<AdminDb['listPosts']>>['rows'][number]
type CommentRow = Awaited<ReturnType<AdminDb['listComments']>>['rows'][number]
type CategoryRow = Awaited<ReturnType<AdminDb['listCategories']>>[number]
type TagRow = Awaited<ReturnType<AdminDb['listTags']>>[number]
type ImageRow = Awaited<ReturnType<AdminDb['listImageAssets']>>['rows'][number]

const sanitizeReturn = (raw: unknown, fallback: string): string => {
    const v = typeof raw === 'string' ? raw : ''
    return v.startsWith('/admin') ? v : fallback
}

const appendFlash = (path: string, status: 'ok' | 'err' = 'ok'): string => path + (path.includes('?') ? '&' : '?') + `flash=${status}`

const PostsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: PostRow[]
    total: number
    page: number
    size: number
    q?: string
    categoryId?: string
    tagId?: string
    published?: string
    hidden?: string
    notice?: string
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, q, categoryId, tagId, published, hidden, notice, flash }) => (
    <AdminShell title='Posts' subtitle='블로그 글 관리' user={user} currentPath='/admin/blog/posts' flash={flash}>
        <FilterBar
            action='/admin/blog/posts'
            fields={[
                { kind: 'text', name: 'q', label: '검색', value: q, placeholder: 'title or body' },
                { kind: 'number', name: 'categoryId', label: 'Category ID', value: categoryId },
                { kind: 'number', name: 'tagId', label: 'Tag ID', value: tagId },
                {
                    kind: 'select',
                    name: 'published',
                    label: 'Published',
                    value: published,
                    options: [
                        { value: '', label: '전체' },
                        { value: 'y', label: 'published' },
                        { value: 'n', label: 'draft' },
                    ],
                },
                {
                    kind: 'select',
                    name: 'hidden',
                    label: 'Hidden',
                    value: hidden,
                    options: [
                        { value: '', label: '전체' },
                        { value: 'y', label: 'hidden' },
                        { value: 'n', label: 'visible' },
                    ],
                },
                {
                    kind: 'select',
                    name: 'notice',
                    label: 'Notice',
                    value: notice,
                    options: [
                        { value: '', label: '전체' },
                        { value: 'y', label: 'notice' },
                        { value: 'n', label: 'normal' },
                    ],
                },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.postId}
            columns={
                [
                    { key: 'id', header: 'ID', cell: (r) => r.postId, className: 'num' },
                    { key: 'title', header: 'Title', cell: (r) => <span class='truncate'>{truncate(r.title, 60)}</span>, className: 'truncate' },
                    { key: 'category', header: 'Category', cell: (r) => <Badge kind='secondary'>{r.categoryName ?? `#${r.categoryId}`}</Badge> },
                    { key: 'views', header: 'Views', cell: (r) => r.views, className: 'num' },
                    {
                        key: 'flags',
                        header: 'Flags',
                        cell: (r) => (
                            <div style='display:flex;gap:0.25rem;flex-wrap:wrap;'>
                                {r.isPublished ? <Badge kind='success'>published</Badge> : <Badge kind='muted'>draft</Badge>}
                                {r.isHide && <Badge kind='destructive'>hidden</Badge>}
                                {r.isNotice && <Badge kind='outline'>notice</Badge>}
                                {!r.isComment && <Badge kind='muted'>no-comment</Badge>}
                            </div>
                        ),
                    },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => {
                            const back = `/admin/blog/posts?page=${page}&size=${size}${q ? `&q=${encodeURIComponent(q)}` : ''}`
                            return (
                                <div class='row-actions'>
                                    <RowAction action={`/admin/blog/posts/${r.postId}/publish`} label={r.isPublished ? 'unpublish' : 'publish'} returnTo={back} />
                                    <RowAction action={`/admin/blog/posts/${r.postId}/hide`} label={r.isHide ? 'show' : 'hide'} returnTo={back} />
                                    <RowAction action={`/admin/blog/posts/${r.postId}/notice`} label={r.isNotice ? 'unpin' : 'pin'} returnTo={back} />
                                    <RowAction action={`/admin/blog/posts/${r.postId}/comments`} label={r.isComment ? 'lock' : 'unlock'} returnTo={back} />
                                    <RowAction action={`/admin/blog/posts/${r.postId}/delete`} label='delete' variant='destructive' returnTo={back} />
                                </div>
                            )
                        },
                    },
                ] as Column<PostRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, categoryId, tagId, published, hidden, notice, size }} basePath='/admin/blog/posts' />
    </AdminShell>
)

const CommentsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: CommentRow[]
    total: number
    page: number
    size: number
    q?: string
    postId?: string
    userId?: string
    hidden?: string
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, q, postId, userId, hidden, flash }) => (
    <AdminShell title='Comments' subtitle='블로그 댓글 관리' user={user} currentPath='/admin/blog/comments' flash={flash}>
        <FilterBar
            action='/admin/blog/comments'
            fields={[
                { kind: 'text', name: 'q', label: '검색 (본문)', value: q },
                { kind: 'number', name: 'postId', label: 'Post ID', value: postId },
                { kind: 'text', name: 'userId', label: 'User ID', value: userId },
                {
                    kind: 'select',
                    name: 'hidden',
                    label: 'Hidden',
                    value: hidden,
                    options: [
                        { value: '', label: '전체' },
                        { value: 'y', label: 'hidden' },
                        { value: 'n', label: 'visible' },
                    ],
                },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.commentId}
            columns={
                [
                    { key: 'id', header: 'ID', cell: (r) => r.commentId, className: 'num' },
                    { key: 'post', header: 'Post', cell: (r) => <span class='truncate'>{truncate(r.postTitle ?? `#${r.postId}`, 40)}</span> },
                    { key: 'user', header: 'User', cell: (r) => r.userEmail ?? r.userId },
                    { key: 'comment', header: 'Comment', cell: (r) => <span class='truncate'>{truncate(r.comment, 80)}</span>, className: 'truncate' },
                    {
                        key: 'state',
                        header: 'State',
                        cell: (r) => (r.isHide ? <Badge kind='destructive'>hidden</Badge> : <Badge kind='success'>visible</Badge>),
                    },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => {
                            const back = `/admin/blog/comments?page=${page}&size=${size}`
                            return (
                                <div class='row-actions'>
                                    <RowAction action={`/admin/blog/comments/${r.commentId}/hide`} label={r.isHide ? 'show' : 'hide'} returnTo={back} />
                                    <RowAction action={`/admin/blog/comments/${r.commentId}/delete`} label='delete' variant='destructive' returnTo={back} />
                                </div>
                            )
                        },
                    },
                ] as Column<CommentRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, postId, userId, hidden, size }} basePath='/admin/blog/comments' />
    </AdminShell>
)

const CategoriesPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: CategoryRow[]
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, flash }) => (
    <AdminShell title='Categories' subtitle='블로그 카테고리 관리' user={user} currentPath='/admin/blog/categories' flash={flash}>
        <div class='card'>
            <h3 style='font-weight:600;margin-bottom:0.5rem;'>새 카테고리</h3>
            <form method='post' action='/admin/blog/categories' style='display:flex;gap:0.5rem;align-items:end;'>
                <div class='field' style='flex:1;'>
                    <label>이름</label>
                    <input class='input' name='name' required style='width:100%;' />
                </div>
                <button class='btn' type='submit'>
                    추가
                </button>
            </form>
        </div>
        <DataTable
            rows={rows}
            rowKey={(r) => r.categoryId}
            columns={
                [
                    { key: 'id', header: 'ID', cell: (r) => r.categoryId, className: 'num' },
                    { key: 'name', header: 'Name', cell: (r) => r.category },
                    { key: 'hidden', header: 'Hidden', cell: (r) => (r.isHide ? <Badge kind='destructive'>hidden</Badge> : <Badge kind='success'>visible</Badge>) },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`/admin/blog/categories/${r.categoryId}/hide`}
                                label={r.isHide ? 'show' : 'hide'}
                                returnTo='/admin/blog/categories'
                            />
                        ),
                    },
                ] as Column<CategoryRow>[]
            }
        />
    </AdminShell>
)

const TagsPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: TagRow[]
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, flash }) => (
    <AdminShell title='Tags' subtitle='블로그 태그 관리' user={user} currentPath='/admin/blog/tags' flash={flash}>
        <div class='card'>
            <h3 style='font-weight:600;margin-bottom:0.5rem;'>새 태그</h3>
            <form method='post' action='/admin/blog/tags' style='display:flex;gap:0.5rem;align-items:end;'>
                <div class='field' style='flex:1;'>
                    <label>태그</label>
                    <input class='input' name='tag' required style='width:100%;' />
                </div>
                <button class='btn' type='submit'>
                    추가
                </button>
            </form>
        </div>
        <DataTable
            rows={rows}
            rowKey={(r) => r.tagId}
            columns={
                [
                    { key: 'id', header: 'ID', cell: (r) => r.tagId, className: 'num' },
                    { key: 'tag', header: 'Tag', cell: (r) => r.tag },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`/admin/blog/tags/${r.tagId}/delete`}
                                label='delete'
                                variant='destructive'
                                returnTo='/admin/blog/tags'
                            />
                        ),
                    },
                ] as Column<TagRow>[]
            }
        />
    </AdminShell>
)

const ImagesPage: FC<{
    user: import('../guard').AdminSessionUser
    rows: ImageRow[]
    total: number
    page: number
    size: number
    q?: string
    flash?: { kind: 'ok' | 'err'; message: string } | null
}> = ({ user, rows, total, page, size, q, flash }) => (
    <AdminShell title='Image Assets' subtitle='R2 업로드된 이미지 자산' user={user} currentPath='/admin/blog/images' flash={flash}>
        <FilterBar
            action='/admin/blog/images'
            fields={[
                { kind: 'text', name: 'q', label: 'R2 key 검색', value: q },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />
        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={
                [
                    { key: 'id', header: 'ID', cell: (r) => <span class='mono'>{r.id.slice(0, 8)}…</span> },
                    { key: 'key', header: 'R2 key', cell: (r) => <span class='mono'>{truncate(r.r2Key, 60)}</span>, className: 'truncate' },
                    { key: 'bucket', header: 'Bucket', cell: (r) => r.bucket },
                    { key: 'mime', header: 'MIME', cell: (r) => r.mimeType, className: 'mono' },
                    { key: 'size', header: 'Size', cell: (r) => formatBytes(r.sizeBytes), className: 'num' },
                    { key: 'dim', header: 'WxH', cell: (r) => `${r.width ?? '-'}×${r.height ?? '-'}`, className: 'nowrap' },
                    {
                        key: 'uploadedBy',
                        header: 'Uploaded by',
                        cell: (r) => (r.uploadedBy ? <a href={`/admin/users/${r.uploadedBy}`}>{r.uploadedByEmail ?? r.uploadedBy}</a> : '-'),
                    },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`/admin/blog/images/${r.id}/delete`}
                                label='delete'
                                variant='destructive'
                                returnTo={`/admin/blog/images?page=${page}&size=${size}`}
                            />
                        ),
                    },
                ] as Column<ImageRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ q, size }} basePath='/admin/blog/images' />
    </AdminShell>
)

const flashFrom = (c: { req: { query: (k: string) => string | undefined } }) =>
    c.req.query('flash') === 'ok' ? { kind: 'ok' as const, message: '저장되었습니다.' } : null

export const createBlogRoute = (deps: { getSession: AdminGetSession; adminDb: AdminDb }) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(deps.getSession))

    // Posts
    app.get('/posts', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 20), 5), 100)
        const q = c.req.query('q')
        const categoryId = c.req.query('categoryId')
        const tagId = c.req.query('tagId')
        const published = c.req.query('published')
        const hidden = c.req.query('hidden')
        const notice = c.req.query('notice')
        const { rows, total } = await deps.adminDb.listPosts({
            page,
            size,
            q,
            categoryId: categoryId ? parseIntOr(categoryId, 0) || undefined : undefined,
            tagId: tagId ? parseIntOr(tagId, 0) || undefined : undefined,
            published: published as 'y' | 'n' | undefined,
            hidden: hidden as 'y' | 'n' | undefined,
            notice: notice as 'y' | 'n' | undefined,
        })
        return c.html(
            <PostsPage
                user={c.get('adminUser')}
                rows={rows}
                total={total}
                page={page}
                size={size}
                q={q}
                categoryId={categoryId}
                tagId={tagId}
                published={published}
                hidden={hidden}
                notice={notice}
                flash={flashFrom(c)}
            />,
        )
    })

    const togglePost = (flag: 'isPublished' | 'isHide' | 'isNotice' | 'isComment') => async (c: Context<AdminContext>) => {
        const id = parseIntOr(c.req.param('id'), 0)
        const body = await c.req.parseBody<{ returnTo?: string }>()
        if (id > 0) await deps.adminDb.togglePostFlag(id, flag)
        return c.redirect(appendFlash(sanitizeReturn(body.returnTo, '/admin/blog/posts')), 303)
    }
    app.post('/posts/:id/publish', togglePost('isPublished'))
    app.post('/posts/:id/hide', togglePost('isHide'))
    app.post('/posts/:id/notice', togglePost('isNotice'))
    app.post('/posts/:id/comments', togglePost('isComment'))
    app.post('/posts/:id/delete', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        const body = await c.req.parseBody<{ returnTo?: string }>()
        if (id > 0) await deps.adminDb.deletePost(id)
        return c.redirect(appendFlash(sanitizeReturn(body.returnTo, '/admin/blog/posts')), 303)
    })

    // Comments
    app.get('/comments', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 30), 5), 200)
        const q = c.req.query('q')
        const postId = c.req.query('postId')
        const userId = c.req.query('userId')
        const hidden = c.req.query('hidden')
        const { rows, total } = await deps.adminDb.listComments({
            page,
            size,
            q,
            postId: postId ? parseIntOr(postId, 0) || undefined : undefined,
            userId,
            hidden: hidden as 'y' | 'n' | undefined,
        })
        return c.html(
            <CommentsPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} q={q} postId={postId} userId={userId} hidden={hidden} flash={flashFrom(c)} />,
        )
    })

    app.post('/comments/:id/hide', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        const body = await c.req.parseBody<{ returnTo?: string }>()
        if (id > 0) await deps.adminDb.toggleCommentHide(id)
        return c.redirect(appendFlash(sanitizeReturn(body.returnTo, '/admin/blog/comments')), 303)
    })

    app.post('/comments/:id/delete', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        const body = await c.req.parseBody<{ returnTo?: string }>()
        if (id > 0) await deps.adminDb.deleteComment(id)
        return c.redirect(appendFlash(sanitizeReturn(body.returnTo, '/admin/blog/comments')), 303)
    })

    // Categories
    app.get('/categories', async (c) => {
        const rows = await deps.adminDb.listCategories()
        return c.html(<CategoriesPage user={c.get('adminUser')} rows={rows} flash={flashFrom(c)} />)
    })

    app.post('/categories', async (c) => {
        const body = await c.req.parseBody<{ name?: string }>()
        const name = body.name?.trim()
        if (name) await deps.adminDb.insertCategory(name)
        return c.redirect('/admin/blog/categories?flash=ok', 303)
    })

    app.post('/categories/:id/hide', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        if (id > 0) await deps.adminDb.toggleCategoryHide(id)
        return c.redirect('/admin/blog/categories?flash=ok', 303)
    })

    // Tags
    app.get('/tags', async (c) => {
        const rows = await deps.adminDb.listTags()
        return c.html(<TagsPage user={c.get('adminUser')} rows={rows} flash={flashFrom(c)} />)
    })

    app.post('/tags', async (c) => {
        const body = await c.req.parseBody<{ tag?: string }>()
        const tag = body.tag?.trim()
        if (tag) await deps.adminDb.insertTag(tag)
        return c.redirect('/admin/blog/tags?flash=ok', 303)
    })

    app.post('/tags/:id/delete', async (c) => {
        const id = parseIntOr(c.req.param('id'), 0)
        if (id > 0) await deps.adminDb.deleteTag(id)
        return c.redirect('/admin/blog/tags?flash=ok', 303)
    })

    // Images
    app.get('/images', async (c) => {
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), 20), 5), 100)
        const q = c.req.query('q')
        const { rows, total } = await deps.adminDb.listImageAssets({ page, size, q })
        return c.html(<ImagesPage user={c.get('adminUser')} rows={rows} total={total} page={page} size={size} q={q} flash={flashFrom(c)} />)
    })

    app.post('/images/:id/delete', async (c) => {
        const id = c.req.param('id')
        const body = await c.req.parseBody<{ returnTo?: string }>()
        await deps.adminDb.deleteImageAsset(id)
        return c.redirect(appendFlash(sanitizeReturn(body.returnTo, '/admin/blog/images')), 303)
    })

    return app
}
