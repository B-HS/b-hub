import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createBlogRoute } from '../../../page/admin/pages/blog'
import { mockAdmin, sessionOf, stubAdminDb } from './helpers'

const samplePost = {
    postId: 1,
    title: 'Hello World',
    categoryId: 1,
    categoryName: '일상',
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-01'),
    views: 100,
    isPublished: true,
    isHide: false,
    isNotice: false,
    isComment: true,
}

const createApp = (overrides: Parameters<typeof stubAdminDb>[0] = {}) => {
    const app = new Hono()
    app.route(
        '/admin/blog',
        createBlogRoute({
            getSession: sessionOf(mockAdmin),
            adminDb: stubAdminDb({
                listPosts: () => Promise.resolve({ rows: [samplePost], total: 1 }),
                listComments: () =>
                    Promise.resolve({
                        rows: [
                            {
                                commentId: 1,
                                postId: 1,
                                postTitle: 'Hello World',
                                userId: 'u-1',
                                userEmail: 'commenter@example.com',
                                comment: '좋은 글이네요',
                                createdAt: new Date('2026-05-02'),
                                isHide: false,
                            },
                        ],
                        total: 1,
                    }),
                listCategories: () => Promise.resolve([{ categoryId: 1, category: '일상', isHide: false }]),
                listTags: () => Promise.resolve([{ tagId: 1, tag: 'typescript' }]),
                listImageAssets: () =>
                    Promise.resolve({
                        rows: [
                            {
                                id: 'asset-1',
                                r2Key: 'images/x.png',
                                bucket: 'blog-cloud',
                                mimeType: 'image/png',
                                sizeBytes: 12345,
                                width: 800,
                                height: 600,
                                checksum: null,
                                uploadedBy: null,
                                createdAt: new Date('2026-05-03'),
                                updatedAt: new Date('2026-05-03'),
                            },
                        ],
                        total: 1,
                    }),
                ...overrides,
            }),
        }),
    )
    return app
}

describe('GET /admin/blog/posts', () => {
    test('200과 글 제목/카테고리를 노출한다', async () => {
        const res = await createApp().request('/admin/blog/posts')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('Hello World')
        expect(html).toContain('일상')
    })
})

describe('POST /admin/blog/posts/:id/publish', () => {
    test('togglePostFlag가 호출되고 리다이렉트한다', async () => {
        const togglePostFlag = mock(() => Promise.resolve())
        const app = createApp({ togglePostFlag })
        const res = await app.request('/admin/blog/posts/1/publish', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(togglePostFlag).toHaveBeenCalledWith(1, 'isPublished')
    })
})

describe('POST /admin/blog/posts/:id/hide', () => {
    test('togglePostFlag가 hide 플래그로 호출된다', async () => {
        const togglePostFlag = mock(() => Promise.resolve())
        const app = createApp({ togglePostFlag })
        await app.request('/admin/blog/posts/5/hide', { method: 'POST', body: new URLSearchParams() })
        expect(togglePostFlag).toHaveBeenCalledWith(5, 'isHide')
    })
})

describe('POST /admin/blog/posts/:id/delete', () => {
    test('deletePost가 호출되고 리다이렉트한다', async () => {
        const deletePost = mock(() => Promise.resolve())
        const app = createApp({ deletePost })
        const res = await app.request('/admin/blog/posts/1/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(deletePost).toHaveBeenCalledWith(1)
    })
})

describe('GET /admin/blog/comments', () => {
    test('댓글 본문이 표시된다', async () => {
        const res = await createApp().request('/admin/blog/comments')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('좋은 글이네요')
        expect(html).toContain('commenter@example.com')
    })
})

describe('POST /admin/blog/categories', () => {
    test('새 카테고리를 추가하고 리다이렉트한다', async () => {
        const insertCategory = mock(() => Promise.resolve())
        const app = createApp({ insertCategory })
        const res = await app.request('/admin/blog/categories', {
            method: 'POST',
            body: new URLSearchParams({ name: '여행' }),
        })
        expect(res.status).toBe(303)
        expect(insertCategory).toHaveBeenCalledWith('여행')
    })

    test('빈 이름은 insert를 호출하지 않는다', async () => {
        const insertCategory = mock(() => Promise.resolve())
        const app = createApp({ insertCategory })
        await app.request('/admin/blog/categories', { method: 'POST', body: new URLSearchParams({ name: '   ' }) })
        expect(insertCategory).not.toHaveBeenCalled()
    })
})

describe('POST /admin/blog/tags', () => {
    test('새 태그를 추가한다', async () => {
        const insertTag = mock(() => Promise.resolve())
        const app = createApp({ insertTag })
        const res = await app.request('/admin/blog/tags', { method: 'POST', body: new URLSearchParams({ tag: 'bun' }) })
        expect(res.status).toBe(303)
        expect(insertTag).toHaveBeenCalledWith('bun')
    })
})

describe('GET /admin/blog/images', () => {
    test('이미지 자산의 R2 key가 표시된다', async () => {
        const res = await createApp().request('/admin/blog/images')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('images/x.png')
    })
})

describe('POST /admin/blog/images/:id/delete', () => {
    test('이미지 자산을 삭제하고 리다이렉트한다', async () => {
        const deleteImageAsset = mock(() => Promise.resolve())
        const app = createApp({ deleteImageAsset })
        const res = await app.request('/admin/blog/images/asset-1/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(deleteImageAsset).toHaveBeenCalledWith('asset-1')
    })
})

describe('Posts 필터 (tag / notice / category)', () => {
    test('tagId와 notice 필터가 listPosts로 전달된다', async () => {
        const listPosts = mock(() => Promise.resolve({ rows: [], total: 0 }))
        await createApp({ listPosts }).request('/admin/blog/posts?tagId=3&notice=y')
        const arg = listPosts.mock.calls[0][0]
        expect(arg.tagId).toBe(3)
        expect(arg.notice).toBe('y')
    })

    test('categoryId=0은 undefined로 변환된다', async () => {
        const listPosts = mock(() => Promise.resolve({ rows: [], total: 0 }))
        await createApp({ listPosts }).request('/admin/blog/posts?categoryId=0')
        expect(listPosts.mock.calls[0][0].categoryId).toBeUndefined()
    })

    test('size는 5~100으로 클램프된다', async () => {
        const listPosts = mock(() => Promise.resolve({ rows: [], total: 0 }))
        await createApp({ listPosts }).request('/admin/blog/posts?size=500')
        expect(listPosts.mock.calls[0][0].size).toBe(100)
    })

    test('notice 셀렉트와 tag 입력이 폼에 렌더된다', async () => {
        const html = await (await createApp().request('/admin/blog/posts')).text()
        expect(html).toContain('name="notice"')
        expect(html).toContain('name="tagId"')
    })
})

describe('Comments userId 필터', () => {
    test('userId 필터가 listComments로 전달된다', async () => {
        const listComments = mock(() => Promise.resolve({ rows: [], total: 0 }))
        await createApp({ listComments }).request('/admin/blog/comments?userId=u-42')
        expect(listComments.mock.calls[0][0].userId).toBe('u-42')
    })
})

describe('Images uploadedBy 컬럼', () => {
    test('업로더 이메일과 사용자 링크가 표시된다', async () => {
        const listImageAssets = mock(() =>
            Promise.resolve({
                rows: [
                    {
                        id: 'asset-9',
                        r2Key: 'images/y.webp',
                        bucket: 'blog-cloud',
                        mimeType: 'image/webp',
                        sizeBytes: 2048,
                        width: null,
                        height: null,
                        uploadedBy: 'u-9',
                        uploadedByEmail: 'up@example.com',
                        createdAt: new Date('2026-05-04'),
                    },
                ],
                total: 1,
            }),
        )
        const html = await (await createApp({ listImageAssets }).request('/admin/blog/images')).text()
        expect(html).toContain('up@example.com')
        expect(html).toContain('/admin/users/u-9')
    })
})
